import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BoothControls } from '@/features/admin/operations/booth-controls';
import type { OperationalEvent } from '@/features/admin/operations/types';

const now = Date.parse('2026-11-09T00:00:00Z');
const event: OperationalEvent = {
  id: 'event',
  title: 'Event',
  state: 'Live',
  revision: 1,
  counts: {
    originalPackages: 1,
    additionalPackages: 0,
    totalBookedPrints: 10,
    printed: 0,
    unresolved: 0,
    printsRemaining: 10,
    printsAvailable: 10,
  },
  captures: 0,
  attemptsPage: 0,
  hasOlderAttempts: false,
  runId: 'run',
  runState: 'Paused',
  resumeAllowed: true,
  possibleDelivery: false,
  blockers: [],
  attempts: [],
  equipment: {
    expiresAt: new Date(now + 5000).toISOString(),
    cameraLive: true,
    printerConnected: true,
    serverReachable: true,
    filmLoaded: true,
  },
};
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

it.each([
  [0, 6000],
  [6000, 0],
])('hydrates without a readiness mismatch from clock %i to %i', async (serverOffset, offset) => {
  vi.useFakeTimers();
  vi.setSystemTime(now + serverOffset);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(window.clearTimeout);
  const container = document.createElement('div');
  const controls = (
    <BoothControls
      event={event}
      adminUserId="admin"
      refreshAdmin={() => {}}
      handoffPending={false}
    />
  );
  container.innerHTML = renderToString(controls);
  document.body.append(container);
  expect(container.querySelector('dd')?.textContent).toBe('Needs check');
  expect(container.querySelector('dd')?.hasAttribute('data-ready')).toBe(false);
  expect(Array.from(container.querySelectorAll('button')).every((button) => button.disabled)).toBe(
    true
  );
  vi.setSystemTime(now + offset);
  const errors: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container, controls, { onRecoverableError: (error) => errors.push(error) });
  });
  expect(errors).toEqual([]);
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
  const camera = container.querySelector('dd')!;
  expect(camera.textContent).toBe(offset > 5000 ? 'Needs check' : 'Ready');
  const resume = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Resume Booth'
  )!;
  expect(resume.disabled).toBe(offset > 5000);
  if (offset === 0) {
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(camera.textContent).toBe('Needs check');
    expect(resume.disabled).toBe(true);
  }
});
