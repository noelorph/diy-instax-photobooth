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

  it('identifies a numeric failure during printer status check', async () => {
    const { services } = fixture();
    vi.mocked(services.preflight).mockRejectedValueOnce(2);
    render(<QualificationClient services={services} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect printer' }));

    expect(await screen.findByText('Printer status check: 2')).toBeDefined();
  });

  it('disconnects after a failed printer status check', async () => {
    const { services, connection } = fixture();
    vi.mocked(services.preflight).mockRejectedValueOnce(new Error('status timed out'));
    render(<QualificationClient services={services} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect printer' }));

    await waitFor(() => expect(connection.disconnect).toHaveBeenCalledOnce());
    expect(screen.getByText('Printer not connected')).toBeDefined();
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
    expect(await screen.findByRole('button', { name: 'Retry camera' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Capture' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry camera' }));
    await waitFor(() => expect(services.getUserMedia).toHaveBeenCalledTimes(2));
    await screen.findByText('Camera ready');
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

  it('keepsStatusObservationOpenForTenSecondsAfterEmergenceMarker', async () => {
    const { services } = fixture();
    await enterTrial(services);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await screen.findByRole('button', { name: 'Print' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Print' }));
      await Promise.resolve();
    });

    const confirm = screen.getByRole('button', { name: 'Observed film ejection' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sheet fully emerged' }));
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Status recording continues for 10 seconds/)).toBeDefined();
    expect(services.observe).toHaveBeenCalledOnce();
    act(() => {
      vi.mocked(services.observe).mock.calls[0][1]({
        opcode: INSTAX_OPCODES.supportFunctionInfo,
        payload: new Uint8Array([0, 2, 2, 0x12, 0x7f, 0x0b]),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(screen.getByText(/Observation window ended; check the status log/)).toBeDefined();
    expect(services.observe).toHaveBeenCalledOnce();

    fireEvent.click(confirm);
    expect(screen.getByText('2 sheets available')).toBeDefined();
    expect(vi.mocked(services.observe).mock.results[0].value).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Operator diagnostics'));
    fireEvent.click(screen.getByRole('button', { name: 'Export non-photo log' }));
    const json = screen.getByRole('textbox', { name: 'Non-photo log JSON' }) as HTMLTextAreaElement;
    const events = JSON.parse(json.value).events;
    expect(events.map((event: { kind: string }) => event.kind)).toContain(
      'physical-ejection-marker'
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'status', filmRemaining: 2, responseHex: '000202127f0b' })
    );
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

  it('shows a pre-command rejection and setup recovery without resending', async () => {
    const { services } = fixture();
    vi.mocked(services.send).mockResolvedValue({
      kind: 'rejected-before-command',
      message: 'No film reported',
    });
    await enterTrial(services);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await screen.findByRole('button', { name: 'Print' });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(await screen.findByText(/No print command was sent/)).toBeDefined();
    expect(screen.getByText(/rejected-before-command/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Return to setup' }));
    expect(screen.getByText('Printer not connected')).toBeDefined();
    expect(services.send).toHaveBeenCalledTimes(1);
  });

  it('shows a selectable log when a browser cannot download files', async () => {
    const { services } = fixture();
    render(<QualificationClient services={services} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export non-photo log' }));

    const json = screen.getByRole('textbox', { name: 'Non-photo log JSON' }) as HTMLTextAreaElement;
    expect(JSON.parse(json.value)).toMatchObject({
      runId: expect.stringMatching(/^run-/),
      events: [],
    });
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Download JSON' }).getAttribute('download')).toMatch(
      /^run-.+\.json$/
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(await screen.findByText(/Touch and hold the JSON text/)).toBeDefined();
  });
});
