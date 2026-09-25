/**
 * Cloudflare Pages Function: GET /api/ticker_ohlc?code=005930&range=1y
 * Daily OHLC+volume bars from stock_price_history ({t,o,h,l,c,v}[]).
 * range=3m|6m|1y|3y|5y. Fetch includes trailing indicator warmup where available.
 */

import {
  emptyTickerOhlcPayload,
  fetchLatestHistorySignature,
  fetchLatestInvestorNetSignature,
  fetchPriceAdjustmentsSignature,
  fetchTickerOhlcBars,
  getSupabaseConfig,
  normalizeOhlcRange,
  normalizeTicker,
} from '../lib/ticker_ohlc.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import { edgeCacheMaxAgeSeconds } from '../lib/krx_session.mjs';

/** Bump when payload shape / invalidation rules change. */
const CACHE_BASE = '/api/ticker_ohlc/cache/v26';

/** Closed-session TTL: short enough for post-close history/OHLCV catch-up. */
function ohlcEdgeMaxAge(now = new Date()) {
  return edgeCacheMaxAgeSeconds(now, { regularMax: 300, closedMax: 600 });
}

function jsonResponse(ch, body, maxAge) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...ch,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${Math.max(maxAge * 2, 600)}`,
    },
  });
}

function normalizeInterval(raw) {
  return String(raw || '').trim().toLowerCase() === 'weekly' ? 'weekly' : 'daily';
}

function msSince(t0) {
  return Math.max(0, Date.now() - t0);
}

/** @param {Array<[string, number]>} parts */
function formatServerTiming(parts) {
  return parts.map(([name, dur]) => `${name};dur=${Math.round(dur)}`).join(', ');
}

function exposeServerTiming(headers) {
  const prev = headers.get('Access-Control-Expose-Headers') || '';
  if (/\bServer-Timing\b/i.test(prev)) return;
  headers.set(
    'Access-Control-Expose-Headers',
    prev ? `${prev}, Server-Timing` : 'Server-Timing',
  );
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
  const code = normalizeTicker(url.searchParams.get('code') || url.searchParams.get('ticker'));
  const range = normalizeOhlcRange(url.searchParams.get('range'));
  const interval = normalizeInterval(url.searchParams.get('interval'));
  const maxAge = ohlcEdgeMaxAge();

  if (!code) {
    return jsonResponse(ch, emptyTickerOhlcPayload(null, range, interval), maxAge);
  }

  const config = getSupabaseConfig(env);
  let lastSig = 'none';
  let adjSig = 'adj-none';
  let invSig = 'inv-v9-none';
  const tSig0 = Date.now();
  if (config) {
    try {
      [lastSig, adjSig, invSig] = await Promise.all([
        fetchLatestHistorySignature(config, code),
        fetchPriceAdjustmentsSignature(config, code),
        fetchLatestInvestorNetSignature(config, { origin: url.origin, context }),
      ]);
    } catch {
      lastSig = 'none';
      adjSig = 'adj-none';
      invSig = 'inv-v9-none';
    }
  }
  const sigDur = msSince(tSig0);

  // Signature invalidates when history, adjustments, investor_net, or foreign_ratio depth changes.
  const cachePath = `${anchoredCachePath(CACHE_BASE)}/${code}/${range}/${interval}/${lastSig}/${adjSig}/${invSig}`;
  const tCache0 = Date.now();
  const hit = await readHubCache(cachePath, url.origin);
  const cacheDur = msSince(tCache0);
  if (hit) {
    const headers = new Headers(hit.headers);
    Object.entries(ch).forEach(([k, v]) => headers.set(k, v));
    headers.set('X-Cache', 'HIT');
    headers.set('X-OHLC-Sig', lastSig);
    headers.set('X-OHLC-Adj', adjSig);
    headers.set('X-OHLC-Inv', invSig);
    headers.set('X-OHLC-Interval', interval);
    headers.set('Server-Timing', formatServerTiming([
      ['sig', sigDur],
      ['cache', cacheDur],
    ]));
    exposeServerTiming(headers);
    return new Response(hit.body, { status: hit.status, headers });
  }

  let payload = emptyTickerOhlcPayload(code, range, interval);
  const tBars0 = Date.now();
  if (config) {
    try {
      payload = await fetchTickerOhlcBars(config, code, range, { interval });
    } catch (err) {
      console.warn(
        '[ticker_ohlc] fetch failed:',
        err && err.message ? err.message : err,
      );
      payload = emptyTickerOhlcPayload(code, range, interval);
    }
  }
  const barsDur = msSince(tBars0);

  const response = jsonResponse(ch, payload, maxAge);
  response.headers.set('X-OHLC-Sig', lastSig);
  response.headers.set('X-OHLC-Adj', adjSig);
  response.headers.set('X-OHLC-Inv', invSig);
  response.headers.set('X-OHLC-Interval', interval);
  response.headers.set('X-Cache', 'MISS');
  response.headers.set(
    'Server-Timing',
    formatServerTiming([
      ['sig', sigDur],
      ['cache', cacheDur],
      ['bars', barsDur],
    ]),
  );
  exposeServerTiming(response.headers);
  if (payload.bars && payload.bars.length) {
    putHubCache(context, cachePath, url.origin, response);
  }
  return response;
}
