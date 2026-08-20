/**
 * Cloudflare Pages Function: GET /api/ticker_ohlc?code=005930&range=1y
 * Daily OHLC+volume bars from stock_price_history ({t,o,h,l,c,v}[]).
 * range=3m|6m|1y|3y|5y. Fetch includes trailing indicator warmup where available.
 */

import {
  emptyTickerOhlcPayload,
  fetchTickerOhlcBars,
  getSupabaseConfig,
  normalizeOhlcRange,
  normalizeTicker,
} from '../lib/ticker_ohlc.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  hubEdgeMaxAge,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';

const CACHE_BASE = '/api/ticker_ohlc/cache/v11';

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
  const maxAge = hubEdgeMaxAge();

  if (!code) {
    return jsonResponse(ch, emptyTickerOhlcPayload(null, range), maxAge);
  }

  const cachePath = `${anchoredCachePath(CACHE_BASE)}/${code}/${range}`;
  const hit = await readHubCache(cachePath, url.origin);
  if (hit) {
    const headers = new Headers(hit.headers);
    Object.entries(ch).forEach(([k, v]) => headers.set(k, v));
    headers.set('X-Cache', 'HIT');
    return new Response(hit.body, { status: hit.status, headers });
  }

  const config = getSupabaseConfig(env);
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
  if (payload.bars && payload.bars.length) {
    putHubCache(context, cachePath, url.origin, response);
  }
  return response;
}
