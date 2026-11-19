import type { Adapter, Outage } from '../schema.ts';
import { fetchJson, num, postcodeList, truthy, ukLocalToIso } from '../util.ts';

// "Live Detailed Power Cuts" (planned + unplanned, NEO-style field names).
const RESOURCE = 'a1365982-4e05-463c-8304-8323a2ba0ccd';
const URL_NGED = `https://connecteddata.nationalgrid.co.uk/api/3/action/datastore_search?resource_id=${RESOURCE}&limit=5000`;

export function normaliseNged(json: any): Outage[] {
  const out: Outage[] = [];
  for (const r of json?.result?.records ?? []) {
    const lat = num(r.location_latitude), lon = num(r.location_longitude);
    if (!r.fault_id || lat === undefined || lon === undefined) continue;
    const planned = truthy(r.planned);
    out.push({
      id: `nged:${r.fault_id}`,
      dno: 'nged',
      type: planned ? 'planned' : 'unplanned',
      status: ukLocalToIso(r.date_of_restoration) ? 'restored' : 'active',
      lat, lon,
      customers: num(r.confirmed_off) || num(r.predicted_off) || num(r.planned_outage_off) || num(r.confirmed_off),
      postcodes: postcodeList(r.postcode),
      startedAt: ukLocalToIso(planned ? r.planned_outage_start_date : r.date_of_reported_fault),
      etr: ukLocalToIso(planned ? r.planned_outage_end_date : r.etr),
      restoredAt: ukLocalToIso(r.date_of_restoration),
      message: r.category || undefined,
      sourceUpdatedAt: ukLocalToIso(r.last_updated ?? r.upload_date),
    });
  }
  return out;
}

export const nged: Adapter = {
  id: 'nged',
  async fetch(opts) {
    return normaliseNged(await fetchJson(URL_NGED, opts));
  },
};
