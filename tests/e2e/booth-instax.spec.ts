import { expect, test, type Page } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
import { localOwnerSql } from '../fixtures/local-supabase';
import { installInstaxBluetooth } from '../fixtures/instax-bluetooth';

type Synthetic = {
  counts(): { executeCount: number; chooserCount: number };
  status(value: 'idle' | 'active' | 'empty'): void;
  disconnect(): void;
};
const fixture = (page: Page, command: 'counts' | 'idle' | 'active' | 'empty' | 'disconnect') =>
  page.evaluate((command) => {
    const f = (window as unknown as Window & { __instaxFixture: Synthetic }).__instaxFixture;
    if (command === 'counts') return f.counts();
    if (command === 'disconnect') f.disconnect();
    else f.status(command);
  }, command);
async function capture(page: Page) {
  await page.getByRole('button', { name: 'Take Photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
}
for (const viewport of [
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  for (const scenario of ['normal', 'delayed acknowledgement', 'empty', 'disconnect'] as const) {
    test(`${scenario} with real adapter at ${viewport.width}×${viewport.height}`, async ({
      browser,
    }) => {
      const f = await createPackageBrowserFixture();
      const context = await browser.newContext({ viewport, permissions: ['camera'] });
      let releaseAck = () => {};
      try {
        localOwnerSql(
          "update public.printer_completion_policy set mode='instax-development' where id"
        );
        await installInstaxBluetooth(context);
        const page = await context.newPage();
        const metadata: string[] = [];
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/api/'))
            metadata.push(request.postData() ?? '');
        });
        await page.goto('/sign-in');
        await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
        await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page).toHaveURL(/dashboard$/);
        await page.goto(`/events/${f.eventId}`);
        await page.getByRole('button', { name: 'Enable Camera', exact: true }).click();
        await page.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
        for (const name of [
          'Film is physically loaded',
          'Continuous printer power is connected',
          'Guided Access is ready',
        ])
          await page.getByRole('checkbox', { name }).check();
        await page.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
        await expect(page).toHaveURL(/\/booth$/);
        const camera = page.getByRole('button', { name: 'Enable Camera', exact: true });
        if (await camera.isVisible()) await camera.click();
        await expect(page.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
        expect(await fixture(page, 'counts')).toEqual({ executeCount: 0, chooserCount: 1 });
        expect(await page.evaluate(() => '__boothSimulatorEject' in window)).toBe(false);
        expect(
          (await page.request.get(`/api/admin/events/${f.eventId}/booth/state`)).status()
        ).toBe(401);
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await capture(page);
        await page.getByRole('button', { name: 'Retake', exact: true }).click();
        await capture(page);
        if (scenario === 'delayed acknowledgement') {
          const gate = new Promise<void>((resolve) => {
            releaseAck = resolve;
          });
          await page.route('**/print-attempts/*/observations', async (route) => {
            if (route.request().postDataJSON().kind !== 'full_ejection_confirmed')
              return route.continue();
            const response = await route.fetch();
            await gate;
            await route.fulfill({ response });
          });
        }
        await page.getByRole('button', { name: 'Print', exact: true }).click();
        await expect.poll(async () => (await fixture(page, 'counts'))?.executeCount).toBe(1);
        await expect(page.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
        expect(
          localOwnerSql(
            `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
          )[0].n
        ).toBe(0);
        await fixture(page, 'active');
        // Wait for a real adapter poll to see processing before supplying the next status.
        await page.waitForTimeout(1100);
        if (scenario === 'empty' || scenario === 'disconnect') {
          await fixture(page, scenario === 'empty' ? 'empty' : 'disconnect');
          await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
          if (scenario === 'disconnect') {
            const reconnect = page.getByRole('button', { name: 'Connect to Instax', exact: true });
            await expect(reconnect).toBeVisible();
            await reconnect.click();
          }
          await page.waitForTimeout(2200);
          await expect(page.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
          expect(
            localOwnerSql(
              `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
            )[0].n
          ).toBe(0);
        } else {
          await fixture(page, 'idle');
          if (scenario === 'delayed acknowledgement') {
            await expect
              .poll(
                () =>
                  localOwnerSql(
                    `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
                  )[0].n
              )
              .toBe(1);
            await expect(page.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
            releaseAck();
          }
          await expect(page.getByRole('heading', { name: 'Print complete' })).toBeVisible();
          await page.waitForTimeout(2000);
          await expect(page.getByRole('heading', { name: 'Print complete' })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
          expect(
            localOwnerSql(
              `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
            )[0].n
          ).toBe(1);
        }
        expect((await fixture(page, 'counts'))?.executeCount).toBe(1);
        const journal = await page.evaluate(() => sessionStorage.getItem('booth-operations-v2'));
        expect([...metadata, journal ?? ''].join('')).not.toMatch(
          /data:image|blob:|imageBytes|jpeg|base64/i
        );
      } finally {
        releaseAck();
        try {
          await context.close();
        } finally {
          await f.dispose();
        }
      }
    });
  }
}

for (const viewport of [
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  for (const scenario of [
    'automatic',
    'manual race',
    'missed baseline',
    'expired',
    'paused Pending',
    'replacement',
    'reconnect',
  ] as const) {
    test(`reload ${scenario} at ${viewport.width}×${viewport.height}`, async ({ browser }) => {
      test.setTimeout(150000);
      const f = await createPackageBrowserFixture();
      const boothContext = await browser.newContext({ viewport, permissions: ['camera'] });
      const phoneContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark',
      });
      try {
        localOwnerSql(
          "update public.printer_completion_policy set mode='instax-development' where id"
        );
        await installInstaxBluetooth(boothContext);
        const booth = await boothContext.newPage();
        const phone = await phoneContext.newPage();
        for (const page of [booth, phone]) {
          await page.goto('/sign-in');
          await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
          await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await expect(page).toHaveURL(/dashboard$/);
        }
        await booth.goto(`/events/${f.eventId}`);
        await booth.getByRole('button', { name: 'Enable Camera', exact: true }).click();
        await booth.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
        for (const name of [
          'Film is physically loaded',
          'Continuous printer power is connected',
          'Guided Access is ready',
        ])
          await booth.getByRole('checkbox', { name }).check();
        await booth.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
        await expect(booth).toHaveURL(/\/booth$/);
        await phone.goto(`/events/${f.eventId}`);
        const phoneState = async () =>
          (await phone.request.get(`/api/admin/events/${f.eventId}/booth/state`)).json();
        const cover = (open: boolean) =>
          booth.evaluate((open) => {
            (
              window as unknown as { __instaxFixture: { cover(open: boolean): void } }
            ).__instaxFixture.cover(open);
          }, open);
        if (scenario === 'paused Pending') {
          const camera = booth.getByRole('button', { name: 'Enable Camera', exact: true });
          if (await camera.isVisible()) await camera.click();
          await booth.getByRole('button', { name: 'Start', exact: true }).click();
          await capture(booth);
          await booth.getByRole('button', { name: 'Print', exact: true }).click();
          await expect.poll(async () => (await fixture(booth, 'counts'))?.executeCount).toBe(1);
          await fixture(booth, 'active');
          await booth.waitForTimeout(1200);
          await fixture(booth, 'empty');
          await expect.poll(async () => (await phoneState()).counts.unresolved).toBe(1);
          await phone.getByRole('button', { name: 'Pause Booth', exact: true }).click();
          await expect.poll(async () => (await phoneState()).runState).toBe('Paused');
          await fixture(booth, 'idle');
          await booth.waitForTimeout(1200);
        }
        const before = await phoneState();
        if (scenario === 'missed baseline') {
          await cover(true);
          await booth.waitForTimeout(1200);
        }
        await phone.getByRole('button', { name: 'Reload film', exact: true }).click();
        await expect(
          phone.getByRole('button', { name: 'Confirm film loaded', exact: true })
        ).toBeVisible();
        await booth.waitForTimeout(1500);
        const first = (await phoneState()).activeReloadRequest;
        if (scenario === 'expired') await booth.waitForTimeout(61000);
        if (scenario === 'replacement') {
          await cover(true);
          await booth.waitForTimeout(1200);
          await phone.getByRole('button', { name: 'Reload film', exact: true }).click();
          await expect
            .poll(async () => (await phoneState()).activeReloadRequest.reloadRequestId)
            .not.toBe(first.reloadRequestId);
          await booth.waitForTimeout(1500);
        } else if (scenario === 'reconnect') {
          await fixture(booth, 'disconnect');
          await booth.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
          await expect
            .poll(async () => (await phoneState()).connectionGeneration)
            .toBeGreaterThan(first.connectionGeneration);
          await phone.reload();
        } else if (scenario !== 'missed baseline') {
          await cover(true);
          await booth.waitForTimeout(1200);
        }
        await cover(false);
        if (scenario === 'manual race')
          await phone.getByRole('button', { name: 'Confirm film loaded', exact: true }).click();
        if (['missed baseline', 'expired', 'replacement', 'reconnect'].includes(scenario)) {
          await booth.waitForTimeout(2000);
          expect((await phoneState()).activeReloadRequest).not.toBeNull();
          await phone.reload();
          await phone.getByRole('button', { name: 'Confirm film loaded', exact: true }).click();
        }
        await expect.poll(async () => (await phoneState()).activeReloadRequest).toBeNull();
        const after = await phoneState();
        expect(after.counts).toEqual(before.counts);
        expect(after.equipment.filmLoaded).toBe(true);
        expect(after.reloadConfirmation.reloadRequestId).toBeTruthy();
        const scoped = await (await booth.request.get('/api/booth/state')).json();
        expect(scoped.activeReloadRequest).toBeNull();
        expect(scoped.counts).toEqual(after.counts);
        await expect(phone.getByText(/Film loading confirmed/)).toBeVisible();
        await phone.emulateMedia({ colorScheme: 'light' });
        await phone.evaluate(() => {
          document.documentElement.style.zoom = '2';
        });
        await phone.getByRole('button', { name: 'Reload film', exact: true }).focus();
        await expect(phone.getByRole('button', { name: 'Reload film', exact: true })).toBeFocused();
        expect((await fixture(booth, 'counts'))?.executeCount).toBe(
          scenario === 'paused Pending' ? 1 : 0
        );
        if (scenario === 'paused Pending') {
          expect(after.runState).toBe('Paused');
          expect(after.counts.unresolved).toBe(1);
          expect(scoped.allowedActions.startGuest).toBe(false);
        }
      } finally {
        await boothContext.close();
        await phoneContext.close();
        await f.dispose();
      }
    });
  }
}
