/**
 * KRX OPEN API — 1-year return (yoyReturnPct) for quote items.
 */

import { emptyQuote } from './naver_sise_quotes.mjs';

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
const HIST_DAYS_PER_REQUEST = 4;

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

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function tradingDates(count) {
  const out = [];
  const now = new Date();
  for (let i = 0; out.length < count && i < HIST_CALENDAR_SCAN; i++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push(formatYmd(dt));
  }
  return out;
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
