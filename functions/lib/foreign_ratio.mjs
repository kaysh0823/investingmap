/**
 * Foreign ownership ratio (0~100) from stock_foreign_ratio → daily OHLC bars.
 */
import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate YYYY-MM-DD
 * @returns {Promise<Array<{ trade_date: string, hold_ratio: number|null }>>}
 */
export async function fetchForeignRatioForRange(config, ticker, fromDate, toDate) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const q =
      `stock_foreign_ratio?ticker=eq.${encodeURIComponent(ticker)}` +
      `&trade_date=gte.${fromDate}&trade_date=lte.${toDate}` +
      `&select=trade_date,hold_ratio&order=trade_date.asc` +
      `&limit=${pageSize}&offset=${offset}`;
    const page = await fetchSupabaseJson(config, q);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Mutate daily bars with foreignRatio (0~100). Missing dates → null.
 * @param {Array<{ t: string }>} bars
 * @param {Array<{ trade_date: string, hold_ratio?: number|null }>} rows
 */
export function attachForeignRatioToBars(bars, rows) {
  const byDate = new Map();
  for (const row of rows || []) {
    if (!row?.trade_date) continue;
    const d = String(row.trade_date).slice(0, 10);
    byDate.set(d, numOrNull(row.hold_ratio));
  }
  for (const bar of bars || []) {
    if (!bar?.t) continue;
    const v = byDate.has(bar.t) ? byDate.get(bar.t) : null;
    bar.foreignRatio = v != null && Number.isFinite(v) ? v : null;
  }
  return bars;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {Array<{ t: string }>} bars
 */
export async function loadAndAttachForeignRatio(config, ticker, bars) {
  if (!bars.length) return bars;
  const fromDate = bars[0].t;
  const toDate = bars[bars.length - 1].t;
  try {
    const rows = await fetchForeignRatioForRange(config, ticker, fromDate, toDate);
    attachForeignRatioToBars(bars, rows);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (!/PGRST205|stock_foreign_ratio/.test(msg)) {
      console.warn('[foreign_ratio] fetch failed:', msg);
    }
    for (const bar of bars) bar.foreignRatio = null;
  }
  return bars;
}

/**
 * Min+max trade_date signature for stock_foreign_ratio depth busting.
 * @param {{ url: string, anonKey: string }} config
 * @returns {Promise<string>} e.g. fr-20211122-20260903 or fr-none
 */
export async function fetchForeignRatioDepthSignature(config) {
  const ymd = (row) =>
    row?.trade_date ? String(row.trade_date).slice(0, 10).replace(/-/g, '') : null;
  try {
    const [maxRows, minRows] = await Promise.all([
      fetchSupabaseJson(
        config,
        'stock_foreign_ratio?select=trade_date&order=trade_date.desc&limit=1',
      ),
      fetchSupabaseJson(
        config,
        'stock_foreign_ratio?select=trade_date&order=trade_date.asc&limit=1',
      ),
    ]);
    const maxYmd = ymd(Array.isArray(maxRows) && maxRows[0] ? maxRows[0] : null);
    if (!maxYmd) return 'fr-none';
    const minYmd = ymd(Array.isArray(minRows) && minRows[0] ? minRows[0] : null) || maxYmd;
    return `fr-${minYmd}-${maxYmd}`;
  } catch {
    return 'fr-none';
  }
}
