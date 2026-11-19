import { poll, type Env } from './poll.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

const ROUTES: Record<string, string> = {
  '/api/now.json': 'latest.json',
  '/api/history.json': 'index.json',
  '/api/timeline.json': 'timeline.json',
};

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

    if (ROUTES[pathname]) return serve(env, ROUTES[pathname]!);

    if (pathname === '/api/status.json') {
      const latest = await env.BUCKET.get('latest.json');
      if (!latest) return new Response('Not found', { status: 404, headers: CORS });
      const { generatedAt, status } = (await latest.json()) as any;
      return Response.json({ generatedAt, status }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=60' } });
    }

    const snap = pathname.match(/^\/api\/snapshot\/(\d{4}-\d{2}-\d{2})\/(\d{4})$/);
    if (snap) return serve(env, `snapshots/${snap[1]}/${snap[2]}.json.gz`, { 'Cache-Control': 'public, max-age=86400' });

    const exp = pathname.match(/^\/exports\/(\d{4}-\d{2}-\d{2}\.(?:json|csv))$/);
    if (exp) return serve(env, `exports/${exp[1]}`, { 'Cache-Control': 'public, max-age=3600' });

    if (pathname === '/exports/') {
      const list = await env.BUCKET.list({ prefix: 'exports/' });
      return Response.json(list.objects.map((o) => o.key.replace('exports/', '')).sort().reverse(), { headers: CORS });
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
