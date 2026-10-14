import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QualificationClient, type QualificationServices } from './QualificationClient';
import { INSTAX_OPCODES } from './instax/protocol';

const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 3, 32, 2, 88, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 0xff, 0xd9,
]);
function fixture() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), readyState: 'live' });
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const connection = {
    modelNumber: 'FI033',
    firmwareRevision: '1.2.3',
    exchange: vi.fn(),
    disconnect: vi.fn(async () => undefined),
  };
  const services: QualificationServices = {
    secureContext: true,
    bluetooth: { requestDevice: vi.fn() },
    getUserMedia: vi.fn(async () => stream),
    connect: vi.fn(async () => connection),
    preflight: vi.fn(async () => ({ filmRemaining: 10 })),
    prepare: vi.fn(async () => ({ jpeg, previewUrl: 'blob:test' })),
    revoke: vi.fn(),
    send: vi.fn(async () => ({ kind: 'accepted' as const })),
    observe: vi.fn(() => vi.fn()),
    storage: localStorage,
  };
  return { services, track, connection };
}
async function enterTrial(services: QualificationServices) {
  render(<QualificationClient services={services} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
  await screen.findByText('Camera ready');
  fireEvent.click(screen.getByRole('button', { name: 'Connect printer' }));
  await screen.findByText('Printer ready');
  fireEvent.click(screen.getByRole('button', { name: 'Start trial' }));
  expect(screen.getByRole('button', { name: 'Capture' })).toBeDefined();
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe('supervised iPhone qualification page', () => {
  it('blocksUnsupportedBluetooth', () => {
    const { services } = fixture();
    services.bluetooth = undefined;
    render(<QualificationClient services={services} />);
    expect(screen.getByText(/Web Bluetooth is unavailable/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Start trial' }).hasAttribute('disabled')).toBe(true);
  });

  it('retriesDeniedCamera', async () => {
    const { services } = fixture();
    vi.mocked(services.getUserMedia).mockRejectedValueOnce(new Error('Permission denied'));
    render(<QualificationClient services={services} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await screen.findByText(/Permission denied/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry camera' }));
    await screen.findByText('Camera ready');
  });

  it('stopsOnEndedTrack', async () => {
    const { services, track } = fixture();
    await enterTrial(services);
    track.dispatchEvent(new Event('ended'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Capture' }).hasAttribute('disabled')).toBe(true)
    );
  });

  it('retakeKeepsAllowance', async () => {
    const { services } = fixture();
    await enterTrial(services);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await screen.findByRole('button', { name: 'Retake' });
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.getByRole('button', { name: 'Capture' })).toBeDefined();
    expect(screen.getByText('3 sheets available')).toBeDefined();
  });

  it('disablesDuplicatePrint', async () => {
    const { services } = fixture();
    await enterTrial(services);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await screen.findByRole('button', { name: 'Print' });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(screen.getByRole('button', { name: 'Print' }).hasAttribute('disabled')).toBe(true);
  });

  it('ackShowsPending', async () => {
    const { services } = fixture();
    await enterTrial(services);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await screen.findByRole('button', { name: 'Print' });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(await screen.findByText('Waiting for film ejection')).toBeDefined();
    expect(screen.queryByText('Print complete')).toBeNull();
  });

  it('observationTimeoutIsUncertain', async () => {
    const { services } = fixture();
    await enterTrial(services);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await screen.findByRole('button', { name: 'Print' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Print' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Waiting for film ejection')).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText(/Inspect the printer/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });

  it('does not expose image transfer response bytes in diagnostics', async () => {
    const { services, connection } = fixture();
    vi.mocked(services.connect).mockImplementation(async (_bluetooth, callbacks) => {
      callbacks.onResponse({
        opcode: INSTAX_OPCODES.downloadData,
        payload: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      });
      return connection;
    });
    await enterTrial(services);
    expect(screen.queryByText(/deadbeef/)).toBeNull();
  });
});
