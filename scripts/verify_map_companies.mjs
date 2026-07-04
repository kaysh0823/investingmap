/**
 * Fail fast when industry map HTML has a broken koreanCompanies array (breaks npm run build).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kculture/korea_kculture_map.html',
];

let failed = false;
for (const rel of MAPS) {
  const fp = path.join(ROOT, rel);
  const html = fs.readFileSync(fp, 'utf8');
  try {
    const n = extractCompaniesFromHtml(html).length;
    console.log('OK', rel, `(${n} companies)`);
  } catch (e) {
    failed = true;
    console.error('FAIL', rel, e.message || e);
  }
}

if (failed) process.exit(1);
