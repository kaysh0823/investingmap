/**
 * Move hub link into sector-nav (rendered by sector_nav.js) — remove duplicate standalone hub-back.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAP_FILES = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const HUB_BACK_RE =
  /\s*<a class="hub-back" href="\.\.\/index\.html" id="hub-back"><span aria-hidden="true">←<\/span> <span id="hub-link-label">[^<]*<\/span><\/a>\s*/g;

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp, 'utf8');
  if (!HUB_BACK_RE.test(html)) {
    console.log('skip (no standalone hub):', rel);
    continue;
  }
  html = fs.readFileSync(fp, 'utf8').replace(HUB_BACK_RE, '\n');
  fs.writeFileSync(fp, html);
  console.log('patched:', rel);
}

console.log('OK patch_hub_in_sector_nav');
