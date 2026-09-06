/**
 * Hub daily rank snapshots + Top20 rank/rankDelta enrichment.
 * Metrics: mcap | rs | position | turnover | turnover5d | gain1d | gain5d
 *
 * API `rank` / `rankDelta` are **list positions** (1..HUB_TOP_N), not full-universe
 * hub_rank_daily ranks. Full-universe rows stay in Supabase for internal use.
 * rankDelta = prevListRank - todayListRank (positive = rose). Outside Top N yesterday → 'NEW'.
 */

import { calcQuotePosition } from '../../lib/quote_position.mjs';
import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';
import { HUB_TOP_N, listHubCompanies, normalizeTicker } from './hub_dashboard_core.mjs';

export const HUB_RANK_METRICS = Object.freeze([
  'mcap',
  'rs',
  'position',
  'turnover',
  'turnover5d',
  'gain1d',
  'gain5d',
]);

/**
 * @param {string|null|undefined} isoOrDash
 * @returns {string|null} YYYY-MM-DD in KST when given ISO, else dash date as-is
 */
export function toTradeDateDash(isoOrDash) {
  if (!isoOrDash || typeof isoOrDash !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDash)) return isoOrDash;
  const d = new Date(isoOrDash);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

/**
 * Rank entries by value descending (null/non-finite excluded). Dense 1..N.
 * @param {{ ticker: string, value: number|null }[]} entries
 * @returns {{ ticker: string, rank: number, value: number }[]}
 */
export function rankByValueDesc(entries) {
  const sorted = (entries || [])
    .filter((e) => e && e.ticker && e.value != null && Number.isFinite(e.value))
    .slice()
    .sort((a, b) => b.value - a.value);
  return sorted.map((e, i) => ({
    ticker: normalizeTicker(e.ticker) || e.ticker,
    rank: i + 1,
    value: e.value,
  }));
}

/**
 * Build full hub_rank_daily rows for metrics from stock_quotes_latest-shaped rows.
 * @param {object} hubIndex
 * @param {object[]} quoteRows supabase row shape (ticker, mcap_won, rs, …)
 * @param {string} tradeDateDash YYYY-MM-DD
 * @param {{ turnover5dByTicker?: Map<string, number> }} [opts]
 */
export function buildHubRankDailyRows(hubIndex, quoteRows, tradeDateDash, opts = {}) {
  const companies = listHubCompanies(hubIndex);
  const hubSet = new Set(
    companies.map((c) => normalizeTicker(c.ticker)).filter(Boolean),
  );
  const byTicker = new Map();
  for (const row of quoteRows || []) {
    const key = normalizeTicker(row.ticker);
    if (!key || !hubSet.has(key)) continue;
    byTicker.set(key, row);
  }

  const mcapEntries = [];
  const rsEntries = [];
  const positionEntries = [];
  const turnoverEntries = [];
  const turnover5dEntries = [];
  const gain1dEntries = [];
  const gain5dEntries = [];

  for (const key of hubSet) {
    const row = byTicker.get(key);
    if (!row) continue;
    const mcap = numOrNull(row.mcap_won);
    if (mcap != null && mcap > 0) mcapEntries.push({ ticker: key, value: mcap });

    const rs = numOrNull(row.rs);
    if (rs != null) rsEntries.push({ ticker: key, value: rs });

    const last = numOrNull(row.last);
    const high = numOrNull(row.high_52w);
    const low = numOrNull(row.low_52w);
    const pos = calcQuotePosition(last, high, low);
    if (pos != null) positionEntries.push({ ticker: key, value: pos });

    const turnover = numOrNull(row.turnover_won);
    if (turnover != null && turnover > 0) turnoverEntries.push({ ticker: key, value: turnover });

    const chg1d = numOrNull(row.chg_1d_pct);
    if (chg1d != null) gain1dEntries.push({ ticker: key, value: chg1d });

    const ret5d = numOrNull(row.ret_5d_pct);
    if (ret5d != null) gain5dEntries.push({ ticker: key, value: ret5d });
  }

  const turnover5dByTicker = opts.turnover5dByTicker;
  if (turnover5dByTicker && typeof turnover5dByTicker.forEach === 'function') {
    turnover5dByTicker.forEach((value, ticker) => {
      const key = normalizeTicker(ticker);
      const v = numOrNull(value);
      if (key && hubSet.has(key) && v != null && v > 0) {
        turnover5dEntries.push({ ticker: key, value: v });
      }
    });
  }

  const packs = [
    ['mcap', mcapEntries],
    ['rs', rsEntries],
    ['position', positionEntries],
    ['turnover', turnoverEntries],
    ['turnover5d', turnover5dEntries],
    ['gain1d', gain1dEntries],
    ['gain5d', gain5dEntries],
  ];

  const out = [];
  for (const [metric, entries] of packs) {
    for (const r of rankByValueDesc(entries)) {
      out.push({
        metric,
        ticker: r.ticker,
        trade_date: tradeDateDash,
        rank: r.rank,
        value: r.value,
      });
    }
  }
  return out;
}

