import { test, expect } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
import { localOwnerSql } from '../fixtures/local-supabase';

test('phone purchase survives a lost response and reload with one immutable addition', async ({
  page,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Paused');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
    await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
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
    await page.reload();
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
      await page.evaluate((id) => sessionStorage.getItem(`film-package-purchase:${id}`), f.eventId)
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
