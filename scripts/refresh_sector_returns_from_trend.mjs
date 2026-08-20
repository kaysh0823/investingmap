/**
 * Refresh sector_returns from hub_trend mcap series (no full quote sync).
 * Usage: node scripts/refresh_sector_returns_from_trend.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSectorReturnRowsFromTrend } from '../functions/lib/hub_trend.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function upsertSectorReturns(rows, supabaseUrl, serviceKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/sector_returns`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=sector_id',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true };
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anon = env.SUPABASE_ANON_KEY || serviceKey;
  if (!supabaseUrl || !serviceKey || !anon) {
    console.error('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const updatedAt = new Date().toISOString();
  const rows = await buildSectorReturnRowsFromTrend(
    hubIndex,
    { SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: anon },
    updatedAt,
  );
  console.log(`Upserting ${rows.length} sector_returns from trend…`);
  const result = await upsertSectorReturns(rows, supabaseUrl, serviceKey);
  if (!result.ok) {
    console.error(`fail ${result.status}: ${(result.body || '').slice(0, 200)}`);
    process.exit(1);
  }
  for (const r of rows) {
    console.log(
      `  ${r.sector_id}: 1d=${r.ret_1d_pct} 20d=${r.ret_20d_pct} 50d=${r.ret_50d_pct} ` +
        `120d=${r.ret_120d_pct} 200d=${r.ret_200d_pct}`,
    );
  }
  console.log('OK refresh_sector_returns_from_trend');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
