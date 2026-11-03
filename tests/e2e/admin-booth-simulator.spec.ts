import { expect, test, type Page, type Browser } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
import { localOwnerSql, ownerUpdate } from '../fixtures/local-supabase';
type Fixture = Awaited<ReturnType<typeof createPackageBrowserFixture>>;
async function signIn(page: Page, f: Fixture) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
  await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
}
async function devices(browser: Browser, f: Fixture) {
  const boothContext = await browser.newContext();
  let phoneContext: Awaited<ReturnType<Browser['newContext']>> | undefined;
  try {
    phoneContext = await browser.newContext();
    const boothPage = await boothContext.newPage(),
      phonePage = await phoneContext.newPage();
    await signIn(boothPage, f);
    await signIn(phonePage, f);
    return {
      boothPage,
      phonePage,
      async close() {
        try {
          await boothPage.unrouteAll({ behavior: 'ignoreErrors' });
          await boothContext.close();
        } finally {
          await phoneContext!.close();
        }
      },
    };
  } catch (error) {
    try {
      await phoneContext?.close();
    } finally {
      await boothContext.close();
    }
    throw error;
  }
}
async function prepare(page: Page, f: Fixture) {
  await page.goto(`/events/${f.eventId}`);
  await page.getByRole('button', { name: 'Enable Camera', exact: true }).click();
  await page.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
  for (const label of [
    'Film is physically loaded',
    'Continuous printer power is connected',
    'Guided Access is ready',
  ])
    await page.getByRole('checkbox', { name: label }).check();
  await expect(page.getByRole('button', { name: 'Start Booth Mode', exact: true })).toBeEnabled();
}
async function readyAfterArrival(page: Page) {
  await expect(page).toHaveURL(/\/booth$/, { timeout: 20_000 });
  const camera = page.getByRole('button', { name: 'Enable Camera', exact: true });
  const printer = page.getByRole('button', { name: 'Connect to Instax', exact: true });
  await expect(
    page.getByRole('heading', { name: 'Make a memory' }).or(camera).or(printer).first()
  ).toBeVisible();
  if (await camera.isVisible()) await camera.click();
  if (await printer.isVisible()) await printer.click();
  await expect(page.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
}
async function read(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const r = await fetch(path);
    return { status: r.status, body: await r.json() };
  }, path);
}
async function admit(page: Page) {
  return page.evaluate(async () => {
    const state = await (await fetch('/api/booth/state')).json();
    const response = await fetch('/api/booth/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: crypto.randomUUID(), expectedRevision: state.revision }),
    });
    return { status: response.status, body: await response.json() };
  });
}

