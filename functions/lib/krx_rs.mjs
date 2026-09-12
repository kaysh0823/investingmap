/**
 * KRX Relative Strength — tradingKRX (indicators_core.rs_avg) aligned.
 *
 * Preferred path: Supabase stock_price_history closes → price_adjustments
 * (ticker_ohlc-identical backward adjust) → ffill(≤20) → shift(N) returns;
 * indices from market_index_daily (KOSPI/KOSDAQ). Fallback: live KRX bydd_trd.
 *
 * Composite = 0.4·rs200 + 0.3·rs120 + 0.2·rs50 + 0.1·rs20 (rs10 excluded);
 * missing horizons are weight-renormalized over available periods.
 * Each horizon RS = percentile of N-day raw return in a unified pool
 * (보통주 equities + KOSPI/KOSDAQ index closes) via
 * rank(method="min", pct=True)×100.
 *
 * Ranking universe excludes preferred / SPAC / REIT / ETF·ETN (tk parity target ≈2398).
 */

import { getAuthKey, fetchMarketDay, tradingDates, pastDatesFromAnchor, recentDateCandidates } from './krx_yoy.mjs';
import { kstYmdDash, kstAnchorYmd } from './krx_session.mjs';
import { fetchKrxMarketIndexDay } from './krx_index.mjs';
import { fetchNaverMarketIndexHistory } from './naver_index.mjs';

export { getAuthKey };

export const RS_PERIODS = [
  { key: 'rs20', days: 20 },
  { key: 'rs50', days: 50 },
  { key: 'rs120', days: 120 },
  { key: 'rs200', days: 200 },
];

/** tradingKRX RS_AVG_WEIGHTS (rs10 excluded). */
export const RS_WEIGHTS = { rs20: 0.1, rs50: 0.2, rs120: 0.3, rs200: 0.4 };

/** Synthetic codes used only inside percentile pools (never written to quotes). */
export const INDEX_RS_CODES = {
  KOSPI: '__KOSPI',
  KOSDAQ: '__KOSDAQ',
};

export const RETURN_PERIODS = [
  { field: 'chg1dPct', days: 1 },
  { field: 'ret5dPct', days: 5 },
  { field: 'ret20dPct', days: 20 },
  { field: 'ret50dPct', days: 50 },
  { field: 'ret120dPct', days: 120 },
  { field: 'ret200dPct', days: 200 },
];

const DATE_FALLBACK_WINDOW = 12;
/** Cover rs200 + Naver index fallback when KRX index API is unauthorized. */
const INDEX_HISTORY_DAYS = 280;

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

/**
 * Name from a KRX daily equity row (sto/ksq_bydd_trd).
 * @param {object|null|undefined} row
 */
export function nameFromKrxRow(row) {
  return String((row && (row.ISU_NM || row.ISU_ABBRV)) || '').trim();
}

/**
 * KRX security-type label if the daily row exposes one (often absent on bydd_trd).
 * @param {object|null|undefined} row
 */
