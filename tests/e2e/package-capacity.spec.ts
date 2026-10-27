import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, chromium, type Page } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
import { localOwnerSql } from '../fixtures/local-supabase';

async function signIn(page: Page, admin: { email: string; password: string }) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(admin.email);
  await page.getByLabel('Password', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function signOut(page: Page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

test('phone purchase survives a lost response, reload and storage access failure with one immutable addition', async ({
  page,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Paused');
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, f.adminUser);
    await page.goto(`/events/${f.eventId}`);
    await page.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Loading the printer is separate');
    const submit = dialog.getByRole('button', { name: 'Add Film Packages', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Client request note').fill('Client requested one more package');
    for (const value of ['0', '-1', '1.5', '214748364']) {
      await page.getByLabel('Additional Film Packages').fill(value);
      await expect(submit).toBeDisabled();
      const errorId = await page
        .getByLabel('Additional Film Packages')
        .getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      await expect(page.locator(`[id="${errorId}"]`)).toBeVisible();
    }
    await page.getByLabel('Additional Film Packages').fill('1');
    await page.getByLabel('Client request note').fill('   ');
    await expect(submit).toBeDisabled();
    await page.getByLabel('Client request note').fill('Client requested one more package');
    await page.route(`**/api/admin/events/${f.eventId}/film-packages`, async (route) => {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort('failed');
    });
    await dialog.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('film-package-purchase:')) {
          Storage.prototype.getItem = getItem;
          throw new DOMException('Temporarily unavailable', 'SecurityError');
        }
        return getItem.call(this, key);
      };
    });
    await page.reload();
    await expect(dialog.getByRole('alert')).toContainText('Browser storage is unavailable');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry saved request' }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Additional Film Packages')).toBeDisabled();
    await dialog.getByRole('button', { name: 'Retry request' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toContainText('Film Packages added.');
    await expect(page.getByText('20 total booked prints', { exact: true })).toBeVisible();
    await expect(page.getByText('Live · Paused', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByRole('button', { name: 'Add Film Packages', exact: true })
    ).toBeFocused();
    expect(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        `film-package-purchase:${f.eventId}:${f.adminUser.id}`
      )
    ).toBeNull();
    expect(
      localOwnerSql(
        `select (select count(*)::int from public.additional_film_package_entries where event_id='${f.eventId}') entries,(select count(*)::int from public.activity_events where event_id='${f.eventId}') audits`
      )
    ).toEqual([{ entries: 1, audits: 1 }]);
    expect(
      localOwnerSql(
        `select state,film_loaded_confirmed from public.booth_runs where id='${f.runId}'`
      )
    ).toEqual([{ state: 'Paused', film_loaded_confirmed: true }]);
    for (const path of [
      `events/${f.eventId}/additional-prints`,
      'film-stock/additions',
      'film-stock/reconciliations',
    ]) {
      const response = await page.request.post(`/api/admin/${path}`, {
        data: {
          operationKey: crypto.randomUUID(),
          quantity: 1,
          sheets: 1,
          reason: 'stale request',
        },
      });
      expect([404, 405]).toContain(response.status());
    }
    expect((await f.readAdmin()).data.counts.additionalPackages).toBe(1);
  } finally {
    await f.dispose();
  }
});

