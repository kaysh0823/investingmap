/**
 * Adds tabHeatmap / heatmapHint to map T objects (fixes "undefined" tab label).
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
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

const KO_INSERT =
  '"tabHeatmap": "🔥 섹터 히트맵",\n        "heatmapHint": "칸 크기 = 시가총액 · 색 = 당일 등락률",\n        ';
const EN_INSERT =
  '"tabHeatmap": "🔥 Sector heatmap",\n        "heatmapHint": "Tile size = market cap · color = 1-day return",\n        ';

const TAB_FALLBACK =
  "document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap || (lang === 'en' ? '🔥 Sector heatmap' : '🔥 섹터 히트맵');";

for (const rel of MAPS) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');
  if (!/["']tabHeatmap["']\s*:/.test(c)) {
    let pass = 0;
    c = c.replace(/("dataAsof": "[^"]+",\r?\n        )"tabTable":/g, (m, prefix) => {
      pass++;
      return prefix + (pass === 1 ? KO_INSERT : EN_INSERT) + '"tabTable":';
    });
    if (pass < 2) console.warn('tabHeatmap insert incomplete:', rel, 'passes=', pass);
  }
  c = c
    .replace(/🔥 시총 히트맵/g, '🔥 섹터 히트맵')
    .replace(/🔥 Market-cap heatmap/g, '🔥 Sector heatmap')
    .replace(/🔥 Market cap heatmap/g, '🔥 Sector heatmap')
    .replace(/aria-label="Market cap heatmap"/g, 'aria-label="Sector heatmap"');
  c = c.replace(
    /document\.getElementById\('tab-btn-heatmap'\)\.innerHTML = t\.tabHeatmap;/g,
    TAB_FALLBACK,
  );
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched', rel);
}

const bioTrPath = join(root, 'bio', 'bio_translations.json');
const bioTr = JSON.parse(fs.readFileSync(bioTrPath, 'utf8'));
for (const lang of ['ko', 'en']) {
  bioTr[lang].tabHeatmap = lang === 'ko' ? '🔥 섹터 히트맵' : '🔥 Sector heatmap';
  bioTr[lang].heatmapHint =
    lang === 'ko'
      ? '칸 크기 = 시가총액 · 색 = 당일 등락률'
      : 'Tile size = market cap · color = 1-day return';
}
fs.writeFileSync(bioTrPath, JSON.stringify(bioTr, null, 2) + '\n', 'utf8');
console.log('patched bio_translations.json');

for (const rel of ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js']) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(
    /document\.getElementById\('tab-btn-heatmap'\)\.innerHTML = t\.tabHeatmap;/g,
    TAB_FALLBACK,
  )
    .replace(/🔥 시총 히트맵/g, '🔥 섹터 히트맵')
    .replace(/🔥 Market-cap heatmap/g, '🔥 Sector heatmap')
    .replace(/🔥 Market cap heatmap/g, '🔥 Sector heatmap');
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched', rel);
}
