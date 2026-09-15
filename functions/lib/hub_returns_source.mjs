/**
 * Shared return inputs for /api/quotes, /api/hub_sectors, calendar tip, sync intraday.
 * Live numerator = stock_quotes_latest.last; official = hub_return_refs tip close.
 */

import {
  loadHubReturnRefsFromRequest,
  SECTOR_ORDER,
  uniqueHubMcapTotal,
  normalizeTicker as normalizeHubTicker,
} from './hub_dashboard_core.mjs';
import { krxSessionInfo, kstAnchorYmd, kstDateParts } from './krx_session.mjs';
import {
  resolveNumerator,
  sessionsSince,
  aggregateSectorReturns,
} from './returns_core.mjs';
import { getSupabaseConfig, numOrNull } from './supabase_hub.mjs';

const REFS_TTL_MS = 5 * 60 * 1000;
const STALE_ASOF_MS = 15 * 60 * 1000;

let returnRefsCache = { at: 0, refs: null };

function compactYmd(v) {
  const s = String(v || '').replace(/-/g, '');
  return /^\d{8}$/.test(s) ? s : '';
}

function normalizeTicker(t) {
  return normalizeHubTicker(t);
}

function ymdFromAsOf(asOf) {
  if (!asOf) return '';
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return '';
  const p = kstDateParts(new Date(t));
  if (!p.year) return '';
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

/**
 * Session calendar date N sessions before anchorDd.
 * @param {string[]} tradingDates through refs.recentDd
 * @param {string} anchorDd
 * @param {number} n
 * @returns {string|null} YYYYMMDD
 */
export function pastSessionDd(tradingDates, anchorDd, n) {
  const dates = (tradingDates || []).map(compactYmd).filter(Boolean);
  const anchor = compactYmd(anchorDd);
  if (!anchor || !dates.length || !(n > 0)) return null;
  const tip = dates[dates.length - 1];
  const cal = tip < anchor ? [...dates, anchor] : dates;
  let idx = cal.lastIndexOf(anchor);
  if (idx < 0) {
    idx = cal.length - 1;
    while (idx >= 0 && cal[idx] > anchor) idx -= 1;
  }
  const pastIdx = idx - n;
  return pastIdx >= 0 ? cal[pastIdx] : null;
}

/**
 * Load hub_return_refs.json with 5-minute in-memory cache (request path).
 * @param {Request|null} request
 * @param {object} env
 * @param {object|null} [refsOverride]
 */
export async function loadCachedReturnRefs(request, env, refsOverride = null) {
  if (refsOverride && refsOverride.quotes) return refsOverride;
  const now = Date.now();
  if (returnRefsCache.refs && now - returnRefsCache.at < REFS_TTL_MS) {
    return returnRefsCache.refs;
  }
  if (!request) return returnRefsCache.refs;
  try {
    const refs = await loadHubReturnRefsFromRequest(request, env);
    if (refs && refs.quotes) {
      returnRefsCache = { at: now, refs };
    }
    return refs || returnRefsCache.refs;
  } catch {
    return returnRefsCache.refs;
  }
}

/**
 * @param {string[]} tickers
 * @param {{ url: string, anonKey: string }} config
 * @returns {Promise<{ rows: Map<string, { last: number|null, asOf: string|null, tradeDd: string }>, maxAsOf: string|null }>}
 */
async function fetchLatestQuoteRows(tickers, config) {
  const codes = [...new Set(tickers.map(normalizeTicker).filter(Boolean))];
  const rows = new Map();
  let maxAsOf = null;
  let maxAsOfMs = 0;
  if (!codes.length || !config) return { rows, maxAsOf };

  const chunk = 80;
  for (let i = 0; i < codes.length; i += chunk) {
    const part = codes.slice(i, i + chunk);
    const url =
      `${config.url}/rest/v1/stock_quotes_latest`
      + `?ticker=in.(${part.join(',')})`
      + `&select=ticker,last,as_of,trade_date`;
    const res = await fetch(url, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
    });
    if (!res.ok) {
      // trade_date may be absent on older schemas — retry without it.
      const url2 =
        `${config.url}/rest/v1/stock_quotes_latest`
        + `?ticker=in.(${part.join(',')})`
        + `&select=ticker,last,as_of`;
      const res2 = await fetch(url2, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
      });
      if (!res2.ok) {
        const body = await res2.text().catch(() => '');
        throw new Error(`supabase_fetch_failed:${res2.status}:${body.slice(0, 120)}`);
      }
      const data2 = await res2.json();
      for (const row of Array.isArray(data2) ? data2 : []) {
        const t = normalizeTicker(row.ticker);
        if (!t) continue;
        const asOf = row.as_of ? String(row.as_of) : null;
        rows.set(t, {
          last: numOrNull(row.last),
          asOf,
          tradeDd: ymdFromAsOf(asOf),
        });
        if (asOf) {
          const ms = Date.parse(asOf);
          if (Number.isFinite(ms) && ms >= maxAsOfMs) {
            maxAsOfMs = ms;
            maxAsOf = asOf;
          }
        }
      }
      continue;
    }
    const data = await res.json();
    for (const row of Array.isArray(data) ? data : []) {
      const t = normalizeTicker(row.ticker);
      if (!t) continue;
      const asOf = row.as_of ? String(row.as_of) : null;
      const tradeDd = compactYmd(row.trade_date) || ymdFromAsOf(asOf);
      rows.set(t, {
        last: numOrNull(row.last),
        asOf,
        tradeDd,
      });
      if (asOf) {
        const ms = Date.parse(asOf);
        if (Number.isFinite(ms) && ms >= maxAsOfMs) {
          maxAsOfMs = ms;
          maxAsOf = asOf;
        }
      }
    }
  }
  return { rows, maxAsOf };
}

