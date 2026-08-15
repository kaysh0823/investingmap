/**
 * Audit/repair one stock_price_history session against the current hub universe.
 * Usage:
 *   node scripts/audit_history_coverage.mjs --date=2026-08-14
 *   node scripts/audit_history_coverage.mjs --date=2026-08-14 --repair
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchMarketDay,
  historyFieldsFromKrxRow,
} from '../functions/lib/krx_yoy.mjs';
import {
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;

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

function dateArg() {
  const arg = process.argv.find((item) => item.startsWith('--date='));
  const value = arg ? arg.slice('--date='.length) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--date=YYYY-MM-DD is required');
  }
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

async function fetchDbTickers(url, key, date) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint =
      `${url}/rest/v1/stock_price_history?trade_date=eq.${date}` +
      `&select=ticker,open,high,low,close,volume&order=ticker.asc` +
      `&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`history fetch ${res.status}: ${(await res.text()).slice(0, 180)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return new Map(rows.map((row) => [normalizeTicker(row.ticker), row]));
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

function displayTickers(tickers, names) {
  return tickers.map((ticker) => `${ticker}(${names.get(ticker) || ticker})`).join(', ');
}

async function main() {
  const env = loadEnv();
  const date = dateArg();
  const repair = process.argv.includes('--repair');
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const readKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = env.KRX_AUTH_KEY || '';
  if (!url || !readKey || !authKey) {
    throw new Error('SUPABASE_URL, Supabase key, and KRX_AUTH_KEY are required');
  }
  if (repair && !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --repair');

  const names = hubUniverse();
  const expected = [...names.keys()].sort();
  const [dbByTicker, krxByTicker] = await Promise.all([
    fetchDbTickers(url, readKey, date),
    fetchMarketDay(authKey, basDd(date)),
  ]);
  const missing = expected.filter((ticker) => !dbByTicker.has(ticker));
  const krxExpected = expected.filter((ticker) => {
    const row = krxByTicker.get(ticker);
    return !!historyFieldsFromKrxRow(row);
  });
  const repairable = missing.filter((ticker) => {
    const row = krxByTicker.get(ticker);
    return !!historyFieldsFromKrxRow(row);
  });
  const absentFromKrx = missing.filter((ticker) => !repairable.includes(ticker));

  console.log(`history coverage ${date}`);
  console.log(`hub tickers:       ${expected.length}`);
  console.log(`KRX-traded hub:    ${krxExpected.length}`);
  console.log(
    `DB KRX coverage:   ${krxExpected.length - repairable.length}/${krxExpected.length}`,
  );
  console.log(`missing:           ${missing.length}`);
  console.log(`repairable by KRX: ${repairable.length}`);
  console.log(`absent from KRX:   ${absentFromKrx.length}`);
  if (missing.length) console.log(`missing tickers:   ${displayTickers(missing, names)}`);
  if (absentFromKrx.length) {
    console.log(`no KRX row:        ${displayTickers(absentFromKrx, names)}`);
  }

  if (repair && repairable.length) {
    const rows = repairable.map((ticker) => {
      const fields = historyFieldsFromKrxRow(krxByTicker.get(ticker));
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
    });
    console.log(`repaired:          ${await upsertRows(url, serviceKey, rows)}`);
    const after = await fetchDbTickers(url, readKey, date);
    const remaining = expected.filter((ticker) => !after.has(ticker));
    const remainingRequired = krxExpected.filter((ticker) => !after.has(ticker));
    console.log(`remaining:         ${remaining.length}`);
    if (remaining.length) console.log(`remaining tickers: ${displayTickers(remaining, names)}`);
    if (remainingRequired.length) process.exitCode = 2;
  } else if (repairable.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
