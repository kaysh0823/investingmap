/**
 * Global bottom nav on all pages (does not remove desktop sector-nav).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GLOBAL_BOTTOM_NAV_V = 14;

const MAP_FILES = [
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

const ROOT_PAGES = [
  'index.html',
  'about.html',
  'privacy.html',
  'editorial-policy.html',
  'disclaimer.html',
  'authors.html',
  'faq.html',
];

function versionedSrc(relPath) {
  return `${relPath}?v=${GLOBAL_BOTTOM_NAV_V}`;
}

function bumpGlobalNavVersion(html) {
  return html.replace(
    /global_bottom_nav\.js(?:\?v=\d+)?/g,
    `global_bottom_nav.js?v=${GLOBAL_BOTTOM_NAV_V}`,
  );
}

function addGlobalNavScript(html, src) {
  if (html.includes('global_bottom_nav.js')) return bumpGlobalNavVersion(html);
  if (html.includes('geo_footer.js')) {
    return html.replace(
      /<script src="([^"]*geo_footer\.js)"><\/script>/,
      `<script src="${src}"></script>\n  <script src="$1"></script>`,
    );
  }
  return html.replace('</body>', `  <script src="${src}"></script>\n</body>`);
}

function patchApplyLangRoot(html) {
  if (!html.includes('InvestingMapGlobalBottomNav.render')) {
    html = html.replace(
      /(if \(window\.InvestingMapGeoFooter\) InvestingMapGeoFooter\.apply\(lang\);)/,
      `$1\n      if (window.InvestingMapGlobalBottomNav) InvestingMapGlobalBottomNav.render(lang);`,
    );
  }
  return html;
}

function patchMapFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf8');
  html = addGlobalNavScript(html, versionedSrc('../js/global_bottom_nav.js'));
  if (!html.includes('InvestingMapGlobalBottomNav.render')) {
    const hook = '      if (window.InvestingMapGlobalBottomNav) InvestingMapGlobalBottomNav.render(lang);\n';
    if (html.includes('InvestingMapMobileUx.syncAll')) {
      html = html.replace(
        /(if \(window\.InvestingMapMobileUx\) InvestingMapMobileUx\.syncAll\(\);)/,
        `$1\n${hook.trimEnd()}`,
      );
    }
  }
  fs.writeFileSync(fp, html);
  console.log('patched map bottom nav:', rel);
}

function patchRootFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf8');
  html = patchApplyLangRoot(html);
  html = addGlobalNavScript(html, versionedSrc('js/global_bottom_nav.js'));
  fs.writeFileSync(fp, html);
  console.log('patched root bottom nav:', rel);
}

function main() {
  for (const rel of MAP_FILES) patchMapFile(rel);
  for (const rel of ROOT_PAGES) patchRootFile(rel);
  console.log('OK patch_global_bottom_nav');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
