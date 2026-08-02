/**
 * Cloudflare Pages Function: GET /api/hub_movers
 * Hub-listed movers: mcap / 1d gainers / turnover / 5d gainers Top 10.
 * Primary: Supabase. Fallback: hub_index (mcap). Includes rank + rankDelta.
 */

import {
  buildHubMoversFromSupabaseRows,
  buildHubMoversFallback,
  hubMoversCacheable,
  loadHubIndexFromRequest,
} from '../lib/hub_dashboard_core.mjs';
import { enrichTopRowsWithRankDelta } from '../lib/hub_rank_daily.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  hubEdgeMaxAge,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import {
  fetchSupabaseJson,
  getSupabaseConfig,
} from '../lib/supabase_hub.mjs';

const CACHE_BASE = '/api/hub_movers/cache/v4';

async function enrichMoversRanks(payload, config) {
  if (!payload) return payload;
  const asOf = payload.asOf || null;
  const [mcapTop10, gainers1dTop10, turnoverTop10, gainers5dTop10] = await Promise.all([
    enrichTopRowsWithRankDelta(config, 'mcap', payload.mcapTop10 || [], asOf),
    enrichTopRowsWithRankDelta(config, 'gain1d', payload.gainers1dTop10 || [], asOf),
    enrichTopRowsWithRankDelta(config, 'turnover', payload.turnoverTop10 || [], asOf),
    enrichTopRowsWithRankDelta(config, 'gain5d', payload.gainers5dTop10 || [], asOf),
  ]);
  return {
    ...payload,
    mcapTop10,
    gainers1dTop10,
    turnoverTop10,
    gainers5dTop10,
  };
}

async function buildMoversFromSupabase(hubIndex, config) {
  const rows = await fetchSupabaseJson(
    config,
    'stock_quotes_latest?select=ticker,mcap_won,chg_1d_pct,ret_5d_pct,turnover_won,as_of&limit=2000',
  );
  if (!rows.length) return null;
  const payload = buildHubMoversFromSupabaseRows(hubIndex, rows, { source: 'supabase' });
  if (!payload.mcapTop10 || !payload.mcapTop10.length) return null;
  return enrichMoversRanks(payload, config);
}

async function buildMoversPayload(request, env) {
  const config = getSupabaseConfig(env);
  const hubIndex = await loadHubIndexFromRequest(request, env);
  if (config) {
    try {
      const supabase = await buildMoversFromSupabase(hubIndex, config);
      if (supabase) return supabase;
    } catch {
      /* fall through to fallback */
    }
  }
  return enrichMoversRanks(buildHubMoversFallback(hubIndex), null);
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
  const session = krxSessionInfo();
  const nocache = url.searchParams.get('nocache') === '1';
  const cachePath = anchoredCachePath(CACHE_BASE);

  if (!nocache) {
    const hit = await readHubCache(cachePath, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Hub-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const payload = await buildMoversPayload(request, env);
    const maxAge = hubEdgeMaxAge();
    const response = new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}`,
        'X-Hub-Cache': 'MISS',
      },
    });
    if (!nocache && hubMoversCacheable(payload)) {
      putHubCache(context, cachePath, url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_movers_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        regularSession: session.regular,
        mcapTop10: [],
        gainers1dTop10: [],
        turnoverTop10: [],
        gainers5dTop10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
