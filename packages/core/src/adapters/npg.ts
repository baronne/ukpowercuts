import type { Adapter, Outage } from '../schema.ts';
import { fetchOdsExport } from '../opendatasoft.ts';
import { num, postcodeList, ukLocalToIso } from '../util.ts';

/** NPg publishes several rows per fault: group by `reference`, keep the most recently updated. */
export function normaliseNpg(rows: any[]): Outage[] {
  const byRef = new Map<string, any>();
  for (const r of rows) {
    if (!r.reference) continue;
    const prev = byRef.get(r.reference);
    if (!prev || String(r.updatedate) > String(prev.updatedate)) byRef.set(r.reference, r);
  }
  const out: Outage[] = [];
  for (const [ref, r] of byRef) {
    const lat = num(r.lat ?? r.geopoint?.lat), lon = num(r.lng ?? r.geopoint?.lon);
    if (lat === undefined || lon === undefined) continue;
    const planned = /planned/i.test(r.natureofoutage ?? '');
    out.push({
      id: `npg:${ref}`,
      dno: 'npg',
      type: planned ? 'planned' : 'unplanned',
      status: r.isaffected === 0 ? 'restored' : 'active',
      lat, lon,
      customers: num(r.totalconfirmedpowercut) ?? num(r.totalpredictedpowercut),
      postcodes: postcodeList(r.postcode),
      startedAt: ukLocalToIso(r.loggedtime),
      etr: ukLocalToIso(r.estimatedtimetillresolution),
      message: r.reason ?? undefined,
      sourceUpdatedAt: ukLocalToIso(r.updatedate),
    });
  }
  return out;
}

export const npg: Adapter = {
  id: 'npg',
  async fetch(opts) {
    return normaliseNpg(await fetchOdsExport('northernpowergrid.opendatasoft.com', 'live-power-cuts-data', opts));
  },
};
