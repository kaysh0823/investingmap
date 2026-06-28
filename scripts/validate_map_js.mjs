import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const maps = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
];

for (const rel of maps) {
  const html = fs.readFileSync(join(root, rel), 'utf8');
  try {
    const arr = extractCompaniesFromHtml(html);
    console.log(rel, 'OK', arr.length, 'first=', arr[0]?.name);
  } catch (e) {
    console.error(rel, 'FAIL', e.message);
    const start = html.indexOf('const koreanCompanies = ');
    const end = html.indexOf('\n    const globalCompanies', start);
    const inner = html.slice(start + 'const koreanCompanies = '.length, end).trim();
    const m = e.message.match(/position (\d+)/i);
    if (m) {
      const pos = +m[1];
      console.log('near:', inner.slice(Math.max(0, pos - 150), pos + 150));
    }
  }
}
