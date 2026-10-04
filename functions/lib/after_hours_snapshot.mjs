/**
 * KRX after-hours single-price snapshot (시간외 단일가, 16:00–18:00) for the
 * "시간외" hint next to the official regular close on map tables.
 *
 * Built by the post_close sync from Naver /basic (afterMarket closePrice =
 * Naver's KRX tab). Display only: never a numerator for 1D / period / sector
 * returns, which stay on the KRX regular close.
 */
import { isKrxHolidayYmd } from './session_price_policy.mjs';

function isTradingDayDash(dash) {
  const d = new Date(`${dash}T12:00:00+09:00`);
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !isKrxHolidayYmd(dash);
}

/** Next KRX trading day after tradeDateDash, as YYYY-MM-DD. */
export function nextTradingDayDash(tradeDateDash) {
  const d = new Date(`${tradeDateDash}T12:00:00+09:00`);
  for (let i = 0; i < 20; i += 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dash = d.toISOString().slice(0, 10);
    if (isTradingDayDash(dash)) return dash;
  }
  return null;
}

/**
 * @param {Record<string, { afterHoursPrice?: number|null, afterHoursChgPct?: number|null, basicTradeDate?: string|null }>} quotes
 * @param {string} tradeDateDash KST session date (YYYY-MM-DD)
 * @param {Date} [now]
 */
export function buildAfterHoursSnapshot(quotes, tradeDateDash, now = new Date()) {
  const items = {};
  for (const [ticker, q] of Object.entries(quotes || {})) {
    const price = Number(q?.afterHoursPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (q?.basicTradeDate && q.basicTradeDate !== tradeDateDash) continue;
    const chg = Number(q?.afterHoursChgPct);
    items[ticker] = { p: price, c: Number.isFinite(chg) ? chg : null };
  }
  const next = nextTradingDayDash(tradeDateDash);
  return {
    tradeDate: tradeDateDash,
    builtAt: now.toISOString(),
    source: 'naver-basic-afterMarket',
    // Shown from the regular close until the next session opens.
    validFrom: `${tradeDateDash}T15:30:00+09:00`,
    validUntil: next ? `${next}T09:00:00+09:00` : null,
    items,
  };
}
