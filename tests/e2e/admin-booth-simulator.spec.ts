import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { localSupabase } from '../fixtures/local-supabase';
function sql(statement: string) {
  execFileSync(
    'node_modules/.bin/supabase',
    ['db', 'query', '--local', `do $$ begin ${statement}; end $$`],
    { stdio: 'pipe' }
  );
}
test('Admin Test Print, inspection, handoff and same-device pause return require explicit Resume', async ({
  page,
}) => {
  const local = localSupabase(),
    admin = await local.provisionUser();
  await local.allowlist(admin.id);
  const id = randomUUID(),
    stockId = randomUUID();
  const created = await local.service
    .from('events')
    .insert({
      id,
      title: 'Simulated handoff',
      client_name: 'Client',
      client_email: 'client@example.test',
      client_phone: '123',
      venue_address: 'Hall',
      time_zone: 'Asia/Manila',
      starts_at: '2026-11-01T10:00:00Z',
      ends_at: '2026-11-01T11:00:00Z',
      film_package_count: 1,
      original_print_allowance: 10,
    });
  expect(created.error).toBeNull();
  try {
    sql(
      `update public.printer_completion_policy set mode='simulated';insert into public.film_stock_entries(id,kind,signed_sheets,reason,actor_scope) values('${stockId}','Addition',10,'Browser fixture','${admin.id}');update public.film_stock_balance set on_hand=(select sum(signed_sheets) from public.film_stock_entries)`
    );
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(admin.email);
    await page.getByLabel('Password', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/dashboard$/);
    await page.goto(`/events/${id}`);
    await page.getByRole('button', { name: 'Connect simulator' }).click();
    await page.getByRole('button', { name: 'Test Print', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Inspected: output usable' })).toBeVisible();
    await page.getByRole('button', { name: 'Inspected: output usable' }).click();
    await expect(page.getByText('Usable Test Print inspected for this connection')).toBeVisible();
    await page.getByRole('checkbox', { name: /Camera, printer/ }).check();
    await page.getByRole('button', { name: 'Start Booth Mode' }).click();
    await expect(page).toHaveURL(/\/booth$/);
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Admin pause', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Booth paused' })).toBeVisible();
    await page.getByRole('link', { name: 'Admin sign in' }).click();
    await page.getByLabel('Email', { exact: true }).fill(admin.email);
    await page.getByLabel('Password', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`/events/${id}`);
    await expect(page.getByRole('button', { name: 'Resume Booth Mode' })).toBeVisible();
    expect(
      (await local.service.from('booth_runs').select('state').eq('event_id', id).single()).data
        ?.state
    ).toBe('Paused');
  } finally {
    sql(
      `delete from public.operation_receipts where event_id='${id}';delete from public.activity_events where event_id='${id}';delete from public.film_stock_entries where event_id='${id}' or id='${stockId}';delete from public.print_attempt_events where attempt_id in(select id from public.print_attempts where event_id='${id}');delete from public.print_attempts where event_id='${id}';delete from public.captures where event_id='${id}';delete from public.guest_sessions where event_id='${id}';delete from public.booth_handoffs where event_id='${id}';delete from public.booth_grants where event_id='${id}';delete from public.booth_runs where event_id='${id}';delete from public.events where id='${id}';update public.film_stock_balance set on_hand=(select coalesce(sum(signed_sheets),0) from public.film_stock_entries);update public.printer_completion_policy set mode='disabled'`
    );
    await local.cleanup();
  }
});
