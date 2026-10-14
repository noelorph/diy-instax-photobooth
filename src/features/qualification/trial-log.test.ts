import { describe, expect, it } from 'vitest';
import { createTrialLog } from './trial-log';

describe('qualification evidence log', () => {
  it('exportsOnlyAllowedMetadata', () => {
    let tick = 1000;
    const log = createTrialLog({ now: () => tick, iso: () => '2026-10-14T10:00:00Z' });
    const first = log.record({
      kind: 'capture',
      attemptId: 'attempt-1',
      jpeg: 'sentinel-image-bytes',
      photo: 'secret',
      arbitrary: 1,
    } as never);
    tick = 1250;
    const second = log.record({
      kind: 'printer-response',
      opcode: 2,
      responseHex: 'ab'.repeat(150),
      statusByte: 0,
    });
    const exported = log.exportJson();
    expect(first.elapsedMs).toBe(0);
    expect(second.elapsedMs).toBe(250);
    expect(first.runId).toBe(second.runId);
    expect(first.timestamp).toBe('2026-10-14T10:00:00Z');
    expect(exported.indexOf('capture')).toBeLessThan(exported.indexOf('printer-response'));
    expect(exported).not.toContain('jpeg');
    expect(exported).not.toContain('photo');
    expect(exported).not.toContain('sentinel-image-bytes');
    expect(second.responseHex).toHaveLength(256);
  });
});
