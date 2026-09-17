/**
 * Cloudflare Pages Function: GET /api/quotes?codes=005930,000660
 * Primary: stock_quotes_latest (+ hub_return_refs via loadReturnSource / returns_core).
 * No per-request Naver crawl on the happy path; stale as_of (>15m) may refresh those codes only.
 * Fallback: Naver Finance crawl when Supabase is unavailable.
 */

import { getCachedNaverQuotes } from '../lib/naver_quote_store.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import { getAuthKey, mergeKrxYoy } from '../lib/krx_yoy.mjs';
import { loadHubRsSnapshotFromRequest } from '../lib/hub_dashboard_core.mjs';
import { computeStockReturns } from '../lib/returns_core.mjs';
import { loadReturnSource } from '../lib/hub_returns_source.mjs';
import {
  returnsJsonResponse,
  simpleHash,
} from '../lib/returns_cache_headers.mjs';

const QUOTES_CACHE_VERSION = 'v13';

let rsSnapshotCache = { at: 0, snap: null };

function slimMarketIndices(indices) {
  if (!indices || typeof indices !== 'object') return null;
  const out = {};
  for (const code of ['KOSPI', 'KOSDAQ']) {
    const row = indices[code];
    const rs = row && typeof row.rs === 'number' && Number.isFinite(row.rs) ? row.rs : null;
    if (rs == null) continue;
    out[code] = {
      rs,
      rs20: numOrNull(row.rs20),
      rs50: numOrNull(row.rs50),
      rs120: numOrNull(row.rs120),
      rs200: numOrNull(row.rs200),
      ret20: numOrNull(row.ret20),
      ret50: numOrNull(row.ret50),
      ret120: numOrNull(row.ret120),
      ret200: numOrNull(row.ret200),
    };
  }
  return Object.keys(out).length ? out : null;
}

async function loadRsSnapshot(request, env) {
  const now = Date.now();
  if (rsSnapshotCache.snap && now - rsSnapshotCache.at < 5 * 60 * 1000) {
    return rsSnapshotCache.snap;
  }
  try {
    const snap = await loadHubRsSnapshotFromRequest(request, env);
    if (snap) {
      rsSnapshotCache = { at: now, snap };
    }
    return snap || rsSnapshotCache.snap;
  } catch {
    return rsSnapshotCache.snap;
  }
}

function normalizeTicker(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim().toUpperCase();
  if (/^[0-9A-Z]{6}$/.test(s)) return s;
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (alnum.length > 6) return alnum.slice(0, 6);
  if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
  if (alnum.length === 6) return alnum;
  return null;
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag, X-Data-Version',
    'Access-Control-Max-Age': '86400',
  };
}

