import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DNO_NAMES, type DnoId, type DnoStatus, type Outage } from '../../packages/core/src/schema.ts';

const API = import.meta.env.VITE_API_BASE ?? '';
const STYLE = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;
const darkMq = matchMedia('(prefers-color-scheme: dark)');

interface Now { generatedAt: string; outages: Outage[]; status: Partial<Record<DnoId, DnoStatus>> }
interface TimelinePoint { t: string; snap: string; customers: number; count: number }

const state = {
  outages: [] as Outage[],
  status: {} as Now['status'],
  generatedAt: '',
  showUnplanned: true,
  showPlanned: true,
  dnos: new Set<DnoId>(Object.keys(DNO_NAMES) as DnoId[]),
  replay: false,
  timeline: [] as TimelinePoint[],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = new Intl.NumberFormat('en-GB');
const timeFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const when = (iso?: string) => (iso ? timeFmt.format(new Date(iso)) : '');
const ago = (iso: string) => { const m = Math.round((Date.now() - +new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props as any;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}

// ---- map -------------------------------------------------------------------------------------
const map = new maplibregl.Map({
  container: 'map', style: STYLE(darkMq.matches), center: [-2.5, 54.3], zoom: 5, minZoom: 4, maxZoom: 16,
  attributionControl: { compact: true },
});
// keep the canvas in step with its container (layout shifts as the header wraps / fonts load)
new ResizeObserver(() => map.resize()).observe($('map'));
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-left');

const visible = () => state.outages.filter((o) => state.dnos.has(o.dno) && (o.type === 'planned' ? state.showPlanned : state.showUnplanned));

function toGeoJson(list: Outage[]) {
  return {
    points: { type: 'FeatureCollection' as const, features: list.map((o) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] }, properties: { id: o.id, type: o.type, customers: o.customers ?? 0 } })) },
    areas: { type: 'FeatureCollection' as const, features: list.filter((o) => o.geometry).map((o) => ({ type: 'Feature' as const, geometry: o.geometry!, properties: { id: o.id, type: o.type } })) },
  };
}

const colour = ['match', ['get', 'type'], 'planned', '#e8890c', '#d92d20'] as any;

function installLayers() {
  if (map.getSource('points')) return;
  const g = toGeoJson(visible());
  map.addSource('areas', { type: 'geojson', data: g.areas });
  map.addSource('points', { type: 'geojson', data: g.points, cluster: true, clusterRadius: 38, clusterMaxZoom: 9, clusterProperties: { customers: ['+', ['get', 'customers']] } });
  map.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': colour, 'fill-opacity': 0.22 } });
  map.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': colour, 'line-width': 1.2 } });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'points', filter: ['has', 'point_count'], paint: { 'circle-color': '#b42318', 'circle-opacity': 0.8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24] } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 }, paint: { 'text-color': '#fff' } });
  map.addLayer({
    id: 'outages', type: 'circle', source: 'points', filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': colour, 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1,
      'circle-radius': ['interpolate', ['linear'], ['max', 1, ['get', 'customers']], 1, 5, 100, 9, 1000, 15, 10000, 26],
    },
  });
}

function renderMap() {
  const g = toGeoJson(visible());
  (map.getSource('points') as maplibregl.GeoJSONSource | undefined)?.setData(g.points);
  (map.getSource('areas') as maplibregl.GeoJSONSource | undefined)?.setData(g.areas);
}

map.on('style.load', () => { installLayers(); renderMap(); });
darkMq.addEventListener('change', (e) => map.setStyle(STYLE(e.matches)));

map.on('click', 'clusters', async (e) => {
  const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
  if (!f) return;
  const zoom = await (map.getSource('points') as maplibregl.GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id);
  map.easeTo({ center: (f.geometry as any).coordinates, zoom: zoom + 0.5 });
});
map.on('click', 'outages', (e) => {
  const o = state.outages.find((x) => x.id === e.features?.[0]?.properties?.id);
  if (o) openPopup(o);
});
for (const l of ['clusters', 'outages']) {
  map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
}

