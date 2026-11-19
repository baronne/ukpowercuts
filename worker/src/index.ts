import { poll, type Env } from './poll.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

const ROUTES: Record<string, string> = {
  '/api/now.json': 'latest.json',
  '/api/history.json': 'index.json',
  '/api/timeline.json': 'timeline.json',
};

// In-isolate micro-cache. Public traffic is answered from memory, so each Worker instance touches R2 at most once per TTL
// per file, however many requests arrive (this caps R2 read/list operations; the Cache API is not available on workers.dev).
interface Hit { at: number; status: number; headers: [string, string][]; body: ArrayBuffer }
const MEM = new Map<string, Hit>();
const MEM_MAX = 40;
async function memo(key: string, ttlMs: number, make: () => Promise<Response>): Promise<Response> {
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return new Response(hit.body, { status: hit.status, headers: hit.headers });
  const res = await make();
  const body = await res.arrayBuffer();
  const headers = [...res.headers.entries()];
  MEM.delete(key);
  MEM.set(key, { at: Date.now(), status: res.status, headers, body });
  if (MEM.size > MEM_MAX) MEM.delete(MEM.keys().next().value!);
  return new Response(body, { status: res.status, headers });
}

const DAY = 86_400_000;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** Snapshots only exist for the last 7 days; anything else is rejected without touching R2. */
const snapshotDateOk = (d: string) => { const t = dayMs(d); return t >= Date.now() - 9 * DAY && t <= Date.now() + DAY; };
/** Exports start in 2026 and are never in the future. */
const exportDateOk = (d: string) => { const t = dayMs(d); return t >= Date.parse('2026-01-01T00:00:00Z') && t <= Date.now() + DAY; };
const NOT_FOUND = () => new Response('Not found', { status: 404, headers: CORS });

const TTL: Record<string, number> = { '/api/now.json': 60_000, '/api/history.json': 120_000, '/api/timeline.json': 600_000 };

async function serve(env: Env, key: string, extra: HeadersInit = {}): Promise<Response> {
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers: CORS });
  const headers = new Headers({ ...CORS, 'Cache-Control': 'public, max-age=60', ...extra });
  obj.writeHttpMetadata(headers); // content-type / content-encoding stored at write time
  headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const { pathname } = new URL(req.url);

    if (ROUTES[pathname]) return memo(pathname, TTL[pathname]!, () => serve(env, ROUTES[pathname]!));

    if (pathname === '/api/status.json') {
      return memo(pathname, 60_000, async () => {
        const latest = await env.BUCKET.get('latest.json');
        if (!latest) return NOT_FOUND();
        const { generatedAt, status } = (await latest.json()) as any;
        return Response.json({ generatedAt, status }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=60' } });
      });
    }

    const snap = pathname.match(/^\/api\/snapshot\/(\d{4}-\d{2}-\d{2})\/(\d{4})$/);
    if (snap) {
      const hh = Number(snap[2]!.slice(0, 2)), mm = Number(snap[2]!.slice(2));
      if (!snapshotDateOk(snap[1]!) || hh > 23 || mm > 59) return NOT_FOUND();
      return memo(pathname, 3_600_000, () => serve(env, `snapshots/${snap[1]}/${snap[2]}.json.gz`, { 'Cache-Control': 'public, max-age=86400' }));
    }

    const exp = pathname.match(/^\/exports\/(\d{4}-\d{2}-\d{2}\.(?:json|csv))$/);
    if (exp) {
      if (!exportDateOk(exp[1]!.slice(0, 10))) return NOT_FOUND();
      return memo(pathname, 3_600_000, () => serve(env, `exports/${exp[1]}`, { 'Cache-Control': 'public, max-age=3600' }));
    }

    if (pathname === '/exports/') {
      return memo(pathname, 3_600_000, async () => {
        const list = await env.BUCKET.list({ prefix: 'exports/' }); // Class A operation: memoised so it runs at most hourly per instance
        return Response.json(list.objects.map((o) => o.key.replace('exports/', '')).sort().reverse(), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } });
      });
    }

    // manual trigger for local dev only (`wrangler dev` serves on localhost)
    if (pathname === '/__poll' && new URL(req.url).hostname === 'localhost') {
      const at = new URL(req.url).searchParams.get('now'); // e.g. ?now=2026-11-20T00:02:00Z to exercise the hourly/export path
      await poll(env, at ? new Date(at) : new Date());
      return new Response('polled\n');
    }
    return new Response('UK power cut map API: /api/now.json /api/status.json /api/timeline.json /api/history.json', { status: 404, headers: CORS });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(poll(env));
  },
};
