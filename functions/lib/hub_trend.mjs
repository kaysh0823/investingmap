/**
 * Hub comparison trend: sector mcap indices (fixed-member intersection) plus KOSPI/KOSDAQ.
 *
 * Sector return = sum(mcap) of hub members with mcap>0 at both base and t, rebased to 100.
 */
import { SECTOR_ORDER, normalizeTicker } from './hub_dashboard_core.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';
import { krxSessionInfo, kstAnchorYmd, kstDateParts, kstYmdDash } from './krx_session.mjs';
import { tradingDates } from './krx_yoy.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';

export const TREND_MAX_POINTS = 200;
const DAILY_LOOKBACK = { '20d': 20, '50d': 50, '120d': 120, '200d': 200 };
const HORIZON_TRADING_DAYS = { '1d': 1, '20d': 20, '50d': 50, '120d': 120, '200d': 200 };
const INDEX_CODES = ['KOSPI', 'KOSDAQ'];
const INDEX_FILTER = `index_code=in.(${INDEX_CODES.join(',')})`;
const MIN_FIXED_MEMBERS = 3;
const TICKER_BATCH = 80;
/** Max trade_date values per in.(…) clause (URL + row volume). */
const DATE_BATCH = 40;
const CALENDAR_DAYS = 260;
const CARD_ANCHOR_OFFSETS = [1, 20, 50, 120, 200];

export const TREND_INDEX_CODES = INDEX_CODES;

export function downsampleTrend(points, maxPoints = TREND_MAX_POINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points ? points.slice() : [];
  const out = [];
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * (points.length - 1)) / (maxPoints - 1));
    const point = points[index];
    if (!out.length || out[out.length - 1].t !== point.t) out.push(point);
  }
  return out;
}

export function rebaseTo100(rows, valueKey = 'value', baseValue = null) {
  const clean = (rows || []).filter((row) => {
    const value = numOrNull(row?.[valueKey]);
    return row?.t && value != null && value > 0;
  });
  if (!clean.length) return [];
  const base = numOrNull(baseValue) ?? numOrNull(clean[0][valueKey]);
  if (base == null || base <= 0) return [];
  return clean.map((row, index) => ({
    t: row.t,
    v: index === 0 && baseValue == null
      ? 100
      : Math.round((Number(row[valueKey]) / base) * 1000000) / 10000,
  }));
}

/** Card % = last rebased point − 100 (2dp). Same series hub_trend charts use. */
export function returnPctFromRebasedSeries(series) {
  if (!Array.isArray(series) || !series.length) return null;
  const last = series[series.length - 1];
  const v = numOrNull(last?.v);
  if (v == null) return null;
  return Math.round((v - 100) * 100) / 100;
}

export const TREND_HORIZONS = ['1d', '20d', '50d', '120d', '200d'];

export const TREND_RET_COL = {
  '1d': 'ret_1d_pct',
  '20d': 'ret_20d_pct',
  '50d': 'ret_50d_pct',
  '120d': 'ret_120d_pct',
  '200d': 'ret_200d_pct',
};

export const TREND_RET_KEY = {
  '1d': 'return1dPct',
  '20d': 'return20dPct',
  '50d': 'return50dPct',
  '120d': 'return120dPct',
  '200d': 'return200dPct',
};

