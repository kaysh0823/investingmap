/**
 * Shared apihub (T+1) OHLC overwrite for hub history rows.
 * repair_audited_history_closes.mjs and the daily reconcile both use this.
 */
import fs from 'node:fs';
import { historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';
import { normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';

const PAGE_SIZE = 1000;
const UPSERT_BATCH = 500;
const OHLC = ['open', 'high', 'low', 'close'];
const ANCHOR_TICKER = '005930';

export function price(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function samePrice(stored, expected) {
  const a = price(stored);
  const b = price(expected);
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

function fieldDiffs(db, krx) {
  const fields = [];
  for (const field of OHLC) {
    if (samePrice(db[field], krx[field])) continue;
    fields.push({ field, from: price(db[field]), to: price(krx[field]) });
  }
  return fields;
}

export function historyPayloadFromKrx(ticker, date, krx) {
  return {
    ticker,
    trade_date: date,
    open: krx.open,
    high: krx.high,
    low: krx.low,
    close: krx.close,
    volume: krx.volume,
    mcap_won: krx.mcap_won,
    turnover_won: krx.turnover_won,
    source: 'apihub',
  };
}

/**
 * Existing hub rows whose OHLC differs from apihub.
 * includeSource also rewrites rows that match OHLC but are not source=apihub.
 * Does not insert tickers missing from the DB.
 */
export function planApihubOverwrites(tickers, dbByTicker, market, date, { includeSource = false } = {}) {
  let checked = 0;
  const fixes = [];
  for (const ticker of tickers || []) {
    const krx = historyFieldsFromKrxRow(market?.get?.(ticker));
    const db = dbByTicker?.get?.(ticker) || null;
    if (!krx || !db) continue;
    checked += 1;
    const fields = fieldDiffs(db, krx);
    const source = db.source == null || db.source === '' ? null : String(db.source);
    if (includeSource && source !== 'apihub') {
      fields.push({ field: 'source', from: source, to: 'apihub' });
    }
    if (!fields.length) continue;
    fixes.push({
      ticker,
      fromSource: source,
      fields,
      payload: historyPayloadFromKrx(ticker, date, krx),
    });
  }
  return { checked, fixes };
}

export function sampleFixLines(fixes, limit = 3) {
  const lines = [];
  for (const row of fixes || []) {
    for (const field of row.fields || []) {
      lines.push(`${row.ticker} ${field.field} ${field.from}→${field.to}`);
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

export async function supabaseSelect(url, key, query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = `${url}/rest/v1/stock_price_history?${query}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`history fetch ${res.status}: ${(await res.text()).slice(0, 180)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchDbRowsForDate(url, key, date) {
  const rows = await supabaseSelect(
    url,
    key,
    `trade_date=eq.${date}&select=ticker,open,high,low,close,volume,source&order=ticker.asc`,
  );
  const byTicker = new Map();
  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    if (ticker) byTicker.set(ticker, row);
  }
  return byTicker;
}

export async function upsertApihubHistoryRows(url, key, rows) {
  const list = Array.isArray(rows) ? rows : [];
  let upserted = 0;
  for (let i = 0; i < list.length; i += UPSERT_BATCH) {
    const batch = list.slice(i, i + UPSERT_BATCH);
    const res = await fetch(`${url}/rest/v1/stock_price_history`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,on_conflict=ticker,trade_date,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`history upsert ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    upserted += batch.length;
  }
  return upserted;
}

/** Newest trading sessions strictly before today, from the anchor ticker's history. */
export async function recentClosedDates(url, key, todayDash, sessions = 5) {
  const endpoint =
    `${url}/rest/v1/stock_price_history?ticker=eq.${ANCHOR_TICKER}`
    + `&trade_date=lt.${todayDash}&select=trade_date&order=trade_date.desc&limit=${sessions}`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`anchor dates ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const rows = await res.json();
  return rows
    .map((row) => String(row.trade_date).slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayDash);
}

export function formatReconcileSummary(results) {
  const lines = [
    '### apihub reconcile',
    '',
    '| date | checked | fixed |',
    '|---|---:|---:|',
  ];
  for (const row of results || []) {
    lines.push(`| ${row.date} | ${row.checked} | ${row.fixed} |`);
  }
  return `${lines.join('\n')}\n`;
}

export function appendReconcileStepSummary(results) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file || !results?.length) return;
  fs.appendFileSync(file, `\n${formatReconcileSummary(results)}`);
}

/**
 * Last sessions before today. Empty apihub → skip that date, no throw.
 * @returns {{ dates: Array<{ date: string, checked: number, fixed: number, skipped: boolean }>, fixedTotal: number }}
 */
export async function reconcileRecentHistoryWithApihub({
  supabaseUrl,
  serviceKey,
  authKey,
  tickers,
  todayDash,
  sessions = 5,
  dates = null,
  fetchMarket,
  fetchDb = fetchDbRowsForDate,
  upsert = upsertApihubHistoryRows,
  writeSummary = true,
} = {}) {
  const list = Array.isArray(dates)
    ? dates.filter((date) => date && date < todayDash)
    : await recentClosedDates(supabaseUrl, serviceKey, todayDash, sessions);
  const results = [];
  for (const date of list) {
    const market = await fetchMarket(authKey, date.replaceAll('-', ''));
    if (!market || market.size === 0) {
      console.log(`apihub not ready ${date}`);
      results.push({ date, checked: 0, fixed: 0, skipped: true });
      continue;
    }
    const dbByTicker = await fetchDb(supabaseUrl, serviceKey, date);
    const plan = planApihubOverwrites(tickers, dbByTicker, market, date, { includeSource: true });
    const samples = sampleFixLines(plan.fixes, 3);
    console.log(`apihub reconcile ${date}: checked ${plan.checked}, fixed ${plan.fixes.length}`);
    for (const line of samples) console.log(`  ${line}`);
    if (plan.fixes.length) {
      await upsert(supabaseUrl, serviceKey, plan.fixes.map((row) => row.payload));
    }
    results.push({
      date,
      checked: plan.checked,
      fixed: plan.fixes.length,
      skipped: false,
    });
  }
  if (writeSummary) appendReconcileStepSummary(results);
  const fixedTotal = results.reduce((sum, row) => sum + row.fixed, 0);
  return { dates: results, fixedTotal };
}
