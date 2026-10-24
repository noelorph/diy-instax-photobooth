import { writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { localSupabase, cleanupEvents } from '../fixtures/local-supabase';

const longTitle = 'Celebration'.repeat(18);
const longClient = 'Alexandria'.repeat(18);
const faultFile = resolve('test-results/events-read-fault');
const zone = 'America/Argentina/Rio_Gallegos';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page
    .locator('.public-auth, .admin-shell')
    .filter({ visible: true })
    .waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

// Catches lost wrapping, clipped Draft actions/status, global theme leakage,
// external/fallback fonts, and a menu that cannot be dismissed from content.
for (const width of [320, 768, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Admin visual contracts at ${width}px in ${theme}`, async ({ page }, info) => {
      info.setTimeout(90_000);
      const local = localSupabase();
      const admin = await local.provisionUser();
      let eventId: string | undefined;
      try {
        expect((await local.allowlist(admin.id)).error).toBeNull();
        expect(
          (await local.service.from('admin_profiles').update({ theme }).eq('id', admin.id)).error
        ).toBeNull();
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: 'light' });
        const fonts: string[] = [];
        page.on('response', (response) => {
          if (response.request().resourceType() === 'font' && response.ok())
            fonts.push(response.url());
        });
        await page.goto('/sign-in');
        const publicBackground = await page
          .locator('.public-auth')
          .evaluate((e) => getComputedStyle(e).backgroundColor);
        await page.emulateMedia({ colorScheme: 'dark' });
        expect(
          await page.locator('.public-auth').evaluate((e) => getComputedStyle(e).backgroundColor)
        ).toBe(publicBackground);
        await page.evaluate(() => document.fonts.ready);
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
        expect(await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(
          /geist/i
        );
        await expect
          .poll(
            () =>
              page.evaluate(() =>
                [...document.fonts].some(
                  (font) => /geist/i.test(font.family) && font.status === 'loaded'
                )
              ),
            { timeout: 10_000 }
          )
          .toBe(true);
        await noOverflow(page);
        await capture(page, info, 'public-sign-in');
        await page.getByLabel('Email', { exact: true }).fill(admin.email);
        await page.getByLabel('Password', { exact: true }).fill(admin.password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', theme);
        if (theme === 'dark')
          expect(
            await page.locator('.admin-shell').evaluate((e) => getComputedStyle(e).backgroundColor)
          ).not.toBe(publicBackground);
        await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
        await capture(page, info, 'dashboard');
        if (width < 640) {
          const menu = page.getByRole('button', { name: 'Open navigation menu' });
          await expect(page.getByRole('navigation', { name: 'Admin' })).toBeHidden();
          await menu.focus();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
          await page.getByRole('main').focus();
          await page.keyboard.press('Escape');
          await expect(menu).toBeFocused();
          await expect(page.getByRole('navigation', { name: 'Admin' })).toBeHidden();
          await expect(menu).toHaveAttribute('aria-expanded', 'false');
          await page.keyboard.press('Enter');
          await page
            .getByRole('navigation')
            .getByRole('link', { name: 'Events', exact: true })
            .focus();
          await page.keyboard.press('Enter');
          await expect(menu).toHaveAttribute('aria-expanded', 'false');
        } else await page.goto('/events');
        await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();
        await capture(page, info, 'events-empty');
        await page.goto('/events/new');
        await page.getByRole('button', { name: 'Save Draft' }).click();
        await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
        await capture(page, info, 'draft-invalid');
        for (const [label, value] of Object.entries({
          'Event name': longTitle,
          'Venue address': 'GrandHall'.repeat(24),
          'Venue time zone': zone,
          'Scheduled start': '2025-01-10T18:00',
          'Scheduled end': '2025-01-10T20:00',
          'Client name': longClient,
          'Client email': 'alex@example.test',
          'Client phone': '+639171234567',
          'Booked Film Packages': '0',
          'Original Print Allowance': '0',
        }))
          await page.getByLabel(label, { exact: true }).filter({ visible: true }).fill(value);
        // Hold the real server action at the transport boundary to observe pending UI.
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route('**/events/new', async (route) => {
          if (route.request().method() === 'POST') await gate;
          await route.continue();
        });
        await page.getByRole('button', { name: 'Save Draft' }).click();
        try {
          await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
          await expect(page.getByRole('status')).toContainText('Saving Draft');
          await capture(page, info, 'draft-pending');
        } finally {
          release();
        }
        await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
        await page.unroute('**/events/new');
        eventId = (await page.getByRole('link', { name: 'View saved Draft' }).getAttribute('href'))!
          .split('/')
          .pop();
        await noOverflow(page);
        await capture(page, info, 'draft-saved');
        await page.goto('/events');
        const row = page
          .getByRole('row')
          .filter({ has: page.getByRole('link', { name: longTitle, exact: true }) });
        await expect(row.getByText('Draft', { exact: true })).toBeVisible();
        await expect(row).toContainText('Overdue Draft');
        await expect(row).toContainText(zone);
        await noOverflow(page);
        const link = row.getByRole('link', { name: longTitle, exact: true });
        expect(await link.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
        await capture(page, info, 'events-long-text');
        await link.click();
        await expect(page.getByLabel('Client name')).toHaveValue(longClient);
        await noOverflow(page);
        await capture(page, info, 'draft-detail');
        const stale = await page.context().newPage();
        await stale.setViewportSize({ width, height: 1000 });
        try {
          await stale.goto(`/events/${eventId}`);
          await expect(stale.getByLabel('Event name')).toHaveValue(longTitle);
          await page.getByLabel('Client name').fill(`${longClient} updated`);
          await page.getByRole('button', { name: 'Save Draft' }).click();
          await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
          await stale.getByRole('button', { name: 'Save Draft' }).click();
          await expect(stale.getByRole('main').getByRole('alert')).toContainText('changed');
          await noOverflow(stale);
          await capture(stale, info, 'draft-conflict');
        } finally {
          await stale.close();
        }
        await page.goto('/events/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
        await expect(page.getByText('Draft not found.')).toBeVisible();
        await capture(page, info, 'draft-not-found');
        await writeFile(faultFile, 'unavailable');
        try {
          await page.goto('/events');
          await expect(page.getByRole('main').getByRole('alert')).toContainText(
            'Unable to complete'
          );
          await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
          await noOverflow(page);
          await capture(page, info, 'events-unavailable');
          await page.goto(`/events/${eventId}`);
          await expect(page.getByRole('heading', { name: 'Unable to load Draft' })).toBeVisible();
          await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
          await capture(page, info, 'draft-unavailable');
          await page.goto('/history');
          await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
          await capture(page, info, 'history');
        } finally {
          await rm(faultFile, { force: true });
        }
        await page.goto('/events');
        await expect(page.getByRole('link', { name: longTitle, exact: true })).toBeVisible();
        await page.goto('/profile');
        await expect(page.getByRole('button', { name: 'Save preferences' })).toBeVisible();
        // Compact actions span their form; wider layouts keep a concise action.
        for (const name of ['Save preferences', 'Change password', 'Sign out']) {
          const sizes = await page.getByRole('button', { name, exact: true }).evaluate((e) => ({
            action: e.getBoundingClientRect().width,
            form: e.closest('form')!.getBoundingClientRect().width,
          }));
          if (width < 640) expect(sizes.action).toBe(sizes.form);
          else expect(sizes.action).toBeLessThan(sizes.form);
        }
        await capture(page, info, 'profile');
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(page).toHaveURL(/\/sign-in$/);
        expect(
          await page.locator('.public-auth').evaluate((e) => getComputedStyle(e).backgroundColor)
        ).toBe(publicBackground);
        await page.goto('/forgot-password');
        await capture(page, info, 'recovery');
        await page.goto('/reset-password');
        await expect(page.getByRole('link', { name: 'Request another link' })).toBeVisible();
        await capture(page, info, 'reset-invalid');
      } finally {
        await rm(faultFile, { force: true });
        if (eventId) await cleanupEvents([eventId]);
        else {
          const found = await local.service.from('events').select('id').eq('title', longTitle);
          cleanupEvents((found.data ?? []).map((row) => row.id));
        }
        await local.cleanup();
      }
    });
  }
}

// Catches lost persistent recovery feedback and reset controls across real PKCE navigation.
for (const width of [320, 768, 1440]) {
  test(`public recovery feedback and reset at ${width}px`, async ({ page }, info) => {
    info.setTimeout(60_000);
    const local = localSupabase();
    const admin = await local.provisionUser();
    try {
      expect((await local.allowlist(admin.id)).error).toBeNull();
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/forgot-password');
      await page.getByRole('button', { name: 'Send recovery link' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Correct the highlighted fields'
      );
      await capture(page, info, 'recovery-invalid');
      await page.getByLabel('Email', { exact: true }).fill(admin.email);
      await page.getByRole('button', { name: 'Send recovery link' }).click();
      await expect(page.getByRole('status')).toContainText('Check your email');
      await capture(page, info, 'recovery-success');
      let messageId: string | undefined;
      await expect
        .poll(async () => {
          const inbox = await fetch(
            `http://127.0.0.1:56324/api/v1/search?query=${encodeURIComponent(`to:${admin.email}`)}`
          ).then((r) => r.json());
          messageId = inbox.messages[0]?.ID;
          return Boolean(messageId);
        })
        .toBe(true);
      const message = await fetch(`http://127.0.0.1:56324/api/v1/message/${messageId}`).then((r) =>
        r.json()
      );
      const href = message.HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
      expect(Boolean(href)).toBe(true);
      // The isolated Auth stack's fallback origin is port 3000. Forward its
      // real PKCE code to this suite's callback without changing Auth config.
      const verification = new URL(href);
      await page.route('http://127.0.0.1:3000/**', async (route) => {
        const callback = new URL(route.request().url());
        expect(Boolean(callback.searchParams.get('code'))).toBe(true);
        callback.port = '1437';
        callback.pathname = '/auth/callback';
        await route.fulfill({ status: 302, headers: { location: callback.toString() } });
      });
      await page.goto(verification.toString());
      await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Set new password' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Correct the highlighted fields'
      );
      await capture(page, info, 'reset-validation');
      await page.getByLabel('New password', { exact: true }).fill('Browser-reset-password-987!');
      await page
        .getByLabel('Confirm new password', { exact: true })
        .fill('Browser-reset-password-987!');
      await page.getByRole('button', { name: 'Set new password' }).click();
      await expect(page.getByRole('status')).toContainText(/all Admin sessions have ended/i);
      await noOverflow(page);
      await capture(page, info, 'reset-success');
    } finally {
      await local.cleanup();
    }
  });
}
