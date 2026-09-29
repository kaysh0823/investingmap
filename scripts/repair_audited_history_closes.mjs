/**
 * Overwrite hub OHLC rows that the close audit already flagged.
 * Only dates present in docs/reports/history_close_audit.json are eligible.
 *
 *   node scripts/repair_audited_history_closes.mjs --dates=2026-09-22,2026-09-23,2026-09-28
 *
 * Writes source=apihub on mismatched rows only. Does not insert missing tickers
 * and does not touch any other trade date.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMarketDay, getAuthKey } from '../functions/lib/krx_yoy.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import {
  fetchDbRowsForDate,
  planApihubOverwrites,
  upsertApihubHistoryRows,
} from './history_apihub_reconcile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'history_close_audit.json');
const SAMPLE_TICKERS = ['005930', '000660', '036930', '042700'];

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

function hubTickers() {
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const tickers = [];
  const seen = new Set();
  for (const company of listHubCompanies(hub)) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
  }
  return tickers;
}

function mismatchesForDate(tickers, dbByTicker, market, date) {
  return planApihubOverwrites(tickers, dbByTicker, market, date).fixes;
}

function printSamples(date, rows) {
  const preferred = SAMPLE_TICKERS
    .map((ticker) => rows.find((row) => row.ticker === ticker))
    .filter(Boolean);
  const rest = rows.filter((row) => !SAMPLE_TICKERS.includes(row.ticker)).slice(0, 4);
  for (const row of [...preferred, ...rest]) {
    const changes = row.fields.map((field) => `${field.field} ${field.from}→${field.to}`).join(', ');
    console.log(`  ${row.ticker} ${date} ${changes} (${row.fromSource || 'null'}→apihub)`);
  }
}

async function main() {
  const requested = argValue('dates')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!requested.length) throw new Error('--dates=YYYY-MM-DD,YYYY-MM-DD is required');

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const reported = new Map((report.byDate || []).map((row) => [row.date, row]));
  for (const date of requested) {
    const entry = reported.get(date);
    if (!entry) throw new Error(`${date} is not in history_close_audit.json — refusing`);
    if (!(entry.mismatch > 0) || entry.source !== 'apihub') {
      throw new Error(`${date} has no apihub mismatch in the report — refusing`);
    }
  }

  const env = loadEnv();
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = getAuthKey(env);
  if (!url || !key || !authKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KRX_AUTH_KEY are required');
  }

  const tickers = hubTickers();
  let beforeTotal = 0;
  let afterTotal = 0;
  let upsertedTotal = 0;

  for (const date of requested) {
    const market = await fetchMarketDay(authKey, date.replaceAll('-', ''));
    if (!market || market.size === 0) {
      throw new Error(`${date}: apihub empty — wrote nothing for this date`);
    }
    const beforeDb = await fetchDbRowsForDate(url, key, date);
    const before = mismatchesForDate(tickers, beforeDb, market, date);
    const reportCount = reported.get(date).mismatch;
    console.log(`${date} before ${before.length} (report ${reportCount})`);
    printSamples(date, before);
    beforeTotal += before.length;

    const upserted = await upsertApihubHistoryRows(url, key, before.map((row) => row.payload));
    upsertedTotal += upserted;

    const afterDb = await fetchDbRowsForDate(url, key, date);
    const after = mismatchesForDate(tickers, afterDb, market, date);
    afterTotal += after.length;
    console.log(`${date} upserted ${upserted} after ${after.length}`);
    if (after.length) printSamples(date, after);
  }

  console.log(`total before ${beforeTotal} upserted ${upsertedTotal} after ${afterTotal}`);
  if (afterTotal > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
