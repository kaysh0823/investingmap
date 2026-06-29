/**
 * Cloudflare Pages Function: GET /api/hub_dashboard
 * Sector mcap-weighted 1Y return + top-10 price position (single response).
 */

import { buildHubDashboard, loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const HUB_CACHE_PATH = '/api/hub_dashboard/cache/v1';

export async function onRequest(context) {
  const { request, env } = context;
  const ch = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: ch });
  }

  const url = new URL(request.url);
  const session = krxSessionInfo();
  const nocache = url.searchParams.get('nocache') === '1';

  if (!nocache) {
    try {
      const cache = caches.default;
      const cacheReq = new Request(new URL(HUB_CACHE_PATH, url.origin).toString());
      const hit = await cache.match(cacheReq);
      if (hit) {
        const headers = new Headers(hit.headers);
        for (const [k, v] of Object.entries(ch)) headers.set(k, v);
        headers.set('X-Hub-Cache', 'HIT');
        return new Response(hit.body, { status: hit.status, headers });
      }
    } catch {
      /* ignore cache read */
    }
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const payload = await buildHubDashboard(hubIndex, env);
    const maxAge = session.regular ? 300 : 1800;
    const response = new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}`,
        'X-Hub-Cache': 'MISS',
      },
    });
    if (!nocache && payload.top10 && payload.top10.length > 0) {
      const cache = caches.default;
      const cacheReq = new Request(new URL(HUB_CACHE_PATH, url.origin).toString());
      context.waitUntil(cache.put(cacheReq, response.clone()));
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_dashboard_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        krxConfigured: !!getAuthKey(env),
        regularSession: session.regular,
        sectors: {},
        top10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
