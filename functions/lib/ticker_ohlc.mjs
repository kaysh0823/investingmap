/**
 * Ticker daily OHLC series from stock_price_history.
 * Ranges map to trading-day lookbacks (aligned with hub horizons).
 */

import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';
import { normalizeTicker } from './hub_dashboard_core.mjs';

/** @type {Record<string, number>} */
export const OHLC_RANGE_DAYS = Object.freeze({
  '3m': 50,
  '6m': 120,
  '1y': 200,
});

/** Bars fetched beyond display window so MA120 / BBW(120) fill the left edge. */
export const OHLC_INDICATOR_WARMUP = 240;
/** Absolute floor for OHLC history fetch (e.g. 1Y 200 + warmup 240). */
export const OHLC_FETCH_MIN = 440;

export function normalizeOhlcRange(raw) {
  const s = String(raw || '1y').trim().toLowerCase();
  if (s === '3m' || s === '3mo' || s === '50d') return '3m';
  if (s === '6m' || s === '6mo' || s === '120d') return '6m';
  if (s === '1y' || s === '12m' || s === '200d' || s === 'yoy') return '1y';
  return '1y';
}

/**
 * @param {string} rangeToken
 * @returns {number}
 */
export function ohlcFetchLimit(rangeToken) {
  const range = normalizeOhlcRange(rangeToken);
  const display = OHLC_RANGE_DAYS[range] || OHLC_RANGE_DAYS['1y'];
  return Math.max(display + OHLC_INDICATOR_WARMUP, OHLC_FETCH_MIN);
}

/**
 * @param {object} row
 * @returns {{ t: string, o: number|null, h: number|null, l: number|null, c: number, v: number|null }|null}
 */
export function historyRowToBar(row) {
  if (!row || !row.trade_date) return null;
  const c = numOrNull(row.close);
  if (c == null || c <= 0) return null;
  const t = String(row.trade_date).slice(0, 10);
  return {
    t,
    o: numOrNull(row.open),
    h: numOrNull(row.high),
    l: numOrNull(row.low),
    c,
    v: numOrNull(row.volume),
  };
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker normalized 6-char
 * @param {string} rangeToken 3m|6m|1y
 */
export async function fetchTickerOhlcBars(config, ticker, rangeToken) {
  const range = normalizeOhlcRange(rangeToken);
  const displayDays = OHLC_RANGE_DAYS[range] || OHLC_RANGE_DAYS['1y'];
  const limit = ohlcFetchLimit(range);
  const q =
    `stock_price_history?ticker=eq.${encodeURIComponent(ticker)}` +
    `&select=trade_date,open,high,low,close,volume` +
    `&order=trade_date.desc&limit=${limit}`;
  const rows = await fetchSupabaseJson(config, q);
  const bars = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const bar = historyRowToBar(rows[i]);
    if (bar) bars.push(bar);
  }
  return { code: ticker, range, displayDays, bars };
}

/**
 * Empty payload for invalid ticker / missing config.
 * @param {string|null} code
 * @param {string} [rangeToken]
 */
export function emptyTickerOhlcPayload(code, rangeToken = '1y') {
  const range = normalizeOhlcRange(rangeToken);
  return {
    code: code || null,
    range,
    displayDays: OHLC_RANGE_DAYS[range] || OHLC_RANGE_DAYS['1y'],
    bars: [],
  };
}

export { normalizeTicker, getSupabaseConfig };
