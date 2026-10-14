import { test, expect, type Page } from '@playwright/test';
import { localSupabase } from '../fixtures/local-supabase';

async function fillBooking(page: Page, title: string) {
  await page.getByLabel('Event name', { exact: true }).filter({ visible: true }).fill(title);
  await page.getByLabel('Venue address').filter({ visible: true }).fill('Manila hall');
  await page.getByLabel('Venue time zone').filter({ visible: true }).fill('Asia/Manila');
  await page.getByLabel('Scheduled start').filter({ visible: true }).fill('2025-01-10T18:00');
  await page.getByLabel('Scheduled end').filter({ visible: true }).fill('2025-01-10T20:00');
  await page.getByLabel('Client name').filter({ visible: true }).fill('Alex');
  await page.getByLabel('Client email').filter({ visible: true }).fill('alex@example.test');
  await page.getByLabel('Client phone').filter({ visible: true }).fill('+639171234567');
  await page.getByLabel('Booked Film Packages').filter({ visible: true }).fill('0');
  await page.getByLabel('Original Print Allowance').filter({ visible: true }).fill('0');
}
for (const width of [390, 1440]) {
  test(`create, list, view and edit Drafts by keyboard at ${width}px with supplemental CSS scaling`, async ({
    page,
    context,
  }, testInfo) => {
    const local = localSupabase();
    const admin = await local.provisionUser();
    const title = `Draft browser ${admin.id}`;
    let eventId: string | undefined;
    try {
      expect((await local.allowlist(admin.id)).error).toBeNull();
      if (width === 1440) {
        expect(
          (await local.service.from('admin_profiles').update({ theme: 'dark' }).eq('id', admin.id))
            .error
        ).toBeNull();
      }
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/sign-in');
      await page.getByLabel('Email', { exact: true }).filter({ visible: true }).fill(admin.email);
      await page
        .getByLabel('Password', { exact: true })
        .filter({ visible: true })
        .fill(admin.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto('/events');
      await page.getByRole('link', { name: 'Create Event' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Create Event', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Save Draft' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
      await fillBooking(page, title);
      await page.locator('html').evaluate((element) => {
        element.style.zoom = '2';
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`draft-form-${width}-zoom.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Save Draft' }).focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByText('Draft saved.', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      const view = page.getByRole('link', { name: 'View saved Draft' });
      eventId = (await view.getAttribute('href'))!.split('/').pop();
      await view.click();
      await expect(page.getByLabel('Event name').filter({ visible: true })).toHaveValue(title);
      await expect(page.getByLabel('Scheduled start').filter({ visible: true })).toHaveValue(
        '2025-01-10T18:00'
      );
      await expect(
        page.getByLabel('Original Print Allowance').filter({ visible: true })
      ).toHaveValue('0');
      await expect(
        page.getByText('Draft', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /delete|booth|test print|stock/i })
      ).toHaveCount(0);
      const stale = await context.newPage();
      await stale.goto(`/events/${eventId}`);
      await stale.getByLabel('Event name').filter({ visible: true }).fill('Retain my stale edit');
      await page.getByLabel('Event name').filter({ visible: true }).fill(`${title} updated`);
      await page.getByLabel('Venue address').filter({ visible: true }).fill('Cebu hall');
      await page.getByLabel('Venue time zone').filter({ visible: true }).fill('Pacific/Auckland');
      await page.getByLabel('Scheduled start').filter({ visible: true }).fill('2025-06-10T09:00');
      await page.getByLabel('Scheduled end').filter({ visible: true }).fill('2025-06-10T11:00');
      await page.getByLabel('Client name').filter({ visible: true }).fill('Sam');
      await page.getByLabel('Client email').filter({ visible: true }).fill('sam@example.test');
      await page.getByLabel('Client phone').filter({ visible: true }).fill('+6491234567');
      await page.getByLabel('Booked Film Packages').filter({ visible: true }).fill('2');
      await page.getByLabel('Original Print Allowance').filter({ visible: true }).fill('7');
      await page.getByRole('button', { name: 'Save Draft' }).click();
      await expect(
        page.getByText('Draft saved.', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await page.reload();
      for (const [label, value] of Object.entries({
        'Event name': `${title} updated`,
        'Venue address': 'Cebu hall',
        'Venue time zone': 'Pacific/Auckland',
        'Scheduled start': '2025-06-10T09:00',
        'Scheduled end': '2025-06-10T11:00',
        'Client name': 'Sam',
        'Client email': 'sam@example.test',
        'Client phone': '+6491234567',
        'Booked Film Packages': '2',
        'Original Print Allowance': '7',
      })) {
        await expect(page.getByLabel(label, { exact: true }).filter({ visible: true })).toHaveValue(
          value
        );
      }
      await expect(page.getByText('Revision 2').filter({ visible: true })).toBeVisible();
      await stale.getByRole('button', { name: 'Save Draft' }).click();
      await expect(stale.getByRole('main').getByRole('alert')).toContainText('changed');
      await expect(stale.getByLabel('Event name').filter({ visible: true })).toHaveValue(
        'Retain my stale edit'
      );
      await stale.getByRole('link', { name: 'Reload latest Draft' }).click();
      await expect(stale.getByLabel('Event name').filter({ visible: true })).toHaveValue(
        `${title} updated`
      );
      await stale.close();
      await page.getByRole('link', { name: 'Back to Events' }).click();
      const row = page
        .getByRole('row')
        .filter({ has: page.getByRole('link', { name: `${title} updated`, exact: true }) });
      await expect(row).toContainText('Pacific/Auckland');
      await expect(row).toContainText('09:00');
      await expect(row).toContainText('Overdue Draft');
      await page.locator('html').evaluate((element) => {
        element.style.zoom = '2';
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      expect(
        await page
          .locator('.draft-table caption')
          .evaluate(
            (caption) => caption.clientWidth >= (caption.parentElement?.clientWidth ?? 0) * 0.9
          )
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`draft-list-${width}-zoom.png`),
        fullPage: true,
      });
      await page.getByRole('link', { name: 'Create Event' }).click();
      await expect(page.getByLabel('Event name').filter({ visible: true })).toHaveValue('');
      await page.goto('/events/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
      await expect(page.getByText('Draft not found.').filter({ visible: true })).toBeVisible();
      await expect(page.getByLabel('Client email').filter({ visible: true })).toHaveCount(0);
      await expect(page.getByText('sam@example.test').filter({ visible: true })).toHaveCount(0);
    } finally {
      if (eventId) await local.service.from('events').delete().eq('id', eventId);
      else await local.service.from('events').delete().eq('title', title);
      await local.cleanup();
    }
  });
}