function getSupabaseConfig(env) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = (env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapSupabaseRow(row, snapQuote = null) {
  const snapRs = snapQuote ? numOrNull(snapQuote.rs) : null;
  const snapRs20 = snapQuote ? numOrNull(snapQuote.rs20) : null;
  const snapRs50 = snapQuote ? numOrNull(snapQuote.rs50) : null;
  const snapRs120 = snapQuote ? numOrNull(snapQuote.rs120) : null;
  const snapRs200 = snapQuote ? numOrNull(snapQuote.rs200) : null;

  return {
    last: numOrNull(row.last),
    prevClose: numOrNull(row.prev_close),
    high52w: numOrNull(row.high_52w),
    low52w: numOrNull(row.low_52w),
    high120d: numOrNull(row.high_120d),
    low120d: numOrNull(row.low_120d),
    high50d: numOrNull(row.high_50d),
    low50d: numOrNull(row.low_50d),
    high20d: numOrNull(row.high_20d),
    low20d: numOrNull(row.low_20d),
    high10d: numOrNull(row.high_10d),
    low10d: numOrNull(row.low_10d),
    high5d: numOrNull(row.high_5d),
    low5d: numOrNull(row.low_5d),
    bbUpper: numOrNull(row.bb_upper),
    bbLower: numOrNull(row.bb_lower),
    mcapWon: numOrNull(row.mcap_won),
    turnoverWon: numOrNull(row.turnover_won),
    per: numOrNull(row.per),
    pbr: numOrNull(row.pbr),
    chg1dPct: null,
    ret5dPct: null,
    ret20dPct: null,
    ret50dPct: null,
    ret120dPct: null,
    ret200dPct: null,
    rs: snapRs != null ? snapRs : numOrNull(row.rs),
    rs20: snapRs20 != null ? snapRs20 : numOrNull(row.rs20 ?? row.rs_20),
    rs50: snapRs50 != null ? snapRs50 : numOrNull(row.rs50 ?? row.rs_50),
    rs120: snapRs120 != null ? snapRs120 : numOrNull(row.rs120 ?? row.rs_120),
    rs200: snapRs200 != null ? snapRs200 : numOrNull(row.rs200 ?? row.rs_200),
    spark20: parseSpark20(row.spark20),
  };
}

function parseSpark20(v) {
  if (v == null) return null;
  let arr = v;
  if (typeof v === 'string') {
    try {
      arr = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  const out = [];
  for (const x of arr) {
    const n = numOrNull(x);
    if (n != null) out.push(n);
  }
  return out.length ? out : null;
}

function applySnapshotRsToItems(items, snapQuotes) {
  if (!items || !snapQuotes) return;
  for (const [code, item] of Object.entries(items)) {
    if (!item) continue;
    const ticker = normalizeTicker(code);
    const snapQuote = ticker ? snapQuotes[ticker] : null;
    if (!snapQuote) continue;
    const snapRs = numOrNull(snapQuote.rs);
    const snapRs20 = numOrNull(snapQuote.rs20);
    const snapRs50 = numOrNull(snapQuote.rs50);
    const snapRs120 = numOrNull(snapQuote.rs120);
    const snapRs200 = numOrNull(snapQuote.rs200);
    if (snapRs != null) item.rs = snapRs;
    if (snapRs20 != null) item.rs20 = snapRs20;
    if (snapRs50 != null) item.rs50 = snapRs50;
    if (snapRs120 != null) item.rs120 = snapRs120;
    if (snapRs200 != null) item.rs200 = snapRs200;
  }
}

async function fetchQuotesFromSupabase(codes, config, snapQuotes = null) {
  const list = codes.join(',');
  const url = `${config.url}/rest/v1/stock_quotes_latest?ticker=in.(${list})&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`supabase_fetch_failed:${res.status}:${body.slice(0, 120)}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error('supabase_invalid_response');
  }

  const items = {};
  let asOf = null;
  let regularSession = null;

  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    if (!ticker) continue;
    const snapQuote = snapQuotes ? snapQuotes[ticker] : null;
    items[ticker] = mapSupabaseRow(row, snapQuote);
    if (row.as_of && (!asOf || String(row.as_of) > asOf)) asOf = row.as_of;
    if (row.regular_session != null && regularSession == null) {
      regularSession = !!row.regular_session;
    }
  }

  return {
    items,
    asOf: asOf || new Date().toISOString(),
    regularSession,
  };
}

function applyReturnsFromSource(items, source) {
  const k = source?.meta?.k ?? 0;
  for (const [code, item] of Object.entries(items || {})) {
    if (!item) continue;
    const t = normalizeTicker(code);
    const src = t ? source?.byTicker?.[t] : null;
    if (!src) {
      item.chg1dPct = null;
      item.ret5dPct = null;
      item.ret20dPct = null;
      item.ret50dPct = null;
      item.ret120dPct = null;
      item.ret200dPct = null;
      continue;
    }
    const returns = computeStockReturns({
      numerator: src.numerator,
      closes: src.closes,
      k,
    });
    item.chg1dPct = returns.chg1dPct;
    item.ret5dPct = returns.ret5dPct;
    item.ret20dPct = returns.ret20dPct;
    item.ret50dPct = returns.ret50dPct;
    item.ret120dPct = returns.ret120dPct;
    item.ret200dPct = returns.ret200dPct;
    // Official mode: display last must match return numerator (refs tip close).
    if (src.last != null) item.last = src.last;
  }
}

async function fetchQuotesFromNaver(codes, authKey, warmHist) {
  const cached = await getCachedNaverQuotes(codes, { concurrency: 4 });
  let items = cached.items;
  items = await mergeKrxYoy(codes, items, authKey, warmHist);

  return {
    items,
    source: authKey && warmHist ? 'naver-sise-cache+krx-yoy' : 'naver-sise-cache',
    regularSession: cached.regularSession,
    tradeDate: cached.tradeDate || null,
    cacheHits: cached.cacheHits,
    naverFetched: cached.fetched,
  };
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

  const authKey = getAuthKey(env);
  const url = new URL(request.url);
  const codesRaw = url.searchParams.get('codes') || '';
  const codes = [...new Set(codesRaw.split(/[, ]+/).map(normalizeTicker).filter(Boolean))];
  const session = krxSessionInfo();
  // Prefer loader meta; fall back to regular-only session (never aftermarket).
  const sessionOpenFallback = !!session.regular;
  const warmHist = url.searchParams.get('warm') === '1';
  const supabaseConfig = getSupabaseConfig(env);

  const snap = await loadRsSnapshot(request, env);
  const snapQuotes = snap && snap.quotes ? snap.quotes : null;
  const indices = slimMarketIndices(snap && snap.indices);

  const emptyMeta = {
    sessionOpen: sessionOpenFallback,
    numeratorMode: sessionOpenFallback ? 'live' : 'official',
    anchorDd: null,
    refsRecentDd: null,
    k: 0,
    stale: false,
  };

  if (!codes.length) {
    return new Response(
      JSON.stringify({
        asOf: new Date().toISOString(),
        items: {},
        source: supabaseConfig ? 'supabase' : 'naver-sise-cache',
        configured: true,
        krxConfigured: !!authKey,
        regularSession: !!session.regular,
        ...emptyMeta,
        ...(indices ? { indices } : {}),
      }),
      { headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  try {
    let payload;

    if (supabaseConfig) {
      try {
        const supabase = await fetchQuotesFromSupabase(codes, supabaseConfig, snapQuotes);
        payload = {
          asOf: supabase.asOf,
          source: 'supabase',
          regularSession: !!session.regular,
          items: supabase.items,
        };
      } catch {
        const naver = await fetchQuotesFromNaver(codes, authKey, warmHist);
        payload = {
          asOf: new Date().toISOString(),
          ...naver,
          regularSession: !!session.regular,
        };
      }
    } else {
      const naver = await fetchQuotesFromNaver(codes, authKey, warmHist);
      payload = {
        asOf: new Date().toISOString(),
        ...naver,
        regularSession: !!session.regular,
      };
    }

    applySnapshotRsToItems(payload.items, snapQuotes);

    const source = await loadReturnSource({
      env,
      request,
      tickers: codes,
      staleRefresh: sessionOpenFallback
        ? async (staleCodes) => getCachedNaverQuotes(staleCodes, { concurrency: 4 })
        : null,
    });

    applyReturnsFromSource(payload.items, source);
    Object.assign(payload, source.meta);
    if (source.meta?.asOf) payload.asOf = source.meta.asOf;
    payload.regularSession = source.meta?.regularSession ?? !!session.regular;
    payload.sessionOpen = source.meta?.sessionOpen ?? sessionOpenFallback;
    if (source.meta?.stale) payload.source = `${payload.source}+stale-naver`;

    if (indices) payload.indices = indices;
    const codesHash = simpleHash(codes.slice().sort().join(','));
    return returnsJsonResponse(request, payload, {
      cors: ch,
      dataVersion: payload.dataVersion || source.meta?.dataVersion || null,
      codesHash,
      extra: { 'X-InvestingMap-Quotes-Version': QUOTES_CACHE_VERSION },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'quotes_fetch_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        items: {},
        regularSession: !!session.regular,
        ...emptyMeta,
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
