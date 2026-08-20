/**
 * Hub sector sparkline: same mcap series/anchors as /api/hub_trend,
 * expressed as % return (base-100 point − 100) so spark end == card %.
 */
import { kstYmdDash } from './krx_session.mjs';
import { getSupabaseConfig } from './supabase_hub.mjs';
import { normalizeSectorHorizon, HORIZON_RET_KEY } from './hub_api_cache.mjs';
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

function basDdToDash(basDd) {
  if (!basDd || basDd.length !== 8) return basDd || '';
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function dashToBasDd(dash) {
  return String(dash || '').replace(/-/g, '');
}

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

export async function buildHubSectorTrendPayload(hubIndex, env, horizon, now = new Date()) {
  const h = normalizeSectorHorizon(horizon);
  const config = getSupabaseConfig(env);
  const asOf = now.toISOString();
  const tradeDate = kstYmdDash(now);
  if (!config) {
    return { horizon: h, asOf, tradeDate, trends: {} };
  }

  const payload = await buildHubTrendPayload(hubIndex, env, h);
  const trends = {};
  for (const entry of payload.sectors || []) {
    if (!entry?.sector) continue;
    const pctSeries = downsamplePoints(seriesToReturnPct(entry.series || []), SPARKLINE_MAX_POINTS);
    if (pctSeries.length < 2) continue;
    // Lock end to the same 2dp card value (end−100).
    const endPct = returnPctFromRebasedSeries(entry.series);
    if (endPct != null) {
      pctSeries[pctSeries.length - 1] = { ...pctSeries[pctSeries.length - 1], v: endPct };
    }
    trends[entry.sector] = pctSeries;
  }

  const resolvedTradeDate =
    h === '1d'
      ? (payload.sectors?.find((s) => s.series?.length)?.series?.[0]?.t || '').slice(0, 10) || tradeDate
      : tradeDate;

  return { horizon: h, asOf, tradeDate: resolvedTradeDate, trends };
}

export { dashToBasDd, basDdToDash, HORIZON_RET_KEY };
