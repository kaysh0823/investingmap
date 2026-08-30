/**
 * Cloudflare Pages Function: GET /api/ticker_ohlc?code=005930&range=1y
 * Daily OHLC+volume bars from stock_price_history ({t,o,h,l,c,v}[]).
 * range=3m|6m|1y|3y|5y. Fetch includes trailing indicator warmup where available.
 */

import {
  emptyTickerOhlcPayload,
  fetchLatestHistorySignature,
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
const CACHE_BASE = '/api/ticker_ohlc/cache/v13';

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
  const maxAge = ohlcEdgeMaxAge();

  if (!code) {
    return jsonResponse(ch, emptyTickerOhlcPayload(null, range), maxAge);
  }

  const config = getSupabaseConfig(env);
  let lastSig = 'none';
  let adjSig = 'adj-none';
  if (config) {
    try {
      lastSig = await fetchLatestHistorySignature(config, code);
      adjSig = await fetchPriceAdjustmentsSignature(config, code);
    } catch {
      lastSig = 'none';
      adjSig = 'adj-none';
    }
  }

  // Signature invalidates when the last history bar or price_adjustments rows change.
  const cachePath = `${anchoredCachePath(CACHE_BASE)}/${code}/${range}/${lastSig}/${adjSig}`;
  const hit = await readHubCache(cachePath, url.origin);
  if (hit) {
    const headers = new Headers(hit.headers);
    Object.entries(ch).forEach(([k, v]) => headers.set(k, v));
    headers.set('X-Cache', 'HIT');
    headers.set('X-OHLC-Sig', lastSig);
    headers.set('X-OHLC-Adj', adjSig);
    return new Response(hit.body, { status: hit.status, headers });
  }

  let payload = emptyTickerOhlcPayload(code, range);
  if (config) {
    try {
      payload = await fetchTickerOhlcBars(config, code, range);
    } catch (err) {
      console.warn(
        '[ticker_ohlc] fetch failed:',
        err && err.message ? err.message : err,
      );
      payload = emptyTickerOhlcPayload(code, range);
    }
  }

  const response = jsonResponse(ch, payload, maxAge);
  response.headers.set('X-OHLC-Sig', lastSig);
  response.headers.set('X-OHLC-Adj', adjSig);
  if (payload.bars && payload.bars.length) {
    putHubCache(context, cachePath, url.origin, response);
  }
  return response;
}
