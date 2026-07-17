/** KRX regular session: Mon–Fri 09:00–15:30 Asia/Seoul (no holiday calendar). */

const KST_TZ = 'Asia/Seoul';
const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const SESSION_OPEN = 9 * 60;
export const SESSION_CLOSE = 15 * 60 + 30;

/**
 * @param {Date} [now]
 * @returns {{ year: number, month: number, day: number, weekday: number, hour: number, minute: number }}
 */
export function kstDateParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: KST_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const weekdayStr = get('weekday');
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    weekday: WEEKDAY_MAP[weekdayStr] ?? 0,
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
  };
}

/** @param {Date} [now] @returns {string} YYYYMMDD in KST */
export function kstYmd(now = new Date()) {
  const p = kstDateParts(now);
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
  return `${p.year}${m}${d}`;
}

/** @param {Date} [now] @returns {string} YYYY-MM-DD in KST */
export function kstYmdDash(now = new Date()) {
  const p = kstDateParts(now);
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
  return `${p.year}-${m}-${d}`;
}

/** @param {Date} [now] @returns {number} 0=Sun … 6=Sat in KST */
export function kstWeekday(now = new Date()) {
  return kstDateParts(now).weekday;
}

/**
 * UI / live-return anchor: KST calendar today on weekdays, else latest weekday.
 * (Public holidays without a calendar still resolve via KRX lag + live quotes.)
 * @param {Date} [now]
 * @returns {string} YYYYMMDD
 */
export function kstAnchorYmd(now = new Date()) {
  const p = kstDateParts(now);
  if (p.weekday >= 1 && p.weekday <= 5) return kstYmd(now);
  for (let i = 1; i <= 7; i++) {
    const dt = new Date(now.getTime() - i * 86400000);
    const wd = kstDateParts(dt).weekday;
    if (wd >= 1 && wd <= 5) return kstYmd(dt);
  }
  return kstYmd(now);
}

/** @param {string} ymd YYYYMMDD */
export function ymdToDash(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * @param {Date} [now]
 * @returns {{ regular: boolean, kst: { weekday: number, minutes: number, iso: string } }}
 */
export function krxSessionInfo(now = new Date()) {
  const p = kstDateParts(now);
  const minutes = p.hour * 60 + p.minute;
  const regular =
    p.weekday >= 1 &&
    p.weekday <= 5 &&
    minutes >= SESSION_OPEN &&
    minutes <= SESSION_CLOSE;
  return {
    regular,
    kst: {
      weekday: p.weekday,
      minutes,
      iso: now.toISOString(),
    },
  };
}

export function isKrxRegularSession(now) {
  return krxSessionInfo(now).regular;
}

/**
 * Pure wall-clock session check: KST weekday within 09:00–15:30, ignoring the
 * holiday calendar. Used where Naver's own trade marker is the source of truth
 * for holiday detection (so the calendar can never go stale).
 * @param {Date} [now]
 */
export function isKrxClockRegularSession(now = new Date()) {
  const p = kstDateParts(now);
  const minutes = p.hour * 60 + p.minute;
  return p.weekday >= 1 && p.weekday <= 5 && minutes >= SESSION_OPEN && minutes <= SESSION_CLOSE;
}

/** Regular session: refresh Naver quotes (incl. mcap) every 5 min. */
export const NAVER_REFRESH_MS_REGULAR = 5 * 60 * 1000;
/** Off-hours / weekends: still refresh, but less often. */
export const NAVER_REFRESH_MS_OFF = 30 * 60 * 1000;
/** @deprecated use naverRefreshMs() */
export const NAVER_REFRESH_MS = NAVER_REFRESH_MS_REGULAR;

export function naverRefreshMs(now = new Date()) {
  return isKrxRegularSession(now) ? NAVER_REFRESH_MS_REGULAR : NAVER_REFRESH_MS_OFF;
}
