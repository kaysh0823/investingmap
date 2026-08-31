/**
 * Cloudflare Pages Function: GET /api/hub_sectors
 * Sector mcap-sum return — same sources/anchors as /api/hub_trend
 * (sector_mcap_daily / sector_intraday_snapshots → end−100).
 * Fallback: sector_returns table, then KRX mcap-ratio.
 */

import {
  buildHubSectors,
  buildHubSectorsFromSupabaseRows,
  loadHubIndexFromRequest,
  SECTOR_ORDER,
  uniqueHubMcapTotal,
} from '../lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { krxSessionInfo, kstAnchorYmd } from '../lib/krx_session.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  hasSectorHorizon,
  hubEdgeMaxAge,
  normalizeSectorHorizon,
  putHubCache,
  putHubStaleCache,
  readHubCache,
  readHubCacheJson,
} from '../lib/hub_api_cache.mjs';
import {
  buildAllHorizonReturnsBySector,
  TREND_HORIZONS,
  TREND_RET_KEY,
} from '../lib/hub_trend.mjs';
import {
  fetchSupabaseJson,
  getSupabaseConfig,
} from '../lib/supabase_hub.mjs';

const CACHE_VERSION = '/api/hub_sectors/cache/v19';

/** Reject Supabase rows if newest updated_at is older than this (covers weekend + holiday buffer). */
const SECTOR_RETURNS_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function cachePaths(horizon, now = new Date()) {
  const dayBase = anchoredCachePath(CACHE_VERSION, now);
  const base = `${dayBase}/${horizon}`;
  return { fresh: base, stale: `${base}/stale`, anchor: kstAnchorYmd(now) };
}

