/**
 * Bump map_heatmap.js ?v= and heatmap hint copy (size=mcap, color=1D return).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_V = 10;

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
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];

const HINT_KO = '칸 크기 = 시가총액 · 색 = 당일 등락률';
const HINT_EN = 'Tile size = market cap · color = 1-day return';

function patchHtml(html) {
  html = html.replace(/map_heatmap\.js(\?v=\d+)?/g, `map_heatmap.js?v=${SCRIPT_V}`);
  html = html.replace(/live_quotes\.js\?v=\d+/g, 'live_quotes.js?v=14');
  html = html.replace(/heatmapHint:\s*'시가총액 기준'/g, `heatmapHint: '${HINT_KO}'`);
  html = html.replace(/heatmapHint:\s*'By market cap'/g, `heatmapHint: '${HINT_EN}'`);
  html = html.replace(/"heatmapHint":\s*"시가총액 기준"/g, `"heatmapHint": "${HINT_KO}"`);
  html = html.replace(/"heatmapHint":\s*"By market cap"/g, `"heatmapHint": "${HINT_EN}"`);
  html = html.replace(
    /heatmapHint: 'Tile size = market cap \(KRX\) · color = value chain \/ sector'/g,
    `heatmapHint: '${HINT_EN}'`,
  );
  return html;
}

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const next = patchHtml(fs.readFileSync(fp, 'utf8'));
  fs.writeFileSync(fp, next, 'utf8');
  console.log('patched', rel);
}

const bioTrPath = path.join(ROOT, 'bio', 'bio_translations.json');
if (fs.existsSync(bioTrPath)) {
  const bioTr = JSON.parse(fs.readFileSync(bioTrPath, 'utf8'));
  if (bioTr.ko) bioTr.ko.heatmapHint = HINT_KO;
  if (bioTr.en) bioTr.en.heatmapHint = HINT_EN;
  fs.writeFileSync(bioTrPath, JSON.stringify(bioTr, null, 2) + '\n', 'utf8');
  console.log('patched bio/bio_translations.json');
}

console.log('OK patch_heatmap_chg v=' + SCRIPT_V);
