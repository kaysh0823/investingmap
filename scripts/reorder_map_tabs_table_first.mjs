/**
 * Reorder map tabs: table → heatmap → graph; make table the default active tab.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'kculture/korea_kculture_map.html',
  'bio/korea_bio_map.html',
  'robot/korea_robot_map.html',
];

const BUTTONS_RE =
  /<div class="tabs">\s*<button id="tab-btn-heatmap"[^>]*>[\s\S]*?<\/button>\s*<button id="tab-btn-table"[^>]*>[\s\S]*?<\/button>\s*<button id="tab-btn-graph"[^>]*>[\s\S]*?<\/button>\s*<\/div>/;

function extractBtn(html, id) {
  const re = new RegExp(`<button id="${id}"[^>]*>[\\s\\S]*?<\\/button>`);
  const m = html.match(re);
  return m ? m[0] : null;
}

function setBtnActive(btnHtml, active) {
  if (active) {
    return btnHtml
      .replace(/class="tab-btn"/, 'class="tab-btn active"')
      .replace(/class="tab-btn active active"/, 'class="tab-btn active"');
  }
  return btnHtml.replace(/class="tab-btn active"/g, 'class="tab-btn"');
}

function setPanelActive(html, id, active) {
  const re = new RegExp(`(<div id="${id}" class="tab-content)( active)?(">)`);
  return html.replace(re, active ? `$1 active$3` : `$1$3`.replace(' class="tab-content"', ' class="tab-content"'));
}

function patchFile(rel) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  const block = html.match(BUTTONS_RE);
  if (!block) {
    console.warn('skip (no tabs block):', rel);
    return false;
  }

  const heatBtn = extractBtn(block[0], 'tab-btn-heatmap');
  const tableBtn = extractBtn(block[0], 'tab-btn-table');
  const graphBtn = extractBtn(block[0], 'tab-btn-graph');
  if (!heatBtn || !tableBtn || !graphBtn) {
    console.warn('skip (missing button):', rel);
    return false;
  }

  const newTabs =
    '<div class="tabs">\n' +
    `    ${setBtnActive(tableBtn, true)}\n` +
    `    ${setBtnActive(heatBtn, false)}\n` +
    `    ${setBtnActive(graphBtn, false)}\n` +
    '  </div>';

  html = html.replace(BUTTONS_RE, newTabs);

  html = html.replace(
    /<div id="tab-heatmap" class="tab-content active">/g,
    '<div id="tab-heatmap" class="tab-content">',
  );
  html = html.replace(
    /<div id="tab-table" class="tab-content">/g,
    '<div id="tab-table" class="tab-content active">',
  );
  // If table already had active somehow, keep single active
  html = html.replace(
    /<div id="tab-table" class="tab-content active active">/g,
    '<div id="tab-table" class="tab-content active">',
  );

  if (html === before) {
    console.warn('unchanged:', rel);
    return false;
  }
  fs.writeFileSync(file, html, 'utf8');
  console.log('patched', rel);
  return true;
}

let n = 0;
for (const rel of MAPS) n += patchFile(rel) ? 1 : 0;
console.log(`OK reorder map tabs (${n}/${MAPS.length})`);