function sectorResponseHeaders(ch, horizon, cacheTag, maxAge, anchor) {
  return {
    ...ch,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 6}`,
    'X-Hub-Cache': cacheTag,
    'X-Hub-Horizon': horizon,
    'X-Hub-Anchor': anchor,
  };
}

/** @returns {boolean} true when data is too old → fall through to KRX */
function isSectorReturnsStale(rows, now = new Date()) {
  let newest = null;
  for (const row of rows || []) {
    if (!row || row.updated_at == null) continue;
    const t = Date.parse(row.updated_at);
    if (!Number.isFinite(t)) continue;
    if (newest == null || t > newest) newest = t;
  }
  if (newest == null) return true;
  return now.getTime() - newest > SECTOR_RETURNS_MAX_AGE_MS;
}

/** True when every TREND horizon has at least one finite sector return. */
function hasAllHorizons(sectors) {
  return TREND_HORIZONS.every((h) => hasSectorHorizon(sectors, h));
}

/**
 * Primary path: fill ALL return{1d,20d,50d,120d,200d}Pct in one payload
 * (same mcap series as /api/hub_trend) so the hub can fetch once and switch tabs.
 */
async function buildSectorPayloadFromTrend(request, env, horizon) {
  const config = getSupabaseConfig(env);
  if (!config) return null;
  const hubIndex = await loadHubIndexFromRequest(request, env);
  const { bySector, anchors } = await buildAllHorizonReturnsBySector(hubIndex, env);

  let filledCells = 0;
  for (const sid of SECTOR_ORDER) {
    const rets = bySector[sid] || {};
    for (const h of TREND_HORIZONS) {
      if (rets[TREND_RET_KEY[h]] != null) filledCells += 1;
    }
  }
  // Need broad coverage across horizons (≈22 sectors × 5), not a single tab.
  if (filledCells < SECTOR_ORDER.length) return null;

  const session = krxSessionInfo();
  const totalMcap = uniqueHubMcapTotal(hubIndex);
  const sectors = {};
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const companies = block.companies || [];
    const sectorMcap = companies.reduce((s, c) => s + (c.mcapWon || 0), 0);
    const rets = bySector[sid] || {};
    sectors[sid] = {
      return1dPct: rets.return1dPct ?? null,
      return20dPct: rets.return20dPct ?? null,
      return50dPct: rets.return50dPct ?? null,
      return120dPct: rets.return120dPct ?? null,
      return200dPct: rets.return200dPct ?? null,
      mcapWon: sectorMcap,
      weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
      listingCount: companies.length,
    };
  }

  if (!hasAllHorizons(sectors)) return null;

  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: session.regular,
    horizon,
    source: 'sector_mcap_trend',
    krxConfigured: !!getAuthKey(env),
    mcapRecentDd: anchors.mcapRecentDd,
    effectiveAnchorDd: anchors.effectiveAnchorDd,
    mcapPast1dDd: anchors.mcapPast1dDd,
    mcapPast20dDd: anchors.mcapPast20dDd,
    mcapPast50dDd: anchors.mcapPast50dDd,
    mcapPast120dDd: anchors.mcapPast120dDd,
    mcapPast200dDd: anchors.mcapPast200dDd,
    sectors,
  };
}

async function buildSectorPayloadFromSupabase(request, env, horizon) {
  const config = getSupabaseConfig(env);
  if (!config) return null;
  const rows = await fetchSupabaseJson(config, 'sector_returns?select=*');
  if (!rows.length) return null;
  if (isSectorReturnsStale(rows)) return null;
  const hubIndex = await loadHubIndexFromRequest(request, env);
  const payload = buildHubSectorsFromSupabaseRows(hubIndex, rows, env, { horizon });
  if (!hasSectorHorizon(payload.sectors, horizon)) return null;
  return payload;
}

async function buildSectorPayload(request, env, horizon) {
  try {
    const fromTrend = await buildSectorPayloadFromTrend(request, env, horizon);
    if (fromTrend && hasSectorHorizon(fromTrend.sectors, horizon)) return fromTrend;
  } catch {
    /* fall through */
  }
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
  const maxAge = hubEdgeMaxAge();
  const url = new URL(request.url);
  const { fresh, stale, anchor } = cachePaths(horizon);
  const body = JSON.stringify(payload);
  const response = new Response(body, {
    headers: sectorResponseHeaders(ch, horizon, cacheTag, maxAge, anchor),
  });
  if (!nocache && hasSectorHorizon(payload.sectors, horizon)) {
    putHubCache(context, fresh, url.origin, response);
    putHubStaleCache(context, stale, url.origin, body, {
      'X-Hub-Horizon': horizon,
      'X-Hub-Cache': 'STORED',
      'X-Hub-Anchor': anchor,
    });
  }
  return response;
}

async function revalidateInBackground(context, request, env, horizon, ch) {
  const url = new URL(request.url);
  const { fresh, stale, anchor } = cachePaths(horizon);
  try {
    const payload = await buildSectorPayload(request, env, horizon);
    if (!hasSectorHorizon(payload.sectors, horizon)) return;
    const maxAge = hubEdgeMaxAge();
    const body = JSON.stringify(payload);
    const response = new Response(body, {
      headers: sectorResponseHeaders(ch, horizon, 'REVALIDATED', maxAge, anchor),
    });
    const cache = caches.default;
    await cache.put(new Request(new URL(fresh, url.origin).toString()), response.clone());
    const staleMax = Math.max(60, Math.min(86400, maxAge * 48));
    await cache.put(
      new Request(new URL(stale, url.origin).toString()),
      new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${staleMax}, stale-while-revalidate=${Math.min(604800, staleMax * 6)}`,
          'X-Hub-Horizon': horizon,
          'X-Hub-Cache': 'STORED',
          'X-Hub-Anchor': anchor,
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
  const { fresh, stale, anchor } = cachePaths(horizon);

  if (!nocache) {
    const hit = await readHubCache(fresh, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Hub-Cache', 'HIT');
      headers.set('X-Hub-Anchor', anchor);
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  if (!nocache) {
    const stalePayload = await readHubCacheJson(stale, url.origin);
    if (stalePayload && hasSectorHorizon(stalePayload.sectors, horizon)) {
      context.waitUntil(revalidateInBackground(context, request, env, horizon, ch));
      const maxAge = hubEdgeMaxAge();
      return new Response(JSON.stringify(stalePayload), {
        headers: sectorResponseHeaders(ch, horizon, 'STALE', maxAge, anchor),
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
