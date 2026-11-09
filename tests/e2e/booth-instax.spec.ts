import { expect, test, type Page } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
import { localOwnerSql } from '../fixtures/local-supabase';
import { installInstaxBluetooth } from '../fixtures/instax-bluetooth';

type Synthetic = {
  counts(): { executeCount: number; chooserCount: number };
  status(value: 'idle' | 'active' | 'empty'): void;
  disconnect(): void;
};
const fixture = (page: Page, command: 'counts' | 'idle' | 'active' | 'empty' | 'disconnect') =>
  page.evaluate((command) => {
    const f = (window as unknown as Window & { __instaxFixture: Synthetic }).__instaxFixture;
    if (command === 'counts') return f.counts();
    if (command === 'disconnect') f.disconnect();
    else f.status(command);
  }, command);

// A fresh operation is allowed only after a definite stale_revision rejection.
async function reviewPhoneCommand(page: Page, action: 'request' | 'confirm' | 'pause') {
  let rejected: { operationId: string; expectedRevision: number } | undefined;
  const title =
    action === 'request'
      ? 'Reload film'
      : action === 'confirm'
        ? 'Confirm film loaded'
        : 'Pause Booth';
  const endpoint =
    action === 'request'
      ? '/reload-requests'
      : action === 'confirm'
        ? '/reload-confirmations'
        : '/booth/pause';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === 'POST'
    );
    void response.catch(() => {});
    try {
      await page.getByRole('button', { name: title, exact: true }).click();
      const result = await response;
      const submitted = result.request().postDataJSON();
      if (rejected) {
        expect(submitted.operationId).not.toBe(rejected.operationId);
        expect(submitted.expectedRevision).toBeGreaterThan(rejected.expectedRevision);
      }
      if (result.status() === 409) {
        expect((await result.json()).code).toBe('stale_revision');
        await expect(
          action === 'pause'
            ? page.getByRole('alert')
            : page.getByRole('region', { name: 'Film reload controls' })
        ).toContainText('Review current state');
        rejected = submitted;
        await page.reload();
        continue;
      }
      expect(result.status()).toBe(200);
      return { submitted, body: await result.json() };
    } finally {
      // Drain the waiter even if a UI step fails before a response arrives.
      await response.catch(() => {});
    }
  }
  throw new Error('State changed again after explicit re-review');
}
async function statusPoll(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        __instaxFixture: { lastStatusPoll(): { sequence: number; label: string } };
      }
    ).__instaxFixture.lastStatusPoll()
  );
}
async function waitForStatusPoll(page: Page, label: string, after: number) {
  await expect
    .poll(async () => {
      const poll = await statusPoll(page);
      return poll.sequence > after && poll.label === label;
    })
    .toBe(true);
}
function nextReloadBinding(page: Page, requestId?: string, generation?: number) {
  const response = page.waitForResponse(async (r) => {
    if (new URL(r.url()).pathname !== '/api/booth/state' || r.request().method() !== 'GET')
      return false;
    expect(r.status()).toBe(200);
    const state = await r.json();
    return (
      !!state.activeReloadRequest &&
      (!requestId || state.activeReloadRequest.reloadRequestId === requestId) &&
      (generation === undefined || state.connectionGeneration === generation)
    );
  });
  void response.catch(() => {});
  return response;
}

