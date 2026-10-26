import { test, expect } from '@playwright/test';
import { localSupabase, readProfile } from '../fixtures/local-supabase';
for (const width of [390, 768, 1440]) {
  test(`sign in, navigate, persist Profile, and locally sign out at ${width}px`, async ({
    page,
  }, testInfo) => {
    const local = localSupabase();
    const admin = await local.provisionUser();
    try {
      expect((await local.allowlist(admin.id)).error).toBeNull();
      let other = await local.signIn(admin);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/sign-in');
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await page.getByLabel('Email', { exact: true }).fill(admin.email);
      await page.getByLabel('Password', { exact: true }).fill(admin.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      if (width < 640) {
        const trigger = page.getByRole('button', { name: /^(Open|Close) navigation menu$/ });
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Enter');
      }
      if (width >= 640 && width < 1024) {
        const dashboard = page.getByRole('navigation').getByRole('link', { name: 'Dashboard' });
        expect(
          await dashboard.evaluate((element) => element.scrollWidth <= element.clientWidth)
        ).toBe(true);
        await page.getByRole('button', { name: 'Expand navigation' }).click();
        await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
      }
      const nav = page.getByRole('navigation', { name: 'Admin' });
      await expect(nav.getByRole('link').last()).toHaveAccessibleName('Profile');
      if (width === 1440) {
        await nav.getByRole('link', { name: 'History' }).click();
        await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
      }
      await nav.getByRole('link', { name: 'Profile', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
      if (width < 640)
        await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
          'aria-expanded',
          'false'
        );
      for (const name of ['Account', 'Appearance', 'Change password', 'Sign out']) {
        await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
      }
      await expect(page.getByLabel('Email (Admin)')).toHaveAttribute('readonly', '');
      await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
      for (const [first, second] of [
        [page.getByLabel('Email (Admin)'), page.getByLabel('Phone number')],
        [page.getByLabel('New password', { exact: true }), page.getByLabel('Confirm new password')],
      ]) {
        const a = (await first.boundingBox())!;
        const b = (await second.boundingBox())!;
        if (width >= 640) {
          expect(Math.abs(a.y - b.y)).toBeLessThan(2);
          expect(b.x).toBeGreaterThan(a.x + a.width);
        } else {
          expect(b.y).toBeGreaterThan(a.y + a.height);
        }
      }
      await page.screenshot({
        path: testInfo.outputPath(`profile-light-${width}.png`),
        fullPage: true,
      });
      await page.getByLabel('Phone number').fill('+63 917 123 4567');
      await page.getByRole('radio', { name: 'Dark', exact: true }).check();
      await page.getByRole('button', { name: 'Save preferences' }).click();
      await expect(page.getByText('Preferences saved.')).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
      await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', 'dark');
      await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
      await page.reload();
      await expect(page.getByLabel('Phone number')).toHaveValue('+63 917 123 4567');
      await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
      await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', 'dark');
      // Supplemental CSS scaling only. Native page zoom and media-query changes
      // are verified separately in native-zoom.spec.ts.
      await page.locator('html').evaluate((element) => {
        element.style.zoom = '2';
      });
      await expect(page.getByRole('button', { name: 'Save preferences' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page.locator('html').evaluate((element) => {
        element.style.zoom = '';
      });
      if (width === 1440) {
        const password = 'Browser-profile-password-456!';
        await page.getByLabel('New password', { exact: true }).fill(password);
        await page.getByLabel('Confirm new password').fill(password);
        await page.getByRole('button', { name: 'Change password' }).click();
        await expect(page.getByText('Password changed.', { exact: false })).toBeVisible();
        expect(
          (await local.client().auth.signInWithPassword({ email: admin.email, password })).error
        ).toBeNull();
        // Auth password changes may end existing sessions; establish a new
        // independent device to measure local Sign out alone.
        other = await local.signIn({ email: admin.email, password });
      }
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await page.goto('/profile');
      await expect(page).toHaveURL(/\/sign-in\?reason=session-ended$/);
      await expect(page.getByRole('status')).toHaveText(
        'Your session is no longer available. Sign in again to continue.'
      );
      await page.reload();
      await expect(page.getByRole('status')).toContainText('Sign in again');
      expect((await other.client.auth.refreshSession()).error).toBeNull();
      expect((await readProfile(other.client)).data?.[0].id).toBe(admin.id);
    } finally {
      await local.cleanup();
    }
  });
}
