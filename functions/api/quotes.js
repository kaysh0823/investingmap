/**
 * Cloudflare Pages Function: GET /api/quotes?codes=005930,000660
 * Primary: Supabase stock_quotes_latest (when configured).
 * Fallback: Naver Finance crawl (PC sise + mobile integration, cached: 5 min regular / 30 min off-hours).
 * Optional KRX OPEN API on fallback path: 1-year return when warm=1 and secret configured.
 */

import { getCachedNaverQuotes } from '../lib/naver_quote_store.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import { getAuthKey, mergeKrxYoy } from '../lib/krx_yoy.mjs';

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
    mcapWon: numOrNull(row.mcap_won),
    per: numOrNull(row.per),
    pbr: numOrNull(row.pbr),
    chg1dPct: numOrNull(row.chg_1d_pct),
    ret5dPct: numOrNull(row.ret_5d_pct),
    ret20dPct: numOrNull(row.ret_20d_pct),
    ret50dPct: numOrNull(row.ret_50d_pct),
    ret120dPct: numOrNull(row.ret_120d_pct),
    ret250dPct: numOrNull(row.ret_250d_pct),
    rs: numOrNull(row.rs),
  };
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
        payload = {
          asOf: supabase.asOf,
          source: 'supabase',
          regularSession: supabase.regularSession != null ? supabase.regularSession : session.regular,
          items: supabase.items,
        };
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

    const maxAge = session.regular ? 300 : 86400;
    return new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}`,
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
