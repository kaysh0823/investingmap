/**
 * Backfill sector_mcap_daily from stock_price_history (hub_index members).
 * Usage: node scripts/backfill_sector_mcap_daily.mjs [--days=260]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tradingDates } from '../functions/lib/krx_yoy.mjs';
import { normalizeTicker, listHubCompanies } from '../functions/lib/hub_dashboard_core.mjs';
import {
  buildSectorMcapDailyRows,
  upsertSectorMcapDaily,
} from './lib/sector_mcap_daily.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DAYS = 260;
const PAGE_SIZE = 1000;

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

function parseDaysArg(argv) {
  for (const a of argv) {
    const m = /^--days=(\d+)$/.exec(a);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return DEFAULT_DAYS;
}

function basDdToDash(basDd) {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function hubTickerSet(hubIndex) {
  const set = new Set();
  for (const c of listHubCompanies(hubIndex)) {
    const t = normalizeTicker(c.ticker);
    if (t) set.add(t);
  }
  return set;
}

async function loadDayMcapMap(supabaseUrl, serviceKey, tradeDateDash, hubTickers) {
  const map = new Map();
  let offset = 0;
  for (;;) {
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?trade_date=eq.${encodeURIComponent(tradeDateDash)}` +
      `&select=ticker,mcap_won&mcap_won=gt.0&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`history ${tradeDateDash}: ${res.status} ${body.slice(0, 160)}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      const t = normalizeTicker(row.ticker);
      if (!t || !hubTickers.has(t)) continue;
      const m = Number(row.mcap_won);
      if (Number.isFinite(m) && m > 0) map.set(t, m);
    }
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return map;
}

async function main() {
  const days = parseDaysArg(process.argv.slice(2));
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const hubTickers = hubTickerSet(hubIndex);
  const dates = tradingDates(days).map(basDdToDash);
  // Process oldest → newest so logs read chronologically.
  dates.reverse();

  console.log(`Backfill sector_mcap_daily: ${dates.length} weekday(s), hub tickers=${hubTickers.size}`);

  let upserted = 0;
  let daysWithData = 0;
  let daysEmpty = 0;
  let failed = 0;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    try {
      const mcapMap = await loadDayMcapMap(supabaseUrl, serviceKey, d, hubTickers);
      if (mcapMap.size < 10) {
        daysEmpty += 1;
        process.stdout.write(`\r  ${i + 1}/${dates.length} ${d} skip(thin=${mcapMap.size})`);
        continue;
      }
      const rows = buildSectorMcapDailyRows(hubIndex, mcapMap, d);
      const result = await upsertSectorMcapDaily(rows, supabaseUrl, serviceKey);
      if (!result.ok) {
        failed += 1;
        console.error(`\n  upsert failed ${d}: ${result.status} ${(result.body || '').slice(0, 160)}`);
        continue;
      }
      daysWithData += 1;
      upserted += result.upserted;
      process.stdout.write(`\r  ${i + 1}/${dates.length} ${d} sectors=${rows.length} ok`);
    } catch (e) {
      failed += 1;
      console.error(`\n  ${d}: ${e.message || e}`);
    }
  }

  process.stdout.write('\n');
  console.log('=== backfill_sector_mcap_daily summary ===');
  console.log(`days requested: ${dates.length}`);
  console.log(`days with data: ${daysWithData}`);
  console.log(`days thin/empty: ${daysEmpty}`);
  console.log(`rows upserted:  ${upserted}`);
  console.log(`failures:       ${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
