/**
 * Price adjustment detection (split/merge) and backward OHLC overlay.
 * ratio = shares_after / shares_before; bars with t < effective_date are scaled.
 */

import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';

/** Clean share-count multipliers and their inverses. */
export const CLEAN_SHARE_RATIOS = Object.freeze([1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 20, 50]);

export const SHARE_RATIO_TOLERANCE = 0.04;
/** Normal inverse price gap tolerance (|C × R − 1| <= 0.15). */
export const INVERSE_PRICE_GAP_TOLERANCE = 0.15;
/** Extended tolerance for ex-date surges (e.g. limit-up +30% or resumption discovery up to 35%). */
export const INVERSE_PRICE_GAP_REVIEW_TOLERANCE = 0.35;
/** Post-event shares must hold within SHARE_RATIO_TOLERANCE for this many sessions. */
export const POST_EVENT_SHARES_PERSIST_DAYS = 3;
/** Warn when share count moves materially but ratio is not clean. */
export const REVIEW_SHARE_DELTA = 0.03;
/** Close jump band for missing-shares review candidates (not auto-upserted). */
export const REVIEW_CLOSE_RATIO_LOW = 0.45;
export const REVIEW_CLOSE_RATIO_HIGH = 2.2;

/**
 * Price moved inversely to shares: C×R ≈ 1 (split/merge symmetric).
 * @param {number} cleanRatio matched shares_after / shares_before (R)
 * @param {number} closeRatio currClose / prevClose (C)
 * @param {number} [tolerance] optional custom tolerance (default INVERSE_PRICE_GAP_TOLERANCE)
 * @returns {boolean}
 */
export function passesInversePriceGapSanity(
  cleanRatio,
  closeRatio,
  tolerance = INVERSE_PRICE_GAP_TOLERANCE,
) {
  if (
    !Number.isFinite(cleanRatio) ||
    !Number.isFinite(closeRatio) ||
    closeRatio <= 0 ||
    cleanRatio <= 0
  ) {
    return false;
  }
  return Math.abs(closeRatio * cleanRatio - 1) <= tolerance;
}

/** @deprecated use passesInversePriceGapSanity */
export function passesLooseCloseRatioSanity(cleanRatio, closeRatio) {
  return passesInversePriceGapSanity(cleanRatio, closeRatio);
}

export function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Implied listed shares from stored history (mcap_won / close).
 * @param {{ close?: number|null, mcap_won?: number|null }} row
 * @returns {number|null}
 */
export function sharesFromHistoryRow(row) {
  const close = numOrNull(row?.close);
  const mcap = numOrNull(row?.mcap_won);
  if (close == null || mcap == null || close <= 0 || mcap <= 0) return null;
  return Math.round(mcap / close);
}

/**
 * @param {number} observed
 * @param {number} [tolerance]
 * @returns {number|null} matched clean ratio (may be <1 for reverse split)
 */
