/**
 * 5-session high–low range volatility (fraction of close).
 * Same definition as candle_modal rangeVolPercent (percent = fraction × 100).
 *
 * rangeVol5[i] = (max(high[i-4..i]) − min(low[i-4..i])) / close[i]
 * signal = SMA20(rangeVol5)
 */

export const RANGE_VOL_PERIOD = 5;
export const RANGE_VOL_SIGNAL = 20;

/**
 * @param {(number|null|undefined)[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function smaFinite(values, period) {
  const p = period | 0;
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    out[i] = null;
    if (p < 1 || i < p - 1) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / p;
  }
  return out;
}

/**
 * @param {Array<{ h?: number|null, l?: number|null, c?: number|null, high?: number|null, low?: number|null, close?: number|null }>} bars
 * @param {number} [period]
 * @param {number} [signalPeriod]
 * @returns {{ value: (number|null)[], signal: (number|null)[] }}
 *   value/signal are fractions of close (0.0245 = 2.45%), not percent points.
 */
export function rangeVolFraction(bars, period = RANGE_VOL_PERIOD, signalPeriod = RANGE_VOL_SIGNAL) {
  const p = period | 0;
  const value = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    value[i] = null;
    if (p < 1 || i < p - 1) continue;
    let hi = -Infinity;
    let lo = Infinity;
    let ok = true;
    for (let j = i - p + 1; j <= i; j++) {
      const bar = bars[j];
      const h = bar?.h ?? bar?.high;
      const l = bar?.l ?? bar?.low;
      if (h == null || l == null || !Number.isFinite(h) || !Number.isFinite(l)) {
        ok = false;
        break;
      }
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    const close = bars[i]?.c ?? bars[i]?.close;
    if (!ok || !(hi >= lo) || !(close > 0)) continue;
    value[i] = (hi - lo) / close;
  }
  return { value, signal: smaFinite(value, signalPeriod) };
}

/**
 * Percent form (×100) — matches candle_modal rangeVolPercent display units.
 */
export function rangeVolPercent(bars, period = RANGE_VOL_PERIOD, signalPeriod = RANGE_VOL_SIGNAL) {
  const pack = rangeVolFraction(bars, period, signalPeriod);
  return {
    value: pack.value.map((v) => (v == null ? null : v * 100)),
    signal: pack.signal.map((v) => (v == null ? null : v * 100)),
  };
}

/**
 * Tip values from oldest→newest OHLC arrays (aligned).
 * @returns {{ rangeVol5: number|null, rangeVol5Sma20: number|null }}
 */
export function tipRangeVolFromSeries(highs, lows, closes, period = RANGE_VOL_PERIOD, signalPeriod = RANGE_VOL_SIGNAL) {
  const n = Math.min(highs?.length || 0, lows?.length || 0, closes?.length || 0);
  const bars = [];
  for (let i = 0; i < n; i++) {
    bars.push({ h: highs[i], l: lows[i], c: closes[i] });
  }
  const pack = rangeVolFraction(bars, period, signalPeriod);
  const last = n - 1;
  return {
    rangeVol5: last >= 0 ? pack.value[last] : null,
    rangeVol5Sma20: last >= 0 ? pack.signal[last] : null,
  };
}
