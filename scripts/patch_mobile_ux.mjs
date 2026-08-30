/**
 * Inject map_mobile_ux.js, hook applyLang, update heatmap hint text.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const HINT_KO_OLD = /\uD0C0\uC77C \uD06C\uAE30 = \uC2DC\uAC00\uCD1D\uC561\(KRX \uAE30\uC900\) \uB7 \uC0C9\uC0C1 = (?:\uBCA8\uB958\uCCB4\uC778\/?\uC139\uD130|\uC139\uD130) \uBD84\uB958/g;
const HINT_KO_NEW = '\uC2DC\uAC00\uCD1D\uC561 \uAE30\uC900';
const HINT_EN_OLD = /Tile size = market cap \(KRX\) ? color = (?:value chain \/ sector|sector)/g;
const HINT_EN_NEW = 'By market cap';

function patchHeatmapHints(html) {
  html = html.replace(HINT_KO_OLD, HINT_KO_NEW);
  html = html.replace(HINT_EN_OLD, HINT_EN_NEW);
  html = html.replace(/\uD0C0\uC77C \uD06C\uAE30[^'"]+/g, HINT_KO_NEW);
  html = html.replace(/heatmapHint: 'Tile size[^']+'/g, "heatmapHint: 'By market cap'");
  html = html.replace(/"heatmapHint": "Tile size[^"]+"/g, '"heatmapHint": "By market cap"');
  return html;
}

function patchApplyLangHook(html) {
  if (html.includes('InvestingMapMobileUx.syncAll')) return html;
  const hook = '      if (window.InvestingMapMobileUx) InvestingMapMobileUx.syncAll();\n';

  if (/if \(svgEl\) \{[\s\S]*?\n      \}\n    \}/.test(html)) {
    html = html.replace(
      /(if \(svgEl\) \{[\s\S]*?\n      \}\n)(    \})/,
      '$1' + hook + '$2',
    );
    return html;
  }

  if (/function applyLang\(\)/.test(html)) {
    html = html.replace(
      /(syncThemeToggle\(\);\s*\n\s*updateQuotesAsofDisplay\(\);)/,
      '$1\n' + hook.trimEnd(),
    );
  }
  return html;
}

function patchScriptTag(html) {
  if (html.includes('map_mobile_ux.js')) {
    return html.replace(
      /map_mobile_ux\.js(\?v=\d+)?/g,
      'map_mobile_ux.js?v=8',
    );
  }
  if (html.includes('map_mobile_table.js')) {
    return html.replace(
      /<script src="\.\.\/js\/map_mobile_table\.js(\?v=\d+)?"><\/script>\s*/,
      '<script src="../js/map_mobile_table.js?v=9"></script>\n  <script src="../js/map_mobile_ux.js?v=8"></script>\n',
    );
  }
  return html;
}

function patchMobileTabsCss(html) {
  const tabsCss = `.tabs {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding: 0;
        overflow: visible;
        gap: 0
      }`;
  const tabBtnCss = `.tab-btn {
        padding: 10px 3px;
        font-size: 10px;
        white-space: normal;
        word-break: keep-all;
        line-height: 1.35;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center
      }`;
  return html
    .replace(
      /\.tabs \{\s*\n\s*padding: 0 12px;\s*\n\s*overflow-x: auto;[\s\S]*?flex-wrap: nowrap\s*\n\s*\}/,
      tabsCss,
    )
    .replace(
      /\.tabs \{\s*\n\s*display: grid;\s*\n\s*grid-template-columns: repeat\([34], minmax\(0, 1fr\)\);[\s\S]*?gap: 0\s*\n\s*\}/,
      tabsCss,
    )
    .replace(
      /\.tab-btn \{\s*\n\s*padding: 10px 12px;\s*\n\s*font-size: 12px;\s*\n\s*flex-shrink: 0\s*\n\s*\}/,
      tabBtnCss,
    )
    .replace(
      /\.tab-btn \{\s*\n\s*padding: 10px [36]px;\s*\n\s*font-size: 1[01]px;[\s\S]*?justify-content: center\s*\n\s*\}/,
      tabBtnCss,
    );
}

function patchFile(rel) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  html = patchHeatmapHints(html);
  html = patchApplyLangHook(html);
  html = patchScriptTag(html);
  html = patchMobileTabsCss(html);
  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', rel);
}

for (const rel of MAP_FILES) patchFile(rel);

for (const rel of ['bio/bio_inline_tail.js']) {
  const abs = path.join(root, rel);
  let js = fs.readFileSync(abs, 'utf8');
  js = patchApplyLangHook(js);
  fs.writeFileSync(abs, js, 'utf8');
  console.log('patched:', rel);
}

const bioTrPath = path.join(root, 'bio/bio_translations.json');
if (fs.existsSync(bioTrPath)) {
  const bioTr = JSON.parse(fs.readFileSync(bioTrPath, 'utf8'));
  for (const lang of ['ko', 'en']) {
    if (bioTr[lang]) {
      bioTr[lang].heatmapHint = lang === 'ko' ? '\uC2DC\uAC00\uCD1D\uC561 \uAE30\uC900' : 'By market cap';
    }
  }
  fs.writeFileSync(bioTrPath, JSON.stringify(bioTr, null, 2) + '\n', 'utf8');
  console.log('patched: bio/bio_translations.json');
}

console.log('OK patch_mobile_ux');
