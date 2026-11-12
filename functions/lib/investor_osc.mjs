/** Daily investor supply indicators for trust, private equity, pension and foreign investors. */

import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';
import { putHubCache, readHubCache } from './hub_api_cache.mjs';

/** Edge cache for ticker-agnostic investor_net depth signature. */
const INVESTOR_DEPTH_SIG_CACHE = '/api/_sig/investor_depth/v4';
const INVESTOR_DEPTH_SIG_MAX_AGE = 60;

export const INVESTOR_INST_CODES = Object.freeze(['3000', '3100', '6000']);
export const INVESTOR_FRGN_CODE = '9000';
export const INVESTOR_OSC_CODES = Object.freeze([
  ...INVESTOR_INST_CODES,
  INVESTOR_FRGN_CODE,
]);
const CUM_WINDOW = 5;
const BAND_WINDOW = 20;
const RANK_WINDOW = 125;
const SUPPLY_CODE_SET = new Set(INVESTOR_OSC_CODES);

export function groupInvestorNetByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const date = String(row.trade_date || '').slice(0, 10);
    const code = String(row.invst_tp_cd || '');
    const net = numOrNull(row.net_val);
    if (!date || !SUPPLY_CODE_SET.has(code) || net == null) continue;
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(code, net);
  }
  return byDate;
}

export function attachInvestorSupplyToBars(bars, byDate) {
  const daily = [];
  const cumulative = [];
  const widths = [];
  for (const bar of bars) {
    bar.supplyPercentB = null;
    bar.supplyBandwidthRank = null;
    const net = byDate.get(bar.t);
    // KRX category reports can omit individual tickers. Sum the available
    // categories and leave sessions without any usable observation blank.
    if (!net?.size) continue;
    const flow = INVESTOR_OSC_CODES.reduce((sum, code) => sum + (net.get(code) ?? 0), 0);
    if (!Number.isFinite(flow)) continue;
    daily.push(flow);
    if (daily.length < CUM_WINDOW) continue;

    // Count observations so an unpublished session doesn't reset each window.
    const cum = daily.slice(-CUM_WINDOW).reduce((sum, value) => sum + value, 0);
    cumulative.push(cum);
    if (cumulative.length < BAND_WINDOW) continue;

    const band = cumulative.slice(-BAND_WINDOW);
    const mean = band.reduce((sum, value) => sum + value, 0) / BAND_WINDOW;
    const variance = band.reduce((sum, value) => sum + (value - mean) ** 2, 0) / BAND_WINDOW;
    const width = band.every((value) => value === cum) ? 0 : 4 * Math.sqrt(variance);
    if (width > 0) bar.supplyPercentB = 0.5 + (cum - mean) / width;
    widths.push(width);

    const window = widths.slice(-RANK_WINDOW);
    if (window.length === RANK_WINDOW) {
      // Midrank for ties. Exclude today's observation from the comparison.
      let rank = 0;
      for (const prior of window.slice(0, -1)) {
        if (prior < width) rank += 1;
        else if (prior === width) rank += 0.5;
      }
      bar.supplyBandwidthRank = (rank * 100) / (RANK_WINDOW - 1);
    }
  }
  return bars;
}

/**
 * @param {{ url: string, anonKey: string }} config
 * @param {string} ticker
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate YYYY-MM-DD
 */
export async function fetchInvestorNetForRange(config, ticker, fromDate, toDate) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const q =
      `stock_investor_net?ticker=eq.${encodeURIComponent(ticker)}` +
      `&invst_tp_cd=in.(${INVESTOR_OSC_CODES.join(',')})` +
      `&trade_date=gte.${fromDate}&trade_date=lte.${toDate}` +
      `&select=trade_date,invst_tp_cd,net_val&order=trade_date.asc,invst_tp_cd.asc` +
      `&limit=${pageSize}&offset=${offset}`;
    const page = await fetchSupabaseJson(config, q);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Cache the earliest and latest investor-net dates so depth backfills invalidate OHLC.
 *
 * @param {{ url: string, anonKey: string }} config
 * @param {{ origin?: string, context?: { waitUntil?: Function } }} [cacheCtx]
 * @returns {Promise<string>}
 */
