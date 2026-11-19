import type { FetchOpts } from './schema.ts';
import { fetchJson } from './util.ts';

/** Full dataset export from an Opendatasoft portal (all four DNO portals share this API). */
export function fetchOdsExport<T = any>(host: string, dataset: string, opts: FetchOpts, apiKey?: string, where?: string): Promise<T[]> {
  const q = new URLSearchParams();
  if (where) q.set('where', where);
  if (apiKey) q.set('apikey', apiKey);
  const qs = q.toString();
  return fetchJson<T[]>(`https://${host}/api/explore/v2.1/catalog/datasets/${dataset}/exports/json${qs ? `?${qs}` : ''}`, opts);
}
