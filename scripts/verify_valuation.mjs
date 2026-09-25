/**
 * Static checks for hub_valuation_snapshot (FY + TTM) + valuation tab wiring.
 * Used by verify:dist (Cloudflare build gate).
 *
 * Principle: CF / verify:dist must NOT assert fixed market screen values
 * (e.g. "Samsung PER FY = 41.48"). Gates check wiring, schema, fill rates,
 * and internal consistency (per ≈ close ÷ eps). Optional local-only screen
 * cross-check: `node scripts/verify_valuation.mjs --expect-per-fy=41.48`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'data', 'hub_valuation_snapshot.json');
const REFS = path.join(ROOT, 'data', 'hub_return_refs.json');
const HEADERS = path.join(ROOT, '_headers');
const MIN_COUNT = 2000;
const MIN_TTM_FILL = 0.9;
const RATIO_TOL = 0.005; // ±0.5%

function parseExpectPerFy(argv) {
  for (const a of argv) {
    if (a.startsWith('--expect-per-fy=')) {
      const n = Number(a.slice('--expect-per-fy='.length));
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function assertCloseRatio(label, actual, close, eps, tol) {
  assert.ok(close > 0 && eps > 0, `${label}: close/eps must be positive (close=${close} eps=${eps})`);
  const expected = close / eps;
  const rel = Math.abs(Number(actual) - expected) / expected;
  assert.ok(
    rel <= tol,
    `${label}: ${actual} ≈ close÷eps=${expected.toFixed(4)} (rel=${(rel * 100).toFixed(3)}% > ±${tol * 100}%)`,
  );
}

const EXPECT_PER_FY = parseExpectPerFy(process.argv.slice(2));

const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'machinery/korea_machinery_map.html',
  'shipping/korea_shipping_map.html',
];

const EXTRA_CHECK_FILES = [
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
];

function fail(file, msg) {
  console.error(`FAIL ${file}: ${msg}`);
  process.exit(1);
}

function countKey(text, key) {
  return (text.match(new RegExp(`["']?${key}["']?\\s*:`, 'g')) || []).length;
}

assert.ok(fs.existsSync(SNAPSHOT), 'data/hub_valuation_snapshot.json must exist');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
assert.ok(
  snapshot.source === 'mdcstat' || snapshot.source === 'mdcstat+naver',
  `source ${snapshot.source}`,
);
assert.equal(snapshot.marketBasis, 'fy', 'marketBasis must be fy');
assert.ok(
  (snapshot.count || snapshot.universe || 0) >= MIN_COUNT,
  `count ${snapshot.count} >= ${MIN_COUNT}`,
);

if (fs.existsSync(REFS)) {
  const refs = JSON.parse(fs.readFileSync(REFS, 'utf8'));
  const snapDd = String(snapshot.recentDd || '').slice(0, 10);
  const refsDd = String(refs.recentDd || '').slice(0, 10);
  assert.ok(
    snapDd === refsDd || snapDd < refsDd,
    `recentDd ${snapDd} must equal refs ${refsDd} (or prior session)`,
  );
  console.log(`  recentDd ok ${snapDd}`);
}

const samsung = snapshot.quotes?.['005930'];
assert.ok(samsung, '005930 must be in valuation snapshot');
assert.ok(Number(samsung.perFy) > 0, `005930 perFy=${samsung.perFy} must be > 0`);
assert.ok(Number(samsung.perTtm) > 0, `005930 perTtm=${samsung.perTtm} must be > 0`);
assert.ok(Number(samsung.pbrFy) > 0, `005930 pbrFy=${samsung.pbrFy} must be > 0`);
assert.ok(Number(samsung.epsFy) > 0, `005930 epsFy=${samsung.epsFy} must be > 0`);
assert.ok(Number(samsung.epsTtm) > 0, `005930 epsTtm=${samsung.epsTtm} must be > 0`);
assert.ok(Number(samsung.close) > 0, `005930 close=${samsung.close} must be > 0`);
assertCloseRatio(
  '005930 perFy',
  Number(samsung.perFy),
  Number(samsung.close),
  Number(samsung.epsFy),
  RATIO_TOL,
);
assertCloseRatio(
  '005930 perTtm',
  Number(samsung.perTtm),
  Number(samsung.close),
  Number(samsung.epsTtm),
  RATIO_TOL,
);
if (EXPECT_PER_FY != null) {
  assert.ok(
    Math.abs(Number(samsung.perFy) - EXPECT_PER_FY) / EXPECT_PER_FY <= RATIO_TOL,
    `005930 perFy=${samsung.perFy} vs --expect-per-fy=${EXPECT_PER_FY} (±${RATIO_TOL * 100}%)`,
  );
  console.log(`  005930 --expect-per-fy=${EXPECT_PER_FY} matched`);
}
console.log(
  `  005930 perTtm=${samsung.perTtm} perFy=${samsung.perFy} pbrFy=${samsung.pbrFy} `
  + `close=${samsung.close} epsFy=${samsung.epsFy} epsTtm=${samsung.epsTtm}`,
);

const hubCount = Number(snapshot.hubHit) || 0;
const ttmFilled = Number(snapshot.ttmFilled) || 0;
const ttmNullLoss = Number(snapshot.ttmNullLoss) || 0;
const ttmMissingQuote = Number(snapshot.ttmMissingQuote) || 0;
let attachRate = Number(snapshot.ttmAttachRate);
if (!Number.isFinite(attachRate) || attachRate <= 0) {
  attachRate = hubCount > 0 ? (ttmFilled + ttmNullLoss) / hubCount : 0;
}
assert.ok(
  attachRate >= MIN_TTM_FILL,
  `hub Naver TTM attach rate ${attachRate} >= ${MIN_TTM_FILL}`,
);
assert.ok(ttmMissingQuote / Math.max(1, hubCount) <= 0.1, 'too many hub without quotes_latest');
assert.ok(ttmFilled / Math.max(1, hubCount) >= 0.7, `positive perTtm share ${ttmFilled}/${hubCount}`);
console.log(
  `  hub TTM attach ${(attachRate * 100).toFixed(1)}% `
  + `(+per=${ttmFilled} lossNull=${ttmNullLoss} missing=${ttmMissingQuote})`,
);

assert.ok(fs.existsSync(path.join(ROOT, 'js', 'map_valuation.js')), 'map_valuation.js');
const mapJs = fs.readFileSync(path.join(ROOT, 'js', 'map_valuation.js'), 'utf8');
assert.ok(/perTtm/.test(mapJs), 'map_valuation uses perTtm');
assert.ok(/resolveDisplay/.test(mapJs), 'map_valuation resolveDisplay');
assert.ok(/groupMetric/.test(mapJs), 'map_valuation segmented groupMetric');
assert.ok(!/ \|\| 'Div'/.test(mapJs), 'map_valuation must not fall back to bare Div');
assert.ok(/isUsableLabel|!== 'undefined'/.test(mapJs), 'map_valuation null-guards labels');
assert.ok(/im\.valuation\.metric/.test(mapJs), 'map_valuation uses im.valuation.metric storage');
assert.ok(/function clampTip/.test(mapJs), 'map_valuation exports clampTip');
assert.ok(/viewBox/.test(mapJs), 'map_valuation uses SVG viewBox');

// Pure unit tests (no jsdom) — load IIFE into a sandbox.
{
  const { createContext, runInContext } = await import('node:vm');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(mapJs, sandbox);
  const Val = sandbox.InvestingMapValuation;
  assert.ok(Val && Val._test, 'InvestingMapValuation._test available');

  const tip = Val._test.clampTip({ x: 1900, w: 260, vw: 1920 });
  assert.ok(tip.left <= 1652, `clampTip left=${tip.left} must be ≤ 1652`);
  console.log(`  unit clampTip left=${tip.left} (≤1652) ok`);

  const sim = Val._test.simulateMetricSelect('dvd', { lang: 'ko' });
  assert.equal(sim.state.metric, 'dvd', 'state.metric after dvd select');
  assert.equal(sim.activeLabel, '배당수익률', 'active button label for dvd');
  assert.equal(sim.chart.metric, 'dvd', 'chart.metric after dvd select');
  console.log('  unit metric=dvd → 배당수익률 + chart.metric=dvd ok');

  const dom = Val._test.computeXDomain('perTtm', [6, 9, 12, 30, 85], { p75: 25 });
  assert.ok(dom.lo <= 6 / 1.25, `domain lo=${dom.lo} must be ≤ ${6 / 1.25}`);
  assert.ok(dom.lo <= 25 && dom.hi >= 25, `domain must include P75=25 (lo=${dom.lo} hi=${dom.hi})`);
  console.log(`  unit computeXDomain [6,9,12,30,85] lo=${dom.lo} hi=${dom.hi} (P75=25) ok`);

  const domHi = Val._test.computeXDomain('perTtm', [6, 9, 12, 30, 85, 900], {});
  assert.ok(domHi.hi < 300, `q95-based hi=${domHi.hi} must be < 300 (not stretched by 900)`);
  assert.ok(900 > domHi.hi, `900 must sit above hi=${domHi.hi} (▶ outlier)`);
  console.log(`  unit computeXDomain hi-cap [..,900] hi=${domHi.hi} (<300, 900→▶) ok`);
}

assert.ok(
  fs.existsSync(path.join(ROOT, 'scripts', 'build_hub_valuation_snapshot.mjs')),
  'build_hub_valuation_snapshot.mjs',
);
assert.ok(
  fs.existsSync(path.join(ROOT, 'supabase', 'migrations', '0023_stock_valuation_daily.sql')),
  'migration 0023',
);

const headers = fs.readFileSync(HEADERS, 'utf8');
assert.ok(
  /\/data\/hub_valuation_snapshot\.json[\s\S]*?max-age=60,\s*must-revalidate/.test(headers),
  '_headers must set hub_valuation_snapshot.json 60s must-revalidate',
);
console.log('  h) hub_valuation_snapshot 60s header ok');

const tabState = fs.readFileSync(path.join(ROOT, 'js', 'map_tab_state.js'), 'utf8');
assert.ok(/valuation:\s*1/.test(tabState), 'map_tab_state VALID includes valuation');
assert.ok(
  /tab-btn-valuation/.test(tabState),
  "map_tab_state.js must include 'tab-btn-valuation' btnIds entry",
);
console.log('  map_tab_state valuation btnIds ok');

const REQUIRED_I18N = ['valuationSortChain', 'valuationMetricDvd', 'valuationLegendPer'];

for (const rel of MAP_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) fail(rel, 'file missing');
  const html = fs.readFileSync(file, 'utf8');

  if (!/map_valuation\.js\?v=\d+/.test(html)) fail(rel, 'map_valuation.js?v=N missing');
  if (!/id="valuation-root"/.test(html)) fail(rel, 'valuation-root missing');
  if (!/function renderValuation\s*\(/.test(html) && !rel.startsWith('bio/')) {
    // bio map HTML uses inline.js for renderValuation
    if (rel !== 'bio/korea_bio_map.html') fail(rel, 'function renderValuation missing');
  }
  if (rel === 'bio/korea_bio_map.html' && !/map_valuation\.js\?v=\d+/.test(html)) {
    fail(rel, 'map_valuation.js missing');
  }

  for (const key of REQUIRED_I18N) {
    const n = countKey(html, key);
    // HTML pages embed ko+en T objects → expect ≥2; bio HTML may only have scripts
    if (rel === 'bio/korea_bio_map.html') continue;
    if (n < 2) fail(rel, `${key} ko/en missing (count=${n})`);
  }

  const perfIdx = html.indexOf('tab-btn-perfcalendar');
  const valIdx = html.indexOf('tab-btn-valuation');
  const tableIdx = html.indexOf('tab-btn-table');
  if (!(perfIdx >= 0 && valIdx > perfIdx)) fail(rel, 'valuation button after perfcalendar');
  if (!(tableIdx > valIdx)) fail(rel, 'table button after valuation');
}

for (const rel of EXTRA_CHECK_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) fail(rel, 'file missing');
  const text = fs.readFileSync(file, 'utf8');
  if (!/function renderValuation\s*\(/.test(text)) fail(rel, 'function renderValuation missing');
  for (const key of REQUIRED_I18N) {
    // inline T is JSON one-liner: keys appear in ko+en → ≥2; tail may only reference props
    if (rel.endsWith('bio_inline_tail.js')) {
      if (!text.includes(key) && !text.includes(`vt.${key}`)) {
        // tail uses vt.valuationMetricDvd etc via render labels
        if (!new RegExp(`vt\\.${key}|${key}`).test(text)) {
          // renderValuation uses vt.valuationMetricDvd — check that
        }
      }
      continue;
    }
    const n = countKey(text, key);
    if (n < 2) fail(rel, `${key} ko/en missing (count=${n})`);
  }
  if (rel.endsWith('korea_bio_map.inline.js')) {
    for (const key of REQUIRED_I18N) {
      const n = countKey(text, key);
      if (n < 2) fail(rel, `${key} ko/en missing (count=${n})`);
    }
  }
}

// bio_inline_tail must wire labels
{
  const tail = fs.readFileSync(path.join(ROOT, 'bio', 'bio_inline_tail.js'), 'utf8');
  if (!/vt\.valuationSortChain/.test(tail)) fail('bio/bio_inline_tail.js', 'vt.valuationSortChain');
  if (!/vt\.valuationMetricDvd/.test(tail)) fail('bio/bio_inline_tail.js', 'vt.valuationMetricDvd');
  if (!/vt\.valuationLegendPer/.test(tail)) fail('bio/bio_inline_tail.js', 'vt.valuationLegendPer');
  if (!/if \(tab === 'valuation'\)/.test(tail)) fail('bio/bio_inline_tail.js', 'tab switch valuation');
}

if (fs.existsSync(path.join(ROOT, 'dist', 'js', 'map_volatility.js'))) {
  assert.ok(
    fs.existsSync(path.join(ROOT, 'dist', 'js', 'map_valuation.js')),
    'dist/js/map_valuation.js',
  );
  assert.ok(
    fs.existsSync(path.join(ROOT, 'dist', 'data', 'hub_valuation_snapshot.json')),
    'dist/data/hub_valuation_snapshot.json',
  );
}

console.log(
  `verify:valuation OK — source=${snapshot.source} count=${snapshot.count} `
  + `recentDd=${snapshot.recentDd} marketBasis=${snapshot.marketBasis}`,
);
