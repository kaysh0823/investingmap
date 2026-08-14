/**
 * Patch map pages: load map_cross_sector.js + cross-sector name cell in renderTable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'investingmap-cross-sector-v1';

const TARGETS = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
];

const SCRIPT_TAG = '  <script src="../js/map_cross_sector.js?v=1"></script>';

const HTML_NAME_OLD = '<td><div class="company-name">${displayName}</div>${subNameHtml}</td>';
const HTML_NAME_NEW =
  '<td>${(window.InvestingMapCrossSector && InvestingMapCrossSector.nameCellHtml(c, displayName, subNameHtml, lang)) || (`<div class="company-name">${displayName}</div>${subNameHtml}`)}</td>';

const BIO_NAME_OLD =
  "'<td><div class=\"company-name\">' + displayName + '</div>' + subNameHtml + '</td>' +";
const BIO_NAME_NEW =
  "'<td>' + ((window.InvestingMapCrossSector && InvestingMapCrossSector.nameCellHtml(c, displayName, subNameHtml, lang)) || ('<div class=\"company-name\">' + displayName + '</div>' + subNameHtml)) + '</td>' +";

function patchFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.log('skip (missing)', rel);
    return;
  }
  let html = fs.readFileSync(fp, 'utf8');
  if (html.includes(MARKER) && html.includes('InvestingMapCrossSector')) {
    console.log('skip (patched)', rel);
    return;
  }

  const isBioJs = rel.endsWith('.js');
  if (!isBioJs && !html.includes('map_cross_sector.js')) {
    if (html.includes('../js/map_i18n.js')) {
      html = html.replace(
        /(<script src="\.\.\/js\/map_i18n\.js"><\/script>)/,
        `$1\n${SCRIPT_TAG}`,
      );
    }
  }

  if (html.includes(HTML_NAME_OLD)) {
    html = html.replace(HTML_NAME_OLD, HTML_NAME_NEW);
  } else if (html.includes(BIO_NAME_OLD)) {
    html = html.replace(BIO_NAME_OLD, BIO_NAME_NEW);
  } else if (!html.includes('InvestingMapCrossSector') && !isBioJs) {
    // bio/korea_bio_map.html loads inline.js — script tag only
    if (!html.includes('map_cross_sector.js')) {
      console.warn('WARN name cell pattern not found (script only):', rel);
    }
  } else if (!html.includes('InvestingMapCrossSector')) {
    console.warn('WARN name cell pattern not found:', rel);
    return;
  }

  if (!html.includes(MARKER)) {
    if (isBioJs && html.startsWith('/* Generated')) {
      html = html.replace(/^(\/\* Generated[^\n]*\n)/, `$1/* ${MARKER} */\n`);
    } else if (!isBioJs) {
      html = html.replace(/(<head>)/, `$1\n  <!-- ${MARKER} -->`);
    } else {
      html = `/* ${MARKER} */\n` + html;
    }
  }

  fs.writeFileSync(fp, html, 'utf8');
  console.log('OK', rel);
}

for (const rel of TARGETS) patchFile(rel);
console.log('OK patch_cross_sector_ui');
