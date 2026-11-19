import { describe, expect, it } from 'vitest';
import type { Outage } from '@powercut/core';
import { entriesForDay, snapshotKey, timelinePoint, toCsv, updateHistory } from '../src/history.ts';

const o = (id: string, dno: Outage['dno'], customers: number, extra: Partial<Outage> = {}): Outage => ({
  id, dno, type: 'unplanned', status: 'active', lat: 51, lon: -1, postcodes: ['AB1 2CD'], customers, ...extra,
});
const T1 = '2026-11-19T10:00:00.000Z', T2 = '2026-11-19T10:05:00.000Z', T3 = '2026-11-19T10:10:00.000Z';

describe('updateHistory', () => {
  it('tracks first seen and peak customers', () => {
    let h = updateHistory({}, [o('ukpn:1', 'ukpn', 10)], new Set(['ukpn']), T1);
    h = updateHistory(h, [o('ukpn:1', 'ukpn', 40)], new Set(['ukpn']), T2);
    h = updateHistory(h, [o('ukpn:1', 'ukpn', 5)], new Set(['ukpn']), T3);
    expect(h['ukpn:1']).toMatchObject({ firstSeen: T1, lastSeen: T3, peakCustomers: 40 });
  });
  it('marks outages that vanish from a healthy feed as restored', () => {
    let h = updateHistory({}, [o('ukpn:1', 'ukpn', 10)], new Set(['ukpn']), T1);
    h = updateHistory(h, [], new Set(['ukpn']), T2);
    expect(h['ukpn:1']!.restoredAt).toBe(T1);
  });
  it('does NOT mark outages restored when their DNO feed failed', () => {
    let h = updateHistory({}, [o('ssen:1', 'ssen', 10)], new Set(['ssen']), T1);
    h = updateHistory(h, [], new Set(), T2);
    expect(h['ssen:1']!.restoredAt).toBeUndefined();
  });
  it('prunes entries older than 7 days', () => {
    const h = updateHistory({}, [o('ukpn:1', 'ukpn', 10)], new Set(['ukpn']), T1);
    expect(updateHistory(h, [], new Set(['ukpn']), '2026-11-27T10:00:00.000Z')['ukpn:1']).toBeUndefined();
  });
});

describe('timeline, export and keys', () => {
  it('counts only active unplanned customers', () => {
    const p = timelinePoint([o('a', 'ukpn', 10), o('b', 'ukpn', 5, { type: 'planned' }), o('c', 'npg', 7)], T1, 'k');
    expect(p).toMatchObject({ customers: 17, count: 2, byDno: { ukpn: 10, npg: 7 } });
  });
  it('formats snapshot keys in UTC', () => {
    expect(snapshotKey(new Date('2026-11-19T09:05:30Z'))).toBe('2026-11-19/0905');
  });
  it('selects entries overlapping a day and honours the exclude list', () => {
    const h = updateHistory({}, [o('ukpn:1', 'ukpn', 10), o('ssen:1', 'ssen', 10)], new Set(['ukpn', 'ssen']), T1);
    expect(entriesForDay(h, '2026-11-19', new Set(['ssen'])).map((e) => e.id)).toEqual(['ukpn:1']);
    expect(entriesForDay(h, '2026-11-18', new Set())).toEqual([]);
  });
  it('escapes CSV fields', () => {
    const h = updateHistory({}, [o('a,"b', 'ukpn', 1)], new Set(['ukpn']), T1);
    expect(toCsv(Object.values(h))).toContain('"a,""b"');
  });
});
