/**
 * Hub sector sparkline series: normalized mcap-sum return from sector_mcap_daily
 * (20D+) or sector_intraday_snapshots (1D).
 */
import { SECTOR_ORDER } from './hub_dashboard_core.mjs';
import { tradingDates, pastDatesFromAnchor } from './krx_yoy.mjs';
import { kstYmd, kstYmdDash } from './krx_session.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';
import { normalizeSectorHorizon, HORIZON_RET_KEY } from './hub_api_cache.mjs';

export const TREND_LOOKBACK_DAYS = {
  '20d': 20,
  '50d': 50,
  '120d': 120,
  '200d': 200,
};

export const SPARKLINE_MAX_POINTS = 30;

const HORIZON_RET_COL = {
  '20d': 'ret_20d_pct',
  '50d': 'ret_50d_pct',
  '120d': 'ret_120d_pct',
  '200d': 'ret_200d_pct',
};

function basDdToDash(basDd) {
  if (!basDd || basDd.length !== 8) return basDd || '';
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function dashToBasDd(dash) {
  return String(dash || '').replace(/-/g, '');
}

/** Keep first/last; evenly sample up to maxN dates (deduped, chronological). */
export function sampleChronoDates(chronoDates, maxN = SPARKLINE_MAX_POINTS) {
  const list = Array.isArray(chronoDates) ? chronoDates.filter(Boolean) : [];
  if (list.length <= maxN) return list.slice();
  const out = [];
  for (let i = 0; i < maxN; i++) {
    const idx = Math.round((i * (list.length - 1)) / (maxN - 1));
    out.push(list[idx]);
  }
  const seen = new Set();
  const deduped = [];
  for (const d of out) {
    if (seen.has(d)) continue;
    seen.add(d);
    deduped.push(d);
  }
  if (deduped[0] !== list[0]) deduped.unshift(list[0]);
  if (deduped[deduped.length - 1] !== list[list.length - 1]) deduped.push(list[list.length - 1]);
  return deduped;
}

/** Downsample [{t,v}] keeping endpoints. */
export function downsamplePoints(points, maxN = SPARKLINE_MAX_POINTS) {
  if (!points || points.length <= maxN) return points ? points.slice() : [];
  const out = [];
  for (let i = 0; i < maxN; i++) {
    const idx = Math.round((i * (points.length - 1)) / (maxN - 1));
    out.push(points[idx]);
  }
  const seen = new Set();
  const deduped = [];
  for (const p of out) {
    const key = `${p.t}|${p.v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  return deduped;
}

/**
 * Normalize mcap series to % return vs first positive sum.
 * @param {{ t: string, mcap: number }[]} rows
 * @returns {{ t: string, v: number }[]}
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

/** Newest-first trading weekday list → chrono dates from lookback start through anchor. */
export function chronoDatesForHorizon(horizon, now = new Date()) {
  const h = normalizeSectorHorizon(horizon);
  const days = TREND_LOOKBACK_DAYS[h];
  if (!days) return { chrono: [], startCandidates: [], endDash: '' };
  const dates = tradingDates(Math.max(days + 60, 120), now);
  if (!dates.length) return { chrono: [], startCandidates: [], endDash: '' };
  const today = kstYmd(now);
  const anchorDd = dates[0] === today ? today : dates[0];
  const pastList = pastDatesFromAnchor(anchorDd, dates, days, 12);
  if (!pastList.length) return { chrono: [], startCandidates: [], endDash: '' };
  const startDd = pastList[0];
  const anchorIdx = dates.indexOf(anchorDd);
  const startIdx = dates.indexOf(startDd);
  if (anchorIdx < 0 || startIdx < 0 || startIdx < anchorIdx) {
    return {
      chrono: [],
      startCandidates: pastList.map(basDdToDash),
      endDash: basDdToDash(anchorDd),
    };
  }
  return {
    chrono: dates.slice(anchorIdx, startIdx + 1).map(basDdToDash).reverse(),
    startCandidates: pastList.map(basDdToDash),
    endDash: basDdToDash(anchorDd),
  };
}

/**
 * One range query: sector_mcap_daily for [fromDash, toDash].
 * @returns {Map<string, Map<string, number>>} sectorId → tradeDate → mcap_sum
 */
export async function loadSectorMcapDailyRange(config, fromDash, toDash) {
  const bySector = new Map();
  for (const sid of SECTOR_ORDER) bySector.set(sid, new Map());
  if (!config || !fromDash || !toDash) return bySector;

  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const path =
      `sector_mcap_daily?trade_date=gte.${encodeURIComponent(fromDash)}` +
      `&trade_date=lte.${encodeURIComponent(toDash)}` +
      `&select=sector_id,trade_date,mcap_sum&order=trade_date.asc` +
      `&limit=${pageSize}&offset=${offset}`;
    let rows;
    try {
      rows = await fetchSupabaseJson(config, path);
    } catch {
      return bySector;
    }
    if (!rows.length) break;
    for (const row of rows) {
      const sid = row.sector_id;
      const d = row.trade_date;
      const m = numOrNull(row.mcap_sum);
      if (!sid || !d || m == null || m <= 0) continue;
      if (!bySector.has(sid)) bySector.set(sid, new Map());
      bySector.get(sid).set(d, m);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return bySector;
}

async function loadSectorReturnMap(config) {
  const map = new Map();
  if (!config) return map;
  try {
    const rows = await fetchSupabaseJson(config, 'sector_returns?select=*');
    for (const row of rows || []) {
      if (row && row.sector_id) map.set(row.sector_id, row);
    }
  } catch {
    /* optional alignment */
  }
  return map;
}

/** First candidate date that has a sector mcap row for most sectors. */
function pickStartDate(startCandidates, bySector, minSectors = 8) {
  for (const d of startCandidates || []) {
    let n = 0;
    for (const sid of SECTOR_ORDER) {
      const m = bySector.get(sid)?.get(d);
      if (m != null && m > 0) n += 1;
    }
    if (n >= minSectors) return d;
  }
  for (const d of startCandidates || []) {
    for (const sid of SECTOR_ORDER) {
      const m = bySector.get(sid)?.get(d);
      if (m != null && m > 0) return d;
    }
  }
  return startCandidates && startCandidates[0] ? startCandidates[0] : null;
}

/**
 * Build normalized sparkline series from pre-aggregated sector_mcap_daily.
 * Last point is aligned to sector_returns so the card % and sparkline end match
 * (pair-exclude returns vs full-sum daily path can otherwise drift).
 */
export function buildDailyTrendsFromSectorDaily(bySector, sampleDates, startDate, sectorReturns, horizon) {
  const trends = {};
  if (!sampleDates.length || !startDate) return trends;
  const retCol = HORIZON_RET_COL[normalizeSectorHorizon(horizon)];
  const dates = sampleDates[0] === startDate
    ? sampleDates.slice()
    : [startDate, ...sampleDates.filter((d) => d > startDate)];

  for (const sid of SECTOR_ORDER) {
    const dayMap = bySector.get(sid);
    if (!dayMap || !dayMap.size) continue;
    const rows = [];
    for (const d of dates) {
      const m = dayMap.get(d);
      if (m == null || !(m > 0)) continue;
      rows.push({ t: d, mcap: m });
    }
    let series = normalizeMcapSeries(rows);
    if (series.length < 2) continue;
    series = downsamplePoints(series, SPARKLINE_MAX_POINTS);
    if (series.length < 2) continue;

    // Lock endpoint to the same value the hub card shows.
    if (retCol && sectorReturns) {
      const card = numOrNull(sectorReturns.get(sid)?.[retCol]);
      if (card != null) {
        series[series.length - 1] = { ...series[series.length - 1], v: card };
      }
    }
    trends[sid] = series;
  }
  return trends;
}

export async function buildDailyHorizonTrends(_hubIndex, config, horizon, now = new Date()) {
  const { chrono, startCandidates, endDash } = chronoDatesForHorizon(horizon, now);
  if (chrono.length < 2 && startCandidates.length < 1) return {};

  const sampleDates = sampleChronoDates(
    chrono.length >= 2 ? chrono : [startCandidates[0], endDash].filter(Boolean),
    SPARKLINE_MAX_POINTS,
  );
  const fromDash = [...startCandidates, ...sampleDates].filter(Boolean).sort()[0];
  const toDash = sampleDates[sampleDates.length - 1] || endDash;
  if (!fromDash || !toDash) return {};

  const bySector = await loadSectorMcapDailyRange(config, fromDash, toDash);
  const startDate = pickStartDate(startCandidates, bySector);
  if (!startDate) return {};

  const sectorReturns = await loadSectorReturnMap(config);
  return buildDailyTrendsFromSectorDaily(bySector, sampleDates, startDate, sectorReturns, horizon);
}

/**
 * Intraday 1D trends from sector_intraday_snapshots for a trade date.
 */
export async function buildIntradayTrends(config, tradeDateDash) {
  const trends = {};
  if (!config || !tradeDateDash) return trends;
  const pageSize = 1000;
  let offset = 0;
  const bySector = new Map();
  for (;;) {
    const path =
      `sector_intraday_snapshots?trade_date=eq.${encodeURIComponent(tradeDateDash)}` +
      `&select=sector_id,ts,mcap_sum&order=ts.asc&limit=${pageSize}&offset=${offset}`;
    let rows;
    try {
      rows = await fetchSupabaseJson(config, path);
    } catch {
      return trends;
    }
    if (!rows.length) break;
    for (const row of rows) {
      const sid = row.sector_id;
      const mcap = numOrNull(row.mcap_sum);
      const ts = row.ts;
      if (!sid || mcap == null || mcap <= 0 || !ts) continue;
      if (!bySector.has(sid)) bySector.set(sid, []);
      bySector.get(sid).push({ t: ts, mcap });
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  for (const [sid, rows] of bySector) {
    const series = downsamplePoints(normalizeMcapSeries(rows), SPARKLINE_MAX_POINTS);
    if (series.length >= 2) trends[sid] = series;
  }
  return trends;
}

/** Prefer today (KST); on weekends/holidays fall back to latest weekday for 1D snapshots. */
export function resolveIntradayTradeDate(now = new Date()) {
  const today = kstYmdDash(now);
  const dates = tradingDates(5, now);
  if (!dates.length) return today;
  const todayDd = dashToBasDd(today);
  if (dates[0] === todayDd) return today;
  return basDdToDash(dates[0]) || today;
}

export async function buildHubSectorTrendPayload(hubIndex, env, horizon, now = new Date()) {
  const h = normalizeSectorHorizon(horizon);
  const config = getSupabaseConfig(env);
  const asOf = now.toISOString();
  const tradeDate = h === '1d' ? resolveIntradayTradeDate(now) : kstYmdDash(now);
  if (!config) {
    return { horizon: h, asOf, tradeDate, trends: {} };
  }
  let trends = {};
  if (h === '1d') {
    trends = await buildIntradayTrends(config, tradeDate);
  } else {
    trends = await buildDailyHorizonTrends(hubIndex, config, h, now);
  }
  return { horizon: h, asOf, tradeDate, trends };
}

export { dashToBasDd, basDdToDash, HORIZON_RET_KEY };
