/**
 * Bollinger %b / width — same definition as js/candle_modal.js
 * (population stdev ÷ N, mid ± mult·σ, trailing min-max norm).
 */

/**
 * @param {Array<number|null>} closes
 * @param {number} i
 * @param {number} [period]
 * @param {number} [mult]
 * @returns {{ mid: number, upper: number, lower: number, pctB: number, width: number } | null}
 */
export function bollingerAt(closes, i, period = 20, mult = 2) {
  const p = period | 0;
  if (!closes || p < 2 || i < p - 1 || i >= closes.length) return null;
  let sum = 0;
  for (let j = i - p + 1; j <= i; j++) {
    const v = closes[j];
    if (v == null || !Number.isFinite(v)) return null;
    sum += v;
  }
  const mid = sum / p;
  if (!(mid > 0)) return null;
  let sumSq = 0;
  for (let j = i - p + 1; j <= i; j++) {
    const d = closes[j] - mid;
    sumSq += d * d;
  }
  const sd = Math.sqrt(sumSq / p);
  if (!(sd > 0)) return null;
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const span = upper - lower;
  if (!(span > 0)) return null;
  const close = closes[i];
  return {
    mid,
    upper,
    lower,
    pctB: (close - lower) / span,
    width: span / mid,
  };
}

/**
 * Past-only trailing min-max to 0..100. Identical to candle_modal trailingMinMaxNorm.
 * At i, uses values[i-window+1 .. i]. Needs `window` finite values. max==min → 50.
 * @param {Array<number|null>} values
 * @param {number} [window]
 * @returns {Array<number|null>}
 */
export function trailingMinMaxNorm(values, window = 125) {
  const out = new Array(values.length);
  const wLen = window | 0;
  if (wLen < 2) {
    for (let z = 0; z < values.length; z++) out[z] = null;
    return out;
  }
  for (let i = 0; i < values.length; i++) {
    out[i] = null;
    const cur = values[i];
    if (cur == null || !Number.isFinite(cur)) continue;
    const from = i - wLen + 1;
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
    if (n !== wLen) continue;
    if (!(maxV > minV)) {
      out[i] = 50;
      continue;
    }
    out[i] = ((cur - minV) / (maxV - minV)) * 100;
  }
  return out;
}

/** score = %b + (1 − BBW%/100). BBW% is the 0–100 trailing norm. */
export function bbScore(pctB, bbwNorm) {
  if (pctB == null || bbwNorm == null || !Number.isFinite(pctB) || !Number.isFinite(bbwNorm)) {
    return null;
  }
  return pctB + (1 - bbwNorm / 100);
}
