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

export function hasSectorYoy(sectors) {
  if (!sectors || typeof sectors !== 'object') return false;
  const keys = ['return1mPct', 'return3mPct', 'return6mPct', 'yoyReturnPct'];
  return Object.values(sectors).some((s) => {
    if (!s) return false;
    return keys.every((k) => typeof s[k] === 'number' && Number.isFinite(s[k]));
  });
}
