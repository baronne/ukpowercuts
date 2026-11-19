import type { Polygon, MultiPolygon } from 'geojson';

export type DnoId = 'ukpn' | 'nged' | 'ssen' | 'spen' | 'npg' | 'enwl' | 'nie';

export const DNO_NAMES: Record<DnoId, string> = {
  ukpn: 'UK Power Networks',
  nged: 'National Grid Electricity Distribution',
  ssen: 'SSEN',
  spen: 'SP Energy Networks',
  npg: 'Northern Powergrid',
  enwl: 'Electricity North West',
  nie: 'NIE Networks',
};

export interface Outage {
  /** `${dno}:${reference}` - stable across polls */
  id: string;
  dno: DnoId;
  type: 'unplanned' | 'planned';
  status: 'active' | 'restored';
  lat: number;
  lon: number;
  /** GeoJSON Polygon/MultiPolygon of the affected area, when the source provides one */
  geometry?: Polygon | MultiPolygon;
  customers?: number;
  postcodes: string[];
  /** ISO 8601 UTC */
  startedAt?: string;
  etr?: string;
  restoredAt?: string;
  message?: string;
  sourceUpdatedAt?: string;
}

export interface DnoStatus {
  ok: boolean;
  fetchedAt: string;
  count: number;
  stale?: boolean;
  error?: string;
}

export interface Adapter {
  id: DnoId;
  fetch(opts: FetchOpts): Promise<Outage[]>;
}

export interface FetchOpts {
  userAgent: string;
  apiKeys?: Partial<Record<'spen' | 'enwl', string>>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const USER_AGENT = 'uk-powercut-map/0.1 (open-source; https://github.com/baronne/ukpowercuts)';
