/** Insert return_live.js before live_quotes.js or hub_dashboard.js */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { file: 'index.html', insert: 'js/return_live.js?v=2', before: 'js/hub_dashboard.js' },
  { file: 'semiconductor/korea_semiconductor_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'energy/korea_energy_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'powergrid/korea_powergrid_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'ship/korea_ship_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'defense/korea_defense_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'kculture/korea_kculture_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'robot/korea_robot_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'finance/korea_finance_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'construction/korea_construction_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'auto/korea_auto_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'medtech/korea_medtech_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
  { file: 'bio/korea_bio_map.html', insert: '../js/return_live.js?v=2', before: '../js/live_quotes.js' },
];

for (const { file, insert, before } of TARGETS) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    console.warn('skip (missing):', file);
    continue;
  }
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes(insert)) {
    console.log('ok exists:', file);
    continue;
  }
  const needle = `<script src="${before}`;
  if (!html.includes(needle)) {
    console.warn('needle not found:', file, before);
    continue;
  }
  const tag = `  <script src="${insert}"></script>\n`;
  html = html.replace(needle, tag + needle);
  fs.writeFileSync(p, html, 'utf8');
  console.log('patched:', file);
}
