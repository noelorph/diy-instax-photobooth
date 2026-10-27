import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  createPackageBrowserFixture,
  terminateMediaFixtureUpload,
  withMediaCommitHeld,
  mediaFixtureBackendFiles,
} from '../fixtures/package-browser';
import { localOwnerSql } from '../fixtures/local-supabase';
import { mediaFixture, paddedMedia } from '../fixtures/event-media';
import type { PackageFixture } from '../fixtures/package-contract';

async function signIn(page: Page, f: PackageFixture) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).filter({ visible: true }).fill(f.adminUser.email);
  await page
    .getByLabel('Password', { exact: true })
    .filter({ visible: true })
    .fill(f.adminUser.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/events/${f.eventId}`);
}
const nearImage = async () =>
  paddedMedia(
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#456' } })
      .png()
      .toBuffer(),
    10_000_000,
    'png'
  );

test('saved Draft retains media presentation without file selection or media requests', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const f = await createPackageBrowserFixture();
  const mediaRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /\/api\/(?:admin\/events\/[^/]+\/media|booth\/media)(?:\/|\?|$)|\/storage\/v1\//.test(
        request.url()
      )
    )
      mediaRequests.push(request.url());
  });
  try {
    await signIn(page, f);
    const media = page.getByRole('region', { name: 'Event Media' });
    await expect(media.getByRole('status')).toContainText(
      'Media uploads are temporarily unavailable.'
    );
    await expect(media.getByRole('heading', { name: 'Background image' })).toBeVisible();
    await expect(media.getByRole('heading', { name: 'Welcome montage' })).toBeVisible();
    await expect(media.getByRole('button', { name: 'Upload image' })).toBeDisabled();
    await expect(media.getByRole('button', { name: 'Upload montage' })).toBeDisabled();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(media.locator('img, video, source')).toHaveCount(0);
    for (const theme of ['light', 'dark'] as const) {
      expect(
        (await f.local.service.from('admin_profiles').update({ theme }).eq('id', f.adminUser.id))
          .error
      ).toBeNull();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`/events/${f.eventId}`);
        await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', theme);
        await expect(media).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath(`draft-overview-${width}-${theme}.png`),
          fullPage: true,
        });
        await media.screenshot({ path: info.outputPath(`draft-media-${width}-${theme}.png`) });
        await page.getByRole('button', { name: 'Edit Draft', exact: true }).click();
        await expect(page.getByLabel('Event name', { exact: true })).toBeEnabled();
        await page.screenshot({
          path: info.outputPath(`draft-edit-${width}-${theme}.png`),
          fullPage: true,
        });
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(media).toBeVisible();
        const mediaSurfaceColor = await media.evaluate(
          (card) => getComputedStyle(card).backgroundColor
        );
        const deletion = page.getByRole('button', { name: 'Delete Draft', exact: true });
        await deletion.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(
          await page
            .getByRole('dialog')
            .evaluate((dialog) => getComputedStyle(dialog).backgroundColor)
        ).toBe(mediaSurfaceColor);
        await expect(
          page.getByRole('button', { name: 'Close Delete Draft dialog' })
        ).toHaveAttribute('title', 'Close Delete Draft dialog');
        await page.screenshot({
          path: info.outputPath(`draft-delete-confirmation-${width}-${theme}.png`),
          fullPage: true,
        });
        await page.getByRole('button', { name: 'Close Delete Draft dialog' }).click();
        await expect(deletion).toBeFocused();
        await page.goto('/events/new');
        await expect(
          page.getByRole('heading', { name: 'Create Event', exact: true })
        ).toBeVisible();
        await expect(page.getByRole('region', { name: 'Event Media' })).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath(`draft-create-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    expect(mediaRequests).toEqual([]);
  } finally {
    await f.dispose();
    await page.close();
  }
});

