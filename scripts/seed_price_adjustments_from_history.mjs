/**
 * One-time seed: scan stock_price_history for split/merge events → price_adjustments.
 * Usage:
 *   node scripts/seed_price_adjustments_from_history.mjs
 *   node scripts/seed_price_adjustments_from_history.mjs --ticker=278470
 *   node scripts/seed_price_adjustments_from_history.mjs --dry-run
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or service key in .dev.vars)
 * Migration 0014_price_adjustments.sql must be applied first.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import {
  detectEventsFromHistoryRows,
  sharesFromHistoryRow,
  upsertPriceAdjustments,
} from '../functions/lib/price_adjustments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APR_TICKER = '278470';
const APR_EVENT_DATE = '2024-10-31';
const APR_EVENT_RATIO = 5;

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

function parseArgs(argv) {
  const out = { dryRun: false, tickers: null };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--ticker=')) {
      out.tickers = [normalizeTicker(arg.slice('--ticker='.length))].filter(Boolean);
    } else if (arg.startsWith('--tickers=')) {
      out.tickers = arg
        .slice('--tickers='.length)
        .split(',')
        .map((t) => normalizeTicker(t.trim()))
        .filter(Boolean);
    }
  }
  return out;
}

function loadDefaultTickers() {
  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const seen = new Set();
  const tickers = [];
  for (const c of listHubCompanies(hubIndex)) {
    const t = normalizeTicker(c.ticker);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    tickers.push(t);
  }
  if (!seen.has(APR_TICKER)) tickers.push(APR_TICKER);
  return tickers.sort();
}

async function fetchTickerHistory(supabaseUrl, serviceKey, ticker) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?ticker=eq.${encodeURIComponent(ticker)}` +
      `&select=trade_date,close,mcap_won&order=trade_date.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      throw new Error(`history_fetch_${ticker}:${res.status}:${(await res.text()).slice(0, 120)}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function verifyAprEvent(allEvents) {
  const hit = allEvents.find(
    (e) =>
      e.ticker === APR_TICKER &&
      String(e.effective_date).slice(0, 10) === APR_EVENT_DATE &&
      Number(e.ratio) === APR_EVENT_RATIO,
  );
  return { ok: !!hit, hit };
}

const env = loadEnv();
const args = parseArgs(process.argv.slice(2));
const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or service key in env / .dev.vars');
  process.exit(1);
}

const tickers = args.tickers?.length ? args.tickers : loadDefaultTickers();
console.log(`seed_price_adjustments_from_history: ${tickers.length} ticker(s)${args.dryRun ? ' [dry-run]' : ''}`);

const allEvents = [];
let scanned = 0;
let skippedShort = 0;

for (const ticker of tickers) {
  const history = await fetchTickerHistory(supabaseUrl, serviceKey, ticker);
  scanned += 1;
  if (history.length < 2) {
    skippedShort += 1;
    continue;
  }
  const events = detectEventsFromHistoryRows(ticker, history, 'auto-seed');
  for (const ev of events) allEvents.push(ev);
  if (events.length) {
    console.log(`  ${ticker}: ${events.length} event(s)`);
    for (const ev of events) {
      console.log(`    ${ev.effective_date} ratio=${ev.ratio} type=${ev.type} (${ev.note})`);
    }
  }
  if (scanned % 50 === 0) {
    process.stdout.write(`\r  scanned ${scanned}/${tickers.length}`);
  }
}
if (scanned >= 50) process.stdout.write('\n');

console.log(`\nDetected ${allEvents.length} event(s) across ${scanned} ticker(s) (${skippedShort} with <2 bars)`);

if (allEvents.length) {
  console.log('\n--- All detected events (review) ---');
  const sorted = [...allEvents].sort(
    (a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      String(a.effective_date).localeCompare(String(b.effective_date)),
  );
  for (const ev of sorted) {
    console.log(
      `${ev.ticker}\t${ev.effective_date}\tratio=${ev.ratio}\t${ev.type}\t${ev.source}\t${ev.note || ''}`,
    );
  }
}

const aprCheck = verifyAprEvent(allEvents);

async function deleteAutoSeedAdjustments(supabaseUrl, serviceKey) {
  const url =
    `${supabaseUrl}/rest/v1/price_adjustments?source=eq.auto-seed`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`delete auto-seed failed: ${res.status} ${body.slice(0, 120)}`);
  }
}

if (aprCheck.ok) {
  console.log(`\nOK APR ${APR_TICKER} ${APR_EVENT_DATE} ratio=${APR_EVENT_RATIO} detected`);
} else {
  console.error(
    `\nFAIL APR ${APR_TICKER} must have ${APR_EVENT_DATE} ratio=${APR_EVENT_RATIO} — not found in scan`,
  );
  if (tickers.includes(APR_TICKER)) {
    try {
      const aprHist = await fetchTickerHistory(supabaseUrl, serviceKey, APR_TICKER);
      console.error(`  APR history bars: ${aprHist.length}`);
      const window = aprHist.filter(
        (r) => r.trade_date >= '2024-10-25' && r.trade_date <= '2024-11-05',
      );
      for (const r of window) {
        const sh = sharesFromHistoryRow(r);
        console.error(
          `  ${r.trade_date} close=${r.close} mcap=${r.mcap_won} shares~${sh}`,
        );
      }
    } catch (e) {
      console.error(`  APR history debug failed: ${e.message || e}`);
    }
  }
  if (!args.dryRun) process.exit(1);
}

if (!args.dryRun && allEvents.length) {
  console.log('\nClearing prior auto-seed rows…');
  await deleteAutoSeedAdjustments(supabaseUrl, serviceKey);
  const batchSize = 200;
  let upserted = 0;
  for (let i = 0; i < allEvents.length; i += batchSize) {
    const batch = allEvents.slice(i, i + batchSize);
    const result = await upsertPriceAdjustments(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      console.error(`Upsert failed: ${result.status} ${(result.body || '').slice(0, 200)}`);
      console.error('Apply migration 0014_price_adjustments.sql if table is missing.');
      process.exit(1);
    }
    upserted += batch.length;
  }
  console.log(`\nUpserted ${upserted} row(s) → price_adjustments`);
} else if (!args.dryRun && !allEvents.length) {
  console.log('\nClearing prior auto-seed rows (0 new events)…');
  await deleteAutoSeedAdjustments(supabaseUrl, serviceKey);
} else if (args.dryRun) {
  console.log('\nDry-run: no upsert performed');
}

process.exit(aprCheck.ok ? 0 : 1);
