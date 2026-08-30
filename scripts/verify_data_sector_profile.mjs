/**
 * Verify data-sector attribute matches NETWORK_PROFILES for all 22 map pages.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NETWORK_PROFILES, profileForDataSector } from '../lib/relation_network/profiles.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const failures = [];
const warnings = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    fail(`missing map: ${rel}`);
    continue;
  }
  const html = fs.readFileSync(fp, 'utf8');
  const m = html.match(/<body[^>]*data-sector="([^"]+)"/);
  if (!m) {
    fail(`${rel}: missing data-sector on body`);
    continue;
  }
  const dataSector = m[1];
  const profile = profileForDataSector(dataSector);
  if (!profile) {
    fail(`${rel}: unknown data-sector="${dataSector}"`);
    continue;
  }
  if (profile.dataSector !== dataSector && !(dataSector === 'semi' && profile.sectorId === 'semiconductor')) {
    fail(`${rel}: profile dataSector mismatch for "${dataSector}"`);
  }
  if (!html.includes('id="graph-svg"')) {
    fail(`${rel}: missing graph-svg container`);
  }
  if (!html.includes('relation_network.js')) {
    fail(`${rel}: missing relation_network.js`);
  }
  if (dataSector === 'semi' && rel.includes('robot/')) {
    fail(`${rel}: robot page must not use data-sector="semi"`);
  }
  if (dataSector === 'robot' && rel.includes('semiconductor/')) {
    fail(`${rel}: semiconductor page must not use data-sector="robot"`);
  }
  if (rel.includes('robot/') && html.includes("CURATED_RELATION_MODE = 'chainGroup'")) {
    warn(`${rel}: semi curated relation constants still present`);
  }
}

const profileKeys = new Set(Object.keys(NETWORK_PROFILES));
const covered = new Set(MAP_FILES.map((f) => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const m = html.match(/data-sector="([^"]+)"/);
  return m ? m[1] : null;
}).filter(Boolean));

console.log('verify:data-sector-profile');
console.log('maps checked:', MAP_FILES.length);
console.log('unique data-sector values:', [...covered].sort().join(', '));
console.log('profile keys:', profileKeys.size);
console.log('failures:', failures.length);
console.log('warnings:', warnings.length);
failures.forEach((f) => console.log(' FAIL', f));
warnings.forEach((w) => console.log(' WARN', w));
process.exit(failures.length ? 1 : 0);
