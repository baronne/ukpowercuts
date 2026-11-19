import type { Adapter, Outage } from '../schema.ts';
import { fetchJson, num, postcodeList, ukLocalToIso } from '../util.ts';

const URL_ALL = 'https://external.distribution.prd.ssen.co.uk/opendataportal-prd/v4/api/getallfaults';

export function normaliseSsen(json: any): Outage[] {
  const out: Outage[] = [];
  for (const f of json?.faults ?? []) {
    const lat = num(f.location?.latitude), lon = num(f.location?.longitude);
    if (!f.reference || lat === undefined || lon === undefined) continue;
    out.push({
      id: `ssen:${f.reference}`,
      dno: 'ssen',
      type: f.type === 'PSI' ? 'planned' : 'unplanned', // PSI = planned supply interruption
      status: 'active',
      lat, lon,
      customers: num(f.customerCount),
      postcodes: postcodeList(f.affectedAreas),
      startedAt: ukLocalToIso(f.loggedAtUtc),
      etr: ukLocalToIso(f.estimatedRestorationTimeUtc),
      message: f.message || undefined,
    });
  }
  return out;
}

export const ssen: Adapter = {
  id: 'ssen',
  async fetch(opts) {
    return normaliseSsen(await fetchJson(URL_ALL, opts));
  },
};