test('an Admin switch preserves the original actor’s journal without replaying their purchase', async ({
  page,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Paused');
    const adminB = await f.local.provisionUser();
    expect((await f.local.allowlist(adminB.id)).error).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, f.adminUser);
    await page.goto(`/events/${f.eventId}`);
    await page.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
    await page.getByLabel('Client request note').fill('Original Admin requested another package');
    let purchasePosts = 0;
    await page.route(`**/api/admin/events/${f.eventId}/film-packages`, async (route) => {
      purchasePosts++;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add Film Packages', exact: true })
      .click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    const keyA = `film-package-purchase:${f.eventId}:${f.adminUser.id}`;
    const savedA = await page.evaluate((key) => sessionStorage.getItem(key), keyA);
    expect(savedA).not.toBeNull();
    await signOut(page);
    await signIn(page, adminB);
    await page.goto(`/events/${f.eventId}`);
    await expect(
      page.getByRole('button', { name: 'Add Film Packages', exact: true })
    ).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry request' })).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Add Film Packages', exact: true })
    ).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), keyA)).toBe(savedA);
    expect(purchasePosts).toBe(1);
    await signOut(page);
    await signIn(page, f.adminUser);
    await page.goto(`/events/${f.eventId}`);
    await page.getByRole('button', { name: 'Retry request' }).click();
    await expect(page.getByRole('dialog')).toContainText('Film Packages added.');
    expect(purchasePosts).toBe(1);
    expect(
      localOwnerSql(
        `select (select count(*)::int from public.additional_film_package_entries where event_id='${f.eventId}') entries,(select count(*)::int from public.activity_events where event_id='${f.eventId}') audits`
      )
    ).toEqual([{ entries: 1, audits: 1 }]);
    await page.getByRole('button', { name: 'Done' }).click();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), keyA)).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('a stale mounted purchase cannot mutate with another tab’s Admin cookies', async ({
  page,
  context,
}) => {
  const f = await createPackageBrowserFixture();
  const otherTab = await context.newPage();
  try {
    f.seedRun('Paused');
    const adminB = await f.local.provisionUser();
    expect((await f.local.allowlist(adminB.id)).error).toBeNull();
    await signIn(page, f.adminUser);
    await page.goto(`/events/${f.eventId}`);
    await page.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
    await page.getByLabel('Client request note').fill('Original Admin requested another package');
    let purchasePosts = 0;
    await page.route(`**/api/admin/events/${f.eventId}/film-packages`, async (route) => {
      purchasePosts++;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add Film Packages', exact: true })
      .click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    const keyA = `film-package-purchase:${f.eventId}:${f.adminUser.id}`;
    const savedA = await page.evaluate((key) => sessionStorage.getItem(key), keyA);
    expect(savedA).not.toBeNull();
    await signOut(otherTab);
    await signIn(otherTab, adminB);
    const stale = await page.request.post(`/api/admin/events/${f.eventId}/film-packages`, {
      headers: { 'x-package-admin-id': f.adminUser.id, origin: 'http://127.0.0.1:1437' },
      data: JSON.parse(savedA!),
    });
    expect(stale.status()).toBe(403);
    const lookup = page.waitForResponse((response) =>
      response.url().includes(`/api/admin/events/${f.eventId}/operations/`)
    );
    await page.getByRole('button', { name: 'Retry request' }).click();
    expect((await lookup).status()).toBe(403);
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'Unable to check the original request'
    );
    expect(purchasePosts).toBe(1);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), keyA)).toBe(savedA);
    expect(
      localOwnerSql(
        `select (select count(*)::int from public.additional_film_package_entries where event_id='${f.eventId}') entries,(select count(*)::int from public.activity_events where event_id='${f.eventId}') audits`
      )
    ).toEqual([{ entries: 1, audits: 1 }]);
    await signOut(otherTab);
    await signIn(otherTab, f.adminUser);
    await page.getByRole('button', { name: 'Retry request' }).click();
    await expect(page.getByRole('dialog')).toContainText('Film Packages added.');
    expect(purchasePosts).toBe(1);
    await page.getByRole('button', { name: 'Done' }).click();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), keyA)).toBeNull();
  } finally {
    await otherTab.close();
    await f.dispose();
  }
});

