/**
 * KRX Relative Strength: 20 / 50 / 120 trading-day return percentiles,
 * weighted mean (20d 0.5 / 50d 0.3 / 120d 0.2).
 * Universe: all KOSPI + KOSDAQ listings from KRX daily API.
 * Market indices (KOSPI/KOSDAQ composites) are ranked in the same return
 * pools for guide lines only — they never enter `quotes`.
 */

import { getAuthKey, fetchMarketDay, tradingDates, pastDatesFromAnchor, recentDateCandidates } from './krx_yoy.mjs';
import { kstYmdDash, kstAnchorYmd } from './krx_session.mjs';
import { fetchKrxMarketIndexDay } from './krx_index.mjs';
import { fetchNaverMarketIndexHistory } from './naver_index.mjs';

export { getAuthKey };

const RS_PERIODS = [
  { key: 'rs20', days: 20 },
  { key: 'rs50', days: 50 },
  { key: 'rs120', days: 120 },
];

export const RS_WEIGHTS = { rs20: 0.5, rs50: 0.3, rs120: 0.2 };

/** Synthetic codes used only inside percentile pools (never written to quotes). */
export const INDEX_RS_CODES = {
  KOSPI: '__KOSPI',
  KOSDAQ: '__KOSDAQ',
};

const RETURN_PERIODS = [
  { field: 'chg1dPct', days: 1 },
  { field: 'ret5dPct', days: 5 },
  { field: 'ret20dPct', days: 20 },
  { field: 'ret50dPct', days: 50 },
  { field: 'ret120dPct', days: 120 },
  { field: 'ret200dPct', days: 200 },
];

const DATE_FALLBACK_WINDOW = 12;

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function closeFromRow(row) {
  return parseNum(row && row.TDD_CLSPRC);
}

function mcapFromRow(row) {
  const cl = parseNum(row && row.TDD_CLSPRC);
  const shrs = parseNum(row && row.LIST_SHRS);
  if (cl != null && shrs != null && cl > 0 && shrs > 0) return cl * shrs;
  const direct = parseNum(row && row.MKTCAP);
  if (direct != null && direct > 0) return direct;
  return null;
}

async function fetchDayMapsWithFallback(authKey, dates, minSize, maxBasDd) {
  const min = minSize || 100;
  for (const basDd of dates) {
    if (maxBasDd && basDd >= maxBasDd) continue;
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      const closes = new Map();
      const mcaps = new Map();
      for (const [code, row] of byCode) {
        const cl = closeFromRow(row);
        if (cl != null && cl > 0) closes.set(code, cl);
        const mcap = mcapFromRow(row);
        if (mcap != null && mcap > 0) mcaps.set(code, mcap);
      }
      if (closes.size >= min) return { closes, mcaps, basDd };
    } catch {
      /* try next */
    }
  }
  return { closes: new Map(), mcaps: new Map(), basDd: null };
}

async function fetchCloseMapWithFallback(authKey, dates, minSize, maxBasDd) {
  const snap = await fetchDayMapsWithFallback(authKey, dates, minSize, maxBasDd);
  return { closes: snap.closes, basDd: snap.basDd };
}

function periodReturn(closeNow, closePast) {
  if (closeNow == null || closePast == null || closePast <= 0) return null;
  return ((closeNow / closePast) - 1) * 100;
}

/**
 * Headline KOSPI/KOSDAQ closes for one KRX basDd (YYYYMMDD).
 * Reuses the same OPEN API endpoints / AUTH_KEY as backfill_market_index.
 * @returns {Promise<{KOSPI: number|null, KOSDAQ: number|null}>}
 */
export async function fetchMarketIndexCloses(authKey, basDd) {
  if (!authKey || !basDd) return { KOSPI: null, KOSDAQ: null };
  try {
    const day = await fetchKrxMarketIndexDay(authKey, basDd);
    return {
      KOSPI: day?.KOSPI?.close != null && Number.isFinite(day.KOSPI.close) ? day.KOSPI.close : null,
      KOSDAQ: day?.KOSDAQ?.close != null && Number.isFinite(day.KOSDAQ.close) ? day.KOSDAQ.close : null,
    };
  } catch {
    return { KOSPI: null, KOSDAQ: null };
  }
}

