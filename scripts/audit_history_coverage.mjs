/**
 * Audit/repair stock_price_history against KRX for the current hub universe.
 * A row counts as covered only when it carries full OHLC + volume, so
 * close-only rows left by the Naver fallback are reported and repaired too.
 *
 * Usage:
 *   node scripts/audit_history_coverage.mjs --date=2026-08-14
 *   node scripts/audit_history_coverage.mjs --date=2026-08-14 --repair
 *   node scripts/audit_history_coverage.mjs --date=2026-08-14 --from=2025-11-01 \
 *     --tickers=0009K0,0126Z0 --repair
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMarketDay, historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;
const ANCHOR_TICKER = '005930';

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!env[key]) env[key] = value;
  }
  return env;
}

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function isoDateArg(name, required) {
  const value = argValue(name);
  if (!value) {
    if (required) throw new Error(`--${name}=YYYY-MM-DD is required`);
    return '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`--${name} must be YYYY-MM-DD`);
  return value;
}

function basDd(date) {
  return date.replaceAll('-', '');
}

function hubUniverse() {
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const names = new Map();
  for (const company of listHubCompanies(hub)) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker) continue;
    names.set(ticker, company.name || company.nameKo || company.nameEn || ticker);
  }
  return names;
}

async function supabaseSelect(url, key, query) {
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

/** Only rows with a full candle count as covered; close-only rows are repairable. */
function isComplete(row) {
  if (!row) return false;
  return ['open', 'high', 'low', 'close', 'volume'].every(
    (field) => row[field] != null && Number.isFinite(Number(row[field])),
  );
}

async function fetchDbRowsForDate(url, key, date) {
  const rows = await supabaseSelect(
    url,
    key,
    `trade_date=eq.${date}&select=ticker,open,high,low,close,volume&order=ticker.asc`,
  );
  return new Map(rows.map((row) => [normalizeTicker(row.ticker), row]));
}

async function fetchDbRowsForTickers(url, key, tickers, from, through) {
  const rows = await supabaseSelect(
    url,
    key,
    `ticker=in.(${tickers.join(',')})&trade_date=gte.${from}&trade_date=lte.${through}` +
      `&select=ticker,trade_date,open,high,low,close,volume&order=trade_date.asc`,
  );
  const byDate = new Map();
  for (const row of rows) {
    const date = String(row.trade_date).slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(normalizeTicker(row.ticker), row);
  }
  return byDate;
}

async function fetchAnchorDates(url, key, from, through) {
  const rows = await supabaseSelect(
    url,
    key,
    `ticker=eq.${ANCHOR_TICKER}&trade_date=gte.${from}&trade_date=lte.${through}` +
      `&select=trade_date&order=trade_date.asc`,
  );
  return rows.map((row) => String(row.trade_date).slice(0, 10));
}

async function upsertRows(url, key, rows) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const res = await fetch(`${url}/rest/v1/stock_price_history`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates, on_conflict=ticker,trade_date',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`history repair ${res.status}: ${(await res.text()).slice(0, 180)}`);
    upserted += batch.length;
  }
  return upserted;
}

function historyRow(ticker, date, krxRow) {
  const fields = historyFieldsFromKrxRow(krxRow);
  if (!fields) return null;
  return {
    ticker,
    trade_date: date,
    open: fields.open,
    high: fields.high,
    low: fields.low,
    close: fields.close,
    volume: fields.volume,
    mcap_won: fields.mcap_won,
  };
}

function label(tickers, names) {
  return tickers.map((ticker) => `${ticker}(${names.get(ticker) || ticker})`).join(', ');
}