test('purchase dialog uses theme colors and fits medium, wide and landscape safe areas with reduced motion', async ({
  page,
  context,
}, testInfo) => {
  const f = await createPackageBrowserFixture();
  const cdp = await context.newCDPSession(page);
  const evidence: object[] = [];
  try {
    f.seedRun('Paused');
    await signIn(page, f.adminUser);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 44, right: 44, bottom: 34, left: 44 },
    });
    for (const theme of ['light', 'dark'] as const) {
      expect(
        (await f.local.service.from('admin_profiles').update({ theme }).eq('id', f.adminUser.id))
          .error
      ).toBeNull();
      await page.goto(`/events/${f.eventId}`);
      const shell = page.locator('.admin-shell');
      await expect(shell).toHaveAttribute('data-theme', theme);
      for (const [width, height] of [
        [768, 1024],
        [1440, 1000],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await page.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
        const dialog = page.getByRole('dialog');
        const palette = await shell.evaluate((element) => {
          const swatch = document.createElement('div');
          swatch.style.backgroundColor = 'var(--color-surface)';
          swatch.style.color = 'var(--color-text)';
          element.append(swatch);
          const palette = {
            background: getComputedStyle(swatch).backgroundColor,
            text: getComputedStyle(swatch).color,
          };
          swatch.remove();
          return palette;
        });
        expect(
          await dialog.evaluate((element) => ({
            background: getComputedStyle(element).backgroundColor,
            text: getComputedStyle(element).color,
          }))
        ).toEqual(palette);
        const bounds = (await dialog.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(44);
        expect(bounds.y).toBeGreaterThanOrEqual(44);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 44);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 34);
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        expect(
          await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
        ).toBe(true);
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCSS(
          'transition-property',
          'none'
        );
        await page.getByLabel('Client request note').fill('Presentation check');
        const purchase = dialog.getByRole('button', { name: 'Add Film Packages', exact: true });
        await purchase.focus();
        await expect(purchase).toBeFocused();
        await expect(purchase).toBeInViewport();
        evidence.push({
          theme,
          viewport: { width, height },
          safeAreaInsets: { top: 44, right: 44, bottom: 34, left: 44 },
          dialog: bounds,
          palette,
          reducedMotion: true,
        });
        await page.screenshot({
          path: testInfo.outputPath(`purchase-${theme}-${width}x${height}-safe-reduced.png`),
        });
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    }
    await writeFile(
      testInfo.outputPath('purchase-presentation-metrics.json'),
      JSON.stringify(evidence, null, 2)
    );
  } finally {
    await cdp.detach();
    await f.dispose();
  }
});

test('purchase dialog remains keyboard usable at native 200% browser zoom', async ({
  baseURL,
}, testInfo) => {
  const extension = resolve('tests/fixtures/native-zoom-extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: null,
    baseURL,
    args: [
      '--window-size=1440,1000',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Paused');
    const page = context.pages()[0];
    await signIn(page, f.adminUser);
    await page.goto(`/events/${f.eventId}`);
    const before = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const zoom = await worker.evaluate(async () => {
      const { tabs } = (
        globalThis as unknown as {
          chrome: {
            tabs: {
              query(query: { url: string }): Promise<{ id: number }[]>;
              setZoom(id: number, zoom: number): Promise<void>;
              getZoom(id: number): Promise<number>;
            };
          };
        }
      ).chrome;
      const [tab] = await tabs.query({ url: 'http://127.0.0.1:1437/*' });
      await tabs.setZoom(tab.id, 2);
      return tabs.getZoom(tab.id);
    });
    expect(zoom).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(before.width / 2);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(before.dpr * 2);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe('1');
    await page.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await page.getByLabel('Client request note').fill('Native zoom check');
    const purchase = dialog.getByRole('button', { name: 'Add Film Packages', exact: true });
    await purchase.focus();
    await expect(purchase).toBeFocused();
    await expect(purchase).toBeInViewport();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await writeFile(
      testInfo.outputPath('purchase-native-zoom-metrics.json'),
      JSON.stringify(
        {
          zoom,
          before,
          after: await page.evaluate(() => ({
            width: innerWidth,
            dpr: devicePixelRatio,
            cssZoom: getComputedStyle(document.documentElement).zoom,
          })),
          dialog: await dialog.boundingBox(),
        },
        null,
        2
      )
    );
    const cdp = await context.newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      testInfo.outputPath('purchase-native-200-percent.png'),
      Buffer.from(data, 'base64')
    );
    await cdp.detach();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    await context.close();
    await f.dispose();
  }
});
