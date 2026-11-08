import { expect, test } from '@playwright/test';
import { createPackageBrowserFixture } from '../fixtures/package-browser';
test(`production cannot activate requested ${process.env.BOOTH_PRINTER_MODE ?? 'disabled'} through equipment setup`, async ({
  page,
}) => {
  const f = await createPackageBrowserFixture();
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(f.adminUser.email);
    await page.getByLabel('Password', { exact: true }).fill(f.adminUser.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/dashboard$/);
    await page.goto(`/events/${f.eventId}`);
    await expect(
      page.getByText('Printer qualification is required before Booth setup.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Booth Mode' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Connect to Instax' })).toHaveCount(0);
    const result = await page.evaluate(async (id) => {
      const response = await fetch(
        `/api/admin/events/${id}/booth/setup-readiness?printerId=simulator&connectionGeneration=1`
      );
      return { status: response.status, body: await response.json() };
    }, f.eventId);
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('qualification_required');
    await page.context().addCookies(
      ['__Host-booth-device', '__Host-booth-grant'].map((name) => ({
        name,
        value: 'a'.repeat(64),
        url: 'http://127.0.0.1:1437',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict' as const,
      }))
    );
    const denied = await page.evaluate(async (eventId) => {
      const attemptId = crypto.randomUUID();
      const observationId = crypto.randomUUID();
      const requests = [
        [
          `/api/admin/events/${eventId}/booth/start`,
          {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            readinessWindowId: crypto.randomUUID(),
            printerId: 'synthetic-fi033',
            connectionGeneration: 1,
          },
        ],
        [
          `/api/booth/print-attempts/${attemptId}/dispatch`,
          {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            printerId: 'synthetic-fi033',
            connectionGeneration: 1,
          },
        ],
        [
          `/api/booth/print-attempts/${attemptId}/observations`,
          {
            operationId: observationId,
            observationId,
            kind: 'full_ejection_confirmed',
            printerId: 'synthetic-fi033',
            dispatchId: crypto.randomUUID(),
            adapterVersion: 'instax-mini-link3-v1',
            evidenceVersion: 'instax-fi033-0102-dev-v1',
            connectionGeneration: 1,
            metadata: {},
          },
        ],
      ] as const;
      return Promise.all(
        requests.map(async ([path, body]) => {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return { status: response.status, code: (await response.json()).code };
        })
      );
    }, f.eventId);
    expect(denied).toEqual(Array(3).fill({ status: 403, code: 'qualification_required' }));
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