export function matchCleanShareRatio(observed, tolerance = SHARE_RATIO_TOLERANCE) {
  if (!Number.isFinite(observed) || observed <= 0) return null;
  let best = null;
  let minDiff = Infinity;
  for (const base of CLEAN_SHARE_RATIOS) {
    for (const candidate of [base, 1 / base]) {
      const diff = Math.abs(observed - candidate) / candidate;
      if (diff <= tolerance && diff < minDiff) {
        minDiff = diff;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * @param {number} sharesRatio matched clean ratio
 * @returns {'split'|'merge'}
 */
export function adjustmentTypeFromRatio(sharesRatio) {
  return sharesRatio >= 1 ? 'split' : 'merge';
}

/**
 * Detect split/merge from adjacent trading days (history or KRX+history pair).
 * @param {object} prev prior session { trade_date?, close, mcap_won } or shares via LIST_SHRS
 * @param {object} curr current session — same shape; curr may include list_shrs
 * @param {string} ticker
 * @param {string} source e.g. auto-seed | auto-daily
 * @returns {object|null} price_adjustments row shape
 */
export function detectAdjustmentEvent(prev, curr, ticker, source = 'auto-seed') {
  if (!prev || !curr || !ticker) return null;

  const prevShares =
    numOrNull(prev.list_shrs) ??
    numOrNull(prev.LIST_SHRS) ??
    sharesFromHistoryRow(prev);
  const currShares =
    numOrNull(curr.list_shrs) ??
    numOrNull(curr.LIST_SHRS) ??
    sharesFromHistoryRow(curr);

  const prevClose = numOrNull(prev.close ?? prev.TDD_CLSPRC);
  const currClose = numOrNull(curr.close ?? curr.TDD_CLSPRC);

  if (
    prevShares == null ||
    currShares == null ||
    prevClose == null ||
    currClose == null ||
    prevShares <= 0 ||
    currShares <= 0 ||
    prevClose <= 0 ||
    currClose <= 0
  ) {
    return null;
  }

  const sharesRatio = currShares / prevShares;
  const closeRatio = currClose / prevClose;
  const cleanRatio = matchCleanShareRatio(sharesRatio);
  if (cleanRatio == null) return null;

  // Split/bonus (cleanRatio > 1) must have price drop (closeRatio < 1).
  // Merge/reverse split (cleanRatio < 1) must have price rise (closeRatio > 1).
  if (cleanRatio > 1 && closeRatio >= 1) return null;
  if (cleanRatio < 1 && closeRatio <= 1) return null;

  // On ex-date of split (cleanRatio > 1), price must drop towards 1/cleanRatio.
  // Even with +30% limit-up, closeRatio cannot exceed (1/cleanRatio) * 1.35.
  // This prevents false positives on share listing dates or unrelated mergers (where price was flat C≈1.0).
  if (cleanRatio > 1 && closeRatio > (1 / cleanRatio) * 1.35) return null;
  if (cleanRatio < 1 && closeRatio < (1 / cleanRatio) * 0.65) return null;

  // Must pass extended inverse price gap sanity (up to 45% gap for limit moves/resumption)
  if (!passesInversePriceGapSanity(cleanRatio, closeRatio, INVERSE_PRICE_GAP_REVIEW_TOLERANCE)) {
    return null;
  }

  const gap = Math.abs(closeRatio * cleanRatio - 1);
  const isReview = gap > INVERSE_PRICE_GAP_TOLERANCE;
  const reviewTag = isReview ? ` [review: wide gap ${(gap * 100).toFixed(1)}%]` : '';

  const effectiveDate = String(
    curr.trade_date ?? curr.tradeDate ?? curr.effective_date ?? '',
  ).slice(0, 10);
  if (!effectiveDate || effectiveDate.length < 10) return null;

  return {
    ticker: String(ticker).padStart(6, '0').slice(-6),
    effective_date: effectiveDate,
    ratio: cleanRatio,
    type: adjustmentTypeFromRatio(cleanRatio),
    source,
    review: isReview,
    note: `shares ${prevShares}→${currShares}, close ${Math.round(prevClose)}→${Math.round(currClose)}${reviewTag}`,
  };
}

/**
 * Post-event listed shares stable for N sessions (filters one-day mcap glitches).
 * @param {Array<{trade_date:string,close:number,mcap_won:number}>} rows asc by date
 * @param {number} eventIdx index of effective_date row in rows
 * @param {number} postShares shares on eventIdx
 * @param {number} [days]
 * @param {number} [tolerance]
 */
export function sharesPersistAfterEvent(
  rows,
  eventIdx,
  postShares,
  days = POST_EVENT_SHARES_PERSIST_DAYS,
  tolerance = SHARE_RATIO_TOLERANCE,
) {
  if (!rows?.length || postShares == null || postShares <= 0 || days <= 0) return false;
  for (let d = 1; d <= days; d++) {
    const row = rows[eventIdx + d];
    if (!row) return false;
    const sh =
      numOrNull(row.list_shrs) ??
      numOrNull(row.LIST_SHRS) ??
      sharesFromHistoryRow(row);
    if (sh == null || sh <= 0) return false;
    if (Math.abs(sh - postShares) / postShares > tolerance) return false;
  }
  return true;
}

export function rowShares(row) {
  return numOrNull(row?.list_shrs) ?? numOrNull(row?.LIST_SHRS) ?? sharesFromHistoryRow(row);
}

export function rowClose(row) {
  return numOrNull(row?.close ?? row?.TDD_CLSPRC);
}

/**
 * Detect bonus issues (무상증자) where the price drops on ex-date (권리락일),
 * but listed shares in KRX data update 5~45 trading days later on the new share listing date.
 * @param {string} ticker
 * @param {Array<{trade_date:string,close:number,mcap_won:number}>} rows
 * @param {string} source
 * @returns {object[]}
 */
export function detectBonusEventsWithLaggedShares(ticker, rows, source = 'auto-seed') {
  const events = [];
  if (!rows || rows.length < 3 || !ticker) return events;

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const prevClose = rowClose(prev);
    const currClose = rowClose(curr);
    if (!(prevClose > 0) || !(currClose > 0)) continue;

    const prevSh = rowShares(prev);
    const currSh = rowShares(curr);
    if (!prevSh || !currSh) continue;

    // If same-day share count already changed (>12%), detectAdjustmentEvent handles it
    const sameDayRatio = currSh / prevSh;
    if (Math.abs(sameDayRatio - 1) > 0.12) continue;

    const closeRatio = currClose / prevClose;
    // Bonus issue ex-date: price drops towards 1/R (for 1.5x bonus ~0.67, allow surge up to 0.78)
    if (closeRatio > 0.78) continue;

    const impliedRatio = 1 / closeRatio;
    const cleanRatioFromPrice = matchCleanShareRatio(impliedRatio, 0.18);

    // Look ahead 5 to 45 trading sessions for new shares listing
    const maxLookahead = Math.min(rows.length, i + 45);
    for (let k = i + 1; k < maxLookahead; k++) {
      const laterSh = rowShares(rows[k]);
      if (!laterSh) continue;
      const observedRatio1 = laterSh / prevSh;
      const observedRatio2 = laterSh / currSh;
      let cleanRatio =
        matchCleanShareRatio(observedRatio1, 0.08) ??
        matchCleanShareRatio(observedRatio2, 0.08);

      // Support treasury-diluted bonus issues where shares increase to ~75-125% of theoretical ratio
      if (!cleanRatio && cleanRatioFromPrice && cleanRatioFromPrice > 1) {
        const obs = Math.max(observedRatio1, observedRatio2);
        if (obs >= cleanRatioFromPrice * 0.75 && obs <= cleanRatioFromPrice * 1.25) {
          cleanRatio = cleanRatioFromPrice;
        }
      }
      if (!cleanRatio || cleanRatio <= 1) continue;

      // Check inverse price gap
      const gap = Math.abs(closeRatio * cleanRatio - 1);
      if (gap > INVERSE_PRICE_GAP_REVIEW_TOLERANCE) continue;

      // Verify shares persist after listing date
      if (!sharesPersistAfterEvent(rows, k, laterSh, 3, 0.08)) continue;

      const effectiveDate = String(curr.trade_date ?? curr.tradeDate ?? '').slice(0, 10);
      if (!effectiveDate || effectiveDate.length < 10) continue;

      const isReview = gap > INVERSE_PRICE_GAP_TOLERANCE;
      const reviewTag = isReview ? ` [review: wide gap ${(gap * 100).toFixed(1)}%]` : '';

      events.push({
        ticker: String(ticker).padStart(6, '0').slice(-6),
        effective_date: effectiveDate,
        ratio: cleanRatio,
        type: 'bonus',
        source,
        review: isReview,
        note: `bonus ex-date close ${Math.round(prevClose)}→${Math.round(currClose)} (C=${closeRatio.toFixed(3)}), new shares listed ${String(rows[k].trade_date).slice(0, 10)} ${prevSh}→${laterSh} (observed=${(laterSh/prevSh).toFixed(3)}, clean=${cleanRatio})${reviewTag}`,
      });
      break;
    }
  }
  return events;
}

/**
 * Scan ordered history rows (ascending trade_date) for adjustment events.
 * @param {string} ticker
 * @param {Array<{trade_date:string,close:number,mcap_won:number}>} rows
 * @param {string} source
 * @param {{ requireSharesPersistence?: boolean, includeLaggedBonus?: boolean }} [options]
 * @returns {object[]}
 */
export function detectEventsFromHistoryRows(ticker, rows, source = 'auto-seed', options = {}) {
  const requirePersistence = options.requireSharesPersistence !== false;
  const includeLaggedBonus = options.includeLaggedBonus !== false;
  const events = [];
  const seenDates = new Set();
  if (!rows || rows.length < 2) return events;

  // 1. Same-day split/merge/bonus events
  for (let i = 1; i < rows.length; i++) {
    const ev = detectAdjustmentEvent(rows[i - 1], rows[i], ticker, source);
    if (!ev) continue;
    if (requirePersistence) {
      const postShares =
        numOrNull(rows[i].list_shrs) ??
        numOrNull(rows[i].LIST_SHRS) ??
        sharesFromHistoryRow(rows[i]);
      if (!sharesPersistAfterEvent(rows, i, postShares)) continue;
    }
    events.push(ev);
    seenDates.add(ev.effective_date);
  }

  // 2. Lagged bonus issues (where listed shares updated on new share listing date)
  if (includeLaggedBonus) {
    const bonusEvents = detectBonusEventsWithLaggedShares(ticker, rows, source);
    for (const bev of bonusEvents) {
      if (!seenDates.has(bev.effective_date)) {
        events.push(bev);
        seenDates.add(bev.effective_date);
      }
    }
  }

  return events.sort((a, b) => a.effective_date.localeCompare(b.effective_date));
}

/**
 * Review-only: missing shares on either adjacent day + extreme close jump.
 * Never auto-upsert — split vs crash/gap needs a human.
 * @param {string} ticker
 * @param {Array<{trade_date:string,close:number,mcap_won?:number|null}>} rows
 * @returns {object[]}
 */
export function detectMissingSharesCloseJumps(ticker, rows) {
  const out = [];
  if (!rows || rows.length < 2 || !ticker) return out;
  const code = String(ticker).padStart(6, '0').slice(-6);
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const prevClose = rowClose(prev);
    const currClose = rowClose(curr);
    if (!(prevClose > 0) || !(currClose > 0)) continue;
    const closeRatio = currClose / prevClose;
    if (closeRatio >= REVIEW_CLOSE_RATIO_LOW && closeRatio <= REVIEW_CLOSE_RATIO_HIGH) continue;
    const prevShares = rowShares(prev);
    const currShares = rowShares(curr);
    if (prevShares != null && currShares != null) continue;
    const effectiveDate = String(curr.trade_date ?? curr.tradeDate ?? '').slice(0, 10);
    if (!effectiveDate || effectiveDate.length < 10) continue;
    out.push({
      ticker: code,
      effective_date: effectiveDate,
      closeRatio: Math.round(closeRatio * 10000) / 10000,
      reason: 'missing-shares-close-jump',
      note:
        `close ${Math.round(prevClose)}→${Math.round(currClose)} C=${closeRatio.toFixed(4)}` +
        ` shares ${prevShares ?? 'null'}→${currShares ?? 'null'}`,
    });
  }
  return out;
}

/**
 * @param {number} sharesRatio raw ratio (not necessarily clean)
 * @returns {boolean}
 */
export function shouldReviewAdjustment(sharesRatio) {
  if (!Number.isFinite(sharesRatio) || sharesRatio <= 0) return false;
  if (matchCleanShareRatio(sharesRatio) != null) return false;
  return Math.abs(sharesRatio - 1) >= REVIEW_SHARE_DELTA;
}

/**
 * Cumulative backward-adjustment factor for a bar date.
 * @param {string} barDate YYYY-MM-DD
 * @param {Array<{effective_date:string,ratio:number}>} adjustments asc by effective_date
 */
export function cumulativeAdjustmentRatio(barDate, adjustments) {
  if (!barDate || !adjustments?.length) return 1;
  const t = String(barDate).slice(0, 10);
  let cum = 1;
  for (const adj of adjustments) {
    const eff = String(adj.effective_date).slice(0, 10);
    if (t < eff) cum *= Number(adj.ratio);
  }
  return cum;
}

function roundWon(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

/**
 * Backward-adjust OHLCV bars in place (returns same array).
 * @param {Array<{t:string,o?:number|null,h?:number|null,l?:number|null,c:number,v?:number|null}>} bars
 * @param {Array<{effective_date:string,ratio:number}>} adjustments
 */
export function applyPriceAdjustmentsToBars(bars, adjustments) {
  if (!bars?.length || !adjustments?.length) return bars;
  const sorted = [...adjustments].sort((a, b) =>
    String(a.effective_date).localeCompare(String(b.effective_date)),
  );
  for (const bar of bars) {
    const cum = cumulativeAdjustmentRatio(bar.t, sorted);
    if (cum === 1) continue;
    if (bar.o != null) bar.o = roundWon(bar.o / cum);
    if (bar.h != null) bar.h = roundWon(bar.h / cum);
    if (bar.l != null) bar.l = roundWon(bar.l / cum);
    bar.c = roundWon(bar.c / cum);
    if (bar.v != null) bar.v = roundWon(bar.v * cum);
  }
  return bars;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 */
export async function fetchPriceAdjustments(config, ticker) {
  const q =
    `price_adjustments?ticker=eq.${encodeURIComponent(ticker)}` +
    `&select=effective_date,ratio,type,source,note&order=effective_date.asc`;
  try {
    return await fetchSupabaseJson(config, q);
  } catch {
    return [];
  }
}

/**
 * Cache-bust token when adjustment rows change for a ticker.
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 */
export async function fetchPriceAdjustmentsSignature(config, ticker) {
  const rows = await fetchPriceAdjustments(config, ticker);
  if (!rows.length) return 'adj-none';
  return (
    'adj-' +
    rows
      .map((r) => `${String(r.effective_date).slice(0, 10)}x${r.ratio}`)
      .join('_')
  );
}

/**
 * @param {object[]} rows price_adjustments rows
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 */
export async function upsertPriceAdjustments(rows, supabaseUrl, serviceKey) {
  if (!rows?.length) return { ok: true, upserted: 0 };
  const payload = rows.map((r) => ({
    ticker: String(r.ticker).padStart(6, '0').slice(-6),
    effective_date: String(r.effective_date).slice(0, 10),
    ratio: Number(r.ratio),
    type: r.type,
    source: r.source,
    note: r.note || null,
  }));
  const res = await fetch(`${supabaseUrl}/rest/v1/price_adjustments`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,on_conflict=ticker,effective_date,return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true, upserted: payload.length };
  const body = await res.text().catch(() => '');
  return { ok: false, status: res.status, body };
}