async function capture(page: Page) {
  await page.getByRole('button', { name: 'Take Photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
}
for (const viewport of [
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  for (const scenario of ['normal', 'delayed acknowledgement', 'empty', 'disconnect'] as const) {
    test(`${scenario} with real adapter at ${viewport.width}×${viewport.height}`, async ({
      browser,
    }) => {
      const f = await createPackageBrowserFixture();
      const context = await browser.newContext({ viewport, permissions: ['camera'] });
      let releaseAck = () => {};
      try {
        localOwnerSql(
          "update public.printer_completion_policy set mode='instax-development' where id"
        );
        await installInstaxBluetooth(context);
        const page = await context.newPage();
        const metadata: string[] = [];
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/api/'))
            metadata.push(request.postData() ?? '');
        });
        await page.goto('/sign-in');
        await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
        await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page).toHaveURL(/dashboard$/);
        await page.goto(`/events/${f.eventId}`);
        await page.getByRole('button', { name: 'Enable Camera', exact: true }).click();
        await page.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
        for (const name of [
          'Film is physically loaded',
          'Continuous printer power is connected',
          'Guided Access is ready',
        ])
          await page.getByRole('checkbox', { name }).check();
        await page.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
        await expect(page).toHaveURL(/\/booth$/);
        const camera = page.getByRole('button', { name: 'Enable Camera', exact: true });
        if (await camera.isVisible()) await camera.click();
        await expect(page.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
        expect(await fixture(page, 'counts')).toEqual({ executeCount: 0, chooserCount: 1 });
        expect(await page.evaluate(() => '__boothSimulatorEject' in window)).toBe(false);
        expect(
          (await page.request.get(`/api/admin/events/${f.eventId}/booth/state`)).status()
        ).toBe(401);
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await capture(page);
        await page.getByRole('button', { name: 'Retake', exact: true }).click();
        await capture(page);
        if (scenario === 'delayed acknowledgement') {
          const gate = new Promise<void>((resolve) => {
            releaseAck = resolve;
          });
          await page.route('**/print-attempts/*/observations', async (route) => {
            if (route.request().postDataJSON().kind !== 'full_ejection_confirmed')
              return route.continue();
            const response = await route.fetch();
            await gate;
            await route.fulfill({ response });
          });
        }
        await page.getByRole('button', { name: 'Print', exact: true }).click();
        await expect.poll(async () => (await fixture(page, 'counts'))?.executeCount).toBe(1);
        await expect(page.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
        expect(
          localOwnerSql(
            `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
          )[0].n
        ).toBe(0);
        await fixture(page, 'active');
        // Wait for a real adapter poll to see processing before supplying the next status.
        await page.waitForTimeout(1100);
        if (scenario === 'empty' || scenario === 'disconnect') {
          await fixture(page, scenario === 'empty' ? 'empty' : 'disconnect');
          await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
          if (scenario === 'disconnect') {
            const reconnect = page.getByRole('button', { name: 'Connect to Instax', exact: true });
            await expect(reconnect).toBeVisible();
            await reconnect.click();
          }
          await page.waitForTimeout(2200);
          await expect(page.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
          expect(
            localOwnerSql(
              `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
            )[0].n
          ).toBe(0);
        } else {
          await fixture(page, 'idle');
          if (scenario === 'delayed acknowledgement') {
            await expect
              .poll(
                () =>
                  localOwnerSql(
                    `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
                  )[0].n
              )
              .toBe(1);
            await expect(page.getByRole('heading', { name: 'Print complete' })).toHaveCount(0);
            releaseAck();
          }
          await expect(page.getByRole('heading', { name: 'Print complete' })).toBeVisible();
          await page.waitForTimeout(2000);
          await expect(page.getByRole('heading', { name: 'Print complete' })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Make a memory' })).toBeVisible();
          expect(
            localOwnerSql(
              `select count(*)::int n from public.print_attempts where event_id='${f.eventId}' and state='Printed'`
            )[0].n
          ).toBe(1);
        }
        expect((await fixture(page, 'counts'))?.executeCount).toBe(1);
        const journal = await page.evaluate(() => sessionStorage.getItem('booth-operations-v2'));
        expect([...metadata, journal ?? ''].join('')).not.toMatch(
          /data:image|blob:|imageBytes|jpeg|base64/i
        );
      } finally {
        releaseAck();
        try {
          await context.close();
        } finally {
          await f.dispose();
        }
      }
    });
  }
}

for (const viewport of [
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  for (const scenario of [
    'automatic',
    'manual race',
    'missed baseline',
    'expired',
    'paused Pending',
    'replacement',
    'reconnect',
  ] as const) {
    test(`reload ${scenario} at ${viewport.width}×${viewport.height}`, async ({ browser }) => {
      test.setTimeout(150000);
      const f = await createPackageBrowserFixture();
      const boothContext = await browser.newContext({ viewport, permissions: ['camera'] });
      const phoneContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark',
      });
      try {
        localOwnerSql(
          "update public.printer_completion_policy set mode='instax-development' where id"
        );
        await installInstaxBluetooth(boothContext);
        const booth = await boothContext.newPage();
        const phone = await phoneContext.newPage();
        for (const page of [booth, phone]) {
          await page.goto('/sign-in');
          await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
          await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await expect(page).toHaveURL(/dashboard$/);
        }
        await booth.goto(`/events/${f.eventId}`);
        await booth.getByRole('button', { name: 'Enable Camera', exact: true }).click();
        await booth.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
        for (const name of [
          'Film is physically loaded',
          'Continuous printer power is connected',
          'Guided Access is ready',
        ])
          await booth.getByRole('checkbox', { name }).check();
        await booth.getByRole('button', { name: 'Start Booth Mode', exact: true }).click();
        await expect(booth).toHaveURL(/\/booth$/);
        await phone.goto(`/events/${f.eventId}`);
        const phoneState = async () => {
          const response = await phone.request.get(`/api/admin/events/${f.eventId}/booth/state`);
          expect(response.status()).toBe(200);
          return response.json();
        };
        const cover = (open: boolean) =>
          booth.evaluate((open) => {
            (
              window as unknown as { __instaxFixture: { cover(open: boolean): void } }
            ).__instaxFixture.cover(open);
          }, open);
        if (scenario === 'paused Pending') {
          const camera = booth.getByRole('button', { name: 'Enable Camera', exact: true });
          if (await camera.isVisible()) await camera.click();
          await booth.getByRole('button', { name: 'Start', exact: true }).click();
          await capture(booth);
          await booth.getByRole('button', { name: 'Print', exact: true }).click();
          await expect.poll(async () => (await fixture(booth, 'counts'))?.executeCount).toBe(1);
          await fixture(booth, 'active');
          await booth.waitForTimeout(1200);
          await fixture(booth, 'empty');
          await expect.poll(async () => (await phoneState()).counts.unresolved).toBe(1);
          await reviewPhoneCommand(phone, 'pause');
          await expect.poll(async () => (await phoneState()).runState).toBe('Paused');
          await fixture(booth, 'idle');
          await booth.waitForTimeout(1200);
        }
        const before = await phoneState();
        if (scenario === 'missed baseline') {
          const prior = await statusPoll(booth);
          await cover(true);
          await waitForStatusPoll(booth, 'open', prior.sequence);
        }
        // Arm before the phone mutation: only the Booth's natural GET can establish binding.
        const binding = nextReloadBinding(booth);
        try {
          await reviewPhoneCommand(phone, 'request');
          await expect(
            phone.getByRole('button', { name: 'Confirm film loaded', exact: true })
          ).toBeVisible();
          const bound = await (await binding).json();
          expect(bound.activeReloadRequest).toEqual((await phoneState()).activeReloadRequest);
        } finally {
          await binding.catch(() => {});
        }
        const first = (await phoneState()).activeReloadRequest;
        let matchingRequest = first;
        const boundPoll = await statusPoll(booth);
        await waitForStatusPoll(
          booth,
          scenario === 'missed baseline' ? 'open' : 'idle',
          boundPoll.sequence
        );
        if (scenario === 'expired') await booth.waitForTimeout(61000);
        if (scenario === 'replacement') {
          const prior = await statusPoll(booth);
          await cover(true);
          await waitForStatusPoll(booth, 'open', prior.sequence);
          const replacementBinding = booth.waitForResponse(async (r) => {
            if (new URL(r.url()).pathname !== '/api/booth/state') return false;
            expect(r.status()).toBe(200);
            const state = await r.json();
            return (
              !!state.activeReloadRequest &&
              state.activeReloadRequest.reloadRequestId !== first.reloadRequestId
            );
          });
          void replacementBinding.catch(() => {});
          try {
            await reviewPhoneCommand(phone, 'request');
            matchingRequest = (await phoneState()).activeReloadRequest;
            expect(matchingRequest.reloadRequestId).not.toBe(first.reloadRequestId);
            expect((await (await replacementBinding).json()).activeReloadRequest).toEqual(
              matchingRequest
            );
          } finally {
            await replacementBinding.catch(() => {});
          }
        } else if (scenario === 'reconnect') {
          await fixture(booth, 'disconnect');
          const reconnectedBinding = nextReloadBinding(
            booth,
            first.reloadRequestId,
            first.connectionGeneration + 1
          );
          try {
            await booth.getByRole('button', { name: 'Connect to Instax', exact: true }).click();
            await expect
              .poll(async () => (await phoneState()).connectionGeneration)
              .toBeGreaterThan(first.connectionGeneration);
            const reconnected = await (await reconnectedBinding).json();
            matchingRequest = reconnected.activeReloadRequest;
            expect(matchingRequest.reloadRequestId).toBe(first.reloadRequestId);
            expect(matchingRequest.connectionGeneration).toBeGreaterThan(
              first.connectionGeneration
            );
          } finally {
            await reconnectedBinding.catch(() => {});
          }
          await phone.reload();
        } else if (scenario !== 'missed baseline') {
          const prior = await statusPoll(booth);
          await cover(true);
          await waitForStatusPoll(booth, 'open', prior.sequence);
        }
        await cover(false);
        if (scenario === 'manual race') {
          const response = phone.waitForResponse(
            (r) => r.url().endsWith('/reload-confirmations') && r.request().method() === 'POST',
            { timeout: 5000 }
          );
          void response.catch(() => {});
          try {
            const button = phone.getByRole('button', { name: 'Confirm film loaded', exact: true });
            let clickError: unknown;
            const visible = await button.isVisible();
            if (visible) {
              try {
                await button.click({ timeout: 5000 });
              } catch (error) {
                clickError = error;
              }
            }
            const result = await response.catch((error) => {
              if (visible && !clickError) throw error;
              return null;
            });
            if (result) {
              expect(result.request().postDataJSON().reloadRequestId).toBe(first.reloadRequestId);
              if (result.status() === 409) {
                expect((await result.json()).code).toBe('stale_revision');
              } else {
                expect(result.status()).toBe(200);
                const receipt = (await result.json()).receipt;
                expect(receipt.kind).toBe('confirm_reload');
                expect(receipt.result.reloadRequestId).toBe(first.reloadRequestId);
              }
            }
            if (!result || result.status() === 409 || clickError) {
              // A missing button or rejected command is accepted only with this exact automatic commit.
              await expect
                .poll(async () => (await phoneState()).reloadConfirmation?.reloadRequestId)
                .toBe(first.reloadRequestId);
              expect((await phoneState()).reloadConfirmation).toMatchObject({
                reloadRequestId: first.reloadRequestId,
                printerId: first.printerId,
                connectionGeneration: first.connectionGeneration,
                confirmationSource: 'instax_automatic_reload',
              });
            }
          } finally {
            await response.catch(() => {});
          }
        }
        if (['missed baseline', 'expired', 'replacement', 'reconnect'].includes(scenario)) {
          await booth.waitForTimeout(2000);
          expect((await phoneState()).activeReloadRequest).not.toBeNull();
          await phone.reload();
          await reviewPhoneCommand(phone, 'confirm');
        }
        await expect.poll(async () => (await phoneState()).activeReloadRequest).toBeNull();
        const after = await phoneState();
        expect(after.counts).toEqual(before.counts);
        expect(after.equipment.filmLoaded).toBe(true);
        expect(after.reloadConfirmation).toMatchObject({
          reloadRequestId: matchingRequest.reloadRequestId,
          reloadRequestRevision: matchingRequest.reloadRequestRevision + 1,
          printerId: matchingRequest.printerId,
          connectionGeneration: matchingRequest.connectionGeneration,
          state: 'Confirmed',
        });
        expect(
          localOwnerSql(
            `select count(*)::int n from public.booth_reload_requests where event_id='${f.eventId}' and state='Confirmed'`
          )[0].n
        ).toBe(1);
        if (scenario === 'automatic' || scenario === 'paused Pending')
          expect(after.reloadConfirmation.confirmationSource).toBe('instax_automatic_reload');
        if (['missed baseline', 'expired', 'replacement', 'reconnect'].includes(scenario))
          expect(after.reloadConfirmation.confirmationSource).toBe('admin_physical_confirmation');
        const scopedResponse = await booth.evaluate(async () => {
          const response = await fetch('/api/booth/state');
          return { status: response.status, body: await response.json() };
        });
        expect(scopedResponse.status).toBe(200);
        const scoped = scopedResponse.body;
        expect(scoped.activeReloadRequest).toBeNull();
        expect(scoped.counts).toEqual(after.counts);
        await expect(phone.getByText(/Film loading confirmed/)).toBeVisible();
        await phone.emulateMedia({ colorScheme: 'light' });
        await phone.evaluate(() => {
          document.documentElement.style.zoom = '2';
        });
        await phone.getByRole('button', { name: 'Reload film', exact: true }).focus();
        await expect(phone.getByRole('button', { name: 'Reload film', exact: true })).toBeFocused();
        expect((await fixture(booth, 'counts'))?.executeCount).toBe(
          scenario === 'paused Pending' ? 1 : 0
        );
        if (scenario === 'paused Pending') {
          expect(after.runState).toBe('Paused');
          expect(after.counts.unresolved).toBe(1);
          expect(scoped.allowedActions.startGuest).toBe(false);
        }
      } finally {
        try {
          await boothContext.close();
        } finally {
          try {
            await phoneContext.close();
          } finally {
            await f.dispose();
          }
        }
      }
    });
  }
}
