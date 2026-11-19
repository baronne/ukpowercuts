import type { FetchOpts } from './schema.ts';

export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export const truthy = (v: unknown) => v === true || /^(true|yes|1)$/i.test(String(v ?? ''));

/** Already-ISO values with an offset/Z pass through; naive ones are treated as UK local time. */
export function ukLocalToIso(s: unknown): string | undefined {
  if (typeof s !== 'string' || !s.trim()) return undefined;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, sec = '00', tz] = m;
  if (tz) {
    const d2 = new Date(s);
    return Number.isNaN(+d2) ? undefined : d2.toISOString();
  }
  return londonToUtc(+y!, +mo!, +d!, +h!, +mi!, +sec);
}

/** Convert wall-clock Europe/London time to a UTC ISO string (handles BST). */
export function londonToUtc(y: number, mo: number, d: number, h: number, mi: number, s = 0): string {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t); // second pass settles around DST boundaries
  return new Date(t).toISOString();
}

export async function fetchJson<T = any>(url: string, opts: FetchOpts, headers: Record<string, string> = {}): Promise<T> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(url, {
    headers: { 'User-Agent': opts.userAgent, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  if (!res.ok) {
    const retry = res.headers.get('retry-after');
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}${retry ? ` (retry-after ${retry}s)` : ''}`);
  }
  return (await res.json()) as T;
}

export function postcodeList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
  return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
}
