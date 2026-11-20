// Writes the search landing pages into web/dist after `vite build`: one per network, one per city, plus a hub page,
// and regenerates sitemap.xml to list them all. Plain static HTML (no framework), so search engines can read the
// text without running any JavaScript; a tiny inline script then fills in the live figures from /api/now.json.
// Run by `npm run build:web`. Nothing here touches secrets or the data feeds.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DNO_NAMES, type DnoId } from '../packages/core/src/schema.ts';

const SITE = 'https://ukpowercuts.uk';
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
if (!existsSync(join(DIST, 'index.html'))) throw new Error('web/dist is missing: run the site build first');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Network { id: DnoId; slug: string; short: string; full: string; area: string; phone: string; note: string }
const NETWORKS: Network[] = [
  { id: 'ukpn', slug: 'ukpn', short: 'UKPN', full: 'UK Power Networks', area: 'London, the South East and the East of England', phone: '105', note: 'UK Power Networks runs three regional networks: London Power Networks, South Eastern Power Networks and Eastern Power Networks.' },
  { id: 'nged', slug: 'nged', short: 'NGED', full: 'National Grid Electricity Distribution', area: 'the Midlands, the South West of England and South Wales', phone: '105', note: 'National Grid Electricity Distribution was formerly Western Power Distribution (WPD). It runs the East Midlands, West Midlands, South West and South Wales networks.' },
  { id: 'ssen', slug: 'ssen', short: 'SSEN', full: 'Scottish and Southern Electricity Networks', area: 'the north of Scotland and central southern England', phone: '105', note: 'SSEN Distribution covers the north of Scotland, including the Highlands and Islands, and a large part of central southern England, including Hampshire, Berkshire and Oxfordshire.' },
  { id: 'spen', slug: 'spen', short: 'SPEN', full: 'SP Energy Networks', area: 'central and southern Scotland, Merseyside, Cheshire and North Wales', phone: '105', note: 'SP Energy Networks runs SP Distribution (central and southern Scotland) and SP Manweb (Merseyside, Cheshire and North Wales).' },
  { id: 'npg', slug: 'northern-powergrid', short: 'Northern Powergrid', full: 'Northern Powergrid', area: 'the North East of England and Yorkshire', phone: '105', note: 'Northern Powergrid covers the North East of England, Yorkshire and northern Lincolnshire.' },
  { id: 'enwl', slug: 'enwl', short: 'ENWL', full: 'Electricity North West', area: 'the North West of England', phone: '105', note: 'Electricity North West looks after the power lines and cables across Greater Manchester, Lancashire, Cumbria and Cheshire’s northern edge.' },
  { id: 'nie', slug: 'nie-networks', short: 'NIE Networks', full: 'NIE Networks', area: 'Northern Ireland', phone: '03457 643 643', note: 'NIE Networks owns and runs the electricity network across Northern Ireland. The 105 number does not work there, so call NIE Networks directly.' },
];
const NET = Object.fromEntries(NETWORKS.map((n) => [n.id, n])) as Record<DnoId, Network>;

