/**
 * Backfill stock_price_history: KRX trading days × full KOSPI/KOSDAQ universe → Supabase.
 * Reuses tradingDates + fetchMarketDay from functions/lib/krx_yoy.mjs.
 * Usage: node scripts/backfill_price_history.mjs [--days=260]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tradingDates, fetchMarketDay, historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIST_TRADING_DAYS = 260;
const KRX_DELAY_MS = 200;
const KRX_MAX_RETRIES = 2;
const UPSERT_BATCH_SIZE = 500;
const UPSERT_MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[k]) env[k] = v;
  }
  return env;
}

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function basDdToTradeDate(basDd) {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function rowsFromMarketDay(byCode, tradeDate) {
  const rows = [];
  for (const [ticker, row] of byCode) {
    const fields = historyFieldsFromKrxRow(row);
    if (!fields) continue;
    rows.push({
      ticker,
      trade_date: tradeDate,
      open: fields.open,
      high: fields.high,
      low: fields.low,
      close: fields.close,
      volume: fields.volume,
      mcap_won: fields.mcap_won,
    });
  }
  return rows;
}

async function fetchMarketDayWithRetry(authKey, basDd) {
  let lastErr = null;
  for (let attempt = 0; attempt <= KRX_MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(KRX_DELAY_MS);
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (byCode && byCode.size > 0) return { ok: true, byCode };
      lastErr = new Error(`empty market day ${basDd}`);
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, error: lastErr };
}

async function upsertBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_price_history`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=ticker,trade_date',
    },
    body: JSON.stringify(rows),
  });

  if (res.ok) return { ok: true };

  const body = await res.text();
  if (attempt < UPSERT_MAX_RETRIES) {
    await sleep(KRX_DELAY_MS);
    return upsertBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body };
}

async function upsertDayRows(rows, supabaseUrl, serviceKey) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const result = await upsertBatch(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      return { ok: false, inserted, error: result.body };
    }
    inserted += batch.length;
    if (i + UPSERT_BATCH_SIZE < rows.length) await sleep(KRX_DELAY_MS);
  }
  return { ok: true, inserted };
}

async function main() {
  const started = Date.now();
  const env = loadEnv();
  const authKey = env.KRX_AUTH_KEY || '';
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!authKey) {
    console.error('KRX_AUTH_KEY is required');
    process.exit(1);
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? Math.max(1, parseInt(daysArg.split('=')[1], 10) || HIST_TRADING_DAYS) : HIST_TRADING_DAYS;

  const dates = tradingDates(days).reverse();
  console.log(`Backfill ${dates.length} trading days → stock_price_history`);

  const failedDates = [];
  const emptyDates = [];
  let datesOk = 0;
  let totalRows = 0;

  for (let i = 0; i < dates.length; i++) {
    const basDd = dates[i];
    const tradeDate = basDdToTradeDate(basDd);

    if (i > 0) await sleep(KRX_DELAY_MS);

    const fetched = await fetchMarketDayWithRetry(authKey, basDd);
    if (!fetched.ok) {
      // Empty/holiday responses are expected; only hard-fail on upsert errors.
      emptyDates.push(basDd);
      console.error(`\n  KRX empty/skip ${basDd}: ${fetched.error?.message || fetched.error}`);
      continue;
    }

    const rows = rowsFromMarketDay(fetched.byCode, tradeDate);
    if (!rows.length) {
      emptyDates.push(basDd);
      console.error(`\n  no rows for ${basDd}`);
      continue;
    }

    const upserted = await upsertDayRows(rows, supabaseUrl, serviceKey);
    if (!upserted.ok) {
      failedDates.push(basDd);
      console.error(`\n  Supabase upsert failed ${basDd}: ${(upserted.error || '').slice(0, 200)}`);
      continue;
    }

    datesOk += 1;
    totalRows += upserted.inserted;
    process.stdout.write(
      `\r  ${i + 1}/${dates.length} ${tradeDate} — ${upserted.inserted} rows (total ${totalRows})`,
    );
  }

  process.stdout.write('\n');
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log('\n=== backfill_price_history summary ===');
  console.log(`dates scheduled:   ${dates.length}`);
  console.log(`dates processed:   ${datesOk}`);
  console.log(`dates empty/skip:  ${emptyDates.length}`);
  console.log(`dates failed:      ${failedDates.length}`);
  console.log(`total rows upsert: ${totalRows}`);
  console.log(`elapsed:           ${elapsedSec}s`);

  if (emptyDates.length) {
    console.log(`empty/skip dates: ${emptyDates.join(', ')}`);
  }
  if (failedDates.length) {
    console.log(`failed dates: ${failedDates.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