export function securityTypeFromKrxRow(row) {
  if (!row || typeof row !== 'object') return '';
  for (const key of ['SECUGRP_NM', 'KIND_STKCERT_TP_NM', 'STK_KIND_NM', 'SECU_GRP_NM']) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/**
 * Exclude preferred / SPAC / REIT / ETF·ETN from the RS ranking universe.
 * Returns exclusion reason, or null when the name/code looks like an ordinary share.
 * @param {string} code
 * @param {string} [name]
 * @param {object|null} [row]
 * @returns {string|null}
 */
export function rsUniverseExclusionReason(code, name, row) {
  const cd = String(code || '').trim().toUpperCase();
  const nm = String(name || nameFromKrxRow(row) || '').trim();
  const secu = securityTypeFromKrxRow(row);

  // 1) Explicit KRX security-type field when present.
  if (secu) {
    if (/ETF|ETN/i.test(secu)) return 'etf_etn';
    if (/리츠|REIT/i.test(secu)) return 'reit';
    if (/스팩|SPAC|기업인수/i.test(secu)) return 'spac';
    if (/우선/i.test(secu)) return 'preferred';
    if (!/보통/.test(secu)) return 'non_ordinary_secu';
  }

  // 2) Fallback heuristics (bydd_trd usually has no SECUGRP_NM).
  if (/ETF|ETN/i.test(nm)) return 'etf_etn';
  if (/스팩|기업인수목적/.test(nm)) return 'spac';
  if (/리츠/.test(nm)) return 'reit';
  // Ordinary shares end with digit 0; preferred often 5/7/K/L etc., or name suffix.
  if (cd.length >= 6 && cd[5] !== '0') return 'preferred';
  if (/(?:우|우B|\(전환\))$/.test(nm)) return 'preferred';
  return null;
}

export function isOrdinaryShareForRs(code, name, row) {
  return rsUniverseExclusionReason(code, name, row) == null;
}

async function fetchDayMapsWithFallback(authKey, dates, minSize, maxBasDd) {
  const min = minSize || 100;
  for (const basDd of dates) {
    if (maxBasDd && basDd >= maxBasDd) continue;
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      const closes = new Map();
      const mcaps = new Map();
      const names = new Map();
      const rows = new Map();
      for (const [code, row] of byCode) {
        rows.set(code, row);
        const nm = nameFromKrxRow(row);
        if (nm) names.set(code, nm);
        const cl = closeFromRow(row);
        if (cl != null && cl > 0) closes.set(code, cl);
        const mcap = mcapFromRow(row);
        if (mcap != null && mcap > 0) mcaps.set(code, mcap);
      }
      if (closes.size >= min) return { closes, mcaps, names, rows, basDd };
    } catch {
      /* try next */
    }
  }
  return {
    closes: new Map(),
    mcaps: new Map(),
    names: new Map(),
    rows: new Map(),
    basDd: null,
  };
}

async function fetchCloseMapWithFallback(authKey, dates, minSize, maxBasDd) {
  const snap = await fetchDayMapsWithFallback(authKey, dates, minSize, maxBasDd);
  return { closes: snap.closes, basDd: snap.basDd };
}

export function periodReturn(closeNow, closePast) {
  if (closeNow == null || closePast == null || closePast <= 0) return null;
  return ((closeNow / closePast) - 1) * 100;
}

/**
 * Weighted composite RS with renormalization over available horizons.
 * @param {Record<string, number|null|undefined>} ranksByKey — e.g. { rs20, rs50, rs120, rs200 }
 * @returns {number|null}
 */
export function compositeRs(ranksByKey) {
  let num = 0;
  let den = 0;
  for (const key of Object.keys(RS_WEIGHTS)) {
    const w = RS_WEIGHTS[key];
    const v = ranksByKey && ranksByKey[key];
    if (typeof v === 'number' && Number.isFinite(v) && w > 0) {
      num += w * v;
      den += w;
    }
  }
  if (den <= 0) return null;
  return Math.round((num / den) * 10) / 10;
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
      ['KOSPI', 'KOSDAQ'].map(async (code) => [code, await fetchNaverMarketIndexHistory(code, INDEX_HISTORY_DAYS)]),
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

export function buildIndexRsEntry(name, ranksByPeriod, retsByPeriod) {
  const periodRanks = {};
  for (const { key } of RS_PERIODS) {
    const v = ranksByPeriod[key]?.get(INDEX_RS_CODES[name]);
    periodRanks[key] = v != null && Number.isFinite(v) ? v : null;
  }
  const rs = compositeRs(periodRanks);
  if (rs == null) return null;
  const out = { rs };
  for (const { key } of RS_PERIODS) {
    const v = periodRanks[key];
    out[key] = v != null ? Math.round(v * 10) / 10 : null;
    const ret = retsByPeriod[key];
    const retField = key.replace(/^rs/, 'ret');
    out[retField] = ret != null ? Math.round(ret * 100) / 100 : null;
  }
  return out;
}

/**
 * Percentile rank 0–100 matching pandas Series.rank(method="min", pct=True)*100.
 * Higher return → higher RS. Ties share the minimum 1-based rank / n.
 * If every valid return is 0, assign 50 (tradingKRX).
 */
export function percentileRanks(items) {
  const valid = items.filter((x) => x.ret != null && Number.isFinite(x.ret));
  valid.sort((a, b) => a.ret - b.ret);
  const n = valid.length;
  const out = new Map();
  if (n === 0) return out;

  let allZero = true;
  for (let k = 0; k < n; k++) {
    if (valid[k].ret !== 0) {
      allZero = false;
      break;
    }
  }
  if (allZero) {
    for (let k = 0; k < n; k++) out.set(valid[k].code, 50);
    return out;
  }

  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && valid[j].ret === valid[i].ret) j += 1;
    const minRank1Based = i + 1;
    const pct = (minRank1Based / n) * 100;
    for (let k = i; k < j; k++) out.set(valid[k].code, pct);
    i = j;
  }
  return out;
}

