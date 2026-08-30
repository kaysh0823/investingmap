/**
 * Investor net-buy OSC (inst = trust+PE+pension, frgn = foreign).
 * Algorithm mirrors indicators_core.stochastic_osc on cumulative net series.
 */

import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';

export const INVESTOR_INST_CODES = Object.freeze(['3000', '3100', '6000']);
export const INVESTOR_FRGN_CODE = '9000';
export const INVESTOR_OSC_CODES = Object.freeze([
  ...INVESTOR_INST_CODES,
  INVESTOR_FRGN_CODE,
]);
export const INVESTOR_CUM_WINDOWS = Object.freeze([5, 10, 20]);

const INST_CODE_SET = new Set(INVESTOR_INST_CODES);
const DEFAULT_CUM_WINDOW = 10;
const RANGE_WINDOW = 20;
const EMA_SPAN = 2;

/**
 * Rolling sum; minPeriods defaults to 1.
 * @param {number[]} values
 * @param {number} window
 * @param {number} [minPeriods=1]
 * @returns {(number|null)[]}
 */
export function rollingSum(values, window, minPeriods = 1) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - window + 1);
    let sum = 0;
    let count = 0;
    for (let j = from; j <= i; j++) {
      sum += values[j] ?? 0;
      count += 1;
    }
    if (count >= minPeriods) out[i] = sum;
  }
  return out;
}

/**
 * Rolling min/max with minPeriods (default = full window).
 * @param {number[]} values
 * @param {number} window
 * @param {number} [minPeriods]
 * @returns {{ lo: (number|null)[], hi: (number|null)[] }}
 */
export function rollingMinMax(values, window, minPeriods = window) {
  const lo = new Array(values.length).fill(null);
  const hi = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const from = i - window + 1;
    if (from < 0) continue;
    let minV = Infinity;
    let maxV = -Infinity;
    let n = 0;
    for (let j = from; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) continue;
      n += 1;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (n >= minPeriods) {
      lo[i] = minV;
      hi[i] = maxV;
    }
  }
  return { lo, hi };
}

/**
 * pandas ewm(span, adjust=False): null input keeps previous EMA.
 * @param {(number|null)[]} values
 * @param {number} span
 * @returns {(number|null)[]}
 */
export function ewmSpan(values, span) {
  const alpha = 2 / (span + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out[i] = prev;
      continue;
    }
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function clipOsc(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, v));
}

/**
 * Stochastic-style OSC on a daily net series aligned to trading bars.
 * Full cumWindow cumulative net, then RANGE_WINDOW (20) min/max.
 * @param {number[]} netByBar — one value per bar (missing days = 0)
 * @param {number} [cumWindow=10] cumulative net window (5, 10, or 20)
 * @returns {(number|null)[]}
 */
export function computeInvestorOscSeries(netByBar, cumWindow = DEFAULT_CUM_WINDOW) {
  if (!netByBar?.length) return [];
  const w = Number(cumWindow) || DEFAULT_CUM_WINDOW;
  const cum = rollingSum(netByBar, w, w);
  const { lo, hi } = rollingMinMax(cum, RANGE_WINDOW, RANGE_WINDOW);
  const raw = new Array(netByBar.length).fill(null);
  for (let i = 0; i < netByBar.length; i++) {
    if (lo[i] == null || hi[i] == null || cum[i] == null) continue;
    const range = hi[i] - lo[i];
    if (range === 0) continue;
    raw[i] = (100 * (cum[i] - lo[i])) / range;
  }
  return ewmSpan(raw, EMA_SPAN).map(clipOsc);
}

/**
 * @param {Array<{trade_date:string,invst_tp_cd:string,net_val:number}>} rows
 * @returns {Map<string, { inst: number, frgn: number }>}
 */
