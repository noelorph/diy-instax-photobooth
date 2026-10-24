import { expect, test } from '@playwright/test';
// Photos are ephemeral: this suite forbids screenshots, video, tracing and attachments.
// HTTP doubles exercise the browser boundary; real RPC/authorization tests live in integration/.
const availability = { guestPrints: 4, filmSheets: 5, printerBusy: false };
test('Guest Capture, Retake and simulated ejection use metadata-only requests', async ({
  page,
}) => {
  const requests: string[][] = [];
  let captures = 0,
    reservations = 0;
  await page.route('**/api/booth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() ?? {};
    requests.push(Object.keys(body));
    let result: object = {
      state: 'Active',
      runId: '00000000-0000-4000-8000-000000000001',
      display: { title: 'Celebration' },
      availability,
    };
    if (path.endsWith('guest-sessions'))
      result = { sessionId: '00000000-0000-4000-8000-000000000002', state: 'Open', availability };
    if (path.endsWith('captures')) {
      captures++;
      result = {
        captureId: `00000000-0000-4000-8000-00000000000${captures + 2}`,
        captureCount: captures,
      };
    }
    if (path.endsWith('print-attempts')) {
      reservations++;
      result = {
        attemptId: '00000000-0000-4000-8000-000000000009',
        state: 'Reserved',
        availability,
      };
    }
    if (path.endsWith('observations'))
      result = {
        state: body.observationKind === 'commandAccepted' ? 'Accepted' : 'Confirmed',
        availability,
      };
    await route.fulfill({ json: result, headers: { 'Cache-Control': 'private, no-store' } });
  });
  await page.goto('/booth');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Take Photo' }).click();
  await expect(page.getByRole('button', { name: 'Retake' })).toBeVisible();
  await page.getByRole('button', { name: 'Retake' }).click();
  await page.getByRole('button', { name: 'Take Photo' }).click();
  await expect(page.getByRole('img', { name: 'Your final photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your print is ready' })).toBeVisible();
  expect(captures).toBe(2);
  expect(reservations).toBe(1);
  const allowed = new Set([
    'operationKey',
    'runId',
    'capturedAt',
    'captureId',
    'observationKind',
    'evidenceCode',
    'observedAt',
  ]);
  expect(requests.every((keys) => keys.every((key) => allowed.has(key)))).toBe(true);
  expect(
    await page.evaluate(() =>
      Object.values(sessionStorage).some((value) => /blob:|data:|jpeg|bytes/i.test(value))
    )
  ).toBe(false);
  await expect(page.getByRole('img', { name: 'Your final photo' })).toHaveCount(0);
});
test('invalid grant is neutral and cannot expose Event details', async ({ page }) => {
  await page.route('**/api/booth/**', (route) =>
    route.fulfill({ status: 403, json: { code: 'forbidden', message: 'Unavailable' } })
  );
  await page.goto('/booth');
  await expect(page.getByRole('heading', { name: 'Booth paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Admin sign in' })).toHaveAttribute(
    'href',
    '/sign-in?from=booth'
  );
});
