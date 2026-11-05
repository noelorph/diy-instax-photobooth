import { expect, test } from '@playwright/test';

// Guest photos remain ephemeral: screenshots, video, tracing and attachments are disabled.
const runId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const attemptId = '00000000-0000-4000-8000-000000000004';
const dispatchId = '00000000-0000-4000-8000-000000000005';
const counts = {
  originalPackages: 1,
  additionalPackages: 0,
  totalBookedPrints: 10,
  printed: 0,
  unresolved: 0,
  printsRemaining: 10,
  printsAvailable: 10,
};

test('Welcome, Retake and selected Capture reservation use metadata-only version-2 requests', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  let revision = 1;
  let generation = 0;
  let sessionOpen = false;
  let pending = false;
  const captureBodies: Record<string, unknown>[] = [];
  const reservationBodies: Record<string, unknown>[] = [];
  const dispatchBodies: Record<string, unknown>[] = [];
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const logs: string[] = [];
  page.on('console', (message) => logs.push(message.text()));
  await page.route('**/api/booth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    requests.push({ path, body });
    if (path === '/api/booth/state') {
      await route.fulfill({
        json: {
          revision,
          runId,
          state: 'Active',
          counts: pending ? { ...counts, unresolved: 1, printsAvailable: 9 } : counts,
          blockers: [
            ...(sessionOpen ? ['guest_session_open'] : []),
            ...(pending ? ['print_pending'] : []),
          ],
          allowedActions: { startGuest: !sessionOpen, reportReadiness: true },
          readinessWindowId: '00000000-0000-4000-8000-000000000003',
          printerId: 'simulator',
          connectionGeneration: generation,
          pendingAttemptId: pending ? attemptId : null,
        },
      });
      return;
    }
    if (path === '/api/booth/readiness' && body.kind === 'connection_changed')
      generation = body.connectionGeneration as number;
    if (path === '/api/booth/sessions') sessionOpen = true;
    if (path === '/api/booth/captures') captureBodies.push(body);
    if (path === '/api/booth/print-attempts') {
      reservationBodies.push(body);
      pending = true;
    }
    if (path.endsWith('/dispatch')) dispatchBodies.push(body);
    const kind =
      path === '/api/booth/readiness'
        ? 'report_readiness'
        : path === '/api/booth/sessions'
          ? 'start_session'
          : path === '/api/booth/captures'
            ? 'record_capture'
            : path === '/api/booth/print-attempts'
              ? 'reserve'
              : path.endsWith('/dispatch')
                ? 'dispatch'
                : 'end_session';
    revision++;
    await route.fulfill({
      json: {
        revision,
        replayed: false,
        receipt: {
          operationId: body.operationId,
          kind,
          committedRevision: revision,
          result:
            kind === 'start_session'
              ? { sessionId }
              : kind === 'reserve'
                ? { attemptId, state: 'Reserved' }
                : kind === 'dispatch'
                  ? { attemptId, state: 'Dispatching' }
                  : {},
        },
        ...(kind === 'dispatch'
          ? {
              sendAllowed: true,
              authorization: {
                attemptId,
                dispatchId,
                printerId: 'simulator',
                connectionGeneration: generation,
              },
            }
          : {}),
      },
    });
  });
  await page.goto('/booth');
  await page.getByRole('button', { name: 'Connect to Instax' }).click();
  const enableCamera = page.getByRole('button', { name: 'Enable Camera' });
  if (await enableCamera.isVisible()) await enableCamera.click();
  const start = page.getByRole('button', { name: 'Start', exact: true });
  await expect(start).toBeVisible();
  await expect(start).toBeInViewport();
  await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(255, 248, 239)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px');
  const viewports = [
    { width: 375, height: 812 },
    { width: 667, height: 375 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(start, `Start at ${viewport.width}×${viewport.height}`).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByText(/one print per turn/i)).toBeVisible();
  await start.click();
  const takePhoto = page.getByRole('button', { name: 'Take Photo' });
  await expect(takePhoto).toBeVisible();
  await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(33, 28, 25)');
  await expect(page.getByLabel('Mirrored camera preview')).toHaveCSS(
    'transform',
    'matrix(-1, 0, 0, 1, 0, 0)'
  );
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(takePhoto, `Take Photo at ${viewport.width}×${viewport.height}`).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
  await takePhoto.click();
  await expect(page.getByRole('button', { name: 'Retake' })).toBeVisible();
  await page.getByRole('button', { name: 'Retake' }).click();
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(takePhoto).toBeInViewport();
  await takePhoto.click();
  await expect(page.getByRole('img', { name: 'Your final photo' })).toBeVisible();
  const print = page.getByRole('button', { name: 'Print', exact: true });
  await expect(print).toBeInViewport();
  const photo = page.getByRole('img', { name: 'Your final photo' });
  await expect(photo).toHaveCSS('transform', 'none');
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(print, `Print at ${viewport.width}×${viewport.height}`).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'Retake' })).toBeInViewport({ ratio: 1 });
    const crop = await photo.boundingBox();
    expect(crop!.width / crop!.height).toBeCloseTo(3 / 4, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(print).toHaveCSS('transition-duration', '0s');
  await print.click();
  await expect(page.getByRole('heading', { name: 'Preparing your print' })).toBeVisible();
  expect(captureBodies).toHaveLength(2);
  await expect.poll(() => reservationBodies.length).toBe(1);
  await expect.poll(() => dispatchBodies.length).toBe(1);
  for (const viewport of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('status')).toContainText('Please wait for the print outcome.');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Please wait.');
    await expect(page.getByRole('main').getByRole('alert')).not.toContainText('inform the Admin');
  }
  expect(reservationBodies[0].captureId).toBe(captureBodies[1].captureId);
  expect(
    requests.every(({ body }) => !('image' in body) && !('url' in body) && !('bytes' in body))
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      Object.values(sessionStorage).some((value) => /blob:|data:|jpeg|bytes/i.test(value))
    )
  ).toBe(false);
  expect(logs.join(' ')).not.toMatch(/blob:|data:image|base64|jpeg/i);
});

test('invalid grant does not expose a Guest action or Event details', async ({ page }) => {
  await page.route('**/api/booth/**', (route) =>
    route.fulfill({ status: 403, json: { code: 'access_required' } })
  );
  await page.goto('/booth');
  await expect(page.getByRole('heading', { name: 'Booth access ended' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/sign-in?from=booth'
  );
});
