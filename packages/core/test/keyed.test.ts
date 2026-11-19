import { describe, expect, it } from 'vitest';
import { normaliseEnwl, normaliseSpen } from '../src/index.ts';

// SYNTHETIC samples built from the portals' published field lists - NOT recorded responses.
// Replace with real fixtures (npm run probe with SPEN_KEY / ENWL_KEY) once API keys exist.
describe('SPEN (synthetic sample)', () => {
  const rows = [
    { fault_id: 'S1', planned: 'FALSE', status: 'In Progress', date_of_reported_fault: '2026-07-01T12:00:00+00:00', etr: '2026-07-01T15:00:00+00:00', location_latitude: 55.86, location_longitude: -4.25, post_code: 'G1 1AA',
      geo_shape: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-4.26, 55.85], [-4.24, 55.85], [-4.24, 55.87], [-4.26, 55.85]]] } } },
    { fault_id: 'S2', planned: 'TRUE', status: 'Complete', planned_outage_start_date: '2026-07-01T09:00:00+00:00', date_of_restoration: '2026-07-01T11:00:00+00:00', location_latitude: 55.9, location_longitude: -3.2 },
  ];
  it('treats the +00:00 label as UK local time (BST) and keeps polygons', () => {
    const [a, b] = normaliseSpen(rows);
    expect(a!.startedAt).toBe('2026-07-01T11:00:00.000Z'); // 12:00 BST
    expect(a!.geometry?.type).toBe('Polygon');
    expect(b).toMatchObject({ type: 'planned', status: 'restored' });
  });
});

describe('ENWL (synthetic sample)', () => {
  it('maps counts, status and the switch point', () => {
    const [o] = normaliseEnwl([{ incident_num: 'E1', incident_type: 'Unplanned', incident_status: 'In progress', customers_off_supply: 120, outage_time: '2026-11-19T09:00:00', geo_point_2d: { lat: 53.5, lon: -2.3 } }]);
    expect(o).toMatchObject({ id: 'enwl:E1', type: 'unplanned', status: 'active', customers: 120, lat: 53.5 });
  });
  it('does not mistake "Unplanned" for planned', () => {
    expect(normaliseEnwl([{ incident_num: 'E2', incident_type: 'Unplanned', geo_point_2d: { lat: 1, lon: 1 } }])[0]!.type).toBe('unplanned');
  });
});