/**
 * Build return source from optional in-memory quote rows (sync path).
 * @param {Array<{ ticker: string, last?: number, as_of?: string, tradeDate?: string, trade_date?: string }>} quoteRows
 */
function rowsFromQuoteOverrides(quoteRows) {
  const rows = new Map();
  let maxAsOf = null;
  let maxAsOfMs = 0;
  for (const q of quoteRows || []) {
    const t = normalizeTicker(q?.ticker);
    if (!t) continue;
    const asOf = q.as_of || q.asOf || null;
    const tradeDd =
      compactYmd(q.tradeDate || q.trade_date)
      || ymdFromAsOf(asOf);
    rows.set(t, {
      last: numOrNull(q.last),
      asOf: asOf ? String(asOf) : null,
      tradeDd,
    });
    if (asOf) {
      const ms = Date.parse(asOf);
      if (Number.isFinite(ms) && ms >= maxAsOfMs) {
        maxAsOfMs = ms;
        maxAsOf = String(asOf);
      }
    }
  }
  return { rows, maxAsOf };
}

/**
 * @param {{
 *   env: object,
 *   request?: Request|null,
 *   tickers: string[],
 *   refs?: object|null,
 *   quoteRows?: Array<object>|null,
 *   staleRefresh?: (codes: string[]) => Promise<{ items?: Record<string, { last?: number, tradeDate?: string }> }|null>,
 * }} args
 */
export async function loadReturnSource({
  env,
  request = null,
  tickers,
  refs: refsOverride = null,
  quoteRows = null,
  staleRefresh = null,
}) {
  const session = krxSessionInfo();
  const sessionOpen = !!(session.regular || session.aftermarket);
  const refs = await loadCachedReturnRefs(request, env, refsOverride);
  if (!refs?.quotes) {
    return {
      meta: {
        asOf: null,
        sessionOpen,
        numeratorMode: sessionOpen ? 'live' : 'official',
        anchorDd: null,
        refsRecentDd: null,
        k: 0,
        stale: false,
      },
      refs: null,
      byTicker: {},
    };
  }

  const codes = [...new Set((tickers || []).map(normalizeTicker).filter(Boolean))];
  let { rows, maxAsOf } = quoteRows
    ? rowsFromQuoteOverrides(quoteRows)
    : { rows: new Map(), maxAsOf: null };

  if (!quoteRows) {
    const config = getSupabaseConfig(env);
    if (!config) {
      return {
        meta: {
          asOf: null,
          sessionOpen,
          numeratorMode: sessionOpen ? 'live' : 'official',
          anchorDd: sessionOpen ? kstAnchorYmd() : compactYmd(refs.recentDd),
          refsRecentDd: compactYmd(refs.recentDd),
          k: 0,
          stale: false,
        },
        refs,
        byTicker: {},
      };
    }
    ({ rows, maxAsOf } = await fetchLatestQuoteRows(codes, config));
  }

  let stale = false;
  if (sessionOpen && staleRefresh && typeof staleRefresh === 'function') {
    const nowMs = Date.now();
    const staleCodes = [];
    for (const t of codes) {
      const row = rows.get(t);
      if (!row) {
        staleCodes.push(t);
        continue;
      }
      const asMs = row.asOf ? Date.parse(row.asOf) : NaN;
      if (!Number.isFinite(asMs) || nowMs - asMs > STALE_ASOF_MS) {
        staleCodes.push(t);
      }
    }
    if (staleCodes.length) {
      try {
        const refreshed = await staleRefresh(staleCodes);
        const items = refreshed?.items || {};
        for (const t of staleCodes) {
          const live = numOrNull(items[t]?.last);
          if (live == null) continue;
          const prev = rows.get(t) || { last: null, asOf: null, tradeDd: '' };
          rows.set(t, {
            ...prev,
            last: live,
            asOf: new Date().toISOString(),
            tradeDd:
              compactYmd(items[t]?.tradeDate || refreshed?.tradeDate)
              || prev.tradeDd
              || kstAnchorYmd(),
          });
          stale = true;
        }
      } catch {
        /* keep supabase last */
      }
    }
  }

  let liveTradeDd = '';
  for (const t of codes) {
    const td = rows.get(t)?.tradeDd;
    if (td && (!liveTradeDd || td > liveTradeDd)) liveTradeDd = td;
  }
  if (!liveTradeDd) liveTradeDd = ymdFromAsOf(maxAsOf) || kstAnchorYmd();

  const refsRecentDd = compactYmd(refs.recentDd);
  const numeratorMode = sessionOpen ? 'live' : 'official';
  const anchorDd = sessionOpen ? liveTradeDd : refsRecentDd;
  const k = refsRecentDd && anchorDd
    ? sessionsSince(refsRecentDd, anchorDd, refs.tradingDates || [])
    : 0;

  /** @type {Record<string, { numerator: number|null, closes: number[], shares: number|null, last: number|null, officialClose: number|null }>} */
  const byTicker = {};
  for (const t of codes) {
    const refQ = refs.quotes[t];
    const closes = refQ && Array.isArray(refQ.closes) ? refQ.closes : null;
    if (!closes || !closes.length) continue;
    const officialClose = numOrNull(closes[closes.length - 1]);
    const liveLast = sessionOpen ? numOrNull(rows.get(t)?.last) : null;
    const numerator = resolveNumerator({ liveLast, sessionOpen, officialClose });
    const shares = numOrNull(refQ.shares);
    byTicker[t] = {
      numerator,
      closes,
      shares: shares != null && shares > 0 ? shares : null,
      last: sessionOpen ? (liveLast ?? officialClose) : officialClose,
      officialClose,
    };
  }

  return {
    meta: {
      asOf: maxAsOf || new Date().toISOString(),
      sessionOpen,
      numeratorMode,
      anchorDd: anchorDd || null,
      refsRecentDd: refsRecentDd || null,
      k,
      stale,
    },
    refs,
    byTicker,
  };
}