interface Place { slug: string; name: string; nation: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'; lat: number; lon: number; r: number; net: DnoId }
const PLACES: Place[] = [
  { slug: 'london', name: 'London', nation: 'England', lat: 51.507, lon: -0.128, r: 24, net: 'ukpn' },
  { slug: 'brighton', name: 'Brighton', nation: 'England', lat: 50.823, lon: -0.137, r: 15, net: 'ukpn' },
  { slug: 'norwich', name: 'Norwich', nation: 'England', lat: 52.63, lon: 1.297, r: 15, net: 'ukpn' },
  { slug: 'cambridge', name: 'Cambridge', nation: 'England', lat: 52.205, lon: 0.119, r: 15, net: 'ukpn' },
  { slug: 'ipswich', name: 'Ipswich', nation: 'England', lat: 52.057, lon: 1.148, r: 15, net: 'ukpn' },
  { slug: 'birmingham', name: 'Birmingham', nation: 'England', lat: 52.486, lon: -1.89, r: 20, net: 'nged' },
  { slug: 'coventry', name: 'Coventry', nation: 'England', lat: 52.408, lon: -1.51, r: 15, net: 'nged' },
  { slug: 'wolverhampton', name: 'Wolverhampton', nation: 'England', lat: 52.587, lon: -2.128, r: 12, net: 'nged' },
  { slug: 'leicester', name: 'Leicester', nation: 'England', lat: 52.637, lon: -1.135, r: 15, net: 'nged' },
  { slug: 'nottingham', name: 'Nottingham', nation: 'England', lat: 52.954, lon: -1.15, r: 15, net: 'nged' },
  { slug: 'derby', name: 'Derby', nation: 'England', lat: 52.922, lon: -1.476, r: 15, net: 'nged' },
  { slug: 'stoke-on-trent', name: 'Stoke-on-Trent', nation: 'England', lat: 53.003, lon: -2.179, r: 15, net: 'nged' },
  { slug: 'bristol', name: 'Bristol', nation: 'England', lat: 51.454, lon: -2.588, r: 20, net: 'nged' },
  { slug: 'exeter', name: 'Exeter', nation: 'England', lat: 50.726, lon: -3.527, r: 15, net: 'nged' },
  { slug: 'plymouth', name: 'Plymouth', nation: 'England', lat: 50.375, lon: -4.143, r: 15, net: 'nged' },
  { slug: 'cardiff', name: 'Cardiff', nation: 'Wales', lat: 51.481, lon: -3.179, r: 20, net: 'nged' },
  { slug: 'swansea', name: 'Swansea', nation: 'Wales', lat: 51.621, lon: -3.944, r: 15, net: 'nged' },
  { slug: 'southampton', name: 'Southampton', nation: 'England', lat: 50.904, lon: -1.404, r: 15, net: 'ssen' },
  { slug: 'portsmouth', name: 'Portsmouth', nation: 'England', lat: 50.819, lon: -1.088, r: 12, net: 'ssen' },
  { slug: 'reading', name: 'Reading', nation: 'England', lat: 51.454, lon: -0.978, r: 15, net: 'ssen' },
  { slug: 'oxford', name: 'Oxford', nation: 'England', lat: 51.752, lon: -1.258, r: 15, net: 'ssen' },
  { slug: 'aberdeen', name: 'Aberdeen', nation: 'Scotland', lat: 57.149, lon: -2.094, r: 15, net: 'ssen' },
  { slug: 'inverness', name: 'Inverness', nation: 'Scotland', lat: 57.478, lon: -4.224, r: 20, net: 'ssen' },
  { slug: 'dundee', name: 'Dundee', nation: 'Scotland', lat: 56.462, lon: -2.971, r: 15, net: 'ssen' },
  { slug: 'glasgow', name: 'Glasgow', nation: 'Scotland', lat: 55.864, lon: -4.252, r: 20, net: 'spen' },
  { slug: 'edinburgh', name: 'Edinburgh', nation: 'Scotland', lat: 55.953, lon: -3.188, r: 20, net: 'spen' },
  { slug: 'liverpool', name: 'Liverpool', nation: 'England', lat: 53.408, lon: -2.992, r: 20, net: 'spen' },
  { slug: 'manchester', name: 'Manchester', nation: 'England', lat: 53.481, lon: -2.243, r: 20, net: 'enwl' },
  { slug: 'preston', name: 'Preston', nation: 'England', lat: 53.759, lon: -2.703, r: 15, net: 'enwl' },
  { slug: 'leeds', name: 'Leeds', nation: 'England', lat: 53.8, lon: -1.549, r: 20, net: 'npg' },
  { slug: 'bradford', name: 'Bradford', nation: 'England', lat: 53.795, lon: -1.759, r: 12, net: 'npg' },
  { slug: 'sheffield', name: 'Sheffield', nation: 'England', lat: 53.381, lon: -1.47, r: 15, net: 'npg' },
  { slug: 'hull', name: 'Hull', nation: 'England', lat: 53.744, lon: -0.336, r: 15, net: 'npg' },
  { slug: 'york', name: 'York', nation: 'England', lat: 53.959, lon: -1.082, r: 15, net: 'npg' },
  { slug: 'newcastle', name: 'Newcastle upon Tyne', nation: 'England', lat: 54.978, lon: -1.618, r: 20, net: 'npg' },
  { slug: 'sunderland', name: 'Sunderland', nation: 'England', lat: 54.906, lon: -1.383, r: 12, net: 'npg' },
  { slug: 'middlesbrough', name: 'Middlesbrough', nation: 'England', lat: 54.574, lon: -1.235, r: 12, net: 'npg' },
  { slug: 'belfast', name: 'Belfast', nation: 'Northern Ireland', lat: 54.597, lon: -5.93, r: 20, net: 'nie' },
];

const mi = (km: number) => Math.round(km / 1.609344); // radii are stored in km; people read miles
const BASE = '/power-cuts/';
const urlNet = (n: Network) => `${BASE}${n.slug}/`;
const urlPlace = (p: Place) => `${BASE}${p.slug}/`;

const CSS = `
:root{--bg:#fff;--fg:#15181d;--muted:#5d6673;--line:#e4e7eb;--sunken:#f5f6f8;--accent:#0b5cff;--bad:#d92d20;--ok:#1a8f4d;color-scheme:light}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#11151a;--fg:#eceff3;--muted:#9aa4b2;--line:#262d36;--sunken:#1c222a;--accent:#6b9bff;--bad:#ff6b5e;--ok:#3fc27a;color-scheme:dark}}
:root[data-theme=dark]{--bg:#11151a;--fg:#eceff3;--muted:#9aa4b2;--line:#262d36;--sunken:#1c222a;--accent:#6b9bff;--bad:#ff6b5e;--ok:#3fc27a;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:2px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
.top a.brand{color:inherit;font-weight:700;text-decoration:none}
.top a.cta{padding:7px 14px;border-radius:9px;background:var(--accent);color:var(--bg);font-weight:600;text-decoration:none;white-space:nowrap}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px 40px}
nav.crumbs{font-size:13px;color:var(--muted);margin-bottom:6px}nav.crumbs a{color:inherit}
h1{font-size:clamp(24px,5vw,32px);line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:19px;margin:30px 0 8px}
p{margin:0 0 12px}.muted{color:var(--muted)}
.big{display:flex;flex-wrap:wrap;gap:8px 28px;margin:14px 0;padding:14px 16px;background:var(--sunken);border:1px solid var(--line);border-radius:12px}
.big div{display:grid}.big strong{font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}.big span{font-size:13px;color:var(--muted)}
.big .bad strong{color:var(--bad)}
#status{font-size:14px;color:var(--muted);margin:0 0 10px}
ol.outs{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}
ol.outs li{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line)}ol.outs li:last-child{border:0}
ol.outs .sub{display:block;font-size:13px;color:var(--muted)}ol.outs .n{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;padding:2px 10px;margin:0 6px 6px 0;border:1px solid var(--line);border-radius:999px;font-size:14px;text-decoration:none;background:var(--bg)}
.pill:hover{border-color:var(--accent)}
.warn{padding:12px 14px;border-left:4px solid var(--bad);background:var(--sunken);border-radius:6px;margin:18px 0}
ul.tidy{margin:0 0 12px;padding-left:20px}ul.tidy li{margin:3px 0}
footer{border-top:1px solid var(--line);padding:16px;font-size:13px;color:var(--muted);text-align:center}footer a{color:inherit}
`;

const THEME = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

// Fills #live from /api/now.json. All feed text goes in through textContent: it is untrusted.
const LIVE_JS = `(function(){
var m=document.getElementById('live'),f=new Intl.NumberFormat('en-GB'),tf=new Intl.DateTimeFormat('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
function km(a,b,c,d){var r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,h=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)*Math.sin(y/2);return 12742*Math.asin(Math.sqrt(h))}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}
fetch('/api/now.json').then(function(r){return r.json()}).then(function(d){
 var dno=m.dataset.dno,lat=+m.dataset.lat,lon=+m.dataset.lon,rad=+m.dataset.r,names=JSON.parse(m.dataset.names);
 var all=d.outages.filter(function(o){return o.status==='active'||!o.status});
 var list=all.filter(function(o){return dno?o.dno===dno:km(lat,lon,o.lat,o.lon)<=rad});
 var un=list.filter(function(o){return o.type!=='planned'}),pl=list.filter(function(o){return o.type==='planned'});
 var cust=un.reduce(function(s,o){return s+(o.customers||0)},0);
 var big=document.getElementById('big');big.replaceChildren();
 [['bad',f.format(cust),'customers without power'],['bad',f.format(un.length),'power cuts'],['',f.format(pl.length),'planned works']].forEach(function(a){var b=el('div',a[0]);b.append(el('strong','',a[1]),el('span','',a[2]));big.append(b)});
 var st=document.getElementById('status'),t=new Date(d.generatedAt),mins=Math.max(0,Math.round((Date.now()-t)/60000));
 st.textContent='Updated '+(mins<1?'just now':mins<90?mins+' min ago':Math.round(mins/60)+' h ago')+(un.length?'':'. No unplanned power cuts reported '+(dno?'by this network':'in this area')+' right now.');
 var ol=document.getElementById('outs');ol.replaceChildren();
 list.sort(function(a,b){return (b.customers||0)-(a.customers||0)}).slice(0,15).forEach(function(o){
  var li=el('li'),l=el('div'),pc=o.postcodes&&o.postcodes[0];
  l.append(el('strong','',pc||names[o.dno]),el('span','sub',(o.type==='planned'?'Planned work':'Power cut')+' \\u00b7 '+names[o.dno]+(o.etr?' \\u00b7 back about '+tf.format(new Date(o.etr)):'')));
  li.append(l,el('span','n',o.customers!==undefined?f.format(o.customers):'\\u2013'));ol.append(li)});
 ol.hidden=!list.length;
}).catch(function(){document.getElementById('status').textContent='Live figures are unavailable right now. Open the live map for the latest.'});
})();`;

interface Page { path: string; title: string; description: string; h1: string; body: string; crumbs: [string, string][]; live?: { dno?: DnoId; lat?: number; lon?: number; r?: number }; mapHref: string }

const LD = (p: Page) => JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: p.title, url: SITE + p.path, description: p.description, isPartOf: { '@type': 'WebSite', name: 'UK Power Cuts', url: SITE + '/' }, inLanguage: 'en-GB' },
    { '@type': 'BreadcrumbList', itemListElement: p.crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) },
  ],
}).replace(/</g, '\\u003c');

