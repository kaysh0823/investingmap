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
assert.ok(apiSrc.includes("CACHE_VERSION = '/api/hub_sectors/cache/v22'"), 'hub_sectors cache v22');
assert.ok(apiSrc.includes('buildHubSectorsFromReturnSource') || apiSrc.includes('aggregateSectorReturns') || apiSrc.includes('loadReturnSource'), 'hub_sectors stock-aggregate path');
assert.ok(apiSrc.includes('stock_aggregate'), 'hub_sectors source tag');

const trendApi = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_trend.js'), 'utf8');
assert.ok(trendApi.includes("CACHE_VERSION = '/api/hub_trend/cache/v15'"), 'hub_trend cache v15');
assert.ok(trendApi.includes('regularMax: 600'), 'hub_trend daily regular TTL ~10m');

const sparkApi = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_sector_trend.js'), 'utf8');
assert.ok(sparkApi.includes("CACHE_VERSION = '/api/hub_sector_trend/cache/v8'"), 'hub_sector_trend cache v8');
assert.ok(sparkApi.includes('synthesized'), 'hub_sector_trend exposes synthesized meta');

const sparkLib = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'hub_sector_trend.mjs'), 'utf8');
assert.ok(sparkLib.includes('live_aggregate'), 'synthesized source tag');
assert.ok(sparkLib.includes('loadReturnSource'), '1d tip uses shared return source');
assert.ok(sparkLib.includes('aggregateSectorReturns'), '1d tip uses aggregateSectorReturns');

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
assert.ok(
  trendSrc.includes('horizonN === 1 ? prevSessionDate(calendar)'),
  '1D card base matches intraday prevSessionDate',
);
assert.ok(trendSrc.includes('completedSession'), 'completed session anchor');
assert.ok(trendSrc.includes('prevSessionDate'), '1D prev session helper');
assert.ok(trendSrc.includes('downsampleDates'), 'pre-query chart date downsample');
assert.ok(trendSrc.includes('TREND_CHART_MAX_POINTS'), 'chart fetch resolution cap');
assert.ok(trendSrc.includes('DATE_BATCH = 64'), 'single date-batch for chart fetches');
assert.ok(trendSrc.includes('buildIndexDailySeries(config, chartDates, calendar'), 'index uses shared chart dates');

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
  const singleRes = await fetch(
    `${origin}/api/hub_sectors?horizon=1d&nocache=1&align=${Date.now()}`,
  );
  assert.ok(singleRes.ok, `live hub_sectors HTTP ${singleRes.status}`);
  const single = await singleRes.json();
  assert.equal(single.source, 'stock_aggregate', 'live source tag');
  assert.ok(single.anchorDd, 'live hub_sectors anchorDd');
  assert.ok(single.numeratorMode, 'live hub_sectors numeratorMode');

  const trendRes = await fetch(
    `${origin}/api/hub_sector_trend?horizon=1d&nocache=1&cb=${Date.now()}`,
  );
  assert.ok(trendRes.ok, `live hub_sector_trend HTTP ${trendRes.status}`);
  const trend = await trendRes.json();
  assert.equal(trend.anchorDd, single.anchorDd, 'trend anchorDd matches sectors');
  assert.equal(trend.numeratorMode, single.numeratorMode, 'trend numeratorMode matches');
  assert.equal(trend.k, single.k, 'trend k matches');

  let tipChecks = 0;
  let tipMiss = 0;
  for (const sid of Object.keys(single.sectors || {})) {
    const card = single.sectors[sid]?.return1dPct;
    const series = Array.isArray(trend[sid]) ? trend[sid] : [];
    if (card == null || !series.length) continue;
    tipChecks += 1;
    const tip = series[series.length - 1]?.v;
    if (tip !== card) {
      tipMiss += 1;
      console.error(`MISS tip ${sid}: card=${card} tip=${tip}`);
    }
  }
  assert.ok(tipChecks >= 5, `expected tip checks, got ${tipChecks}`);
  assert.equal(tipMiss, 0, `${tipMiss} sector tip≠card mismatch(es)`);
  console.log(
    `verify:hub-sectors-vs-trend live OK — ${origin} tip==card for ${tipChecks} sectors`
    + ` (synthesized=${!!trend.synthesized})`,
  );
  process.exit(0);
}

console.log(
  'verify:hub-sectors-vs-trend OK — Stage 3 stock-aggregate / synthesized-tip markers '
  + '(use --live[=origin] for tip==card)',
);
process.exit(0);