/**
 * @param {string|{ authKey?: string, supabase?: { url: string, anonKey: string }, env?: object }} authKeyOrOpts
 * @returns {Promise<object|null>}
 */
export async function buildKrxRsSnapshot(authKeyOrOpts) {
  const opts = typeof authKeyOrOpts === 'string' || authKeyOrOpts == null
    ? { authKey: authKeyOrOpts || '' }
    : authKeyOrOpts;
  const authKey = opts.authKey || '';
  let supabase = opts.supabase || null;
  if (!supabase && opts.env) {
    const { getSupabaseConfig } = await import('./supabase_hub.mjs');
    supabase = getSupabaseConfig(opts.env, { preferServiceRole: true });
  }

  if (supabase?.url && supabase?.anonKey) {
    try {
      const { buildRsSnapshotFromHistory } = await import('./krx_rs_from_history.mjs');
      const snap = await buildRsSnapshotFromHistory(supabase, { authKey });
      if (snap?.quotes && Object.keys(snap.quotes).length > 500) return snap;
      console.warn('[krx_rs] history snapshot incomplete — falling back to KRX bydd_trd');
    } catch (e) {
      console.warn(
        '[krx_rs] history path failed — falling back to KRX:',
        e && e.message ? e.message : e,
      );
    }
  }

  return buildRsSnapshotFromKrx(authKey);
}

/**
 * Legacy per-date KRX OPEN API path (unadjusted closes, no halt ffill).
 * @param {string} authKey
 * @returns {Promise<object|null>}
 */
