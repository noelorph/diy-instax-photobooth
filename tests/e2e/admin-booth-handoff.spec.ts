import { expect, test } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
test('production cannot activate simulation through equipment setup', async ({ page }) => {
  const f = await createPackageBrowserFixture();
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
    await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/dashboard$/);
    await page.goto(`/events/${f.eventId}`);
    await expect(
      page.getByText('Always test the printer before starting Booth Mode.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Booth Mode' })).toBeDisabled();
    const result = await page.evaluate(async (id) => {
      const response = await fetch(
        `/api/admin/events/${id}/booth/setup-readiness?printerId=simulator&connectionGeneration=1`
      );
      return { status: response.status, body: await response.json() };
    }, f.eventId);
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('qualification_required');
    await page.goto('/booth');
    await expect(page.getByRole('heading', { name: 'Booth paused' })).toBeVisible();
    expect(
      (await f.local.service.from('booth_runs').select('id').eq('event_id', f.eventId)).data
    ).toEqual([]);
  } finally {
    await f.dispose();
  }
});
test('Guest cannot reach Admin operations', async ({ page }) => {
  await page.goto('/events/00000000-0000-4000-8000-000000000001');
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByRole('heading', { name: 'Event operations' })).toHaveCount(0);
});