export function groupInvestorNetByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const d = String(row.trade_date || '').slice(0, 10);
    if (!d) continue;
    let bucket = byDate.get(d);
    if (!bucket) {
      bucket = { inst: 0, frgn: 0 };
      byDate.set(d, bucket);
    }
    const code = String(row.invst_tp_cd || '');
    const val = numOrNull(row.net_val) ?? 0;
    if (INST_CODE_SET.has(code)) bucket.inst += val;
    else if (code === INVESTOR_FRGN_CODE) bucket.frgn += val;
  }
  return byDate;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate YYYY-MM-DD
 */
export async function fetchInvestorNetForRange(config, ticker, fromDate, toDate) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const q =
      `stock_investor_net?ticker=eq.${encodeURIComponent(ticker)}` +
      `&invst_tp_cd=in.(${INVESTOR_OSC_CODES.join(',')})` +
      `&trade_date=gte.${fromDate}&trade_date=lte.${toDate}` +
      `&select=trade_date,invst_tp_cd,net_val&order=trade_date.asc` +
      `&limit=${pageSize}&offset=${offset}`;
    const page = await fetchSupabaseJson(config, q);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Global latest investor-net session for cache busting.
 * @param {{ url: string, anonKey: string }} config
 * @returns {Promise<string>}
 */
export async function fetchLatestInvestorNetSignature(config) {
  const q = 'stock_investor_net?select=trade_date&order=trade_date.desc&limit=1';
  try {
    const rows = await fetchSupabaseJson(config, q);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row?.trade_date) return 'inv-none';
    return `inv-${String(row.trade_date).slice(0, 10).replace(/-/g, '')}`;
  } catch {
    return 'inv-none';
  }
}

function clearInvestorOscOnBar(bar) {
  for (const w of INVESTOR_CUM_WINDOWS) {
    bar[`instOsc${w}`] = null;
    bar[`frgnOsc${w}`] = null;
  }
  bar.instOsc = null;
  bar.frgnOsc = null;
}

/**
 * Attach instOsc5/10/20 and frgnOsc5/10/20 to daily OHLC bars (mutates bars).
 * instOsc / frgnOsc alias instOsc10 / frgnOsc10.
 * @param {Array<{ t: string }>} bars ascending trade dates
 * @param {Map<string, { inst: number, frgn: number }>} byDate
 */
export function attachInvestorOscToBars(bars, byDate) {
  const instNet = bars.map((b) => byDate.get(b.t)?.inst ?? 0);
  const frgnNet = bars.map((b) => byDate.get(b.t)?.frgn ?? 0);
  const byWindow = new Map();
  for (const w of INVESTOR_CUM_WINDOWS) {
    byWindow.set(w, {
      inst: computeInvestorOscSeries(instNet, w),
      frgn: computeInvestorOscSeries(frgnNet, w),
    });
  }
  for (let i = 0; i < bars.length; i++) {
    for (const w of INVESTOR_CUM_WINDOWS) {
      const pack = byWindow.get(w);
      bars[i][`instOsc${w}`] = pack.inst[i] ?? null;
      bars[i][`frgnOsc${w}`] = pack.frgn[i] ?? null;
    }
    bars[i].instOsc = bars[i].instOsc10;
    bars[i].frgnOsc = bars[i].frgnOsc10;
  }
  return bars;
}

/**
 * Fetch investor net and attach OSC fields to daily bars.
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {Array<{ t: string }>} bars
 */
export async function loadAndAttachInvestorOsc(config, ticker, bars) {
  if (!bars.length) return bars;
  const fromDate = bars[0].t;
  const toDate = bars[bars.length - 1].t;
  try {
    const rows = await fetchInvestorNetForRange(config, ticker, fromDate, toDate);
    attachInvestorOscToBars(bars, groupInvestorNetByDate(rows));
  } catch (err) {
    console.warn(
      '[investor_osc] fetch failed:',
      err && err.message ? err.message : err,
    );
    for (const bar of bars) clearInvestorOscOnBar(bar);
  }
  return bars;
}
