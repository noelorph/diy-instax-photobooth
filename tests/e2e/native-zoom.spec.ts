import { chromium, expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { localSupabase, cleanupEvents } from '../fixtures/local-supabase';

async function keyboardActivate(page: Page, control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  await expect(control).toBeInViewport();
  await page.keyboard.press('Enter');
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function captureNativeViewport(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => scrollTo(0, 0));
  // Playwright's fullPage clip uses unzoomed coordinates and crops native zoom.
  // Capture the browser surface without a clip so the evidence shows its viewport.
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(testInfo.outputPath(name), Buffer.from(data, 'base64'));
  } finally {
    await cdp.detach();
  }
}

// Extensions run in the full Chromium browser (including its headless mode).
// tabs.setZoom changes native browser page zoom, without CSS zoom, device
// emulation, viewport resizing, or a pinch-zoom/page-scale approximation.
for (const width of [1000, 1440, 2400]) {
  test(`shell, Profile and Drafts at native 200% page zoom from ${width}px`, async ({
    baseURL,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const extension = resolve('tests/fixtures/native-zoom-extension');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: null,
      baseURL,
      args: [
        `--window-size=${width},1000`,
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    const local = localSupabase();
    const admin = await local.provisionUser();
    const title = `Native zoom ${admin.id} ${'Celebration'.repeat(14)}`;
    let eventId: string | undefined;
    try {
      expect((await local.allowlist(admin.id)).error).toBeNull();
      const page = context.pages()[0];
      await page.goto('/sign-in');
      await page.getByLabel('Email', { exact: true }).fill(admin.email);
      await page.getByLabel('Password', { exact: true }).fill(admin.password);
      await keyboardActivate(page, page.getByRole('button', { name: 'Sign in', exact: true }));
      await expect(page).toHaveURL(/\/dashboard$/);
      const measure = () =>
        page.evaluate(() => ({
          width: innerWidth,
          dpr: devicePixelRatio,
          compact: matchMedia('(max-width: 639px)').matches,
          wide: matchMedia('(min-width: 1024px)').matches,
          cssZoom: getComputedStyle(document.documentElement).zoom,
        }));
      const before = await measure();
      expect(before.width).toBe(width);
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const nativeZoom = await worker.evaluate(async () => {
        const { tabs } = (
          globalThis as unknown as {
            chrome: {
              tabs: {
                query(query: { url: string }): Promise<{ id: number }[]>;
                setZoom(id: number, factor: number): Promise<void>;
                getZoom(id: number): Promise<number>;
              };
            };
          }
        ).chrome;
        const [tab] = await tabs.query({ url: 'http://127.0.0.1:1437/*' });
        await tabs.setZoom(tab.id, 2);
        return tabs.getZoom(tab.id);
      });
      expect(nativeZoom).toBe(2);
      await expect.poll(async () => (await measure()).width).toBe(before.width / 2);
      const after = await measure();
      expect(after.dpr).toBe(before.dpr * 2);
      expect(after.cssZoom).toBe('1');
      expect(after.compact).toBe(width === 1000);
      expect(after.wide).toBe(width === 2400);
      if (width === 1000) expect(before.compact).toBe(false);
      if (width === 1440) expect(before.wide).toBe(true);
      const metrics = testInfo.outputPath('native-zoom-metrics.json');
      await writeFile(metrics, JSON.stringify({ nativeZoom, before, after }, null, 2));
      await testInfo.attach('native-zoom-metrics', {
        path: metrics,
        contentType: 'application/json',
      });

      async function navigate(name: string) {
        if (after.compact) {
          const toggle = page.getByRole('button', { name: 'Open navigation' });
          await keyboardActivate(page, toggle);
          await page.keyboard.press('Escape');
          await expect(toggle).toBeFocused();
          await keyboardActivate(page, toggle);
        }
        const nav = page.getByRole('navigation', { name: 'Admin' });
        await expect(nav.getByRole('link').last()).toHaveAccessibleName('Profile');
        await keyboardActivate(page, nav.getByRole('link', { name, exact: true }));
      }

      await navigate('Profile');
      await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
      await page.getByLabel('Phone number').fill('+639171234567');
      await page.getByRole('radio', { name: 'Light', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
      await keyboardActivate(page, page.getByRole('button', { name: 'Save preferences' }));
      await expect(page.getByText('Preferences saved.')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await captureNativeViewport(page, testInfo, 'profile-native-200.png');
      await page.reload();
      await expect(page.getByLabel('Phone number')).toHaveValue('+639171234567');
      await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', 'dark');
      expect((await measure()).width).toBe(after.width);

      await navigate('History');
      await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
      await navigate('Events');
      await keyboardActivate(page, page.getByRole('link', { name: 'Create Event' }));
      const save = page.getByRole('button', { name: 'Save Draft' });
      await keyboardActivate(page, save);
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
      await expect(page.getByLabel('Event name').filter({ visible: true })).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      await expectNoHorizontalOverflow(page);
      await captureNativeViewport(page, testInfo, 'validation-native-200.png');
      for (const [label, value] of Object.entries({
        'Event name': title,
        'Venue address': 'Manila hall',
        'Venue time zone': 'America/Argentina/Rio_Gallegos',
        'Scheduled start': '2025-01-10T18:00',
        'Scheduled end': '2025-01-10T20:00',
        'Client name': 'Alexandria'.repeat(18),
        'Client email': 'alex@example.test',
        'Client phone': '+639171234567',
        'Booked Film Packages': '0',
        'Original Print Allowance': '0',
      })) {
        await page.getByLabel(label, { exact: true }).filter({ visible: true }).fill(value);
      }
      // Tab follows the last input to the save control at every responsive size.
      await page.keyboard.press('Tab');
      await expect(save).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByText('Draft saved.', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      const view = page.getByRole('link', { name: 'View saved Draft' });
      eventId = (await view.getAttribute('href'))!.split('/').pop();
      await keyboardActivate(page, view);
      await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
      await expect(page.getByRole('heading', { name: 'Edit Draft', exact: true })).toBeVisible();
      await expect(page.getByLabel('Venue time zone').filter({ visible: true })).toHaveValue(
        'America/Argentina/Rio_Gallegos'
      );
      await page.getByLabel('Original Print Allowance').filter({ visible: true }).fill('7');
      await keyboardActivate(page, save);
      await expect(
        page.getByText('Draft saved.', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByLabel('Original Print Allowance').filter({ visible: true })
      ).toHaveValue('7');
      await expectNoHorizontalOverflow(page);
      await captureNativeViewport(page, testInfo, 'draft-form-native-200.png');
      await keyboardActivate(page, page.getByRole('link', { name: 'Back to Events' }));
      const row = page
        .getByRole('row')
        .filter({ has: page.getByRole('link', { name: title, exact: true }) });
      await expect(row).toContainText('America/Argentina/Rio_Gallegos');
      await expect(row).toContainText('18:00');
      await expect(row).toContainText('Overdue Draft');
      await expectNoHorizontalOverflow(page);
      expect((await measure()).width).toBe(after.width);
      await captureNativeViewport(page, testInfo, 'draft-list-native-200.png');
      await keyboardActivate(page, row.getByRole('link', { name: title, exact: true }));
      await expect(page.getByLabel('Event name').filter({ visible: true })).toHaveValue(title);
    } finally {
      await context.close();
      if (eventId) await cleanupEvents([eventId]);
      else {
        const found = await local.service.from('events').select('id').eq('title', title);
        cleanupEvents((found.data ?? []).map((row) => row.id));
      }
      await local.cleanup();
    }
  });
}