const NAMES_JSON = esc(JSON.stringify(DNO_NAMES));
// Optional tip link, from the same variable the app uses; nothing tip-related is written when it is unset
const KOFI = /^https:\/\//.test(process.env.VITE_KOFI_URL ?? '') ? esc(process.env.VITE_KOFI_URL!) : '';

function render(p: Page): string {
  const live = p.live
    ? `<main id="live" class="wrap" data-names="${NAMES_JSON}"${p.live.dno ? ` data-dno="${p.live.dno}"` : ''}${p.live.lat !== undefined ? ` data-lat="${p.live.lat}" data-lon="${p.live.lon}" data-r="${p.live.r}"` : ''}>`
    : '<main class="wrap">';
  const crumbs = p.crumbs.map(([n, u], i) => (i < p.crumbs.length - 1 ? `<a href="${u}">${esc(n)}</a>` : esc(n))).join(' › ');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}" />
<link rel="canonical" href="${SITE}${p.path}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="UK Power Cuts" />
<meta property="og:locale" content="en_GB" />
<meta property="og:url" content="${SITE}${p.path}" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(p.description)}" />
<meta property="og:image" content="${SITE}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<script type="application/ld+json">${LD(p)}</script>
<script>${THEME}</script>
<style>${CSS}</style>
</head>
<body>
<header class="top"><a class="brand" href="/">UK Power Cuts</a><a class="cta" href="${p.mapHref}">Open the live map</a></header>
${live}
<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
<h1>${esc(p.h1)}</h1>
${p.body}
</main>
<footer>UK Power Cuts is an independent, open-source project and is not run by any electricity network. Data comes from each network&rsquo;s own published feed and very small faults may be missing. <a href="/">Live map</a> &middot; <a href="${BASE}">All networks and cities</a> &middot; <a href="/privacy/">Privacy &amp; cookies</a> &middot; <a href="https://github.com/baronne/ukpowercuts">Source code</a>${KOFI ? ` &middot; <a href="${KOFI}" target="_blank" rel="noopener">&#9749; Buy me a coffee</a>` : ''}</footer>
${p.live ? `<script>${LIVE_JS}</script>` : ''}
</body>
</html>
`;
}

const liveBlock = `<div class="big" id="big" aria-live="polite"><div><strong>&ndash;</strong><span>Loading live figures&hellip;</span></div></div>
<p id="status"></p>
<ol class="outs" id="outs" hidden></ol>
<p class="muted" style="margin-top:8px;font-size:13px">Largest first. Figures update every 5 minutes from the network&rsquo;s own published data.</p>`;

const ADVICE = `<h2>What to do in a power cut</h2>
<ul class="tidy">
<li>Check whether the neighbours&rsquo; power is off too. If only your home is affected, check your fuse box or consumer unit first.</li>
<li>Call <strong>105</strong> (free, any phone) to report it or get an update. It connects you to your local network. In Northern Ireland call NIE Networks on <strong>03457 643 643</strong>.</li>
<li>Keep fridge and freezer doors shut, and unplug sensitive electronics so a surge on return doesn&rsquo;t damage them.</li>
<li>Use torches rather than candles, and never run a generator, barbecue or camping stove indoors.</li>
</ul>
<p class="warn"><strong>Danger to life?</strong> If you see fallen power lines, stay well away and call 999.</p>`;

const networkLinks = (except?: DnoId) => NETWORKS.filter((n) => n.id !== except).map((n) => `<a class="pill" href="${urlNet(n)}">${esc(n.short)}</a>`).join('');
const placeLinks = (list: Place[]) => list.map((p) => `<a class="pill" href="${urlPlace(p)}">${esc(p.name)}</a>`).join('');

const pages: Page[] = [];

for (const n of NETWORKS) {
  const places = PLACES.filter((p) => p.net === n.id);
  pages.push({
    path: urlNet(n),
    title: `${n.short} power cuts today: live map and status | UK Power Cuts`,
    description: `Live ${n.full} power cuts and planned work: how many customers are without power in ${n.area}, updated every 5 minutes. How to report a power cut: call ${n.phone}.`,
    h1: `${n.full} power cuts: live status`,
    crumbs: [['Home', '/'], ['Power cuts', BASE], [n.short, urlNet(n)]],
    live: { dno: n.id },
    mapHref: `/?network=${n.id}`,
    body: `<p class="muted">${esc(n.full)} (${esc(n.short)}) looks after the electricity network in ${esc(n.area)}.</p>
