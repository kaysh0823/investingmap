/**
 * T+0 history upsert guard: reject closes that jump >±35% vs prior session
 * without a price_adjustments event. Abort the run if rejects exceed 1%.
 */
import { normalizeKrxCode } from './krx_code.mjs';
import { normalizeTicker } from './hub_dashboard_core.mjs';

export const CLOSE_JUMP_REJECT = 0.35;
export const CLOSE_JUMP_ABORT_PCT = 0.01;

function codeOf(ticker) {
  return normalizeKrxCode(ticker) || normalizeTicker(ticker) || String(ticker || '');
}

/**
 * @param {Array<{ ticker: string, close: number, trade_date?: string }>} rows
 * @param {{
 *   prevCloseByTicker: Map<string, number>,
 *   adjustmentTickers?: Set<string>,
 *   jumpLimit?: number,
 *   abortPct?: number,
 *   label?: string,
 * }} opts
 * @returns {{ accepted: typeof rows, rejected: Array<object> }}
 */
export function filterRowsByCloseJumpSanity(rows, opts) {
  const prevCloseByTicker = opts?.prevCloseByTicker || new Map();
  const adjustmentTickers = opts?.adjustmentTickers || new Set();
  const jumpLimit = opts?.jumpLimit ?? CLOSE_JUMP_REJECT;
  const abortPct = opts?.abortPct ?? CLOSE_JUMP_ABORT_PCT;
  const label = opts?.label || '';

  const accepted = [];
  const rejected = [];

  for (const row of rows || []) {
    const ticker = codeOf(row?.ticker);
    const close = Number(row?.close);
    if (!ticker || !Number.isFinite(close) || !(close > 0)) {
      accepted.push(row);
      continue;
    }
    const prev = Number(prevCloseByTicker.get(ticker));
    if (!Number.isFinite(prev) || !(prev > 0)) {
      accepted.push(row);
      continue;
    }
    const jump = Math.abs(close / prev - 1);
    if (jump > jumpLimit && !adjustmentTickers.has(ticker)) {
      rejected.push({
        ticker,
        close,
        prevClose: prev,
        jump,
        trade_date: row.trade_date || null,
      });
      console.warn(
        `[close-jump] reject ${ticker}${label ? ` ${label}` : ''}: `
        + `close=${close} prev=${prev} jump=${(jump * 100).toFixed(1)}% `
        + `(limit ±${(jumpLimit * 100).toFixed(0)}%, no price_adjustment)`,
      );
      continue;
    }
    accepted.push(row);
  }

  const total = (rows || []).length;
  const rate = total ? rejected.length / total : 0;
  if (rejected.length && rate > abortPct) {
    throw new Error(
      `close-jump sanity abort${label ? ` ${label}` : ''}: `
      + `rejected ${rejected.length}/${total} (${(rate * 100).toFixed(2)}%) `
      + `> ${(abortPct * 100).toFixed(0)}% — investigate padTicker/contamination before upsert`,
    );
  }
  if (rejected.length) {
    console.warn(
      `[close-jump] skipped ${rejected.length}/${total}`
      + `${label ? ` ${label}` : ''} (within abort budget)`,
    );
  }
  return { accepted, rejected };
}

/**
 * Fetch prior-session closes for tickers from stock_price_history.
 * @returns {Promise<Map<string, number>>}
 */
export async function fetchPrevClosesForDate(
  supabaseUrl,
  serviceKey,
  tradeDateDash,
  tickers,
) {
  const out = new Map();
  const codes = [...new Set((tickers || []).map(codeOf).filter(Boolean))];
  if (!codes.length || !tradeDateDash) return out;

  // Latest trade_date strictly before target.
  const CHUNK = 80;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const part = codes.slice(i, i + CHUNK);
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?ticker=in.(${part.join(',')})`
      + `&trade_date=lt.${encodeURIComponent(tradeDateDash)}`
      + `&select=ticker,trade_date,close&order=trade_date.desc`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(
        `prev-close fetch ${res.status}: ${(await res.text()).slice(0, 160)}`,
      );
    }
    const rows = await res.json();
    for (const row of rows || []) {
      const t = codeOf(row.ticker);
      if (!t || out.has(t)) continue;
      const c = Number(row.close);
      if (Number.isFinite(c) && c > 0) out.set(t, c);
    }
  }
  return out;
}

/**
 * Tickers with a price_adjustments event on effective_date = tradeDateDash.
 * @returns {Promise<Set<string>>}
 */
export async function fetchAdjustmentTickersForDate(
  supabaseUrl,
  serviceKey,
  tradeDateDash,
) {
  const out = new Set();
  if (!tradeDateDash) return out;
  const url =
    `${supabaseUrl}/rest/v1/price_adjustments`
    + `?effective_date=eq.${encodeURIComponent(tradeDateDash)}`
    + `&select=ticker`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    console.warn(
      `[close-jump] price_adjustments fetch failed ${res.status} — treating as none`,
    );
    return out;
  }
  const rows = await res.json();
  for (const row of rows || []) {
    const t = codeOf(row.ticker);
    if (t) out.add(t);
  }
  return out;
}
