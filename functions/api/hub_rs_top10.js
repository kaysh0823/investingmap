/**
 * Cloudflare Pages Function: GET /api/hub_rs_top10
 * Top-10 Relative Strength.
 * Primary: Supabase stock_quotes_latest (rs desc). Fallback: hub_rs_snapshot / KRX live.
 */

import {
  buildHubRsTop10FromSupabaseRows,
  buildHubRsTop10Payload,
  hubRsTop10Cacheable,
  loadHubIndexFromRequest,
} from '../lib/hub_dashboard_core.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import {
  fetchSupabaseJson,
  getSupabaseConfig,
} from '../lib/supabase_hub.mjs';

const CACHE_PATH = '/api/hub_rs_top10/cache/v1';

async function buildRsTop10FromSupabase(hubIndex, config) {
  const rows = await fetchSupabaseJson(
    config,
    'stock_quotes_latest?select=ticker,rs,as_of&order=rs.desc.nullslast&limit=10',
  );
  if (!rows.length) return null;
  const payload = buildHubRsTop10FromSupabaseRows(hubIndex, rows, { source: 'supabase' });
  if (!payload.top10 || !payload.top10.length) return null;
  return payload;
}

async function buildRsTop10Payload(request, env) {
  const config = getSupabaseConfig(env);
  if (config) {
    try {
      const hubIndex = await loadHubIndexFromRequest(request, env);
      const supabase = await buildRsTop10FromSupabase(hubIndex, config);
      if (supabase) return supabase;
    } catch {
      /* fall through to legacy path */
    }
  }
  const hubIndex = await loadHubIndexFromRequest(request, env);
  return buildHubRsTop10Payload(hubIndex, env, request);
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
  const session = krxSessionInfo();
  const nocache = url.searchParams.get('nocache') === '1';

  if (!nocache) {
    const hit = await readHubCache(CACHE_PATH, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Hub-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const payload = await buildRsTop10Payload(request, env);
    const maxAge = session.regular ? 300 : 1800;
    const response = new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}`,
        'X-Hub-Cache': 'MISS',
      },
    });
    if (!nocache && hubRsTop10Cacheable(payload)) {
      putHubCache(context, CACHE_PATH, url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_rs_top10_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        regularSession: session.regular,
        top10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