${liveBlock}
<h2>About ${esc(n.short)}</h2>
<p>${esc(n.note)}</p>
<p>The figures above come straight from the outage data ${esc(n.full)} publishes itself. This site is independent and is not run by ${esc(n.short)}.</p>
<h2>How to report a power cut to ${esc(n.short)}</h2>
<p>${n.id === 'nie' ? 'Call NIE Networks on <strong>03457 643 643</strong>. The national 105 number does not cover Northern Ireland.' : 'Call <strong>105</strong>, free from any phone. It connects you to the network that serves your address, so you don&rsquo;t need to know who it is.'}</p>
${places.length ? `<h2>Cities and large towns ${esc(n.short)} serves</h2><p>${placeLinks(places)}</p>` : ''}
${ADVICE}
<h2>Other networks</h2>
<p>${networkLinks(n.id)}</p>`,
  });
}

for (const p of PLACES) {
  const n = NET[p.net];
  const near = PLACES.filter((q) => q.net === p.net && q.slug !== p.slug).slice(0, 8);
  pages.push({
    path: urlPlace(p),
    title: `Power cuts in ${p.name} today: live map | UK Power Cuts`,
    description: `Is there a power cut in ${p.name}? See live outages and planned work within ${mi(p.r)} miles, updated every 5 minutes. ${p.name} is served by ${n.full}; call ${n.phone} to report a fault.`,
    h1: `Power cuts in ${p.name}`,
    crumbs: [['Home', '/'], ['Power cuts', BASE], [p.name, urlPlace(p)]],
    live: { lat: p.lat, lon: p.lon, r: p.r },
    mapHref: `/?at=${p.lat},${p.lon},10`,
    body: `<p class="muted">Live power cuts and planned work within ${mi(p.r)} miles of the centre of ${esc(p.name)}, ${esc(p.nation)}.</p>
