import type { Adapter, Outage } from '../schema.ts';
import { fetchOdsExport } from '../opendatasoft.ts';
import { num, postcodeList, ukLocalToIso } from '../util.ts';

const HOST = 'ukpowernetworks.opendatasoft.com';

/** Join `ukpn-live-faults` (customers, times) with `ukpn-national-energy-outage` (affected-area polygon). */
export function normaliseUkpn(faults: any[], neo: any[]): Outage[] {
  const polygons = new Map<string, Outage['geometry']>();
  for (const n of neo) {
    const g = n.geometry_wkt?.geometry;
    if (n.fault_id && g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) polygons.set(String(n.fault_id), g);
  }
  const out: Outage[] = [];
  for (const f of faults) {
    // "Multiple" rows are map clusters with a fresh id every refresh - not real incidents.
    if (!f.incidentreference || f.powercuttype === 'Multiple') continue;
    const lat = num(f.geopoint?.lat), lon = num(f.geopoint?.lon);
    if (lat === undefined || lon === undefined) continue;
    const restored = f.powercuttype === 'Restored' || !!f.restoreddatetime;
    const planned = f.powercuttype === 'Planned';
    out.push({
      id: `ukpn:${f.incidentreference}`,
      dno: 'ukpn',
      type: planned ? 'planned' : 'unplanned',
      status: restored ? 'restored' : 'active',
      lat, lon,
      geometry: polygons.get(String(f.incidentreference)),
      customers: num(planned ? f.noplannedcustomers : f.nocustomeraffected) ?? num(f.nocustomeraffected),
      postcodes: postcodeList(f.fullpostcodedata ?? f.postcodesaffected),
      startedAt: ukLocalToIso(planned ? f.planneddate : f.creationdatetime),
      etr: ukLocalToIso(f.estimatedrestorationdate),
      restoredAt: ukLocalToIso(f.restoreddatetime),
      message: f.mainmessage ?? undefined,
    });
  }
  return out;
}

export const ukpn: Adapter = {
  id: 'ukpn',
  async fetch(opts) {
    const [faults, neo] = await Promise.all([
      fetchOdsExport(HOST, 'ukpn-live-faults', opts),
      // polygons are a nice-to-have: never fail the whole DNO because of them
      fetchOdsExport(HOST, 'ukpn-national-energy-outage', opts, undefined, 'restored=0').catch(() => []),
    ]);
    return normaliseUkpn(faults, neo);
  },
};
