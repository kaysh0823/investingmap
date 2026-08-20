/**
 * Cloudflare Pages Function: GET /api/hub_sector_trend?horizon=20d
 * Normalized sector mcap-sum return sparkline series.
 * 1d → sector_intraday_snapshots; else → stock_price_history daily path.
 */

import { loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { krxSessionInfo, kstAnchorYmd, edgeCacheMaxAgeSeconds } from '../lib/krx_session.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  normalizeSectorHorizon,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import { buildHubSectorTrendPayload } from '../lib/hub_sector_trend.mjs';

const CACHE_VERSION = '/api/hub_sector_trend/cache/v5';

function trendMaxAge(horizon, now = new Date()) {
  if (normalizeSectorHorizon(horizon) === '1d') {
    return edgeCacheMaxAgeSeconds(now, { regularMax: 60, closedMax: 300 });
  }
  return edgeCacheMaxAgeSeconds(now, { regularMax: 600, closedMax: 3600 });
}

function cachePaths(horizon, now = new Date()) {
  const dayBase = anchoredCachePath(CACHE_VERSION, now);
  return `${dayBase}/${normalizeSectorHorizon(horizon)}`;
}

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
  const horizon = normalizeSectorHorizon(url.searchParams.get('horizon'));
  const nocache = url.searchParams.get('nocache') === '1';
  const cachePath = cachePaths(horizon);
  const session = krxSessionInfo();
  const anchor = kstAnchorYmd();

  if (!nocache) {
    const hit = await readHubCache(cachePath, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Hub-Cache', 'HIT');
      headers.set('X-Hub-Horizon', horizon);
      headers.set('X-Hub-Anchor', anchor);
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const payload = await buildHubSectorTrendPayload(hubIndex, env, horizon);
    // Flatten to { sectorId: [{t,v}] } plus light meta for clients that ignore extras.
    const bodyObj = {
      ...payload.trends,
      horizon: payload.horizon,
      asOf: payload.asOf,
      tradeDate: payload.tradeDate,
      regularSession: session.regular,
    };
    const maxAge = trendMaxAge(horizon);
    const body = JSON.stringify(bodyObj);
    const response = new Response(body, {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 6}`,
        'X-Hub-Cache': 'MISS',
        'X-Hub-Horizon': horizon,
        'X-Hub-Anchor': anchor,
      },
    });
    if (!nocache && Object.keys(payload.trends || {}).length > 0) {
      putHubCache(context, cachePath, url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_sector_trend_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        horizon,
        asOf: new Date().toISOString(),
        regularSession: session.regular,
      }),
      {
        status: 500,
        headers: {
          ...ch,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
