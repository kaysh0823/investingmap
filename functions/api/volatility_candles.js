import { getSupabaseConfig } from '../lib/supabase_hub.mjs';
import { candleCodes, loadVolatilityCandles } from '../lib/volatility_candles.mjs';
import { readHubCache, putHubCache } from '../lib/hub_api_cache.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,OPTIONS' } });
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers });
  const url = new URL(request.url);
  let codes;
  try { codes = candleCodes(url.searchParams.get('codes')); }
  catch { return new Response(JSON.stringify({ error: 'too_many_codes' }), { status: 400, headers }); }
  if (!codes.length) return new Response(JSON.stringify({ error: 'codes_required' }), { status: 400, headers });
  const cachePath = '/api/volatility_candles/cache/v2?codes=' + codes.join(',');
  const cached = await readHubCache(cachePath, url.origin);
  if (cached) return cached;
  const config = getSupabaseConfig(env);
  try {
    if (!config) throw new Error('missing_config');
    const data = await loadVolatilityCandles(config, codes);
    // Keep persisted intraday OHLC fresh without triggering upstream collection.
    const response = new Response(JSON.stringify(data), { headers: { ...headers, 'Cache-Control': 'public, max-age=30' } });
    putHubCache(context, cachePath, url.origin, response);
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: 'volatility_candles_failed', count: codes.length, reason: String(error?.message || error).split(':')[0] }));
    return new Response(JSON.stringify({ error: 'history_unavailable', retryable: true }), { status: 503, headers: { ...headers, 'Cache-Control': 'no-store', 'Retry-After': '2' } });
  }
}
