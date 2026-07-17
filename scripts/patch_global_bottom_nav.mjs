/**
 * Global bottom nav on all pages (does not remove desktop sector-nav).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAP_FILES = [
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

function addGlobalNavScript(html, src) {
  if (html.includes('global_bottom_nav.js')) return html;
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
  html = addGlobalNavScript(html, '../js/global_bottom_nav.js');
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
  html = addGlobalNavScript(html, 'js/global_bottom_nav.js');
  fs.writeFileSync(fp, html);
  console.log('patched root bottom nav:', rel);
}

for (const rel of MAP_FILES) patchMapFile(rel);
for (const rel of ROOT_PAGES) patchRootFile(rel);

console.log('OK patch_global_bottom_nav');
