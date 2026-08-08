/**
 * Spot-check stock_price_history OHLC vs live KRX day for sample tickers.
 * Usage: node scripts/verify_history_ohlc.mjs [ticker...]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchMarketDay, historyFieldsFromKrxRow, tradingDates } from '../functions/lib/krx_yoy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICKERS = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!TICKERS.length) TICKERS.push('005930', '000660', '035420');

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[m[1].trim()]) env[m[1].trim()] = v;
  }
  return env;
}

function basDdToDash(basDd) {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

async function fetchDbRows(url, key, ticker, dates) {
  const q =
    `${url}/rest/v1/stock_price_history?ticker=eq.${ticker}` +
    `&trade_date=in.(${dates.join(',')})` +
    `&select=trade_date,open,high,low,close,volume&order=trade_date.desc`;
  const res = await fetch(q, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`db ${res.status} ${await res.text()}`);
  return await res.json();
}

function sameNum(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

async function main() {
  const env = loadEnv();
  const authKey = env.KRX_AUTH_KEY || '';
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '';
  if (!authKey || !url || !key) {
    console.error('Need KRX_AUTH_KEY + SUPABASE_URL + service/anon key');
    process.exit(1);
  }

  const sampleBas = tradingDates(8).slice(0, 5);
  const sampleDash = sampleBas.map(basDdToDash);
  console.log(`Spot-check dates: ${sampleDash.join(', ')}`);
  console.log(`Tickers: ${TICKERS.join(', ')}`);

  const krxByDate = new Map();
  for (const bas of sampleBas) {
    const byCode = await fetchMarketDay(authKey, bas);
    krxByDate.set(basDdToDash(bas), byCode);
  }

  let mismatches = 0;
  let compared = 0;
  for (const ticker of TICKERS) {
    const dbRows = await fetchDbRows(url, key, ticker, sampleDash);
    const byDate = new Map(dbRows.map((r) => [r.trade_date, r]));
    console.log(`\n=== ${ticker} ===`);
    for (const d of sampleDash) {
      const krxMap = krxByDate.get(d);
      const krxRow = krxMap && krxMap.get(ticker);
      const k = krxRow ? historyFieldsFromKrxRow(krxRow) : null;
      const db = byDate.get(d);
      if (!k) {
        console.log(`  ${d}: no KRX row`);
        continue;
      }
      if (!db) {
        console.log(`  ${d}: missing in DB`);
        mismatches += 1;
        continue;
      }
      const ok =
        sameNum(db.open, k.open) &&
        sameNum(db.high, k.high) &&
        sameNum(db.low, k.low) &&
        sameNum(db.close, k.close) &&
        sameNum(db.volume, k.volume);
      compared += 1;
      if (!ok) mismatches += 1;
      console.log(
        `  ${d}: ${ok ? 'OK' : 'DIFF'} ` +
          `db(${db.open}/${db.high}/${db.low}/${db.close}/${db.volume}) ` +
          `krx(${k.open}/${k.high}/${k.low}/${k.close}/${k.volume})`,
      );
    }
  }

  console.log(`\ncompared=${compared} mismatches=${mismatches}`);
  if (mismatches) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
