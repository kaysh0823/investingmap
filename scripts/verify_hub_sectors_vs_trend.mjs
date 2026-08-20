/**
 * Assert hub_sectors return% ≈ hub_trend series end − 100 for every
 * sector × horizon (rounding tolerance).
 *
 * Usage:
 *   node scripts/verify_hub_sectors_vs_trend.mjs
 *   node scripts/verify_hub_sectors_vs_trend.mjs --live=https://www.investingmap.kr
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHubTrendPayload,
  buildSectorReturnsForHorizon,
  returnPctFromRebasedSeries,
  TREND_HORIZONS,
  TREND_RET_KEY,
} from '../functions/lib/hub_trend.mjs';
import { SECTOR_ORDER } from '../functions/lib/hub_dashboard_core.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOL = 0.02; // 2dp rounding / float slack

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

const apiSrc = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_sectors.js'), 'utf8');
assert.ok(apiSrc.includes("CACHE_VERSION = '/api/hub_sectors/cache/v12'"), 'hub_sectors cache v12');
assert.ok(apiSrc.includes('buildSectorReturnsForHorizon'), 'hub_sectors uses trend returns');
assert.ok(apiSrc.includes('sector_mcap_trend'), 'hub_sectors source tag');

const trendSrc = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'hub_trend.mjs'), 'utf8');
assert.ok(trendSrc.includes('returnPctFromRebasedSeries'), 'shared return extractor');
assert.ok(trendSrc.includes('buildSectorReturnRowsFromTrend'), 'sync row builder');

const syncSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'sync_quotes_to_supabase.mjs'), 'utf8');
assert.ok(syncSrc.includes('buildSectorReturnRowsFromTrend'), 'sync writes trend-aligned returns');
assert.ok(!syncSrc.includes('mcapWeightedReturnInverse'), 'inverse past-mcap removed from sync');

const series = [
  { t: 'a', v: 100 },
  { t: 'b', v: 112.345 },
];
assert.equal(returnPctFromRebasedSeries(series), 12.35);

const liveArg = process.argv.slice(2).find((v) => v.startsWith('--live'));
if (liveArg) {
  const origin = liveArg.includes('=') ? liveArg.split('=')[1] : 'https://www.investingmap.kr';
  let mismatches = 0;
  for (const horizon of TREND_HORIZONS) {
    const [sectorsRes, trendRes] = await Promise.all([
      fetch(`${origin}/api/hub_sectors?horizon=${horizon}&nocache=1&align=${Date.now()}`),
      fetch(`${origin}/api/hub_trend?horizon=${horizon}&nocache=1&align=${Date.now()}`),
    ]);
    assert.ok(sectorsRes.ok, `live hub_sectors ${horizon} HTTP ${sectorsRes.status}`);
    assert.ok(trendRes.ok, `live hub_trend ${horizon} HTTP ${trendRes.status}`);
    const sectorsPayload = await sectorsRes.json();
    const trendPayload = await trendRes.json();
    const retKey = TREND_RET_KEY[horizon];
    for (const entry of trendPayload.sectors || []) {
      const card = sectorsPayload.sectors?.[entry.sector]?.[retKey];
      const end = returnPctFromRebasedSeries(entry.series);
      if (card == null && end == null) continue;
      const delta = card != null && end != null ? Math.abs(card - end) : Infinity;
      const ok = delta <= TOL;
      if (!ok) {
        mismatches += 1;
        console.error(`MISS ${horizon} ${entry.sector}: card=${card} end-100=${end} Δ=${delta}`);
      }
    }
  }
  assert.equal(mismatches, 0, `${mismatches} live card↔trend mismatch(es)`);
  console.log(`verify:hub-sectors-vs-trend live OK — ${origin}`);
  process.exit(0);
}

const env = loadEnv();
const config = getSupabaseConfig(env);
if (!config) {
  console.log(
    'verify:hub-sectors-vs-trend OK — source markers + unit (skip live: no Supabase env)',
  );
  process.exit(0);
}

const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
let checked = 0;
let mismatches = 0;

for (const horizon of TREND_HORIZONS) {
  const { returns } = await buildSectorReturnsForHorizon(hubIndex, env, horizon);
  const payload = await buildHubTrendPayload(hubIndex, env, horizon);
  console.log(`\n=== ${horizon} ===`);
  for (const entry of payload.sectors || []) {
    const sid = entry.sector;
    if (!SECTOR_ORDER.includes(sid)) continue;
    const fromBuilder = returns[sid];
    const fromSeries = returnPctFromRebasedSeries(entry.series);
    checked += 1;
    if (fromBuilder == null && fromSeries == null) {
      console.log(`  ${sid}: empty`);
      continue;
    }
    const delta =
      fromBuilder != null && fromSeries != null ? Math.abs(fromBuilder - fromSeries) : Infinity;
    const ok = delta <= TOL;
    if (!ok) mismatches += 1;
    console.log(
      `  ${sid}: builder=${fromBuilder} seriesEnd-100=${fromSeries} Δ=${
        Number.isFinite(delta) ? delta.toFixed(4) : 'n/a'
      } ${ok ? 'OK' : 'MISS'}`,
    );
  }
}

assert.ok(checked >= SECTOR_ORDER.length, `expected ≥${SECTOR_ORDER.length} checks, got ${checked}`);
assert.equal(mismatches, 0, `${mismatches} builder↔series mismatch(es)`);
console.log(
  `\nverify:hub-sectors-vs-trend OK — ${checked} sector×horizon cells aligned (tol=${TOL}pp)`,
);