export async function buildRsSnapshotFromKrx(authKey) {
  if (!authKey) return null;

  const dates = tradingDates(260);
  const recent = await fetchDayMapsWithFallback(
    authKey,
    recentDateCandidates(dates).slice(0, DATE_FALLBACK_WINDOW),
  );
  if (!recent.closes.size || !recent.basDd) return null;

  const excludedCounts = {
    preferred: 0,
    spac: 0,
    reit: 0,
    etf_etn: 0,
    non_ordinary_secu: 0,
  };
  const ordinaryCodes = new Set();
  for (const code of recent.closes.keys()) {
    const reason = rsUniverseExclusionReason(
      code,
      recent.names?.get(code),
      recent.rows?.get(code),
    );
    if (reason) {
      if (excludedCounts[reason] != null) excludedCounts[reason] += 1;
      else excludedCounts[reason] = 1;
      continue;
    }
    ordinaryCodes.add(code);
  }
  const universeRaw = recent.closes.size;
  const universeOrdinary = ordinaryCodes.size;
  // Rank-pool equities = ordinary with an original close on the anchor day (already gated).
  console.log(
    `[krx_rs] universe raw=${universeRaw} ordinary=${universeOrdinary} `
    + `(excl preferred=${excludedCounts.preferred} spac=${excludedCounts.spac} `
    + `reit=${excludedCounts.reit} etf=${excludedCounts.etf_etn || 0}) `
    + `— tk RS equity≈2398`,
  );

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
    // tradingKRX: close.shift(period) → N trading sessions ago (not N-1).
    const pastDates = pastDatesFromAnchor(recent.basDd, dates, days, DATE_FALLBACK_WINDOW);
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

  const codes = ordinaryCodes;

  const returnsByPeriod = {};
  for (const { key } of RS_PERIODS) {
    returnsByPeriod[key] = [];
  }

  // Ordinary shares with an original close on the RS anchor day enter the pool.
  for (const code of codes) {
    const now = recent.closes.get(code);
    if (now == null) continue;
    for (const { key } of RS_PERIODS) {
      const past = pastMaps[key].get(code);
      const ret = periodReturn(now, past);
      if (ret != null) returnsByPeriod[key].push({ code, ret });
    }
  }

  const rankPoolByPeriod = {};
  for (const { key } of RS_PERIODS) {
    rankPoolByPeriod[key] = returnsByPeriod[key].length;
  }
  console.log(
    `[krx_rs] rank-pool equities by period (pre-index): `
    + Object.entries(rankPoolByPeriod).map(([k, n]) => `${k}=${n}`).join(' '),
  );

  const indexCloseByDd = await fetchMarketIndexClosesByBasDd(authKey, [
    recent.basDd,
    ...RS_PERIODS.map(({ key }) => pastDds[key]),
  ]);
  const indexCloseNow = indexCloseByDd.get(recent.basDd) || { KOSPI: null, KOSDAQ: null };
  const indexRets = { KOSPI: {}, KOSDAQ: {} };

  // Unified pool: index returns share the same percentile as equities.
  for (const { key } of RS_PERIODS) {
    const pastCloses = indexCloseByDd.get(pastDds[key]) || { KOSPI: null, KOSDAQ: null };
    for (const name of Object.keys(INDEX_RS_CODES)) {
      const ret = periodReturn(indexCloseNow[name], pastCloses[name]);
      indexRets[name][key] = ret;
      if (ret != null) {
        returnsByPeriod[key].push({ code: INDEX_RS_CODES[name], ret });
      }
    }
  }

  const ranksByPeriod = {};
  for (const { key } of RS_PERIODS) {
    ranksByPeriod[key] = percentileRanks(returnsByPeriod[key]);
  }

  const indices = {};
  for (const name of Object.keys(INDEX_RS_CODES)) {
    const entry = buildIndexRsEntry(name, ranksByPeriod, indexRets[name]);
    if (entry) indices[name] = entry;
  }

  const quotes = {};
  let ok = 0;
  for (const code of codes) {
    const now = recent.closes.get(code);
    if (now == null) continue;

    const periodRanks = {};
    let any = false;
    for (const { key } of RS_PERIODS) {
      const v = ranksByPeriod[key].get(code);
      if (v != null && Number.isFinite(v)) {
        periodRanks[key] = v;
        any = true;
      } else {
        periodRanks[key] = null;
      }
    }
    if (!any) continue;

    const rs = compositeRs(periodRanks);
    if (rs == null) continue;

    const retFields = {};
    for (const { field } of RETURN_PERIODS) {
      const pastClose = returnPastMaps[field].get(code);
      const ret = periodReturn(now, pastClose);
      retFields[field] = ret != null ? Math.round(ret * 100) / 100 : null;
    }
    const refMcap = recent.mcaps.get(code);
    const past1dMcap = past1dSnap.mcaps.get(code);
    const row = {
      rs,
      refClose: now,
      refMcap: refMcap != null ? refMcap : null,
      past1dMcap: past1dMcap != null ? past1dMcap : null,
      ...retFields,
    };
    for (const { key } of RS_PERIODS) {
      const v = periodRanks[key];
      row[key] = v != null ? Math.round(v * 10) / 10 : null;
      const ret = periodReturn(now, pastMaps[key].get(code));
      row[key.replace(/^rs/, 'ret')] = ret != null ? Math.round(ret * 100) / 100 : null;
    }
    quotes[code] = row;
    ok += 1;
  }

  return {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'krx-rs-percentile',
    universe: universeOrdinary,
    universeRaw,
    universeOrdinary,
    universeExcluded: excludedCounts,
    rankPoolByPeriod,
    quotesOk: ok,
    recentDd: recent.basDd,
    anchorDd: kstAnchorYmd(),
    past1dDd: past1dSnap.basDd || returnPastDds.chg1dPct,
    past20Dd: pastDds.rs20,
    past50Dd: pastDds.rs50,
    past120Dd: pastDds.rs120,
    past200Dd: pastDds.rs200,
    quotes,
    ...(Object.keys(indices).length ? { indices } : {}),
  };
}
