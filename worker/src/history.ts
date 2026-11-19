import type { DnoId, DnoStatus, Outage } from '@powercut/core';

export const RETENTION_MS = 7 * 24 * 3600 * 1000;

export interface HistoryEntry {
  id: string;
  dno: DnoId;
  type: Outage['type'];
  lat: number;
  lon: number;
  postcodes: string[];
  startedAt?: string;
  firstSeen: string;
  lastSeen: string;
  peakCustomers: number;
  /** set once the outage is reported restored or disappears from a healthy feed */
  restoredAt?: string;
}

export type HistoryIndex = Record<string, HistoryEntry>;

/**
 * Fold the current poll into the rolling history. `okDnos` are the DNOs fetched successfully this poll:
 * an outage missing from a *failed* feed must not be treated as restored.
 */
export function updateHistory(prev: HistoryIndex, current: Outage[], okDnos: Set<DnoId>, nowIso: string): HistoryIndex {
  const next: HistoryIndex = {};
  const seen = new Set<string>();
  for (const o of current) {
    seen.add(o.id);
    const p = prev[o.id];
    next[o.id] = {
      id: o.id, dno: o.dno, type: o.type, lat: o.lat, lon: o.lon, postcodes: o.postcodes,
      startedAt: o.startedAt ?? p?.startedAt,
      firstSeen: p?.firstSeen ?? nowIso,
      lastSeen: nowIso,
      peakCustomers: Math.max(p?.peakCustomers ?? 0, o.customers ?? 0),
      restoredAt: o.status === 'restored' ? (o.restoredAt ?? p?.restoredAt ?? nowIso) : undefined,
    };
  }
  const cutoff = +new Date(nowIso) - RETENTION_MS;
  for (const [id, e] of Object.entries(prev)) {
    if (seen.has(id)) continue;
    if (+new Date(e.lastSeen) < cutoff) continue; // pruned
    next[id] = !e.restoredAt && okDnos.has(e.dno) ? { ...e, restoredAt: e.lastSeen } : e;
  }
  return next;
}

export interface TimelinePoint {
  t: string;
  /** snapshot key (`YYYY-MM-DD/HHMM`) closest to this hour */
  snap: string;
  customers: number;
  count: number;
  byDno: Partial<Record<DnoId, number>>;
}

export function timelinePoint(outages: Outage[], t: string, snap: string): TimelinePoint {
  const byDno: Partial<Record<DnoId, number>> = {};
  let customers = 0, count = 0;
  for (const o of outages) {
    if (o.status !== 'active' || o.type !== 'unplanned') continue;
    count++;
    customers += o.customers ?? 0;
    byDno[o.dno] = (byDno[o.dno] ?? 0) + (o.customers ?? 0);
  }
  return { t, snap, customers, count, byDno };
}

export function pruneTimeline(tl: TimelinePoint[], nowIso: string): TimelinePoint[] {
  const cutoff = +new Date(nowIso) - RETENTION_MS;
  return tl.filter((p) => +new Date(p.t) >= cutoff);
}

export function snapshotKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}/${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** Entries whose lifetime overlaps the UTC day `YYYY-MM-DD`. */
export function entriesForDay(index: HistoryIndex, day: string, exclude: Set<string>): HistoryEntry[] {
  const start = +new Date(`${day}T00:00:00Z`), end = start + 86400_000;
  return Object.values(index).filter((e) => {
    if (exclude.has(e.dno)) return false;
    const from = +new Date(e.startedAt ?? e.firstSeen);
    const to = e.restoredAt ? +new Date(e.restoredAt) : Infinity;
    return from < end && to >= start;
  });
}

const CSV_COLS = ['id', 'dno', 'type', 'lat', 'lon', 'postcodes', 'startedAt', 'firstSeen', 'lastSeen', 'restoredAt', 'peakCustomers'] as const;
export function toCsv(entries: HistoryEntry[]): string {
  const esc = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(' ') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLS.join(','), ...entries.map((e) => CSV_COLS.map((c) => esc(e[c])).join(','))].join('\n') + '\n';
}

export type StatusMap = Partial<Record<DnoId, DnoStatus>>;
