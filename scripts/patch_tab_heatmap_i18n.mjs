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
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];

const TAB_HEATMAP_KO = '\uD83D\uDD25 \uC11C\uD130 \uD788\uD2B8\uB9F5';
const TAB_HEATMAP_EN = '\uD83D\uDD25 Sector heatmap';
const HINT_KO = '\uC2DC\uAC00\uCD1D\uC561 \uAE30\uC900';
const HINT_EN_CHG = 'Tile size = market cap \u00B7 color = 1-day return';

const KO_INSERT =
  `"tabHeatmap": "${TAB_HEATMAP_KO}",\n        "heatmapHint": "${HINT_KO}",\n        `;
const EN_INSERT =
  `"tabHeatmap": "${TAB_HEATMAP_EN}",\n        "heatmapHint": "${HINT_EN_CHG}",\n        `;

const TAB_FALLBACK =
  `document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap || (lang === 'en' ? '${TAB_HEATMAP_EN}' : '${TAB_HEATMAP_KO}');`;

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
    .replace(/\uD83D\uDD25 \uC2DC\uC791\uC529 \uD788\uD2B8\uB9F5/g, TAB_HEATMAP_KO)
    .replace(/\uD83D\uDD25 Market-cap heatmap/g, TAB_HEATMAP_EN)
    .replace(/\uD83D\uDD25 Market cap heatmap/g, TAB_HEATMAP_EN)
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
  bioTr[lang].tabHeatmap = lang === 'ko' ? TAB_HEATMAP_KO : TAB_HEATMAP_EN;
  bioTr[lang].heatmapHint = lang === 'ko' ? HINT_KO : HINT_EN_CHG;
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
    .replace(/\uD83D\uDD25 \uC2DC\uC791\uC529 \uD788\uD2B8\uB9F5/g, TAB_HEATMAP_KO)
    .replace(/\uD83D\uDD25 Market-cap heatmap/g, TAB_HEATMAP_EN)
    .replace(/\uD83D\uDD25 Market cap heatmap/g, TAB_HEATMAP_EN);
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched', rel);
}

console.log('OK patch_tab_heatmap_i18n');
