/**
 * Spot-check stock_price_history depth for candle warmup (119850 etc.).
 * Usage: node scripts/verify_ohlc_history_depth.mjs [ticker]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ohlcFetchLimit } from '../functions/lib/ticker_ohlc.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICKER = process.argv[2] || '119850';
const NEED_5Y = ohlcFetchLimit('5y');

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!env[m[1]]) env[m[1]] = v;
  }
  return env;
}

async function main() {
  const config = getSupabaseConfig(loadEnv());
  if (!config) {
    console.error('Supabase env missing');
    process.exit(1);
  }
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    Prefer: 'count=exact',
    Range: '0-0',
  };
  const countRes = await fetch(
    `${config.url}/rest/v1/stock_price_history?ticker=eq.${TICKER}&select=trade_date`,
    { headers },
  );
  const range = countRes.headers.get('content-range') || '';
  const firstRes = await fetch(
    `${config.url}/rest/v1/stock_price_history?ticker=eq.${TICKER}&select=trade_date&order=trade_date.asc&limit=1`,
    { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } },
  );
  const lastRes = await fetch(
    `${config.url}/rest/v1/stock_price_history?ticker=eq.${TICKER}&select=trade_date&order=trade_date.desc&limit=1`,
    { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } },
  );
  const first = await firstRes.json();
  const last = await lastRes.json();
  const totalMatch = /\/(\d+)$/.exec(range);
  const total = totalMatch ? Number(totalMatch[1]) + 1 : null;
  // content-range is usually 0-0/1234 meaning 1235? Actually Prefer count=exact gives 0-0/N where N is total count.
  // Format: items 0-0/1234 means total 1234.
  const totalAlt = /\*/.test(range) ? null : Number((range.split('/')[1] || '').trim());
  const n = Number.isFinite(totalAlt) ? totalAlt : total;
  console.log(`ticker=${TICKER}`);
  console.log(`span=${first[0]?.trade_date || '?'} → ${last[0]?.trade_date || '?'}`);
  console.log(`rows≈${n} need5yFetch=${NEED_5Y} ok=${n != null && n >= NEED_5Y}`);
  if (n == null || n < NEED_5Y) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
