/**
 * KRX Relative Strength: 20 / 50 / 120 trading-day return percentiles, arithmetic mean.
 * Universe: all KOSPI + KOSDAQ listings from KRX daily API.
 */

import { getAuthKey, fetchMarketDay, tradingDates, pastDatesFromAnchor, recentDateCandidates } from './krx_yoy.mjs';
import { kstYmdDash, kstAnchorYmd } from './krx_session.mjs';

export { getAuthKey };

const RS_PERIODS = [
  { key: 'rs20', days: 20 },
  { key: 'rs50', days: 50 },
  { key: 'rs120', days: 120 },
];

const RETURN_PERIODS = [
  { field: 'chg1dPct', days: 1 },
  { field: 'ret20dPct', days: 20 },
  { field: 'ret50dPct', days: 50 },
  { field: 'ret120dPct', days: 120 },
  { field: 'ret250dPct', days: 250 },
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
  };
}
