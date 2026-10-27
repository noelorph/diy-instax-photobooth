import { test, expect, type Page } from '@playwright/test';
import { cleanupEvents, localOwnerSql } from '../fixtures/local-supabase';
import { createPackageBrowserFixture } from '../fixtures/package-browser';

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
}
for (const width of [390, 1440]) {
  test(`create, list, view and edit Drafts by keyboard at ${width}px with supplemental CSS scaling`, async ({
    page,
    context,
    browser,
  }, testInfo) => {
    const fixture = await createPackageBrowserFixture();
    const local = fixture.local;
    const admin = fixture.adminUser;
    const title = `Draft browser ${admin.id}`;
    let eventId: string | undefined;
    try {
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
      const clientEmail = page.getByLabel('Client email').filter({ visible: true });
      const emailError = page
        .getByText('Enter a valid Client email.', { exact: true })
        .filter({ visible: true });
      await clientEmail.fill('invalid');
      await page.getByRole('button', { name: 'Save Draft' }).click();
      await expect(emailError).toBeVisible();
      await expect(clientEmail).toHaveAttribute('aria-invalid', 'true');
      await clientEmail.fill('still-invalid');
      await expect(emailError).toBeVisible();
      await expect(clientEmail).toHaveAttribute('aria-invalid', 'true');
      await clientEmail.fill('alex@example.test');
      await expect(emailError).toHaveCount(0);
      await expect(clientEmail).toHaveAttribute('aria-invalid', 'false');
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
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
      await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const deletion = page.getByRole('button', { name: 'Delete Draft', exact: true });
      await expect(deletion).toBeVisible();
      await deletion.click();
      await expect(page.getByRole('dialog')).toContainText('Event Media');
      await page.getByRole('button', { name: 'Keep Draft' }).click();
      await expect(deletion).toBeFocused();
      const removedAction = await page.request.post(`/api/admin/events/${eventId}/redact-client`, {
        data: {},
      });
      expect([404, 405]).toContain(removedAction.status());
      await page.getByRole('button', { name: 'Edit Draft' }).click();
      await expect(page.getByLabel('Event name').filter({ visible: true })).toHaveValue(title);
      if (width === 390) {
        const staticContext = await browser.newContext({
          javaScriptEnabled: false,
          storageState: await context.storageState(),
        });
        try {
          const staticPage = await staticContext.newPage();
          await staticPage.goto(`/events/${eventId}`);
          await expect(
            staticPage.getByRole('heading', { name: title, exact: true, includeHidden: true })
          ).toHaveText(title);
          await expect(staticPage.getByLabel('Event name')).toHaveCount(0);
          await expect(
            staticPage.getByRole('button', { name: 'Edit Draft', includeHidden: true })
          ).toBeDisabled();
        } finally {
          await staticContext.close();
        }
      }
      await expect(page.getByLabel('Scheduled start').filter({ visible: true })).toHaveValue(
        '2025-01-10T18:00'
      );
      await expect(page.getByLabel('Total booked prints').filter({ visible: true })).toHaveText(
        '0'
      );
      await expect(page.getByLabel('Original Print Allowance')).toHaveCount(0);
      await expect(
        page.getByText('Draft', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      for (const name of ['Add Film Stock', 'Test Print'])
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      await expect(
        page
          .getByText('Add at least one Film Package before starting Booth Mode.', { exact: true })
          .filter({ visible: true })
      ).toBeVisible();
      await expect(
        page
          .getByRole('button', { name: 'Start Booth Mode', exact: true })
          .and(page.locator(':enabled'))
      ).toHaveCount(0);
      const stale = await context.newPage();
      await stale.goto(`/events/${eventId}`);
      await stale.getByRole('button', { name: 'Edit Draft' }).click();
      await expect(stale.getByLabel('Event name').filter({ visible: true })).toHaveValue(title);
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
      await page.getByRole('button', { name: 'Save Draft' }).click();
      await expect(
        page.getByText('Draft saved.', { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'Edit Draft' }).click();
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
      await stale.getByRole('button', { name: 'Edit Draft' }).click();
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
          .getByRole('table')
          .locator('caption')
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
      if (eventId) await cleanupEvents([eventId]);
      else {
        const found = await local.service.from('events').select('id').eq('title', title);
        cleanupEvents((found.data ?? []).map((row) => row.id));
      }
      await fixture.dispose();
    }
  });
}

test('recovers the real committed creation after its server-action response is lost and the page reloads', async ({
  page,
}) => {
  const fixture = await createPackageBrowserFixture();
  const title = `Lost creation ${fixture.adminUser.id}`;
  let eventId: string | undefined;
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(fixture.adminUser.email);
    await page.getByLabel('Password', { exact: true }).fill(fixture.adminUser.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/events/new');
    await fillBooking(page, title);
    await page.getByLabel('Booked Film Packages').fill('2');
    let dropped = false;
    await page.route('**/events/new', async (route) => {
      if (
        dropped ||
        route.request().method() !== 'POST' ||
        !route.request().headers()['next-action']
      )
        return route.continue();
      dropped = true;
      const response = await route.fetch({ maxRetries: 0 });
      expect(response.ok()).toBe(true);
      const found = await fixture.local.service
        .from('events')
        .select('id')
        .eq('title', title)
        .single();
      expect(found.error).toBeNull();
      eventId = found.data!.id;
      expect(
        localOwnerSql(
          `select count(*)::int as count from public.operation_receipts where event_id='${eventId}' and operation_kind='create_draft'`
        )[0].count
      ).toBe(1);
      // The real action has committed. Only its response is discarded.
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be confirmed');
    await expect(page.getByLabel('Event name')).toBeDisabled();
    expect(eventId).toBeTruthy();
    const metadata = await page.evaluate(
      (actor) => JSON.parse(sessionStorage.getItem(`draft-creation:${actor}`)!),
      fixture.adminUser.id
    );
    expect(metadata).toEqual({
      operationId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    // Another editor changes the committed Draft before receipt recovery.
    const changed = await fixture.adminClient
      .from('events')
      .update({ title: `${title} current`, revision: 2 })
      .eq('id', eventId!);
    expect(changed.error).toBeNull();
    await page.reload();
    await expect(page.getByLabel('Event name')).toBeDisabled();
    await page.getByRole('button', { name: 'Recover Draft' }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `${title} current`, exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit Draft' }).click();
    await expect(page.getByLabel('Event name')).toHaveValue(`${title} current`);
    await expect(page.getByText('Revision 2')).toBeVisible();
    await page.getByLabel('Event name').fill(`${title} later edit`);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByText('Revision 3')).toBeVisible();
    const rows = await fixture.local.service
      .from('events')
      .select('id,title,revision')
      .in('title', [title, `${title} current`, `${title} later edit`]);
    expect(rows.data).toEqual([{ id: eventId, title: `${title} later edit`, revision: 3 }]);
    expect(
      localOwnerSql(`select operation_kind from public.activity_events where event_id='${eventId}'`)
        .map((row) => row.operation_kind)
        .sort()
    ).toEqual(['create_draft', 'update_draft', 'update_draft']);
    expect(
      localOwnerSql(
        `select count(*)::int as count from public.operation_receipts where event_id='${eventId}' and operation_kind='create_draft'`
      )[0].count
    ).toBe(1);
    expect(
      await page.evaluate(
        (actor) => sessionStorage.getItem(`draft-creation:${actor}`),
        fixture.adminUser.id
      )
    ).toBeNull();
    const staleReview = await page.request.post(
      `/api/admin/events/${eventId}/review-draft-booking`,
      { data: { operationId: crypto.randomUUID(), expectedRevision: 3, acknowledgedPackages: 2 } }
    );
    expect([404, 405]).toContain(staleReview.status());
    expect(
      (await fixture.local.service.from('events').select('revision').eq('id', eventId!).single())
        .data?.revision
    ).toBe(3);
  } finally {
    if (eventId) cleanupEvents([eventId]);
    else {
      const found = await fixture.local.service.from('events').select('id').eq('title', title);
      cleanupEvents((found.data ?? []).map((row) => row.id));
    }
    await fixture.dispose();
  }
});
