/**
 * Single source of truth for stock / sector return math.
 * Views and APIs should call these helpers; do not re-implement locally.
 */

export const RETURN_HORIZONS = [1, 5, 20, 50, 120, 200];

/**
 * Round a decimal return (e.g. 0.0123) to percent with 2 decimal places.
 * (numerator/ref - 1) → percent via Math.round(x * 10000) / 100
 * @param {number} ratio
 * @returns {number}
 */
export function roundPct(ratio) {
  return Math.round(ratio * 10000) / 100;
}

/**
 * Session-open numerator: live last while the board is open (regular or aftermarket);
 * otherwise the official close. Missing both → null.
 * @param {{ liveLast?: number|null, sessionOpen?: boolean, officialClose?: number|null }} args
 * @returns {number|null}
 */
export function resolveNumerator({ liveLast, sessionOpen, officialClose }) {
  if (sessionOpen) {
    const live = numPos(liveLast);
    if (live != null) return live;
    return numPos(officialClose);
  }
  const close = numPos(officialClose);
  if (close != null) return close;
  return numPos(liveLast);
}

/**
 * Trading sessions elapsed from refs tip (recentDd) to the live Naver tradeDate.
 * liveTradeDd === recentDd → 0; liveTradeDd after recentDd → count via tradingDates (usually 1).
 * @param {string} recentDd YYYYMMDD
 * @param {string} liveTradeDd YYYYMMDD (Naver session marker — holidays auto-skip)
 * @param {string[]} tradingDates YYYYMMDD session calendar (any order)
 * @returns {number}
 */
export function sessionsSince(recentDd, liveTradeDd, tradingDates) {
  const recent = compactYmd(recentDd);
  const live = compactYmd(liveTradeDd);
  if (!recent || !live) return 0;
  if (live === recent) return 0;
  if (live < recent) return 0;

  const dates = (tradingDates || [])
    .map(compactYmd)
    .filter(Boolean);
  if (!dates.length) return live > recent ? 1 : 0;

  let k = 0;
  for (const d of dates) {
    if (d > recent && d <= live) k += 1;
  }
  // Live session ahead of the committed calendar tip (refs not yet rolled).
  if (k === 0 && live > recent) return 1;
  return k;
}

/**
 * Reference close for horizon N: closes[L - 1 + k - N].
 * @param {Array<number|null|undefined>} closes oldest → newest; last = recentDd close
 * @param {number} k sessionsSince(recentDd, liveTradeDd)
 * @param {number} n horizon sessions (1,5,20,…)
 * @returns {number|null}
 */
export function refCloseAt(closes, k, n) {
  if (!Array.isArray(closes) || !closes.length) return null;
  const kk = Number(k);
  const nn = Number(n);
  if (!Number.isFinite(kk) || !Number.isFinite(nn) || nn <= 0) return null;
  const L = closes.length;
  const idx = L - 1 + kk - nn;
  if (idx < 0 || idx >= L) return null;
  return numPos(closes[idx]);
}

/**
 * Per-stock returns from a shared numerator and adjusted close history.
 * @param {{ numerator: number|null|undefined, closes: Array<number|null|undefined>, k?: number }} args
 * @returns {{
 *   chg1dPct: number|null,
 *   ret5dPct: number|null,
 *   ret20dPct: number|null,
 *   ret50dPct: number|null,
 *   ret120dPct: number|null,
 *   ret200dPct: number|null,
 * }}
 */
export function computeStockReturns({ numerator, closes, k = 0 }) {
  const num = numPos(numerator);
  const out = {
    chg1dPct: null,
    ret5dPct: null,
    ret20dPct: null,
    ret50dPct: null,
    ret120dPct: null,
    ret200dPct: null,
  };
  if (num == null || !Array.isArray(closes)) return out;

  const fieldByN = {
    1: 'chg1dPct',
    5: 'ret5dPct',
    20: 'ret20dPct',
    50: 'ret50dPct',
    120: 'ret120dPct',
    200: 'ret200dPct',
  };
  for (const n of RETURN_HORIZONS) {
    const ref = refCloseAt(closes, k, n);
    if (ref == null) continue;
    out[fieldByN[n]] = roundPct(num / ref - 1);
  }
  return out;
}

/**
 * Cap-weighted sector return using the same numerator / refN as stocks:
 * Σ(numerator_i × shares_i) / Σ(refN_i × shares_i) − 1
 * Members with null refN (or non-positive shares/numerator) are dropped from both sides.
 * @param {Array<{ numerator: number|null|undefined, closes: Array<number|null|undefined>, k?: number, shares: number|null|undefined }>} members
 * @returns {{
 *   chg1dPct: number|null,
 *   ret5dPct: number|null,
 *   ret20dPct: number|null,
 *   ret50dPct: number|null,
 *   ret120dPct: number|null,
 *   ret200dPct: number|null,
 * }}
 */
export function aggregateSectorReturns(members) {
  const out = {
    chg1dPct: null,
    ret5dPct: null,
    ret20dPct: null,
    ret50dPct: null,
    ret120dPct: null,
    ret200dPct: null,
  };
  if (!Array.isArray(members) || !members.length) return out;

  const fieldByN = {
    1: 'chg1dPct',
    5: 'ret5dPct',
    20: 'ret20dPct',
    50: 'ret50dPct',
    120: 'ret120dPct',
    200: 'ret200dPct',
  };

  for (const n of RETURN_HORIZONS) {
    let numSum = 0;
    let denSum = 0;
    for (const m of members) {
      const shares = numPos(m?.shares);
      const numerator = numPos(m?.numerator);
      if (shares == null || numerator == null) continue;
      const ref = refCloseAt(m.closes, m.k ?? 0, n);
      if (ref == null) continue;
      numSum += numerator * shares;
      denSum += ref * shares;
    }
    if (denSum > 0) out[fieldByN[n]] = roundPct(numSum / denSum - 1);
  }
  return out;
}

function numPos(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function compactYmd(v) {
  const s = String(v || '').replace(/-/g, '');
  return /^\d{8}$/.test(s) ? s : '';
}
