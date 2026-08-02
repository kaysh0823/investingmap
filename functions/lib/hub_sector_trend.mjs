/**
 * Hub sector sparkline series: normalized mcap-sum return from history (20D+)
 * or intraday snapshots (1D).
 */
import { SECTOR_ORDER, normalizeTicker } from './hub_dashboard_core.mjs';
import { tradingDates, pastDatesFromAnchor } from './krx_yoy.mjs';
import { kstYmd, kstYmdDash } from './krx_session.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';

export const TREND_LOOKBACK_DAYS = {
  '20d': 20,
  '50d': 50,
  '120d': 120,
  '250d': 250,
};

export const SPARKLINE_MAX_POINTS = 30;

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
  // Need enough weekdays for lookback + holiday fallback window.
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

function sectorMemberTickers(hubIndex, sectorId) {
  const block = hubIndex && hubIndex.sectors && hubIndex.sectors[sectorId];
  if (!block) return [];
  const out = [];
  const seen = new Set();
  for (const c of block.companies || []) {
    const t = normalizeTicker(c.ticker);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function sumMcapForTickers(tickers, mcapByTicker) {
  let sum = 0;
  let n = 0;
  for (const t of tickers) {
    const m = mcapByTicker.get(t);
    if (m == null || !Number.isFinite(m) || m <= 0) continue;
    sum += m;
    n += 1;
  }
  return n > 0 ? sum : null;
}

/**
 * Paginated history fetch for specific trade dates.
 * @returns {Map<string, Map<string, number>>} tradeDate → ticker → mcap
 */
export async function loadHistoryMcapByDates(config, tradeDatesDash) {
  const out = new Map();
  for (const d of tradeDatesDash) out.set(d, new Map());
  if (!config || !tradeDatesDash.length) return out;

  const pageSize = 1000;
  for (const d of tradeDatesDash) {
    let offset = 0;
    for (;;) {
      const path =
        `stock_price_history?trade_date=eq.${encodeURIComponent(d)}` +
        `&select=ticker,mcap_won&mcap_won=gt.0&limit=${pageSize}&offset=${offset}`;
      const rows = await fetchSupabaseJson(config, path);
      if (!rows.length) break;
      const map = out.get(d);
      for (const row of rows) {
        const t = normalizeTicker(row.ticker);
        const m = numOrNull(row.mcap_won);
        if (t && m != null && m > 0) map.set(t, m);
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }
  return out;
}

async function loadQuoteMcapMap(config) {
  const map = new Map();
  if (!config) return map;
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const rows = await fetchSupabaseJson(
      config,
      `stock_quotes_latest?select=ticker,mcap_won&mcap_won=gt.0&limit=${pageSize}&offset=${offset}`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const t = normalizeTicker(row.ticker);
      const m = numOrNull(row.mcap_won);
      if (t && m != null && m > 0) map.set(t, m);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return map;
}

/** First candidate date with enough history rows (skips holidays / thin days). */
function pickStartDate(startCandidates, historyByDate, minRows = 50) {
  for (const d of startCandidates || []) {
    const map = historyByDate.get(d);
    if (map && map.size >= minRows) return d;
  }
  for (const d of startCandidates || []) {
    const map = historyByDate.get(d);
    if (map && map.size > 0) return d;
  }
  return startCandidates && startCandidates[0] ? startCandidates[0] : null;
}

/**
 * Build daily normalized trend map for one horizon (not 1d).
 * @returns {Record<string, {t:string,v:number}[]>}
 */
export function buildDailyTrendsFromMaps(hubIndex, historyByDate, sampleDates, quoteMcapByTicker, startDate) {
  const trends = {};
  if (!sampleDates.length || !startDate) return trends;
  const endDate = sampleDates[sampleDates.length - 1];
  const startMap = historyByDate.get(startDate) || new Map();
  if (!startMap.size) return trends;

  // Ensure start is first point even if sampling skipped it.
  const dates = sampleDates[0] === startDate ? sampleDates.slice() : [startDate, ...sampleDates.filter((d) => d > startDate)];

  for (const sid of SECTOR_ORDER) {
    const members = sectorMemberTickers(hubIndex, sid);
    if (!members.length) continue;

    const paired = members.filter((t) => {
      const past = startMap.get(t);
      const now = quoteMcapByTicker.get(t);
      return past != null && past > 0 && now != null && now > 0;
    });
    if (!paired.length) continue;

    const rows = [];
    for (const d of dates) {
      const dayMap = historyByDate.get(d) || new Map();
      let sum;
      if (d === endDate) {
        sum = sumMcapForTickers(paired, quoteMcapByTicker);
      } else {
        sum = sumMcapForTickers(paired, dayMap);
      }
      if (sum == null) continue;
      rows.push({ t: d, mcap: sum });
    }
    const series = normalizeMcapSeries(rows);
    if (series.length >= 2) trends[sid] = series;
  }
  return trends;
}

export async function buildDailyHorizonTrends(hubIndex, config, horizon, now = new Date()) {
  const { chrono, startCandidates, endDash } = chronoDatesForHorizon(horizon, now);
  if (chrono.length < 2 && startCandidates.length < 1) return {};
  const sampleDates = sampleChronoDates(chrono.length >= 2 ? chrono : [startCandidates[0], endDash].filter(Boolean), SPARKLINE_MAX_POINTS);
  const fetchDates = [...new Set([...sampleDates, ...startCandidates])];
  const historyByDate = await loadHistoryMcapByDates(config, fetchDates);
  const startDate = pickStartDate(startCandidates, historyByDate);
  if (!startDate) return {};
  const quoteMcapByTicker = await loadQuoteMcapMap(config);
  return buildDailyTrendsFromMaps(hubIndex, historyByDate, sampleDates, quoteMcapByTicker, startDate);
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

export { dashToBasDd, basDdToDash };
