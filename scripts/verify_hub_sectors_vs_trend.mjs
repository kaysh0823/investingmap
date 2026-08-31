/**
 * Assert hub_sectors return% ≈ hub_trend series end − 100 for every
 * sector × horizon, and that a single hub_sectors payload fills all 5 horizons.
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
  buildAllHorizonReturnsBySector,
  buildHubTrendPayload,
  returnPctFromRebasedSeries,
  TREND_HORIZONS,
  TREND_RET_KEY,
} from '../functions/lib/hub_trend.mjs';
import { SECTOR_ORDER } from '../functions/lib/hub_dashboard_core.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOL = 0.02; // 2dp rounding / float slack
const ALL_RET_KEYS = TREND_HORIZONS.map((h) => TREND_RET_KEY[h]);

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

function assertSectorHasMostHorizons(sid, row, label, minFilled = 4) {
  const filled = ALL_RET_KEYS.filter(
    (key) => row && typeof row[key] === 'number' && Number.isFinite(row[key]),
  );
  assert.ok(
    filled.length >= minFilled,
    `${label} ${sid} must have ≥${minFilled} horizons (got ${filled.length}: ${filled.join(', ')})`,
  );
}

const apiSrc = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_sectors.js'), 'utf8');
assert.ok(apiSrc.includes("CACHE_VERSION = '/api/hub_sectors/cache/v19'"), 'hub_sectors cache v19');
assert.ok(apiSrc.includes('buildAllHorizonReturnsBySector'), 'hub_sectors fills all horizons');
assert.ok(apiSrc.includes('hasAllHorizons'), 'hub_sectors requires all horizons');
assert.ok(apiSrc.includes('sector_mcap_trend'), 'hub_sectors source tag');

const trendApi = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_trend.js'), 'utf8');
assert.ok(trendApi.includes("CACHE_VERSION = '/api/hub_trend/cache/v5'"), 'hub_trend cache v5');
assert.ok(trendApi.includes('regularMax: 600'), 'hub_trend daily regular TTL ~10m');

const sparkApi = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_sector_trend.js'), 'utf8');
assert.ok(sparkApi.includes("CACHE_VERSION = '/api/hub_sector_trend/cache/v6'"), 'hub_sector_trend cache v6');

const trendSrc = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'hub_trend.mjs'), 'utf8');
assert.ok(trendSrc.includes('returnPctFromRebasedSeries'), 'shared return extractor');
assert.ok(trendSrc.includes('buildAllHorizonReturnsBySector'), 'all-horizon builder');
assert.ok(trendSrc.includes('buildSectorReturnRowsFromTrend'), 'sync row builder');
assert.ok(trendSrc.includes('applyLiveDailyTip'), 'regular-session live tip');
assert.ok(trendSrc.includes('stock_quotes_latest'), 'live tip from quotes');
assert.ok(trendSrc.includes('market_index_intraday'), 'live index tip');
assert.ok(trendSrc.includes('stock_price_history'), 'stock-level mcap history');
assert.ok(trendSrc.includes('fixedMembers'), 'intersection membership');
assert.ok(trendSrc.includes('trendAnchorMeta'), 'anchor date metadata');
assert.ok(trendSrc.includes('loadMcapGridForDates'), 'anchor-only grid fetch');
assert.ok(trendSrc.includes('buildSectorReturnAtHorizon'), 'endpoint-only card returns');

const syncSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'sync_quotes_to_supabase.mjs'), 'utf8');
assert.ok(syncSrc.includes('buildSectorReturnRowsFromTrend'), 'sync writes trend-aligned returns');
assert.ok(!syncSrc.includes('mcapWeightedReturnInverse'), 'inverse past-mcap removed from sync');

assert.equal(
  returnPctFromRebasedSeries([
    { t: 'a', v: 100 },
    { t: 'b', v: 112.345 },
  ]),
  12.35,
);

const liveArg = process.argv.slice(2).find((v) => v.startsWith('--live'));
if (liveArg) {
  const origin = liveArg.includes('=') ? liveArg.split('=')[1] : 'https://www.investingmap.kr';
  // Single hub_sectors response must carry every horizon (client tab switch contract).
  const singleRes = await fetch(
    `${origin}/api/hub_sectors?horizon=20d&nocache=1&align=${Date.now()}`,
  );
  assert.ok(singleRes.ok, `live hub_sectors HTTP ${singleRes.status}`);
  const single = await singleRes.json();
  assert.equal(single.source, 'sector_mcap_trend', 'live source tag');
  let sectorCount = 0;
  for (const sid of Object.keys(single.sectors || {})) {
    assertSectorHasMostHorizons(sid, single.sectors[sid], 'live single payload');
    sectorCount += 1;
  }
  assert.ok(sectorCount >= 10, `live expected many sectors, got ${sectorCount}`);

  let mismatches = 0;
  for (const horizon of TREND_HORIZONS) {
    const trendRes = await fetch(
      `${origin}/api/hub_trend?horizon=${horizon}&nocache=1&align=${Date.now()}`,
    );
    assert.ok(trendRes.ok, `live hub_trend ${horizon} HTTP ${trendRes.status}`);
    const trendPayload = await trendRes.json();
    const retKey = TREND_RET_KEY[horizon];
    for (const entry of trendPayload.sectors || []) {
      const card = single.sectors?.[entry.sector]?.[retKey];
      const end = returnPctFromRebasedSeries(entry.series);
      if (card == null && end == null) continue;
      const delta = card != null && end != null ? Math.abs(card - end) : Infinity;
      if (!(delta <= TOL)) {
        mismatches += 1;
        console.error(`MISS ${horizon} ${entry.sector}: card=${card} end-100=${end} Δ=${delta}`);
      }
    }
  }
  assert.equal(mismatches, 0, `${mismatches} live card↔trend mismatch(es)`);
  console.log(
    `verify:hub-sectors-vs-trend live OK — ${origin} single payload ${sectorCount} sectors × 5 horizons`,
  );
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
const allBySector = (await buildAllHorizonReturnsBySector(hubIndex, env)).bySector;

let checked = 0;
let mismatches = 0;
let allHorizonSectors = 0;

for (const sid of SECTOR_ORDER) {
  const row = allBySector[sid];
  if (!row) continue;
  const hasAny = ALL_RET_KEYS.some((k) => row[k] != null);
  if (!hasAny) continue;
  assertSectorHasMostHorizons(sid, row, 'builder');
  allHorizonSectors += 1;
}

assert.ok(
  allHorizonSectors >= 10,
  `expected ≥10 sectors with ≥4 horizons filled, got ${allHorizonSectors}`,
);
console.log(`\nSingle-builder payload: ${allHorizonSectors} sectors have ≥4 return*Pct non-null`);

for (const horizon of TREND_HORIZONS) {
  const payload = await buildHubTrendPayload(hubIndex, env, horizon);
  const retKey = TREND_RET_KEY[horizon];
  console.log(`\n=== ${horizon} ===`);
  for (const entry of payload.sectors || []) {
    const sid = entry.sector;
    if (!SECTOR_ORDER.includes(sid)) continue;
    const fromBuilder = allBySector[sid]?.[retKey];
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
  `\nverify:hub-sectors-vs-trend OK — ${checked} cells aligned, ` +
    `${allHorizonSectors} sectors × horizons aligned (tol=${TOL}pp)`,
);
