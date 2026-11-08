import { afterEach, expect, it, vi } from 'vitest';
import { getBoothPrinter, releaseBoothPrinter } from '@/features/booth/equipment';
import { MiniLink3PrinterV2 } from '@/features/booth/printer/mini-link3-v2';
import { SimulatedPrinterV2 } from '@/features/booth/printer/simulator-v2';
afterEach(async () => {
  await releaseBoothPrinter();
  vi.unstubAllGlobals();
});
it('retains the physical owner across setup and handoff without falling back after chooser failure', async () => {
  const requestDevice = vi.fn().mockRejectedValue(Error('chooser denied'));
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  const setup = getBoothPrinter('instax-development');
  expect(setup).toBeInstanceOf(MiniLink3PrinterV2);
  await expect(setup.connect()).rejects.toThrow();
  expect(getBoothPrinter('instax-development')).toBe(setup);
  expect(() => getBoothPrinter('simulated')).toThrow();
  expect(requestDevice).toHaveBeenCalledOnce();
});
it('creates a fresh owner only after explicit terminal release', async () => {
  const first = getBoothPrinter('simulated');
  expect(first).toBeInstanceOf(SimulatedPrinterV2);
  await releaseBoothPrinter();
  expect(getBoothPrinter('instax-development')).not.toBe(first);
});

it('uses framed synthetic Bluetooth through the physical owner without simulator hooks', async () => {
  const { installInstaxBluetooth } = await import('../fixtures/instax-bluetooth');
  const { readFileSync } = await import('node:fs');
  await installInstaxBluetooth({
    addInitScript: async (fn: (arg: unknown) => void, arg: unknown) => fn(arg),
  } as never);
  const printer = getBoothPrinter('instax-development');
  const events: string[] = [];
  printer.observe((event) => events.push(event.kind));
  await printer.connect();
  const f = (
    window as unknown as {
      __instaxFixture: { counts(): { executeCount: number }; status(value: string): void };
    }
  ).__instaxFixture;
  const grant = {
    attemptId: 'a',
    dispatchId: 'd',
    printerId: 'synthetic-fi033',
    connectionGeneration: 1,
  };
  await printer.sendOnce(
    grant,
    new Uint8Array(readFileSync('src/features/qualification/fixtures/baseline-600x800.jpg'))
  );
  expect(events).toContain('command_accepted');
  expect(events).not.toContain('full_ejection_confirmed');
  f.status('active');
  await vi.waitFor(() => expect(f.counts().executeCount).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  f.status('idle');
  await vi.waitFor(() => expect(events).toContain('full_ejection_confirmed'), { timeout: 2000 });
  await vi.waitFor(() => expect(events).toContain('ready_for_new_job'), { timeout: 2000 });
  expect(f.counts().executeCount).toBe(1);
}, 15000);