function ymdToDash(ymd) {
  if (!ymd) return '';
  const s = String(ymd);
  if (s.includes('-')) return s.slice(0, 10);
  if (s.length < 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function sectorTickers(hubIndex, sectorId) {
  const block = hubIndex?.sectors?.[sectorId];
  if (!block) return [];
  const seen = new Set();
  const out = [];
  for (const company of block.companies || []) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

function allHubTickers(hubIndex) {
  const seen = new Set();
  for (const sid of SECTOR_ORDER) {
    for (const ticker of sectorTickers(hubIndex, sid)) seen.add(ticker);
  }
  return [...seen];
}

function mcapOnDate(ticker, date, grid, liveMap, tDate) {
  if (date === tDate && liveMap?.has(ticker)) return liveMap.get(ticker);
  return grid.get(`${ticker}|${date}`) ?? null;
}

function fixedMembers(tickers, baseDate, tDate, grid, liveMap) {
  const members = [];
  for (const ticker of tickers) {
    const base = numOrNull(mcapOnDate(ticker, baseDate, grid, null, tDate));
    const end = numOrNull(mcapOnDate(ticker, tDate, grid, liveMap, tDate));
    if (base > 0 && end > 0) members.push(ticker);
  }
  return members;
}

function sumMembersMcap(members, date, grid, liveMap, tDate) {
  let sum = 0;
  for (const ticker of members) {
    const m = numOrNull(mcapOnDate(ticker, date, grid, date === tDate ? liveMap : null, tDate));
    if (m > 0) sum += m;
  }
  return sum;
}

function minMembersRequired(tickerCount) {
  return Math.min(MIN_FIXED_MEMBERS, Math.max(0, tickerCount));
}

function windowDatesAsc(dates, anchorIdx, horizonN) {
  const startIdx = anchorIdx + horizonN;
  const out = [];
  for (let i = startIdx; i >= anchorIdx; i--) out.push(dates[i]);
  return out;
}

function collectAnchorDates(calendar, horizonNs = CARD_ANCHOR_OFFSETS) {
  const set = new Set([calendar.tDate]);
  for (const n of horizonNs) {
    const idx = calendar.anchorIdx + n;
    if (idx < calendar.dates.length) set.add(calendar.dates[idx]);
  }
  return [...set];
}

function collectDatesForHorizons(calendar, horizonNs) {
  const set = new Set([calendar.tDate]);
  for (const n of horizonNs) {
    const startIdx = calendar.anchorIdx + n;
    if (startIdx >= calendar.dates.length) continue;
    set.add(calendar.dates[startIdx]);
    for (let i = calendar.anchorIdx; i <= startIdx; i++) set.add(calendar.dates[i]);
  }
  return [...set];
}

/** Oldest → newest ISO range covering all horizon windows (for gte/lte grid fetch). */
function mcapGridDateRange(calendar, horizonNs) {
  const maxN = Math.max(...horizonNs, 0);
  const startIdx = calendar.anchorIdx + maxN;
  const oldestIdx = Math.min(startIdx, calendar.dates.length - 1);
  const from = calendar.dates[oldestIdx];
  const to = calendar.tDate;
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function trendAnchorMeta(calendar, now = new Date()) {
  const { dates, anchorIdx, tDate } = calendar;
  const toYmd = (d) => (d ? String(d).replace(/-/g, '') : null);
  const pastDd = (n) => {
    const idx = anchorIdx + n;
    return idx < dates.length ? toYmd(dates[idx]) : null;
  };
  return {
    mcapRecentDd: toYmd(tDate),
    effectiveAnchorDd: kstAnchorYmd(now),
    mcapPast1dDd: pastDd(1),
    mcapPast20dDd: pastDd(20),
    mcapPast50dDd: pastDd(50),
    mcapPast120dDd: pastDd(120),
    mcapPast200dDd: pastDd(200),
  };
}

function buildSectorReturnAtHorizon(hubIndex, sectorId, calendar, grid, liveMap, horizonN) {
  const tickers = sectorTickers(hubIndex, sectorId);
  const { dates, anchorIdx, tDate } = calendar;
  const startIdx = anchorIdx + horizonN;
  if (startIdx >= dates.length) return null;

  const baseDate = dates[startIdx];
  const members = fixedMembers(tickers, baseDate, tDate, grid, liveMap);
  if (members.length < minMembersRequired(tickers.length)) return null;

  const baseSum = sumMembersMcap(members, baseDate, grid, null, tDate);
  const endSum = sumMembersMcap(members, tDate, grid, liveMap, tDate);
  if (!(baseSum > 0) || !(endSum > 0)) return null;
  return Math.round(((endSum / baseSum) - 1) * 10000) / 100;
}

function buildSectorMcapSeries(hubIndex, sectorId, calendar, grid, liveMap, horizonN) {
  const tickers = sectorTickers(hubIndex, sectorId);
  const { dates, anchorIdx, tDate } = calendar;
  const startIdx = anchorIdx + horizonN;
  if (startIdx >= dates.length) return null;

  const baseDate = dates[startIdx];
  const members = fixedMembers(tickers, baseDate, tDate, grid, liveMap);
  if (members.length < minMembersRequired(tickers.length)) return null;

  const rows = [];
  for (const date of windowDatesAsc(dates, anchorIdx, horizonN)) {
    const sum = sumMembersMcap(members, date, grid, liveMap, tDate);
    if (sum > 0) rows.push({ t: date, value: sum });
  }
  if (rows.length < 2) return null;
  return rows;
}

function sectorReturnFromRows(rows) {
  const base = numOrNull(rows[0]?.value);
  const end = numOrNull(rows[rows.length - 1]?.value);
  if (!(base > 0) || !(end > 0)) return null;
  return Math.round(((end / base) - 1) * 10000) / 100;
}

/**
 * Per-sector return % for one horizon, derived from the same payload as /api/hub_trend.
 * @returns {Promise<{ horizon: string, returns: Record<string, number|null>, seriesBySector: Record<string, object[]> }>}
 */
export async function buildSectorReturnsForHorizon(hubIndex, env, requestedHorizon) {
  const payload = await buildHubTrendPayload(hubIndex, env, requestedHorizon);
  const returns = {};
  const seriesBySector = {};
  for (const entry of payload.sectors || []) {
    if (!entry?.sector) continue;
    seriesBySector[entry.sector] = entry.series || [];
    returns[entry.sector] = returnPctFromRebasedSeries(entry.series);
  }
  return { horizon: payload.horizon, returns, seriesBySector };
}

/**
 * All horizons in one pass — endpoint dates only (hub tickers × ~6 anchor days).
 * @returns {Promise<{ bySector: Record<string, object>, anchors: object }>}
 */
export async function buildAllHorizonReturnsBySector(hubIndex, env, now = new Date()) {
  const bySector = {};
  for (const sid of SECTOR_ORDER) {
    bySector[sid] = {};
    for (const horizon of TREND_HORIZONS) bySector[sid][TREND_RET_KEY[horizon]] = null;
  }

  const config = getSupabaseConfig(env);
  if (!config) {
    return { bySector, anchors: trendAnchorMeta({ tDate: kstYmdDash(now), dates: [], anchorIdx: 0 }, now) };
  }

  const liveMap = await loadLiveQuoteMcapByTicker(config);
  const calendar = await resolveTrendCalendar(config, now, liveMap);
  const tickers = allHubTickers(hubIndex);
  const anchorDates = collectAnchorDates(calendar);
  const grid = await loadMcapGridForDates(config, tickers, anchorDates);

  for (const horizon of TREND_HORIZONS) {
    const n = HORIZON_TRADING_DAYS[horizon];
    const key = TREND_RET_KEY[horizon];
    for (const sid of SECTOR_ORDER) {
      bySector[sid][key] = buildSectorReturnAtHorizon(
        hubIndex, sid, calendar, grid, liveMap, n,
      );
    }
  }
  return { bySector, anchors: trendAnchorMeta(calendar, now) };
}

/**
 * sector_returns upsert rows: one row per sector, all horizons filled from trend sources.
 */
export async function buildSectorReturnRowsFromTrend(hubIndex, env, updatedAt = new Date().toISOString()) {
  const { bySector } = await buildAllHorizonReturnsBySector(hubIndex, env);
  return SECTOR_ORDER.filter((sid) => bySector[sid]).map((sid) => {
    const rets = bySector[sid];
    return {
      sector_id: sid,
      updated_at: updatedAt,
      ret_1d_pct: rets.return1dPct,
      ret_20d_pct: rets.return20dPct,
      ret_50d_pct: rets.return50dPct,
      ret_120d_pct: rets.return120dPct,
      ret_200d_pct: rets.return200dPct,
    };
  });
}

async function safeFetch(config, query) {
  try {
    return await fetchSupabaseJson(config, query);
  } catch (error) {
    console.warn(`hub_trend fetch failed [${query.split('?')[0]}]: ${error?.message || error}`);
    return [];
  }
}

function logIndexSeries(scope, indexRows, entries, valueKey) {
  const fetched = INDEX_CODES.map(
    (code) => `${code}=${indexRows.filter((row) => row.index_code === code && numOrNull(row[valueKey]) != null).length}`,
  ).join(' ');
  const series = entries.map((entry) => `${entry.code}=${entry.series.length}`).join(' ');
  console.log(`hub_trend ${scope} index rows: ${fetched} | series: ${series}`);
}

async function safeFetchPaged(config, query, pageSize = 1000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const separator = query.includes('?') ? '&' : '?';
    const rows = await safeFetch(config, `${query}${separator}limit=${pageSize}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function sectorName(hubIndex, sector) {
  const meta = hubIndex?.sectors?.[sector]?.meta;
  return meta?.ko || meta?.shortKo || sector;
}

function emptyPayload(hubIndex, horizon) {
  return {
    horizon,
    base: 100,
    sectors: SECTOR_ORDER.map((sector) => ({
      sector,
      name: sectorName(hubIndex, sector),
      series: [],
    })),
    indices: INDEX_CODES.map((code) => ({ code, series: [] })),
  };
}

function latestDates(rows, count) {
  return [...new Set((rows || []).map((row) => row.trade_date).filter(Boolean))]
    .sort()
    .slice(-count);
}

/** Append or overwrite today's tip on a daily {t,value} series. */
export function applyLiveDailyTip(rows, todayDash, liveValue) {
  const value = numOrNull(liveValue);
  if (!todayDash || value == null || !(value > 0)) return rows ? rows.slice() : [];
  const out = (rows || []).filter((row) => row && row.t && numOrNull(row.value) > 0);
  if (out.length && out[out.length - 1].t === todayDash) {
    out[out.length - 1] = { t: todayDash, value };
  } else {
    out.push({ t: todayDash, value });
  }
  return out;
}

async function resolveLatestTradeDateDash(config) {
  const indexRows = await safeFetch(
    config,
    'market_index_daily?select=trade_date&order=trade_date.desc&limit=1',
  );
  if (indexRows[0]?.trade_date) return String(indexRows[0].trade_date).slice(0, 10);
  const histRows = await safeFetch(
    config,
    'stock_price_history?select=trade_date&order=trade_date.desc&limit=1',
  );
  if (histRows[0]?.trade_date) return String(histRows[0].trade_date).slice(0, 10);
  return kstYmdDash();
}

async function loadDistinctTradeDates(config, limit = CALENDAR_DAYS + 30) {
  const rows = await safeFetch(
    config,
    `market_index_daily?select=trade_date&order=trade_date.desc&limit=${Math.max(limit * 2, 400)}`,
  );
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const d = String(row.trade_date).slice(0, 10);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

async function resolveTrendCalendar(config, now = new Date(), liveMap = null) {
  let dates = await loadDistinctTradeDates(config, CALENDAR_DAYS + 30);
  if (!dates.length) {
    dates = tradingDates(CALENDAR_DAYS + 30, now).map(ymdToDash);
  }

  const todayDash = kstYmdDash(now);
  // Only during regular session use today as tDate (live quotes).
  // Pre-open / closed / holiday: last history session so 1D = prior session's close return
  // (not 0% from pairing today's empty tip with the same last close as base).
  let tDate = dates[0] || todayDash;
  const quotes = liveMap ?? await loadLiveQuoteMcapByTicker(config);
  if (krxSessionInfo(now).regular && quotes.size > 0) {
    tDate = todayDash;
    if (!dates.includes(todayDash)) dates.unshift(todayDash);
  } else if (!dates.length) {
    const histLatest = await resolveLatestTradeDateDash(config);
    if (histLatest) tDate = histLatest;
  }

  let anchorIdx = dates.indexOf(tDate);
  if (anchorIdx < 0) {
    dates.unshift(tDate);
    anchorIdx = 0;
  }
  return { tDate, dates, anchorIdx, todayDash };
}

function mergeMcapRowsIntoGrid(grid, rows) {
  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    const date = String(row.trade_date).slice(0, 10);
    const mcap = numOrNull(row.mcap_won);
    if (ticker && date && mcap != null && mcap > 0) grid.set(`${ticker}|${date}`, mcap);
  }
}

/** Card path: hub tickers × anchor dates only (typically ≤6 days). */
async function loadMcapGridForDates(config, tickers, dateDashList) {
  const grid = new Map();
  const dates = [...new Set((dateDashList || []).filter(Boolean))];
  if (!tickers.length || !dates.length) return grid;

  for (let di = 0; di < dates.length; di += DATE_BATCH) {
    const dateBatch = dates.slice(di, di + DATE_BATCH);
    const dateFilter = dateBatch.map(encodeURIComponent).join(',');
    for (let ti = 0; ti < tickers.length; ti += TICKER_BATCH) {
      const batch = tickers.slice(ti, ti + TICKER_BATCH);
      const tickerFilter = batch.map(encodeURIComponent).join(',');
      const rows = await safeFetchPaged(
        config,
        `stock_price_history?ticker=in.(${tickerFilter})` +
          `&trade_date=in.(${dateFilter})` +
          '&select=ticker,trade_date,mcap_won&order=trade_date.asc',
      );
      mergeMcapRowsIntoGrid(grid, rows);
    }
  }
  return grid;
}

/** Trend series path: gte/lte range with date batches to cap subrequests. */
async function loadMcapGridForRange(config, tickers, fromDate, toDate) {
  const from = String(fromDate || '').slice(0, 10);
  const to = String(toDate || '').slice(0, 10);
  if (!tickers.length || !from || !to) return new Map();

  const windowDates = await safeFetch(
    config,
    `market_index_daily?select=trade_date&trade_date=gte.${encodeURIComponent(from)}` +
      `&trade_date=lte.${encodeURIComponent(to)}&order=trade_date.asc&limit=400`,
  );
  const dates = [...new Set(windowDates.map((row) => String(row.trade_date).slice(0, 10)))].filter(Boolean);
  if (!dates.length) {
    return loadMcapGridForDates(config, tickers, [from, to]);
  }
  return loadMcapGridForDates(config, tickers, dates);
}

async function loadLiveQuoteMcapByTicker(config) {
  const map = new Map();
  const rows = await safeFetchPaged(
    config,
    'stock_quotes_latest?select=ticker,mcap_won&mcap_won=gt.0&order=ticker.asc',
  );
  for (const row of rows) {
    const t = normalizeTicker(row.ticker);
    const m = numOrNull(row.mcap_won);
    if (!t || m == null || !(m > 0)) continue;
    map.set(t, m);
  }
  return map;
}

/** Latest market_index_intraday value per index for a trade date. */
async function loadLiveIndexTips(config, tradeDateDash) {
  const out = new Map();
  if (!tradeDateDash) return out;
  const rows = await safeFetch(
    config,
    `market_index_intraday?trade_date=eq.${encodeURIComponent(tradeDateDash)}&${INDEX_FILTER}` +
      '&select=index_code,captured_at,value&order=captured_at.desc&limit=50',
  );
  for (const row of rows) {
    const code = row.index_code;
    if (!code || out.has(code)) continue;
    const v = numOrNull(row.value);
    if (v == null || !(v > 0)) continue;
    out.set(code, v);
  }
  return out;
}

async function buildIndexDailySeries(config, horizon, now = new Date()) {
  const window = DAILY_LOOKBACK[horizon] || 20;
  const indexRows = await safeFetch(
    config,
    `market_index_daily?${INDEX_FILTER}&select=trade_date,index_code,close` +
      `&order=trade_date.desc&limit=${(window + 40) * INDEX_CODES.length}`,
  );
  let dates = latestDates(indexRows, window + 1);
  if (!dates.length) {
    const histRows = await safeFetch(
      config,
      `stock_price_history?select=trade_date&order=trade_date.desc&limit=${window + 30}`,
    );
    dates = latestDates(histRows, window + 1);
  }
  if (!dates.length) return { indexRows, dates: [], indices: [] };

  const dateSet = new Set(dates);
  const session = krxSessionInfo(now);
  const todayDash = kstYmdDash(now);
  let liveIndexTips = null;
  if (session.regular) liveIndexTips = await loadLiveIndexTips(config, todayDash);

  const indices = INDEX_CODES.map((code) => {
    let rows = indexRows
      .filter((row) => row.index_code === code && dateSet.has(row.trade_date))
      .map((row) => ({ t: row.trade_date, value: numOrNull(row.close) }))
      .sort((a, b) => a.t.localeCompare(b.t));
    if (liveIndexTips) rows = applyLiveDailyTip(rows, todayDash, liveIndexTips.get(code));
    return { code, series: downsampleTrend(rebaseTo100(rows)) };
  });

  return { indexRows, dates, indices };
}

async function buildDailyPayload(config, hubIndex, horizon, now = new Date()) {
  const payload = emptyPayload(hubIndex, horizon);
  const horizonN = DAILY_LOOKBACK[horizon] || 20;

  const [calendar, indexPart] = await Promise.all([
    resolveTrendCalendar(config, now),
    buildIndexDailySeries(config, horizon, now),
  ]);
  payload.indices = indexPart.indices;
  logIndexSeries(horizon, indexPart.indexRows, payload.indices, 'close');

  const tickers = allHubTickers(hubIndex);
  const liveMap = await loadLiveQuoteMcapByTicker(config);
  const range = mcapGridDateRange(calendar, [horizonN]);
  const grid = range
    ? await loadMcapGridForRange(config, tickers, range.from, range.to)
    : new Map();

  payload.sectors = payload.sectors.map((entry) => {
    const rows = buildSectorMcapSeries(hubIndex, entry.sector, calendar, grid, liveMap, horizonN);
    return {
      ...entry,
      series: rows ? downsampleTrend(rebaseTo100(rows)) : [],
    };
  });

  return payload;
}

async function resolveLatestIntradayDate(config) {
  const indexRows = await safeFetch(
    config,
    'market_index_intraday?select=trade_date&order=captured_at.desc&limit=1',
  );
  if (indexRows[0]?.trade_date) return indexRows[0].trade_date;
  const sectorRows = await safeFetch(
    config,
    'sector_intraday_snapshots?select=trade_date&order=ts.desc&limit=1',
  );
  return sectorRows[0]?.trade_date || null;
}

/**
 * Before the first intraday capture of a session the intraday table is empty.
 * Fall back to the last two daily closes so the 1d chart still has an index line.
 */
async function dailyCloseFallback(config, codes) {
  if (!codes.length) return new Map();
  const rows = await safeFetch(
    config,
    `market_index_daily?${INDEX_FILTER}&select=trade_date,index_code,close` +
      `&order=trade_date.desc&limit=${codes.length * 4}`,
  );
  const out = new Map();
  for (const code of codes) {
    const own = rows
      .filter((row) => row.index_code === code && numOrNull(row.close) > 0)
      .sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)));
    const last = numOrNull(own[0]?.close);
    const prev = numOrNull(own[1]?.close);
    if (last == null || prev == null || prev <= 0) continue;
    out.set(code, { date: own[0].trade_date, last, prev });
  }
  return out;
}

function sessionOpenIso(sessionDate) {
  return `${sessionDate}T09:00:00+09:00`;
}

function sessionCloseIso(sessionDate) {
  return `${sessionDate}T15:30:00+09:00`;
}

const SESSION_OPEN_MIN = 9 * 60;
const SESSION_CLOSE_MIN = 15 * 60 + 30;

/** Tip timestamp stuck on sessionDate (never spills into the next calendar day). */
function sessionTipIso(sessionDate, now = new Date()) {
  if (!krxSessionInfo(now).regular) return sessionCloseIso(sessionDate);
  const p = kstDateParts(now);
  const minutes = Math.max(SESSION_OPEN_MIN, Math.min(SESSION_CLOSE_MIN, p.hour * 60 + p.minute));
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${sessionDate}T${hh}:${mm}:00+09:00`;
}

/**
 * Scale intraday snapshot shape onto fixed-member base→live mcap sums.
 * Base VALUE is prior-session close; TIMESTAMP is session open (tradeDate 09:00)
 * so the 1D chart x-axis stays on the trading day.
 */
function scaleIntradayToFixedMembers(snapRows, baseSum, liveSum, sessionDate, now = new Date()) {
  const openT = sessionOpenIso(sessionDate);
  if (!snapRows.length) {
    return [
      { t: openT, value: baseSum },
      { t: sessionTipIso(sessionDate, now), value: liveSum },
    ];
  }
  const firstSnap = numOrNull(snapRows[0].value);
  const lastSnap = numOrNull(snapRows[snapRows.length - 1].value);
  const denom = lastSnap != null && firstSnap != null ? lastSnap - firstSnap : 0;
  const rows = [{ t: openT, value: baseSum }];
  for (let i = 0; i < snapRows.length; i++) {
    const snap = snapRows[i];
    const snapVal = numOrNull(snap.value);
    let value = baseSum;
    if (snapVal != null && denom !== 0 && firstSnap != null) {
      value = baseSum + ((snapVal - firstSnap) / denom) * (liveSum - baseSum);
    } else if (snapRows.length > 0) {
      value = baseSum + ((i + 1) / snapRows.length) * (liveSum - baseSum);
    }
    rows.push({ t: snap.ts, value });
  }
  if (rows.length > 1) rows[rows.length - 1] = { ...rows[rows.length - 1], value: liveSum };
  return rows;
}

async function buildIntradayPayload(config, hubIndex, now = new Date()) {
  const payload = emptyPayload(hubIndex, '1d');
  const tradeDate = await resolveLatestIntradayDate(config);
  if (!tradeDate) return payload;

  const tradeDateDash = String(tradeDate).slice(0, 10);
  payload.tradeDate = tradeDateDash;
  const liveMap = await loadLiveQuoteMcapByTicker(config);
  const [sectorRows, indexRows, calendar] = await Promise.all([
    safeFetchPaged(
      config,
      `sector_intraday_snapshots?trade_date=eq.${encodeURIComponent(tradeDate)}` +
        '&select=sector_id,ts,mcap_sum&order=ts.asc',
    ),
    safeFetch(
      config,
      `market_index_intraday?trade_date=eq.${encodeURIComponent(tradeDate)}&${INDEX_FILTER}` +
        '&select=index_code,captured_at,value,prev_close&order=captured_at.asc&limit=1000',
    ),
    resolveTrendCalendar(config, now, liveMap),
  ]);

  const prevDate = calendar.dates[calendar.anchorIdx + 1]
    ?? calendar.dates[calendar.dates.indexOf(tradeDateDash) + 1];
  const tDate = calendar.tDate || tradeDateDash;

  const tickers = allHubTickers(hubIndex);
  const grid = prevDate
    ? await loadMcapGridForDates(config, tickers, [prevDate])
    : new Map();

  payload.sectors = payload.sectors.map((entry) => {
    if (!prevDate) return entry;
    const members = fixedMembers(
      sectorTickers(hubIndex, entry.sector),
      prevDate,
      tDate,
      grid,
      liveMap,
    );
    if (members.length < minMembersRequired(sectorTickers(hubIndex, entry.sector).length)) return entry;

    const baseSum = sumMembersMcap(members, prevDate, grid, null, tDate);
    const liveSum = sumMembersMcap(members, tDate, grid, liveMap, tDate);
    if (!(baseSum > 0) || !(liveSum > 0)) return entry;

    const snaps = sectorRows
      .filter((row) => row.sector_id === entry.sector)
      .map((row) => ({ ts: row.ts, value: numOrNull(row.mcap_sum) }))
      .filter((row) => row.ts && row.value > 0);

    const rows = scaleIntradayToFixedMembers(snaps, baseSum, liveSum, tradeDateDash, now);
    return { ...entry, series: downsampleTrend(rebaseTo100(rows, 'value', baseSum)) };
  });

  const missingCodes = INDEX_CODES.filter(
    (code) => !indexRows.some((row) => row.index_code === code && numOrNull(row.value) != null),
  );
  const fallback = await dailyCloseFallback(config, missingCodes);

  payload.indices = payload.indices.map((entry) => {
    const own = indexRows.filter((row) => row.index_code === entry.code);
    const prevClose = own.map((row) => numOrNull(row.prev_close)).find((value) => value > 0);
    if (own.length && prevClose != null) {
      const rows = [
        { t: sessionOpenIso(tradeDateDash), value: prevClose },
        ...own.map((row) => ({ t: row.captured_at, value: numOrNull(row.value) })),
      ];
      return { ...entry, series: downsampleTrend(rebaseTo100(rows, 'value', prevClose)) };
    }
    const daily = fallback.get(entry.code);
    if (!daily) return entry;
    const rows = [
      { t: sessionOpenIso(tradeDateDash), value: daily.prev },
      { t: sessionCloseIso(tradeDateDash), value: daily.last },
    ];
    return { ...entry, series: rebaseTo100(rows, 'value', daily.prev) };
  });
  logIndexSeries('1d', indexRows, payload.indices, 'value');
  return payload;
}

export async function buildHubTrendPayload(hubIndex, env, requestedHorizon, now = new Date()) {
  const horizon = normalizeSectorHorizon(requestedHorizon);
  const config = getSupabaseConfig(env);
  if (!config) return emptyPayload(hubIndex, horizon);
  return horizon === '1d'
    ? buildIntradayPayload(config, hubIndex, now)
    : buildDailyPayload(config, hubIndex, horizon, now);
}
