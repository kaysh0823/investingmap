/**
 * Ticker daily OHLC series from stock_price_history.
 * Ranges map to trading-day lookbacks (aligned with hub horizons).
 * Fetch window includes indicator warmup so daily BBW%/DISP% (125 bars) and
 * weekly aggregation (125w norm + 50w MA50 ≈ 875 sessions) can fill the left edge.
 */

import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';
import { normalizeTicker } from './hub_dashboard_core.mjs';
import {
  applyPriceAdjustmentsToBars,
  fetchPriceAdjustments,
  fetchPriceAdjustmentsSignature,
} from './price_adjustments.mjs';
import {
  fetchLatestInvestorNetSignature,
  loadAndAttachInvestorOsc,
  aggregateDailyBarsToWeekly,
} from './investor_osc.mjs';

export { fetchLatestInvestorNetSignature, fetchPriceAdjustmentsSignature };

/** Display bars by range (daily chart). */
export const OHLC_RANGE_DAYS = Object.freeze({
  '3m': 50,
  '6m': 120,
  '1y': 200,
  '3y': 750,
  '5y': 1250,
});

/** Weekly display weeks (matches candle_modal DISPLAY_BARS.weekly). */
export const OHLC_WEEKLY_DISPLAY = Object.freeze({
  '3m': 13,
  '6m': 26,
  '1y': 52,
  '3y': 156,
  '5y': 260,
});

/** Trailing min/max window for BBW% / DISP% (bars or weeks depending on interval). */
export const OHLC_NORM_WINDOW = 125;
/**
 * Bars/weeks needed before NORM_WINDOW for 이격도% (MA50 seed).
 * Left-edge DISP% needs MA50 + 125-norm contiguous non-null values.
 */
export const OHLC_DISP_SEED = 50;
/** Approx trading days per calendar week (KRX). */
export const OHLC_DAYS_PER_WEEK = 5;
/** Extra daily bars for MA120 / daily 125-bar norm on short ranges. */
export const OHLC_INDICATOR_WARMUP = 240;
/** Absolute floor for OHLC history fetch (e.g. 1Y 200 + warmup 240). */
export const OHLC_FETCH_MIN = 440;

export function normalizeOhlcRange(raw) {
  const s = String(raw || '1y').trim().toLowerCase();
  if (s === '3m' || s === '3mo' || s === '50d') return '3m';
  if (s === '6m' || s === '6mo' || s === '120d') return '6m';
  if (s === '1y' || s === '12m' || s === '200d' || s === 'yoy') return '1y';
  if (s === '3y' || s === '36m' || s === '750d') return '3y';
  if (s === '5y' || s === '60m' || s === '1250d') return '5y';
  return '1y';
}

/**
 * Daily rows to fetch for a range token.
 * Long ranges must cover weekly
 * (display + 125w norm + 50w MA50 for 이격도) × ~5 sessions so the client can
 * aggregate weeks and still fill BBW%/DISP% at the left edge of the display window.
 * @param {string} rangeToken
 * @returns {number}
 */
export function ohlcFetchLimit(rangeToken) {
  const range = normalizeOhlcRange(rangeToken);
  const display = OHLC_RANGE_DAYS[range] || OHLC_RANGE_DAYS['1y'];
  const dailyNeed = display + OHLC_INDICATOR_WARMUP;
  const weeks = OHLC_WEEKLY_DISPLAY[range] || OHLC_WEEKLY_DISPLAY['1y'];
  const weeklyNeed =
    (weeks + OHLC_NORM_WINDOW + OHLC_DISP_SEED) * OHLC_DAYS_PER_WEEK;
  return Math.max(dailyNeed, weeklyNeed, OHLC_FETCH_MIN);
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
 * Lightweight last-bar fingerprint for Cache API invalidation when the same
 * trading-day window gains a new session bar or upgrades close-only → OHLCV.
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker normalized 6-char
 * @returns {Promise<string>} e.g. 20260820-c271000-v26093355 | none
 */
export async function fetchLatestHistorySignature(config, ticker) {
  const q =
    `stock_price_history?ticker=eq.${encodeURIComponent(ticker)}` +
    `&select=trade_date,close,volume&order=trade_date.desc&limit=1`;
  try {
    const rows = await fetchSupabaseJson(config, q);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row || !row.trade_date) return 'none';
    const t = String(row.trade_date).slice(0, 10).replace(/-/g, '');
    const c = numOrNull(row.close);
    const v = numOrNull(row.volume);
    const cPart = c != null ? String(Math.round(c)) : 'x';
    const vPart = v != null ? String(Math.round(v)) : 'x';
    return `${t}-c${cPart}-v${vPart}`;
  } catch {
    return 'none';
  }
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker normalized 6-char
 * @param {string} rangeToken 3m|6m|1y|3y|5y
 * @param {{ interval?: 'daily'|'weekly' }} [options]
 */
export async function fetchTickerOhlcBars(config, ticker, rangeToken, options = {}) {
  const interval = options.interval === 'weekly' ? 'weekly' : 'daily';
  const range = normalizeOhlcRange(rangeToken);
  const displayDays = OHLC_RANGE_DAYS[range] || OHLC_RANGE_DAYS['1y'];
  const limit = ohlcFetchLimit(range);
  // PostgREST projects commonly cap one response at 1,000 rows. Page long ranges
  // explicitly so 5Y+warmup is not silently truncated.
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const requested = Math.min(pageSize, limit - offset);
    const q =
      `stock_price_history?ticker=eq.${encodeURIComponent(ticker)}` +
      `&select=trade_date,open,high,low,close,volume` +
      `&order=trade_date.desc&limit=${requested}&offset=${offset}`;
    const page = await fetchSupabaseJson(config, q);
    rows.push(...page);
    if (page.length < requested) break;
  }
  const bars = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const bar = historyRowToBar(rows[i]);
    if (bar) bars.push(bar);
  }
  const adjustments = await fetchPriceAdjustments(config, ticker);
  applyPriceAdjustmentsToBars(bars, adjustments);
  if (bars.length) {
    if (interval === 'weekly') {
      const dailyFrom = bars[0].t;
      const weeklyBars = aggregateDailyBarsToWeekly(bars);
      await loadAndAttachInvestorOsc(config, ticker, weeklyBars, {
        interval: 'weekly',
        netFromDate: dailyFrom,
      });
      const displayWeeks = OHLC_WEEKLY_DISPLAY[range] || OHLC_WEEKLY_DISPLAY['1y'];
      return {
        code: ticker,
        range,
        interval: 'weekly',
        displayDays: displayWeeks,
        bars: weeklyBars,
        adjusted: adjustments.length > 0,
      };
    }
    await loadAndAttachInvestorOsc(config, ticker, bars);
  }
  return {
    code: ticker,
    range,
    interval: 'daily',
    displayDays,
    bars,
    adjusted: adjustments.length > 0,
  };
}

/**
 * Empty payload for invalid ticker / missing config.
 * @param {string|null} code
 * @param {string} [rangeToken]
 */
export function emptyTickerOhlcPayload(code, rangeToken = '1y', interval = 'daily') {
  const range = normalizeOhlcRange(rangeToken);
  const iv = interval === 'weekly' ? 'weekly' : 'daily';
  return {
    code: code || null,
    range,
    interval: iv,
    displayDays:
      iv === 'weekly'
        ? OHLC_WEEKLY_DISPLAY[range] || OHLC_WEEKLY_DISPLAY['1y']
        : OHLC_RANGE_DAYS[range] || OHLC_RANGE_DAYS['1y'],
    bars: [],
  };
}

export { normalizeTicker, getSupabaseConfig };
