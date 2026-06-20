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

export const NAVER_REFRESH_MS = 60 * 60 * 1000;
