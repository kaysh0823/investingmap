/**
 * Ensures active relation-network sector pages reference the canonical script version.
 * Run: npm run verify:relation-network-asset-version
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  RELATION_NETWORK_ASSET_VERSION,
  relationNetworkJsRef,
} from '../lib/relation_network/asset_version.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = relationNetworkJsRef();
const STALE = 'relation_network.js?v=3';
const LEGACY_STALE = ['relation_network.js?v=1', 'relation_network.js?v=2'];

const ACTIVE_SECTOR_HTML = [
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
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];

const failures = [];

function countMatches(html, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');
  return (html.match(re) || []).length;
}

for (const rel of ACTIVE_SECTOR_HTML) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    failures.push(`${rel}: missing file`);
    continue;
  }
  const html = fs.readFileSync(fp, 'utf8');
  const includeCount = countMatches(html, /relation_network\.js\?v=\d+/g);
  const expectedCount = countMatches(html, EXPECTED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const staleCount = countMatches(html, STALE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (includeCount !== 1) {
    failures.push(`${rel}: expected 1 relation_network.js include, found ${includeCount}`);
  }
  if (expectedCount !== 1) {
    failures.push(`${rel}: expected ${EXPECTED}, found ${expectedCount} match(es)`);
  }
  if (staleCount > 0) {
    failures.push(`${rel}: stale ${STALE} reference (${staleCount})`);
  }
  if (html.includes(LEGACY_STALE[0]) || html.includes(LEGACY_STALE[1])) {
    failures.push(`${rel}: legacy stale relation_network.js?v=1 or v=2 reference`);
  }
}

// Guard patch source uses the shared constant (no hardcoded stale v=1).
const patchSrc = fs.readFileSync(path.join(ROOT, 'scripts/patch_relation_network.mjs'), 'utf8');
if (patchSrc.includes("relation_network.js?v=1") || patchSrc.includes("relation_network.js?v=2") || patchSrc.includes("relation_network.js?v=3")) {
  failures.push('scripts/patch_relation_network.mjs: hardcoded stale relation_network.js version');
}
if (!patchSrc.includes('relationNetworkJsRef()') && !patchSrc.includes('relationNetworkScriptSrc()')) {
  failures.push('scripts/patch_relation_network.mjs: missing shared asset version helper');
}

console.log('verify:relation-network-asset-version');
console.log(`  expected version: v=${RELATION_NETWORK_ASSET_VERSION} (${EXPECTED})`);
console.log(`  active sectors: ${ACTIVE_SECTOR_HTML.length}`);

if (failures.length) {
  console.error('\nFAILURES:');
  failures.forEach((f) => console.error('  -', f));
  process.exit(1);
}

console.log('\nOK — all active sector pages use canonical relation_network.js asset version.');
process.exit(0);
