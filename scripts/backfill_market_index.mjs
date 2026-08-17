/**
 * Backfill KOSPI/KOSDAQ closes into market_index_daily.
 * Usage: node scripts/backfill_market_index.mjs [--days=260]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchKrxMarketIndexDay } from '../functions/lib/krx_index.mjs';
import {
  fetchNaverMarketIndexHistory,
  MARKET_INDEX_CODES,
} from '../functions/lib/naver_index.mjs';
import { getAuthKey, tradingDates } from '../functions/lib/krx_yoy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DAYS = 260;
const UPSERT_BATCH = 500;

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!env[match[1].trim()]) env[match[1].trim()] = value;
  }
  return env;
}

function parseDays(argv) {
  const arg = argv.find((value) => /^--days=\d+$/.test(value));
  return arg ? Math.max(1, Number(arg.split('=')[1])) : DEFAULT_DAYS;
}

function validRow(row) {
  return (
    row &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.trade_date) &&
    MARKET_INDEX_CODES.includes(row.index_code) &&
    Number.isFinite(row.close) &&
    row.close > 0
  );
}

async function upsertRows(rows, url, key) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH).filter(validRow);
    if (!batch.length) continue;
    const response = await fetch(
      `${url}/rest/v1/market_index_daily?on_conflict=trade_date,index_code`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`market_index_daily upsert: ${response.status} ${body.slice(0, 200)}`);
    }
    upserted += batch.length;
  }
  return upserted;
}

async function loadFromKrx(authKey, days) {
  const byCode = new Map(MARKET_INDEX_CODES.map((code) => [code, []]));
  const candidates = tradingDates(Math.ceil(days * 1.5) + 30);
  for (let i = 0; i < candidates.length; i++) {
    const basDd = candidates[i];
    const day = await fetchKrxMarketIndexDay(authKey, basDd);
    for (const code of MARKET_INDEX_CODES) {
      const point = day[code];
      if (point?.close != null && byCode.get(code).length < days) {
        byCode.get(code).push(point);
      }
    }
    process.stdout.write(
      `\r  KRX ${i + 1}/${candidates.length} KOSPI=${byCode.get('KOSPI').length} KOSDAQ=${byCode.get('KOSDAQ').length}`,
    );
    if (MARKET_INDEX_CODES.every((code) => byCode.get(code).length >= days)) break;
  }
  process.stdout.write('\n');
  return byCode;
}

async function loadFromNaver(days) {
  console.warn('  KRX index API unavailable; using explicit Naver historical fallback.');
  const entries = await Promise.all(
    MARKET_INDEX_CODES.map(async (code) => [
      code,
      await fetchNaverMarketIndexHistory(code, days),
    ]),
  );
  return new Map(entries);
}

async function main() {
  const days = parseDays(process.argv.slice(2));
  const env = loadEnv();
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  const authKey = getAuthKey(env);
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  console.log(`Backfill market indices: target=${days} trading days`);
  let byCode;
  let source = 'KRX';
  try {
    byCode = await loadFromKrx(authKey, days);
  } catch (error) {
    source = 'Naver fallback';
    console.warn(`  KRX failed: ${error.message || error}`);
    byCode = await loadFromNaver(days);
  }

  const rows = [];
  for (const code of MARKET_INDEX_CODES) {
    for (const point of byCode.get(code) || []) {
      const row = { trade_date: point.date, index_code: code, close: point.close };
      if (validRow(row)) rows.push(row);
    }
  }
  const upserted = await upsertRows(rows, supabaseUrl, serviceKey);
  console.log('=== backfill_market_index summary ===');
  console.log(`source:          ${source}`);
  for (const code of MARKET_INDEX_CODES) {
    console.log(`${code} days:      ${(byCode.get(code) || []).length}`);
  }
  console.log(`rows upserted:   ${upserted}`);
  if (MARKET_INDEX_CODES.some((code) => (byCode.get(code) || []).length < days)) {
    throw new Error(`Could not secure ${days} valid trading days for both indices`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
