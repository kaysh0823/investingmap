/**
 * Compare hub_sector_trend endpoints vs sector_returns card % for 20d/50d/120d/200d.
 * Usage: node scripts/verify_sector_trend.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildHubSectorTrendPayload } from '../functions/lib/hub_sector_trend.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from '../functions/lib/supabase_hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HORIZONS = ['20d', '50d', '120d', '200d'];
const RET_COL = {
  '20d': 'ret_20d_pct',
  '50d': 'ret_50d_pct',
  '120d': 'ret_120d_pct',
  '200d': 'ret_200d_pct',
};

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

async function main() {
  const env = loadEnv();
  const config = getSupabaseConfig(env);
  if (!config) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY required in .dev.vars');
    process.exit(1);
  }
  const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const returns = await fetchSupabaseJson(config, 'sector_returns?select=*');
  const byId = new Map(returns.map((r) => [r.sector_id, r]));

  let mismatches = 0;
  for (const h of HORIZONS) {
    const payload = await buildHubSectorTrendPayload(hubIndex, env, h);
    const trends = payload.trends || {};
    console.log(`\n=== ${h} (sectors with series: ${Object.keys(trends).length}) ===`);
    for (const [sid, series] of Object.entries(trends)) {
      const end = series[series.length - 1];
      const card = numOrNull(byId.get(sid)?.[RET_COL[h]]);
      const endV = end && Number.isFinite(end.v) ? end.v : null;
      const delta = card != null && endV != null ? Math.abs(card - endV) : null;
      const ok = delta != null && delta <= 0.15;
      if (!ok) mismatches += 1;
      console.log(
        `  ${sid}: end=${endV} card=${card} Δ=${delta == null ? 'n/a' : delta.toFixed(3)} ` +
        `pts=${series.length} ${ok ? 'OK' : 'MISS'}`,
      );
    }
  }

  // 1d presence check (may be empty outside session / before migration)
  const d1 = await buildHubSectorTrendPayload(hubIndex, env, '1d');
  console.log(`\n=== 1d intraday (${Object.keys(d1.trends || {}).length} sectors, tradeDate=${d1.tradeDate}) ===`);
  for (const [sid, series] of Object.entries(d1.trends || {})) {
    const end = series[series.length - 1];
    console.log(`  ${sid}: pts=${series.length} end=${end && end.v}`);
  }

  if (mismatches) {
    console.error(`\n${mismatches} endpoint mismatch(es) over 0.15pp`);
    process.exit(1);
  }
  console.log('\nAll daily trend endpoints within 0.15pp of sector_returns.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
