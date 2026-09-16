/**
 * GET /api/hub_trend?horizon=1d|20d|50d|120d|200d
 * Stock-aggregate sector series rebased to 100 (same math as /api/hub_sectors).
 */
import { loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { buildHubTrendPayload } from '../lib/hub_trend.mjs';
import { krxSessionInfo, kstAnchorYmd } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  normalizeSectorHorizon,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import { peekReturnsDataVersion } from '../lib/hub_returns_source.mjs';
import {
  maybeNotModified,
  returnsJsonResponse,
  returnsResponseHeaders,
} from '../lib/returns_cache_headers.mjs';

const CACHE_VERSION = '/api/hub_trend/cache/v17';

function cachePath(horizon, dataVersion) {
  return `${CACHE_VERSION}/dv/${encodeURIComponent(dataVersion || '0')}/${horizon}`;
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
  const anchor = kstAnchorYmd();
  const peek = await peekReturnsDataVersion(env, request);
  const path = cachePath(horizon, peek.dataVersion);

  if (!nocache) {
    const hit = await readHubCache(path, url.origin);
    if (hit) {
      const headers = returnsResponseHeaders({
        cors,
        dataVersion: peek.dataVersion,
        horizon,
        extra: {
          'X-Hub-Cache': 'HIT',
          'X-Hub-Horizon': horizon,
          'X-Hub-Anchor': anchor,
          'X-Hub-Regular-Session': String(krxSessionInfo().regular),
        },
      });
      const notMod = maybeNotModified(request, headers);
      if (notMod) return notMod;
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const payload = await buildHubTrendPayload(hubIndex, env, horizon, new Date(), request);
    const dataVersion = payload.dataVersion || peek.dataVersion;
    const response = returnsJsonResponse(request, payload, {
      cors,
      dataVersion,
      horizon,
      extra: {
        'X-Hub-Cache': 'MISS',
        'X-Hub-Horizon': horizon,
        'X-Hub-Anchor': anchor,
        'X-Hub-Regular-Session': String(krxSessionInfo().regular),
      },
    });
    if (!nocache && response.status === 200) {
      putHubCache(context, cachePath(horizon, dataVersion), url.origin, response);
    }
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