/**
 * Map aggregateSectorReturns fields → hub_sectors returnXdPct keys.
 */
export function sectorReturnsToApiFields(agg) {
  return {
    return1dPct: agg?.chg1dPct ?? null,
    return5dPct: agg?.ret5dPct ?? null,
    return20dPct: agg?.ret20dPct ?? null,
    return50dPct: agg?.ret50dPct ?? null,
    return120dPct: agg?.ret120dPct ?? null,
    return200dPct: agg?.ret200dPct ?? null,
  };
}

/**
 * Official-mode (k=0) sector payload from hub_return_refs — static hub_sector_returns.json.
 * @param {object} hubIndex
 * @param {object} refs hub_return_refs.json
 */
export function buildOfficialSectorReturnsFromRefs(hubIndex, refs) {
  const recentDd = compactYmd(refs?.recentDd);
  const tradingDates = refs?.tradingDates || [];
  const k = 0;
  const totalMcap = uniqueHubMcapTotal(hubIndex);
  const sectors = {};
  let missingShares = 0;

  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const companiesInSector = block.companies || [];
    const members = [];
    for (const c of companiesInSector) {
      const t = normalizeTicker(c.ticker);
      const refQ = t && refs?.quotes ? refs.quotes[t] : null;
      const closes = refQ && Array.isArray(refQ.closes) ? refQ.closes : null;
      if (!closes?.length) continue;
      const officialClose = numOrNull(closes[closes.length - 1]);
      const shares = numOrNull(refQ.shares);
      if (shares == null || !(shares > 0)) {
        missingShares += 1;
        continue;
      }
      members.push({
        numerator: officialClose,
        closes,
        k,
        shares,
      });
    }
    const agg = aggregateSectorReturns(members);
    const sectorMcap = companiesInSector.reduce((s, c) => s + (c.mcapWon || 0), 0);
    sectors[sid] = {
      ...sectorReturnsToApiFields(agg),
      mcapWon: sectorMcap,
      weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
      listingCount: companiesInSector.length,
    };
  }

  return {
    asOf: refs?.asOf || new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: false,
    sessionOpen: false,
    numeratorMode: 'official',
    anchorDd: recentDd,
    refsRecentDd: recentDd,
    k: 0,
    stale: false,
    source: 'stock_aggregate_official',
    mcapRecentDd: recentDd,
    effectiveAnchorDd: recentDd,
    mcapPast1dDd: pastSessionDd(tradingDates, recentDd, 1),
    mcapPast5dDd: pastSessionDd(tradingDates, recentDd, 5),
    mcapPast20dDd: pastSessionDd(tradingDates, recentDd, 20),
    mcapPast50dDd: pastSessionDd(tradingDates, recentDd, 50),
    mcapPast120dDd: pastSessionDd(tradingDates, recentDd, 120),
    mcapPast200dDd: pastSessionDd(tradingDates, recentDd, 200),
    sectors,
    missingShares,
  };
}
