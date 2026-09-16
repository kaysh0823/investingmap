/**
 * Cloudflare Pages Function: GET /api/sector_perf_calendar?sector={sid}&year={YYYY}
 * Sector member YTD lines (prior year-end = 100) + equal-weight avg + KOSPI/KOSDAQ.
 */

import { loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';
import {
  corsHeaders,
  putHubCache,
  readHubCache,
} from '../lib/hub_api_cache.mjs';
import {
  PERF_CALENDAR_CACHE_VERSION,
  buildSectorPerfCalendarFromEnv,
  currentKstYear,
  normalizePerfCalendarSector,
  normalizePerfCalendarYear,
} from '../lib/sector_perf_calendar.mjs';
import { peekReturnsDataVersion } from '../lib/hub_returns_source.mjs';
import {
  maybeNotModified,
  returnsJsonResponse,
  returnsResponseHeaders,
} from '../lib/returns_cache_headers.mjs';

const CACHE_BASE = `/api/sector_perf_calendar/cache/${PERF_CALENDAR_CACHE_VERSION}`;

function cachePath(sector, year, dataVersion) {
  const cur = currentKstYear();
  // Completed years are immutable; skip dataVersion in key.
  if (year < cur) return `${CACHE_BASE}/${sector}/${year}`;
  return `${CACHE_BASE}/${sector}/${year}/dv/${encodeURIComponent(dataVersion || '0')}`;
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
  const sector = normalizePerfCalendarSector(url.searchParams.get('sector'));
  const year = normalizePerfCalendarYear(url.searchParams.get('year'));
  const nocache = url.searchParams.get('nocache') === '1';
  const session = krxSessionInfo();

  if (!sector) {
    return new Response(
      JSON.stringify({
        error: 'invalid_sector',
        message: 'sector query required (hub sector id)',
      }),
      {
        status: 400,
        headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  }
  if (year == null) {
    return new Response(
      JSON.stringify({
        error: 'invalid_year',
        message: `year must be ${currentKstYear() - 4}..${currentKstYear()}`,
      }),
      {
        status: 400,
        headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  }

  const peek = await peekReturnsDataVersion(env, request);
  const path = cachePath(sector, year, peek.dataVersion);
  const isCurrentYear = year >= currentKstYear();

  if (!nocache) {
    const hit = await readHubCache(path, url.origin);
    if (hit) {
      if (isCurrentYear) {
        const headers = returnsResponseHeaders({
          cors: ch,
          dataVersion: peek.dataVersion,
          horizon: `${sector}-${year}`,
          extra: {
            'X-Hub-Cache': 'HIT',
            'X-Perf-Calendar-Version': PERF_CALENDAR_CACHE_VERSION,
          },
        });
        const notMod = maybeNotModified(request, headers);
        if (notMod) return notMod;
        return new Response(hit.body, { status: hit.status, headers });
      }
      const headers = new Headers(hit.headers);
      for (const [k, v] of Object.entries(ch)) headers.set(k, v);
      headers.set('X-Hub-Cache', 'HIT');
      headers.set('X-Perf-Calendar-Version', PERF_CALENDAR_CACHE_VERSION);
      headers.set('X-Data-Version', peek.dataVersion || '');
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    if (!hubIndex?.sectors?.[sector]) {
      return new Response(
        JSON.stringify({ error: 'sector_not_found', sector }),
        {
          status: 404,
          headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        },
      );
    }

    const payload = await buildSectorPerfCalendarFromEnv(hubIndex, env, sector, year, request);
    const dataVersion = payload.dataVersion || peek.dataVersion;

    if (isCurrentYear) {
      const response = returnsJsonResponse(request, payload, {
        cors: ch,
        dataVersion,
        horizon: `${sector}-${year}`,
        extra: {
          'X-Hub-Cache': 'MISS',
          'X-Perf-Calendar-Version': PERF_CALENDAR_CACHE_VERSION,
          'X-Perf-Calendar-Sector': sector,
          'X-Perf-Calendar-Year': String(year),
          'X-Hub-Session': session.regular ? 'regular' : 'closed',
        },
      });
      if (!nocache && response.status === 200 && (payload.members?.length || payload.sectorAvg?.length)) {
        putHubCache(context, cachePath(sector, year, dataVersion), url.origin, response);
      }
      return response;
    }

    // Completed years: longer CDN TTL (immutable history).
    const body = JSON.stringify(payload);
    const response = new Response(body, {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=604800, must-revalidate',
        'X-Hub-Cache': 'MISS',
        'X-Perf-Calendar-Version': PERF_CALENDAR_CACHE_VERSION,
        'X-Perf-Calendar-Sector': sector,
        'X-Perf-Calendar-Year': String(year),
        'X-Data-Version': dataVersion || '',
      },
    });
    if (!nocache && (payload.members?.length || payload.sectorAvg?.length)) {
      putHubCache(context, path, url.origin, response);
    }
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'sector_perf_calendar_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        sector,
        year,
        asOf: new Date().toISOString(),
        regularSession: session.regular,
        members: [],
        sectorAvg: [],
        indices: { KOSPI: [], KOSDAQ: [] },
        tradingDays: 0,
      }),
      {
        status: 502,
        headers: {
          ...ch,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
