import { getSupabaseConfig } from '../lib/supabase_hub.mjs';
import { loadTickerPerfCalendar } from '../lib/ticker_perf_calendar.mjs';
import { readHubCache, putHubCache } from '../lib/hub_api_cache.mjs';
import { kstYmdDash } from '../lib/krx_session.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,OPTIONS' } });
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers });
  const url = new URL(request.url);
  const ticker = String(url.searchParams.get('code') || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(ticker)) return new Response(JSON.stringify({ error: 'invalid_code' }), { status: 400, headers });
  const cachePath = '/api/ticker_perf_calendar/cache/v1/' + kstYmdDash() + '/' + ticker;
  const hit = await readHubCache(cachePath, url.origin);
  if (hit) return hit;
  try {
    const config = getSupabaseConfig(env);
    if (!config) throw new Error('missing_config');
    const payload = await loadTickerPerfCalendar(config, ticker);
    const hasData = payload.years.some(line => line.points.length);
    const response = new Response(JSON.stringify(payload), { headers: { ...headers, 'Cache-Control': `public, max-age=${hasData ? 300 : 30}` } });
    putHubCache(context, cachePath, url.origin, response);
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: 'ticker_perf_calendar_failed', ticker, reason: String(error?.message || error).split(':')[0] }));
    return new Response(JSON.stringify({ error: 'history_unavailable' }), { status: 503, headers: { ...headers, 'Cache-Control': 'no-store', 'Retry-After': '2' } });
  }
}