/**
 * @param {number|null|undefined} todayRank
 * @param {number|null|undefined} prevRank
 * @returns {number|'NEW'}
 */
export function computeRankDelta(todayRank, prevRank) {
  if (todayRank == null || !Number.isFinite(todayRank)) return 'NEW';
  if (prevRank == null || !Number.isFinite(prevRank)) return 'NEW';
  return prevRank - todayRank;
}

/**
 * Attach list-position rank (1-based) + rankDelta vs previous **list** ranks.
 * @param {object[]} rows TopN-like rows with ticker (already sorted)
 * @param {Map<string, number>|null|undefined} prevListRankByTicker ticker → yesterday list pos (1..N)
 */
export function attachListRanks(rows, prevListRankByTicker) {
  const prev = prevListRankByTicker || new Map();
  return (rows || []).map((row, i) => {
    const rank = i + 1;
    const key = normalizeTicker(row.ticker) || row.ticker;
    const prevRank = prev.has(key) ? prev.get(key) : null;
    return {
      ...row,
      rank,
      rankDelta: computeRankDelta(rank, prevRank),
    };
  });
}

/**
 * Keep only ranks that were inside the displayed Top N list (1..HUB_TOP_N).
 * Full-universe ranks above N mean "not on yesterday's list" → excluded → NEW.
 * @param {Map<string, number>|null|undefined} rankByTicker
 * @param {number} [topN]
 * @returns {Map<string, number>}
 */
export function toListRankMap(rankByTicker, topN = HUB_TOP_N) {
  const out = new Map();
  if (!rankByTicker) return out;
  for (const [key, rank] of rankByTicker) {
    if (rank != null && Number.isFinite(rank) && rank >= 1 && rank <= topN) {
      out.set(key, rank);
    }
  }
  return out;
}

/**
 * @deprecated Prefer attachListRanks + toListRankMap. Kept for callers that still
 * want full-universe today ranks (not used for hub TopN API responses).
 */
export function attachStoredOrListRanks(rows, todayRankByTicker, prevRankByTicker) {
  const today = todayRankByTicker || new Map();
  const prev = prevRankByTicker || new Map();
  return (rows || []).map((row, i) => {
    const key = normalizeTicker(row.ticker) || row.ticker;
    const rank = today.has(key) ? today.get(key) : i + 1;
    const prevRank = prev.has(key) ? prev.get(key) : null;
    return {
      ...row,
      rank,
      rankDelta: computeRankDelta(rank, prevRank),
    };
  });
}

/**
 * Latest trade_date in hub_rank_daily (optionally for one metric).
 * @param {{ url: string, anonKey: string }} config
 * @param {string|null} [metric]
 * @returns {Promise<string|null>}
 */
export async function fetchLatestRankTradeDate(config, metric = null) {
  if (!config) return null;
  let q = `hub_rank_daily?select=trade_date&order=trade_date.desc&limit=1`;
  if (metric) q += `&metric=eq.${encodeURIComponent(metric)}`;
  const rows = await fetchSupabaseJson(config, q);
  if (!rows.length || !rows[0].trade_date) return null;
  return String(rows[0].trade_date).slice(0, 10);
}

