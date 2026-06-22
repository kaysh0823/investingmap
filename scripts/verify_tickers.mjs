/**
 * Quick scan: tickers must exist in KRX 4937/4848; English name must match data_3557.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse5016Line } from '../lib/krx_per_pbr.mjs';
import { resolveLatestCsv, loadMergedKrxMap } from '../lib/krx_data_sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const maps = [
  'semiconductor/korea_semiconductor_map.html',
  'energy/korea_energy_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
];

const krx = loadMergedKrxMap(join(root, 'data'));
const p = resolveLatestCsv(join(root, 'data'), 'data_3557_');
const en = new Map();
for (const line of readFileSync(p, 'utf8').split(/\r?\n/).slice(1)) {
  const f = parse5016Line(line);
  if (f[1] && f[4]) en.set(f[1], f[4]);
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let bad = 0;
for (const rel of maps) {
  const html = readFileSync(join(root, rel), 'utf8');
  const re = /name: '([^']*)', nameEn: '([^']*)', ticker: '([^']*)'/g;
  let hit;
  while ((hit = re.exec(html))) {
    const [name, nameEn, ticker] = [hit[1], hit[2], hit[3]];
    if (!ticker || ticker === 'UNLISTED') continue;
    if (!krx.has(ticker)) {
      console.log('NOT_IN_KRX', rel, name, ticker);
      bad++;
      continue;
    }
    const ke = en.get(ticker) || '';
    const a = norm(nameEn);
    const b = norm(ke);
    if (a && b && a.length > 4 && b.length > 4 && !a.includes(b.slice(0, 8)) && !b.includes(a.slice(0, 8)) && a.slice(0, 6) !== b.slice(0, 6)) {
      console.log('EN_MISMATCH', rel, name, ticker, '|', nameEn, '|', ke);
      bad++;
    }
  }
}
console.log(bad ? `FAIL: ${bad} issue(s)` : 'OK: all tickers verified');
process.exit(bad ? 1 : 0);
