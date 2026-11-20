# UK Power Cuts

An open-source, single live map of power cuts across **every** UK electricity network (UKPN, NGED, SSEN, SPEN, Northern Powergrid, Electricity North West, NIE Networks), with 7 days of history: **[ukpowercuts.uk](https://ukpowercuts.uk)**. Born from a thread on r/UKPreppers asking for exactly this.

> Not an official source. If your power is off, call **105** (free; England, Scotland and Wales). In Northern Ireland call NIE Networks on **03457 643 643**.

Free, no ads. If it's useful to you, you can chip in towards the running costs:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R2U62AXSPZ)

## How it works

- `packages/core` – one adapter per network that normalises its public feed into a single `Outage` shape (pure functions, tested against recorded real responses in `test/fixtures`).
- `worker` – Cloudflare Worker. A cron every 5 minutes polls all feeds, writes `latest.json` plus a gzipped snapshot to R2, and updates a rolling 7-day history. Hourly it adds a timeline point, prunes old snapshots and (at 00:xx UTC) writes the previous day's export. If a feed fails, its last good data is carried forward and flagged stale.
- `web` – static MapLibre GL JS app (OpenFreeMap tiles, no API key), postcode check via postcodes.io, 7-day replay slider.

API (for the site itself): `/api/now.json`, `/api/status.json`, `/api/timeline.json`, `/api/history.json`, `/api/snapshot/YYYY-MM-DD/HHMM`. The site and API share one origin; other sites only get CORS if listed in `ALLOWED_ORIGINS` (`worker/wrangler.toml`). Daily exports are written to R2 under `exports/` but only served at `/exports/` when `PUBLIC_EXPORTS = "true"`. Want the data? Open a [data access request](https://github.com/baronne/ukpowercuts/issues/new/choose).

## Develop

```bash
npm install
npm test                 # adapter + history tests
npm run probe            # fetch every live feed once, refresh fixtures, print field summary
npm run dev:worker       # Worker on :8787  (then: curl localhost:8787/__poll)
npm run dev:web          # map on :5173, proxies /api to the Worker
```

Pull requests run typecheck, tests and a full build in GitHub Actions (`.github/workflows/ci.yml`); it never deploys and uses no secrets.

## Data sources

| Network | Source | Key |
|---|---|---|
| UKPN | Opendatasoft `ukpn-live-faults` + `ukpn-national-energy-outage` (CC BY 4.0) | no |
| NGED | CKAN `connecteddata.nationalgrid.co.uk` Live Detailed Power Cuts | no |
| SSEN | `…/opendataportal-prd/v4/api/getallfaults` | no |
| Northern Powergrid | Opendatasoft `live-power-cuts-data` | no |
| NIE Networks | `powercheck.nienetworks.co.uk` faults API (Irish Grid coordinates, converted) | no |
| SPEN | Opendatasoft `national-energy-outage-data` (CC BY 4.0) | **free account** |
| Electricity North West | Opendatasoft `live_incidents` (CC BY 4.0) | **free account** |

Network areas (the dashed lines and tap-to-identify) come from NESO's "GIS Boundaries for GB DNO Licence Areas" (NESO Open Data Licence; "Supported by National Energy SO Open Data"), merged into the seven networks, plus Northern Ireland's outline from the ONS "Countries (December 2024) Boundaries UK BUC" (OGL v3.0; contains OS data © Crown copyright and database right 2024). They are simplified and approximate. The result is committed as `web/public/dno-areas.geojson`; to refresh it when NESO publishes a newer file, download both GeoJSON files and run `scripts/build-dno-areas.sh <neso.geojson> <ons-countries.geojson>` (needs `npx` and `python3`).

Known limits: UKPN and ENWL omit very small faults; SPEN publishes no customer counts; SSEN and NIE state no licence, so they are shown live with attribution but left out of the bulk daily exports (`EXPORT_EXCLUDE`) until confirmed.

## Deploy (Cloudflare)

One Worker (`worker/`) serves the static site, the `/api/*` endpoints and the 5-minute cron, so there is a single deployment and no CORS.

```bash
npx wrangler login
npx wrangler r2 bucket create uk-powercut-map
npx wrangler secret put SPEN_KEY --config worker/wrangler.toml       # optional, enables SPEN
npx wrangler secret put ENWL_KEY --config worker/wrangler.toml       # optional, enables ENWL
VITE_KOFI_URL=https://ko-fi.com/<name> npm run deploy                # builds the site, then deploys the Worker
```

To use your own domain, add it under the Worker's Settings → Domains & Routes (the domain's DNS must be on Cloudflare).

### Keeping costs at zero
Cloudflare has no hard spending cap on R2, so the design keeps usage far inside the free tier (10 GB, 1M Class A, 10M Class B per month):
- Only the cron writes to R2 (about 26k writes a month). There is no public write path.
- Public reads are answered from a short in-memory cache in the Worker, so R2 reads and list calls are bounded however much traffic arrives. Paths that cannot exist are rejected without touching R2.
- Snapshots are pruned after 7 days; daily exports are small.
- Also set a Cloudflare billing alert (Notifications, usage-based billing) and consider a card with a low limit.

Before launch: ask SSEN / NIE / Northern Powergrid about reuse terms (SSEN and NIE are kept out of the bulk exports until they confirm).

## Support

The map and data are free and always will be: no ads, no paywalls. If it helped you, you can [buy me a coffee](https://ko-fi.com/baronne) towards hosting and the domain. To show the tip link on your own deployment, build with `VITE_KOFI_URL=https://ko-fi.com/<name>`; with it unset, no tip UI appears.

## Privacy

No cookies, analytics, ads or accounts. The only thing stored on a visitor's device is the light/dark choice, and only if they press the switch. Searches go from the browser to postcodes.io; map tiles come from OpenFreeMap. See `/privacy/` (generated by `scripts/build-pages.ts`). **Before adding anything that sets a cookie or reads the device (analytics, embeds, fonts from a CDN), update that page and add a consent banner first**: UK PECR and the EU ePrivacy rules require it.

## Licence

MIT. Outage data remains the property of, and is licensed by, each network operator.
