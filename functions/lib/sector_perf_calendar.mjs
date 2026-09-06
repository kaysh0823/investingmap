/**
 * Sector performance calendar: year lines rebased to prior year-end = 100.
 * Trading days are downsampled (~weekly) before history fetches so CF
 * subrequests stay within limits (full-year daily × 85 members was ~44+ pages).
 */

import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';
import {
  SECTOR_ORDER,
  normalizeTicker,
} from './hub_dashboard_core.mjs';
import {
  applyPriceAdjustmentsToBars,
} from './price_adjustments.mjs';
import { downsampleDates } from './hub_trend.mjs';
import { kstDateParts } from './krx_session.mjs';

export const PERF_CALENDAR_CACHE_VERSION = 'v2';
export const PERF_CALENDAR_YEAR_SPAN = 5; // current .. current-4
export const PERF_CALENDAR_TICKER_BATCH = 40;
/** In-year chart points (weekly-ish); +1 prior-year base day fetched separately. */
export const PERF_CALENDAR_MAX_POINTS = 70;
/** Max trade_date values per PostgREST in.(…) — must exceed MAX_POINTS. */
export const PERF_CALENDAR_DATE_BATCH = 80;
export const PERF_CALENDAR_PAGE_SIZE = 1000;

const INDEX_CODES = ['KOSPI', 'KOSDAQ'];

/**
 * @param {Date} [now]
 * @returns {number} KST calendar year
 */
export function currentKstYear(now = new Date()) {
  return kstDateParts(now).year;
}

/**
 * @param {string|number|null|undefined} raw
 * @param {Date} [now]
 * @returns {number|null}
 */
export function normalizePerfCalendarYear(raw, now = new Date()) {
  const cur = currentKstYear(now);
  const min = cur - (PERF_CALENDAR_YEAR_SPAN - 1);
  const n = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10);
  if (!Number.isFinite(n)) return cur;
  if (n < min || n > cur) return null;
  return n;
}

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizePerfCalendarSector(raw) {
  const sid = String(raw || '').trim().toLowerCase();
  if (!sid) return null;
  if (SECTOR_ORDER.includes(sid)) return sid;
  return null;
}

/**
 * @param {object} hubIndex
 * @param {string} sectorId
 * @returns {{ ticker: string, name: string, nameEn: string, market: string }[]}
 */
