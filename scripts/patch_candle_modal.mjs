/**
 * Inject candle_modal.js on industry map pages (idempotent ?v= bump).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_V = 11;

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

const CANDLE_TAG = `<script src="../js/candle_modal.js?v=${SCRIPT_V}"></script>`;

function patchApplyLang(html) {
  if (html.includes('InvestingMapCandleModal.applyLang')) return html;
  const hook =
    "      if (window.InvestingMapCandleModal && InvestingMapCandleModal.applyLang) InvestingMapCandleModal.applyLang();\n";
  if (html.includes('InvestingMapMobileUx.syncAll')) {
    return html.replace(
      /(if \(window\.InvestingMapMobileUx\) InvestingMapMobileUx\.syncAll\(\);\s*\n)/,
      '$1' + hook,
    );
  }
  if (/syncThemeToggle\(\);\s*\n\s*updateQuotesAsofDisplay\(\);/.test(html)) {
    return html.replace(
      /(syncThemeToggle\(\);\s*\n\s*updateQuotesAsofDisplay\(\);)/,
      '$1\n' + hook.trimEnd(),
    );
  }
  return html;
}

function patchScript(html) {
  if (html.includes('candle_modal.js')) {
    return html.replace(/candle_modal\.js\?v=\d+/g, `candle_modal.js?v=${SCRIPT_V}`);
  }
  if (html.includes('map_mobile_ux.js')) {
    return html.replace(
      /(<script src="\.\.\/js\/map_mobile_ux\.js\?v=\d+"><\/script>)/,
      `$1\n  ${CANDLE_TAG}`,
    );
  }
  if (html.includes('map_mobile_table.js')) {
    return html.replace(
      /(<script src="\.\.\/js\/map_mobile_table\.js\?v=\d+"><\/script>)/,
      `$1\n  ${CANDLE_TAG}`,
    );
  }
  return html;
}

function patchFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return;
  }
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;
  html = patchScript(html);
  html = patchApplyLang(html);
  // Keep mobile table cache buster in sync with spark/mobile patches
  html = html.replace(/map_mobile_table\.js\?v=\d+/g, 'map_mobile_table.js?v=9');
  if (html === before) {
    console.log('unchanged', rel);
    return;
  }
  fs.writeFileSync(fp, html, 'utf8');
  console.log('patched', rel);
}

for (const rel of MAP_FILES) patchFile(rel);

function patchBioApplyLang(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let src = fs.readFileSync(fp, 'utf8');
  if (src.includes('InvestingMapCandleModal.applyLang')) {
    console.log('bio applyLang already', rel);
    return;
  }
  const before = src;
  if (src.includes('InvestingMapMobileUx.syncAll')) {
    src = src.replace(
      /(if \(window\.InvestingMapMobileUx\) \{ InvestingMapMobileUx\.syncAll\(\);[^\n]*\n)/,
      '$1      if (window.InvestingMapCandleModal && InvestingMapCandleModal.applyLang) InvestingMapCandleModal.applyLang();\n',
    );
  }
  if (src !== before) {
    fs.writeFileSync(fp, src, 'utf8');
    console.log('patched', rel);
  } else {
    console.log('unchanged', rel);
  }
}

patchBioApplyLang('bio/bio_inline_tail.js');
patchBioApplyLang('bio/korea_bio_map.inline.js');

console.log('OK patch_candle_modal v=' + SCRIPT_V);
