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

  it('exports bounded raw Link 3 status without photo data', () => {
    const log = createTrialLog({ now: () => 0, iso: () => '2026-10-14T10:00:00Z' });
    const event = log.record({ kind: 'link3-status', responseHex: '12 7f 00' });
    expect(event.responseHex).toBe('127f00');
    expect(log.exportJson()).toContain('"responseHex": "127f00"');
  });

  it('exports bounded history and candidate correlation without accepting arbitrary metadata', () => {
    const log = createTrialLog({ now: () => 0, iso: () => '2026-11-06T10:00:00Z' });
    const event = log.record({
      kind: 'print-history',
      responseHex: '00 03 00 00 01 02 00 00 00 04',
      observationId: 'x'.repeat(200),
      connectionGeneration: 2,
    });
    expect(event.responseHex).toBe('00030000010200000004');
    expect(event.observationId).toHaveLength(100);
    expect(event.connectionGeneration).toBe(2);
    expect(
      log.record({ kind: 'ejection-candidate', responseHex: 'deadbeef', connectionGeneration: NaN })
        .responseHex
    ).toBeUndefined();
    expect(
      log.record({ kind: 'reload-candidate', connectionGeneration: -1 }).connectionGeneration
    ).toBeUndefined();
  });
});
