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
  await expect(page.getByRole('heading', { name: 'Make a memory' }).or(camera)).toBeVisible();
  if (await camera.isVisible()) await camera.click();
  const printer = page.getByRole('button', { name: 'Connect to Instax', exact: true });
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
      expect(run.data?.connection_generation).toBe(1);
      expect(run.data?.readiness_observation.cameraLive).toBe(true);
      const grants = await f.local.service
        .from('booth_grants')
        .select('state')
        .eq('event_id', f.eventId);
      expect(grants.data?.map((g) => g.state)).toEqual(['Active']);
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
test('unusable issue reply fails closed without a second run or blind reissue', async ({
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
        await route.fetch();
        await route.abort();
      });
      await d.boothPage.getByRole('button', { name: 'Start Booth Mode' }).click();
      await expect(d.boothPage.getByText(/Booth access could not be issued/)).toBeVisible();
      await expect(d.boothPage.getByRole('button', { name: 'Start Booth Mode' })).toBeDisabled();
      expect(issues).toBe(1);
      expect(
        (await f.local.service.from('booth_runs').select('state').eq('event_id', f.eventId)).data
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
      // A document boundary releases the setup camera and in-memory simulator connection.
      await d.boothPage.goto('/booth');
      await expect(d.boothPage.getByRole('button', { name: 'Connect to Instax' })).toBeVisible();
      await d.boothPage.getByRole('button', { name: 'Enable Camera' }).click();
      await expect(
        d.boothPage.getByRole('heading', { name: 'Booth equipment needs attention' })
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
