/**
 * Reconcile the last 5 closed sessions (today excluded) to apihub T+1 bars.
 * Empty apihub days are skipped. Used by the 17:10 refs workflow before the build.
 *
 *   node scripts/reconcile_recent_history.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMarketDay, getAuthKey } from '../functions/lib/krx_yoy.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';
import { reconcileRecentHistoryWithApihub } from './history_apihub_reconcile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function main() {
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = getAuthKey(env);
  if (!supabaseUrl || !serviceKey || !authKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KRX_AUTH_KEY are required');
  }
  const result = await reconcileRecentHistoryWithApihub({
    supabaseUrl,
    serviceKey,
    authKey,
    tickers: hubTickers(),
    todayDash: kstYmdDash(),
    fetchMarket: fetchMarketDay,
  });
  console.log(`apihub reconcile total fixed ${result.fixedTotal}`);
}

const isMain =
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
