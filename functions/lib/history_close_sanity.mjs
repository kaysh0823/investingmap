/**
 * T+0 history upsert guard: reject closes that jump >±35% vs prior session
 * without a price_adjustments event. Abort the run if rejects exceed 1%.
 *
 * Not checked: prior row with volume 0 (halt → resumption / re-listing resets
 * the base price). Prior row N sessions old (gap in history): limit compounds
 * to (1+limit)^N - 1, since the KRX daily band applies per session.
 */
import { normalizeKrxCode } from './krx_code.mjs';
import { normalizeTicker } from './hub_dashboard_core.mjs';

export const CLOSE_JUMP_REJECT = 0.35;
export const CLOSE_JUMP_ABORT_PCT = 0.01;
const SESSION_ANCHOR_TICKER = '005930';

function codeOf(ticker) {
  return normalizeKrxCode(ticker) || normalizeTicker(ticker) || String(ticker || '');
}

/**
 * @param {Array<{ ticker: string, close: number, trade_date?: string }>} rows
 * @param {{
 *   prevCloseByTicker: Map<string, number>,
 *   prevMetaByTicker?: Map<string, { volume: number|null, gapSessions: number }>,
 *   adjustmentTickers?: Set<string>,
 *   jumpLimit?: number,
 *   abortPct?: number,
 *   label?: string,
 * }} opts
 * @returns {{ accepted: typeof rows, rejected: Array<object> }}
 */
export function filterRowsByCloseJumpSanity(rows, opts) {
  const prevCloseByTicker = opts?.prevCloseByTicker || new Map();
  const prevMetaByTicker = opts?.prevMetaByTicker || prevCloseByTicker.meta || new Map();
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
    const meta = prevMetaByTicker.get(ticker);
    if (meta && meta.volume === 0) {
      accepted.push(row);
      continue;
    }
    const gap = Math.max(1, Number(meta?.gapSessions) || 1);
    const limit = Math.pow(1 + jumpLimit, gap) - 1;
    const jump = Math.abs(close / prev - 1);
    if (jump > limit && !adjustmentTickers.has(ticker)) {
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
        + `(limit ±${(limit * 100).toFixed(0)}%${gap > 1 ? ` over ${gap} sessions` : ''}, no price_adjustment)`,
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
 * The returned Map also carries `.meta`: ticker → { volume, gapSessions },
 * where gapSessions counts sessions (seen across all tickers) from the
 * ticker's prior row up to the target date.
 * @returns {Promise<Map<string, number> & { meta: Map<string, { volume: number|null, gapSessions: number }> }>}
 */
export async function fetchPrevClosesForDate(
  supabaseUrl,
  serviceKey,
  tradeDateDash,
  tickers,
) {
  const out = new Map();
  out.meta = new Map();
  const prevDateByTicker = new Map();
  const sessionDates = new Set();
  const codes = [...new Set((tickers || []).map(codeOf).filter(Boolean))];
  if (!codes.length || !tradeDateDash) return out;

  // Latest trade_date strictly before target.
  const CHUNK = 80;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const part = codes.slice(i, i + CHUNK);
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?ticker=in.(${part.join(',')})`
      + `&trade_date=lt.${encodeURIComponent(tradeDateDash)}`
      + `&select=ticker,trade_date,close,volume&order=trade_date.desc`;
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
      if (row.trade_date) sessionDates.add(row.trade_date);
      const t = codeOf(row.ticker);
      if (!t || out.has(t)) continue;
      const c = Number(row.close);
      if (Number.isFinite(c) && c > 0) {
        out.set(t, c);
        const v = row.volume == null ? null : Number(row.volume);
        out.meta.set(t, { volume: Number.isFinite(v) ? v : null, gapSessions: 1 });
        prevDateByTicker.set(t, row.trade_date);
      }
    }
  }
  // Sessions in a chunk can be missing for all of its tickers (partial-day
  // history), so also take the calendar from an always-covered anchor.
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stock_price_history?ticker=eq.${SESSION_ANCHOR_TICKER}`
      + `&trade_date=lt.${encodeURIComponent(tradeDateDash)}`
      + `&select=trade_date&order=trade_date.desc&limit=60`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (res.ok) {
      for (const row of (await res.json()) || []) {
        if (row.trade_date) sessionDates.add(row.trade_date);
      }
    }
  } catch {
    /* chunk dates only */
  }
  const dates = [...sessionDates];
  for (const [t, meta] of out.meta) {
    const d = prevDateByTicker.get(t);
    if (d) meta.gapSessions = 1 + dates.filter((x) => x > d).length;
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
