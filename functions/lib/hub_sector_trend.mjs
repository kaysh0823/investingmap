/**
 * Hub sector sparkline: 1d from sector_intraday_returns (stock-aggregate);
 * longer horizons still use hub_trend mcap series (locked end to card %).
 */
import { kstYmdDash, krxSessionInfo } from './krx_session.mjs';
import { fetchSupabaseJson, getSupabaseConfig } from './supabase_hub.mjs';
import { normalizeSectorHorizon, HORIZON_RET_KEY } from './hub_api_cache.mjs';
import { SECTOR_ORDER } from './hub_dashboard_core.mjs';
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

async function buildIntradayReturnsPayload(env, tradeDateDash, now = new Date()) {
  const config = getSupabaseConfig(env);
  const asOf = now.toISOString();
  const session = krxSessionInfo(now);
  if (!config) {
    return {
      horizon: '1d',
      asOf,
      tradeDate: tradeDateDash,
      regularSession: !!session.regular,
      sessionOpen: !!(session.regular || session.aftermarket),
      trends: {},
      source: 'sector_intraday_returns',
    };
  }

  let rows = [];
  try {
    rows = await fetchSupabaseJson(
      config,
      `sector_intraday_returns?trade_date=eq.${encodeURIComponent(tradeDateDash)}`
        + `&select=sector_id,ts,ret_1d_pct,anchor_dd,session_kind`
        + `&order=ts.asc`,
    );
  } catch {
    rows = [];
  }

  const bySector = new Map();
  for (const row of rows || []) {
    const sid = row.sector_id;
    if (!sid) continue;
    if (!bySector.has(sid)) bySector.set(sid, []);
    const v = Number(row.ret_1d_pct);
    if (!Number.isFinite(v)) continue;
    // After market close: keep regular-session tip only for the default series.
    if (!session.regular && !session.aftermarket && row.session_kind === 'aftermarket') {
      continue;
    }
    bySector.get(sid).push({
      t: row.ts,
      v: Math.round(v * 100) / 100,
      session_kind: row.session_kind || 'regular',
    });
  }

  const trends = {};
  for (const sid of SECTOR_ORDER) {
    const pts = bySector.get(sid) || [];
    if (pts.length < 1) continue;
    // Seed 0% at open when missing.
    const seeded = pts[0].t?.includes('T09:00')
      ? pts
      : [{ t: `${tradeDateDash}T09:00:00+09:00`, v: 0, session_kind: 'regular' }, ...pts];
    trends[sid] = downsamplePoints(seeded, SPARKLINE_MAX_POINTS);
  }

  return {
    horizon: '1d',
    asOf,
    tradeDate: tradeDateDash,
    regularSession: !!session.regular,
    sessionOpen: !!(session.regular || session.aftermarket),
    trends,
    source: 'sector_intraday_returns',
  };
}

export async function buildHubSectorTrendPayload(hubIndex, env, horizon, now = new Date()) {
  const h = normalizeSectorHorizon(horizon);
  const asOf = now.toISOString();
  const tradeDate = kstYmdDash(now);

  if (h === '1d') {
    return buildIntradayReturnsPayload(env, tradeDate, now);
  }

  const config = getSupabaseConfig(env);
  if (!config) {
    return { horizon: h, asOf, tradeDate, trends: {} };
  }

  const payload = await buildHubTrendPayload(hubIndex, env, h);
  const trends = {};
  for (const entry of payload.sectors || []) {
    if (!entry?.sector) continue;
    const pctSeries = downsamplePoints(seriesToReturnPct(entry.series || []), SPARKLINE_MAX_POINTS);
    if (pctSeries.length < 2) continue;
    const endPct = returnPctFromRebasedSeries(entry.series);
    if (endPct != null) {
      pctSeries[pctSeries.length - 1] = { ...pctSeries[pctSeries.length - 1], v: endPct };
    }
    trends[entry.sector] = pctSeries;
  }

  return {
    horizon: h,
    asOf: payload.asOf || asOf,
    tradeDate: payload.tradeDate || tradeDate,
    regularSession: payload.regularSession,
    trends,
    source: payload.source || 'hub_trend',
  };
}
