import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DNO_NAMES, type DnoId, type DnoStatus, type Outage } from '../../packages/core/src/schema.ts';
import { searchNiPlaces } from './ni-places.ts';

const API = import.meta.env.VITE_API_BASE ?? '';
// optional tip jar: only https links are accepted, and nothing is shown when unset
const KOFI = /^https:\/\//.test(import.meta.env.VITE_KOFI_URL ?? '') ? import.meta.env.VITE_KOFI_URL! : '';
const STYLE = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;
const darkMq = matchMedia('(prefers-color-scheme: dark)');
// theme: follows the system until the visitor uses the switch, then their choice is remembered
const savedTheme = (): 'light' | 'dark' | null => { try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : null; } catch { return null; } };
const isDark = () => (savedTheme() ?? (darkMq.matches ? 'dark' : 'light')) === 'dark';

interface Now { generatedAt: string; outages: Outage[]; status: Partial<Record<DnoId, DnoStatus>> }
interface TimelinePoint { t: string; snap: string; customers: number; count: number }

// Landing pages link here with ?network=ukpn or ?at=lat,lon,zoom
const qs = new URLSearchParams(location.search);
const qNet = qs.get('network') as DnoId | null;
const qAt = (qs.get('at') ?? '').split(',').map(Number);
const qAtOk = qAt.length === 3 && qAt.every(Number.isFinite) && Math.abs(qAt[0]!) <= 90 && Math.abs(qAt[1]!) <= 180;

