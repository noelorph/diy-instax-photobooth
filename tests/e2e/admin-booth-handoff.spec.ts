import { expect, test } from '@playwright/test';
import { localSupabase, ownerInsert, cleanupEvents } from '../fixtures/local-supabase';
test('paused sign-in is neutral and returns only an authorized Event without resuming', async ({
  page,
  context,
}) => {
  const local = localSupabase();
  const admin = await local.provisionUser();
  await local.allowlist(admin.id);
  const row = await ownerInsert('events', {
    state: 'Live',
    title: 'Paused private Event',
    client_name: 'Client',
    client_email: 'private@example.test',
    client_phone: '123',
    venue_address: 'Hall',
    time_zone: 'Asia/Manila',
    starts_at: '2026-11-01T10:00:00Z',
    ends_at: '2026-11-01T11:00:00Z',
    film_package_count: 1,
    original_print_allowance: 10,
  });
  expect(row.error).toBeNull();
  const id = row.data!.id;
  try {
    await context.addCookies([
      {
        name: '__Host-booth-return',
        value: id,
        domain: '127.0.0.1',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    await page.goto('/sign-in?from=booth');
    await expect(page.getByRole('heading', { name: 'Booth paused' })).toBeVisible();
    await expect(page.getByText('Paused private Event')).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).fill(admin.email);
    await page.getByLabel('Password', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`/events/${id}`);
    await expect(page.getByRole('button', { name: 'Resume Booth Mode' })).toBeDisabled();
    await expect(page.getByText(/#17/)).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === '__Host-booth-return')).toBe(false);
  } finally {
    await cleanupEvents([id]);
    await local.cleanup();
  }
});
test('Guest cannot reach Admin operations', async ({ page }) => {
  await page.goto('/events/00000000-0000-4000-8000-000000000001');
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByRole('heading', { name: 'Event operations' })).toHaveCount(0);
});
