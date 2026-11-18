import { listHubCompanies, loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { loadReturnSource } from '../lib/hub_returns_source.mjs';
import { anchoredCachePath, corsHeaders, hubEdgeMaxAge, putHubCache, readHubCache } from '../lib/hub_api_cache.mjs';
import { normalizeSectorWeighting } from '../lib/sector_weighting.mjs';
import { buildSectorReturnRankings } from '../lib/sector_trend_core.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  const url = new URL(request.url);
  const weighting = normalizeSectorWeighting(url.searchParams.get('weighting'));
  const path = anchoredCachePath(`/api/hub_sector_rankings/cache/v6/${weighting}`);
  const hit = await readHubCache(path, url.origin);
  if (hit) {
    const headers = new Headers(hit.headers);
    Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
    return new Response(hit.body, { status: hit.status, headers });
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const tickers = listHubCompanies(hubIndex).map(({ ticker }) => ticker);
    const source = await loadReturnSource({ env, request, tickers });
    const { refs } = source;
    if (!refs?.quotes) throw new Error('return_refs_unavailable');
    const payload = buildSectorReturnRankings(hubIndex, refs, weighting, source);
    const response = Response.json(payload, {
      headers: { ...cors, 'Cache-Control': `public, max-age=${hubEdgeMaxAge()}` },
    });
    if (payload.daily.some(({ returns }) => returns.length)) {
      putHubCache(context, path, url.origin, response);
    }
    return response;
  } catch (error) {
    console.warn('[hub_sector_rankings]', error?.message || error);
    return Response.json({ error: 'hub_sector_rankings_unavailable' }, {
      status: 503,
      headers: { ...cors, 'Cache-Control': 'no-store' },
    });
  }
}
