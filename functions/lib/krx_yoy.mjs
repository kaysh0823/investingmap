/**
 * KRX OPEN API — 1-year return (yoyReturnPct) for quote items.
 */

import { emptyQuote } from './naver_sise_quotes.mjs';
import { krxSessionInfo, kstYmd, kstDateParts } from './krx_session.mjs';

const KRX_ENV_KEY_NAMES = [
  'KRX OPEN API 인증키',
  'KRX_AUTH_KEY',
  'KRX_API_KEY',
  'KRX_OPEN_API_KEY',
  'AUTH_KEY',
  'OPEN_API_KEY',
];

const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const KOSPI_DAILY = '/sto/stk_bydd_trd';
const KOSDAQ_DAILY = '/sto/ksq_bydd_trd';
const HIST_CACHE_MS = 6 * 60 * 60 * 1000;
const HIST_TRADING_DAYS = 252;
const HIST_CALENDAR_SCAN = 400;
const HIST_TRADING_DAYS_20D = 20;
const HIST_TRADING_DAYS_50D = 50;
const HIST_TRADING_DAYS_120D = 120;
const HIST_TRADING_DAYS_200D = 200;

let histCache = null;
let histWarm = null;

export function getAuthKey(env) {
  if (!env) return '';
  for (const k of KRX_ENV_KEY_NAMES) {
    const v = env[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  for (const k of Object.keys(env)) {
    if (/KRX/i.test(k) && (/AUTH|인증|KEY|API/i.test(k))) {
      const v = env[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function shortCodeFromRow(row) {
  const srt = row && row.ISU_SRT_CD;
  if (srt && /^\d{6}$/.test(String(srt).trim())) return String(srt).trim();
  const cd = row && row.ISU_CD;
  if (!cd) return null;
  const s = String(cd).trim();
  if (/^\d{6}$/.test(s)) return s;
  if (s.length >= 9 && s.startsWith('KR')) return s.substring(3, 9);
  return null;
}

function formatYmdFromParts(p) {
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
  return `${p.year}${m}${d}`;
}

/** Weekday calendar dates in KST (newest first); holidays resolved via KRX fetch fallback. */
function tradingDates(count, now = new Date()) {
  const out = [];
  for (let i = 0; out.length < count && i < HIST_CALENDAR_SCAN; i++) {
    const dt = new Date(now.getTime() - i * 86400000);
    const parts = kstDateParts(dt);
    if (parts.weekday === 0 || parts.weekday === 6) continue;
    out.push(formatYmdFromParts(parts));
  }
  return out;
}

/**
 * Recent-close candidates: skip today's basDd before KRX session close (15:30 KST).
 * @param {string[]} dates — tradingDates() list (newest first)
 * @param {Date} [now]
 */
function recentDateCandidates(dates, now = new Date()) {
  const today = kstYmd(now);
  const { kst } = krxSessionInfo(now);
  const beforeClose = kst.weekday >= 1 && kst.weekday <= 5 && kst.minutes < (15 * 60 + 30);
  const skipToday = beforeClose && dates[0] === today;
  return dates.slice(skipToday ? 1 : 0);
}

/**
 * Candidate basDd list for a past snapshot, anchored on the resolved recent trading day.
 * Weekends are skipped in `dates`; holidays are handled by KRX fetch fallback on the slice.
 * @param {string} anchorDd — resolved recent trading day (YYYYMMDD)
 * @param {string[]} dates — tradingDates() list (newest first)
 * @param {number} tradingDaysAgo — 1 = previous session, 21 = ~1 month, etc.
 * @param {number} [window]
 */
function pastDatesFromAnchor(anchorDd, dates, tradingDaysAgo, window = MCAP_FALLBACK_WINDOW) {
  if (!anchorDd || tradingDaysAgo < 1 || !dates.length) return [];
  const anchorIdx = dates.indexOf(anchorDd);
  if (anchorIdx < 0) {
    const before = dates.filter((d) => d < anchorDd);
    const idx = Math.min(tradingDaysAgo - 1, before.length - 1);
    if (idx < 0) return [];
    return before.slice(idx, idx + window);
  }
  const startIdx = anchorIdx + tradingDaysAgo;
  if (startIdx >= dates.length) return [];
  return dates.slice(startIdx, startIdx + window);
}

async function krxDaily(authKey, endpoint, basDd) {
  const url = `${KRX_BASE}${endpoint}`;
  const headers = { AUTH_KEY: authKey, Accept: 'application/json', 'Content-Type': 'application/json' };
  let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ basDd }) });
  if (!res.ok) {
    res = await fetch(`${url}?basDd=${encodeURIComponent(basDd)}`, {
      method: 'GET',
      headers: { AUTH_KEY: authKey, Accept: 'application/json' },
    });
  }
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.OutBlock_1) ? j.OutBlock_1 : [];
}

async function fetchMarketDay(authKey, basDd) {
  const [kospi, kosdaq] = await Promise.all([
    krxDaily(authKey, KOSPI_DAILY, basDd),
    krxDaily(authKey, KOSDAQ_DAILY, basDd),
  ]);
  const byCode = new Map();
  for (const row of [...kospi, ...kosdaq]) {
    const code = shortCodeFromRow(row);
    if (code) byCode.set(code, row);
  }
  return byCode;
}

function mcapFromRow(row) {
  const cl = parseNum(row.TDD_CLSPRC);
  const shrs = parseNum(row.LIST_SHRS);
  if (cl != null && shrs != null && cl > 0 && shrs > 0) return cl * shrs;
  const direct = parseNum(row.MKTCAP);
  if (direct != null && direct > 0) return direct;
  return null;
}

/**
 * Map one KRX daily row → stock_price_history fields (OHLC + volume + mcap).
 * @returns {{ open: number|null, high: number|null, low: number|null, close: number, volume: number|null, mcap_won: number|null }|null}
 */
export function historyFieldsFromKrxRow(row) {
  const close = parseNum(row && row.TDD_CLSPRC);
  if (close == null || close <= 0) return null;
  return {
    open: parseNum(row.TDD_OPNPRC),
    high: parseNum(row.TDD_HGPRC),
    low: parseNum(row.TDD_LWPRC),
    close,
    volume: parseNum(row.ACC_TRDVOL),
    mcap_won: mcapFromRow(row),
  };
}

function mcapMapFromMarketDay(byCode) {
  const out = new Map();
  for (const [code, row] of byCode) {
    const mcap = mcapFromRow(row);
    if (mcap != null && mcap > 0) out.set(code, mcap);
  }
  return out;
}

async function fetchMcapMapForDate(authKey, basDd) {
  const byCode = await fetchMarketDay(authKey, basDd);
  return mcapMapFromMarketDay(byCode);
}

const MCAP_FALLBACK_WINDOW = 5;

function orderMcapDates(dates, hintDd) {
  const ordered = [];
  if (hintDd) ordered.push(hintDd);
  for (const d of dates) {
    if (!ordered.includes(d)) ordered.push(d);
  }
  return ordered;
}

async function fetchMcapMapWithFallback(authKey, dates, minSize, hintDd, maxBasDd) {
  const min = minSize || 20;
  const slice = dates.slice(0, MCAP_FALLBACK_WINDOW);
  const safeHint = hintDd && (!maxBasDd || hintDd < maxBasDd) ? hintDd : null;
  for (const basDd of orderMcapDates(slice, safeHint)) {
    if (maxBasDd && basDd >= maxBasDd) continue;
    try {
      const mcap = await fetchMcapMapForDate(authKey, basDd);
      if (mcap.size >= min) return { mcap, basDd };
    } catch {
      /* try next date */
    }
  }
  return { mcap: new Map(), basDd: null };
}

const HORIZON_PAST_KEYS = {
  '1d': ['mcapPast1d', 'past1dDd', 1],
  '20d': ['mcapPast20d', 'past20dDd', HIST_TRADING_DAYS_20D],
  '50d': ['mcapPast50d', 'past50dDd', HIST_TRADING_DAYS_50D],
  '120d': ['mcapPast120d', 'past120dDd', HIST_TRADING_DAYS_120D],
  '200d': ['mcapPast200d', 'past200dDd', HIST_TRADING_DAYS_200D],
  // legacy API aliases → 200d lookback
  '1m': ['mcapPast20d', 'past20dDd', HIST_TRADING_DAYS_20D],
  '3m': ['mcapPast50d', 'past50dDd', HIST_TRADING_DAYS_50D],
  '6m': ['mcapPast120d', 'past120dDd', HIST_TRADING_DAYS_120D],
  '1y': ['mcapPast200d', 'past200dDd', HIST_TRADING_DAYS_200D],
  '250d': ['mcapPast200d', 'past200dDd', HIST_TRADING_DAYS_200D],
};

function emptyMcapSnapshots() {
  return {
    mcapNow: null,
    mcapPast1d: null,
    mcapPast20d: null,
    mcapPast50d: null,
    mcapPast120d: null,
    mcapPast200d: null,
    recentDd: null,
    past1dDd: null,
    past20dDd: null,
    past50dDd: null,
    past120dDd: null,
    past200dDd: null,
  };
}

function pastMapReady(snapshots, mcapKey) {
  return !!(snapshots && snapshots[mcapKey] && snapshots[mcapKey].size >= 20);
}

let mcapSnapshotsCache = null;
const MCAP_PAIR_CACHE_MS = 6 * 60 * 60 * 1000;

/**
 * Recent + requested past mcap maps (parallel KRX day fetches, cached 6h, merge partial fetches).
 * @param {string} authKey
 * @param {{ horizons?: string[] }} [opts] — default all: 1m, 3m, 6m, 1y
 */
export async function fetchHubSectorMcapSnapshots(authKey, opts = {}) {
  if (!authKey) return null;
  const allHorizons = ['1d', '20d', '50d', '120d', '200d'];
  const horizons = Array.isArray(opts.horizons) && opts.horizons.length
    ? opts.horizons
    : allHorizons;

  const now = Date.now();
  const dates = tradingDates(HIST_TRADING_DAYS);
  const expectedRecentDd = recentDateCandidates(dates)[0] || dates[0];

  let snapshots = emptyMcapSnapshots();
  if (mcapSnapshotsCache && now - mcapSnapshotsCache.t < MCAP_PAIR_CACHE_MS) {
    const cachedRecent = mcapSnapshotsCache.snapshots.recentDd;
    if (cachedRecent && expectedRecentDd && cachedRecent < expectedRecentDd) {
      mcapSnapshotsCache = null;
    } else {
      snapshots = { ...mcapSnapshotsCache.snapshots };
    }
  }

  if (!snapshots.mcapNow || snapshots.mcapNow.size < 20) {
    const recent = await fetchMcapMapWithFallback(
      authKey,
      recentDateCandidates(dates).slice(0, MCAP_FALLBACK_WINDOW),
      20,
      expectedRecentDd,
    );
    snapshots.mcapNow = recent.mcap;
    snapshots.recentDd = recent.basDd;
  }

  if (!snapshots.mcapNow || snapshots.mcapNow.size < 20) return null;

  const pastTasks = [];
  for (const h of horizons) {
    const def = HORIZON_PAST_KEYS[h];
    if (!def) continue;
    const [mcapKey, ddKey, tradingDaysAgo] = def;
    if (pastMapReady(snapshots, mcapKey)) continue;
    const pastDates = pastDatesFromAnchor(snapshots.recentDd, dates, tradingDaysAgo);
    if (!pastDates.length) continue;
    pastTasks.push({
      mcapKey,
      ddKey,
      dates: pastDates,
      hint: snapshots[ddKey],
    });
  }

  if (pastTasks.length) {
    const results = await Promise.all(
      pastTasks.map((t) => fetchMcapMapWithFallback(
        authKey,
        t.dates,
        20,
        t.hint,
        snapshots.recentDd,
      )),
    );
    for (let i = 0; i < pastTasks.length; i++) {
      const t = pastTasks[i];
      const past = results[i];
      if (past.basDd && past.basDd >= snapshots.recentDd) continue;
      snapshots[t.mcapKey] = past.mcap;
      snapshots[t.ddKey] = past.basDd;
    }
  }

  if (snapshots.mcapNow && snapshots.mcapNow.size >= 20) {
    mcapSnapshotsCache = { t: now, snapshots: { ...snapshots } };
  }
  return snapshots;
}

/** @deprecated use fetchHubSectorMcapSnapshots */
export async function fetchHubSectorMcapPair(authKey) {
  const s = await fetchHubSectorMcapSnapshots(authKey);
  if (!s) return null;
  return {
    mcapNow: s.mcapNow,
    mcapPast: s.mcapPast1y,
    recentDd: s.recentDd,
    pastDd: s.past1yDd,
  };
}

function mergeDayIntoAcc(acc, byCode) {
  for (const [code, row] of byCode) {
    const cl = parseNum(row.TDD_CLSPRC);
    if (cl == null) continue;
    let slot = acc.get(code);
    if (!slot) slot = { closes: [] };
    slot.closes.push(cl);
    acc.set(code, slot);
  }
}

function yoyFromAcc(acc, code) {
  const slot = acc.get(code);
  if (!slot || slot.closes.length < 2) return null;
  const last = slot.closes[0];
  const idx = Math.min(HIST_TRADING_DAYS - 1, slot.closes.length - 1);
  const prev = slot.closes[idx];
  if (last == null || prev == null || prev === 0) return null;
  return ((last / prev - 1) * 100);
}

async function warmYoy(authKey) {
  const now = Date.now();
  if (histCache && now - histCache.t < HIST_CACHE_MS) return histCache.acc;

  if (!histWarm) {
    histWarm = { dates: tradingDates(HIST_TRADING_DAYS), cursor: 0, acc: new Map() };
  }

  const end = Math.min(histWarm.cursor + HIST_DAYS_PER_REQUEST, histWarm.dates.length);
  const batch = histWarm.dates.slice(histWarm.cursor, end);
  histWarm.cursor = end;

  for (const basDd of batch) {
    try {
      mergeDayIntoAcc(histWarm.acc, await fetchMarketDay(authKey, basDd));
    } catch {
      /* skip day */
    }
  }

  if (histWarm.cursor >= histWarm.dates.length) {
    histCache = { t: now, acc: histWarm.acc };
    histWarm = null;
  }
  return histCache ? histCache.acc : histWarm.acc;
}

export async function warmYoyFull(authKey) {
  if (!authKey) return null;
  if (histCache && Date.now() - histCache.t < HIST_CACHE_MS) {
    return histCache.acc;
  }
  await warmYoy(authKey);
  while (histWarm) {
    await warmYoy(authKey);
  }
  return histCache ? histCache.acc : null;
}

export async function mergeKrxYoy(codes, items, authKey, warmHist) {
  if (!authKey || !warmHist) return items;
  try {
    const acc = await warmYoy(authKey);
    const out = { ...items };
    for (const code of codes) {
      const yoy = yoyFromAcc(acc, code);
      if (yoy != null) {
        out[code] = { ...(out[code] || emptyQuote()), yoyReturnPct: yoy };
      }
    }
    return out;
  } catch {
    return items;
  }
}

export async function mergeKrxYoyFull(codes, items, authKey) {
  if (!authKey) return items;
  try {
    const acc = await warmYoyFull(authKey);
    if (!acc) return items;
    const out = { ...items };
    for (const code of codes) {
      const yoy = yoyFromAcc(acc, code);
      if (yoy != null) {
        out[code] = { ...(out[code] || emptyQuote()), yoyReturnPct: yoy };
      }
    }
    return out;
  } catch {
    return items;
  }
}

/**
 * Warm KRX history in bounded batches (for hub_sectors without blocking full 252-day fetch).
 * @param {string} authKey
 * @param {number} [maxBatches]
 * @returns {Promise<Map|null>}
 */
export async function ensureKrxYoyAcc(authKey, maxBatches = 6) {
  if (!authKey) return null;
  if (histCache && Date.now() - histCache.t < HIST_CACHE_MS) {
    return histCache.acc;
  }
  let batches = 0;
  while (batches < maxBatches) {
    await warmYoy(authKey);
    batches += 1;
    if (histCache && !histWarm) return histCache.acc;
  }
  return histCache ? histCache.acc : (histWarm ? histWarm.acc : null);
}

export async function mergeKrxYoyHub(codes, authKey, maxBatches = 6) {
  if (!authKey) return {};
  try {
    const acc = await ensureKrxYoyAcc(authKey, maxBatches);
    if (!acc) return {};
    const out = {};
    for (const code of codes) {
      const yoy = yoyFromAcc(acc, code);
      if (yoy != null) {
        out[code] = { yoyReturnPct: yoy };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export { tradingDates, fetchMarketDay, pastDatesFromAnchor, recentDateCandidates };
