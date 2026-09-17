/**
 * One-shot: apply source column if missing, upsert today's OHLC from MDCSTAT,
 * then rebuild return refs (+ optional hub snapshots).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { fetchKrxDailyOhlc, dailyOhlcFieldsToKrxRow } from '../functions/lib/krx_daily_ohlc.mjs';
import { historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';
import { getSupabaseConfig, fetchSupabaseJson } from '../functions/lib/supabase_hub.mjs';
import { normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = { ...process.env };
  const p = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[m[1]]) env[m[1]] = v;
  }
  return env;
}

async function ensureSourceColumn(config) {
  // Probe: select source; if 400, try RPC-less ALTER via PostgREST is not possible.
  // Apply via supabase SQL editor / migration — here we only warn.
  try {
    await fetchSupabaseJson(
      config,
      'stock_price_history?select=source&limit=1',
    );
    console.log('source column: ok');
    return true;
  } catch (e) {
    console.warn(
      'source column missing or unreadable — apply supabase/migrations/0021_stock_price_history_source.sql first:',
      e.message || e,
    );
    return false;
  }
}

async function upsertTodayFromMdcstat(env, config, includeSource) {
  const today = kstYmdDash();
  const bas = today.replace(/-/g, '');
  console.log(`MDCSTAT upsert for ${today} (source=${includeSource})…`);
  const dailyMap = await fetchKrxDailyOhlc(bas, env);
  if (!dailyMap?.size) throw new Error('MDCSTAT empty');
  const sample = dailyMap.get('005930');
  console.log('005930 mdcstat close=', sample?.close);

  const rows = [];
  for (const [ticker, fields] of dailyMap) {
    const t = normalizeTicker(ticker);
    const krx = dailyOhlcFieldsToKrxRow(fields);
    const hf = historyFieldsFromKrxRow(krx);
    if (!t || !hf?.close) continue;
    const row = {
      ticker: t,
      trade_date: today,
      open: hf.open,
      high: hf.high,
      low: hf.low,
      close: hf.close,
      volume: hf.volume,
      mcap_won: hf.mcap_won,
      turnover_won: hf.turnover_won,
    };
    if (includeSource) row.source = 'mdcstat';
    rows.push(row);
  }
  console.log(`upserting ${rows.length} rows…`);
  const batch = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const res = await fetch(`${config.url}/rest/v1/stock_price_history`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`upsert failed ${res.status}: ${body.slice(0, 300)}`);
    }
    upserted += chunk.length;
    process.stdout.write(`\r  ${upserted}/${rows.length}`);
  }
  process.stdout.write('\n');
  const check = await fetchSupabaseJson(
    config,
    `stock_price_history?ticker=eq.005930&trade_date=eq.${today}&select=close${includeSource ? ',source' : ''}`,
  );
  console.log('history after upsert:', check?.[0]);
  return { today, close: check?.[0]?.close };
}

async function main() {
  const env = loadEnv();
  Object.assign(process.env, env);
  const config = getSupabaseConfig(env, { preferServiceRole: true });
  if (!config) {
    console.error('SUPABASE_URL / service role required');
    process.exit(1);
  }
  const hasSource = await ensureSourceColumn(config);
  const { close } = await upsertTodayFromMdcstat(env, config, hasSource);
  if (!hasSource) {
    console.warn('Continue without source column — guard may exit 3 until migration applied');
  }
  console.log('\n==> refresh:hub-snapshots');
  execSync('node scripts/refresh_hub_snapshots.mjs', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...env, REFRESH_HUB_SNAPSHOTS: '1' },
  });
  const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_return_refs.json'), 'utf8'));
  const tip = refs.quotes?.['005930']?.closes?.slice(-1)?.[0];
  console.log(`\n005930 history.close=${close} refs.tip=${tip} recentDd=${refs.recentDd}`);
  if (Number(tip) !== Number(close)) {
    console.error('FAIL: tip != history close');
    process.exit(1);
  }
  console.log('OK tip matches history');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