let popup: maplibregl.Popup | undefined;
function openPopup(o: Outage) {
  popup?.remove();
  // all text goes through DOM text nodes: feed content is untrusted
  const body = el('div', {}, el('h3', {}, `${o.type === 'planned' ? 'Planned work' : 'Power cut'} · ${DNO_NAMES[o.dno]}`));
  const line = (t: string) => body.append(el('p', {}, t));
  if (o.customers !== undefined) line(`${fmt.format(o.customers)} customers affected`);
  if (o.startedAt) line(`${o.type === 'planned' ? 'Starts' : 'Started'}: ${when(o.startedAt)}`);
  line(o.etr ? `Estimated restoration: ${when(o.etr)}` : 'Estimated restoration: not yet available');
  if (o.postcodes.length) line(`Postcodes: ${o.postcodes.slice(0, 6).join(', ')}${o.postcodes.length > 6 ? '…' : ''}`);
  if (o.message) line(o.message.length > 200 ? o.message.slice(0, 200) + '…' : o.message);
  popup = new maplibregl.Popup({ offset: 12 }).setLngLat([o.lon, o.lat]).setDOMContent(body).addTo(map);
}

// ---- UI --------------------------------------------------------------------------------------
function renderChips() {
  const box = $('filters');
  box.replaceChildren();
  const chip = (label: string, pressed: boolean, swatch: string, onClick: () => void, title = '') => {
    const b = el('button', { class: 'chip', title }, el('span', { class: `dot ${swatch}` }), label);
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    box.append(b);
  };
  chip('Unplanned', state.showUnplanned, 'sw-unplanned', () => { state.showUnplanned = !state.showUnplanned; refresh(); });
  chip('Planned work', state.showPlanned, 'sw-planned', () => { state.showPlanned = !state.showPlanned; refresh(); });
  for (const id of Object.keys(DNO_NAMES) as DnoId[]) {
    const s = state.status[id];
    const cls = !s ? '' : s.stale ? 'stale' : s.ok ? 'ok' : '';
    const tip = !s ? 'No data yet' : s.ok ? `${DNO_NAMES[id]}: updated ${ago(s.fetchedAt)}` : `${DNO_NAMES[id]}: ${/not configured/.test(s.error ?? '') ? 'not connected yet' : `feed unavailable, showing data from ${ago(s.fetchedAt)}`}`;
    chip(id.toUpperCase(), state.dnos.has(id), cls, () => { state.dnos.has(id) ? state.dnos.delete(id) : state.dnos.add(id); refresh(); }, tip);
  }
}

function renderList() {
  const list = visible().sort((a, b) => (b.customers ?? 0) - (a.customers ?? 0)).slice(0, 300);
  $('list').replaceChildren(...list.map((o) => {
    const li = el('li', { tabIndex: 0 },
      el('div', { class: 'row' }, el('span', {}, o.postcodes[0] ?? DNO_NAMES[o.dno]), el('span', { class: 'n' }, o.customers !== undefined ? fmt.format(o.customers) : '–')),
      el('div', { class: 'sub' }, `${o.type === 'planned' ? 'Planned' : 'Unplanned'} · ${o.dno.toUpperCase()}${o.etr ? ` · back ~${when(o.etr)}` : ''}`));
    const go = () => { map.flyTo({ center: [o.lon, o.lat], zoom: Math.max(map.getZoom(), 11) }); openPopup(o); document.body.classList.remove('sheet'); $('panel').classList.remove('open'); };
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    return li;
  }));
}

function renderTotals() {
  const live = visible().filter((o) => o.type === 'unplanned');
  $('t-customers').textContent = fmt.format(live.reduce((s, o) => s + (o.customers ?? 0), 0));
  $('t-count').textContent = fmt.format(live.length);
  const stale = Object.values(state.status).some((s) => s?.stale && !/not configured/.test(s.error ?? ''));
  $('updated').textContent = state.replay ? 'Replaying history' : state.generatedAt ? `Updated ${ago(state.generatedAt)}${stale ? ' · some feeds delayed' : ''}` : '';
}

function refresh() { renderChips(); renderMap(); renderList(); renderTotals(); }

$('sheet-toggle').addEventListener('click', () => {
  const open = $('panel').classList.toggle('open');
  $('sheet-toggle').setAttribute('aria-expanded', String(open));
  $('sheet-toggle').textContent = open ? 'Map' : 'List';
});

// ---- postcode check --------------------------------------------------------------------------
const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

