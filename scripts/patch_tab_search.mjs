/**
 * Ensure map_tab_search.js loads before map_heatmap.js on all 26 sector pages.
 * Exact-string insert only (no regex range splice).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/** Exact anchors — insert TAB_SEARCH_TAG immediately before this substring. */
const ANCHOR = '  <script src="../js/map_heatmap.js';
const TAG = '  <script src="../js/map_tab_search.js?v=0"></script>\n';

function processFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return { rel, skipped: true };
  }
  let html = fs.readFileSync(fp, 'utf8');
  if (html.includes('js/map_tab_search.js')) {
    return { rel, changed: false };
  }
  const n = html.split(ANCHOR).length - 1;
  if (n === 0) {
    throw new Error(`[${rel}] anchor not found: ${JSON.stringify(ANCHOR)}`);
  }
  if (n !== 1) {
    throw new Error(`[${rel}] expected exactly 1 anchor, found ${n}`);
  }
  html = html.replace(ANCHOR, TAG + ANCHOR);
  fs.writeFileSync(fp, html, 'utf8');
  return { rel, changed: true };
}

const results = MAP_FILES.map(processFile);
console.log(
  'OK patch_tab_search — inserted',
  results.filter((r) => r.changed).length,
  '/ skipped',
  results.filter((r) => !r.changed && !r.skipped).length,
);
