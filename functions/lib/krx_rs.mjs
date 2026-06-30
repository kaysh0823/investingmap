/**
 * KRX Relative Strength: 20 / 50 / 120 trading-day return percentiles, arithmetic mean.
 * Universe: all KOSPI + KOSDAQ listings from KRX daily API.
 */

import { getAuthKey, fetchMarketDay, tradingDates } from './krx_yoy.mjs';

export { getAuthKey };

const RS_PERIODS = [
  { key: 'rs20', days: 20 },
  { key: 'rs50', days: 50 },
  { key: 'rs120', days: 120 },
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

async function fetchCloseMapWithFallback(authKey, dates, minSize) {
  const min = minSize || 100;
  for (const basDd of dates) {
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      const closes = new Map();
      for (const [code, row] of byCode) {
        const cl = closeFromRow(row);
        if (cl != null && cl > 0) closes.set(code, cl);
      }
      if (closes.size >= min) return { closes, basDd };
    } catch {
      /* try next */
    }
  }
  return { closes: new Map(), basDd: null };
}

function periodReturn(closeNow, closePast) {
  if (closeNow == null || closePast == null || closePast <= 0) return null;
  return ((closeNow / closePast) - 1) * 100;
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

  const dates = tradingDates(130);
  const recent = await fetchCloseMapWithFallback(authKey, dates.slice(0, DATE_FALLBACK_WINDOW));
  if (!recent.closes.size) return null;

  const pastMaps = {};
  const pastDds = {};
  for (const { key, days } of RS_PERIODS) {
    const idx = Math.min(days - 1, dates.length - 1);
    const snap = await fetchCloseMapWithFallback(
      authKey,
      dates.slice(idx, idx + DATE_FALLBACK_WINDOW),
      100,
    );
    pastMaps[key] = snap.closes;
    pastDds[key] = snap.basDd;
  }

  const codes = new Set(recent.closes.keys());
  for (const map of Object.values(pastMaps)) {
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

  const ranksByPeriod = {};
  for (const { key } of RS_PERIODS) {
    ranksByPeriod[key] = percentileRanks(returnsByPeriod[key]);
  }

  const quotes = {};
  let ok = 0;
  for (const code of codes) {
    const rs20 = ranksByPeriod.rs20.get(code);
    const rs50 = ranksByPeriod.rs50.get(code);
    const rs120 = ranksByPeriod.rs120.get(code);
    if (rs20 == null || rs50 == null || rs120 == null) continue;
    const rs = Math.round(((rs20 + rs50 + rs120) / 3) * 10) / 10;
    const now = recent.closes.get(code);
    const ret20 = periodReturn(now, pastMaps.rs20.get(code));
    const ret50 = periodReturn(now, pastMaps.rs50.get(code));
    const ret120 = periodReturn(now, pastMaps.rs120.get(code));
    quotes[code] = {
      rs,
      rs20: Math.round(rs20 * 10) / 10,
      rs50: Math.round(rs50 * 10) / 10,
      rs120: Math.round(rs120 * 10) / 10,
      ret20: ret20 != null ? Math.round(ret20 * 100) / 100 : null,
      ret50: ret50 != null ? Math.round(ret50 * 100) / 100 : null,
      ret120: ret120 != null ? Math.round(ret120 * 100) / 100 : null,
    };
    ok += 1;
  }

  return {
    builtAt: new Date().toISOString().slice(0, 10),
    asOf: new Date().toISOString(),
    source: 'krx-rs-percentile',
    universe: codes.size,
    quotesOk: ok,
    recentDd: recent.basDd,
    past20Dd: pastDds.rs20,
    past50Dd: pastDds.rs50,
    past120Dd: pastDds.rs120,
    quotes,
  };
}
