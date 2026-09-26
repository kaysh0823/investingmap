/**
 * One-shot (not in rebuild): reorder tabs without requiring graph button.
 * Graph tab is retired — this script no-ops if tab-btn-graph is absent.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'bio/korea_bio_map.html',
  'robot/korea_robot_map.html',
];

function extractBtn(html, id) {
  const re = new RegExp(`<button id="${id}"[^>]*>[\\s\\S]*?<\\/button>`);
  const m = html.match(re);
  return m ? m[0] : null;
}

function setBtnActive(btnHtml, active) {
  if (!btnHtml) return '';
  if (active) {
    return btnHtml
      .replace(/class="tab-btn"/, 'class="tab-btn active"')
      .replace(/class="tab-btn active active"/, 'class="tab-btn active"');
  }
  return btnHtml.replace(/class="tab-btn active"/g, 'class="tab-btn"');
}

let n = 0;
for (const rel of MAPS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('id="tab-btn-graph"')) {
    console.log('skip (no graph)', rel);
    continue;
  }
  const heatBtn = extractBtn(html, 'tab-btn-heatmap');
  const tableBtn = extractBtn(html, 'tab-btn-table');
  const graphBtn = extractBtn(html, 'tab-btn-graph');
  if (!heatBtn || !tableBtn || !graphBtn) {
    console.warn('incomplete tabs', rel);
    continue;
  }
  console.warn('graph still present — run strip_graph_tab.mjs first:', rel);
  n += 1;
}
console.log('reorder_map_tabs_table_first: checked', n, '(graph should already be stripped)');
