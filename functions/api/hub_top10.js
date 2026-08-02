/**
 * Cloudflare Pages Function: GET /api/hub_top10
 * Top-10 price position vs 52-week range.
 * Primary: Supabase stock_quotes_latest. Fallback: Naver + hub_quote_snapshot.
 */

import {
  buildHubTop10,
  buildHubTop10PayloadFromQuoteMap,
  hubTop10Cacheable,
  listHubCompanies,
  loadHubIndexFromRequest,
  normalizeTicker,
} from '../lib/hub_dashboard_core.mjs';
import { enrichTopRowsWithRankDelta, attachListRanks } from '../lib/hub_rank_daily.mjs';
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
  numOrNull,
} from '../lib/supabase_hub.mjs';

const CACHE_BASE = '/api/hub_top10/cache/v7';

async function withRankDelta(config, metric, rows, asOf) {
  try {
    return await enrichTopRowsWithRankDelta(config, metric, rows || [], asOf);
  } catch (err) {
    console.warn(
      `[hub_top10] enrich failed:`,
      err && err.message ? err.message : err,
    );
    return attachListRanks(rows || [], null);
  }
}

async function buildHubTop10FromSupabase(hubIndex, config, session) {
  const rows = await fetchSupabaseJson(
    config,
    'stock_quotes_latest?select=ticker,last,high_52w,low_52w,as_of,regular_session&limit=1000',
  );
  if (!rows.length) return null;

  const hubCodes = new Set(
    listHubCompanies(hubIndex).map((c) => normalizeTicker(c.ticker)).filter(Boolean),
  );
  const quoteByTicker = {};
  let asOf = null;
  let regularSession = null;

  for (const row of rows) {
    const key = normalizeTicker(row.ticker);
    if (!key || !hubCodes.has(key)) continue;
    quoteByTicker[key] = {
      last: numOrNull(row.last),
      high52w: numOrNull(row.high_52w),
      low52w: numOrNull(row.low_52w),
    };
    if (row.as_of && !asOf) asOf = row.as_of;
    if (row.regular_session != null && regularSession == null) {
      regularSession = !!row.regular_session;
    }
  }

  const payload = buildHubTop10PayloadFromQuoteMap(hubIndex, quoteByTicker, {
    asOf: asOf || new Date().toISOString(),
    regularSession: regularSession != null ? regularSession : session.regular,
    source: 'supabase',
  });
  if (!payload.top10 || !payload.top10.length) return null;
  payload.top10 = await withRankDelta(config, 'position', payload.top10, payload.asOf);
  return payload;
}

async function buildTop10Payload(request, env, session) {
  const config = getSupabaseConfig(env);
  if (config) {
    try {
      const hubIndex = await loadHubIndexFromRequest(request, env);
      const supabase = await buildHubTop10FromSupabase(hubIndex, config, session);
      if (supabase) return supabase;
    } catch {
      /* fall through to legacy path */
    }
  }
  const hubIndex = await loadHubIndexFromRequest(request, env);
  const legacy = await buildHubTop10(hubIndex, env, request);
  if (legacy && legacy.top10) {
    legacy.top10 = await withRankDelta(config, 'position', legacy.top10, legacy.asOf);
  }
  return legacy;
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
    const payload = await buildTop10Payload(request, env, session);
    const maxAge = hubEdgeMaxAge();
    const response = new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}`,
        'X-Hub-Cache': 'MISS',
      },
    });
    if (!nocache && hubTop10Cacheable(payload)) {
      putHubCache(context, cachePath, url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_top10_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        regularSession: session.regular,
        top10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
