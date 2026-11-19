import type { Adapter, Outage } from '../schema.ts';
import { fetchOdsExport } from '../opendatasoft.ts';
import { num, postcodeList, truthy, ukLocalToIso } from '../util.ts';

/**
 * SPEN NEO dataset. Field names follow the portal metadata; times are UK local time although labelled +00:00,
 * so the offset is stripped before conversion. No customer counts are published.
 */
const stripOffset = (s: unknown) => (typeof s === 'string' ? s.replace(/(Z|[+-]00:?00)$/, '') : s);

export function normaliseSpen(rows: any[]): Outage[] {
  const out: Outage[] = [];
  for (const r of rows) {
    const lat = num(r.location_latitude ?? r.geo_point_2d?.lat), lon = num(r.location_longitude ?? r.geo_point_2d?.lon);
    if (!r.fault_id || lat === undefined || lon === undefined) continue;
    const planned = truthy(r.planned);
    const g = r.geo_shape?.geometry ?? r.geo_shape;
    const restoredAt = ukLocalToIso(stripOffset(r.date_of_restoration));
    out.push({
      id: `spen:${r.fault_id}`,
      dno: 'spen',
      type: planned ? 'planned' : 'unplanned',
      status: restoredAt || /complete/i.test(r.status ?? '') ? 'restored' : 'active',
      lat, lon,
      geometry: g && (g.type === 'Polygon' || g.type === 'MultiPolygon') ? g : undefined,
      postcodes: postcodeList(r.post_code),
      startedAt: ukLocalToIso(stripOffset(planned ? r.planned_outage_start_date : r.date_of_reported_fault)),
      etr: ukLocalToIso(stripOffset(r.etr)),
      restoredAt,
      sourceUpdatedAt: ukLocalToIso(stripOffset(r.upload_date)),
    });
  }
  return out;
}

export const spen: Adapter = {
  id: 'spen',
  async fetch(opts) {
    const key = opts.apiKeys?.spen;
    if (!key) throw new Error('SPEN_KEY not configured (free Opendatasoft account required)');
    return normaliseSpen(await fetchOdsExport('spenergynetworks.opendatasoft.com', 'national-energy-outage-data', opts, key));
  },
};
