/**
 * Assert sector map INIT is not gated on /api/fx (loadFx).
 * - no loadFx().then( wrapping INIT
 * - InvestingMapTabState.applyInitialTab(switchTab) outside loadFx callbacks
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Maps that embed loadFx INIT (matches patch_map_nav_filters MAP_FILES minus bio HTML). */
const REQUIRED = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
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

function readMapSource(rel) {
  const distPath = path.join(ROOT, 'dist', rel);
  const srcPath = path.join(ROOT, rel);
  // Prefer dist (verify:dist runs after pages_build); fall back to source.
  if (fs.existsSync(distPath)) return fs.readFileSync(distPath, 'utf8');
  if (fs.existsSync(srcPath)) return fs.readFileSync(srcPath, 'utf8');
  return null;
}

function assertInitDecoupled(rel, html) {
  assert.ok(html, `${rel}: missing`);
  const thenCount = (html.match(/loadFx\(\)\.then\(/g) || []).length;
  assert.equal(thenCount, 0, `${rel}: loadFx().then( must be 0 (got ${thenCount})`);

  assert.ok(
    html.includes('InvestingMapTabState.applyInitialTab(switchTab)'),
    `${rel}: applyInitialTab missing`,
  );

  // applyInitialTab must not sit inside a loadFx().then/catch/finally callback.
  assert.ok(
    !/loadFx\(\)\.(?:then|catch|finally)\([\s\S]*?InvestingMapTabState\.applyInitialTab/.test(html),
    `${rel}: applyInitialTab still inside loadFx callback`,
  );

  assert.ok(
    /(?:^|\n)\s*loadFx\(\);\s*(?:\n|$)/.test(html),
    `${rel}: bare loadFx(); fire-and-forget missing`,
  );

  assert.ok(
    html.includes('AbortController') && /signal:\s*ac/.test(html),
    `${rel}: loadFx AbortController/signal timeout missing`,
  );
}

assert.equal(REQUIRED.length, 25, 'expected 25 sector HTML maps with inline loadFx INIT');

let ok = 0;
for (const rel of REQUIRED) {
  const html = readMapSource(rel);
  assertInitDecoupled(rel, html);
  ok++;
  console.log(`  init OK ${rel}`);
}

// Bio embeds INIT in inline JS (not the HTML shell).
for (const rel of ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js']) {
  const distPath = path.join(ROOT, 'dist', rel);
  const srcPath = path.join(ROOT, rel);
  const js = fs.existsSync(distPath)
    ? fs.readFileSync(distPath, 'utf8')
    : fs.existsSync(srcPath)
      ? fs.readFileSync(srcPath, 'utf8')
      : null;
  if (!js) continue;
  assert.equal((js.match(/loadFx\(\)\.then\(/g) || []).length, 0, `${rel}: loadFx().then(`);
  assert.ok(
    js.includes('InvestingMapTabState.applyInitialTab(switchTab)'),
    `${rel}: applyInitialTab`,
  );
  assert.ok(
    !/loadFx\(\)\.(?:then|catch|finally)\([\s\S]*?InvestingMapTabState\.applyInitialTab/.test(js),
    `${rel}: applyInitialTab inside loadFx callback`,
  );
  console.log(`  init OK ${rel}`);
}

console.log(`verify:map_init OK — ${ok} sector HTML + bio inline`);
