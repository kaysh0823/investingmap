/**
 * One-time / manual: fill stock_price_history gaps for hub tickers on recent sessions.
 * Use when new hub_index members miss rows on days the anchor ticker already has.
 *
 * Usage:
 *   node scripts/backfill_hub_history_gaps.mjs
 *   node scripts/backfill_hub_history_gaps.mjs --days=15
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../functions/lib/krx_rs.mjs';
import { repairHubHistoryGapsForRecentSessions } from './lib/hub_history_gap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOOKBACK = 30;

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

function loadHubTickers(hubIndex) {
  const seen = new Set();
  const codes = [];
  for (const c of listHubCompanies(hubIndex)) {
    const code = normalizeTicker(c.ticker);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes.sort();
}

function parseDaysArg() {
  const arg = process.argv.find((item) => item.startsWith('--days='));
  if (!arg) return DEFAULT_LOOKBACK;
  const n = parseInt(arg.slice('--days='.length), 10);
  if (!Number.isFinite(n) || n < 1) throw new Error('--days must be a positive integer');
  return n;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authKey = getAuthKey(env);
  const lookbackSessions = parseDaysArg();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (.dev.vars or env)');
  }
  if (!authKey) {
    throw new Error('KRX auth key required (KRX_AUTH_KEY or KRX OPEN API 인증키)');
  }

  const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const tickers = loadHubTickers(hubIndex);
  console.log(`Hub history gap backfill: ${tickers.length} tickers, last ${lookbackSessions} sessions`);

  const result = await repairHubHistoryGapsForRecentSessions({
    authKey,
    supabaseUrl,
    serviceKey,
    expectedTickers: tickers,
    lookbackSessions,
  });

  console.log(
    `Done: checked ${result.daysChecked} sessions, repaired ${result.daysRepaired} day(s), ` +
      `upserted ${result.rowsUpserted} row(s)` +
      (result.rowsFailed ? `, failed ${result.rowsFailed}` : ''),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
