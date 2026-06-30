/**
 * Cloudflare Pages Function: GET /api/hub_rs_snapshot
 * Full-market RS map for table lookup (static file or live KRX build).
 */

import { buildKrxRsSnapshot } from '../lib/krx_rs.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { loadHubRsSnapshotFromRequest } from '../lib/hub_dashboard_core.mjs';
import {
  corsHeaders,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';

const CACHE_PATH = '/api/hub_rs_snapshot/cache/v1';

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
    let snapshot = await loadHubRsSnapshotFromRequest(request, env);
    if ((!snapshot || !snapshot.quotes || !Object.keys(snapshot.quotes).length) && env) {
      const authKey = getAuthKey(env);
      if (authKey) snapshot = await buildKrxRsSnapshot(authKey);
    }
    const payload = snapshot || { quotes: {}, source: 'missing' };
    const response = new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=21600',
        'X-Hub-Cache': 'MISS',
      },
    });
    if (!nocache && payload.quotes && Object.keys(payload.quotes).length > 500) {
      putHubCache(context, CACHE_PATH, url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_rs_snapshot_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        quotes: {},
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
