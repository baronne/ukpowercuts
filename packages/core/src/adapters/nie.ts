import type { Adapter, Outage } from '../schema.ts';
import { irishGridToWgs84 } from '../geo/irishGrid.ts';
import { fetchJson, londonToUtc, num, postcodeList } from '../util.ts';

const URL_NIE = 'https://powercheck.nienetworks.co.uk/NIEPowerCheckerWebAPI/api/faults';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parses "5:16 PM, 18 Nov" or "5:00 PM, 19 Nov 2026" (UK local). Year is inferred from `now` when absent. */
export function parseNieTime(s: unknown, now = new Date()): string | undefined {
  if (typeof s !== 'string') return undefined;
  const m = s.match(/(\d{1,2}):(\d{2})\s*([AP]M),\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*(?:\s+(\d{4}))?/i);
  if (!m) return undefined; // e.g. "Not available - Update to follow"
  const mon = MONTHS.indexOf(m[5]!.toLowerCase());
  if (mon < 0) return undefined;
  let h = +m[1]! % 12;
  if (m[3]!.toUpperCase() === 'PM') h += 12;
  let year = m[6] ? +m[6] : now.getUTCFullYear();
  if (!m[6]) {
    // no year given: choose the year that puts the date closest to `now` (handles the Dec/Jan boundary)
    const cand = [year - 1, year, year + 1].map((y) => ({ y, d: Math.abs(Date.UTC(y, mon, +m[4]!) - +now) }));
    year = cand.sort((a, b) => a.d - b.d)[0]!.y;
  }
  return londonToUtc(year, mon + 1, +m[4]!, h, +m[2]!);
}

export function normaliseNie(json: any, now = new Date()): Outage[] {
  const out: Outage[] = [];
  for (const o of json?.outageMessage ?? []) {
    const [e, n] = String(o.point?.coordinates ?? '').split(',').map((x: string) => num(x.trim()));
    if (!o.outageId || e === undefined || n === undefined) continue;
    const { lat, lon } = irishGridToWgs84(e, n);
    const planned = /planned/i.test(o.outageType ?? '');
    out.push({
      id: `nie:${o.outageId}`,
      dno: 'nie',
      type: planned ? 'planned' : 'unplanned',
      status: 'active',
      lat, lon,
      customers: num(o.numCustAffected),
      postcodes: postcodeList(o.fullPostCodes || o.postCode),
      startedAt: parseNieTime(o.startTime, now),
      etr: parseNieTime(o.estRestoreFullDateTime, now) ?? parseNieTime(o.estRestoreTime, now),
      message: o.statusMessage || undefined,
      sourceUpdatedAt: parseNieTime(o.updatedTimeStamp, now),
    });
  }
  return out;
}

export const nie: Adapter = {
  id: 'nie',
  async fetch(opts) {
    return normaliseNie(await fetchJson(URL_NIE, opts));
  },
};
