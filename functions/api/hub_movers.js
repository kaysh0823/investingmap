/**
 * Cloudflare Pages Function: GET /api/hub_movers
 * Hub-listed movers: mcap / 1d gainers / turnover / 5d turnover / 5d gainers Top 20.
 * Returns from loadReturnSource + computeStockReturns (same as /api/quotes).
 * mcap / turnover still from stock_quotes_latest.
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
import { computeStockReturns } from '../lib/returns_core.mjs';
import { loadReturnSource, peekReturnsDataVersion } from '../lib/hub_returns_source.mjs';
import {
  corsHeaders,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import {
  fetchSupabaseJson,
  getSupabaseConfig,
} from '../lib/supabase_hub.mjs';
import {
  maybeNotModified,
  returnsJsonResponse,
  returnsResponseHeaders,
} from '../lib/returns_cache_headers.mjs';

const CACHE_BASE = '/api/hub_movers/cache/v10';
const ANCHOR_TICKER = '005930';
const HISTORY_CHUNK = 80;

function cachePath(dataVersion) {
  return `${CACHE_BASE}/dv/${encodeURIComponent(dataVersion || '0')}`;
}

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

/**
 * mcap/turnover from DB; 1d/5d returns from loadReturnSource + computeStockReturns.
 */
async function buildMoversFromReturnSource(hubIndex, config, request, env) {
  const tickers = [
    ...new Set(
      listHubCompanies(hubIndex)
        .map((c) => normalizeTicker(c.ticker))
        .filter(Boolean),
    ),
  ];
  const [quoteRows, source, turnover5dTop10] = await Promise.all([
    fetchSupabaseJson(
      config,
      'stock_quotes_latest?select=ticker,mcap_won,turnover_won,as_of&limit=2000',
    ),
    loadReturnSource({ env, request, tickers }),
    buildTurnover5dTop10(hubIndex, config),
  ]);

  if (!quoteRows?.length) return null;

  const k = source?.meta?.k ?? 0;
  const byTicker = new Map();
  for (const row of quoteRows) {
    const t = normalizeTicker(row.ticker);
    if (!t) continue;
    const src = source?.byTicker?.[t];
    const returns = src
      ? computeStockReturns({ numerator: src.numerator, closes: src.closes, k })
      : {
          chg1dPct: null,
          ret5dPct: null,
        };
    byTicker.set(t, {
      ticker: t,
      mcap_won: row.mcap_won,
      turnover_won: row.turnover_won,
      as_of: row.as_of,
      chg1dPct: returns.chg1dPct,
      ret5dPct: returns.ret5dPct,
    });
  }

  const rows = [...byTicker.values()];
  if (!rows.length) return null;

  const payload = buildHubMoversFromSupabaseRows(hubIndex, rows, {
    source: 'stock_aggregate',
    asOf: source?.meta?.asOf || null,
    turnover5dTop10,
  });
  if (!payload.mcapTop10 || !payload.mcapTop10.length) return null;

  const enriched = await enrichMoversRanks(payload, config);
  return {
    ...enriched,
    asOf: source?.meta?.asOf || enriched.asOf,
    sessionOpen: source?.meta?.sessionOpen ?? null,
    numeratorMode: source?.meta?.numeratorMode ?? null,
    anchorDd: source?.meta?.anchorDd ?? null,
    refsRecentDd: source?.meta?.refsRecentDd ?? null,
    k: source?.meta?.k ?? null,
    stale: !!source?.meta?.stale,
    dataVersion: source?.meta?.dataVersion ?? null,
    refsEtag: source?.meta?.refsEtag ?? null,
  };
}

async function buildMoversPayload(request, env) {
  const config = getSupabaseConfig(env);
  const hubIndex = await loadHubIndexFromRequest(request, env);
  if (config) {
    try {
      const live = await buildMoversFromReturnSource(hubIndex, config, request, env);
      if (live) return live;
    } catch (err) {
      console.warn(
        '[hub_movers] return-source path failed:',
        err && err.message ? err.message : err,
      );
    }
  }
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
    const payload = await buildMoversPayload(request, env);
    if (!payload.dataVersion) payload.dataVersion = peek.dataVersion;
    const dataVersion = payload.dataVersion || peek.dataVersion;
    const response = returnsJsonResponse(request, payload, {
      cors: ch,
      dataVersion,
      extra: { 'X-Hub-Cache': 'MISS' },
    });
    if (!nocache && response.status === 200 && hubMoversCacheable(payload)) {
      putHubCache(context, cachePath(dataVersion), url.origin, response);
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
