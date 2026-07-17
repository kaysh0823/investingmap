/** KRX regular session: Mon–Fri 09:00–15:30 Asia/Seoul, excluding KRX_HOLIDAYS. */

const KST_TZ = 'Asia/Seoul';
const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const SESSION_OPEN = 9 * 60;
export const SESSION_CLOSE = 15 * 60 + 30;

/**
 * KRX 휴장일 캘린더 (KST, YYYY-MM-DD).
 *
 * ⚠️ 연도별 유지보수 필요: 매년 말 KRX가 다음 해 휴장일을 고시하면 아래 목록을 갱신할 것.
 * 임시공휴일(선거일 등)은 수시로 지정될 수 있으므로 뉴스 확인 후 즉시 추가.
 * 공식 안내: https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp
 * (KRX 정보데이터시스템 > 휴장/폐장 안내)
 *
 * 주말(토·일)은 코드에서 별도로 걸러지므로 여기 포함 여부는 동작에 영향 없음.
 * 다만 아래에는 확인 편의를 위해 주말과 겹치는 공휴일도 일부 포함되어 있음.
 */
export const KRX_HOLIDAYS = [
  // ── 2026년 ──
  '2026-01-01', // 신정
  '2026-02-16', // 설연휴
  '2026-02-17', // 설날
  '2026-02-18', // 설연휴
  '2026-03-02', // 삼일절 대체공휴일 (3/1 일요일)
  '2026-05-01', // 근로자의 날 (증시 휴장)
  '2026-05-05', // 어린이날
  '2026-05-25', // 석가탄신일 대체공휴일 (5/24 일요일)
  '2026-06-03', // 전국동시지방선거
  '2026-06-06', // 현충일 (토요일)
  '2026-07-17', // 제헌절 (임시공휴일 / 법정공휴일 복원)
  '2026-08-15', // 광복절 (토요일)
  '2026-08-17', // 광복절 대체공휴일
  '2026-09-24', // 추석연휴
  '2026-09-25', // 추석
  '2026-09-26', // 추석연휴 (토요일)
  '2026-10-03', // 개천절 (토요일)
  '2026-10-05', // 개천절 대체공휴일
  '2026-10-09', // 한글날
  '2026-12-25', // 성탄절
  '2026-12-31', // 연말 휴장일
  // ── 2027년 ──
  '2027-01-01', // 신정
  '2027-02-06', // 설연휴 (토요일)
  '2027-02-07', // 설날 (일요일)
  '2027-02-08', // 설연휴
  '2027-02-09', // 설날 대체공휴일 (주말 겹침)
  '2027-03-01', // 삼일절
  '2027-05-01', // 근로자의 날 (토요일)
  '2027-05-03', // 근로자의 날 대체공휴일
  '2027-05-05', // 어린이날
  '2027-05-13', // 석가탄신일
  '2027-06-06', // 현충일 (일요일)
  '2027-07-17', // 제헌절 (토요일)
  '2027-07-19', // 제헌절 대체공휴일
  '2027-08-15', // 광복절 (일요일)
  '2027-08-16', // 광복절 대체공휴일
  '2027-09-14', // 추석연휴
  '2027-09-15', // 추석
  '2027-09-16', // 추석연휴
  '2027-10-03', // 개천절 (일요일)
  '2027-10-04', // 개천절 대체공휴일
  '2027-10-09', // 한글날 (토요일)
  '2027-10-11', // 한글날 대체공휴일
  '2027-12-25', // 성탄절 (토요일)
  '2027-12-27', // 성탄절 대체공휴일
  '2027-12-31', // 연말 휴장일
];

const KRX_HOLIDAY_SET = new Set(KRX_HOLIDAYS);

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
 * @param {Date|string} [dateOrYmdDash] Date object or 'YYYY-MM-DD' KST string
 * @returns {boolean} true if the KST date is a KRX holiday
 */
export function isKrxHoliday(dateOrYmdDash = new Date()) {
  const ymdDash =
    typeof dateOrYmdDash === 'string' ? dateOrYmdDash : kstYmdDash(dateOrYmdDash);
  return KRX_HOLIDAY_SET.has(ymdDash);
}

/**
 * @param {Date} [now]
 * @returns {boolean} true if KST date is a weekday and not a KRX holiday
 */
export function isKrxTradingDay(now = new Date()) {
  const wd = kstWeekday(now);
  if (wd < 1 || wd > 5) return false;
  return !isKrxHoliday(now);
}

/**
 * UI / live-return anchor: latest KRX trading day on or before `now` (skips weekends + holidays).
 * @param {Date} [now]
 * @returns {string} YYYYMMDD
 */
export function kstAnchorYmd(now = new Date()) {
  for (let i = 0; i <= 14; i++) {
    const dt = new Date(now.getTime() - i * 86400000);
    if (isKrxTradingDay(dt)) return kstYmd(dt);
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
 * @returns {{ regular: boolean, holiday: boolean, kst: { weekday: number, minutes: number, iso: string } }}
 */
export function krxSessionInfo(now = new Date()) {
  const p = kstDateParts(now);
  const minutes = p.hour * 60 + p.minute;
  const holiday = isKrxHoliday(now);
  const regular =
    !holiday &&
    p.weekday >= 1 &&
    p.weekday <= 5 &&
    minutes >= SESSION_OPEN &&
    minutes <= SESSION_CLOSE;
  return {
    regular,
    holiday,
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

/** Regular session: refresh Naver quotes (incl. mcap) every 5 min. */
export const NAVER_REFRESH_MS_REGULAR = 5 * 60 * 1000;
/** Off-hours / weekends: still refresh, but less often. */
export const NAVER_REFRESH_MS_OFF = 30 * 60 * 1000;
/** @deprecated use naverRefreshMs() */
export const NAVER_REFRESH_MS = NAVER_REFRESH_MS_REGULAR;

export function naverRefreshMs(now = new Date()) {
  return isKrxRegularSession(now) ? NAVER_REFRESH_MS_REGULAR : NAVER_REFRESH_MS_OFF;
}