export function listSectorMembers(hubIndex, sectorId) {
  const block = hubIndex?.sectors?.[sectorId];
  const companies = Array.isArray(block?.companies) ? block.companies : [];
  const out = [];
  const seen = new Set();
  for (const c of companies) {
    const ticker = normalizeTicker(c?.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push({
      ticker,
      name: c.name || ticker,
      nameEn: c.nameEn || c.name || ticker,
      market: c.market || '',
    });
  }
  return out;
}

function dateRangeForYear(year) {
  const prev = year - 1;
  return {
    from: `${prev}-12-01`,
    to: `${year}-12-31`,
    yearStart: `${year}-01-01`,
    yearEnd: `${year}-12-31`,
  };
}

async function fetchPaged(config, query, pageSize = PERF_CALENDAR_PAGE_SIZE) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = query.includes('?') ? '&' : '?';
    const page = await fetchSupabaseJson(
      config,
      `${query}${sep}limit=${pageSize}&offset=${offset}`,
    );
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/** Liquid KRX proxy for session calendar (index history may start late). */
const CALENDAR_REF_TICKER = '005930';

/**
 * Trading sessions in [from, to] via a liquid stock calendar (1 page typical).
 * market_index_daily may not cover older years, so it is not used here.
 * @returns {Promise<string[]>} YYYY-MM-DD ascending
 */
export async function fetchTradingDatesInRange(config, from, to) {
  const rows = await fetchPaged(
    config,
    `stock_price_history?ticker=eq.${CALENDAR_REF_TICKER}` +
      `&trade_date=gte.${encodeURIComponent(from)}` +
      `&trade_date=lte.${encodeURIComponent(to)}` +
      `&select=trade_date&order=trade_date.asc`,
  );
  const dates = [];
  const seen = new Set();
  for (const row of rows) {
    const d = String(row.trade_date || '').slice(0, 10);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    dates.push(d);
  }
  return dates;
}

/**
 * Prior-year-end base day + downsampled in-year sessions (first/last preserved).
 * @param {string[]} allDatesAsc
 * @param {string} yearStart
 * @param {string} yearEnd
 * @param {number} [maxPoints]
 * @returns {string[]}
 */
export function buildPerfCalendarSampleDates(
  allDatesAsc,
  yearStart,
  yearEnd,
  maxPoints = PERF_CALENDAR_MAX_POINTS,
) {
  const prior = (allDatesAsc || []).filter((d) => d < yearStart);
  const inYear = (allDatesAsc || []).filter((d) => d >= yearStart && d <= yearEnd);
  const chart = downsampleDates(inYear, maxPoints);
  const out = [];
  if (prior.length) out.push(prior[prior.length - 1]);
  for (const d of chart) {
    if (!out.length || out[out.length - 1] !== d) out.push(d);
  }
  return out;
}

/**
 * Close history for tickers on explicit sample dates only.
 * @returns {Map<string, {t:string,c:number}[]>}
 */
export async function fetchMemberCloseSeriesForDates(config, tickers, datesDash) {
  const byTicker = new Map();
  const dates = [...new Set((datesDash || []).filter(Boolean))];
  if (!tickers.length || !dates.length) return byTicker;

  for (let di = 0; di < dates.length; di += PERF_CALENDAR_DATE_BATCH) {
    const dateBatch = dates.slice(di, di + PERF_CALENDAR_DATE_BATCH);
    const dateFilter = dateBatch.map(encodeURIComponent).join(',');
    for (let ti = 0; ti < tickers.length; ti += PERF_CALENDAR_TICKER_BATCH) {
      const batch = tickers.slice(ti, ti + PERF_CALENDAR_TICKER_BATCH);
      const tickerFilter = batch.map(encodeURIComponent).join(',');
      const rows = await fetchPaged(
        config,
        `stock_price_history?ticker=in.(${tickerFilter})` +
          `&trade_date=in.(${dateFilter})` +
          `&select=ticker,trade_date,close` +
          `&order=trade_date.asc,ticker.asc`,
      );
      for (const row of rows) {
        const ticker = normalizeTicker(row.ticker);
        const t = String(row.trade_date || '').slice(0, 10);
        const c = numOrNull(row.close);
        if (!ticker || !t || c == null || c <= 0) continue;
        if (!byTicker.has(ticker)) byTicker.set(ticker, []);
        byTicker.get(ticker).push({ t, c });
      }
    }
  }

  // Ensure each ticker's closes are sorted (batches can interleave by date batch).
  for (const [ticker, rows] of byTicker) {
    rows.sort((a, b) => a.t.localeCompare(b.t));
    byTicker.set(ticker, rows);
  }
  return byTicker;
}

/**
 * @returns {Map<string, object[]>}
 */
export async function fetchAdjustmentsByTicker(config, tickers) {
  const byTicker = new Map();
  if (!tickers.length) return byTicker;

  for (let i = 0; i < tickers.length; i += PERF_CALENDAR_TICKER_BATCH) {
    const batch = tickers.slice(i, i + PERF_CALENDAR_TICKER_BATCH);
    const tickerFilter = batch.map(encodeURIComponent).join(',');
    const rows = await fetchPaged(
      config,
      `price_adjustments?ticker=in.(${tickerFilter})` +
        `&select=ticker,effective_date,ratio,type,source,note` +
        `&order=ticker.asc,effective_date.asc`,
    );
    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker);
      if (!ticker) continue;
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker).push(row);
    }
  }
  return byTicker;
}

function roundIndex(v) {
  return Math.round(Number(v) * 10000) / 10000;
}

/**
 * Apply adjustments then rebase to prior-year-end = 100 (fallback: first session in year).
 * @param {{t:string,c:number}[]} closes
 * @param {object[]} adjustments
 * @param {string} yearStart YYYY-MM-DD
 * @param {string} yearEnd YYYY-MM-DD
 * @returns {{t:string,v:number}[]}
 */
export function rebaseMemberPoints(closes, adjustments, yearStart, yearEnd) {
  if (!closes?.length) return [];
  const bars = closes.map((r) => ({ t: r.t, c: r.c, o: null, h: null, l: null, v: null }));
  applyPriceAdjustmentsToBars(bars, adjustments || []);

  let baseBar = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].t < yearStart && bars[i].c != null && bars[i].c > 0) {
      baseBar = bars[i];
      break;
    }
  }
  if (!baseBar) {
    for (const bar of bars) {
      if (bar.t >= yearStart && bar.t <= yearEnd && bar.c != null && bar.c > 0) {
        baseBar = bar;
        break;
      }
    }
  }
  if (!baseBar || !(baseBar.c > 0)) return [];

  const base = baseBar.c;
  const points = [];
  for (const bar of bars) {
    if (bar.t < yearStart || bar.t > yearEnd) continue;
    if (bar.c == null || !(bar.c > 0)) continue;
    points.push({ t: bar.t, v: roundIndex((bar.c / base) * 100) });
  }
  return points;
}

/**
 * Equal-weight average of member points by date.
 * @param {{points:{t:string,v:number}[]}[]} members
 * @returns {{t:string,v:number}[]}
 */
