import { kstAnchorYmd, edgeCacheMaxAgeSeconds } from './krx_session.mjs';

export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** Cache API path scoped to the current KST trading-day anchor. */
export function anchoredCachePath(basePath, now = new Date()) {
  const base = String(basePath || '').replace(/\/+$/, '');
  return `${base}/${kstAnchorYmd(now)}`;
}

export function hubEdgeMaxAge(now = new Date()) {
  // Hub sectors/movers: 5m regular (≤ sync cadence); closed capped to next open.
  return edgeCacheMaxAgeSeconds(now, { regularMax: 300, closedMax: 1800 });
}

export async function readHubCache(cachePath, origin) {
  try {
    const cache = caches.default;
    const cacheReq = new Request(new URL(cachePath, origin).toString());
    return await cache.match(cacheReq);
  } catch {
    return null;
  }
}

export function putHubCache(context, cachePath, origin, response) {
  try {
    const cache = caches.default;
    const cacheReq = new Request(new URL(cachePath, origin).toString());
    context.waitUntil(cache.put(cacheReq, response.clone()));
  } catch {
    /* ignore */
  }
}

/** Long-lived edge copy for stale-while-revalidate on cold KRX misses (same trading day only). */
export function putHubStaleCache(context, cachePath, origin, body, extraHeaders = {}) {
  try {
    const cache = caches.default;
    const cacheReq = new Request(new URL(cachePath, origin).toString());
    const maxAge = edgeCacheMaxAgeSeconds(undefined, { closedMax: 86400 });
    const staleRes = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${Math.min(604800, maxAge * 6)}`,
        ...extraHeaders,
      },
    });
    context.waitUntil(cache.put(cacheReq, staleRes));
  } catch {
    /* ignore */
  }
}

export async function readHubCacheJson(cachePath, origin) {
  const hit = await readHubCache(cachePath, origin);
  if (!hit) return null;
  try {
    return await hit.json();
  } catch {
    return null;
  }
}

export const HORIZON_RET_KEY = {
  '1d': 'return1dPct',
  '20d': 'return20dPct',
  '50d': 'return50dPct',
  '120d': 'return120dPct',
  '200d': 'return200dPct',
  '1m': 'return20dPct',
  '3m': 'return50dPct',
  '6m': 'return120dPct',
  '1y': 'return200dPct',
  '250d': 'return200dPct',
};

/** @param {string|null|undefined} h */
export function normalizeSectorHorizon(h) {
  const raw = String(h || '20d').trim().toLowerCase();
  if (raw === '1d' || raw === 'return1dpct') return '1d';
  if (raw === '20d' || raw === 'return20dpct' || raw === '1m' || raw === 'return1mpct') return '20d';
  if (raw === '50d' || raw === 'return50dpct' || raw === '3m' || raw === 'return3mpct') return '50d';
  if (raw === '120d' || raw === 'return120dpct' || raw === '6m' || raw === 'return6mpct') return '120d';
  if (
    raw === '200d' ||
    raw === 'return200dpct' ||
    raw === '250d' ||
    raw === 'return250dpct' ||
    raw === '1y' ||
    raw === 'yoy' ||
    raw === 'yoyreturnpct'
  ) {
    return '200d';
  }
  return '20d';
}

export function hasSectorHorizon(sectors, horizon) {
  if (!sectors || typeof sectors !== 'object') return false;
  const retKey = HORIZON_RET_KEY[normalizeSectorHorizon(horizon)];
  if (!retKey) return false;
  return Object.values(sectors).some((s) => {
    if (!s) return false;
    return typeof s[retKey] === 'number' && Number.isFinite(s[retKey]);
  });
}

export function hasSectorYoy(sectors) {
  if (!sectors || typeof sectors !== 'object') return false;
  const keys = Object.values(HORIZON_RET_KEY);
  return Object.values(sectors).some((s) => {
    if (!s) return false;
    return keys.every((k) => typeof s[k] === 'number' && Number.isFinite(s[k]));
  });
}