test('deletion stays pending while an upload can still finish', async ({ page }) => {
  test.skip(
    true,
    'Media uploads are temporarily unavailable; real transfer and cleanup proof remains deferred.'
  );
  test.setTimeout(90_000);
  const f = await createPackageBrowserFixture();
  try {
    await signIn(page, f);
    let complete!: () => void;
    let fail!: (error: unknown) => void;
    const race = new Promise<void>((resolve, reject) => {
      complete = resolve;
      fail = reject;
    });
    await page.route('**/storage/v1/upload/resumable/**', async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH' || req.headers()['upload-offset'] !== '6291456') {
        await route.continue();
        return;
      }
      try {
        const asset = localOwnerSql(
          `select path from public.event_media_assets where event_id='${f.eventId}'`
        )[0];
        const revision = Number(
          localOwnerSql(`select revision from public.events where id='${f.eventId}'`)[0].revision
        );
        const response = await withMediaCommitHeld(
          String(asset.path),
          () => route.fetch(),
          async () => {
            expect(
              mediaFixtureBackendFiles(f.eventId).some((file) => file.bytes === 10_000_000)
            ).toBe(true);
            const deletion = await page.request.post(
              `/api/admin/events/${f.eventId}/delete-draft`,
              {
                headers: { origin: new URL(page.url()).origin },
                data: { operationId: randomUUID(), expectedRevision: revision },
              }
            );
            expect(deletion.status()).toBe(200);
            expect((await deletion.json()).mediaRemovalState).toBe('pending');
          }
        );
        expect(response.ok()).toBe(false);
        await route.fulfill({ response });
        await expect
          .poll(() =>
            mediaFixtureBackendFiles(f.eventId).filter((file) => !file.name.endsWith('.json'))
          )
          .toEqual([]);
        expect(mediaFixtureBackendFiles(f.eventId).some((file) => file.bytes > 0)).toBe(true);
        const retry = await page.request.fetch(req.url(), {
          method: 'PATCH',
          headers: req.headers(),
          data: req.postDataBuffer()!,
        });
        expect(retry.ok()).toBe(false);
        complete();
      } catch (error) {
        fail(error);
        await route.abort();
      }
    });
    await page
      .getByLabel('Background image')
      .setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await nearImage() });
    await page.getByRole('button', { name: 'Upload background', exact: true }).click();
    await race;
    const storage = f.local.service.storage.from('event_media');
    expect((await storage.list(f.eventId)).data).toEqual([]);
    await page.goto('/events');
    await expect(page.getByText(`Draft deletion · Reference ${f.eventId}`)).toBeVisible();
    await page.getByRole('button', { name: 'Retry media removal' }).click();
    await expect(page.getByText('Media removal still pending. Retry cleanup.')).toBeVisible();
    expect((await storage.list(f.eventId)).data).toEqual([]);
    expect(
      localOwnerSql(`select media_removal_state from public.events where id='${f.eventId}'`)[0]
        .media_removal_state
    ).toBe('pending');
  } finally {
    await f.dispose();
    await page.close();
  }
});

