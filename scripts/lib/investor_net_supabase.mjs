/**
 * Shared Supabase helpers for stock_investor_net sync/backfill.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tradingDates, recentDateCandidates } from '../../functions/lib/krx_yoy.mjs';
import {
  fetchKrxInvestorNet,
  INVESTOR_NET_CODES,
  ymdToDash,
} from '../../functions/lib/krx_investor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UPSERT_BATCH = 500;
const UPSERT_MAX_RETRIES = 2;

export { INVESTOR_NET_CODES, ymdToDash };

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

export async function resolveLatestTradeYmd(env, now = new Date()) {
  const dates = tradingDates(12, now);
  for (const dayYmd of recentDateCandidates(dates, now).slice(0, 6)) {
    const probe = await fetchKrxInvestorNet(dayYmd, '9000', env);
    if (probe.length >= 50) return dayYmd;
  }
  throw new Error('KRX investor net unavailable for recent trading days');
}

export async function upsertInvestorNetBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_investor_net`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=trade_date,ticker,invst_tp_cd',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  if (attempt < UPSERT_MAX_RETRIES) {
    await sleep(800);
    return upsertInvestorNetBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body, status: res.status };
}

export async function upsertInvestorNetRows(rows, supabaseUrl, serviceKey) {
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const result = await upsertInvestorNetBatch(batch, supabaseUrl, serviceKey);
    if (result.ok) upserted += batch.length;
    else {
      failed += batch.length;
      console.error(
        `  investor_net upsert failed (${result.status}): ${(result.body || '').slice(0, 200)}`,
      );
    }
  }
  return { upserted, failed };
}

export async function fetchExistingInvestorNetDates(supabaseUrl, serviceKey, sampleTicker = '005930') {
  const dates = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_investor_net?ticker=eq.${sampleTicker}` +
      `&select=trade_date&order=trade_date.desc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || body.includes('stock_investor_net')) {
        throw new Error(
          'stock_investor_net table missing — apply supabase/migrations/0015_investor_net.sql first',
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

export async function syncInvestorNetDay(dayYmd, supabaseUrl, serviceKey, codes = INVESTOR_NET_CODES, env = process.env) {
  const tradeDate = ymdToDash(dayYmd);
  let totalRows = 0;
  let upserted = 0;
  let failed = 0;

  for (const invstTpCd of codes) {
    console.log(`  fetch ${tradeDate} invstTpCd=${invstTpCd}…`);
    const parsed = await fetchKrxInvestorNet(dayYmd, invstTpCd, env);
    console.log(`    rows=${parsed.length}`);
    if (!parsed.length) continue;

    const rows = parsed.map((r) => ({
      trade_date: tradeDate,
      ticker: r.ticker,
      invst_tp_cd: invstTpCd,
      net_val: r.net_val,
    }));
    totalRows += rows.length;
    const result = await upsertInvestorNetRows(rows, supabaseUrl, serviceKey);
    upserted += result.upserted;
    failed += result.failed;
    await sleep(350);
  }

  return { tradeDate, totalRows, upserted, failed };
}

export async function queryInvestorNetForTicker(supabaseUrl, serviceKey, ticker, tradeDate) {
  const url =
    `${supabaseUrl}/rest/v1/stock_investor_net?ticker=eq.${ticker}` +
    `&trade_date=eq.${tradeDate}&select=invst_tp_cd,net_val&order=invst_tp_cd.asc`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return [];
  return res.json();
}
