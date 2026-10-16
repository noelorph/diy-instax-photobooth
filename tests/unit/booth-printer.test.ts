import { describe, expect, it } from 'vitest';
import { SimulatedPrinter } from '@/features/booth/printer/simulator';

describe('simulated printer boundary', () => {
  it('issues only one command for concurrent and later calls of the same attempt', async () => {
    const printer = new SimulatedPrinter('ejected');
    const image = new Uint8Array([1, 2, 3]);
    const [first, second] = await Promise.all([
      printer.sendOnce('a', image),
      printer.sendOnce('a', image),
    ]);
    expect(printer.commandCount).toBe(1);
    expect(second).toEqual(first);
    await printer.sendOnce('a', image);
    expect(printer.commandCount).toBe(1);
    expect(first.map((o) => o.kind)).toEqual(['commandAccepted', 'physicalEjectionVerified']);
    expect(first.every((o) => o.attemptId === 'a')).toBe(true);
    expect(first[1].monotonicMs).toBeGreaterThanOrEqual(first[0].monotonicMs);
    expect(Object.keys(first[0]).sort()).toEqual(['attemptId', 'kind', 'monotonicMs']);
  });
  it.each([
    ['accepted', ['commandAccepted']],
    ['rejected', ['preFilmRejected']],
    ['uncertain', ['commandAccepted', 'uncertain']],
  ] as const)('keeps %s distinct from verified ejection', async (outcome, kinds) => {
    const printer = new SimulatedPrinter(outcome);
    expect((await printer.sendOnce('a', new Uint8Array([1]))).map((o) => o.kind)).toEqual(kinds);
  });
});
