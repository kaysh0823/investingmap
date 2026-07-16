/**
 * Patch all map HTML: chainDisplayLabel, heatmap chainLabel, notifyLangApplied.
 * Usage: node scripts/patch_chain_i18n_maps.mjs
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'kculture/korea_kculture_map.html',
  'kconsume/korea_kconsume_map.html',
  'kcontent/korea_kcontent_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
];

const CHAIN_LABEL_OLD =
  /const chainLabel = \(ch\) => lang === 'ko' \? \(t\.chainFilter\[ch\] \|\| ch\) : \(t\.chainFilter\[ch\] \|\| ch\);/g;

const CHAIN_LABEL_NEW =
  "const chainLabel = (ch) => (window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainFilter[ch] || t.chainLabel[ch] || ch);";

const CHIP_LABEL_OLD =
  /const label = ch === 'all' \? t\.allFilter : \(t\.chainFilter\[ch\] \|\| ch\);/g;

const CHIP_LABEL_NEW =
  "const label = ch === 'all' ? t.allFilter : ((window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainFilter[ch] || ch));";

const SIDEBAR_LEGEND_OLD = /\$\{t\.chainLabel\[ch\] \|\| ch\}/g;
const SIDEBAR_LEGEND_NEW = '${(window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainLabel[ch] || ch)}';

const SYNC_ALL_OLD =
  /if \(window\.InvestingMapMobileUx\) InvestingMapMobileUx\.syncAll\(\);/g;

const SYNC_ALL_NEW =
  'if (window.InvestingMapMobileUx) { InvestingMapMobileUx.syncAll(); if (InvestingMapMobileUx.notifyLangApplied) InvestingMapMobileUx.notifyLangApplied(); }';

const HEATMAP_CHAIN_MARKER = 'formatMcap: fmtMcapTableCell,';
const HEATMAP_CHAIN_INSERT =
  'formatMcap: fmtMcapTableCell,\n        chainLabel: function (ch) { return (window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, T[lang]) : ch; },';

let changed = 0;
for (const rel of MAPS) {
  const p = join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.warn('skip missing', rel);
    continue;
  }
  let html = fs.readFileSync(p, 'utf8');
  const orig = html;
  html = html.replace(CHAIN_LABEL_OLD, CHAIN_LABEL_NEW);
  html = html.replace(CHIP_LABEL_OLD, CHIP_LABEL_NEW);
  html = html.replace(SIDEBAR_LEGEND_OLD, SIDEBAR_LEGEND_NEW);
  html = html.replace(SYNC_ALL_OLD, SYNC_ALL_NEW);
  if (html.includes(HEATMAP_CHAIN_MARKER) && !html.includes('chainLabel: function (ch)')) {
    html = html.replace(HEATMAP_CHAIN_MARKER, HEATMAP_CHAIN_INSERT);
  }
  if (html !== orig) {
    fs.writeFileSync(p, html, 'utf8');
    changed++;
    console.log('patched', rel);
  }
}
console.log('Done. Files changed:', changed);
