/**
 * Cloudflare Pages Function: GET /api/hub_rs_top10
 * Top-10 Relative Strength.
 * Primary: Supabase stock_quotes_latest (rs desc, hub-filtered). Fallback: hub_rs_snapshot / KRX live.
 */

import {
  buildHubRsTop10FromSupabaseRows,
  buildHubRsTop10Payload,
  hubRsTop10Cacheable,
  loadHubIndexFromRequest,
  listHubCompanies,
  normalizeTicker,
} from '../lib/hub_dashboard_core.mjs';
import { enrichTopRowsWithRankDelta, attachListRanks } from '../lib/hub_rank_daily.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import {
  fetchSupabaseJson,
  getSupabaseConfig,
  numOrNull,
} from '../lib/supabase_hub.mjs';
import { peekReturnsDataVersion } from '../lib/hub_returns_source.mjs';
import {
  maybeNotModified,
  returnsJsonResponse,
  returnsResponseHeaders,
} from '../lib/returns_cache_headers.mjs';

const CACHE_BASE = '/api/hub_rs_top10/cache/v8';

function cachePath(dataVersion) {
  return `${CACHE_BASE}/dv/${encodeURIComponent(dataVersion || '0')}`;
}

async function withRankDelta(config, metric, rows, asOf) {
  try {
    return await enrichTopRowsWithRankDelta(config, metric, rows || [], asOf);
  } catch (err) {
    console.warn(
      `[hub_rs_top10] enrich failed:`,
      err && err.message ? err.message : err,
    );
    return attachListRanks(rows || [], null);
  }
}

/**
 * Load hub-listed rows with non-null rs (ranked). Must not use a tiny global
 * limit — non-hub tickers in stock_quotes_latest would crowd out hub Top10.
 */
async function loadHubRsRows(hubIndex, config) {
  const hubSet = new Set(
    listHubCompanies(hubIndex)
      .map((c) => normalizeTicker(c.ticker))
      .filter(Boolean),
  );
  const hubRows = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const rows = await fetchSupabaseJson(
      config,
      `stock_quotes_latest?select=ticker,rs,as_of` +
        `&rs=not.is.null&order=rs.desc&limit=${pageSize}&offset=${offset}`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const t = normalizeTicker(row.ticker);
      if (t && hubSet.has(t) && numOrNull(row.rs) != null) hubRows.push(row);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (offset > 8000) break;
  }
  hubRows.sort((a, b) => (numOrNull(b.rs) || -Infinity) - (numOrNull(a.rs) || -Infinity));
  return hubRows;
}

async function buildRsTop10FromSupabase(hubIndex, config) {
  const rows = await loadHubRsRows(hubIndex, config);
  if (!rows.length) return null;
  const payload = buildHubRsTop10FromSupabaseRows(hubIndex, rows, { source: 'supabase' });
  if (!payload.top10 || !payload.top10.length) return null;
  payload.top10 = await withRankDelta(config, 'rs', payload.top10, payload.asOf);
  return payload;
}

async function buildRsTop10Payload(request, env) {
  const config = getSupabaseConfig(env);
  if (config) {
    try {
      const hubIndex = await loadHubIndexFromRequest(request, env);
      const supabase = await buildRsTop10FromSupabase(hubIndex, config);
      if (supabase) return supabase;
    } catch {
      /* fall through to legacy path */
    }
  }
  const hubIndex = await loadHubIndexFromRequest(request, env);
  const legacy = await buildHubRsTop10Payload(hubIndex, env, request);
  if (legacy && legacy.top10) {
    legacy.top10 = await withRankDelta(config, 'rs', legacy.top10, legacy.asOf);
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
  const peek = await peekReturnsDataVersion(env, request);
  const path = cachePath(peek.dataVersion);

  if (!nocache) {
    const hit = await readHubCache(path, url.origin);
    if (hit) {
      const headers = returnsResponseHeaders({
        cors: ch,
        dataVersion: peek.dataVersion,
        extra: { 'X-Hub-Cache': 'HIT' },
      });
      const notMod = maybeNotModified(request, headers);
      if (notMod) return notMod;
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const payload = await buildRsTop10Payload(request, env);
    if (payload && !payload.dataVersion) payload.dataVersion = peek.dataVersion;
    const dataVersion = (payload && payload.dataVersion) || peek.dataVersion;
    const response = returnsJsonResponse(request, payload, {
      cors: ch,
      dataVersion,
      extra: { 'X-Hub-Cache': 'MISS' },
    });
    if (!nocache && response.status === 200 && hubRsTop10Cacheable(payload)) {
      putHubCache(context, cachePath(dataVersion), url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_rs_top10_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        regularSession: session.regular,
        top10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
