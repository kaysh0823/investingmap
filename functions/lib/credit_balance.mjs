/**
 * 신용잔고율 (credit loan balance / mcap, %) from stock_credit_balance → OHLC bars.
 * KIS publishes balances at T+2, so the newest bars carry creditRatio = null.
 */
import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate YYYY-MM-DD
 */
export async function fetchCreditBalanceForRange(config, ticker, fromDate, toDate) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const q =
      `stock_credit_balance?ticker=eq.${encodeURIComponent(ticker)}` +
      `&trade_date=gte.${fromDate}&trade_date=lte.${toDate}` +
      `&select=trade_date,credit_ratio&order=trade_date.asc` +
      `&limit=${pageSize}&offset=${offset}`;
    const page = await fetchSupabaseJson(config, q);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Mutate bars with creditRatio (%). Missing dates → null.
 * @param {Array<{ t: string }>} bars
 * @param {Array<{ trade_date: string, credit_ratio?: number|null }>} rows
 */
export function attachCreditRatioToBars(bars, rows) {
  const byDate = new Map();
  for (const row of rows || []) {
    if (!row?.trade_date) continue;
    byDate.set(String(row.trade_date).slice(0, 10), numOrNull(row.credit_ratio));
  }
  for (const bar of bars || []) {
    if (!bar?.t) continue;
    const v = byDate.has(bar.t) ? byDate.get(bar.t) : null;
    bar.creditRatio = v != null && Number.isFinite(v) ? v : null;
  }
  return bars;
}

/**
 * Weekly bars are stamped with the week's last session, which is usually still
 * unpublished (T+2) for the current week — fall back to the latest row ≤ bar.t
 * within the same week.
 * @param {Array<{ t: string }>} bars
 * @param {Array<{ trade_date: string, credit_ratio?: number|null }>} rows asc
 */
export function attachCreditRatioToWeeklyBars(bars, rows) {
  const list = (rows || [])
    .map((r) => ({ d: String(r.trade_date).slice(0, 10), v: numOrNull(r.credit_ratio) }))
    .filter((r) => r.v != null && Number.isFinite(r.v));
  let j = 0;
  let prevT = '';
  for (const bar of bars || []) {
    let hit = null;
    while (j < list.length && list[j].d <= bar.t) {
      if (list[j].d > prevT) hit = list[j].v;
      j++;
    }
    bar.creditRatio = hit;
    prevT = bar.t;
  }
  return bars;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {Array<{ t: string }>} bars
 * @param {{ weekly?: boolean, fromDate?: string }} [opts]
 */
export async function loadAndAttachCreditRatio(config, ticker, bars, opts = {}) {
  if (!bars.length) return bars;
  const fromDate = opts.fromDate || bars[0].t;
  const toDate = bars[bars.length - 1].t;
  try {
    const rows = await fetchCreditBalanceForRange(config, ticker, fromDate, toDate);
    if (opts.weekly) attachCreditRatioToWeeklyBars(bars, rows);
    else attachCreditRatioToBars(bars, rows);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (!/PGRST205|stock_credit_balance/.test(msg)) {
      console.warn('[credit_balance] fetch failed:', msg);
    }
    for (const bar of bars) bar.creditRatio = null;
  }
  return bars;
}
