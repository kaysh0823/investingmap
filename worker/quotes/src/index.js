/**
 * Cloudflare Worker: batch domestic quotes from Naver m.stock JSON + sise HTML fallback.
 * GET /?codes=005930,000660,373220
 */

import { fetchNaverQuote, mergeNaverIntoQuote, emptyQuote } from '../../../functions/lib/naver_sise_quotes.mjs';

const NAVER_UA = 'investingmap-quotes-worker/1.0 (compatible; +https://github.com/)';
const CACHE_TTL_MS = 45_000;
const memCache = new Map(); // key -> { t, body }

function corsHeaders(request, env) {
  const raw = (env && env.ALLOW_ORIGINS) || '';
  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  let allow = '*';
  if (allowed.length) {
    allow = allowed.includes(origin) ? origin : allowed[0];
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

function parseKoreanNumber(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function infoValue(integration, code) {
  const arr = integration && integration.totalInfos;
  if (!Array.isArray(arr)) return null;
  const row = arr.find((x) => x && x.code === code);
  return row ? parseKoreanNumber(row.value) : null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': NAVER_UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchDailyPages(code) {
  const merged = [];
  for (let page = 1; page <= 5; page++) {
    const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/price?pageSize=60&page=${page}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': NAVER_UA, Accept: 'application/json' },
    });
    if (!res.ok) break;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) break;
    merged.push(...arr);
    if (arr.length < 60) break;
  }
  return merged;
}

function yoyFromDaily(daily) {
  if (!Array.isArray(daily) || daily.length < 252) return null;
  const last0 = parseKoreanNumber(daily[0] && daily[0].closePrice);
  const last251 = parseKoreanNumber(daily[251] && daily[251].closePrice);
  if (last0 == null || last251 == null || last251 === 0) return null;
  return ((last0 / last251 - 1) * 100);
}

async function quoteOne(code) {
  let item = emptyQuote();
  try {
    const integrationUrl = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/integration`;
    const integration = await fetchJson(integrationUrl);
    const high52w = infoValue(integration, 'highPriceOf52Weeks');
    const low52w = infoValue(integration, 'lowPriceOf52Weeks');
    let last = null;
    const dt = integration && integration.dealTrendInfos;
    if (Array.isArray(dt) && dt[0] && dt[0].closePrice != null) {
      last = parseKoreanNumber(dt[0].closePrice);
    }
    if (last == null) last = infoValue(integration, 'lastClosePrice');

    const daily = await fetchDailyPages(code);
    const yoyReturnPct = yoyFromDaily(daily);
    item = mergeNaverIntoQuote(item, { last, high52w, low52w }, { preferNaverLast: true });
    if (yoyReturnPct != null) item.yoyReturnPct = yoyReturnPct;
  } catch {
    /* merged below */
  }

  try {
    const naver = await fetchNaverQuote(code);
    item = mergeNaverIntoQuote(item, naver, { preferNaverLast: true, preferNaverFundamentals: true });
  } catch {
    /* keep partial */
  }
  return item;
}

export default {
  async fetch(request, env) {
    const ch = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: ch });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: ch });
    }

    const url = new URL(request.url);
    const codesRaw = url.searchParams.get('codes') || '';
    const codes = [...new Set(codesRaw.split(/[, ]+/).map(normalizeTicker).filter(Boolean))];
    if (!codes.length) {
      const body = JSON.stringify({ asOf: new Date().toISOString(), items: {} });
      return new Response(body, {
        headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const cacheKey = codes.slice().sort().join(',');
    const now = Date.now();
    const hit = memCache.get(cacheKey);
    if (hit && now - hit.t < CACHE_TTL_MS) {
      return new Response(hit.body, {
        headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT' },
      });
    }

    const items = {};
    const concurrency = 4;
    for (let i = 0; i < codes.length; i += concurrency) {
      const batch = codes.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (code) => {
          try {
            items[code] = await quoteOne(code);
          } catch {
            items[code] = emptyQuote();
          }
        }),
      );
    }

    const payload = { asOf: new Date().toISOString(), items };
    const body = JSON.stringify(payload);
    memCache.set(cacheKey, { t: now, body });
    return new Response(body, {
      headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'MISS' },
    });
  },
};