test('denied setup checks stop polling and recover only after an explicit recheck', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    const d = await devices(browser, f);
    try {
      let denied = true;
      let rejectedRequests = 0;
      await d.boothPage.route('**/booth/setup-readiness?*', (route) =>
        route.continue({
          headers: {
            ...route.request().headers(),
            ...(denied ? { 'x-package-admin-id': crypto.randomUUID() } : {}),
          },
        })
      );
      d.boothPage.on('response', (response) => {
        if (response.url().includes('/booth/setup-readiness?') && response.status() === 403)
          rejectedRequests++;
      });
      await d.boothPage.goto(`/events/${f.eventId}`);
      const setup = d.boothPage.getByRole('region', { name: 'Booth setup' });
      await setup.getByRole('button', { name: 'Enable Camera', exact: true }).click();
      await expect(setup.getByRole('alert')).toContainText('Sign in again as Admin');
      await expect(
        setup.getByRole('button', { name: 'Start Booth Mode', exact: true })
      ).toBeDisabled();
      await d.boothPage.waitForTimeout(4500);
      expect(rejectedRequests).toBe(1);
      denied = false;
      await setup.getByRole('button', { name: 'Retry setup checks', exact: true }).click();
      await expect(setup.getByRole('alert')).toHaveCount(0);
      await expect(setup.getByText('10 prints available', { exact: true })).toBeVisible();
      await expect(
        setup.getByRole('button', { name: 'Start Booth Mode', exact: true })
      ).toBeDisabled();
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

test('setup handoff reestablishes scoped readiness before Guest admission', async ({ browser }) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      await prepare(d.boothPage, f);
      let scopedReports = 0;
      d.boothPage.on('response', (response) => {
        if (response.url().endsWith('/api/booth/readiness') && response.ok()) scopedReports++;
      });
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      await readyAfterArrival(d.boothPage);
      await expect.poll(() => scopedReports).toBeGreaterThan(0);
      expect(
        await d.boothPage
          .getByLabel('Mirrored camera preview')
          .evaluate(
            (v: HTMLVideoElement) =>
              v.videoWidth > 0 && v.videoHeight > 0 && (v.srcObject as MediaStream)?.active
          )
      ).toBe(true);
      const state = await read(d.boothPage, '/api/booth/state');
      expect(state.status).toBe(200);
      expect(state.body.allowedActions.startGuest).toBe(true);
      expect((await read(d.boothPage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
        401
      );
      expect((await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
        200
      );
      const run = await f.local.service
        .from('booth_runs')
        .select('state,printer_id,connection_generation,readiness_observation')
        .eq('event_id', f.eventId)
        .single();
      expect(run.data?.state).toBe('Active');
      expect(run.data?.printer_id).toBe('simulator');
      expect(run.data?.connection_generation).toBe(2);
      expect(run.data?.readiness_observation.cameraLive).toBe(true);
      const grants = await f.local.service
        .from('booth_grants')
        .select('state')
        .eq('event_id', f.eventId);
      expect(grants.data?.map((g) => g.state)).toEqual(['Active']);
      const countsBeforeReload = state.body.counts;
      const reportsBeforeReload = scopedReports;
      await d.boothPage.reload();
      await expect(d.boothPage.getByRole('button', { name: 'Connect to Instax' })).toBeVisible();
      await expect.poll(() => scopedReports).toBeGreaterThan(reportsBeforeReload);
      expect(
        (
          await f.local.service
            .from('booth_runs')
            .select('readiness_observation')
            .eq('event_id', f.eventId)
            .single()
        ).data?.readiness_observation.printerConnected
      ).toBe(false);
      await expect
        .poll(
          async () => (await read(d.boothPage, '/api/booth/state')).body.allowedActions.startGuest
        )
        .toBe(false);
      expect((await admit(d.boothPage)).status).toBe(409);
      expect(
        (await f.local.service.from('guest_sessions').select('id').eq('event_id', f.eventId)).data
      ).toEqual([]);
      await readyAfterArrival(d.boothPage);
      await expect.poll(() => scopedReports).toBeGreaterThan(reportsBeforeReload);
      const reconnected = await f.local.service
        .from('booth_runs')
        .select('connection_generation,readiness_observation')
        .eq('event_id', f.eventId)
        .single();
      expect(reconnected.data?.connection_generation).toBe(3);
      expect(reconnected.data?.readiness_observation.cameraLive).toBe(true);
      const refreshed = (await read(d.boothPage, '/api/booth/state')).body;
      expect(refreshed.allowedActions.startGuest).toBe(true);
      expect(refreshed.counts).toEqual(countsBeforeReload);
      expect((await admit(d.boothPage)).status).toBe(200);
      expect(
        (await f.local.service.from('guest_sessions').select('id').eq('event_id', f.eventId)).data
      ).toHaveLength(1);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});
test('final booked unit sends once and counts only acknowledged simulator ejection', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    localOwnerSql(
      `update public.events set film_package_count=5,revision=revision+1 where id='${f.eventId}'`
    );
    const d = await devices(browser, f);
    try {
      await prepare(d.boothPage, f);
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      await readyAfterArrival(d.boothPage);
      const { runId } = (await read(d.boothPage, '/api/booth/state')).body;
      localOwnerSql(`do $$ declare sid uuid; cid uuid; begin
        for i in 1..49 loop
          sid:=gen_random_uuid(); cid:=gen_random_uuid();
          insert into public.guest_sessions(id,event_id,run_id,accounting_version,state,closed_at)
            values(sid,'${f.eventId}','${runId}',2,'Printed',clock_timestamp());
          insert into public.captures(id,event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id)
            values(cid,'${f.eventId}','${runId}',sid,2,clock_timestamp(),gen_random_uuid());
          insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id)
            values('${f.eventId}','${runId}',sid,cid,2,'Guest','Printed',gen_random_uuid(),gen_random_uuid());
        end loop;
      end $$`);
      await d.boothPage.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect
        .poll(async () => (await read(d.boothPage, '/api/booth/state')).body.counts.printsAvailable)
        .toBe(1);
      await d.boothPage.getByRole('button', { name: 'Start', exact: true }).click();
      await d.boothPage.getByRole('button', { name: 'Take Photo' }).click();
      await expect(d.boothPage.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
      const dispatched = d.boothPage.waitForResponse((response) =>
        response.url().endsWith('/dispatch')
      );
      await d.boothPage.getByRole('button', { name: 'Print', exact: true }).click();
      const dispatch = await (await dispatched).json();
      expect(dispatch.sendAllowed).toBe(true);
      await expect(
        d.boothPage.getByRole('heading', { name: 'Preparing your print' })
      ).toBeVisible();
      expect((await read(d.boothPage, '/api/booth/state')).body.counts).toMatchObject({
        printed: 49,
        unresolved: 1,
        printsAvailable: 0,
      });
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.print_attempts where run_id='${runId}'`
        )[0].n
      ).toBe(50);
      await d.boothPage.waitForTimeout(500);
      await expect(d.boothPage.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
      const observed = d.boothPage.waitForResponse((response) =>
        response.url().endsWith('/observations')
      );
      await d.boothPage.evaluate((authorization) => {
        (
          window as typeof window & { __boothSimulatorEject: (value: typeof authorization) => void }
        ).__boothSimulatorEject(authorization);
      }, dispatch.authorization);
      expect((await observed).status()).toBe(200);
      await expect(d.boothPage.getByRole('heading', { name: 'Print complete' })).toBeVisible();
      expect((await read(d.boothPage, '/api/booth/state')).body.counts).toMatchObject({
        printed: 50,
        unresolved: 0,
        printsAvailable: 0,
      });
      await d.boothPage.evaluate(() => {
        (window as typeof window & { __boothSimulatorReady: () => void }).__boothSimulatorReady();
      });
      await expect(
        d.boothPage.getByRole('heading', { name: 'All booked prints have been used.' })
      ).toBeVisible({ timeout: 10_000 });
      await expect(d.boothPage.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});
test('zero packages and incomplete physical setup cannot prepare a run', async ({ browser }) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      ownerUpdate('events', f.eventId, { film_package_count: 0, revision: 2 });
      await d.boothPage.goto(`/events/${f.eventId}`);
      await d.boothPage.getByRole('button', { name: 'Enable Camera', exact: true }).click();
      await d.boothPage.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
      await expect(d.boothPage.getByRole('button', { name: 'Start Booth Mode' })).toBeDisabled();
      for (const label of [
        'Film is physically loaded',
        'Continuous printer power is connected',
        'Guided Access is ready',
      ])
        await d.boothPage.getByRole('checkbox', { name: label }).check();
      await d.boothPage.waitForResponse(
        (r) => r.url().includes('/setup-readiness') && r.request().method() === 'POST'
      );
      await expect(d.boothPage.getByRole('button', { name: 'Start Booth Mode' })).toBeDisabled();
      expect(
        (await f.local.service.from('booth_runs').select('id').eq('event_id', f.eventId)).data
      ).toEqual([]);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});
test('lost confirmation reply recovers scoped state and phone authority', async ({ browser }) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      await prepare(d.boothPage, f);
      await d.boothPage.route('**/api/booth/handoff/confirm', async (route) => {
        await route.fetch();
        await route.abort();
      });
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode' }).click();
      await readyAfterArrival(d.boothPage);
      expect((await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
        200
      );
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});
for (const failure of ['issue', 'confirmation'] as const) {
  test(`${failure} commit loss with unavailable recovery hides protected Admin content`, async ({
    browser,
  }) => {
    const f = await createPackageBrowserFixture();
    try {
      localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
      const d = await devices(browser, f);
      try {
        await prepare(d.boothPage, f);
        let issues = 0;
        await d.boothPage.route('**/api/admin/booth-handoffs/*/issue', async (route) => {
          issues++;
          const response = await route.fetch();
          if (failure === 'issue') await route.abort();
          else await route.fulfill({ response });
        });
        if (failure === 'confirmation') {
          await d.boothPage.route('**/api/booth/handoff/confirm', async (route) => {
            await route.fetch();
            await route.abort();
          });
          await d.boothPage.route('**/api/booth/state', (route) => route.abort());
        }
        await d.boothPage.getByRole('button', { name: 'Start Booth Mode' }).click();
        const dialog = d.boothPage.getByRole('dialog', { name: 'Booth access needs recovery' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Do not start another run');
        await expect(dialog.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
          'href',
          '/sign-in?from=booth'
        );
        expect(
          await dialog.evaluate((el) => {
            const box = el.getBoundingClientRect();
            return {
              coversViewport:
                box.x === 0 &&
                box.y === 0 &&
                box.width === innerWidth &&
                box.height === innerHeight,
              background: getComputedStyle(el).backgroundColor,
            };
          })
        ).toEqual({ coversViewport: true, background: 'rgb(16, 27, 27)' });
        await expect(
          d.boothPage.getByRole('heading', { name: 'Package fixture', exact: true })
        ).toHaveCount(0);
        const accessible = await d.boothPage.locator('body').ariaSnapshot();
        expect(accessible).not.toContain('Package fixture');
        expect(accessible).not.toContain('package@example.test');
        expect(
          await dialog.evaluate((el) =>
            [
              [1, 1],
              [innerWidth / 2, innerHeight / 2],
              [innerWidth - 1, innerHeight - 1],
            ].every(([x, y]) => el.contains(document.elementFromPoint(x, y)))
          )
        ).toBe(true);
        await expect(d.boothPage.getByRole('button', { name: 'Start Booth Mode' })).toHaveCount(0);
        expect(issues).toBe(1);
        expect(
          (await f.local.service.from('booth_runs').select('id').eq('event_id', f.eventId)).data
        ).toHaveLength(1);
        expect((await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
          200
        );
      } finally {
        await d.close();
      }
    } finally {
      await f.dispose();
    }
  });
}
test('released setup resources and rejected arrival camera keep admission blocked until each is restored', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      await d.boothPage.context().addInitScript(() => {
        const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (constraints) =>
          sessionStorage.getItem('deny-arrival-camera') === 'true'
            ? Promise.reject(new DOMException('Denied by browser test', 'NotAllowedError'))
            : acquire(constraints);
      });
      await prepare(d.boothPage, f);
      await d.boothPage.evaluate(() => sessionStorage.setItem('deny-arrival-camera', 'true'));
      const confirmation = d.boothPage.waitForResponse((r) =>
        r.url().endsWith('/api/booth/handoff/confirm')
      );
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode' }).click();
      await confirmation;
      // Let the app's document navigation release setup resources without racing another goto.
      await d.boothPage.waitForURL('**/booth');
      await expect(d.boothPage.getByRole('button', { name: 'Connect to Instax' })).toBeVisible();
      await d.boothPage.getByRole('button', { name: 'Enable Camera' }).click();
      await expect(
        d.boothPage.getByRole('heading', { name: 'Bluetooth disconnected.' })
      ).toBeVisible();
      await expect
        .poll(
          async () => (await read(d.boothPage, '/api/booth/state')).body.allowedActions.startGuest,
          { timeout: 10_000 }
        )
        .toBe(false);
      expect((await admit(d.boothPage)).status).toBe(409);
      await d.boothPage.getByRole('button', { name: 'Connect to Instax' }).click();
      await expect(d.boothPage.getByRole('button', { name: 'Enable Camera' })).toBeVisible();
      expect((await admit(d.boothPage)).status).toBe(409);
      expect(
        (await f.local.service.from('guest_sessions').select('id').eq('event_id', f.eventId)).data
      ).toEqual([]);
      await d.boothPage.evaluate(() => sessionStorage.removeItem('deny-arrival-camera'));
      await d.boothPage.getByRole('button', { name: 'Enable Camera' }).click();
      await expect(d.boothPage.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
      expect((await admit(d.boothPage)).status).toBe(200);
      expect((await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
        200
      );
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});
test('wrong printer generation and stale setup observations cannot start Booth Mode', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      let lastReport: Record<string, unknown> | undefined;
      d.boothPage.on('request', (request) => {
        if (request.url().includes('/setup-readiness') && request.method() === 'POST')
          lastReport = request.postDataJSON();
      });
      await prepare(d.boothPage, f);
      expect(lastReport).toBeDefined();
      const state = await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`);
      const observed = lastReport!;
      await d.boothPage.route('**/setup-readiness*', (route) => route.abort());
      const start = async (generation: number) =>
        d.boothPage.evaluate(
          async ({ eventId, observed, revision, generation }) => {
            const result = await fetch(`/api/admin/events/${eventId}/booth/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                operationId: crypto.randomUUID(),
                expectedRevision: revision,
                readinessWindowId: observed.readinessWindowId,
                printerId: observed.printerId,
                connectionGeneration: generation,
              }),
            });
            return { status: result.status, body: await result.json() };
          },
          { eventId: f.eventId, observed, revision: state.body.revision, generation }
        );
      expect((await start(Number(observed.connectionGeneration) + 1)).status).toBe(409);
      await d.boothPage.waitForTimeout(5100);
      expect((await start(Number(observed.connectionGeneration))).status).toBe(409);
      expect(
        (await f.local.service.from('booth_runs').select('id').eq('event_id', f.eventId)).data
      ).toEqual([]);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});
test('a committed lost Start recovers its receipt and completes exactly one handoff', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      await prepare(d.boothPage, f);
      let starts = 0,
        receiptReads = 0;
      d.boothPage.on('response', (response) => {
        if (response.url().includes('/operations/') && response.ok()) receiptReads++;
      });
      await d.boothPage.route('**/booth/start', async (route) => {
        starts++;
        await route.fetch();
        await route.abort();
      });
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      await readyAfterArrival(d.boothPage);
      expect(starts).toBe(1);
      expect(receiptReads).toBe(1);
      const runs = await f.local.service
        .from('booth_runs')
        .select('state')
        .eq('event_id', f.eventId);
      expect(runs.data).toEqual([{ state: 'Active' }]);
      expect((await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
        200
      );
      expect((await admit(d.boothPage)).status).toBe(200);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

test('lost new-run Start and receipt failure retain original retry across Prepared polling and preserve counts', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Finished');
    seedOutcome(f, f.runId, 'Printed');
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      const before = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      await prepare(d.boothPage, f);
      const starts: string[] = [];
      await d.boothPage.route('**/booth/start', async (route) => {
        starts.push(route.request().postDataJSON().operationId);
        await route.fetch();
        await route.abort();
      });
      await d.boothPage.route('**/operations/*', (route) => route.abort());
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      const retry = d.boothPage.getByRole('button', {
        name: 'Retry Start Booth Mode',
        exact: true,
      });
      await expect(retry).toBeEnabled();
      await expect
        .poll(
          async () =>
            (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body.runState
        )
        .toBe('Prepared');
      const poll = d.boothPage.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `/events/${f.eventId}` && r.request().headers().rsc === '1'
      );
      await d.boothPage.evaluate(() => window.dispatchEvent(new Event('focus')));
      await poll;
      await expect(retry).toBeEnabled();
      await d.boothPage.unroute('**/operations/*');
      await d.boothPage.unroute('**/booth/start');
      await retry.click();
      await readyAfterArrival(d.boothPage);
      expect(starts).toHaveLength(1);
      const after = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      expect(after.runId).not.toBe(f.runId);
      expect(after.counts).toEqual(before.counts);
      expect(after.counts.printed).toBe(1);
      expect(
        (await f.local.service.from('booth_runs').select('state').eq('event_id', f.eventId)).data
      ).toEqual(expect.arrayContaining([{ state: 'Finished' }, { state: 'Active' }]));
      expect(
        (await f.local.service.from('booth_runs').select('id').eq('event_id', f.eventId)).data
      ).toHaveLength(2);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

async function holdReadiness(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(release, 30_000);
  let held = false;
  await page.route('**/api/booth/readiness', async (route) => {
    if (route.request().method() === 'POST') {
      held = true;
      await gate;
    }
    await route.continue();
  });
  await expect.poll(() => held).toBe(true);
  return async () => {
    clearTimeout(timer);
    release();
    await page.unrouteAll({ behavior: 'wait' });
  };
}

test('phone Pause, receipt recovery, Resume and pending Finish retain scoped safety', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      await prepare(d.boothPage, f);
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      await readyAfterArrival(d.boothPage);
      await d.phonePage.goto(`/events/${f.eventId}`);
      const original = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      const releasePauseReport = await holdReadiness(d.boothPage);
      let pauses = 0;
      await d.phonePage.route('**/booth/pause', async (route) => {
        pauses++;
        await route.fetch();
        await route.abort();
      });
      await d.phonePage.getByRole('button', { name: 'Pause Booth', exact: true }).click();
      await expect(d.phonePage.getByText(/Booth command outcome is unconfirmed/)).toBeVisible();
      await d.phonePage.getByRole('button', { name: 'Retry Booth command' }).click();
      await expect(
        d.phonePage.getByText('Booth command recorded. Refreshing current state.')
      ).toBeVisible();
      expect(pauses).toBe(1);
      await expect(d.boothPage.getByRole('heading', { name: 'Booth paused' })).toBeVisible();
      await expect(d.phonePage.getByRole('region', { name: 'Booth status' })).toContainText(
        'Only you can resume the booth from the phone.'
      );
      await expect(d.phonePage.getByLabel('Equipment status')).toContainText('Camera');
      await releasePauseReport();
      expect((await admit(d.boothPage)).status).toBe(409);
      expect((await read(d.boothPage, '/api/booth/state')).status).toBe(200);
      expect(
        localOwnerSql(`select state from public.booth_grants where event_id='${f.eventId}'`)[0]
          .state
      ).toBe('Active');
      await d.phonePage.getByRole('button', { name: 'Resume Booth', exact: true }).click();
      await expect(d.boothPage.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
      const current = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      expect(current.runId).toBe(original.runId);
      const sessionId = localOwnerSql(
        `insert into public.guest_sessions(event_id,run_id,accounting_version) values('${f.eventId}','${current.runId}',2) returning id`
      )[0].id;
      const captureId = localOwnerSql(
        `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${current.runId}','${sessionId}',2,clock_timestamp(),gen_random_uuid()) returning id`
      )[0].id;
      const attempt = localOwnerSql(
        `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${current.runId}','${sessionId}','${captureId}',2,'Guest','Pending',gen_random_uuid(),gen_random_uuid()) returning id,state`
      )[0];
      // Match the revision advance made by the real reservation/outcome operations.
      localOwnerSql(`update public.events set revision=revision+1 where id='${f.eventId}'`);
      await expect(d.phonePage.getByText('1 print pending', { exact: true })).toBeVisible();
      await expect(
        d.phonePage.getByRole('heading', { name: 'Booth running', exact: true })
      ).toBeVisible();
      const releaseFinishReport = await holdReadiness(d.boothPage);
      await d.phonePage.getByRole('button', { name: 'Finish Booth Mode', exact: true }).click();
      await d.phonePage
        .getByRole('button', { name: 'Confirm Finish Booth Mode', exact: true })
        .click();
      await expect(
        d.boothPage.getByRole('heading', { name: 'Finishing Booth Mode' })
      ).toBeVisible();
      await expect(d.boothPage.getByText(/A print outcome is pending/)).toBeVisible();
      await releaseFinishReport();
      expect((await admit(d.boothPage)).status).toBe(409);
      const state = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      expect(state.runId).toBe(original.runId);
      expect(state.runState).toBe('Finishing');
      expect(state.counts).toMatchObject({ printed: 0, unresolved: 1, printsAvailable: 9 });
      expect(
        localOwnerSql(`select state from public.print_attempts where id='${attempt.id}'`)[0].state
      ).toBe('Pending');
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.guest_sessions where event_id='${f.eventId}'`
        )[0].n
      ).toBe(1);
      await expect(
        d.phonePage.getByRole('button', { name: 'Complete Event', exact: true })
      ).toBeDisabled();
      await expect(
        d.phonePage.getByRole('button', { name: 'Cancel Event', exact: true })
      ).toBeDisabled();
      await expect(d.phonePage.getByRole('button', { name: 'Replace Booth access' })).toHaveCount(
        0
      );
      await expect(d.phonePage.getByRole('button', { name: 'Start Booth Mode' })).toHaveCount(0);
      await expect(d.phonePage.getByRole('button', { name: 'Resume Booth' })).toHaveCount(0);
      await expect(d.boothPage.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

async function reviewPhoneCommand(page: Page, action: 'finish' | 'complete', runId?: string) {
  let rejected: { operationId: string; expectedRevision: number } | undefined;
  const title = action === 'finish' ? 'Finish Booth Mode' : 'Complete Event';
  const endpoint = action === 'finish' ? '/booth/finish' : '/complete';
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: title, exact: true }).click();
    if (action === 'complete') await expect(page.getByRole('dialog')).toContainText('History');
    const response = page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: `Confirm ${title}`, exact: true }).click();
    const result = await response;
    const submitted = result.request().postDataJSON();
    if (action === 'finish') expect(submitted.runId).toBe(runId);
    else expect(submitted.runId).toBeUndefined();
    if (rejected) {
      expect(submitted.operationId).not.toBe(rejected.operationId);
      expect(submitted.expectedRevision).toBeGreaterThan(rejected.expectedRevision);
    }
    if (result.status() === 409) {
      rejected = submitted;
      console.log('Explicit stale command re-review:', action);
      expect((await result.json()).code).toBe('stale_revision');
      await expect(page.getByRole('dialog')).toContainText(
        'The Event changed. Review current state'
      );
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.reload();
      continue;
    }
    expect(result.status()).toBe(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    return;
  }
  throw new Error('State changed again after explicit re-review');
}
async function signInFromBooth(page: Page, f: Fixture) {
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(
    await page.locator('.public-auth').evaluate((el) => getComputedStyle(el).backgroundColor)
  ).toBe('rgb(16, 27, 27)');
  await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
  await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${f.eventId}$`));
}
function seedOutcome(f: Fixture, runId: string, state: 'Printed' | 'Pending') {
  const sessionId = localOwnerSql(
    `insert into public.guest_sessions(event_id,run_id,accounting_version,state,closed_at) values('${f.eventId}','${runId}',2,'Printed',clock_timestamp()) returning id`
  )[0].id;
  const captureId = localOwnerSql(
    `insert into public.captures(event_id,run_id,session_id,accounting_version,captured_at,shutter_operation_id) values('${f.eventId}','${runId}','${sessionId}',2,clock_timestamp(),gen_random_uuid()) returning id`
  )[0].id;
  return String(
    localOwnerSql(
      `insert into public.print_attempts(event_id,run_id,session_id,capture_id,accounting_version,kind,state,request_key,connection_id) values('${f.eventId}','${runId}','${sessionId}','${captureId}',2,'Guest','${state}',gen_random_uuid(),gen_random_uuid()) returning id`
    )[0].id
  );
}
test('protected replacement preserves the same Paused run and counts; phone Resume, new run and Complete remain explicit', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
    const d = await devices(browser, f);
    try {
      await prepare(d.boothPage, f);
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      await readyAfterArrival(d.boothPage);
      const original = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      const printedId = seedOutcome(f, original.runId, 'Printed');
      const before = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      localOwnerSql(
        `update public.booth_grants set state='Revoked',revoked_at=clock_timestamp() where event_id='${f.eventId}' and state='Active'`
      );
      await expect(d.boothPage.getByRole('heading', { name: 'Booth access ended' })).toBeVisible();
      await expect(d.boothPage.getByRole('heading', { name: 'Booth access ended' })).toBeFocused();
      expect(
        await d.boothPage.getByRole('main').evaluate((el) => getComputedStyle(el).backgroundColor)
      ).toBe('rgb(16, 27, 27)');
      await signInFromBooth(d.boothPage, f);
      let recoveries = 0;
      await d.boothPage.route('**/booth/recover-access', async (route) => {
        recoveries++;
        await route.fetch();
        await route.abort();
      });
      await d.boothPage.getByRole('button', { name: 'Replace Booth access' }).click();
      await expect(d.boothPage.getByRole('dialog')).toContainText('Counts do not reset');
      await d.boothPage.getByRole('button', { name: 'Confirm replacement' }).click();
      await expect(d.boothPage).toHaveURL(/\/booth$/, { timeout: 20000 });
      await expect(d.boothPage.getByRole('heading', { name: 'Booth paused' })).toBeVisible();
      expect(recoveries).toBe(1);
      const after = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      expect(after.runId).toBe(original.runId);
      expect(after.runState).toBe('Paused');
      expect(after.counts).toEqual(before.counts);
      expect((await admit(d.boothPage)).status).toBe(409);
      const camera = d.boothPage.getByRole('button', { name: 'Enable Camera' });
      const printer = d.boothPage.getByRole('button', { name: 'Connect to Instax' });
      if (await camera.isVisible()) await camera.click();
      if (await printer.isVisible()) await printer.click();
      await d.phonePage.goto(`/events/${f.eventId}`);
      await expect(
        d.phonePage.getByRole('button', { name: 'Complete Event', exact: true })
      ).toBeDisabled();
      await expect(
        d.phonePage.getByRole('button', { name: 'Resume Booth', exact: true })
      ).toBeEnabled({ timeout: 15000 });
      await d.phonePage.getByRole('button', { name: 'Resume Booth', exact: true }).click();
      await expect(d.boothPage.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
      await expect(
        d.phonePage.getByRole('heading', { name: 'Booth running', exact: true })
      ).toBeVisible();
      await reviewPhoneCommand(d.phonePage, 'finish', original.runId);
      await expect(d.boothPage.getByRole('heading', { name: 'Booth Mode finished' })).toBeVisible();
      await signInFromBooth(d.boothPage, f);
      await prepare(d.boothPage, f);
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
      await readyAfterArrival(d.boothPage);
      const second = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).body;
      expect(second.runId).not.toBe(original.runId);
      expect(second.counts).toEqual(before.counts);
      await expect(
        d.phonePage.getByRole('button', { name: 'Finish Booth Mode', exact: true })
      ).toBeVisible();
      await expect(
        d.phonePage.getByRole('heading', { name: 'Booth running', exact: true })
      ).toBeVisible();
      await reviewPhoneCommand(d.phonePage, 'finish', second.runId);
      const finishedSecond = (await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`))
        .body;
      expect(finishedSecond.runId).toBe(second.runId);
      expect(finishedSecond.runState).toBe('Finished');
      expect(finishedSecond.counts).toEqual(before.counts);
      await expect(
        d.phonePage.getByRole('button', { name: 'Complete Event', exact: true })
      ).toBeEnabled();
      await reviewPhoneCommand(d.phonePage, 'complete');
      await expect(d.phonePage.getByText('Completed Event', { exact: true })).toBeVisible();
      expect(
        localOwnerSql(`select state from public.print_attempts where id='${printedId}'`)[0].state
      ).toBe('Printed');
      expect(
        localOwnerSql(
          `select count(*)::integer n from public.booth_runs where event_id='${f.eventId}'`
        )[0].n
      ).toBe(2);
      const retained = (
        await f.local.service
          .from('events')
          .select('state,client_name,deleted_at')
          .eq('id', f.eventId)
          .single()
      ).data;
      expect(retained?.state).toBe('Completed');
      expect(retained?.client_name).toBeTruthy();
      expect(retained?.deleted_at).toBeNull();
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

test('eligible Live cancellation keeps History and usable confirmation across themes, widths and zoom', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Finished');
    const d = await devices(browser, f);
    try {
      const page = d.phonePage;
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const theme of ['light', 'dark'] as const) {
        expect(
          (await f.local.service.from('admin_profiles').update({ theme }).eq('id', f.adminUser.id))
            .error
        ).toBeNull();
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/events/${f.eventId}`);
          await expect(page.locator('.admin-shell')).toHaveAttribute('data-theme', theme);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          const trigger = page.getByRole('button', { name: 'Cancel Event', exact: true });
          await expect(trigger).toBeEnabled();
          await trigger.focus();
          await page.keyboard.press('Enter');
          const dialog = page.getByRole('dialog');
          await expect(dialog).toContainText('History');
          expect(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
            theme === 'dark' ? 'rgb(26, 41, 41)' : 'rgb(255, 255, 255)'
          );
          expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
          await page.keyboard.press('Tab');
          expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
          const button = page.getByRole('button', { name: 'Confirm Cancel Event' });
          await expect(button).toHaveAttribute('data-variant', 'destructive');
          expect(
            await button.evaluate((el) => el.getBoundingClientRect().height)
          ).toBeGreaterThanOrEqual(44);
          expect(await button.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
            'none'
          );
          const box = await dialog.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        }
      }
      await page.setViewportSize({ width: 640, height: 900 });
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });
      await page.getByRole('button', { name: 'Cancel Event', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await expect(page.getByRole('button', { name: 'Confirm Cancel Event' })).toBeVisible();
      await page.getByRole('button', { name: 'Confirm Cancel Event' }).click();
      await expect(page.getByText('Cancelled Event', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
      const retained = (
        await f.local.service
          .from('events')
          .select('state,client_name,deleted_at')
          .eq('id', f.eventId)
          .single()
      ).data;
      expect(retained).toEqual({ state: 'Cancelled', client_name: 'Client', deleted_at: null });
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

test('idle phone polls only scoped state and observes remote Event completion', async ({
  browser,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    f.seedRun('Finished');
    const d = await devices(browser, f);
    try {
      await d.phonePage.goto(`/events/${f.eventId}`);
      await expect(d.phonePage.getByText('Live Event', { exact: true })).toBeVisible();
      let polls = 0,
        routeRefreshes = 0;
      d.phonePage.on('response', (response) => {
        if (response.url().endsWith(`/api/admin/events/${f.eventId}/booth/state`) && response.ok())
          polls++;
      });
      d.phonePage.on('request', (request) => {
        if (
          new URL(request.url()).pathname === `/events/${f.eventId}` &&
          request.headers().rsc === '1'
        )
          routeRefreshes++;
      });
      await expect.poll(() => polls, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
      expect(routeRefreshes).toBe(0);
      const state = await read(d.boothPage, `/api/admin/events/${f.eventId}/booth/state`);
      const status = await d.boothPage.evaluate(
        async ({ eventId, revision }) => {
          const response = await fetch(`/api/admin/events/${eventId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationId: crypto.randomUUID(), expectedRevision: revision }),
          });
          return response.status;
        },
        { eventId: f.eventId, revision: state.body.revision }
      );
      expect(status).toBe(200);
      await expect(d.phonePage.getByText('Completed Event', { exact: true })).toBeVisible();
      expect(routeRefreshes).toBe(1);
      await expect(
        d.phonePage.getByRole('button', { name: 'Complete Event', exact: true })
      ).toHaveCount(0);
      await expect(
        d.phonePage.getByRole('button', { name: 'Start Booth Mode', exact: true })
      ).toHaveCount(0);
    } finally {
      await d.close();
    }
  } finally {
    await f.dispose();
  }
});

for (const refreshOrigin of ['Admin', 'package reload']) {
  test(`a held ${refreshOrigin} refresh settles before local handoff signs out; phone polling stays independent`, async ({
    browser,
  }) => {
    const f = await createPackageBrowserFixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      f.seedRun('Finished');
      localOwnerSql("update public.printer_completion_policy set mode='simulated' where id");
      const d = await devices(browser, f);
      try {
        let holdEnabled = false;
        const inFlightRefreshes = new Set<unknown>();
        let held = false,
          starts = 0,
          issues = 0;
        d.boothPage.on('requestfinished', (request) => inFlightRefreshes.delete(request));
        d.boothPage.on('requestfailed', (request) => inFlightRefreshes.delete(request));
        d.boothPage.on('request', (request) => {
          if (
            new URL(request.url()).pathname === `/events/${f.eventId}` &&
            request.headers().rsc === '1'
          )
            inFlightRefreshes.add(request);
          if (request.url().endsWith('/booth/start')) starts++;
          if (/\/booth-handoffs\/[^/]+\/issue$/.test(request.url())) issues++;
        });
        const refreshPath =
          refreshOrigin === 'Admin'
            ? `**/api/admin/events/${f.eventId}/booth/state`
            : `**/events/${f.eventId}?*`;
        await d.boothPage.route(refreshPath, async (route) => {
          if (
            holdEnabled &&
            (refreshOrigin === 'Admin' || route.request().headers().rsc === '1') &&
            !held
          ) {
            held = true;
            await gate;
          }
          await route.continue();
        });
        await d.phonePage.goto(`/events/${f.eventId}`);
        await prepare(d.boothPage, f);
        if (refreshOrigin === 'Admin') {
          holdEnabled = true;
          await d.boothPage.evaluate(() => window.dispatchEvent(new Event('focus')));
        }
        if (refreshOrigin === 'package reload') {
          await d.boothPage.route(
            `**/api/admin/events/${f.eventId}/film-packages`,
            async (route) => {
              const response = await route.fetch({
                postData: JSON.stringify({ ...route.request().postDataJSON(), packages: 0 }),
              });
              expect(response.status()).toBe(400);
              await route.fulfill({ response });
            }
          );
          await d.boothPage.getByRole('button', { name: 'Add Film Packages', exact: true }).click();
          await d.boothPage.getByLabel('Client request note').fill('Client asked for one package');
          const rejectedPurchase = d.boothPage.waitForResponse((response) =>
            response.url().endsWith(`/api/admin/events/${f.eventId}/film-packages`)
          );
          await d.boothPage
            .getByRole('dialog')
            .getByRole('button', { name: 'Add Film Packages', exact: true })
            .click();
          expect((await rejectedPurchase).status()).toBe(400);
          await expect(d.boothPage.getByRole('alert')).toContainText(
            'The purchase was not recorded'
          );
          expect(
            await d.boothPage.evaluate(
              (key) => sessionStorage.getItem(key),
              `film-package-purchase:${f.eventId}:${f.adminUser.id}`
            )
          ).toBeNull();
          // Isolate this manual reload: no tracked scheduled poll may mask its transition.
          await d.boothPage.evaluate(() =>
            Object.defineProperty(document, 'visibilityState', {
              configurable: true,
              get: () => 'hidden',
            })
          );
          await expect.poll(() => inFlightRefreshes.size).toBe(0);
          holdEnabled = true;
          await d.boothPage
            .getByRole('button', { name: 'Reload current state', exact: true })
            .click();
          await expect.poll(() => held).toBe(true);
          await d.boothPage.getByRole('button', { name: 'Cancel', exact: true }).click();
          await expect(d.boothPage.getByRole('dialog')).toHaveCount(0);
          await d.boothPage.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
          await expect(
            d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true })
          ).toBeEnabled();
          expect(
            localOwnerSql(
              `select count(*)::integer n from public.additional_film_package_entries where event_id='${f.eventId}'`
            )[0].n
          ).toBe(0);
        }
        await expect.poll(() => held).toBe(true);
        await d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
        await expect(
          d.boothPage.getByRole('dialog', { name: 'Preparing Booth Mode' })
        ).toBeVisible();
        await expect(
          d.boothPage.getByRole('button', { name: 'Start Booth Mode', exact: true })
        ).toHaveCount(0);
        await d.boothPage.waitForTimeout(300);
        expect(starts).toBe(0);
        expect(issues).toBe(0);
        expect((await read(d.boothPage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
          200
        );
        const phoneRefresh = d.phonePage.waitForRequest(
          (request) =>
            new URL(request.url()).pathname === `/api/admin/events/${f.eventId}/booth/state`
        );
        await d.phonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
        await phoneRefresh;
        release();
        await readyAfterArrival(d.boothPage);
        expect(starts).toBe(1);
        expect(issues).toBe(1);
        expect((await read(d.boothPage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
          401
        );
        expect((await read(d.phonePage, `/api/admin/events/${f.eventId}/booth/state`)).status).toBe(
          200
        );
        const runs = localOwnerSql(
          `select state from public.booth_runs where event_id='${f.eventId}' order by created_at`
        );
        expect(runs).toEqual([{ state: 'Finished' }, { state: 'Active' }]);
      } finally {
        release();
        await d.close();
      }
    } finally {
      await f.dispose();
    }
  });
}
