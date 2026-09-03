/**
 * Shared Supabase helpers for stock_foreign_ratio sync/backfill.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tradingDates, recentDateCandidates } from '../../functions/lib/krx_yoy.mjs';
import { fetchKrxForeignRatio, ymdToDash } from '../../functions/lib/krx_foreign_ratio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UPSERT_BATCH = 500;
const UPSERT_MAX_RETRIES = 2;

export { ymdToDash };

export function loadEnv() {
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

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Dedupe by ticker before upsert (last row wins). */
export function dedupeForeignRatioByTicker(rows, label = '') {
  if (!rows.length) return rows;
  const byTicker = new Map();
  const dupTickers = [];

  for (const r of rows) {
    if (byTicker.has(r.ticker) && !dupTickers.includes(r.ticker)) {
      dupTickers.push(r.ticker);
    }
    byTicker.set(r.ticker, r);
  }

  if (dupTickers.length) {
    const sample = dupTickers.slice(0, 8).join(', ');
    const more = dupTickers.length > 8 ? ` +${dupTickers.length - 8} more` : '';
    console.warn(
      `  foreign_ratio duplicate tickers${label ? ` ${label}` : ''}: ${dupTickers.length} (${sample}${more})`,
    );
  }

  return [...byTicker.values()];
}

export async function resolveLatestForeignRatioYmd(env, now = new Date()) {
  const dates = tradingDates(12, now);
  for (const dayYmd of recentDateCandidates(dates, now).slice(0, 6)) {
    const probe = await fetchKrxForeignRatio(dayYmd, env);
    if (probe.length >= 50) return dayYmd;
  }
  throw new Error('KRX foreign ratio unavailable for recent trading days');
}

export async function upsertForeignRatioBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_foreign_ratio`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=trade_date,ticker',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  if (attempt < UPSERT_MAX_RETRIES) {
    await sleep(800);
    return upsertForeignRatioBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body, status: res.status };
}

export async function upsertForeignRatioRows(rows, supabaseUrl, serviceKey) {
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const result = await upsertForeignRatioBatch(batch, supabaseUrl, serviceKey);
    if (result.ok) upserted += batch.length;
    else {
      failed += batch.length;
      console.error(
        `  foreign_ratio upsert failed (${result.status}): ${(result.body || '').slice(0, 200)}`,
      );
    }
  }
  return { upserted, failed };
}

export async function fetchExistingForeignRatioDates(supabaseUrl, serviceKey, sampleTicker = '005930') {
  const dates = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_foreign_ratio?ticker=eq.${sampleTicker}` +
      `&select=trade_date&order=trade_date.desc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || body.includes('stock_foreign_ratio')) {
        throw new Error(
          'stock_foreign_ratio table missing — apply supabase/migrations/0017_foreign_ratio.sql first',
        );
      }
      throw new Error(`existing dates fetch ${res.status}: ${body.slice(0, 160)}`);
    }
    const page = await res.json();
    for (const row of page) {
      if (row?.trade_date) dates.add(String(row.trade_date).slice(0, 10));
    }
    if (page.length < pageSize) break;
  }
  return dates;
}

export async function syncForeignRatioDay(dayYmd, supabaseUrl, serviceKey, env = process.env) {
  const tradeDate = ymdToDash(dayYmd);
  console.log(`  fetch ${tradeDate} foreign ratio…`);
  const parsed = await fetchKrxForeignRatio(dayYmd, env);
  console.log(`    rows=${parsed.length}`);
  if (!parsed.length) {
    return { tradeDate, totalRows: 0, upserted: 0, failed: 0 };
  }

  const rows = parsed.map((r) => ({
    trade_date: tradeDate,
    ticker: r.ticker,
    hold_ratio: r.hold_ratio,
  }));
  const deduped = dedupeForeignRatioByTicker(rows, tradeDate);
  if (deduped.length !== rows.length) {
    console.log(`    deduped ${rows.length} → ${deduped.length}`);
  }
  const result = await upsertForeignRatioRows(deduped, supabaseUrl, serviceKey);
  return {
    tradeDate,
    totalRows: deduped.length,
    upserted: result.upserted,
    failed: result.failed,
  };
}

export async function queryForeignRatioForTicker(supabaseUrl, serviceKey, ticker, tradeDate) {
  const url =
    `${supabaseUrl}/rest/v1/stock_foreign_ratio?ticker=eq.${ticker}` +
    `&trade_date=eq.${tradeDate}&select=hold_ratio`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0].hold_ratio : null;
}
