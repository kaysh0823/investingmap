/**
 * Cloudflare Pages Function: GET /api/hub_sectors
 * Cap-weighted sector returns from the same loadReturnSource + aggregateSectorReturns
 * path as /api/quotes (not sector_mcap_daily).
 */

import {
  loadHubIndexFromRequest,
  SECTOR_ORDER,
  uniqueHubMcapTotal,
  listHubCompanies,
  normalizeTicker,
} from '../lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { kstAnchorYmd, edgeCacheMaxAgeSeconds, krxSessionInfo } from '../lib/krx_session.mjs';
import {
  anchoredCachePath,
  corsHeaders,
  hasSectorHorizon,
  putHubCache,
  putHubStaleCache,
  readHubCache,
  normalizeSectorHorizon,
} from '../lib/hub_api_cache.mjs';
import { getCachedNaverQuotes } from '../lib/naver_quote_store.mjs';
import { aggregateSectorReturns } from '../lib/returns_core.mjs';
import {
  loadReturnSource,
  pastSessionDd,
  sectorReturnsToApiFields,
} from '../lib/hub_returns_source.mjs';

const CACHE_VERSION = '/api/hub_sectors/cache/v22';

function cachePaths(horizon, now = new Date()) {
  const dayBase = anchoredCachePath(CACHE_VERSION, now);
  const base = `${dayBase}/${horizon}`;
  return { fresh: base, stale: `${base}/stale`, anchor: kstAnchorYmd(now) };
}

function hubEdgeMaxAgeLocal(now = new Date()) {
  const session = krxSessionInfo(now);
  if (session.regular || session.aftermarket) return 300;
  return edgeCacheMaxAgeSeconds(now, { regularMax: 300, closedMax: 1800 });
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

/**
 * Build hub_sectors payload from shared return source.
 * @param {object} hubIndex
 * @param {object} env
 * @param {Request} request
 * @param {string} horizon
 */
export async function buildHubSectorsFromReturnSource(hubIndex, env, request, horizon = '1d') {
  const companies = listHubCompanies(hubIndex);
  const tickers = companies.map((c) => normalizeTicker(c.ticker)).filter(Boolean);
  const session = krxSessionInfo();
  const sessionOpen = !!(session.regular || session.aftermarket);

  const source = await loadReturnSource({
    env,
    request,
    tickers,
    staleRefresh: sessionOpen
      ? async (staleCodes) => getCachedNaverQuotes(staleCodes, { concurrency: 4 })
      : null,
  });

  if (!source?.refs?.quotes || !Object.keys(source.byTicker || {}).length) {
    return null;
  }

  const k = source.meta.k ?? 0;
  const totalMcap = uniqueHubMcapTotal(hubIndex);
  const sectors = {};
  let missingShares = 0;

  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const companiesInSector = block.companies || [];
    const members = [];
    for (const c of companiesInSector) {
      const t = normalizeTicker(c.ticker);
      const src = t ? source.byTicker[t] : null;
      if (!src) continue;
      if (src.shares == null || !(src.shares > 0)) {
        missingShares += 1;
        continue;
      }
      members.push({
        numerator: src.numerator,
        closes: src.closes,
        k,
        shares: src.shares,
      });
    }
    const agg = aggregateSectorReturns(members);
    const sectorMcap = companiesInSector.reduce((s, c) => s + (c.mcapWon || 0), 0);
    sectors[sid] = {
      ...sectorReturnsToApiFields(agg),
      mcapWon: sectorMcap,
      weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
      listingCount: companiesInSector.length,
    };
  }

  if (missingShares) {
    console.warn(`[hub_sectors] skipped ${missingShares} member(s) without shares`);
  }

  const tradingDates = source.refs.tradingDates || [];
  const anchorDd = source.meta.anchorDd;

  return {
    asOf: source.meta.asOf,
    builtAt: hubIndex.builtAt || null,
    regularSession: sessionOpen,
    sessionOpen: source.meta.sessionOpen,
    numeratorMode: source.meta.numeratorMode,
    anchorDd,
    refsRecentDd: source.meta.refsRecentDd,
    k: source.meta.k,
    stale: !!source.meta.stale,
    horizon,
    source: 'stock_aggregate',
    krxConfigured: !!getAuthKey(env),
    mcapRecentDd: anchorDd,
    effectiveAnchorDd: anchorDd,
    mcapPast1dDd: pastSessionDd(tradingDates, anchorDd, 1),
    mcapPast5dDd: pastSessionDd(tradingDates, anchorDd, 5),
    mcapPast20dDd: pastSessionDd(tradingDates, anchorDd, 20),
    mcapPast50dDd: pastSessionDd(tradingDates, anchorDd, 50),
    mcapPast120dDd: pastSessionDd(tradingDates, anchorDd, 120),
    mcapPast200dDd: pastSessionDd(tradingDates, anchorDd, 200),
    sectors,
  };
}

async function buildSectorPayload(request, env, horizon) {
  const hubIndex = await loadHubIndexFromRequest(request, env);
  return buildHubSectorsFromReturnSource(hubIndex, env, request, horizon);
}

async function respondWithPayload(context, request, ch, horizon, payload, cacheTag, nocache) {
  const maxAge = hubEdgeMaxAgeLocal();
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
    if (!payload || !hasSectorHorizon(payload.sectors, horizon)) return;
    const maxAge = hubEdgeMaxAgeLocal();
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
  const horizon = normalizeSectorHorizon(url.searchParams.get('horizon') || '1d');
  const nocache = url.searchParams.get('nocache') === '1';
  const { fresh, stale, anchor } = cachePaths(horizon);

  if (!nocache) {
    const hit = await readHubCache(fresh, url.origin);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('X-Hub-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const payload = await buildSectorPayload(request, env, horizon);
    if (!payload) {
      throw new Error('hub_sectors_build_failed');
    }
    return respondWithPayload(context, request, ch, horizon, payload, 'MISS', nocache);
  } catch (e) {
    if (!nocache) {
      const staleHit = await readHubCache(stale, url.origin);
      if (staleHit) {
        context.waitUntil(revalidateInBackground(context, request, env, horizon, ch));
        const headers = new Headers(staleHit.headers);
        headers.set('X-Hub-Cache', 'STALE');
        return new Response(staleHit.body, { status: staleHit.status, headers });
      }
    }
    return new Response(
      JSON.stringify({
        error: 'hub_sectors_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        sectors: {},
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