function basDdToDash(basDd) {
  const s = String(basDd || '').replace(/-/g, '');
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * @param {string} authKey
 * @param {string[]} basDdList
 * @returns {Promise<Map<string, {KOSPI: number|null, KOSDAQ: number|null}>>}
 */
export async function fetchMarketIndexClosesByBasDd(authKey, basDdList) {
  const out = new Map();
  const unique = [...new Set((basDdList || []).filter(Boolean))];
  for (const basDd of unique) {
    out.set(basDd, await fetchMarketIndexCloses(authKey, basDd));
  }

  const missing = unique.some((basDd) => {
    const row = out.get(basDd) || {};
    return row.KOSPI == null || row.KOSDAQ == null;
  });
  if (!missing) return out;

  // Same fallback path as scripts/backfill_market_index.mjs when KRX index API is unauthorized.
  try {
    const histories = await Promise.all(
      ['KOSPI', 'KOSDAQ'].map(async (code) => [code, await fetchNaverMarketIndexHistory(code, 180)]),
    );
    const byCode = Object.fromEntries(
      histories.map(([code, rows]) => [code, new Map(rows.map((row) => [row.date, row.close]))]),
    );
    for (const basDd of unique) {
      const dash = basDdToDash(basDd);
      const cur = out.get(basDd) || { KOSPI: null, KOSDAQ: null };
      out.set(basDd, {
        KOSPI: cur.KOSPI != null ? cur.KOSPI : (dash ? byCode.KOSPI.get(dash) ?? null : null),
        KOSDAQ: cur.KOSDAQ != null ? cur.KOSDAQ : (dash ? byCode.KOSDAQ.get(dash) ?? null : null),
      });
    }
  } catch {
    /* keep whatever KRX returned */
  }
  return out;
}

function buildIndexRsEntry(name, ranksByPeriod, retsByPeriod) {
  const rs20 = ranksByPeriod.rs20?.get(INDEX_RS_CODES[name]);
  const rs50 = ranksByPeriod.rs50?.get(INDEX_RS_CODES[name]);
  const rs120 = ranksByPeriod.rs120?.get(INDEX_RS_CODES[name]);
  if (rs20 == null || rs50 == null || rs120 == null) return null;
  const rs =
    Math.round(
      (rs20 * RS_WEIGHTS.rs20 + rs50 * RS_WEIGHTS.rs50 + rs120 * RS_WEIGHTS.rs120) * 10,
    ) / 10;
  const ret20 = retsByPeriod.rs20;
  const ret50 = retsByPeriod.rs50;
  const ret120 = retsByPeriod.rs120;
  return {
    rs,
    rs20: Math.round(rs20 * 10) / 10,
    rs50: Math.round(rs50 * 10) / 10,
    rs120: Math.round(rs120 * 10) / 10,
    ret20: ret20 != null ? Math.round(ret20 * 100) / 100 : null,
    ret50: ret50 != null ? Math.round(ret50 * 100) / 100 : null,
    ret120: ret120 != null ? Math.round(ret120 * 100) / 100 : null,
  };
}

/** Percentile rank 0–100; higher return → higher RS. Ties share average rank. */
export function percentileRanks(items) {
  const valid = items.filter((x) => x.ret != null && Number.isFinite(x.ret));
  valid.sort((a, b) => a.ret - b.ret);
  const n = valid.length;
  const out = new Map();
  if (n === 0) return out;
  if (n === 1) {
    out.set(valid[0].code, 50);
    return out;
  }
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && valid[j].ret === valid[i].ret) j += 1;
    const avgRank = (i + j - 1) / 2;
    const pct = (avgRank / (n - 1)) * 100;
    for (let k = i; k < j; k++) out.set(valid[k].code, pct);
    i = j;
  }
  return out;
}

/**
 * @param {string} authKey
 * @returns {Promise<object|null>}
 */