export async function fetchLatestInvestorNetSignature(config, cacheCtx = {}) {
  const origin = cacheCtx.origin || '';
  if (origin) {
    try {
      const hit = await readHubCache(INVESTOR_DEPTH_SIG_CACHE, origin);
      if (hit) {
        const body = await hit.json();
        if (body && typeof body.sig === 'string' && body.sig) return body.sig;
      }
    } catch {
      /* miss / parse error → fetch */
    }
  }

  const ymd = (row) =>
    row?.trade_date ? String(row.trade_date).slice(0, 10).replace(/-/g, '') : null;
  const depthSig = async (table) => {
    try {
      const [maxRows, minRows] = await Promise.all([
        fetchSupabaseJson(config, `${table}?select=trade_date&order=trade_date.desc&limit=1`),
        fetchSupabaseJson(config, `${table}?select=trade_date&order=trade_date.asc&limit=1`),
      ]);
      const maxYmd = ymd(Array.isArray(maxRows) && maxRows[0] ? maxRows[0] : null);
      if (!maxYmd) return 'none';
      const minYmd = ymd(Array.isArray(minRows) && minRows[0] ? minRows[0] : null) || maxYmd;
      return `${minYmd}-${maxYmd}`;
    } catch {
      return 'none';
    }
  };

  const sig = `inv-v11-${await depthSig('stock_investor_net')}`;

  if (origin && cacheCtx.context) {
    try {
      const cached = new Response(JSON.stringify({ sig }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${INVESTOR_DEPTH_SIG_MAX_AGE}`,
        },
      });
      putHubCache(cacheCtx.context, INVESTOR_DEPTH_SIG_CACHE, origin, cached);
    } catch {
      /* ignore cache put */
    }
  }
  return sig;
}

/**
 * ISO week key (UTC), matching candle_modal.aggregateWeeklyBars.
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} e.g. 2026-W09
 */
export function isoWeekKey(isoDate) {
  const parts = String(isoDate || '').split('-');
  if (parts.length !== 3) return String(isoDate || '');
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  if (!Number.isFinite(date.getTime())) return String(isoDate || '');
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Aggregate daily OHLCV into ISO weeks (timestamp = week's last session).
 * Same rules as js/candle_modal.js aggregateWeeklyBars.
 * @param {Array<{ t: string, o?: number|null, h?: number|null, l?: number|null, c: number, v?: number|null }>} dailyBars
 */
export function aggregateDailyBarsToWeekly(dailyBars) {
  const out = [];
  let current = null;
  for (const bar of dailyBars || []) {
    if (!bar?.t) continue;
    const key = isoWeekKey(bar.t);
    if (!current || current.key !== key) {
      if (current) {
        const { key: _k, ...rest } = current;
        out.push(rest);
      }
      current = {
        key,
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: Number(bar.v) || 0,
      };
    } else {
      current.t = bar.t;
      current.h =
        current.h == null || bar.h == null
          ? current.h ?? bar.h
          : Math.max(current.h, bar.h);
      current.l =
        current.l == null || bar.l == null
          ? current.l ?? bar.l
          : Math.min(current.l, bar.l);
      current.c = bar.c;
      current.v += Number(bar.v) || 0;
    }
    current.supplyPercentB = bar.supplyPercentB;
    current.supplyBandwidthRank = bar.supplyBandwidthRank;
  }
  if (current) {
    const { key: _k, ...rest } = current;
    out.push(rest);
  }
  return out;
}

export async function loadAndAttachInvestorSupply(config, ticker, bars) {
  if (!bars.length) return bars;
  let rows = [];
  try {
    rows = await fetchInvestorNetForRange(config, ticker, bars[0].t, bars.at(-1).t);
  } catch (err) {
    console.warn('[investor_osc] fetch failed:', err?.message ?? err);
  }
  return attachInvestorSupplyToBars(bars, groupInvestorNetByDate(rows));
}
