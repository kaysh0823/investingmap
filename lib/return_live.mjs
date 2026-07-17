/**
 * Live return helpers — KST stale check, chg1d from ref close, sector mcap ratio.
 * Browser copy: js/return_live.js
 */

import {
  kstAnchorYmd,
  kstYmd as kstYmdSession,
} from '../functions/lib/krx_session.mjs';

export { kstAnchorYmd } from '../functions/lib/krx_session.mjs';
export { isKrxRegularSession } from '../functions/lib/krx_session.mjs';

export function kstYmd(now = new Date()) {
  return kstYmdSession(now);
}

/** KRX recentDd is before KST anchor (today or latest weekday). */
export function isRecentDdStale(recentDd, now = new Date()) {
  if (!recentDd || typeof recentDd !== 'string') return false;
  const anchor = kstAnchorYmd(now);
  return recentDd < anchor;
}

/** 1D (당일) metrics use Naver quotes any time; 20D+ always use KRX snapshot. */
export function shouldUseLive1dReturns(recentDd, now = new Date()) {
  if (!recentDd || typeof recentDd !== 'string') return true;
  return recentDd <= kstAnchorYmd(now);
}

export function calcReturnPct(now, past) {
  if (now == null || past == null || past <= 0) return null;
  if (!Number.isFinite(now) || !Number.isFinite(past)) return null;
  return ((now / past) - 1) * 100;
}

export function calcLiveChg1dPct(liveLast, refClose) {
  const ret = calcReturnPct(liveLast, refClose);
  return ret != null ? Math.round(ret * 100) / 100 : null;
}

/** Recompute return from live last using snapshot return vs refClose. */
export function calcLiveRetFromSnapPct(liveLast, refClose, snapRetPct) {
  if (snapRetPct == null || !Number.isFinite(snapRetPct)) return null;
  if (refClose == null || refClose <= 0 || liveLast == null) return null;
  const pastClose = refClose / (1 + snapRetPct / 100);
  const ret = calcReturnPct(liveLast, pastClose);
  return ret != null ? Math.round(ret * 100) / 100 : null;
}

export function pastMcapFromSnapRet(refMcap, snapRetPct) {
  if (refMcap == null || snapRetPct == null) return null;
  if (!Number.isFinite(refMcap) || !Number.isFinite(snapRetPct) || refMcap <= 0) return null;
  const denom = 1 + snapRetPct / 100;
  if (denom <= 0) return null;
  return refMcap / denom;
}

export function calcLiveMcapWon(refMcap, liveLast, refClose) {
  if (refMcap == null || liveLast == null || refClose == null) return null;
  if (!Number.isFinite(refMcap) || !Number.isFinite(liveLast) || !Number.isFinite(refClose)) return null;
  if (refMcap <= 0 || refClose <= 0 || liveLast <= 0) return null;
  return refMcap * (liveLast / refClose);
}

export function normalizeTicker(t) {
  if (t == null || t === '' || t === 'UNLISTED') return null;
  const s = String(t).trim().toUpperCase();
  if (/^[0-9A-Z]{6}$/.test(s)) return s;
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (alnum.length > 6) return alnum.slice(0, 6);
  if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
  if (alnum.length === 6) return alnum;
  return null;
}

/**
 * Mcap-weighted sector return: sum(now) / sum(past) - 1.
 * @param {Array<{ ticker: string, mcapWon?: number }>} companies
 * @param {Map<string, number>|function(string): number|null} mcapNow — live mcap per ticker
 * @param {Map<string, number>} mcapPast
 */
export function sectorReturnMcapRatio(companies, mcapNow, mcapPast) {
  let sumNow = 0;
  let sumPast = 0;
  const getNow = typeof mcapNow === 'function' ? mcapNow : (code) => mcapNow.get(code);
  for (const c of companies) {
    const key = normalizeTicker(c.ticker);
    if (!key) continue;
    const now = getNow(key);
    const past = mcapPast.get(key);
    if (
      now == null || past == null
      || !Number.isFinite(now) || !Number.isFinite(past)
      || now <= 0 || past <= 0
    ) {
      continue;
    }
    sumNow += now;
    sumPast += past;
  }
  if (sumPast <= 0) return null;
  return ((sumNow / sumPast) - 1) * 100;
}

/**
 * Build past1d mcap map from RS snapshot quotes.
 * @param {object} snap — hub_rs_snapshot
 */
export function past1dMcapMapFromSnap(snap) {
  const out = new Map();
  const quotes = (snap && snap.quotes) || {};
  for (const code of Object.keys(quotes)) {
    const row = quotes[code];
    if (row && typeof row.past1dMcap === 'number' && row.past1dMcap > 0) {
      out.set(code, row.past1dMcap);
    }
  }
  return out;
}

/**
 * KRX ref-day mcap (recentDd close) — denominator for live 1D sector return vs Naver last.
 * Use this (not past1dMcap) when estimating "next session" vs ref close, e.g. Jul 9 vs Jul 8
 * while KRX recentDd still shows Jul 8.
 */
export function refMcapMapFromSnap(snap) {
  const out = new Map();
  const quotes = (snap && snap.quotes) || {};
  for (const code of Object.keys(quotes)) {
    const row = quotes[code];
    if (row && typeof row.refMcap === 'number' && row.refMcap > 0) {
      out.set(code, row.refMcap);
    }
  }
  return out;
}

/** Past mcap map derived from refMcap + snapshot return field (e.g. ret20dPct). */
export function pastMcapMapFromSnapRet(snap, retField) {
  const out = new Map();
  const quotes = (snap && snap.quotes) || {};
  for (const code of Object.keys(quotes)) {
    const row = quotes[code];
    const past = pastMcapFromSnapRet(row && row.refMcap, row && row[retField]);
    if (past != null && past > 0) out.set(code, past);
  }
  return out;
}