export async function buildKrxRsSnapshot(authKey) {
  if (!authKey) return null;

  const dates = tradingDates(260);
  const recent = await fetchDayMapsWithFallback(
    authKey,
    recentDateCandidates(dates).slice(0, DATE_FALLBACK_WINDOW),
  );
  if (!recent.closes.size || !recent.basDd) return null;

  const past1dDates = pastDatesFromAnchor(recent.basDd, dates, 1, DATE_FALLBACK_WINDOW);
  const past1dSnap = await fetchDayMapsWithFallback(
    authKey,
    past1dDates,
    100,
    recent.basDd,
  );

  const pastMaps = {};
  const pastDds = {};
  for (const { key, days } of RS_PERIODS) {
    const pastDates = pastDatesFromAnchor(recent.basDd, dates, days - 1, DATE_FALLBACK_WINDOW);
    const snap = await fetchCloseMapWithFallback(
      authKey,
      pastDates,
      100,
      recent.basDd,
    );
    pastMaps[key] = snap.closes;
    pastDds[key] = snap.basDd;
  }

  const returnPastMaps = {};
  const returnPastDds = {};
  for (const { field, days } of RETURN_PERIODS) {
    const pastDates = pastDatesFromAnchor(recent.basDd, dates, days, DATE_FALLBACK_WINDOW);
    const snap = await fetchCloseMapWithFallback(
      authKey,
      pastDates,
      100,
      recent.basDd,
    );
    returnPastMaps[field] = snap.closes;
    returnPastDds[field] = snap.basDd;
  }

  const codes = new Set(recent.closes.keys());
  for (const map of Object.values(returnPastMaps)) {
    for (const code of map.keys()) codes.add(code);
  }

  const returnsByPeriod = {};
  for (const { key } of RS_PERIODS) {
    returnsByPeriod[key] = [];
  }

  for (const code of codes) {
    const now = recent.closes.get(code);
    if (now == null) continue;
    for (const { key } of RS_PERIODS) {
      const past = pastMaps[key].get(code);
      const ret = periodReturn(now, past);
      if (ret != null) returnsByPeriod[key].push({ code, ret });
    }
  }

  // Stock ranks first — index rows are added only for guide-line percentiles so
  // existing ticker `quotes` RS stay identical when index closes are present/absent.
  const ranksByPeriod = {};
  for (const { key } of RS_PERIODS) {
    ranksByPeriod[key] = percentileRanks(returnsByPeriod[key]);
  }

  const indexCloseByDd = await fetchMarketIndexClosesByBasDd(authKey, [
    recent.basDd,
    pastDds.rs20,
    pastDds.rs50,
    pastDds.rs120,
  ]);
  const indexCloseNow = indexCloseByDd.get(recent.basDd) || { KOSPI: null, KOSDAQ: null };
  const indexRets = { KOSPI: {}, KOSDAQ: {} };
  const indexRanksByPeriod = { rs20: new Map(), rs50: new Map(), rs120: new Map() };

  for (const { key } of RS_PERIODS) {
    const pastCloses = indexCloseByDd.get(pastDds[key]) || { KOSPI: null, KOSDAQ: null };
    for (const name of Object.keys(INDEX_RS_CODES)) {
      const ret = periodReturn(indexCloseNow[name], pastCloses[name]);
      indexRets[name][key] = ret;
      if (ret != null) {
        returnsByPeriod[key].push({ code: INDEX_RS_CODES[name], ret });
      }
    }
    const ranked = percentileRanks(returnsByPeriod[key]);
    for (const name of Object.keys(INDEX_RS_CODES)) {
      const syn = INDEX_RS_CODES[name];
      if (ranked.has(syn)) indexRanksByPeriod[key].set(syn, ranked.get(syn));
    }
  }

  const indices = {};
  for (const name of Object.keys(INDEX_RS_CODES)) {
    const entry = buildIndexRsEntry(name, indexRanksByPeriod, indexRets[name]);
    if (entry) indices[name] = entry;
  }

  const quotes = {};
  let ok = 0;
  for (const code of codes) {
    const rs20 = ranksByPeriod.rs20.get(code);
    const rs50 = ranksByPeriod.rs50.get(code);
    const rs120 = ranksByPeriod.rs120.get(code);
    if (rs20 == null || rs50 == null || rs120 == null) continue;
    const rs = Math.round(
      (rs20 * RS_WEIGHTS.rs20 + rs50 * RS_WEIGHTS.rs50 + rs120 * RS_WEIGHTS.rs120) * 10,
    ) / 10;
    const now = recent.closes.get(code);
    const ret20 = periodReturn(now, pastMaps.rs20.get(code));
    const ret50 = periodReturn(now, pastMaps.rs50.get(code));
    const ret120 = periodReturn(now, pastMaps.rs120.get(code));
    const retFields = {};
    for (const { field } of RETURN_PERIODS) {
      const pastClose = returnPastMaps[field].get(code);
      const ret = periodReturn(now, pastClose);
      retFields[field] = ret != null ? Math.round(ret * 100) / 100 : null;
    }
    const refMcap = recent.mcaps.get(code);
    const past1dMcap = past1dSnap.mcaps.get(code);
    quotes[code] = {
      rs,
      rs20: Math.round(rs20 * 10) / 10,
      rs50: Math.round(rs50 * 10) / 10,
      rs120: Math.round(rs120 * 10) / 10,
      ret20: ret20 != null ? Math.round(ret20 * 100) / 100 : null,
      ret50: ret50 != null ? Math.round(ret50 * 100) / 100 : null,
      ret120: ret120 != null ? Math.round(ret120 * 100) / 100 : null,
      refClose: now,
      refMcap: refMcap != null ? refMcap : null,
      past1dMcap: past1dMcap != null ? past1dMcap : null,
      ...retFields,
    };
    ok += 1;
  }

  return {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'krx-rs-percentile',
    universe: codes.size,
    quotesOk: ok,
    recentDd: recent.basDd,
    anchorDd: kstAnchorYmd(),
    past1dDd: past1dSnap.basDd || returnPastDds.chg1dPct,
    past20Dd: pastDds.rs20,
    past50Dd: pastDds.rs50,
    past120Dd: pastDds.rs120,
    quotes,
    ...(Object.keys(indices).length ? { indices } : {}),
  };
}