${liveBlock}
<h2>Who supplies electricity in ${esc(p.name)}?</h2>
<p>The local electricity network in ${esc(p.name)} is run by <a href="${urlNet(n)}">${esc(n.full)}</a>. This is the company that owns the poles, cables and substations and fixes them when they fail. It is separate from the company you pay your bill to, and you can&rsquo;t change it by switching supplier.</p>
<p>${n.id === 'nie' ? 'To report a power cut, call NIE Networks on <strong>03457 643 643</strong>.' : 'To report a power cut or ask for an update, call <strong>105</strong>. It is free from any phone and connects you to the right network.'}</p>
<p>Want to check one address? Use the postcode box on the <a href="/">live map</a>; it looks for power cuts within 2 miles.</p>
${ADVICE}
<h2>More ${esc(n.short)} areas</h2>
<p>${placeLinks(near)} <a class="pill" href="${urlNet(n)}">All of ${esc(n.short)}</a></p>
<h2>Other places</h2>
<p><a class="pill" href="${BASE}">All networks and cities</a></p>`,
  });
}

const nations = ['England', 'Scotland', 'Wales', 'Northern Ireland'] as const;
pages.push({
  path: BASE,
  title: 'UK power cuts today: live status by network and city | UK Power Cuts',
  description: 'Live power cuts across the UK by electricity network and by city: UKPN, NGED, SSEN, SPEN, Northern Powergrid, Electricity North West and NIE Networks. Updated every 5 minutes.',
  h1: 'UK power cuts: live status by network and city',
  crumbs: [['Home', '/'], ['Power cuts', BASE]],
  mapHref: '/',
  body: `<p class="muted">Pick your electricity network or your nearest city to see power cuts there right now. Everything here is built from the networks&rsquo; own published data and refreshed every 5 minutes.</p>
