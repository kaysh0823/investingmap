/**
 * Cloudflare Pages Function: GET /api/hub_sectors
 * Cap-weighted sector returns from the same loadReturnSource + aggregateSectorReturns
 * path as /api/quotes (stock-aggregate; not the legacy mcap-daily table).
 */

import {
  loadHubIndexFromRequest,
  SECTOR_ORDER,
  uniqueHubMcapTotal,
  listHubCompanies,
  normalizeTicker,
} from '../lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { kstAnchorYmd, krxSessionInfo } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  hasSectorHorizon,
  putHubCache,
  readHubCache,
  normalizeSectorHorizon,
} from '../lib/hub_api_cache.mjs';
import { getCachedNaverQuotes } from '../lib/naver_quote_store.mjs';
import { aggregateSectorReturns } from '../lib/returns_core.mjs';
import {
  loadReturnSource,
  pastSessionDd,
  peekReturnsDataVersion,
  sectorReturnsToApiFields,
} from '../lib/hub_returns_source.mjs';
import {
  maybeNotModified,
  returnsJsonResponse,
  returnsResponseHeaders,
} from '../lib/returns_cache_headers.mjs';

const CACHE_VERSION = '/api/hub_sectors/cache/v23';

function cachePath(horizon, dataVersion) {
  return `${CACHE_VERSION}/dv/${encodeURIComponent(dataVersion || '0')}/${horizon}`;
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
    dataVersion: source.meta.dataVersion || null,
    refsEtag: source.meta.refsEtag || null,
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
  const anchor = kstAnchorYmd();
  const peek = await peekReturnsDataVersion(env, request);
  const path = cachePath(horizon, peek.dataVersion);

  if (!nocache) {
    const hit = await readHubCache(path, url.origin);
    if (hit) {
      const headers = returnsResponseHeaders({
        cors: ch,
        dataVersion: peek.dataVersion,
        horizon,
        extra: {
          'X-Hub-Cache': 'HIT',
          'X-Hub-Horizon': horizon,
          'X-Hub-Anchor': anchor,
        },
      });
      const notMod = maybeNotModified(request, headers);
      if (notMod) return notMod;
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const payload = await buildSectorPayload(request, env, horizon);
    if (!payload) {
      throw new Error('hub_sectors_build_failed');
    }
    const dataVersion = payload.dataVersion || peek.dataVersion;
    const response = returnsJsonResponse(request, payload, {
      cors: ch,
      dataVersion,
      horizon,
      extra: {
        'X-Hub-Cache': 'MISS',
        'X-Hub-Horizon': horizon,
        'X-Hub-Anchor': anchor,
      },
    });
    if (!nocache && response.status === 200 && hasSectorHorizon(payload.sectors, horizon)) {
      putHubCache(context, cachePath(horizon, dataVersion), url.origin, response);
    }
    return response;
  } catch (e) {
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
