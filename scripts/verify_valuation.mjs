/**
 * Static checks for hub_valuation_snapshot (FY + TTM) + valuation tab wiring.
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
assert.ok(
  Math.abs(Number(samsung.perFy) - 41.48) < 0.05,
  `005930 perFy=${samsung.perFy} expected ~41.48`,
);
assert.ok(samsung.perTtm != null && samsung.perTtm > 0, '005930 perTtm required');
assert.ok(samsung.epsTtm != null && samsung.epsTtm > 0, '005930 epsTtm required');
if (Number(samsung.close) === 274000) {
  assert.ok(
    Math.abs(samsung.perTtm - 12.2) <= 0.3,
    `005930 perTtm=${samsung.perTtm} expected ≈12.2±0.3 at close 274000`,
  );
}
console.log(
  `  005930 perTtm=${samsung.perTtm} perFy=${samsung.perFy} close=${samsung.close} `
  + `epsTtm=${samsung.epsTtm}`,
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
  `hub Naver TTM attach rate ${attachRate} >= ${MIN_TTM_FILL} `
  + `(filled=${ttmFilled} lossNull=${ttmNullLoss} missing=${ttmMissingQuote})`,
);
// Positive PER share is lower (적자); require a sane floor and no dropped quotes.
assert.ok(ttmMissingQuote / Math.max(1, hubCount) <= 0.1, 'too many hub without quotes_latest');
assert.ok(ttmFilled / Math.max(1, hubCount) >= 0.7, `positive perTtm share ${ttmFilled}/${hubCount}`);
console.log(
  `  hub TTM attach ${(attachRate * 100).toFixed(1)}% `
  + `(+per=${ttmFilled} lossNull=${ttmNullLoss} missing=${ttmMissingQuote})`,
);

// Spot-check: market percentile field is FY
let fyPos = 0;
for (const q of Object.values(snapshot.quotes || {})) {
  if (q.perFy != null && q.perFy > 0) fyPos += 1;
}
assert.ok(fyPos >= MIN_COUNT * 0.3, `enough perFy for market lines (${fyPos})`);

assert.ok(fs.existsSync(path.join(ROOT, 'js', 'map_valuation.js')), 'map_valuation.js');
const mapJs = fs.readFileSync(path.join(ROOT, 'js', 'map_valuation.js'), 'utf8');
assert.ok(/perTtm/.test(mapJs), 'map_valuation uses perTtm');
assert.ok(/resolveDisplay/.test(mapJs), 'map_valuation resolveDisplay');

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

for (const rel of MAP_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(
    /map_valuation\.js\?v=2/.test(html),
    `${rel} must include map_valuation.js?v=2`,
  );
  assert.ok(/id="valuation-root"/.test(html), `${rel} valuation-root`);
  assert.ok(/id="tab-btn-valuation"/.test(html), `${rel} tab-btn-valuation`);

  const perfIdx = html.indexOf('tab-btn-perfcalendar');
  const valIdx = html.indexOf('tab-btn-valuation');
  const tableIdx = html.indexOf('tab-btn-table');
  assert.ok(perfIdx >= 0 && valIdx > perfIdx, `${rel} valuation button after perfcalendar`);
  assert.ok(tableIdx > valIdx, `${rel} table button after valuation`);
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