async function auditDate({ url, readKey, serviceKey, authKey, date, names, repair }) {
  const expected = [...names.keys()].sort();
  const [dbByTicker, krxByTicker] = await Promise.all([
    fetchDbRowsForDate(url, readKey, date),
    fetchMarketDay(authKey, basDd(date)),
  ]);
  const tradable = expected.filter((ticker) => historyRow(ticker, date, krxByTicker.get(ticker)));
  const incomplete = tradable.filter((ticker) => !isComplete(dbByTicker.get(ticker)));
  const untraded = expected.filter((ticker) => !tradable.includes(ticker));

  console.log(`history coverage ${date}`);
  console.log(`hub tickers:     ${expected.length}`);
  console.log(`KRX-traded hub:  ${tradable.length}`);
  console.log(`full OHLC in DB: ${tradable.length - incomplete.length}/${tradable.length}`);
  if (incomplete.length) console.log(`needs repair:    ${label(incomplete, names)}`);
  if (untraded.length) console.log(`no KRX row:      ${label(untraded, names)}`);

  if (!repair || !incomplete.length) return incomplete.length;

  const rows = incomplete.map((ticker) => historyRow(ticker, date, krxByTicker.get(ticker)));
  console.log(`repaired:        ${await upsertRows(url, serviceKey, rows)}`);
  const after = await fetchDbRowsForDate(url, readKey, date);
  const remaining = tradable.filter((ticker) => !isComplete(after.get(ticker)));
  console.log(`remaining:       ${remaining.length}`);
  return remaining.length;
}

async function auditRange({
  url,
  readKey,
  serviceKey,
  authKey,
  tickers,
  from,
  through,
  names,
  repair,
}) {
  const dates = await fetchAnchorDates(url, readKey, from, through);
  const existing = await fetchDbRowsForTickers(url, readKey, tickers, from, through);
  console.log(`history range ${from}…${through} for ${label(tickers, names)}`);
  console.log(`sessions:        ${dates.length}`);

  let repaired = 0;
  let stillMissing = 0;
  for (const date of dates) {
    const rowsByTicker = existing.get(date) || new Map();
    const pending = tickers.filter((ticker) => !isComplete(rowsByTicker.get(ticker)));
    if (!pending.length) continue;
    const krxByTicker = await fetchMarketDay(authKey, basDd(date));
    const rows = pending
      .map((ticker) => historyRow(ticker, date, krxByTicker.get(ticker)))
      .filter(Boolean);
    if (!rows.length) continue;
    if (repair) {
      await upsertRows(url, serviceKey, rows);
      repaired += rows.length;
      process.stdout.write(`\r  repaired ${repaired} row(s) through ${date}`);
    } else {
      stillMissing += rows.length;
    }
  }
  if (repaired) process.stdout.write('\n');
  console.log(repair ? `repaired rows:   ${repaired}` : `repairable rows: ${stillMissing}`);

  const after = await fetchDbRowsForTickers(url, readKey, tickers, from, through);
  for (const ticker of tickers) {
    let complete = 0;
    let first = '';
    let last = '';
    for (const date of dates) {
      const row = (after.get(date) || new Map()).get(ticker);
      if (!isComplete(row)) continue;
      complete += 1;
      if (!first) first = date;
      last = date;
    }
    console.log(`  ${ticker}: ${complete} full session(s) ${first || '-'}…${last || '-'}`);
  }
  return repair ? 0 : stillMissing;
}

async function main() {
  const env = loadEnv();
  const date = isoDateArg('date', true);
  const from = isoDateArg('from', false);
  const repair = process.argv.includes('--repair');
  const tickers = argValue('tickers')
    .split(',')
    .map((item) => normalizeTicker(item))
    .filter(Boolean);

  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const readKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = env.KRX_AUTH_KEY || '';
  if (!url || !readKey || !authKey) {
    throw new Error('SUPABASE_URL, Supabase key, and KRX_AUTH_KEY are required');
  }
  if (repair && !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --repair');

  const names = hubUniverse();
  const outstanding =
    from && tickers.length
      ? await auditRange({
          url,
          readKey,
          serviceKey,
          authKey,
          tickers,
          from,
          through: date,
          names,
          repair,
        })
      : await auditDate({ url, readKey, serviceKey, authKey, date, names, repair });
  if (outstanding) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
