/**
 * Cloudflare Pages Function: GET /api/quotes?codes=005930,000660
 * Naver Finance crawl (PC sise + mobile integration, cached: 5 min regular / 30 min off-hours).
 * Optional KRX OPEN API: 1-year return when warm=1 and secret configured.
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

  if (!codes.length) {
    return new Response(
      JSON.stringify({
        asOf: new Date().toISOString(),
        items: {},
        source: 'naver-sise-cache',
        configured: true,
        krxConfigured: !!authKey,
        regularSession: session.regular,
      }),
      { headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  const warmHist = url.searchParams.get('warm') === '1';

  try {
    const cached = await getCachedNaverQuotes(codes, { concurrency: 4 });
    let items = cached.items;
    items = await mergeKrxYoy(codes, items, authKey, warmHist);

    const payload = {
      asOf: new Date().toISOString(),
      source: authKey && warmHist ? 'naver-sise-cache+krx-yoy' : 'naver-sise-cache',
      regularSession: cached.regularSession,
      cacheHits: cached.cacheHits,
      naverFetched: cached.fetched,
      items,
    };

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
