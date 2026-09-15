/**
 * Hub sector sparkline: 1d from sector_intraday_returns (stock-aggregate) with
 * live tip / synthesized single-point fallback so tip == /api/hub_sectors 1D.
 * Longer horizons still use hub_trend mcap series (locked end to card %).
 */
import { kstYmdDash, krxSessionInfo } from './krx_session.mjs';
import { fetchSupabaseJson, getSupabaseConfig } from './supabase_hub.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';
import {
  SECTOR_ORDER,
  listHubCompanies,
  normalizeTicker,
} from './hub_dashboard_core.mjs';
import { aggregateSectorReturns } from './returns_core.mjs';
import { loadReturnSource } from './hub_returns_source.mjs';
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

function basDdToDash(basDd) {
  const s = String(basDd || '').replace(/-/g, '');
  if (s.length !== 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function tipTimestamp(sessionOpen, anchorDash, now = new Date()) {
  if (sessionOpen) return now.toISOString();
  // Official tip locked at regular close 15:30 KST.
  return `${anchorDash}T15:30:00+09:00`;
}

/**
 * Cap-weighted 1D by sector from the shared return source (same as hub_sectors).
 * @returns {{ bySector: Map<string, number>, meta: object, k: number }}
 */
async function computeLiveSector1d(hubIndex, env, request, now = new Date()) {
  const tickers = listHubCompanies(hubIndex)
    .map((c) => normalizeTicker(c.ticker))
    .filter(Boolean);
  const source = await loadReturnSource({ env, request, tickers });
  const k = source.meta?.k ?? 0;
  const bySector = new Map();
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors?.[sid];
    if (!block) continue;
    const members = [];
    for (const c of block.companies || []) {
      const t = normalizeTicker(c.ticker);
      const src = t ? source.byTicker[t] : null;
      if (!src || src.shares == null || !(src.shares > 0)) continue;
      members.push({
        numerator: src.numerator,
        closes: src.closes,
        k,
        shares: src.shares,
      });
    }
    const agg = aggregateSectorReturns(members);
    if (agg.chg1dPct != null) bySector.set(sid, agg.chg1dPct);
  }
  const session = krxSessionInfo(now);
  const sessionOpen = source.meta?.sessionOpen ?? !!(session.regular || session.aftermarket);
  return {
    bySector,
    meta: {
      asOf: source.meta?.asOf || now.toISOString(),
      sessionOpen,
      numeratorMode: source.meta?.numeratorMode ?? (sessionOpen ? 'live' : 'official'),
      anchorDd: source.meta?.anchorDd || null,
      refsRecentDd: source.meta?.refsRecentDd || null,
      k,
      stale: !!source.meta?.stale,
    },
  };
}

async function buildIntradayReturnsPayload(hubIndex, env, request, now = new Date()) {
  const live = await computeLiveSector1d(hubIndex, env, request, now);
  const meta = live.meta;
  const sessionOpen = !!meta.sessionOpen;
  const anchorDash = basDdToDash(meta.anchorDd) || kstYmdDash(now);
  const tipTs = tipTimestamp(sessionOpen, anchorDash, now);
  const config = getSupabaseConfig(env);

  let rows = [];
  if (config && anchorDash) {
    try {
      rows = await fetchSupabaseJson(
        config,
        `sector_intraday_returns?trade_date=eq.${encodeURIComponent(anchorDash)}`
          + `&select=sector_id,ts,ret_1d_pct,anchor_dd,session_kind`
          + `&order=ts.asc`,
      );
    } catch {
      rows = [];
    }
  }

  const bySector = new Map();
  for (const row of rows || []) {
    const sid = row.sector_id;
    if (!sid) continue;
    if (!bySector.has(sid)) bySector.set(sid, []);
    const v = Number(row.ret_1d_pct);
    if (!Number.isFinite(v)) continue;
    if (!sessionOpen && row.session_kind === 'aftermarket') continue;
    bySector.get(sid).push({
      t: row.ts,
      v: Math.round(v * 100) / 100,
      session_kind: row.session_kind || 'regular',
    });
  }

  const hasAnyRow = [...bySector.values()].some((pts) => pts.length > 0);
  const trends = {};

  if (!hasAnyRow) {
    // No table rows yet — synthesize one point = current hub_sectors 1D.
    for (const sid of SECTOR_ORDER) {
      const v = live.bySector.get(sid);
      if (v == null) continue;
      trends[sid] = [{
        t: tipTs,
        v: Math.round(v * 100) / 100,
        synthesized: true,
      }];
    }
    return {
      horizon: '1d',
      trends,
      tradeDate: anchorDash,
      regularSession: !!krxSessionInfo(now).regular,
      synthesized: true,
      source: 'live_aggregate',
      ...meta,
      asOf: meta.asOf,
    };
  }

  for (const sid of SECTOR_ORDER) {
    let pts = bySector.get(sid) || [];
    if (!pts.length) {
      const v = live.bySector.get(sid);
      if (v == null) continue;
      trends[sid] = [{
        t: tipTs,
        v: Math.round(v * 100) / 100,
        synthesized: true,
      }];
      continue;
    }
    // Seed 0% at open when missing.
    if (!pts[0].t?.includes('T09:00')) {
      pts = [{ t: `${anchorDash}T09:00:00+09:00`, v: 0, session_kind: 'regular' }, ...pts];
    }
    // While session open, append current aggregate when newer than last table ts.
    if (sessionOpen) {
      const liveV = live.bySector.get(sid);
      if (liveV != null) {
        const lastTs = pts[pts.length - 1]?.t;
        const lastMs = lastTs ? Date.parse(lastTs) : 0;
        const tipMs = Date.parse(tipTs);
        if (!Number.isFinite(lastMs) || tipMs > lastMs) {
          pts = [...pts, {
            t: tipTs,
            v: Math.round(liveV * 100) / 100,
            live: true,
          }];
        } else {
          // Same/older clock — still lock tip value to live aggregate.
          pts = [...pts.slice(0, -1), {
            ...pts[pts.length - 1],
            v: Math.round(liveV * 100) / 100,
            live: true,
          }];
        }
      }
    }
    trends[sid] = downsamplePoints(pts, SPARKLINE_MAX_POINTS);
  }

  return {
    horizon: '1d',
    trends,
    tradeDate: anchorDash,
    regularSession: !!krxSessionInfo(now).regular,
    synthesized: false,
    source: 'sector_intraday_returns',
    ...meta,
    asOf: meta.asOf,
  };
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
    return buildIntradayReturnsPayload(hubIndex, env, request, now);
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
