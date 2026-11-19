import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseUkpn, normaliseNpg, normaliseSsen, normaliseNged, normaliseNie, parseNieTime, irishGridToWgs84, londonToUtc, ukLocalToIso } from '../src/index.ts';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const rows = (n: string) => fx(n).results as any[];

describe('time helpers', () => {
  it('converts BST wall-clock time to UTC', () => {
    expect(londonToUtc(2026, 7, 1, 12, 0)).toBe('2026-07-01T11:00:00.000Z');
    expect(londonToUtc(2026, 11, 19, 12, 0)).toBe('2026-11-19T12:00:00.000Z');
  });
  it('treats naive timestamps as UK local and respects explicit offsets', () => {
    expect(ukLocalToIso('2026-07-01T12:00:00')).toBe('2026-07-01T11:00:00.000Z');
    expect(ukLocalToIso('2026-07-01T12:00:00+00:00')).toBe('2026-07-01T12:00:00.000Z');
    expect(ukLocalToIso('')).toBeUndefined();
  });
});

describe('NIE', () => {
  it('converts Irish Grid to WGS84 in the right place', () => {
    // Belfast City Hall is ~54.5970N, 5.9301W (Irish Grid approx J 338 737)
    const { lat, lon } = irishGridToWgs84(333800, 374000);
    expect(lat).toBeGreaterThan(54.58); expect(lat).toBeLessThan(54.62);
    expect(lon).toBeGreaterThan(-5.97); expect(lon).toBeLessThan(-5.90);
  });
  it('parses display-string times, inferring the year', () => {
    const now = new Date('2026-11-19T13:30:00Z');
    expect(parseNieTime('5:16 PM, 18 Nov', now)).toBe('2026-11-18T17:16:00.000Z');
    expect(parseNieTime('5:00 PM, 19 Nov 2026', now)).toBe('2026-11-19T17:00:00.000Z');
    expect(parseNieTime('12:05 AM, 2 Jan', new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-02T00:05:00.000Z');
    expect(parseNieTime('Not available - Update to follow', now)).toBeUndefined();
  });
  it('normalises the live feed, all inside Northern Ireland', () => {
    const out = normaliseNie(fx('nie-faults'), new Date());
    expect(out.length).toBeGreaterThan(0);
    for (const o of out) {
      expect(o.lat).toBeGreaterThan(54.0); expect(o.lat).toBeLessThan(55.4);
      expect(o.lon).toBeGreaterThan(-8.2); expect(o.lon).toBeLessThan(-5.3);
    }
    expect(new Set(out.map((o) => o.type))).toEqual(new Set(['planned', 'unplanned']));
  });
});

describe('UKPN', () => {
  const out = normaliseUkpn(rows('ukpn-live-faults'), rows('ukpn-neo'));
  it('drops cluster rows and flags restored incidents', () => {
    expect(out.every((o) => !o.id.includes('MULT'))).toBe(true);
    expect(out.some((o) => o.status === 'restored')).toBe(true);
    expect(out.some((o) => o.type === 'planned')).toBe(true);
  });
  it('attaches polygons from the NEO dataset by incident id', () => {
    const neoIds = new Set(rows('ukpn-neo').map((r) => r.fault_id));
    const joined = out.filter((o) => o.geometry);
    expect(joined.length).toBeGreaterThan(0);
    expect(joined.every((o) => neoIds.has(o.id.replace('ukpn:', '')))).toBe(true);
  });
});

describe('NPg', () => {
  it('has one outage per reference', () => {
    const out = normaliseNpg(rows('npg-live'));
    expect(new Set(out.map((o) => o.id)).size).toBe(out.length);
    expect(out.some((o) => o.type === 'planned')).toBe(true);
  });
});

describe('SSEN', () => {
  it('maps PSI to planned and keeps customer counts', () => {
    const out = normaliseSsen(fx('ssen-getallfaults'));
    expect(out.some((o) => o.type === 'planned')).toBe(true);
    expect(out.some((o) => o.type === 'unplanned' && (o.customers ?? 0) > 0)).toBe(true);
  });
});

describe('NGED', () => {
  it('normalises planned and unplanned records', () => {
    const out = normaliseNged(fx('nged-a136'));
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((o) => o.type === 'planned')).toBe(true);
    expect(out.some((o) => o.type === 'unplanned')).toBe(true);
    expect(out.every((o) => o.lat > 49 && o.lat < 56)).toBe(true);
  });
});