<h2>Electricity networks</h2>
<ul class="tidy">${NETWORKS.map((n) => `<li><a href="${urlNet(n)}">${esc(n.full)}</a> <span class="muted">&ndash; ${esc(n.area)}</span></li>`).join('')}</ul>
${nations.map((nation) => {
  const list = PLACES.filter((p) => p.nation === nation);
  return list.length ? `<h2>Power cuts in ${nation}</h2><p>${placeLinks(list)}</p>` : '';
}).join('\n')}
<h2>Not sure who your network is?</h2>
<p>Call <strong>105</strong> (free, any phone, not Northern Ireland) and it connects you to the right one. Or type your postcode into the <a href="/">live map</a>.</p>
${ADVICE}`,
});

// Privacy and cookies. Kept out of the sitemap: it matters for trust and compliance, not for search traffic.
// If you add analytics, ads, or anything that sets a cookie or reads the device, update this page AND ask for consent first.
const PRIVACY_PATH = '/privacy/';
const privacy: Page = {
  path: PRIVACY_PATH,
  title: 'Privacy and cookies | UK Power Cuts',
  description: 'UK Power Cuts sets no cookies and has no analytics, ads or accounts. What your browser sends to the services the map uses.',
  h1: 'Privacy and cookies',
  crumbs: [['Home', '/'], ['Privacy and cookies', PRIVACY_PATH]],
  mapHref: '/',
  body: `<p class="muted">Last updated 20 November 2026.</p>