test('resumes interrupted transfer and attaches exactly once', async ({ page }) => {
  test.skip(
    true,
    'Media uploads are temporarily unavailable; real transfer and cleanup proof remains deferred.'
  );
  test.setTimeout(90_000);
  const f = await createPackageBrowserFixture();
  try {
    await signIn(page, f);
    let interrupted = false,
      lost = false,
      resumedOffset: string | null = null;
    await page.route('**/storage/v1/upload/resumable/**', async (route) => {
      const request = route.request();
      if (
        request.method() === 'PATCH' &&
        request.headers()['upload-offset'] === '6291456' &&
        !interrupted
      ) {
        interrupted = true;
        await route.abort();
        return;
      }
      if (request.method() === 'HEAD') {
        const response = await route.fetch();
        resumedOffset = response.headers()['upload-offset'];
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });
    await page.route(`**/api/admin/events/${f.eventId}/media/*`, async (route) => {
      if (route.request().url().endsWith('/uploads') || lost) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      lost = true;
      await route.abort();
    });
    await page
      .getByLabel('Background image')
      .setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await nearImage() });
    await page.getByRole('button', { name: 'Upload background', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume upload', exact: true })).toBeVisible();
    expect(interrupted).toBe(true);
    await page.getByRole('button', { name: 'Resume upload', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry attachment', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry attachment', exact: true }).click();
    await expect(page.getByText('Media attached.', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    expect(resumedOffset).toBe('6291456');
    expect(
      localOwnerSql(
        `select count(*)::int as n from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
      )[0].n
    ).toBe(1);
    expect(
      localOwnerSql(
        `select count(*)::int as n from public.activity_events where event_id='${f.eventId}' and operation_kind='media_attach'`
      )[0].n
    ).toBe(1);
    await page.getByLabel('Welcome montage').setInputFiles({
      name: 'synthetic.mp4',
      mimeType: 'video/mp4',
      buffer: paddedMedia(mediaFixture('avc-30s.mp4'), 50_000_000, 'mp4'),
    });
    await page.getByRole('button', { name: 'Upload montage', exact: true }).click();
    await expect
      .poll(
        () =>
          localOwnerSql(
            `select count(*)::int as n from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
          )[0].n,
        { timeout: 60_000 }
      )
      .toBe(2);
    expect(
      localOwnerSql(
        `select byte_length,duration_ms from public.event_media_assets where event_id='${f.eventId}' and kind='montage' and state='attached'`
      )[0]
    ).toEqual({ byte_length: 50_000_000, duration_ms: 30_000 });
  } catch (error) {
    console.info(
      'Media browser feedback:',
      await page.getByRole('alert').allTextContents(),
      await page.getByRole('status').allTextContents()
    );
    throw error;
  } finally {
    try {
      await f.dispose();
    } finally {
      await page.close();
    }
  }
});

for (const transition of ['start', 'cancel'])
  test(`start or cancel during upload rejects late attachment: ${transition}`, async ({ page }) => {
    test.skip(
      true,
      'Media uploads are temporarily unavailable; real transfer and cleanup proof remains deferred.'
    );
    test.setTimeout(90_000);
    const f = await createPackageBrowserFixture();
    let outstanding: string | undefined;
    let uploadRevision = 0;
    try {
      await signIn(page, f);
      await page.getByLabel('Background image').setInputFiles({
        name: 'first.png',
        mimeType: 'image/png',
        buffer: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#456' } })
          .png()
          .toBuffer(),
      });
      await page.getByRole('button', { name: 'Upload background', exact: true }).click();
      await expect(page.getByText('Media attached.', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      const old = localOwnerSql(
        `select id from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
      )[0].id;
      let transitioned = false;
      await page.route('**/storage/v1/upload/resumable/**', async (route) => {
        if (
          route.request().method() !== 'PATCH' ||
          route.request().headers()['upload-offset'] !== '6291456' ||
          transitioned
        ) {
          await route.continue();
          return;
        }
        const revision = Number(
          localOwnerSql(`select revision from public.events where id='${f.eventId}'`)[0].revision
        );
        outstanding = route.request().url();
        uploadRevision = revision;
        let lifecycle;
        if (transition === 'start') {
          localOwnerSql(`update public.printer_completion_policy set mode='simulated' where id`);
          const setup = await f.reportSetup();
          expect(setup.error).toBeNull();
          lifecycle = await f.admin('start', {
            expectedRevision: revision,
            readinessWindowId: setup.data.readinessWindowId,
            deviceHash: f.deviceHash,
            printerId: 'fixture-printer',
            connectionGeneration: 0,
          });
        } else lifecycle = await f.admin('cancel', { expectedRevision: revision });
        expect(lifecycle.error).toBeNull();
        transitioned = true;
        await route.continue();
      });
      await page.getByLabel('Background image').setInputFiles({
        name: 'replacement.png',
        mimeType: 'image/png',
        buffer: await nearImage(),
      });
      await page.getByRole('button', { name: 'Upload background', exact: true }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Upload no longer permitted' })
      ).toBeVisible({ timeout: 30_000 });
      const pending = localOwnerSql(
        `select id from public.event_media_assets where event_id='${f.eventId}' and state='uploading'`
      )[0];
      const finalized = await page.request.post(
        `/api/admin/events/${f.eventId}/media/${pending.id}`,
        {
          headers: { origin: new URL(page.url()).origin },
          data: { operationId: randomUUID(), expectedRevision: uploadRevision },
        }
      );
      expect(finalized.status()).toBe(409);
      expect((await finalized.json()).code).toBe('invalid_transition');
      expect(transitioned).toBe(true);
      expect(
        localOwnerSql(
          `select id from public.event_media_assets where event_id='${f.eventId}' and state='attached'`
        ).map((a) => a.id)
      ).toEqual([old]);
      expect(
        localOwnerSql(
          `select count(*)::int as n from public.event_media_assets where event_id='${f.eventId}' and state='cleanup_pending'`
        )[0].n
      ).toBe(1);
    } catch (error) {
      console.info(
        'Media browser feedback:',
        await page.getByRole('alert').allTextContents(),
        await page.getByRole('status').allTextContents()
      );
      throw error;
    } finally {
      try {
        try {
          if (outstanding) await terminateMediaFixtureUpload(outstanding);
        } finally {
          await f.dispose();
        }
      } finally {
        await page.close();
      }
    }
  });
