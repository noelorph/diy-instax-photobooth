import { writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { cleanupEvents, localOwnerSql, ownerInsert, ownerUpdate } from '../fixtures/local-supabase';
import { createPackageBrowserFixture } from '../fixtures/package-browser';

test('Dashboard summaries, Live run states, activity controls and responsive themes', async ({
  page,
}, info) => {
  info.setTimeout(120000);
  const f = await createPackageBrowserFixture();
  const faultFile = resolve('test-results/events-read-fault');
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const now = new Date();
  const start = now.toISOString();
  const end = new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
  try {
    f.seedRun('Active');
    ownerUpdate('events', f.eventId, {
      revision: 3,
      title: 'Live celebration',
      starts_at: start,
      ends_at: end,
      film_package_count: 5,
    });
    ownerInsert(
      'events',
      ids.map((id, index) => ({
        id,
        accounting_version: 2,
        state: ['Draft', 'Completed', 'Cancelled'][index],
        title: ['Next celebration', 'Past celebration', 'Cancelled celebration'][index],
        client_name: 'Client',
        client_email: 'private@example.test',
        client_phone: '123',
        starts_at: index === 0 ? new Date(now.getTime() + 60 * 60_000).toISOString() : start,
        ends_at: end,
        time_zone: 'Asia/Manila',
        venue_address: 'Hall',
        film_package_count: 1,
      }))
    );
    ownerInsert('additional_film_package_entries', {
      event_id: f.eventId,
      packages: 1,
      client_request_note: 'Client requested one package',
      actor_id: f.adminUser.id,
      operation_key: randomUUID(),
    });
    localOwnerSql(`insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at) select gen_random_uuid(),'${f.eventId}','${f.runId}',2,'Printed',now() from generate_series(1,38);
      insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select gen_random_uuid(),event_id,run_id,id,2,now(),gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}';
      insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) select event_id,run_id,session_id,id,2,'Guest',case when row_number() over(order by id)=38 then 'Pending' else 'Printed' end,gen_random_uuid(),gen_random_uuid() from public.captures where event_id='${f.eventId}';
      insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind,created_at) select '${f.eventId}',2,'admin:fixture','add_packages',now() - interval '1 hour' from generate_series(1,27);
      insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind,created_at) values ('${f.eventId}',2,'admin:fixture','__proto__',now() - interval '8 days');`);
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
    await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Monthly Events' }).locator('strong')).toHaveText(
      '3'
    );
    await expect(
      page.getByRole('region', { name: 'Total Events booked' }).locator('strong')
    ).toHaveText('3');
    await expect(
      page.getByRole('region', { name: 'Upcoming Events' }).locator('strong')
    ).toHaveText('1');
    await expect(page.getByText('60 total booked prints', { exact: true })).toBeVisible();
    await expect(page.getByText('22 Prints available', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Live Event' })).toHaveAttribute(
      'href',
      `/events/${f.eventId}`
    );
    await expect(page.getByRole('region', { name: 'Up next' }).getByRole('link')).toHaveAttribute(
      'href',
      `/events/${ids[0]}`
    );
    await expect(
      page.getByRole('region', { name: 'Recent activity' }).getByRole('listitem')
    ).toHaveCount(25);
    await page.getByRole('link', { name: 'Older activity' }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Recent activity' }).getByRole('listitem')
    ).toHaveCount(2);
    await page.getByRole('link', { name: '30 days' }).click();
    await expect(page).toHaveURL(/activityDays=30$/);
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Older activity' }).click();
    await expect(page.getByText('Event activity recorded')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Newer activity' })).toHaveAttribute(
      'href',
      '/dashboard?activityDays=30&page=0'
    );
    await page.goto('/dashboard?activityDays=invalid&page=1e3');
    await expect(page.getByRole('link', { name: '7 days' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    for (const state of ['Active', 'Paused', 'Finished']) {
      ownerUpdate('booth_runs', f.runId, { state });
      await page.reload();
      await expect(page.getByText(`Booth ${state}`, { exact: true })).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      expect(
        (await f.local.service.from('admin_profiles').update({ theme }).eq('id', f.adminUser.id))
          .error
      ).toBeNull();
      await page.reload();
      await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', theme);
      expect(
        await page
          .locator('.admin-shell')
          .evaluate((element) => getComputedStyle(element).fontFamily)
      ).toMatch(/manrope/i);
      await expect(page.locator('.admin-shell')).toHaveCSS(
        'background-color',
        theme === 'light' ? 'rgb(247, 244, 238)' : 'rgb(32, 39, 34)'
      );
      const colors = await page.locator('.admin-shell').evaluate((element) => {
        const probe = document.createElement('span');
        element.appendChild(probe);
        const names = [
          'text',
          'text-muted',
          'canvas',
          'surface',
          'primary',
          'on-primary',
          'focus',
          'border',
          'surface-muted',
          'primary-on-muted',
        ];
        const colors = Object.fromEntries(
          names.map((name) => {
            probe.style.color = `var(--color-${name})`;
            return [name, getComputedStyle(probe).color];
          })
        );
        probe.remove();
        return colors;
      });
      for (const [foreground, background, minimum] of [
        ['text', 'canvas', 4.5],
        ['text-muted', 'surface', 4.5],
        ['text-muted', 'canvas', 4.5],
        ['primary-on-muted', 'surface-muted', 4.5],
        ['on-primary', 'primary', 4.5],
        ['focus', 'canvas', 3],
        ['border', 'surface', 3],
      ] as const)
        expect(
          contrast(colors[foreground], colors[background]),
          `${theme}: ${foreground} on ${background}`
        ).toBeGreaterThanOrEqual(minimum);
      for (const viewport of [
        { width: 1440, height: 1024 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => document.fonts.ready);
        await expect
          .poll(() =>
            page.evaluate(() =>
              [...document.fonts]
                .filter((font) => /manrope/i.test(font.family))
                .map((font) => ({ family: font.family, status: font.status }))
            )
          )
          .toEqual(expect.arrayContaining([expect.objectContaining({ status: 'loaded' })]));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.getByRole('link', { name: '7 days' }).focus();
        await expect(page.getByRole('link', { name: '7 days' })).toBeFocused();
        await expect(page.getByRole('link', { name: '7 days' })).toHaveCSS(
          'outline-style',
          'solid'
        );
        await page.screenshot({
          path: info.outputPath(`dashboard-${theme}-${viewport.width}.png`),
          fullPage: true,
        });
      }
    }
    await page.getByRole('link', { name: 'Open Live Event' }).focus();
    await expect(page.getByRole('link', { name: 'Open Live Event' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Open Live Event' })).toHaveCSS(
      'outline-color',
      'rgb(32, 39, 34)'
    );
    await page.setViewportSize({ width: 720, height: 1024 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.getByRole('link', { name: '7 days' }).focus();
    await expect(page.getByRole('link', { name: '7 days' })).toBeFocused();
    await page.screenshot({ path: info.outputPath('dashboard-dark-text-200.png'), fullPage: true });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 720, height: 512 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await writeFile(faultFile, 'test outage');
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Unable to load Dashboard'
    );
    await expect(page.getByRole('region', { name: 'Monthly Events' })).toHaveCount(0);
    await rm(faultFile, { force: true });
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page.getByRole('region', { name: 'Monthly Events' })).toBeVisible();
    await page.getByRole('link', { name: 'Open Live Event' }).click();
    await expect(page).toHaveURL(`/events/${f.eventId}`);
    await expect(page.getByRole('heading', { name: 'Live celebration' })).toBeVisible();
  } finally {
    await rm(faultFile, { force: true });
    try {
      cleanupEvents(ids);
    } finally {
      await f.dispose();
    }
  }
});

function contrast(a: string, b: string) {
  const luminance = (rgb: string) => {
    const channels = rgb
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
