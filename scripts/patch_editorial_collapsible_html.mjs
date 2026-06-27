/** Pre-render collapsible editorial block (mobile-friendly default closed). */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OLD =
  `<section class="geo-summary" id="map-editorial" aria-labelledby="map-editorial-title">
    <h2 id="map-editorial-title"></h2>
    <div id="map-editorial-body"></div>
  </section>`;
const NEW =
  `<section class="geo-summary map-editorial-collapsible" id="map-editorial" aria-labelledby="map-editorial-title">
    <details class="map-editorial-details">
      <summary class="map-editorial-summary" id="map-editorial-title">사이트 활용 방법</summary>
      <div id="map-editorial-body" class="map-editorial-body"></div>
    </details>
  </section>`;

const files = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
  'bio/korea_bio_map.html',
];

for (const rel of files) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('map-editorial-details')) {
    console.log('skip (already details):', rel);
    continue;
  }
  const re =
    /<section class="geo-summary" id="map-editorial" aria-labelledby="map-editorial-title">\r?\n\s*<h2 id="map-editorial-title"><\/h2>\r?\n\s*<div id="map-editorial-body"><\/div>\r?\n\s*<\/section>/;
  if (!re.test(c)) {
    console.warn('pattern not found:', rel);
    continue;
  }
  c = c.replace(re, NEW);
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched editorial HTML:', rel);
}
