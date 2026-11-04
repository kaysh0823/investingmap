/** A regular-market price and its daily base must travel as one dated pair.
 * The base can differ from yesterday's raw close on a corporate-action day.
 * Never reconstruct it from a percentage or mix independently merged feeds.
 */
import { kstDateParts, kstYmd } from './krx_session.mjs';

export const REGULAR_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

function positive(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function regularQuotePair(row, anchorDd, now = new Date(), { maxAgeMs = REGULAR_QUOTE_MAX_AGE_MS } = {}) {
  if (row?.regularSession !== true) return null;
  const last = positive(row.last);
  const prevClose = positive(row.prevClose);
  const asOf = row.asOf;
  // Require an explicit timezone; timezone-less timestamps depend on the host.
  if (last == null || prevClose == null || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(String(asOf || ''))) return null;
  const at = new Date(asOf);
  const ms = at.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs) || ms > nowMs || nowMs - ms > maxAgeMs) return null;
  const dd = String(anchorDd || '').replace(/-/g, '');
  if (!/^\d{8}$/.test(dd) || kstYmd(at) !== dd) return null;
  const declaredDd = String(row.tradeDd || row.tradeDate || '').replace(/-/g, '');
  if (declaredDd && declaredDd !== dd) return null;
  const p = kstDateParts(at);
  const minutes = p.hour * 60 + p.minute;
  if (minutes < 9 * 60 || minutes > 15 * 60 + 30) return null;
  if (minutes === 15 * 60 + 30 && (at.getUTCSeconds() !== 0 || at.getUTCMilliseconds() !== 0)) return null;
  return { last, prevClose, asOf: at.toISOString(), tradeDate: dd, regularSession: true };
}

export function naverRegularQuotePair(quote, anchorDd, now = new Date(), opts) {
  if (quote?.overMarket || ['preMarket', 'afterMarket'].includes(quote?.marketSessionType)) return null;
  const pair = quote?.regularQuote;
  if (pair?.source !== 'naver-basic' || positive(quote?.last) !== positive(pair?.last)) return null;
  return regularQuotePair(pair, anchorDd, now, opts);
}