export function buildSectorAvgPoints(members) {
  const sums = new Map(); // t -> {sum, n}
  for (const m of members || []) {
    for (const p of m.points || []) {
      if (!p?.t || p.v == null || !Number.isFinite(p.v)) continue;
      const prev = sums.get(p.t) || { sum: 0, n: 0 };
      prev.sum += p.v;
      prev.n += 1;
      sums.set(p.t, prev);
    }
  }
  return [...sums.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, { sum, n }]) => ({ t, v: roundIndex(sum / n) }));
}

/**
 * Index closes on the same sample dates, rebased like members.
 * @returns {Promise<{KOSPI:{t:string,v:number}[],KOSDAQ:{t:string,v:number}[]}>}
 */
export async function fetchIndexRebasedForDates(config, datesDash, yearStart, yearEnd) {
  const empty = { KOSPI: [], KOSDAQ: [] };
  const dates = [...new Set((datesDash || []).filter(Boolean))];
  if (!dates.length) return empty;

  const byCode = new Map(INDEX_CODES.map((c) => [c, []]));
  for (let di = 0; di < dates.length; di += PERF_CALENDAR_DATE_BATCH) {
    const dateBatch = dates.slice(di, di + PERF_CALENDAR_DATE_BATCH);
    const dateFilter = dateBatch.map(encodeURIComponent).join(',');
    const rows = await fetchPaged(
      config,
      `market_index_daily?index_code=in.(${INDEX_CODES.join(',')})` +
        `&trade_date=in.(${dateFilter})` +
        `&select=trade_date,index_code,close` +
        `&order=trade_date.asc,index_code.asc`,
    );
    for (const row of rows) {
      const code = row.index_code;
      if (!byCode.has(code)) continue;
      const t = String(row.trade_date || '').slice(0, 10);
      const c = numOrNull(row.close);
      if (!t || c == null || c <= 0) continue;
      byCode.get(code).push({ t, c });
    }
  }

  const out = { ...empty };
  for (const code of INDEX_CODES) {
    const rows = byCode.get(code) || [];
    rows.sort((a, b) => a.t.localeCompare(b.t));
    out[code] = rebaseMemberPoints(rows, [], yearStart, yearEnd);
  }
  return out;
}

/**
 * @param {object} hubIndex
 * @param {{ url: string, anonKey: string }} config
 * @param {string} sectorId
 * @param {number} year
 */
export async function buildSectorPerfCalendarPayload(hubIndex, config, sectorId, year) {
  const membersMeta = listSectorMembers(hubIndex, sectorId);
  const { from, to, yearStart, yearEnd } = dateRangeForYear(year);
  const tickers = membersMeta.map((m) => m.ticker);

  const allDates = await fetchTradingDatesInRange(config, from, to);
  const sampleDates = buildPerfCalendarSampleDates(allDates, yearStart, yearEnd);

  const [closeByTicker, adjByTicker, indices] = await Promise.all([
    fetchMemberCloseSeriesForDates(config, tickers, sampleDates),
    fetchAdjustmentsByTicker(config, tickers),
    fetchIndexRebasedForDates(config, sampleDates, yearStart, yearEnd),
  ]);

  const members = [];
  for (const meta of membersMeta) {
    const closes = closeByTicker.get(meta.ticker) || [];
    const points = rebaseMemberPoints(
      closes,
      adjByTicker.get(meta.ticker) || [],
      yearStart,
      yearEnd,
    );
    if (!points.length) continue;
    members.push({
      ticker: meta.ticker,
      name: meta.name,
      nameEn: meta.nameEn,
      market: meta.market,
      points,
    });
  }

  const sectorAvg = buildSectorAvgPoints(members);
  const tradingDays = sectorAvg.length
    ? sectorAvg.length
    : new Set(members.flatMap((m) => m.points.map((p) => p.t))).size;

  return {
    sector: sectorId,
    year,
    members,
    sectorAvg,
    indices,
    tradingDays,
    sampleDates: sampleDates.filter((d) => d >= yearStart && d <= yearEnd),
    asOf: new Date().toISOString(),
  };
}

/**
 * @param {object} hubIndex
 * @param {object} env
 * @param {string} sectorId
 * @param {number} year
 */
export async function buildSectorPerfCalendarFromEnv(hubIndex, env, sectorId, year) {
  const config = getSupabaseConfig(env);
  if (!config) {
    return {
      sector: sectorId,
      year,
      members: [],
      sectorAvg: [],
      indices: { KOSPI: [], KOSDAQ: [] },
      tradingDays: 0,
      sampleDates: [],
      asOf: new Date().toISOString(),
      error: 'supabase_unconfigured',
    };
  }
  return buildSectorPerfCalendarPayload(hubIndex, config, sectorId, year);
}
