/**
 * Compare hub_sector_trend endpoints vs hub_trend end−100 (card alignment source).
 * Usage: node scripts/verify_sector_trend.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildHubSectorTrendPayload } from '../functions/lib/hub_sector_trend.mjs';
import {
  buildHubTrendPayload,
  returnPctFromRebasedSeries,
} from '../functions/lib/hub_trend.mjs';
import { getSupabaseConfig, numOrNull } from '../functions/lib/supabase_hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HORIZONS = ['20d', '50d', '120d', '200d'];
const TOL = 0.02; // card / spark / hub_trend share the same series end

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

  let mismatches = 0;
  for (const h of HORIZONS) {
    const spark = await buildHubSectorTrendPayload(hubIndex, env, h);
    const trend = await buildHubTrendPayload(hubIndex, env, h);
    const bySid = new Map((trend.sectors || []).map((s) => [s.sector, s]));
    console.log(`\n=== ${h} (spark sectors: ${Object.keys(spark.trends || {}).length}) ===`);
    for (const [sid, series] of Object.entries(spark.trends || {})) {
      const end = series[series.length - 1];
      const endV = end && Number.isFinite(end.v) ? end.v : null;
      const card = returnPctFromRebasedSeries(bySid.get(sid)?.series);
      const delta = card != null && endV != null ? Math.abs(card - endV) : null;
      const ok = delta != null && delta <= TOL;
      if (!ok) mismatches += 1;
      console.log(
        `  ${sid}: sparkEnd=${endV} trendEnd-100=${card} Δ=${delta == null ? 'n/a' : delta.toFixed(3)} ` +
          `pts=${series.length} ${ok ? 'OK' : 'MISS'}`,
      );
    }
  }

  const d1 = await buildHubSectorTrendPayload(hubIndex, env, '1d');
  console.log(`\n=== 1d intraday (${Object.keys(d1.trends || {}).length} sectors, tradeDate=${d1.tradeDate}) ===`);
  for (const [sid, series] of Object.entries(d1.trends || {})) {
    const end = series[series.length - 1];
    console.log(`  ${sid}: pts=${series.length} end=${end && end.v}`);
  }

  if (mismatches) {
    console.error(`\n${mismatches} spark↔trend mismatch(es) over ${TOL}pp`);
    process.exit(1);
  }
  console.log('\nAll daily spark endpoints within tolerance of hub_trend end−100.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
