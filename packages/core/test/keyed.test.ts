import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseEnwl, normaliseSpen } from '../src/index.ts';

// SPEN and ENWL need free Opendatasoft API keys; these fixtures are real responses recorded with `npm run probe`.
const rows = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')).results as any[];

describe('SPEN (real fixture, national-energy-outage-data)', () => {
  const raw = rows('spen-live');
  const out = normaliseSpen(raw);
  it('keeps every row with coordinates and separates active from completed', () => {
    expect(out).toHaveLength(raw.length);
    expect(out.filter(o => o.status === 'active').length).toBe(raw.filter(r => r.status !== 'Completed').length);
    expect(out.filter(o => o.status === 'restored').every(o => o.restoredAt)).toBe(true);
  });
  it('maps planned flag (0/1), polygons and postcode sectors', () => {
    expect(out.filter(o => o.type === 'planned').length).toBe(raw.filter(r => r.planned === 1 || r.planned === true).length);
    expect(out.some(o => o.geometry)).toBe(true);
    expect(out.every(o => o.lat > 49 && o.lat < 61 && o.lon > -9 && o.lon < 2)).toBe(true);
    expect(out[0]!.id).toBe(`spen:${raw[0].fault_id}`);
  });
  it('has no customer counts (not published)', () => {
    expect(out.every(o => o.customers === undefined)).toBe(true);
  });
});

describe('ENWL (real fixture, live_incidents)', () => {
  const raw = rows('enwl-live');
  const out = normaliseEnwl(raw);
  it('maps counts, coordinates and times', () => {
    expect(out).toHaveLength(raw.length);
    expect(out[0]).toMatchObject({ id: `enwl:${raw[0].incident_num}`, dno: 'enwl', customers: raw[0].customers_off_supply });
    expect(out.every(o => o.lat > 53 && o.lat < 55.5 && o.startedAt)).toBe(true);
  });
  it('distinguishes planned interruptions from faults', () => {
    expect(out.filter(o => o.type === 'planned').length).toBe(raw.filter(r => /planned/i.test(r.incident_type)).length);
  });
});

describe('SPEN time labelling (synthetic, documented behaviour)', () => {
  it('treats the +00:00 label as UK local time, so 12:00 BST is 11:00Z', () => {
    const [o] = normaliseSpen([{ fault_id: 'S1', planned: 0, status: 'Awaiting', date_of_reported_fault: '2026-07-01T12:00:00+00:00', location_latitude: 55.86, location_longitude: -4.25 }]);
    expect(o!.startedAt).toBe('2026-07-01T11:00:00.000Z');
  });
});
