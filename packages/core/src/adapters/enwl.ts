import type { Adapter, Outage } from '../schema.ts';
import { fetchOdsExport } from '../opendatasoft.ts';
import { num, ukLocalToIso } from '../util.ts';

/**
 * Electricity North West `live_incidents`. Only incidents with 5+ customers off; the point is the upstream switch.
 * TODO: verify against a real response once an API key is available (fixture is a hand-written sample).
 */
export function normaliseEnwl(rows: any[]): Outage[] {
  const out: Outage[] = [];
  for (const r of rows) {
    const lat = num(r.geo_point_2d?.lat), lon = num(r.geo_point_2d?.lon);
    if (!r.incident_num || lat === undefined || lon === undefined) continue;
    const g = r.geo_shape?.geometry ?? r.geo_shape;
    out.push({
      id: `enwl:${r.incident_num}`,
      dno: 'enwl',
      type: /planned/i.test(r.incident_type ?? '') && !/unplanned/i.test(r.incident_type ?? '') ? 'planned' : 'unplanned',
      status: /restor|complete/i.test(r.incident_status ?? '') ? 'restored' : 'active',
      lat, lon,
      geometry: g && (g.type === 'Polygon' || g.type === 'MultiPolygon') ? g : undefined,
      customers: num(r.customers_off_supply) ?? num(r.customers_affected),
      postcodes: [],
      startedAt: ukLocalToIso(r.outage_time),
      etr: ukLocalToIso(r.estimated_restoration_time),
      message: r.incident_status ?? undefined,
    });
  }
  return out;
}

export const enwl: Adapter = {
  id: 'enwl',
  async fetch(opts) {
    const key = opts.apiKeys?.enwl;
    if (!key) throw new Error('ENWL_KEY not configured (free Opendatasoft account required)');
    return normaliseEnwl(await fetchOdsExport('electricitynorthwest.opendatasoft.com', 'live_incidents', opts, key));
  },
};
