import { adapters, USER_AGENT, type DnoId, type Outage } from '@powercut/core';
import { entriesForDay, pruneTimeline, snapshotKey, timelinePoint, toCsv, updateHistory, RETENTION_MS, type HistoryIndex, type StatusMap, type TimelinePoint } from './history.ts';

export interface Env {
  BUCKET: R2Bucket;
  SPEN_KEY?: string;
  ENWL_KEY?: string;
  EXPORT_EXCLUDE?: string;
}

export interface Latest {
  generatedAt: string;
  outages: Outage[];
  status: StatusMap;
}

const getJson = async <T>(env: Env, key: string, fallback: T): Promise<T> => {
  const o = await env.BUCKET.get(key);
  return o ? ((await o.json()) as T) : fallback;
};
const putJson = (env: Env, key: string, v: unknown) =>
  env.BUCKET.put(key, JSON.stringify(v), { httpMetadata: { contentType: 'application/json' } });

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function poll(env: Env, now = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  const prev = await getJson<Latest | null>(env, 'latest.json', null);
  const opts = { userAgent: USER_AGENT, apiKeys: { spen: env.SPEN_KEY, enwl: env.ENWL_KEY }, timeoutMs: 20_000 };

  const results = await Promise.allSettled(adapters.map((a) => a.fetch(opts)));
  const status: StatusMap = {};
  const outages: Outage[] = [];
  const okDnos = new Set<DnoId>();

  results.forEach((r, i) => {
    const id = adapters[i]!.id;
    if (r.status === 'fulfilled') {
      okDnos.add(id);
      outages.push(...r.value);
      status[id] = { ok: true, fetchedAt: nowIso, count: r.value.filter((o) => o.status === 'active').length };
    } else {
      const error = String(r.reason?.message ?? r.reason).slice(0, 200);
      console.warn(`[poll] ${id} failed: ${error}`);
      // carry the last good data forward and mark it stale rather than showing zero outages
      const carried = prev?.outages.filter((o) => o.dno === id) ?? [];
      outages.push(...carried);
      status[id] = { ok: false, stale: true, error, fetchedAt: prev?.status[id]?.fetchedAt ?? nowIso, count: carried.length };
    }
  });

  const latest: Latest = { generatedAt: nowIso, outages: outages.filter((o) => o.status === 'active'), status };
  const snap = snapshotKey(now);

  // snapshots drop polygons/messages: they exist for the replay slider, not as the full record
  const slim = latest.outages.map(({ geometry, message, ...rest }) => rest);
  const history = updateHistory(await getJson<HistoryIndex>(env, 'index.json', {}), outages, okDnos, nowIso);

  await Promise.all([
    putJson(env, 'latest.json', latest),
    env.BUCKET.put(`snapshots/${snap}.json.gz`, await gzip(JSON.stringify({ t: nowIso, outages: slim, status })), {
      httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
    }),
    putJson(env, 'index.json', history),
  ]);

  if (now.getUTCMinutes() < 5) await hourly(env, now, latest, history, snap);
}

async function hourly(env: Env, now: Date, latest: Latest, history: HistoryIndex, snap: string) {
  const nowIso = now.toISOString();
  const timeline = pruneTimeline(await getJson<TimelinePoint[]>(env, 'timeline.json', []), nowIso);
  timeline.push(timelinePoint(latest.outages, nowIso, snap));
  await putJson(env, 'timeline.json', timeline);

  // prune snapshots older than the retention window (day prefixes sort lexicographically)
  const cutoffDay = new Date(+now - RETENTION_MS).toISOString().slice(0, 10);
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix: 'snapshots/', cursor, limit: 1000 });
    const stale = page.objects.filter((o) => o.key.split('/')[1]! < cutoffDay).map((o) => o.key);
    if (stale.length) await env.BUCKET.delete(stale);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // the open dataset: yesterday's outages, written once at 00:xx UTC and kept indefinitely
  if (now.getUTCHours() === 0) {
    const day = new Date(+now - 86400_000).toISOString().slice(0, 10);
    const exclude = new Set((env.EXPORT_EXCLUDE ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    const entries = entriesForDay(history, day, exclude);
    await Promise.all([
      putJson(env, `exports/${day}.json`, entries),
      env.BUCKET.put(`exports/${day}.csv`, toCsv(entries), { httpMetadata: { contentType: 'text/csv; charset=utf-8' } }),
    ]);
  }
}
