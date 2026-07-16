/**
 * Inject map_mobile_ux.js, hook applyLang, update heatmap hint text.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAP_FILES = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'energy/korea_energy_map.html',
  'kconsume/korea_kconsume_map.html',
  'kcontent/korea_kcontent_map.html',
];

const HINT_KO_OLD = /타일 크기 = 시가총액\(KRX 기준\) · 색상 = (?:벨류체인\/섹터|섹터) 분류/g;
const HINT_KO_NEW = '시가총액 기준';
const HINT_EN_OLD = /Tile size = market cap \(KRX\) · color = (?:value chain \/ sector|sector)/g;
const HINT_EN_NEW = 'By market cap';

function patchHeatmapHints(html) {
  html = html.replace(HINT_KO_OLD, HINT_KO_NEW);
  html = html.replace(HINT_EN_OLD, HINT_EN_NEW);
  html = html.replace(/heatmapHint: '타일 크기[^']+'/g, "heatmapHint: '시가총액 기준'");
  html = html.replace(/heatmapHint: 'Tile size[^']+'/g, "heatmapHint: 'By market cap'");
  html = html.replace(/"heatmapHint": "타일 크기[^"]+"/g, '"heatmapHint": "시가총액 기준"');
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
  if (html.includes('map_mobile_ux.js')) return html;
  return html.replace(
    /<script src="\.\.\/js\/map_mobile_table\.js"><\/script>\s*/,
    '<script src="../js/map_mobile_table.js"></script>\n  <script src="../js/map_mobile_ux.js"></script>\n',
  );
}

function patchMobileTabsCss(html) {
  return html.replace(
    /\.tabs \{\s*\n\s*padding: 0 12px;\s*\n\s*overflow-x: auto;[\s\S]*?flex-wrap: nowrap\s*\n\s*\}/,
    `.tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        padding: 0;
        overflow: visible;
        gap: 0
      }`,
  ).replace(
    /\.tab-btn \{\s*\n\s*padding: 10px 12px;\s*\n\s*font-size: 12px;\s*\n\s*flex-shrink: 0\s*\n\s*\}/,
    `.tab-btn {
        padding: 10px 6px;
        font-size: 11px;
        white-space: normal;
        word-break: keep-all;
        line-height: 1.35;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center
      }`,
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
      bioTr[lang].heatmapHint = lang === 'ko' ? '시가총액 기준' : 'By market cap';
    }
  }
  fs.writeFileSync(bioTrPath, JSON.stringify(bioTr, null, 2) + '\n', 'utf8');
  console.log('patched: bio/bio_translations.json');
}

console.log('OK patch_mobile_ux');
