export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

/** Long-lived edge copy for stale-while-revalidate on cold KRX misses. */
export function putHubStaleCache(context, cachePath, origin, body, extraHeaders = {}) {
  try {
    const cache = caches.default;
    const cacheReq = new Request(new URL(cachePath, origin).toString());
    const staleRes = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
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
  '1m': 'return1mPct',
  '3m': 'return3mPct',
  '6m': 'return6mPct',
  '1y': 'yoyReturnPct',
};

/** @param {string|null|undefined} h */
export function normalizeSectorHorizon(h) {
  const raw = String(h || '1m').trim().toLowerCase();
  if (raw === '1d' || raw === 'return1dpct') return '1d';
  if (raw === '1m' || raw === 'return1mpct') return '1m';
  if (raw === '3m' || raw === 'return3mpct') return '3m';
  if (raw === '6m' || raw === 'return6mpct') return '6m';
  if (raw === '1y' || raw === 'yoy' || raw === 'yoyreturnpct') return '1y';
  return '1m';
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