$('pc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = $('pc-result');
  const pc = ($('pc') as HTMLInputElement).value.trim();
  if (!pc) return;
  box.hidden = false; box.className = ''; box.textContent = 'Looking up…';
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (!res.ok) throw new Error('not found');
    const { result } = await res.json();
    const here: [number, number] = [result.latitude, result.longitude];
    const near = state.outages.filter((o) => km(here, [o.lat, o.lon]) <= 3).sort((a, b) => km(here, [a.lat, a.lon]) - km(here, [b.lat, b.lon]));
    const exact = near.find((o) => o.postcodes.some((p) => p.replace(/\s/g, '').toUpperCase() === pc.replace(/\s/g, '').toUpperCase()));
    map.flyTo({ center: [here[1], here[0]], zoom: 12 });
    if (exact) {
      box.className = 'bad';
      box.textContent = `Yes: a ${exact.type === 'planned' ? 'planned outage' : 'power cut'} lists ${result.postcode}${exact.etr ? `, estimated back ${when(exact.etr)}` : ''}. Reported by ${DNO_NAMES[exact.dno]}.`;
    } else if (near.length) {
      box.className = 'bad';
      box.textContent = `Nothing lists ${result.postcode} directly, but ${near.length} outage${near.length > 1 ? 's' : ''} within 3 km (nearest ${km(here, [near[0]!.lat, near[0]!.lon]).toFixed(1)} km, ${DNO_NAMES[near[0]!.dno]}).`;
    } else {
      box.className = 'good';
      box.textContent = `No reported outages within 3 km of ${result.postcode}. If your power is off, call 105 (free) and check your fuse board first.`;
    }
  } catch {
    box.className = 'bad';
    box.textContent = 'Postcode not recognised.';
  }
});

// ---- history replay --------------------------------------------------------------------------
function renderSpark() {
  const tl = state.timeline;
  if (tl.length < 2) return;
  const max = Math.max(...tl.map((p) => p.customers), 1);
  const pts = tl.map((p, i) => `${(i / (tl.length - 1)) * 300},${28 - (p.customers / max) * 26}`);
  $('spark').innerHTML = `<path d="M0,28 L${pts.join(' L')} L300,28 Z"></path>`; // numeric data only
}

async function loadTimeline() {
  try {
    state.timeline = await (await fetch(`${API}/api/timeline.json`)).json();
  } catch { return; }
  const s = $('slider') as HTMLInputElement;
  if (state.timeline.length < 2) return;
  s.max = String(state.timeline.length - 1);
  s.value = s.max;
  s.disabled = false;
  renderSpark();
}

let replayTimer: number | undefined;
$('slider').addEventListener('input', (e) => {
  const i = +(e.target as HTMLInputElement).value;
  const p = state.timeline[i];
  if (!p) return;
  if (i === state.timeline.length - 1) return backToLive();
  state.replay = true;
  $('replay').classList.add('active');
  $('live').hidden = false;
  $('replay-label').textContent = `${when(p.t)} · ${fmt.format(p.customers)} customers off`;
  clearTimeout(replayTimer);
  replayTimer = window.setTimeout(async () => {
    try {
      const snap = await (await fetch(`${API}/api/snapshot/${p.snap}`)).json();
      state.outages = snap.outages; state.status = snap.status; state.generatedAt = snap.t;
      refresh();
    } catch { $('replay-label').textContent = 'Snapshot unavailable for that time'; }
  }, 150);
});
$('live').addEventListener('click', backToLive);

async function backToLive() {
  state.replay = false;
  $('replay').classList.remove('active');
  $('live').hidden = true;
  $('replay-label').textContent = 'Last 7 days';
  ($('slider') as HTMLInputElement).value = ($('slider') as HTMLInputElement).max;
  await load();
}

// ---- data ------------------------------------------------------------------------------------
async function load() {
  if (state.replay) return;
  try {
    const now: Now = await (await fetch(`${API}/api/now.json`)).json();
    state.outages = now.outages; state.status = now.status; state.generatedAt = now.generatedAt;
  } catch {
    $('updated').textContent = 'Could not load data: retrying…';
    return;
  }
  refresh();
}

renderChips();
load();
loadTimeline();
setInterval(load, 60_000);

if (import.meta.env.DEV) (window as any).__map = map;
