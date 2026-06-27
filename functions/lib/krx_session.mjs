/** KRX regular session: Mon–Fri 09:00–15:30 Asia/Seoul (no holiday calendar). */

const SESSION_OPEN = 9 * 60;
const SESSION_CLOSE = 15 * 60 + 30;

/**
 * @param {Date} [now]
 * @returns {{ regular: boolean, kst: { weekday: number, minutes: number, iso: string } }}
 */
export function krxSessionInfo(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[weekdayStr] ?? 0;
  const minutes = hour * 60 + minute;
  const regular =
    weekday >= 1 &&
    weekday <= 5 &&
    minutes >= SESSION_OPEN &&
    minutes < SESSION_CLOSE;
  return {
    regular,
    kst: {
      weekday,
      minutes,
      iso: now.toISOString(),
    },
  };
}

export function isKrxRegularSession(now) {
  return krxSessionInfo(now).regular;
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
