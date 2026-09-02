/**
 * Inject global_search.js on all map pages + root pages.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GLOBAL_SEARCH_V = 2;

export const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
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

export const ROOT_PAGES = [
  'index.html',
  'about.html',
  'privacy.html',
  'editorial-policy.html',
  'disclaimer.html',
  'authors.html',
  'faq.html',
];

function versionedSrc(relPath) {
  return `${relPath}?v=${GLOBAL_SEARCH_V}`;
}

function bumpSearchVersion(html) {
  return html.replace(
    /global_search\.js(?:\?v=\d+)?/g,
    `global_search.js?v=${GLOBAL_SEARCH_V}`,
  );
}

function addGlobalSearchScript(html, src) {
  if (html.includes('global_search.js')) return bumpSearchVersion(html);
  if (html.includes('global_bottom_nav.js')) {
    return html.replace(
      /<script src="([^"]*global_bottom_nav\.js[^"]*)"><\/script>/,
      `<script src="${src}"></script>\n  <script src="$1"></script>`,
    );
  }
  if (html.includes('geo_footer.js')) {
    return html.replace(
      /<script src="([^"]*geo_footer\.js)"><\/script>/,
      `<script src="${src}"></script>\n  <script src="$1"></script>`,
    );
  }
  return html.replace('</body>', `  <script src="${src}"></script>\n</body>`);
}

function patchFile(rel, src) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf8');
  html = addGlobalSearchScript(html, src);
  fs.writeFileSync(fp, html);
  console.log('patched global search:', rel);
}

function main() {
  for (const rel of MAP_FILES) patchFile(rel, versionedSrc('../js/global_search.js'));
  for (const rel of ROOT_PAGES) patchFile(rel, versionedSrc('js/global_search.js'));
  console.log('OK patch_global_search');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
