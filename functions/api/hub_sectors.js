/**
 * Cloudflare Pages Function: GET /api/hub_sectors
 * Sector mcap-weighted return.
 * Primary: Supabase sector_returns. Fallback: KRX mcap-ratio (hub_dashboard_core).
 */

import { buildHubSectors, buildHubSectorsFromSupabaseRows, loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  hasSectorHorizon,
  normalizeSectorHorizon,
  putHubCache,
  putHubStaleCache,
  readHubCache,
  readHubCacheJson,
} from '../lib/hub_api_cache.mjs';
import {
  fetchSupabaseJson,
  getSupabaseConfig,
} from '../lib/supabase_hub.mjs';

const CACHE_VERSION = '/api/hub_sectors/cache/v6';

function cachePaths(horizon) {
  const base = `${CACHE_VERSION}/${horizon}`;
  return { fresh: base, stale: `${base}/stale` };
}

function sectorResponseHeaders(ch, horizon, cacheTag, maxAge) {
  return {
    ...ch,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 6}`,
    'X-Hub-Cache': cacheTag,
    'X-Hub-Horizon': horizon,
  };
}

async function buildSectorPayloadFromSupabase(request, env, horizon) {
  const config = getSupabaseConfig(env);
  if (!config) return null;
  const rows = await fetchSupabaseJson(config, 'sector_returns?select=*');
  if (!rows.length) return null;
  const hubIndex = await loadHubIndexFromRequest(request, env);
  const payload = buildHubSectorsFromSupabaseRows(hubIndex, rows, env, { horizon });
  if (!hasSectorHorizon(payload.sectors, horizon)) return null;
  return payload;
}

async function buildSectorPayload(request, env, horizon) {
  try {
    const supabase = await buildSectorPayloadFromSupabase(request, env, horizon);
    if (supabase) return supabase;
  } catch {
    /* fall through to legacy KRX path */
  }
  const hubIndex = await loadHubIndexFromRequest(request, env);
  return buildHubSectors(hubIndex, env, { horizon });
}

async function respondWithPayload(context, request, ch, horizon, payload, cacheTag, nocache) {
  const session = krxSessionInfo();
  const maxAge = session.regular ? 300 : 1800;
  const url = new URL(request.url);
  const { fresh, stale } = cachePaths(horizon);
  const body = JSON.stringify(payload);
  const response = new Response(body, {
    headers: sectorResponseHeaders(ch, horizon, cacheTag, maxAge),
  });
  if (!nocache && hasSectorHorizon(payload.sectors, horizon)) {
    putHubCache(context, fresh, url.origin, response);
    putHubStaleCache(context, stale, url.origin, body, {
      'X-Hub-Horizon': horizon,
      'X-Hub-Cache': 'STORED',
    });
  }
  return response;
}

async function revalidateInBackground(context, request, env, horizon, ch) {
  const url = new URL(request.url);
  const { fresh, stale } = cachePaths(horizon);
  try {
    const payload = await buildSectorPayload(request, env, horizon);
    if (!hasSectorHorizon(payload.sectors, horizon)) return;
    const session = krxSessionInfo();
    const maxAge = session.regular ? 300 : 1800;
    const body = JSON.stringify(payload);
    const response = new Response(body, {
      headers: sectorResponseHeaders(ch, horizon, 'REVALIDATED', maxAge),
    });
    const cache = caches.default;
    await cache.put(new Request(new URL(fresh, url.origin).toString()), response.clone());
    await cache.put(
      new Request(new URL(stale, url.origin).toString()),
      new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'X-Hub-Horizon': horizon,
          'X-Hub-Cache': 'STORED',
        },
      }),
    );
  } catch {
    /* background refresh failed — stale copy remains */
  }
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
  const horizon = normalizeSectorHorizon(url.searchParams.get('horizon'));
  const { fresh, stale } = cachePaths(horizon);

  if (!nocache) {
    const hit = await readHubCache(fresh, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Hub-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  if (!nocache) {
    const stalePayload = await readHubCacheJson(stale, url.origin);
    if (stalePayload && hasSectorHorizon(stalePayload.sectors, horizon)) {
      context.waitUntil(revalidateInBackground(context, request, env, horizon, ch));
      const maxAge = session.regular ? 300 : 1800;
      return new Response(JSON.stringify(stalePayload), {
        headers: sectorResponseHeaders(ch, horizon, 'STALE', maxAge),
      });
    }
  }

  try {
    const payload = await buildSectorPayload(request, env, horizon);
    return respondWithPayload(context, request, ch, horizon, payload, 'MISS', nocache);
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_sectors_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        krxConfigured: !!getAuthKey(env),
        regularSession: session.regular,
        sectors: {},
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
