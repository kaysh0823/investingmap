/**
 * RS snapshot from Supabase stock_price_history + price_adjustments
 * (adjusted close) and market_index_daily — tradingKRX basis parity.
 */

import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';
import {
  applyPriceAdjustmentsToBars,
  cumulativeAdjustmentRatio,
} from './price_adjustments.mjs';
import { normalizeTicker } from './hub_dashboard_core.mjs';
import { kstYmdDash, kstAnchorYmd } from './krx_session.mjs';
import { fetchMarketDay } from './krx_yoy.mjs';
import {
  RS_PERIODS,
  RETURN_PERIODS,
  INDEX_RS_CODES,
  compositeRs,
  percentileRanks,
  rsUniverseExclusionReason,
  nameFromKrxRow,
  periodReturn,
  buildIndexRsEntry,
} from './krx_rs.mjs';

export const RS_HISTORY_LOOKBACK = 230;
export const RS_FFILL_LIMIT = 20;
const PAGE_SIZE = 1000;
const TICKER_BATCH = 40;
const FETCH_CONCURRENCY = 3;
const CALENDAR_REF = '005930';
/** Split/bonus samples to log raw vs adjusted close. */
const ADJ_LOG_TICKERS = ['183300', '036800', '340570', '005930'];

async function fetchPaged(config, query, pageSize = PAGE_SIZE) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = query.includes('?') ? '&' : '?';
    const page = await fetchSupabaseJson(
      config,
      `${query}${sep}limit=${pageSize}&offset=${offset}`,
    );
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * pandas Series.ffill(limit=N) on a session-aligned array.
 * @param {(number|null)[]} values
 * @param {number} [limit]
 */
export function ffillLimited(values, limit = RS_FFILL_LIMIT) {
  const out = values.slice();
  let last = null;
  let gap = 0;
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    if (v != null && Number.isFinite(v) && v > 0) {
      last = v;
      gap = 0;
    } else if (last != null && gap < limit) {
      out[i] = last;
      gap += 1;
    } else {
      out[i] = null;
      if (last != null) gap = limit;
    }
  }
  return out;
}