const state = {
  outages: [] as Outage[],
  status: {} as Now['status'],
  generatedAt: '',
  showUnplanned: true,
  showPlanned: true,
  dnos: new Set<DnoId>(qNet && qNet in DNO_NAMES ? [qNet] : (Object.keys(DNO_NAMES) as DnoId[])),
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
  container: 'map', style: STYLE(isDark()), center: qAtOk ? [qAt[1]!, qAt[0]!] : [-2.5, 54.3], zoom: qAtOk ? Math.min(Math.max(qAt[2]!, 4), 16) : 5, minZoom: 4, maxZoom: 16,
  attributionControl: { compact: true, customAttribution: 'Areas: NESO, ONS' },
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

// Network (DNO) areas: a small static file, fetched once after the map is up. Drawn under the outages so it never hides one.
let dnoData: GeoJSON.FeatureCollection | undefined;
function installDno() {
  if (!dnoData || map.getSource('dno')) return;
  const dark = isDark();
  const label = ['match', ['get', 'network'], ...(Object.keys(SHORT) as DnoId[]).flatMap((id) => [id, SHORT[id]]), ''] as any;
  map.addSource('dno', { type: 'geojson', data: dnoData });
  const below = map.getLayer('areas-fill') ? 'areas-fill' : undefined;
  map.addLayer({ id: 'dno-fill', type: 'fill', source: 'dno', filter: ['==', ['get', 'kind'], 'area'], paint: { 'fill-color': dark ? '#60a5fa' : '#2563eb', 'fill-opacity': 0 } }, below);
  map.addLayer({ id: 'dno-border', type: 'line', source: 'dno', filter: ['==', ['get', 'kind'], 'border'], paint: { 'line-color': dark ? '#9ca3af' : '#6b7280', 'line-width': 1.4, 'line-opacity': 0.85, 'line-dasharray': [3, 2] } }, below);
  map.addLayer({ id: 'dno-label', type: 'symbol', source: 'dno', maxzoom: 7.5, filter: ['==', ['get', 'kind'], 'label'], layout: { 'text-field': label, 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-letter-spacing': 0.08 }, paint: { 'text-color': dark ? '#d1d5db' : '#4b5563', 'text-halo-color': dark ? '#111827' : '#ffffff', 'text-halo-width': 1.5 } }, below);
  updateDnoHighlight();
}
// Tint the area of the one network being looked at: the only network selected, or the chip being hovered
let hoverDno: DnoId | null = null;
function updateDnoHighlight() {
  if (!map.getLayer('dno-fill')) return;
  const ids = hoverDno ? [hoverDno] : state.dnos.size === 1 ? [...state.dnos] : [];
  map.setPaintProperty('dno-fill', 'fill-opacity', ids.length ? ['case', ['in', ['get', 'network'], ['literal', ids]], isDark() ? 0.16 : 0.1, 0] : 0);
}
map.on('style.load', () => { installLayers(); installDno(); renderMap(); });
map.once('load', () => {
  fetch(`${API}/dno-areas.geojson`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { dnoData = d; if (map.isStyleLoaded() || map.getLayer('areas-fill')) installDno(); }).catch(() => { /* the map works fine without the areas */ });
});

// Tap an empty bit of the map to see who looks after that area (outages and clusters have their own handlers and win)
map.on('click', (e) => {
  const mine = ['clusters', 'outages'].filter((l) => map.getLayer(l));
  if (mine.length && map.queryRenderedFeatures(e.point, { layers: mine }).length) return;
  if (!map.getLayer('dno-fill')) return;
  const id = map.queryRenderedFeatures(e.point, { layers: ['dno-fill'] })[0]?.properties?.network as DnoId | undefined;
  if (!id || !(id in DNO_NAMES)) return;
  popup?.remove();
  const body = el('div', {}, el('h3', {}, FULL_NAME[id]), el('p', {}, REGION[id]),
    el('p', {}, id === 'nie' ? 'Power cut? Call NIE Networks on 03457 643 643.' : 'Power cut? Call 105 (free).'),
    el('p', { class: 'muted' }, 'Network boundaries are approximate.'));
  popup = new maplibregl.Popup({ offset: 8 }).setLngLat(e.lngLat).setDOMContent(body).addTo(map);
});
const themeBtn = $('theme') as HTMLButtonElement;
function syncThemeButton() {
  const label = isDark() ? 'Switch to light mode' : 'Switch to dark mode';
  themeBtn.setAttribute('aria-label', label); themeBtn.title = label;
}
syncThemeButton();
themeBtn.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* private mode: still works for this visit */ }
  syncThemeButton(); map.setStyle(STYLE(next === 'dark'));
});
darkMq.addEventListener('change', () => { if (!savedTheme()) { syncThemeButton(); map.setStyle(STYLE(isDark())); } });

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
const SHORT: Record<DnoId, string> = { ukpn: 'UKPN', nged: 'NGED', ssen: 'SSEN', spen: 'SPEN', npg: 'NPg', enwl: 'ENWL', nie: 'NIE' };
const FULL_NAME: Record<DnoId, string> = { ...DNO_NAMES, ssen: 'Scottish and Southern Electricity Networks' };
const REGION: Record<DnoId, string> = {
  ukpn: 'London, the South East and East of England',
  nged: 'Midlands, South West England and South Wales',
  ssen: 'North of Scotland and central southern England',
  spen: 'Central and southern Scotland, Merseyside, Cheshire and North Wales',
  npg: 'North East England and Yorkshire',
  enwl: 'North West England',
  nie: 'Northern Ireland',
};

function renderChips() {
  const box = $('filters');
  box.replaceChildren();
  const chip = (label: string, pressed: boolean, swatch: string, onClick: () => void, tip: string) => {
    const b = el('button', { class: 'chip', type: 'button' }, el('span', { class: `dot ${swatch}` }), label);
    b.dataset.tip = tip; // shown instantly by CSS on hover / keyboard focus
    b.setAttribute('aria-label', `${label}: ${tip.replace(/\n/g, ', ')}`);
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    box.append(b);
    return b;
  };
  chip('Unplanned', state.showUnplanned, 'sw-unplanned', () => { state.showUnplanned = !state.showUnplanned; refresh(); }, 'Unexpected power cuts\nClick to show or hide');
  chip('Planned work', state.showPlanned, 'sw-planned', () => { state.showPlanned = !state.showPlanned; refresh(); }, 'Scheduled maintenance\nClick to show or hide');
  box.append(el('span', { class: 'chip-sep' }));
  for (const id of Object.keys(DNO_NAMES) as DnoId[]) {
    const s = state.status[id];
    const cls = !s ? '' : s.stale ? 'stale' : s.ok ? 'ok' : '';
    const health = !s ? 'No data yet' : s.ok ? `Updated ${ago(s.fetchedAt)}` : /not configured/.test(s.error ?? '') ? 'Not connected yet' : `Feed unavailable, showing data from ${ago(s.fetchedAt)}`;
    const b = chip(SHORT[id], state.dnos.has(id), cls, () => { state.dnos.has(id) ? state.dnos.delete(id) : state.dnos.add(id); refresh(); }, `${FULL_NAME[id]}\n${REGION[id]}\n${health}`);
    const peek = (on: boolean) => { hoverDno = on ? id : null; updateDnoHighlight(); };
    b.addEventListener('mouseenter', () => peek(true)); b.addEventListener('mouseleave', () => peek(false));
    b.addEventListener('focus', () => peek(true)); b.addEventListener('blur', () => peek(false));
  }
}

function renderList() {
  const list = visible().sort((a, b) => (b.customers ?? 0) - (a.customers ?? 0)).slice(0, 300);
  $('list').replaceChildren(...list.map((o) => {
    const li = el('li', { tabIndex: 0 },
      el('div', { class: 'row' }, el('span', {}, o.postcodes[0] ?? DNO_NAMES[o.dno]), el('span', { class: 'n' }, o.customers !== undefined ? fmt.format(o.customers) : '–')),
      el('div', { class: 'sub' }, `${o.type === 'planned' ? 'Planned' : 'Unplanned'} · ${SHORT[o.dno]}${o.etr ? ` · back ~${when(o.etr)}` : ''}`));
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
  // a plain sentence (also useful to search engines): the figures above are only numbers
  const line = $('live-line');
  if (!state.replay && state.generatedAt) {
    const all = state.outages.filter((o) => o.type === 'unplanned');
    line.textContent = `Live now: ${fmt.format(all.reduce((s, o) => s + (o.customers ?? 0), 0))} customers without power in ${fmt.format(all.length)} power cuts across the UK, from ${Object.keys(DNO_NAMES).length} electricity networks.`;
    line.hidden = false;
  }
  const delayed = Object.values(state.status).filter((s) => s?.stale && !/not configured/.test(s.error ?? '')).length;
  setFreshness(state.replay ? 'replay' : delayed ? 'stale' : 'live',
    state.replay ? 'Replaying history' : state.generatedAt ? `Updated ${ago(state.generatedAt)}${delayed ? ` · ${delayed} feed${delayed > 1 ? 's' : ''} delayed` : ''}` : '');
}

function setFreshness(kind: 'live' | 'stale' | 'replay' | 'error', text: string) {
  $('freshness').dataset.state = kind;
  $('updated').textContent = text;
}

function refresh() { renderChips(); renderMap(); renderList(); renderTotals(); updateDnoHighlight(); }

$('sheet-toggle').addEventListener('click', () => {
  const open = $('panel').classList.toggle('open');
  $('sheet-toggle').setAttribute('aria-expanded', String(open));
  $('sheet-toggle').textContent = open ? 'Map' : 'List';
});

// ---- postcode check --------------------------------------------------------------------------
const norm = (s: string) => s.replace(/\s/g, '').toUpperCase();
const KM_PER_MILE = 1.609344;
const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

function tipLink(text: string) {
  const a = document.createElement('a');
  a.href = KOFI; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text;
  return a;
}
// About & FAQ: the text lives in index.html so search engines can read it without running the app.
const about = $('about') as HTMLDialogElement;
$('about-open').addEventListener('click', () => about.showModal());
about.addEventListener('click', (e) => { if (e.target === about) about.close(); }); // click on the backdrop closes it

const footerTip = $('tip-footer');
if (KOFI) { footerTip.append(tipLink('☕ Buy me a coffee')); } else { footerTip.hidden = true; }
// About & FAQ: point the support link at Ko-fi, or leave the whole question out when no tip link is configured
if (KOFI) ($('tip-about') as HTMLAnchorElement).href = KOFI; else $('support-faq').hidden = true;

const box = $('pc-result');
function showResult(kind: '' | 'good' | 'bad', title: string, detail = '', extra?: Node) {
  const close = el('button', { type: 'button', class: 'close', ariaLabel: 'Close' }, '×');
  close.addEventListener('click', hideResult);
  const body = el('div', { class: 'res-body' }, el('strong', {}, title));
  if (detail) body.append(el('span', {}, detail));
  if (extra) body.append(extra);
  box.className = kind; box.hidden = false;
  box.replaceChildren(el('span', { class: 'res-icon' }, kind === 'good' ? '✓' : kind === 'bad' ? '!' : '…'), body, close);
}
function hideResult() { box.hidden = true; box.replaceChildren(); }
$('pc').addEventListener('input', (e) => { if (!(e.target as HTMLInputElement).value) hideResult(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) hideResult(); });

// Nearby-outage check shared by postcodes, partial postcodes and place names.
const callLine = (country?: string) => country === 'Northern Ireland'
  ? 'If your power is off, check your fuse box first, then call NIE Networks on 03457 643 643.'
  : 'If your power is off, check your fuse box first, then call 105 (free).';

function checkArea(label: string, here: [number, number], radius: number /* miles */, country?: string, pc?: string) {
  const near = state.outages.filter((o) => km(here, [o.lat, o.lon]) <= radius * KM_PER_MILE).sort((a, b) => km(here, [a.lat, a.lon]) - km(here, [b.lat, b.lon]));
  const exact = pc ? near.find((o) => o.postcodes.some((p) => norm(p) === norm(pc))) : undefined;
  map.flyTo({ center: [here[1], here[0]], zoom: 12 - Math.log2(Math.max(radius, 2) / 2) * 0.75 }); // wider area, further out (15 miles is about zoom 10)
  if (exact) {
    showResult('bad', `${exact.type === 'planned' ? 'Planned work' : 'Power cut'} affecting ${label}`,
      `${exact.etr ? `Estimated back ${when(exact.etr)}. ` : ''}Reported by ${DNO_NAMES[exact.dno]}.`);
  } else if (near.length && pc) {
    showResult('bad', `${near.length} outage${near.length > 1 ? 's' : ''} within ${radius} miles of ${label}`,
      `None lists your postcode directly. Nearest is ${(km(here, [near[0]!.lat, near[0]!.lon]) / KM_PER_MILE).toFixed(1)} miles away (${DNO_NAMES[near[0]!.dno]}).`);
  } else if (near.length) {
    const planned = near.filter((o) => o.type === 'planned').length;
    showResult('bad', `${near.length} outage${near.length > 1 ? 's' : ''} within ${radius} miles of ${label}`,
      `${near.length - planned} unplanned, ${planned} planned. Zoom in on the map for details.`);
  } else {
    let tip: HTMLElement | undefined;
    if (KOFI) { // only in the all-clear case, never next to an outage
      tip = el('span', { class: 'tip' }, 'Found this useful? ', tipLink('Buy me a coffee'), ' to help cover running costs.');
    }
    showResult('good', `No reported power cuts near ${label}`, `${pc ? '' : `Checked within ${radius} miles of the centre. `}${callLine(country)}`, tip);
  }
}

interface PlaceHit { name_1: string; local_type: string; county_unitary: string | null; region: string | null; country: string; latitude: number; longitude: number; min_eastings?: number | null; max_eastings?: number | null; min_northings?: number | null; max_northings?: number | null; miles?: number }
const PLACE_RANK: Record<string, number> = { City: 0, Town: 1, 'Suburban Area': 2, Village: 3 };
// Search radius in miles. Sized from the place's own bounding box (in metres, from postcodes.io) so a big city like London
// isn't judged on a small circle: half the box's diagonal covers the whole built-up area. Never smaller than a floor for
// the type of place, and never more than 15 miles, so an all-clear still means something. Northern Ireland places come from our own list with a fixed radius.
const MAX_MILES = 15;
function placeRadius(p: PlaceHit) {
  if (p.miles) return p.miles;
  const floor = p.local_type === 'City' ? 5 : p.local_type === 'Town' || p.local_type === 'Suburban Area' ? 3 : 2;
  const { min_eastings: e0, max_eastings: e1, min_northings: n0, max_northings: n1 } = p;
  if (e0 == null || e1 == null || n0 == null || n1 == null) return floor;
  const half = Math.hypot(e1 - e0, n1 - n0) / 2 / (KM_PER_MILE * 1000);
  return Math.min(MAX_MILES, Math.max(floor, Math.round(half)));
}
const placeLabel = (p: PlaceHit) => `${p.name_1}${p.county_unitary && p.county_unitary !== p.name_1 ? `, ${p.county_unitary}` : ''}`;

async function searchPlace(q: string) {
  // Northern Ireland towns come from a small bundled list (postcodes.io's place search is Great Britain only)
  const ni: PlaceHit[] = searchNiPlaces(q).map((p) => ({ name_1: p.name, local_type: p.type, county_unitary: p.county, region: null, country: 'Northern Ireland', latitude: p.lat, longitude: p.lon, miles: p.miles }));
  let gb: PlaceHit[] = [];
  try {
    const res = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=10`);
    if (res.ok) gb = (await res.json()).result ?? [];
  } catch { /* offline or blocked: fall back to the Northern Ireland list */ }
  const hits = [...ni, ...gb];
  if (!hits.length) return showResult('bad', 'Place not found', 'Try a postcode, or the name of a town or city in the UK, e.g. Hexham or Omagh. Villages and neighbourhoods may need a postcode.');
  hits.sort((a, b) => (PLACE_RANK[a.local_type] ?? 9) - (PLACE_RANK[b.local_type] ?? 9));
  const go = (p: PlaceHit) => checkArea(placeLabel(p), [p.latitude, p.longitude], placeRadius(p), p.country);
  // one match, or a city/town that clearly outranks the rest: use it. Otherwise ask.
  const [first, second] = hits;
  const r1 = PLACE_RANK[first!.local_type] ?? 9;
  if (hits.length === 1 || (r1 <= 1 && r1 < (PLACE_RANK[second!.local_type] ?? 9))) return go(first!);
  const picks = el('div', { class: 'picks' });
  for (const p of hits.slice(0, 6)) {
    const b = el('button', { type: 'button', class: 'pick' }, `${placeLabel(p)} · ${p.local_type}`);
    b.addEventListener('click', () => go(p));
    picks.append(b);
  }
  showResult('', 'Which one did you mean?', 'Several places match.', picks);
}

$('pc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = ($('pc') as HTMLInputElement).value.trim();
  if (!input) { ($('pc') as HTMLInputElement).focus(); return; }
  showResult('', 'Checking…');
  try {
    // anything with a digit is a postcode (full, or just the first half such as NR14); otherwise it's a place name
    if (!/\d/.test(input)) return await searchPlace(input);
    const code = norm(input);
    const outcode = /^[A-Z]{1,2}\d[A-Z\d]?$/.test(code);
    const res = await fetch(`https://api.postcodes.io/${outcode ? 'outcodes' : 'postcodes'}/${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error('not found');
    const { result } = await res.json();
    if (outcode) return checkArea(result.outcode, [result.latitude, result.longitude], 3, result.country?.[0]);
    checkArea(result.postcode, [result.latitude, result.longitude], 2, result.country, input);
  } catch {
    showResult('bad', 'Not recognised', 'Check it and try again, e.g. SW1A 1AA, or the name of a town.');
  }
});

const IDLE_LABEL = 'Customers off over time · drag to replay';
// ---- history replay --------------------------------------------------------------------------
function renderSpark() {
  const tl = state.timeline;
  // With only a few hours of history the chart is just a flat slab, so wait until there is a shape to show.
  $('spark').classList.toggle('on', tl.length >= 12);
  if (tl.length < 12) return;
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
  $('replay-label').textContent = IDLE_LABEL;
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
    setFreshness('error', 'Could not load data, retrying…');
    return;
  }
  refresh();
}

renderChips();
load();
loadTimeline();
setInterval(load, 60_000);

if (import.meta.env.DEV) (window as any).__map = map;
