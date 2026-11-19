/**
 * Fetch every DNO source once, save raw responses as fixtures and print a field summary.
 * Usage: npm run probe
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { USER_AGENT } from '../packages/core/src/schema.ts';

const OUT = new URL('../packages/core/test/fixtures/', import.meta.url);
await mkdir(OUT, { recursive: true });

const ods = (host: string, id: string, extra = '') =>
  `https://${host}/api/explore/v2.1/catalog/datasets/${id}/records?limit=100${extra}`;

const sources: Record<string, string> = {
  'ukpn-live-faults': ods('ukpowernetworks.opendatasoft.com', 'ukpn-live-faults'),
  'ukpn-neo': ods('ukpowernetworks.opendatasoft.com', 'ukpn-national-energy-outage'),
  'npg-live': ods('northernpowergrid.opendatasoft.com', 'live-power-cuts-data'),
  'ssen-getallfaults': 'https://external.distribution.prd.ssen.co.uk/opendataportal-prd/v4/api/getallfaults',
  'ssen-livefaults': 'https://ssen-powertrack-api.opcld.com/gridiview/reporter/info/livefaults',
  'nie-faults': 'https://powercheck.nienetworks.co.uk/NIEPowerCheckerWebAPI/api/faults',
  'nged-292f': 'https://connecteddata.nationalgrid.co.uk/api/3/action/datastore_search?resource_id=292f788f-4339-455b-8cc0-153e14509d4d&limit=100',
  'nged-a136': 'https://connecteddata.nationalgrid.co.uk/api/3/action/datastore_search?resource_id=a1365982-4e05-463c-8304-8323a2ba0ccd&limit=100',
  'spen-live': ods('spenergynetworks.opendatasoft.com', 'national-energy-outage-data'),
  'enwl-live': ods('electricitynorthwest.opendatasoft.com', 'live_incidents'),
};

const keys: Record<string, string | undefined> = {
  'spen-live': process.env.SPEN_KEY,
  'enwl-live': process.env.ENWL_KEY,
};

for (const [name, url0] of Object.entries(sources)) {
  const key = keys[name];
  const url = key ? `${url0}&apikey=${key}` : url0;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`${name.padEnd(18)} HTTP ${res.status} ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
      continue;
    }
    const json = JSON.parse(text);
    await writeFile(new URL(`${name}.json`, OUT), JSON.stringify(json, null, 1));
    const rows = json.results ?? json.faults ?? json.Faults ?? json.outageMessage ?? json.result?.records ?? [];
    const first = rows[0] ?? {};
    console.log(`${name.padEnd(18)} OK  rows=${rows.length}  fields=${Object.keys(first).join(',')}`);
  } catch (e) {
    console.log(`${name.padEnd(18)} FAIL ${(e as Error).message}`);
  }
}
