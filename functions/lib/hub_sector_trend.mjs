/**
 * Hub sector sparkline: 1d from shared buildIntraday1dSeries (stock-aggregate);
 * longer horizons convert hub_trend base-100 series → %.
 */
import { kstYmdDash } from './krx_session.mjs';
import { getSupabaseConfig } from './supabase_hub.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';
import {
  buildIntraday1dSeries,
} from './sector_trend_core.mjs';
import {
  buildHubTrendPayload,
  downsampleTrend,
  returnPctFromRebasedSeries,
} from './hub_trend.mjs';

export const TREND_LOOKBACK_DAYS = {
  '20d': 20,
  '50d': 50,
  '120d': 120,
  '200d': 200,
};

export const SPARKLINE_MAX_POINTS = 30;

/** Downsample [{t,v}] keeping endpoints (legacy helper / tests). */
export function downsamplePoints(points, maxN = SPARKLINE_MAX_POINTS) {
  return downsampleTrend(points, maxN);
}

/** Convert hub_trend base-100 series → % return series for sparkline UI. */
export function seriesToReturnPct(series) {
  if (!Array.isArray(series) || !series.length) return [];
  return series.map((point) => ({
    t: point.t,
    v: Math.round((Number(point.v) - 100) * 100) / 100,
    ...(point.synthesized ? { synthesized: true } : {}),
    ...(point.live ? { live: true } : {}),
  }));
}

/**
 * Normalize mcap series to % return vs first positive sum (unit tests / legacy).
 * @param {{ t: string, mcap: number }[]} rows
 */
export function normalizeMcapSeries(rows) {
  const clean = (rows || []).filter((r) => r && r.t && Number.isFinite(r.mcap) && r.mcap > 0);
  if (!clean.length) return [];
  const base = clean[0].mcap;
  if (!(base > 0)) return [];
  return clean.map((r) => ({
    t: r.t,
    v: Math.round(((r.mcap / base) - 1) * 10000) / 100,
  }));
}

export async function buildHubSectorTrendPayload(
  hubIndex,
  env,
  horizon,
  now = new Date(),
  request = null,
) {
  const h = normalizeSectorHorizon(horizon);
  const asOf = now.toISOString();
  const tradeDate = kstYmdDash(now);

  if (h === '1d') {
    const one = await buildIntraday1dSeries({ hubIndex, env, request, now });
    return {
      horizon: '1d',
      trends: one.trends,
      tradeDate: one.tradeDate,
      regularSession: one.regularSession,
      synthesized: one.synthesized,
      source: one.source,
      ...one.meta,
    };
  }

  const config = getSupabaseConfig(env);
  if (!config) {
    return { horizon: h, asOf, tradeDate, trends: {} };
  }

  // Daily sparklines: same aggregate series as /api/hub_trend, expressed as %.
  const payload = await buildHubTrendPayload(hubIndex, env, h, now, request);
  const trends = {};
  for (const entry of payload.sectors || []) {
    if (!entry?.sector) continue;
    const pctSeries = downsamplePoints(seriesToReturnPct(entry.series || []), SPARKLINE_MAX_POINTS);
    if (pctSeries.length < 1) continue;
    const endPct = returnPctFromRebasedSeries(entry.series);
    if (endPct != null && pctSeries.length) {
      pctSeries[pctSeries.length - 1] = {
        ...pctSeries[pctSeries.length - 1],
        v: endPct,
      };
    }
    trends[entry.sector] = pctSeries;
  }

  return {
    horizon: h,
    asOf: payload.asOf || asOf,
    tradeDate: payload.tradeDate || tradeDate,
    regularSession: payload.regularSession,
    sessionOpen: payload.sessionOpen,
    numeratorMode: payload.numeratorMode,
    anchorDd: payload.anchorDd,
    refsRecentDd: payload.refsRecentDd,
    k: payload.k,
    dataVersion: payload.dataVersion,
    refsEtag: payload.refsEtag,
    stale: payload.stale,
    synthesized: !!payload.synthesized,
    trends,
    source: payload.source || 'stock_aggregate',
  };
}
