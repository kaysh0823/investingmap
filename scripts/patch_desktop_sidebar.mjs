/**
 * Desktop left sidebar on hub, map pages, and trust pages.
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

function addScript(html, src) {
  if (html.includes('desktop_sidebar_nav.js')) return html;
  if (html.includes('global_bottom_nav.js')) {
    return html.replace(
      /<script src="([^"]*global_bottom_nav\.js)"><\/script>/,
      `<script src="${src}"></script>\n  <script src="$1"></script>`,
    );
  }
  return html.replace('</body>', `  <script src="${src}"></script>\n</body>`);
}

function patchRenderHook(html) {
  if (html.includes('InvestingMapDesktopSidebar.render')) return html;
  if (html.includes('InvestingMapGlobalBottomNav.render')) {
    return html.replace(
      /(if \(window\.InvestingMapGlobalBottomNav\) InvestingMapGlobalBottomNav\.render\(lang\);)/,
      `if (window.InvestingMapDesktopSidebar) InvestingMapDesktopSidebar.render(lang);\n      $1`,
    );
  }
  if (html.includes('InvestingMapSectorNav.render')) {
    return html.replace(
      /(if \(window\.InvestingMapSectorNav\) InvestingMapSectorNav\.render\([^)]+\);)/,
      `if (window.InvestingMapDesktopSidebar) InvestingMapDesktopSidebar.render(lang);\n      $1`,
    );
  }
  if (html.includes('syncThemeToggle();')) {
    return html.replace(
      /(syncThemeToggle\(\);)/,
      `if (window.InvestingMapDesktopSidebar) InvestingMapDesktopSidebar.render(lang);\n      $1`,
    );
  }
  return html;
}

function patchFile(rel, scriptSrc) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;
  html = addScript(html, scriptSrc);
  html = patchRenderHook(html);
  if (html !== before) {
    fs.writeFileSync(fp, html);
    console.log('patched desktop sidebar:', rel);
  } else {
    console.log('skip (already patched):', rel);
  }
}

for (const rel of MAP_FILES) patchFile(rel, '../js/desktop_sidebar_nav.js');
for (const rel of ROOT_PAGES) patchFile(rel, 'js/desktop_sidebar_nav.js');

console.log('OK patch_desktop_sidebar');