/**
 * Latest trade_date in hub_rank_daily strictly before `beforeDash`.
 * @param {{ url: string, anonKey: string }} config
 * @param {string} beforeDash
 * @param {string|null} [metric]
 * @returns {Promise<string|null>}
 */
export async function fetchPrevRankTradeDate(config, beforeDash, metric = null) {
  if (!config || !beforeDash) return null;
  let q =
    `hub_rank_daily?select=trade_date` +
    `&trade_date=lt.${encodeURIComponent(beforeDash)}` +
    `&order=trade_date.desc&limit=1`;
  if (metric) q += `&metric=eq.${encodeURIComponent(metric)}`;
  const rows = await fetchSupabaseJson(config, q);
  if (!rows.length || !rows[0].trade_date) return null;
  return String(rows[0].trade_date).slice(0, 10);
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} metric
 * @param {string} tradeDateDash
 * @param {string[]} tickers
 * @returns {Promise<Map<string, number>>}
 */
export async function fetchRanksForTickers(config, metric, tradeDateDash, tickers) {
  const map = new Map();
  const codes = [...new Set((tickers || []).map((t) => normalizeTicker(t)).filter(Boolean))];
  if (!config || !metric || !tradeDateDash || !codes.length) return map;

  const chunk = 80;
  for (let i = 0; i < codes.length; i += chunk) {
    const part = codes.slice(i, i + chunk);
    const q =
      `hub_rank_daily?select=ticker,rank` +
      `&metric=eq.${encodeURIComponent(metric)}` +
      `&trade_date=eq.${encodeURIComponent(tradeDateDash)}` +
      `&ticker=in.(${part.join(',')})`;
    const rows = await fetchSupabaseJson(config, q);
    for (const row of rows) {
      const key = normalizeTicker(row.ticker);
      const rank = numOrNull(row.rank);
      if (key && rank != null) map.set(key, rank);
    }
  }
  return map;
}

/**
 * Enrich TopN rows with list-position `rank` (1..N) + list-based `rankDelta`.
 * Does **not** overwrite rank with full-universe hub_rank_daily ranks.
 *
 * Prev list rank = hub_rank_daily.rank on the prior trade_date when that rank
 * was ≤ HUB_TOP_N (same as yesterday's TopN list index). Outside TopN → 'NEW'.
 * Anchor: max(trade_date) in hub_rank_daily (not calendar/asOf).
 *
 * @param {{ url: string, anonKey: string }|null} config
 * @param {string} metric
 * @param {object[]} rows
 * @param {string|null} [_asOfOrTradeDate] ignored for anchor (kept for call-site compat)
 */
export async function enrichTopRowsWithRankDelta(config, metric, rows, _asOfOrTradeDate) {
  if (!rows || !rows.length) return rows || [];

  // Always expose continuous list ranks 1..N in the API response.
  let out = attachListRanks(rows, null);
  if (!config) return out;

  const tickers = rows.map((r) => r.ticker);
  try {
    const latestDash = await fetchLatestRankTradeDate(config, metric);
    if (!latestDash) {
      console.warn(`[hub_rank] ${metric}: no hub_rank_daily rows; using list ranks + NEW`);
      return out;
    }
    const prevDate = await fetchPrevRankTradeDate(config, latestDash, metric);
    let prevListMap = new Map();
    if (prevDate) {
      const prevUniverse = await fetchRanksForTickers(config, metric, prevDate, tickers);
      prevListMap = toListRankMap(prevUniverse, HUB_TOP_N);
    }
    out = attachListRanks(rows, prevListMap);
  } catch (err) {
    console.warn(
      `[hub_rank] ${metric}: enrich failed → list ranks + NEW:`,
      err && err.message ? err.message : err,
    );
    out = attachListRanks(rows, null);
  }
  return out;
}
