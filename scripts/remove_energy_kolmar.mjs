/**
 * Remove 한국콜마 (161890) from energy map and hub_index energy sector.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICKER = '161890';

const energyPath = path.join(ROOT, 'energy', 'korea_energy_map.html');
let html = fs.readFileSync(energyPath, 'utf8');

html = html.replace(
  /\s*{\s*"@type": "ListItem",\s*"position": \d+,\s*"name": "한국콜마 \(161890, KOSPI\)",\s*"url": "[^"]+#ticker-161890"\s*},/,
  '',
);

html = html.replace(
  /\s*<tr data-ticker="161890">[\s\S]*?<\/tr>/,
  '',
);

html = html.replace(
  /\s*{\s*id: 'energy_kolmar_korea',[\s\S]*?partners: \[\]\s*},/,
  '',
);

fs.writeFileSync(energyPath, html, 'utf8');
console.log('OK removed Kolmar from energy/korea_energy_map.html');

const hubPath = path.join(ROOT, 'data', 'hub_index.json');
const hub = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
if (hub.sectors?.energy?.companies) {
  const before = hub.sectors.energy.companies.length;
  hub.sectors.energy.companies = hub.sectors.energy.companies.filter(
    (c) => String(c.ticker).padStart(6, '0') !== TICKER,
  );
  fs.writeFileSync(hubPath, `${JSON.stringify(hub)}\n`, 'utf8');
  console.log(`OK hub_index energy: ${before} -> ${hub.sectors.energy.companies.length} companies`);
}
