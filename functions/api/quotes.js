/**
 * Cloudflare Pages Function: GET /api/quotes?codes=005930,000660
 * Primary: Supabase stock_quotes_latest (derived fields) + Naver live overlay (last/prevClose, regular session).
 * Fallback: Naver Finance crawl (PC sise + mobile integration, cached: 5 min regular / 30 min off-hours).
 * Optional KRX OPEN API on fallback path: 1-year return when warm=1 and secret configured.
 */

import { getCachedNaverQuotes } from '../lib/naver_quote_store.mjs';
import { edgeCacheMaxAgeSeconds, krxSessionInfo } from '../lib/krx_session.mjs';
import { getAuthKey, mergeKrxYoy } from '../lib/krx_yoy.mjs';

const QUOTES_CACHE_VERSION = 'v5';

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
    'Access-Control-Allow-Headers': 'Content-Type',
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

function mapSupabaseRow(row) {
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
    bbUpper: numOrNull(row.bb_upper),
    bbLower: numOrNull(row.bb_lower),
    mcapWon: numOrNull(row.mcap_won),
    turnoverWon: numOrNull(row.turnover_won),
    per: numOrNull(row.per),
    pbr: numOrNull(row.pbr),
    chg1dPct: numOrNull(row.chg_1d_pct),
    ret5dPct: numOrNull(row.ret_5d_pct),
    ret20dPct: numOrNull(row.ret_20d_pct),
    ret50dPct: numOrNull(row.ret_50d_pct),
    ret120dPct: numOrNull(row.ret_120d_pct),
    ret200dPct: numOrNull(row.ret_200d_pct),
    rs: numOrNull(row.rs),
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

async function fetchQuotesFromSupabase(codes, config) {
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
    items[ticker] = mapSupabaseRow(row);
    if (row.as_of && !asOf) asOf = row.as_of;
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

async function fetchNaverLiveOverlay(codes) {
  return getCachedNaverQuotes(codes, { concurrency: 4 });
}

/**
 * Overlay Naver last/prevClose onto Supabase rows; derived fields stay from Supabase.
 * @param {string[]} codes
 * @param {Record<string, object>} supabaseItems
 * @param {Record<string, object>} naverItems
 */
function mergeSupabaseWithNaverLive(codes, supabaseItems, naverItems) {
  const items = {};
  for (const code of codes) {
    const base = supabaseItems[code] ? { ...supabaseItems[code] } : {};
    const naver = naverItems[code];
    if (naver) {
      const liveLast = numOrNull(naver.last);
      if (liveLast != null) {
        base.last = liveLast;
        const livePrev = numOrNull(naver.prevClose);
        if (livePrev != null) base.prevClose = livePrev;
        if (base.prevClose != null && base.prevClose > 0) {
          base.chg1dPct = Math.round(((base.last / base.prevClose) - 1) * 10000) / 100;
        }
      }
    }
    if (Object.keys(base).length) items[code] = base;
  }
  return items;
}

function quotesCacheControl(now = new Date()) {
  if (krxSessionInfo(now).regular) {
    return 'public, max-age=300, stale-while-revalidate=120';
  }
  const maxAge = edgeCacheMaxAgeSeconds(now);
  return `public, max-age=${maxAge}`;
}

async function fetchQuotesFromNaver(codes, authKey, warmHist) {
  const cached = await getCachedNaverQuotes(codes, { concurrency: 4 });
  let items = cached.items;
  items = await mergeKrxYoy(codes, items, authKey, warmHist);

  return {
    items,
    source: authKey && warmHist ? 'naver-sise-cache+krx-yoy' : 'naver-sise-cache',
    regularSession: cached.regularSession,
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
  const warmHist = url.searchParams.get('warm') === '1';
  const supabaseConfig = getSupabaseConfig(env);

  if (!codes.length) {
    return new Response(
      JSON.stringify({
        asOf: new Date().toISOString(),
        items: {},
        source: supabaseConfig ? 'supabase' : 'naver-sise-cache',
        configured: true,
        krxConfigured: !!authKey,
        regularSession: session.regular,
      }),
      { headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  try {
    let payload;

    if (supabaseConfig) {
      try {
        const supabase = await fetchQuotesFromSupabase(codes, supabaseConfig);
        const regular =
          supabase.regularSession != null ? supabase.regularSession : session.regular;

        if (regular) {
          let naverItems = {};
          try {
            const naver = await fetchNaverLiveOverlay(codes);
            naverItems = naver.items || {};
          } catch {
            /* Naver failure → Supabase last for all codes */
          }
          payload = {
            asOf: supabase.asOf,
            source: 'supabase+naver-live',
            regularSession: regular,
            items: mergeSupabaseWithNaverLive(codes, supabase.items, naverItems),
          };
        } else {
          payload = {
            asOf: supabase.asOf,
            source: 'supabase',
            regularSession: regular,
            items: supabase.items,
          };
        }
      } catch {
        const naver = await fetchQuotesFromNaver(codes, authKey, warmHist);
        payload = {
          asOf: new Date().toISOString(),
          ...naver,
        };
      }
    } else {
      const naver = await fetchQuotesFromNaver(codes, authKey, warmHist);
      payload = {
        asOf: new Date().toISOString(),
        ...naver,
      };
    }

    const cacheControl = quotesCacheControl();
    return new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheControl,
        'X-InvestingMap-Quotes-Version': QUOTES_CACHE_VERSION,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'quotes_fetch_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        items: {},
        regularSession: session.regular,
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