function dashToBasDd(dash) {
  return String(dash || '').replace(/-/g, '');
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @returns {Promise<string[]>} newest-first YYYY-MM-DD
 */
async function fetchCalendarDatesDesc(config, n = RS_HISTORY_LOOKBACK) {
  // Single page only — do not paginate or we pull the entire history.
  const rows = await fetchSupabaseJson(
    config,
    `stock_price_history?ticker=eq.${CALENDAR_REF}` +
      `&select=trade_date&order=trade_date.desc&limit=${n}`,
  );
  const dates = [];
  const seen = new Set();
  for (const row of rows) {
    const d = String(row.trade_date || '').slice(0, 10);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    dates.push(d);
  }
  return dates;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} anchorDash
 */
async function fetchAnchorDayRows(config, anchorDash) {
  const rows = await fetchPaged(
    config,
    `stock_price_history?trade_date=eq.${encodeURIComponent(anchorDash)}` +
      `&select=ticker,close,mcap_won&order=ticker.asc`,
  );
  const closes = new Map();
  const mcaps = new Map();
  for (const row of rows) {
    const t = normalizeTicker(row.ticker);
    const c = numOrNull(row.close);
    if (!t || c == null || c <= 0) continue;
    closes.set(t, c);
    const m = numOrNull(row.mcap_won);
    if (m != null && m > 0) mcaps.set(t, m);
  }
  return { closes, mcaps };
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string[]} tickers
 * @param {string} sinceDash
 * @param {string} untilDash
 * @returns {Promise<Map<string, {t:string,c:number,m?:number|null}[]>>}
 */
async function fetchHistoryByTicker(config, tickers, sinceDash, untilDash) {
  const byTicker = new Map();
  const batches = [];
  for (let i = 0; i < tickers.length; i += TICKER_BATCH) {
    batches.push(tickers.slice(i, i + TICKER_BATCH));
  }
  await mapPool(batches, FETCH_CONCURRENCY, async (batch) => {
    const tickerFilter = batch.map(encodeURIComponent).join(',');
    const rows = await fetchPaged(
      config,
      `stock_price_history?ticker=in.(${tickerFilter})` +
        `&trade_date=gte.${encodeURIComponent(sinceDash)}` +
        `&trade_date=lte.${encodeURIComponent(untilDash)}` +
        `&select=ticker,trade_date,close,mcap_won` +
        `&order=ticker.asc,trade_date.asc`,
    );
    for (const row of rows) {
      const t = normalizeTicker(row.ticker);
      const d = String(row.trade_date || '').slice(0, 10);
      const c = numOrNull(row.close);
      if (!t || !d || c == null || c <= 0) continue;
      if (!byTicker.has(t)) byTicker.set(t, []);
      byTicker.get(t).push({ t: d, c, m: numOrNull(row.mcap_won) });
    }
  });
  for (const [t, rows] of byTicker) {
    rows.sort((a, b) => a.t.localeCompare(b.t));
    const dedup = [];
    for (const r of rows) {
      if (dedup.length && dedup[dedup.length - 1].t === r.t) dedup[dedup.length - 1] = r;
      else dedup.push(r);
    }
    byTicker.set(t, dedup);
  }
  return byTicker;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string[]} tickers
 * @returns {Promise<Map<string, object[]>>}
 */
async function fetchAdjustmentsByTicker(config, tickers) {
  const byTicker = new Map();
  if (!tickers.length) return byTicker;
  const batches = [];
  for (let i = 0; i < tickers.length; i += TICKER_BATCH) {
    batches.push(tickers.slice(i, i + TICKER_BATCH));
  }
  await mapPool(batches, FETCH_CONCURRENCY, async (batch) => {
    const tickerFilter = batch.map(encodeURIComponent).join(',');
    const rows = await fetchPaged(
      config,
      `price_adjustments?ticker=in.(${tickerFilter})` +
        `&select=ticker,effective_date,ratio,type,source,note` +
        `&order=ticker.asc,effective_date.asc`,
    );
    for (const row of rows) {
      const t = normalizeTicker(row.ticker);
      if (!t) continue;
      if (!byTicker.has(t)) byTicker.set(t, []);
      byTicker.get(t).push(row);
    }
  });
  return byTicker;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} sinceDash
 * @param {string} untilDash
 */
async function fetchIndexCloses(config, sinceDash, untilDash) {
  const rows = await fetchPaged(
    config,
    `market_index_daily?index_code=in.(KOSPI,KOSDAQ)` +
      `&trade_date=gte.${encodeURIComponent(sinceDash)}` +
      `&trade_date=lte.${encodeURIComponent(untilDash)}` +
      `&select=trade_date,index_code,close` +
      `&order=trade_date.asc,index_code.asc`,
  );
  const byCode = { KOSPI: new Map(), KOSDAQ: new Map() };
  for (const row of rows) {
    const code = row.index_code;
    if (!byCode[code]) continue;
    const d = String(row.trade_date || '').slice(0, 10);
    const c = numOrNull(row.close);
    if (!d || c == null || c <= 0) continue;
    byCode[code].set(d, c);
  }
  return byCode;
}

async function loadNamesFromKrx(authKey, basDd) {
  const names = new Map();
  if (!authKey || !basDd) return names;
  try {
    const byCode = await fetchMarketDay(authKey, basDd);
    for (const [code, row] of byCode) {
      const nm = nameFromKrxRow(row);
      if (nm) names.set(code, nm);
    }
  } catch {
    /* name heuristics degrade to code-only */
  }
  return names;
}

function alignToCalendar(points, datesAsc) {
  const byDate = new Map(points.map((p) => [p.t, p]));
  const raw = datesAsc.map((d) => {
    const p = byDate.get(d);
    return p && p.c > 0 ? p.c : null;
  });
  const mcaps = datesAsc.map((d) => {
    const p = byDate.get(d);
    return p && p.m != null && p.m > 0 ? p.m : null;
  });
  return { raw, mcaps };
}

function logAdjustmentSamples(byTickerRaw, adjustmentsByTicker, datesAsc) {
  const samples = [];
  for (const ticker of ADJ_LOG_TICKERS) {
    const adjs = adjustmentsByTicker.get(ticker) || [];
    if (!adjs.length && ticker !== '005930') continue;
    const points = byTickerRaw.get(ticker) || [];
    if (points.length < 2) continue;
    const mid = points[Math.floor(points.length / 2)];
    const bars = points.map((p) => ({ t: p.t, c: p.c }));
    const before = bars.map((b) => ({ ...b }));
    applyPriceAdjustmentsToBars(bars, adjs);
    const i = bars.findIndex((b) => b.t === mid.t);
    if (i < 0) continue;
    const cum = cumulativeAdjustmentRatio(mid.t, adjs);
    samples.push({
      ticker,
      date: mid.t,
      raw: before[i].c,
      adj: bars[i].c,
      cum: Math.round(cum * 1000) / 1000,
      events: adjs.map((a) => `${a.effective_date}:${a.type}×${a.ratio}`).join('|') || 'none',
    });
  }
  if (samples.length) {
    console.log(
      '[krx_rs] adj-close check:',
      samples
        .map((s) => `${s.ticker}@${s.date} raw=${s.raw}→adj=${s.adj} (cum=${s.cum}) [${s.events}]`)
        .join(' · '),
    );
  } else {
    console.log('[krx_rs] adj-close check: no sample adjustment rows in window');
  }
  return samples;
}

/**
 * Build full-market RS snapshot from Supabase history (adjusted closes + ffill).
 * @param {{ url: string, anonKey: string }} config
 * @param {{ authKey?: string }} [opts]
 * @returns {Promise<object|null>}
 */
export async function buildRsSnapshotFromHistory(config, opts = {}) {
  if (!config?.url || !config?.anonKey) return null;

  const datesDesc = await fetchCalendarDatesDesc(config, RS_HISTORY_LOOKBACK);
  if (datesDesc.length < 50) {
    console.warn(`[krx_rs] history calendar too short (${datesDesc.length})`);
    return null;
  }
  const datesAsc = [...datesDesc].reverse();
  const anchorDash = datesDesc[0];
  const sinceDash = datesDesc[datesDesc.length - 1];
  const anchorIdx = datesAsc.length - 1;
  const recentDd = dashToBasDd(anchorDash);

  console.log(
    `[krx_rs] history path: anchor=${anchorDash} sessions=${datesAsc.length} `
    + `since=${sinceDash} (adj+ffill≤${RS_FFILL_LIMIT})`,
  );

  const anchor = await fetchAnchorDayRows(config, anchorDash);
  if (anchor.closes.size < 500) {
    console.warn(`[krx_rs] anchor day coverage too low (${anchor.closes.size})`);
    return null;
  }

  const names = await loadNamesFromKrx(opts.authKey, recentDd);
  const excludedCounts = {
    preferred: 0,
    spac: 0,
    reit: 0,
    etf_etn: 0,
    non_ordinary_secu: 0,
  };
  const ordinaryCodes = [];
  for (const code of anchor.closes.keys()) {
    const reason = rsUniverseExclusionReason(code, names.get(code), null);
    if (reason) {
      if (excludedCounts[reason] != null) excludedCounts[reason] += 1;
      else excludedCounts[reason] = 1;
      continue;
    }
    ordinaryCodes.push(code);
  }
  const universeRaw = anchor.closes.size;
  const universeOrdinary = ordinaryCodes.length;
  console.log(
    `[krx_rs] universe raw=${universeRaw} ordinary=${universeOrdinary} `
    + `(excl preferred=${excludedCounts.preferred} spac=${excludedCounts.spac} `
    + `reit=${excludedCounts.reit} etf=${excludedCounts.etf_etn || 0}) `
    + `— tk RS equity≈2398`,
  );

  const historyByTicker = await fetchHistoryByTicker(
    config,
    ordinaryCodes,
    sinceDash,
    anchorDash,
  );
  const adjustmentsByTicker = await fetchAdjustmentsByTicker(config, ordinaryCodes);
  logAdjustmentSamples(historyByTicker, adjustmentsByTicker, datesAsc);

  /** @type {Map<string, { raw:(number|null)[], filled:(number|null)[], mcaps:(number|null)[] }>} */
  const seriesByTicker = new Map();
  for (const code of ordinaryCodes) {
    const points = historyByTicker.get(code) || [];
    if (!points.length) continue;
    const bars = points.map((p) => ({ t: p.t, c: p.c }));
    applyPriceAdjustmentsToBars(bars, adjustmentsByTicker.get(code) || []);
    const adjPoints = bars.map((b, i) => ({
      t: b.t,
      c: b.c,
      m: points[i]?.m ?? null,
    }));
    const { raw, mcaps } = alignToCalendar(adjPoints, datesAsc);
    // Require original (post-adj) close on anchor — no ffill for membership.
    if (raw[anchorIdx] == null) continue;
    const filled = ffillLimited(raw, RS_FFILL_LIMIT);
    seriesByTicker.set(code, { raw, filled, mcaps });
  }

  const indexMaps = await fetchIndexCloses(config, sinceDash, anchorDash);
  const indexFilled = {};
  for (const name of Object.keys(INDEX_RS_CODES)) {
    const raw = datesAsc.map((d) => indexMaps[name]?.get(d) ?? null);
    indexFilled[name] = ffillLimited(raw, RS_FFILL_LIMIT);
  }

  const returnsByPeriod = {};
  for (const { key } of RS_PERIODS) returnsByPeriod[key] = [];

  for (const [code, series] of seriesByTicker) {
    const now = series.filled[anchorIdx];
    if (now == null) continue;
    for (const { key, days } of RS_PERIODS) {
      const pastIdx = anchorIdx - days;
      if (pastIdx < 0) continue;
      const past = series.filled[pastIdx];
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

  const indexRets = { KOSPI: {}, KOSDAQ: {} };
  for (const { key, days } of RS_PERIODS) {
    const pastIdx = anchorIdx - days;
    for (const name of Object.keys(INDEX_RS_CODES)) {
      const now = indexFilled[name][anchorIdx];
      const past = pastIdx >= 0 ? indexFilled[name][pastIdx] : null;
      const ret = periodReturn(now, past);
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

  const pastDds = {};
  for (const { key, days } of RS_PERIODS) {
    const pastIdx = anchorIdx - days;
    pastDds[key] = pastIdx >= 0 ? dashToBasDd(datesAsc[pastIdx]) : null;
  }
  const past1dIdx = anchorIdx - 1;
  const past1dDd = past1dIdx >= 0 ? dashToBasDd(datesAsc[past1dIdx]) : null;

  const quotes = {};
  let ok = 0;
  for (const [code, series] of seriesByTicker) {
    const now = series.filled[anchorIdx];
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
    for (const { field, days } of RETURN_PERIODS) {
      const pastIdx = anchorIdx - days;
      const past = pastIdx >= 0 ? series.filled[pastIdx] : null;
      const ret = periodReturn(now, past);
      retFields[field] = ret != null ? Math.round(ret * 100) / 100 : null;
    }

    const row = {
      rs,
      refClose: now,
      refMcap: series.mcaps[anchorIdx] ?? anchor.mcaps.get(code) ?? null,
      past1dMcap: past1dIdx >= 0 ? series.mcaps[past1dIdx] ?? null : null,
      ...retFields,
    };
    for (const { key, days } of RS_PERIODS) {
      const v = periodRanks[key];
      row[key] = v != null ? Math.round(v * 10) / 10 : null;
      const pastIdx = anchorIdx - days;
      const past = pastIdx >= 0 ? series.filled[pastIdx] : null;
      const ret = periodReturn(now, past);
      row[key.replace(/^rs/, 'ret')] = ret != null ? Math.round(ret * 100) / 100 : null;
    }
    quotes[code] = row;
    ok += 1;
  }

  return {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'supabase-history-adj',
    universe: universeOrdinary,
    universeRaw,
    universeOrdinary,
    universeExcluded: excludedCounts,
    rankPoolByPeriod,
    quotesOk: ok,
    recentDd,
    anchorDd: kstAnchorYmd(),
    past1dDd,
    past20Dd: pastDds.rs20,
    past50Dd: pastDds.rs50,
    past120Dd: pastDds.rs120,
    past200Dd: pastDds.rs200,
    quotes,
    ...(Object.keys(indices).length ? { indices } : {}),
  };
}
