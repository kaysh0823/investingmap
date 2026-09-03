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
export const INVESTOR_OSC_PERIODS = Object.freeze([20, 50]);
/** Weekly OSC: fixed 4-week cum / 13-week stochastic (no UI toggle). */
export const WEEKLY_CUM = 4;
export const WEEKLY_PERIOD = 13;

const INST_CODE_SET = new Set(INVESTOR_INST_CODES);
const DEFAULT_CUM_WINDOW = 10;
const DEFAULT_OSC_PERIOD = 20;
const EMA_SPAN = 2;

/** Bar field name: instOsc_10_20, frgnOsc_5_50, … */
export function investorOscBarKey(prefix, cum, period) {
  return `${prefix}_${cum}_${period}`;
}

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
 * Full cumWindow cumulative net, then `period`-bar min/max (default 20).
 * @param {number[]} netByBar — one value per bar (missing days = 0)
 * @param {number} [cumWindow=10] cumulative net window (5, 10, or 20)
 * @param {number} [period=20] stochastic lookback (20 or 50)
 * @returns {(number|null)[]}
 */
export function computeInvestorOscSeries(
  netByBar,
  cumWindow = DEFAULT_CUM_WINDOW,
  period = DEFAULT_OSC_PERIOD,
) {
  if (!netByBar?.length) return [];
  const w = Number(cumWindow) || DEFAULT_CUM_WINDOW;
  const p = Number(period) || DEFAULT_OSC_PERIOD;
  const cum = rollingSum(netByBar, w, w);
  const { lo, hi } = rollingMinMax(cum, p, p);
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
 * Investor-net + foreign-ratio cache signature.
 * Includes min+max for both tables so historical depth backfills invalidate
 * even when MAX(trade_date) is unchanged.
 * @param {{ url: string, anonKey: string }} config
 * @returns {Promise<string>}
 */
export async function fetchLatestInvestorNetSignature(config) {
  const ymd = (row) =>
    row?.trade_date ? String(row.trade_date).slice(0, 10).replace(/-/g, '') : null;
  const depthSig = async (table) => {
    try {
      const [maxRows, minRows] = await Promise.all([
        fetchSupabaseJson(config, `${table}?select=trade_date&order=trade_date.desc&limit=1`),
        fetchSupabaseJson(config, `${table}?select=trade_date&order=trade_date.asc&limit=1`),
      ]);
      const maxYmd = ymd(Array.isArray(maxRows) && maxRows[0] ? maxRows[0] : null);
      if (!maxYmd) return 'none';
      const minYmd = ymd(Array.isArray(minRows) && minRows[0] ? minRows[0] : null) || maxYmd;
      return `${minYmd}-${maxYmd}`;
    } catch {
      return 'none';
    }
  };
  try {
    const [invDepth, frDepth] = await Promise.all([
      depthSig('stock_investor_net'),
      depthSig('stock_foreign_ratio'),
    ]);
    return `inv-v9-${invDepth}-fr-${frDepth}`;
  } catch {
    return 'inv-v9-none';
  }
}

/**
 * ISO week key (UTC), matching candle_modal.aggregateWeeklyBars.
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} e.g. 2026-W09
 */
export function isoWeekKey(isoDate) {
  const parts = String(isoDate || '').split('-');
  if (parts.length !== 3) return String(isoDate || '');
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  if (!Number.isFinite(date.getTime())) return String(isoDate || '');
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Aggregate daily OHLCV into ISO weeks (timestamp = week's last session).
 * Same rules as js/candle_modal.js aggregateWeeklyBars.
 * @param {Array<{ t: string, o?: number|null, h?: number|null, l?: number|null, c: number, v?: number|null }>} dailyBars
 */
export function aggregateDailyBarsToWeekly(dailyBars) {
  const out = [];
  let current = null;
  for (const bar of dailyBars || []) {
    if (!bar?.t) continue;
    const key = isoWeekKey(bar.t);
    if (!current || current.key !== key) {
      if (current) {
        const { key: _k, ...rest } = current;
        out.push(rest);
      }
      current = {
        key,
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: Number(bar.v) || 0,
      };
    } else {
      current.t = bar.t;
      current.h =
        current.h == null || bar.h == null
          ? current.h ?? bar.h
          : Math.max(current.h, bar.h);
      current.l =
        current.l == null || bar.l == null
          ? current.l ?? bar.l
          : Math.min(current.l, bar.l);
      current.c = bar.c;
      current.v += Number(bar.v) || 0;
    }
  }
  if (current) {
    const { key: _k, ...rest } = current;
    out.push(rest);
  }
  return out;
}

/**
 * Sum daily investor nets into each ISO week (aligned to weeklyBars order).
 * @param {Array<{ t: string }>} weeklyBars
 * @param {Map<string, { inst: number, frgn: number }>} byDate
 * @returns {{ inst: number[], frgn: number[] }}
 */
export function weeklyNetSeriesFromDaily(weeklyBars, byDate) {
  const weekNets = new Map();
  for (const [d, bucket] of byDate || []) {
    const key = isoWeekKey(d);
    let w = weekNets.get(key);
    if (!w) {
      w = { inst: 0, frgn: 0 };
      weekNets.set(key, w);
    }
    w.inst += bucket?.inst ?? 0;
    w.frgn += bucket?.frgn ?? 0;
  }
  const inst = [];
  const frgn = [];
  for (const bar of weeklyBars || []) {
    const pack = weekNets.get(isoWeekKey(bar.t));
    inst.push(pack?.inst ?? 0);
    frgn.push(pack?.frgn ?? 0);
  }
  return { inst, frgn };
}

function clearInvestorOscOnBar(bar) {
  for (const cum of INVESTOR_CUM_WINDOWS) {
    for (const period of INVESTOR_OSC_PERIODS) {
      bar[investorOscBarKey('instOsc', cum, period)] = null;
      bar[investorOscBarKey('frgnOsc', cum, period)] = null;
    }
    bar[`instOsc${cum}`] = null;
    bar[`frgnOsc${cum}`] = null;
  }
  bar[investorOscBarKey('instOsc', WEEKLY_CUM, WEEKLY_PERIOD)] = null;
  bar[investorOscBarKey('frgnOsc', WEEKLY_CUM, WEEKLY_PERIOD)] = null;
  bar.instOsc = null;
  bar.frgnOsc = null;
}

/**
 * Write OSC combo fields onto bars from aligned net series (mutates bars).
 * @param {Array<object>} bars
 * @param {number[]} instNet
 * @param {number[]} frgnNet
 */
function writeInvestorOscFromNets(bars, instNet, frgnNet) {
  const byCombo = new Map();
  for (const cum of INVESTOR_CUM_WINDOWS) {
    for (const period of INVESTOR_OSC_PERIODS) {
      byCombo.set(`${cum}_${period}`, {
        inst: computeInvestorOscSeries(instNet, cum, period),
        frgn: computeInvestorOscSeries(frgnNet, cum, period),
      });
    }
  }
  for (let i = 0; i < bars.length; i++) {
    for (const cum of INVESTOR_CUM_WINDOWS) {
      for (const period of INVESTOR_OSC_PERIODS) {
        const pack = byCombo.get(`${cum}_${period}`);
        bars[i][investorOscBarKey('instOsc', cum, period)] = pack.inst[i] ?? null;
        bars[i][investorOscBarKey('frgnOsc', cum, period)] = pack.frgn[i] ?? null;
      }
      bars[i][`instOsc${cum}`] = bars[i][investorOscBarKey('instOsc', cum, 20)];
      bars[i][`frgnOsc${cum}`] = bars[i][investorOscBarKey('frgnOsc', cum, 20)];
    }
    bars[i].instOsc = bars[i].instOsc10;
    bars[i].frgnOsc = bars[i].frgnOsc10;
  }
  return bars;
}

/**
 * Attach instOsc_{cum}_{period} and frgnOsc_{cum}_{period} to daily OHLC bars (mutates bars).
 * Legacy instOsc5/10/20 and instOsc / frgnOsc alias the period-20 combination.
 * @param {Array<{ t: string }>} bars ascending trade dates
 * @param {Map<string, { inst: number, frgn: number }>} byDate
 */
export function attachInvestorOscToBars(bars, byDate) {
  const instNet = bars.map((b) => byDate.get(b.t)?.inst ?? 0);
  const frgnNet = bars.map((b) => byDate.get(b.t)?.frgn ?? 0);
  return writeInvestorOscFromNets(bars, instNet, frgnNet);
}

/**
 * Attach OSC to weekly bars: sum daily nets inside each ISO week, then fixed
 * WEEKLY_CUM / WEEKLY_PERIOD OSC only (no daily 5/10/20 × 20/50 grid).
 * @param {Array<{ t: string }>} weeklyBars
 * @param {Map<string, { inst: number, frgn: number }>} byDate daily nets
 */
export function attachInvestorOscToWeeklyBars(weeklyBars, byDate) {
  const { inst, frgn } = weeklyNetSeriesFromDaily(weeklyBars, byDate);
  const instSeries = computeInvestorOscSeries(inst, WEEKLY_CUM, WEEKLY_PERIOD);
  const frgnSeries = computeInvestorOscSeries(frgn, WEEKLY_CUM, WEEKLY_PERIOD);
  const ik = investorOscBarKey('instOsc', WEEKLY_CUM, WEEKLY_PERIOD);
  const fk = investorOscBarKey('frgnOsc', WEEKLY_CUM, WEEKLY_PERIOD);
  for (let i = 0; i < weeklyBars.length; i++) {
    clearInvestorOscOnBar(weeklyBars[i]);
    weeklyBars[i][ik] = instSeries[i] ?? null;
    weeklyBars[i][fk] = frgnSeries[i] ?? null;
    weeklyBars[i].instOsc = weeklyBars[i][ik];
    weeklyBars[i].frgnOsc = weeklyBars[i][fk];
  }
  return weeklyBars;
}

/**
 * Fetch investor net and attach OSC fields to bars.
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {Array<{ t: string }>} bars daily or weekly (see options.interval)
 * @param {{ interval?: 'daily'|'weekly', netFromDate?: string }} [options]
 *   netFromDate: optional earlier bound when bars are weekly (cover first week days)
 */
export async function loadAndAttachInvestorOsc(config, ticker, bars, options = {}) {
  if (!bars.length) return bars;
  const interval = options.interval === 'weekly' ? 'weekly' : 'daily';
  const fromDate = options.netFromDate || bars[0].t;
  const toDate = bars[bars.length - 1].t;
  try {
    const rows = await fetchInvestorNetForRange(config, ticker, fromDate, toDate);
    const byDate = groupInvestorNetByDate(rows);
    if (interval === 'weekly') attachInvestorOscToWeeklyBars(bars, byDate);
    else attachInvestorOscToBars(bars, byDate);
  } catch (err) {
    console.warn(
      '[investor_osc] fetch failed:',
      err && err.message ? err.message : err,
    );
    for (const bar of bars) clearInvestorOscOnBar(bar);
  }
  return bars;
}
