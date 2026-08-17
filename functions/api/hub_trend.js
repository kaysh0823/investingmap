/**
 * GET /api/hub_trend?horizon=1d|20d|50d|120d|200d
 * Sector mcap and KOSPI/KOSDAQ series rebased to 100.
 */
import { loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { buildHubTrendPayload } from '../lib/hub_trend.mjs';
import { krxSessionInfo, kstAnchorYmd, edgeCacheMaxAgeSeconds } from '../lib/krx_session.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  normalizeSectorHorizon,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';

const CACHE_VERSION = '/api/hub_trend/cache/v2';

function maxAge(horizon, now = new Date()) {
  return normalizeSectorHorizon(horizon) === '1d'
    ? edgeCacheMaxAgeSeconds(now, { regularMax: 60, closedMax: 300 })
    : edgeCacheMaxAgeSeconds(now, { regularMax: 600, closedMax: 3600 });
}

export async function onRequest(context) {
  const { request, env } = context;
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  const url = new URL(request.url);
  const horizon = normalizeSectorHorizon(url.searchParams.get('horizon'));
  const nocache = url.searchParams.get('nocache') === '1';
  const cachePath = `${anchoredCachePath(CACHE_VERSION)}/${horizon}`;
  const anchor = kstAnchorYmd();

  if (!nocache) {
    const hit = await readHubCache(cachePath, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      headers.set('X-Hub-Cache', 'HIT');
      headers.set('X-Hub-Horizon', horizon);
      headers.set('X-Hub-Anchor', anchor);
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const payload = await buildHubTrendPayload(hubIndex, env, horizon);
    const ttl = maxAge(horizon);
    const response = new Response(JSON.stringify(payload), {
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${ttl * 6}`,
        'X-Hub-Cache': 'MISS',
        'X-Hub-Horizon': horizon,
        'X-Hub-Anchor': anchor,
        'X-Hub-Regular-Session': String(krxSessionInfo().regular),
      },
    });
    if (!nocache) putHubCache(context, cachePath, url.origin, response);
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'hub_trend_failed',
        message: error?.message || 'unknown',
        horizon,
      }),
      {
        status: 500,
        headers: {
          ...cors,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
