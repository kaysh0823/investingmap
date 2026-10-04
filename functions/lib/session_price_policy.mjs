/**
 * Display price and 1D numerator.
 *
 * Live (trading day 09:00 ≤ t < 15:30): Naver regular-session price.
 * After 15:30 until the KRX close row exists: last pre-15:30 price, provisional.
 * Otherwise: KRX regular close (today's history row, else refs tip).
 * 1D denominator is always a KRX regular close. NXT / aftermarket last is never used.
 *
 * Naver /basic has no separate regular-close field once marketSessionType is
 * preMarket or afterMarket — closePrice is the integrated price. See
 * parseNaverBasicQuote.
 */

import { kstDateParts, kstYmd, kstYmdDash } from './krx_session.mjs';

const LIVE_OPEN = 9 * 60;
const LIVE_CLOSE = 15 * 60 + 30;

/** Mirror of js/return_live.js KRX_HOLIDAYS. */
const KRX_HOLIDAYS = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-25',
  '2026-06-03', '2026-06-06', '2026-07-17', '2026-08-15',
  '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
  '2026-12-31',
  '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08',
  '2027-02-09', '2027-03-01', '2027-05-01', '2027-05-03',
  '2027-05-05', '2027-05-13', '2027-06-06', '2027-07-17',
  '2027-07-19', '2027-08-15', '2027-08-16', '2027-09-14',
  '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04',
  '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
  '2027-12-31',
]);

export function isKrxHolidayYmd(dashOrCompact) {
  const s = String(dashOrCompact || '').replace(/-/g, '');
  if (!/^\d{8}$/.test(s)) return false;
  const dash = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return KRX_HOLIDAYS.has(dash);
}

/**
 * @param {Date} [now]
 * @returns {'live'|'afterClose'|'official'}
 */
export function pricePhase(now = new Date()) {
  const p = kstDateParts(now);
  const minutes = p.hour * 60 + p.minute;
  const weekend = p.weekday === 0 || p.weekday === 6;
  if (weekend || isKrxHolidayYmd(kstYmdDash(now))) return 'official';
  if (minutes >= LIVE_OPEN && minutes < LIVE_CLOSE) return 'live';
  if (minutes >= LIVE_CLOSE) return 'afterClose';
  return 'official';
}

function numPos(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Last regular-auction print still safe to show before the KRX close row lands.
 * A quote stamped at or after 15:30 is not trusted — that is when NXT can print.
 * @param {{ last?: number|null, asOf?: string|null, tradeDd?: string, regularSession?: boolean|null }} row
 * @param {string} todayDd YYYYMMDD
 */
export function trustedRegularLast(row, todayDd) {
  const last = numPos(row?.last);
  if (last == null || !todayDd) return null;
  const tradeDd = String(row?.tradeDd || '').replace(/-/g, '');
  if (tradeDd && tradeDd !== todayDd) return null;
  if (row?.regularSession === true) return last;
  if (!row?.asOf) return null;
  const asOf = new Date(row.asOf);
  if (!Number.isFinite(asOf.getTime())) return null;
  if (kstYmd(asOf) !== todayDd) return null;
  const p = kstDateParts(asOf);
  const minutes = p.hour * 60 + p.minute;
  if (minutes < LIVE_CLOSE) return last;
  return null;
}

/**
 * @param {{
 *   phase: 'live'|'afterClose'|'official',
 *   krxClose?: number|null,
 *   refsTipClose?: number|null,
 *   refsPrevClose?: number|null,
 *   naverKrxLast?: number|null,
 *   lastRegularLast?: number|null,
 * }} args
 */
export function resolveSessionQuote({
  phase,
  krxClose = null,
  refsTipClose = null,
  refsPrevClose = null,
  naverKrxLast = null,
  lastRegularLast = null,
}) {
  const tip = numPos(refsTipClose);
  const prev = numPos(refsPrevClose);
  const krx = numPos(krxClose);
  if (phase === 'live') {
    const px = numPos(naverKrxLast);
    return {
      numeratorMode: 'live',
      provisional: false,
      displayLast: px ?? tip,
      numerator: px ?? tip,
      numerator1d: px,
      prevClose1d: tip,
    };
  }
  if (phase === 'afterClose') {
    if (krx != null) {
      return {
        numeratorMode: 'official',
        provisional: false,
        displayLast: krx,
        numerator: krx,
        numerator1d: krx,
        prevClose1d: tip,
      };
    }
    const px = numPos(lastRegularLast);
    return {
      numeratorMode: 'close',
      provisional: true,
      displayLast: px,
      numerator: px,
      numerator1d: px,
      prevClose1d: tip,
    };
  }
  const px = krx ?? tip;
  const prevClose1d = krx != null ? tip : prev;
  return {
    numeratorMode: 'official',
    provisional: false,
    displayLast: px,
    numerator: px,
    numerator1d: px,
    prevClose1d: prevClose1d,
  };
}
