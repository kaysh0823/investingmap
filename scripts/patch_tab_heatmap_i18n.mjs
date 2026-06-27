/**
 * Adds tabHeatmap / heatmapHint to map T objects (fixes "undefined" tab label).
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const KO_INSERT =
  '"tabHeatmap": "🔥 시총 히트맵",\n        "heatmapHint": "타일 크기 = 시가총액(KRX 기준) · 색상 = 벨류체인/섹터 분류",\n        ';
const EN_INSERT =
  '"tabHeatmap": "🔥 Market cap heatmap",\n        "heatmapHint": "Tile size = market cap (KRX) · color = value chain / sector",\n        ';

const TAB_FALLBACK =
  "document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap || (lang === 'en' ? '🔥 Market cap heatmap' : '🔥 시총 히트맵');";

for (const rel of MAPS) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('"tabHeatmap":')) {
    let pass = 0;
    c = c.replace(/("dataAsof": "[^"]+",\r?\n        )"tabTable":/g, (m, prefix) => {
      pass++;
      return prefix + (pass === 1 ? KO_INSERT : EN_INSERT) + '"tabTable":';
    });
    if (pass < 2) console.warn('tabHeatmap insert incomplete:', rel, 'passes=', pass);
  }
  c = c.replace(
    /document\.getElementById\('tab-btn-heatmap'\)\.innerHTML = t\.tabHeatmap;/g,
    TAB_FALLBACK,
  );
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched', rel);
}

const semiPath = join(root, 'semiconductor/korea_semiconductor_map.html');
let semi = fs.readFileSync(semiPath, 'utf8');
semi = semi.replace(
  /document\.getElementById\('tab-btn-heatmap'\)\.innerHTML = t\.tabHeatmap;/g,
  TAB_FALLBACK,
);
fs.writeFileSync(semiPath, semi, 'utf8');
console.log('patched semiconductor fallback');

const bioTrPath = join(root, 'bio', 'bio_translations.json');
const bioTr = JSON.parse(fs.readFileSync(bioTrPath, 'utf8'));
for (const lang of ['ko', 'en']) {
  if (!bioTr[lang].tabHeatmap) {
    bioTr[lang].tabHeatmap = lang === 'ko' ? '🔥 시총 히트맵' : '🔥 Market cap heatmap';
    bioTr[lang].heatmapHint =
      lang === 'ko'
        ? '타일 크기 = 시가총액(KRX 기준) · 색상 = 섹터 분류'
        : 'Tile size = market cap (KRX) · color = sector';
  }
}
fs.writeFileSync(bioTrPath, JSON.stringify(bioTr, null, 2) + '\n', 'utf8');
console.log('patched bio_translations.json');

for (const rel of ['bio/bio_inline_tail.js']) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(
    /document\.getElementById\('tab-btn-heatmap'\)\.innerHTML = t\.tabHeatmap;/g,
    TAB_FALLBACK,
  );
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched', rel);
}
