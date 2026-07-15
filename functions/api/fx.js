/**
 * Cloudflare Pages Function: GET /api/fx
 * Live USD/KRW from Naver Finance; shape matches data/fx_usdkrw.json.
 * Edge cache 1h via Cache API; fallback: cached response → static data/fx_usdkrw.json.
 */

import { corsHeaders, putHubCache, readHubCache, readHubCacheJson } from '../lib/hub_api_cache.mjs';
import { buildFxPayload, fetchUsdKrwFromNaver } from '../lib/naver_fx.mjs';

const CACHE_PATH = '/api/fx/cache/v1';
const CACHE_MAX_AGE = 3600;

function jsonResponse(ch, body, cacheTag, maxAge = CACHE_MAX_AGE) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...ch,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 6}`,
      'X-Fx-Cache': cacheTag,
    },
  });
}

async function loadStaticFxFallback(request) {
  try {
    const url = new URL('/data/fx_usdkrw.json', request.url);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const j = await res.json();
    if (j && typeof j.rate === 'number' && j.rate > 500 && j.rate < 5000) {
      return buildFxPayload(j.rate, j.asOf || null);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function onRequest(context) {
  const { request } = context;
  const ch = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: ch });
  }

  const url = new URL(request.url);
  const nocache = url.searchParams.get('nocache') === '1';

  if (!nocache) {
    const hit = await readHubCache(CACHE_PATH, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Fx-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const payload = await fetchUsdKrwFromNaver();
    const response = jsonResponse(ch, payload, 'MISS');
    if (!nocache) putHubCache(context, CACHE_PATH, url.origin, response);
    return response;
  } catch {
    const stale = await readHubCacheJson(CACHE_PATH, url.origin);
    if (stale && typeof stale.rate === 'number') {
      return jsonResponse(ch, stale, 'STALE', CACHE_MAX_AGE * 6);
    }
    const fileFallback = await loadStaticFxFallback(request);
    if (fileFallback) {
      return jsonResponse(ch, fileFallback, 'FILE', 300);
    }
    return new Response(
      JSON.stringify({
        error: 'fx_fetch_failed',
        rate: null,
        asOf: null,
        source: null,
      }),
      {
        status: 502,
        headers: {
          ...ch,
          'Content-Type': 'application/json; charset=utf-8',
          'X-Fx-Cache': 'ERROR',
        },
      },
    );
  }
}
