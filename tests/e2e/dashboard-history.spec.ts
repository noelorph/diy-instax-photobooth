import { writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { cleanupEvents, localOwnerSql, ownerInsert, ownerUpdate } from '../fixtures/local-supabase';
import { createPackageBrowserFixture } from '../fixtures/package-browser';

test('Dashboard monthly Events includes Draft Live Completed and excludes Cancelled; Live run states, activity controls and responsive themes', async ({
  page,
}, info) => {
  info.setTimeout(120000);
  const f = await createPackageBrowserFixture();
  const faultFile = resolve('test-results/events-read-fault');
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const now = new Date();
  // Keep the venue month stable throughout this two-minute real-clock test.
  const timeZone = now.getUTCHours() === 23 ? 'Pacific/Honolulu' : 'UTC';
  const upcomingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 15, 12));
  const start = now.toISOString();
  const end = new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
  try {
    f.seedRun('Active');
    ownerUpdate('events', f.eventId, {
      revision: 3,
      title: 'Live celebration',
      time_zone: timeZone,
      starts_at: start,
      ends_at: end,
      film_package_count: 5,
    });
    ownerInsert(
      'events',
      ids.map((id, index) => ({
        id,
        accounting_version: 2,
        state: ['Draft', 'Completed', 'Cancelled', 'Draft'][index],
        title: [
          'Draft celebration',
          'Past celebration',
          'Cancelled celebration',
          'Next celebration',
        ][index],
        client_name: 'Client',
        client_email: 'private@example.test',
        client_phone: '123',
        starts_at: index === 3 ? upcomingStart.toISOString() : start,
        ends_at:
          index === 3 ? new Date(upcomingStart.getTime() + 4 * 60 * 60_000).toISOString() : end,
        time_zone: timeZone,
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
    ).toHaveText('4');
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
      `/events/${ids[3]}`
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
    const dashboardResponse = await page.goto('/dashboard?activityDays=invalid&page=1e3');
    expect(dashboardResponse!.headers()['cache-control']).toContain('private');
    expect(dashboardResponse!.headers()['cache-control']).toContain('no-store');
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
    await expect(
      page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Events', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(
      page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Events', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
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

test('History filters retain immutable package records and honest terminal media across direct URLs and responsive themes', async ({
  page,
}, info) => {
  info.setTimeout(120000);
  const f = await createPackageBrowserFixture();
  const [cancelledId, deletedId, legacyId, draftId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const faultFile = resolve('test-results/events-read-fault');
  try {
    f.seedRun('Finished');
    ownerUpdate('events', f.eventId, {
      revision: 3,
      film_package_count: 3,
      title: 'The autumn supper',
    });
    ownerInsert('additional_film_package_entries', {
      event_id: f.eventId,
      packages: 2,
      client_request_note: 'Client requested two packages',
      actor_id: f.adminUser.id,
      operation_key: randomUUID(),
    });
    localOwnerSql(`insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at) select gen_random_uuid(),'${f.eventId}','${f.runId}',2,'Printed',now() from generate_series(1,13);
      insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select gen_random_uuid(),event_id,run_id,id,2,now(),gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}';
      insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) select event_id,run_id,session_id,id,2,'Guest','Printed',gen_random_uuid(),gen_random_uuid() from public.captures where event_id='${f.eventId}';
      insert into public.print_attempt_events(attempt_id,accounting_version,actor_scope,state,evidence_kind,evidence_policy_version,reason) select id,2,'admin:fixture','Diagnostic','inspection','simulator-v1','Sheet fully ejected but image unusable' from public.print_attempts where event_id='${f.eventId}' limit 1;
      insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) select event_id,run_id,id,2,now()+interval '1 second',gen_random_uuid() from public.guest_sessions where event_id='${f.eventId}' limit 1;
      insert into public.activity_events(event_id,accounting_version,actor_scope,operation_kind,created_at) select '${f.eventId}',2,'admin:fixture','observe','2026-01-01T10:00:00Z' from generate_series(1,27);`);
    ownerUpdate('events', f.eventId, { state: 'Completed', revision: 4 });
    for (const [id, state, version, title] of [
      [cancelledId, 'Cancelled', 2, 'Sunday gathering'],
      [deletedId, 'Draft', 2, 'Secret deleted booking'],
      [legacyId, 'Completed', 1, 'Legacy record'],
      [draftId, 'Draft', 2, 'Upcoming gathering'],
    ] as const) {
      ownerInsert('events', {
        id,
        state,
        accounting_version: version,
        title,
        client_name: 'Retained client',
        client_email: 'retained@example.test',
        client_phone: '123',
        venue_address: 'The Glasshouse',
        time_zone: 'Asia/Manila',
        starts_at: '2026-10-29T10:00:00Z',
        ends_at: '2026-10-29T14:00:00Z',
        film_package_count: 2,
        ...(version === 1 ? { original_print_allowance: 17 } : {}),
      });
    }
    const assetId = randomUUID();
    ownerInsert('event_media_assets', {
      id: assetId,
      event_id: f.eventId,
      kind: 'background',
      state: 'attached',
      path: `${f.eventId}/${assetId}`,
      uploaded_by: f.adminUser.id,
      content_type: 'image/jpeg',
      byte_length: 123,
    });
    const pendingAsset = randomUUID();
    ownerInsert('event_media_assets', {
      id: pendingAsset,
      event_id: deletedId,
      kind: 'background',
      state: 'uploading',
      path: `${deletedId}/${pendingAsset}`,
      uploaded_by: f.adminUser.id,
    });
    expect(
      (await f.admin('begin_delete_draft', { eventId: deletedId, expectedRevision: 1 })).error
    ).toBeNull();
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
    await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    const historyResponse = await page.goto('/history');
    expect(historyResponse!.headers()['cache-control']).toContain('private');
    expect(historyResponse!.headers()['cache-control']).toContain('no-store');
    await expect(
      page.getByRole('list', { name: 'Retained Events' }).getByRole('listitem')
    ).toHaveCount(2);
    await expect(page.getByText('13 of 50 prints confirmed')).toBeVisible();
    await expect(page.getByText('3 original Film Packages · 2 additional')).toBeVisible();
    await expect(page.getByText('Secret deleted booking')).toHaveCount(0);
    await expect(page.getByText('Legacy record')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry media removal' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry media removal' }).click();
    await expect(page.getByRole('status')).toContainText('Media removal still pending');
    await page.getByRole('link', { name: 'Completed', exact: true }).click();
    await expect(page).toHaveURL(/state=Completed$/);
    await page.reload();
    await expect(page.getByRole('link', { name: 'The autumn supper' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sunday gathering' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Cancelled', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sunday gathering' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'The autumn supper' })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/state=Completed$/);
    await expect(page.getByRole('link', { name: 'Completed', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await page.goto('/history?state=Live');
    await expect(page.getByRole('link', { name: 'All History' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await page.getByRole('link', { name: 'The autumn supper' }).click();
    await expect(page).toHaveURL(`/events/${f.eventId}`);
    await expect(
      page.getByRole('heading', { name: 'The autumn supper', exact: true })
    ).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Admin' });
    await expect(navigation.getByRole('link', { name: 'History', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(navigation.getByRole('link', { name: 'Events', exact: true })).not.toHaveAttribute(
      'aria-current'
    );
    const terminalResponse = await page.reload();
    expect(terminalResponse!.headers()['cache-control']).toContain('private');
    expect(terminalResponse!.headers()['cache-control']).toContain('no-store');
    await expect(navigation.getByRole('link', { name: 'History', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await navigation.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page).toHaveURL('/events');
    await page.getByRole('link', { name: 'Upcoming gathering', exact: true }).click();
    await expect(page).toHaveURL(`/events/${draftId}`);
    await expect(navigation.getByRole('link', { name: 'Events', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('button', { name: 'Edit Draft', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/events');
    await page.goBack();
    await expect(page).toHaveURL(`/events/${f.eventId}`);
    await expect(navigation.getByRole('link', { name: 'History', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      page.getByRole('region', { name: 'Total booked prints' }).locator('strong')
    ).toHaveText('50');
    await expect(
      page.getByRole('region', { name: 'Confirmed Prints' }).locator('strong')
    ).toHaveText('13');
    await expect(
      page.getByRole('region', { name: 'Captures', exact: true }).locator('strong')
    ).toHaveText('14');
    await expect(page.getByText('Includes Retakes')).toBeVisible();
    await expect(page.getByText('package@example.test', { exact: true })).toBeVisible();
    await expect(page.getByText('Asia/Manila', { exact: true })).toBeVisible();
    await expect(page.getByText('No pending attempts')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Event activity' }).getByRole('listitem')
    ).toHaveCount(25);
    await page.getByRole('link', { name: 'Older activity' }).click();
    await expect(
      page.getByRole('region', { name: 'Event activity' }).getByRole('listitem')
    ).toHaveCount(2);
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await page.goto(`/events/${f.eventId}?activityPage=1e3&attemptPage=2`);
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Event Media' })).toContainText(
      '1 retained Event Media attachment. Preview unavailable.'
    );
    await expect(page.getByRole('region', { name: 'Event Media' })).toContainText(
      'Media uploads are temporarily unavailable.'
    );
    await expect(page.getByRole('region', { name: 'Event Media' })).toContainText(
      'Before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover files.'
    );
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    for (const endpoint of ['film-packages', 'complete', 'cancel', 'delete-draft']) {
      const response = await page.request.post(`/api/admin/events/${f.eventId}/${endpoint}`, {
        headers: { origin: 'http://127.0.0.1:1437', 'x-package-admin-id': f.adminUser.id },
        data: {
          operationId: randomUUID(),
          ...(endpoint === 'film-packages'
            ? { packages: 1, clientRequestNote: 'Denied terminal mutation' }
            : { expectedRevision: 4 }),
        },
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'invalid_transition' });
    }
    for (const theme of ['light', 'dark']) {
      expect(
        (await f.local.service.from('admin_profiles').update({ theme }).eq('id', f.adminUser.id))
          .error
      ).toBeNull();
      for (const route of ['/history', `/events/${f.eventId}`]) {
        await page.goto(route);
        for (const viewport of [
          { width: 1440, height: 1024 },
          { width: 768, height: 1024 },
          { width: 390, height: 844 },
          { width: 844, height: 390 },
        ]) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => document.fonts.ready);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          const link = page.getByRole('link', {
            name: route === '/history' ? 'Completed' : 'Back to History',
            exact: true,
          });
          await link.focus();
          await expect(link).toBeFocused();
          await expect(link).toHaveCSS('outline-style', 'solid');
          const pairs = await page
            .locator('[data-state], [aria-label="Event Media"]')
            .evaluateAll((elements) =>
              elements.map((element) => {
                const style = getComputedStyle(element);
                return [style.color, style.backgroundColor];
              })
            );
          for (const [foreground, background] of pairs)
            expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
          await page.screenshot({
            path: info.outputPath(
              `history-${route === '/history' ? 'list' : 'detail'}-${theme}-${viewport.width}.png`
            ),
            fullPage: true,
          });
        }
      }
    }
    await page.setViewportSize({ width: 720, height: 1024 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    const bookedBox = await page.getByRole('region', { name: 'Total booked prints' }).boundingBox();
    const printedBox = await page.getByRole('region', { name: 'Confirmed Prints' }).boundingBox();
    expect(printedBox!.y).toBeGreaterThanOrEqual(bookedBox!.y + bookedBox!.height);
    await page.screenshot({
      path: info.outputPath('history-detail-dark-text-200.png'),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/events/${cancelledId}`);
    await expect(page.getByRole('heading', { name: 'Sunday gathering' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'History', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByText('No Event Media attached.', { exact: true })).toBeVisible();
    await expect(page.getByText(/default Booth presentation was used/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Event Media' })).toContainText(
      'No Event Media attached.'
    );
    await expect(page.getByRole('region', { name: 'Event Media' })).toContainText(
      'Before re-enabling uploads'
    );
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    localOwnerSql('revoke select on public.event_media_assets from authenticated');
    try {
      await page.reload();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Unable to load Events'
      );
      await expect(page.getByText(/No Event Media attached/)).toHaveCount(0);
    } finally {
      localOwnerSql('grant select on public.event_media_assets to authenticated');
    }
    await writeFile(faultFile, 'test outage');
    await page.goto('/history');
    await expect(page.getByRole('main').getByRole('alert').first()).toContainText(
      'Unable to load Events'
    );
    await expect(page.getByText(/No completed or cancelled Events yet/)).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('history-error-dark.png'), fullPage: true });
    await rm(faultFile, { force: true });
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page.getByRole('list', { name: 'Retained Events' })).toBeVisible();
    cleanupEvents([cancelledId]);
    await page.goto('/history?state=Cancelled');
    await expect(page.getByText('No cancelled Events yet.')).toBeVisible();
    await page.screenshot({ path: info.outputPath('history-empty-dark.png'), fullPage: true });
    await f.adminClient.auth.signOut({ scope: 'global' });
    await page.goto(`/events/${f.eventId}`);
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByText('package@example.test')).toHaveCount(0);
    await page.goto('/history');
    await expect(page).toHaveURL(/sign-in/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByText('Upcoming gathering')).toHaveCount(0);
  } finally {
    await rm(faultFile, { force: true });
    try {
      cleanupEvents([cancelledId, deletedId, legacyId, draftId]);
    } finally {
      await f.dispose();
    }
  }
});
