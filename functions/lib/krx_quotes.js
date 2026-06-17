/**
 * KRX Data Marketplace OPEN API — batch quotes for map tables.
 * Env (Pages Variables / Secrets): KRX_AUTH_KEY (or AUTH_KEY, KRX_OPEN_API_KEY)
 *
 * Subscriptions required at openapi.krx.co.kr:
 * - 유가증권 일별매매정보 (stk_bydd_trd)
 * - 코스닥 일별매매정보 (ksq_bydd_trd)
 */

const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const KOSPI_DAILY = '/sto/stk_bydd_trd';
const KOSDAQ_DAILY = '/sto/ksq_bydd_trd';

const LATEST_CACHE_MS = 45_000;
const HIST_CACHE_MS = 6 * 60 * 60 * 1000;
const HIST_TRADING_DAYS = 252;
const HIST_CALENDAR_SCAN = 400;
const HIST_DAYS_PER_REQUEST = 8;

/** @type {{ t: number, basDd: string, rows: Map<string, object> } | null} */
let latestCache = null;
/** @type {{ t: number, basDd: string, stats: Map<string, { high52w: number|null, low52w: number|null, yoyReturnPct: number|null }> } | null} */
let histCache = null;
/** @type {{ basDd: string, dates: string[], cursor: number, acc: Map<string, { highs: number[], lows: number[], closes: number[] }> } | null} */
let histWarm = null;

export function getAuthKey(env) {
  const raw = env.KRX_AUTH_KEY || env.AUTH_KEY || env.KRX_OPEN_API_KEY || '';
  return String(raw).trim();
}

export function normalizeTicker(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim().toUpperCase();
  if (/^[0-9A-Z]{6}$/.test(s)) return s;
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (alnum.length > 6) return alnum.slice(0, 6);
  if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
  if (alnum.length === 6) return alnum;
  return null;
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

/** Recent business days (local calendar, skips Sat/Sun). */
export function businessDates(maxCal = 20) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < maxCal && out.length < maxCal; i++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push(formatYmd(dt));
  }
  return out;
}

/** ~N trading days walking back the calendar. */
export function tradingDates(count) {
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
  const headers = {
    AUTH_KEY: authKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ basDd }),
  });
  if (!res.ok) {
    res = await fetch(`${url}?basDd=${encodeURIComponent(basDd)}`, {
      method: 'GET',
      headers: { AUTH_KEY: authKey, Accept: 'application/json' },
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KRX ${res.status} ${endpoint} ${basDd} ${text.slice(0, 120)}`);
  }
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
    if (!code) continue;
    byCode.set(code, row);
  }
  return byCode;
}

async function resolveLatestBasDd(authKey) {
  for (const basDd of businessDates(15)) {
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (byCode.size > 0) return { basDd, byCode };
    } catch {
      /* try older date */
    }
  }
  throw new Error('KRX: no trading data for recent dates');
}

async function getLatestSnapshot(authKey) {
  const now = Date.now();
  if (latestCache && now - latestCache.t < LATEST_CACHE_MS) {
    return latestCache;
  }
  const { basDd, byCode } = await resolveLatestBasDd(authKey);
  latestCache = { t: now, basDd, rows: byCode };
  return latestCache;
}

function mergeDayIntoAcc(acc, byCode) {
  for (const [code, row] of byCode) {
    const hi = parseNum(row.TDD_HGPRC);
    const lo = parseNum(row.TDD_LWPRC);
    const cl = parseNum(row.TDD_CLSPRC);
    if (hi == null && lo == null && cl == null) continue;
    let slot = acc.get(code);
    if (!slot) {
      slot = { highs: [], lows: [], closes: [] };
      acc.set(code, slot);
    }
    if (hi != null) slot.highs.push(hi);
    if (lo != null) slot.lows.push(lo);
    if (cl != null) slot.closes.push(cl);
  }
}

function accToStats(acc) {
  /** @type {Map<string, { high52w: number|null, low52w: number|null, yoyReturnPct: number|null }>} */
  const stats = new Map();
  for (const [code, slot] of acc) {
    const high52w = slot.highs.length ? Math.max(...slot.highs) : null;
    const low52w = slot.lows.length ? Math.min(...slot.lows) : null;
    let yoyReturnPct = null;
    if (slot.closes.length >= 2) {
      const last = slot.closes[0];
      const idx = Math.min(HIST_TRADING_DAYS - 1, slot.closes.length - 1);
      const prev = slot.closes[idx];
      if (last != null && prev != null && prev !== 0) {
        yoyReturnPct = ((last / prev - 1) * 100);
      }
    }
    stats.set(code, { high52w, low52w, yoyReturnPct });
  }
  return stats;
}

async function warmHistory(authKey, latestBasDd) {
  const now = Date.now();
  if (histCache && now - histCache.t < HIST_CACHE_MS && histCache.basDd === latestBasDd) {
    return histCache.stats;
  }

  if (!histWarm || histWarm.basDd !== latestBasDd) {
    histWarm = {
      basDd: latestBasDd,
      dates: tradingDates(HIST_TRADING_DAYS),
      cursor: 0,
      acc: new Map(),
    };
  }

  const end = Math.min(histWarm.cursor + HIST_DAYS_PER_REQUEST, histWarm.dates.length);
  const batch = histWarm.dates.slice(histWarm.cursor, end);
  histWarm.cursor = end;

  const concurrency = 2;
  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency);
    const maps = await Promise.all(
      slice.map(async (basDd) => {
        try {
          return await fetchMarketDay(authKey, basDd);
        } catch {
          return new Map();
        }
      }),
    );
    for (const byCode of maps) {
      mergeDayIntoAcc(histWarm.acc, byCode);
    }
  }

  const stats = accToStats(histWarm.acc);

  if (histWarm.cursor >= histWarm.dates.length) {
    histCache = { t: now, basDd: latestBasDd, stats };
    histWarm = null;
  }

  return stats;
}

export async function buildQuotes(authKey, codes) {
  const latest = await getLatestSnapshot(authKey);
  let histStats;
  try {
    histStats = await warmHistory(authKey, latest.basDd);
  } catch {
    histStats = new Map();
  }

  const items = {};
  for (const code of codes) {
    const row = latest.rows.get(code);
    const hist = histStats.get(code);
    const last = row ? parseNum(row.TDD_CLSPRC) : null;
    items[code] = {
      last,
      high52w: hist && hist.high52w != null ? hist.high52w : null,
      low52w: hist && hist.low52w != null ? hist.low52w : null,
      yoyReturnPct: hist && hist.yoyReturnPct != null ? hist.yoyReturnPct : null,
      basDd: latest.basDd,
    };
  }

  return {
    asOf: new Date().toISOString(),
    basDd: latest.basDd,
    source: 'krx-open-api',
    items,
  };
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function handleQuotesRequest(request, env) {
  const ch = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: ch });
  }

  const authKey = getAuthKey(env);
  if (!authKey) {
    return new Response(JSON.stringify({ error: 'KRX_AUTH_KEY not configured' }), {
      status: 503,
      headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const url = new URL(request.url);
  const codesRaw = url.searchParams.get('codes') || '';
  const codes = [...new Set(codesRaw.split(/[, ]+/).map(normalizeTicker).filter(Boolean))];
  if (!codes.length) {
    return new Response(JSON.stringify({ asOf: new Date().toISOString(), items: {}, source: 'krx-open-api' }), {
      headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const payload = await buildQuotes(authKey, codes);
    return new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'krx_fetch_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        items: {},
      }),
      {
        status: 502,
        headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
}
