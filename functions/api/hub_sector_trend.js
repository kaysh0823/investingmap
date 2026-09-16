/**
 * Cloudflare Pages Function: GET /api/hub_sector_trend?horizon=20d
 * 1d → sector_intraday_returns + live tip / synthesized point (== hub_sectors 1D);
 * else → hub_trend stock-aggregate series (base-100 → %).
 */

import { loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { krxSessionInfo, kstAnchorYmd } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  normalizeSectorHorizon,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import { buildHubSectorTrendPayload } from '../lib/hub_sector_trend.mjs';
import { peekReturnsDataVersion } from '../lib/hub_returns_source.mjs';
import {
  maybeNotModified,
  returnsJsonResponse,
  returnsResponseHeaders,
} from '../lib/returns_cache_headers.mjs';

const CACHE_VERSION = '/api/hub_sector_trend/cache/v9';

function cachePath(horizon, dataVersion) {
  return `${CACHE_VERSION}/dv/${encodeURIComponent(dataVersion || '0')}/${normalizeSectorHorizon(horizon)}`;
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
  const session = krxSessionInfo();
  const anchor = kstAnchorYmd();
  const peek = await peekReturnsDataVersion(env, request);
  const path = cachePath(horizon, peek.dataVersion);

  if (!nocache) {
    const hit = await readHubCache(path, url.origin);
    if (hit) {
      const headers = returnsResponseHeaders({
        cors: ch,
        dataVersion: peek.dataVersion,
        horizon,
        extra: {
          'X-Hub-Cache': 'HIT',
          'X-Hub-Horizon': horizon,
          'X-Hub-Anchor': anchor,
        },
      });
      const notMod = maybeNotModified(request, headers);
      if (notMod) return notMod;
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const payload = await buildHubSectorTrendPayload(hubIndex, env, horizon, new Date(), request);
    const bodyObj = {
      ...payload.trends,
      horizon: payload.horizon,
      asOf: payload.asOf,
      tradeDate: payload.tradeDate,
      regularSession: payload.regularSession ?? session.regular,
      sessionOpen: payload.sessionOpen ?? !!(session.regular || session.aftermarket),
      numeratorMode: payload.numeratorMode ?? null,
      anchorDd: payload.anchorDd ?? null,
      refsRecentDd: payload.refsRecentDd ?? null,
      k: payload.k ?? null,
      dataVersion: payload.dataVersion ?? peek.dataVersion,
      refsEtag: payload.refsEtag ?? null,
      synthesized: !!payload.synthesized,
      source: payload.source || null,
      stale: !!payload.stale,
    };
    const dataVersion = bodyObj.dataVersion || peek.dataVersion;
    const response = returnsJsonResponse(request, bodyObj, {
      cors: ch,
      dataVersion,
      horizon,
      extra: {
        'X-Hub-Cache': 'MISS',
        'X-Hub-Horizon': horizon,
        'X-Hub-Anchor': anchor,
      },
    });
    if (!nocache && response.status === 200 && Object.keys(payload.trends || {}).length > 0) {
      putHubCache(context, cachePath(horizon, dataVersion), url.origin, response);
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