<p><strong>In short: this site sets no cookies, has no analytics, no advertising and no accounts, and doesn&rsquo;t collect your name, email address or location.</strong> That is why there is no cookie banner: the law (PECR and UK GDPR) only requires consent for cookies and similar technology that aren&rsquo;t strictly needed, and we don&rsquo;t use any.</p>
<h2>Cookies and storage on your device</h2>
<ul class="tidy">
<li><strong>Cookies:</strong> none.</li>
<li><strong>Local storage:</strong> if you press the light/dark switch, your choice (the word &ldquo;light&rdquo; or &ldquo;dark&rdquo;) is saved in your browser so the site looks the same next time. It stays on your device, is never sent to us, and you can remove it by clearing this site&rsquo;s data. If you never press the switch, nothing is stored.</li>
</ul>
<h2>What is sent to other services</h2>
<p>This is an independent project run by one person, not a company. We don&rsquo;t run a server that records visitors, but your browser talks to a few services in order to show the map:</p>
<ul class="tidy">
<li><strong>Cloudflare</strong> hosts the site. Like any web host it processes technical request details, such as your IP address, to deliver the pages and protect them from abuse.</li>
<li><strong><a href="https://openfreemap.org">OpenFreeMap</a></strong> supplies the map tiles. Loading the map sends your IP address and the area you are viewing to them, as with any online map.</li>
<li><strong><a href="https://postcodes.io">postcodes.io</a></strong> turns a postcode or place name into a location. When you search, what you type goes from your browser straight to them. It does not pass through us, and we never see or store it. The check for power cuts nearby then happens in your browser.</li>
<li><strong>Links</strong> to GitHub only connect to that site if you click them, and its own privacy policy applies from then on.</li>
<li><strong>Tipping (optional).</strong> If you open the &ldquo;Tip me&rdquo; window, Ko-fi&rsquo;s tip panel loads inside it from ko-fi.com. Ko-fi may then set cookies and see your IP address under its own privacy policy. Nothing is requested from Ko-fi unless you open that window.</li>
</ul>
<p>None of these is used by us for advertising or tracking, and we don&rsquo;t sell or share data. The outage figures come from the electricity networks&rsquo; own published feeds and contain no personal information.</p>
<h2>If this changes</h2>
<p>If we ever add analytics, ads or anything else that needs your consent, we will ask first and update this page.</p>
<h2>Questions</h2>
<p>Open an issue on <a href="https://github.com/baronne/ukpowercuts/issues">GitHub</a>. This page is plain-English information, not legal advice.</p>${KOFI ? `
<h2>Running costs</h2>
<p>The site is free, with no ads, and is paid for by one person. If it has helped you, you can <a href="${KOFI}" target="_blank" rel="noopener">buy me a coffee</a> towards hosting and the domain. That is entirely optional.</p>` : ''}`,
};
mkdirSync(join(DIST, PRIVACY_PATH), { recursive: true });
writeFileSync(join(DIST, PRIVACY_PATH, 'index.html'), render(privacy));

const today = new Date().toISOString().slice(0, 10);
for (const p of pages) {
  const dir = join(DIST, p.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), render(p));
}
const urls = [{ loc: '/', pri: '1.0' }, ...pages.map((p) => ({ loc: p.path, pri: p.path === BASE ? '0.8' : '0.6' }))];
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
console.log(`Wrote ${pages.length + 1} pages and a ${urls.length}-URL sitemap to web/dist`);
