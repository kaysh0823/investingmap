/**
 * Cloudflare Pages Function: GET /api/hub_movers
 * Hub-listed movers: mcap / 1d gainers / turnover / 5d turnover / 5d gainers Top 20.
 * Primary: Supabase. Fallback: hub_index (mcap). Includes rank + rankDelta.
 */

import {
  buildHubMoversFromSupabaseRows,
  buildHubMoversFallback,
  buildTurnover5dTopFromSums,
  hubMoversCacheable,
  listHubCompanies,
  loadHubIndexFromRequest,
  normalizeTicker,
  sumTurnover5dByTicker,
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
} from '../lib/supabase_hub.mjs';

const CACHE_BASE = '/api/hub_movers/cache/v8';
const ANCHOR_TICKER = '005930';
const HISTORY_CHUNK = 80;

async function enrichMoversRanks(payload, config) {
  if (!payload) return payload;
  try {
    const [mcapTop10, gainers1dTop10, turnoverTop10, turnover5dTop10, gainers5dTop10] =
      await Promise.all([
        enrichTopRowsWithRankDelta(config, 'mcap', payload.mcapTop10 || [], payload.asOf),
        enrichTopRowsWithRankDelta(config, 'gain1d', payload.gainers1dTop10 || [], payload.asOf),
        enrichTopRowsWithRankDelta(config, 'turnover', payload.turnoverTop10 || [], payload.asOf),
        enrichTopRowsWithRankDelta(config, 'turnover5d', payload.turnover5dTop10 || [], payload.asOf),
        enrichTopRowsWithRankDelta(config, 'gain5d', payload.gainers5dTop10 || [], payload.asOf),
      ]);
    return {
      ...payload,
      mcapTop10,
      gainers1dTop10,
      turnoverTop10,
      turnover5dTop10,
      gainers5dTop10,
    };
  } catch (err) {
    console.warn(
      '[hub_movers] enrichMoversRanks failed:',
      err && err.message ? err.message : err,
    );
    // Still attach list ranks so clients always see rank/rankDelta.
    return {
      ...payload,
      mcapTop10: attachListRanks(payload.mcapTop10 || [], null),
      gainers1dTop10: attachListRanks(payload.gainers1dTop10 || [], null),
      turnoverTop10: attachListRanks(payload.turnoverTop10 || [], null),
      turnover5dTop10: attachListRanks(payload.turnover5dTop10 || [], null),
      gainers5dTop10: attachListRanks(payload.gainers5dTop10 || [], null),
    };
  }
}

async function fetchRecentSessionDates(config, limit = 5) {
  const rows = await fetchSupabaseJson(
    config,
    `stock_price_history?select=trade_date&ticker=eq.${ANCHOR_TICKER}` +
      `&order=trade_date.desc&limit=${limit}`,
  );
  const dates = [];
  const seen = new Set();
  for (const row of rows || []) {
    const d = String(row.trade_date || '').slice(0, 10);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    dates.push(d);
  }
  return dates;
}

async function fetchHubTurnoverHistoryRows(config, tickers, dates) {
  const out = [];
  if (!tickers.length || !dates.length) return out;
  const dateFilter = dates.join(',');
  for (let i = 0; i < tickers.length; i += HISTORY_CHUNK) {
    const part = tickers.slice(i, i + HISTORY_CHUNK);
    const rows = await fetchSupabaseJson(
      config,
      `stock_price_history?ticker=in.(${part.join(',')})` +
        `&trade_date=in.(${dateFilter})` +
        `&select=ticker,trade_date,turnover_won`,
    );
    out.push(...rows);
  }
  return out;
}

async function buildTurnover5dTop10(hubIndex, config) {
  if (!config) return [];
  try {
    const dates = await fetchRecentSessionDates(config, 5);
    if (dates.length < 3) return [];
    const tickers = [
      ...new Set(
        listHubCompanies(hubIndex)
          .map((c) => normalizeTicker(c.ticker))
          .filter(Boolean),
      ),
    ];
    const historyRows = await fetchHubTurnoverHistoryRows(config, tickers, dates);
    const sums = sumTurnover5dByTicker(historyRows, dates);
    return buildTurnover5dTopFromSums(hubIndex, sums);
  } catch (err) {
    console.warn(
      '[hub_movers] turnover5d failed:',
      err && err.message ? err.message : err,
    );
    return [];
  }
}

async function buildMoversFromSupabase(hubIndex, config) {
  const rows = await fetchSupabaseJson(
    config,
    'stock_quotes_latest?select=ticker,mcap_won,chg_1d_pct,ret_5d_pct,turnover_won,as_of&limit=2000',
  );
  if (!rows.length) return null;
  const turnover5dTop10 = await buildTurnover5dTop10(hubIndex, config);
  const payload = buildHubMoversFromSupabaseRows(hubIndex, rows, {
    source: 'supabase',
    turnover5dTop10,
  });
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
    } catch (err) {
      console.warn(
        '[hub_movers] supabase path failed:',
        err && err.message ? err.message : err,
      );
    }
  }
  // Fallback still enrich from hub_rank_daily when config is available.
  return enrichMoversRanks(buildHubMoversFallback(hubIndex), config);
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
        turnover5dTop10: [],
        gainers5dTop10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
