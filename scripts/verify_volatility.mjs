import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildVolatilitySnapshot } from './build_hub_volatility_snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'data', 'hub_volatility_snapshot.json');

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

assert.ok(fs.existsSync(SNAPSHOT), 'data/hub_volatility_snapshot.json must exist');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
assert.equal(snapshot.source, 'krx-volatility');
assert.ok(snapshot.universe > 500, `universe ${snapshot.universe} should exceed 500`);
assert.ok(snapshot.count > 500, `count ${snapshot.count} should exceed 500`);

const atrs = [];
for (const q of Object.values(snapshot.quotes || {})) {
  assert.ok(q.mcap > 0, 'mcap must be positive');
  assert.ok(q.atrPct >= 0, 'atrPct must be >= 0');
  assert.ok(Number.isFinite(q.pctB), 'pctB must be numeric');
  atrs.push(q.atrPct);
}
assert.ok(atrs.length > 500, 'quotes must exceed 500');

const sorted = atrs.slice().sort((a, b) => a - b);
const p25 = percentile(sorted, 25);
const p50 = percentile(sorted, 50);
const p75 = percentile(sorted, 75);
assert.ok(p25 < p50 && p50 < p75, 'ATR percentiles must be strictly increasing');

const volSrc = fs.readFileSync(path.join(ROOT, 'js', 'map_volatility.js'), 'utf8');
const context = { globalThis: {}, d3: { scaleLinear: () => ({}), scaleLog: () => ({}), scaleSequential: () => () => '#000', min: () => 1, max: () => 1, rgb: () => ({ formatHex: () => '#000' }), interpolate: () => '#000' } };
context.globalThis = context;
context.window = context;
vm.createContext(context);
new vm.Script(volSrc, { filename: 'map_volatility.js' }).runInContext(context);
const vol = context.InvestingMapVolatility;
assert.ok(vol, 'InvestingMapVolatility export missing');

assert.equal(vol.clamp01(-1), 0);
assert.equal(vol.clamp01(2), 1);
const mockScale = (t) => (t <= 0.5 ? '#cfe3ff' : '#08306b');
assert.equal(vol.colorForPctB(0, mockScale), '#cfe3ff');
assert.equal(vol.colorForPctB(1, mockScale), '#08306b');
assert.ok(volSrc.includes("interpolate('#cfe3ff', '#08306b')"), 'sequential pctB color scale');

const tabState = fs.readFileSync(path.join(ROOT, 'js', 'map_tab_state.js'), 'utf8');
assert.ok(tabState.includes('volatility: 1'), 'map_tab_state VALID must include volatility');

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
];

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  const html = fs.readFileSync(fp, 'utf8');
  const runtime =
    rel.replace(/\\/g, '/') === 'bio/korea_bio_map.html'
      ? html + fs.readFileSync(path.join(ROOT, 'bio', 'korea_bio_map.inline.js'), 'utf8')
      : html;
  assert.ok(html.includes('id="tab-btn-volatility"'), `${rel}: missing volatility tab button`);
  assert.ok(html.includes('id="tab-volatility"'), `${rel}: missing volatility tab content`);
  assert.ok(html.includes('map_volatility.js?v=1'), `${rel}: missing map_volatility.js`);
  assert.ok(runtime.includes('function renderVolatility()'), `${rel}: missing renderVolatility()`);
}

assert.ok(
  fs.existsSync(path.join(ROOT, 'scripts', 'build_hub_volatility_snapshot.mjs')),
  'build_hub_volatility_snapshot.mjs must exist',
);
assert.ok(typeof buildVolatilitySnapshot === 'function', 'buildVolatilitySnapshot export');

if (fs.existsSync(path.join(ROOT, 'dist'))) {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'js', 'map_volatility.js')), 'dist/js/map_volatility.js');
  assert.ok(
    fs.existsSync(path.join(ROOT, 'dist', 'data', 'hub_volatility_snapshot.json')),
    'dist/data/hub_volatility_snapshot.json',
  );
}

console.log(
  `verify:volatility OK — ${snapshot.count} quotes, ATR p25=${p25.toFixed(4)} p50=${p50.toFixed(4)} p75=${p75.toFixed(4)}`,
);
