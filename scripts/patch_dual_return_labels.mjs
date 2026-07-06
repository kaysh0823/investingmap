/**
 * Dual labels: 1D(1일), 20D(1개월), 50D(3개월), 120D(6개월), 250D(1년).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
  'bio/bio_translations.json',
  'scripts/patch_return_columns.mjs',
];

const REPLACEMENTS = [
  ['>1일</th>', '>1일</th>'],
  ['>20일</th>', '>20일</th>'],
  ['>50일</th>', '>50일</th>'],
  ['>120일</th>', '>120일</th>'],
  ['>250일</th>', '>250일</th>'],
  ["thChg1d: '1일'", "thChg1d: '1일'"],
  ["thRet20d: '20일'", "thRet20d: '20일'"],
  ["thRet50d: '50일'", "thRet50d: '50일'"],
  ["thRet120d: '120일'", "thRet120d: '120일'"],
  ["thRet250d: '250일'", "thRet250d: '250일'"],
  ['"thChg1d": "1일"', '"thChg1d": "1일"'],
  ['"thRet20d": "20일"', '"thRet20d": "20일"'],
  ['"thRet50d": "50일"', '"thRet50d": "50일"'],
  ['"thRet120d": "120일"', '"thRet120d": "120일"'],
  ['"thRet250d": "250일"', '"thRet250d": "250일"'],
  ["lang === 'en' ? '1D' : '1일'", "lang === 'en' ? '1D' : '1일'"],
  ["lang === 'en' ? '20D' : '20일'", "lang === 'en' ? '20D' : '20일'"],
  ["lang === 'en' ? '50D' : '50일'", "lang === 'en' ? '50D' : '50일'"],
  ["lang === 'en' ? '120D' : '120일'", "lang === 'en' ? '120D' : '120일'"],
  ["lang === 'en' ? '250D' : '250일'", "lang === 'en' ? '250D' : '250일'"],
  ['thChg1d: \'1일\', thRet20d: \'20일\'', "thChg1d: '1일', thRet20d: '20일'"],
  ['thRet50d: \'50일\'', "thRet50d: '50일'"],
  ['thRet120d: \'120일\'', "thRet120d: '120일'"],
  ['thRet250d: \'250일\'', "thRet250d: '250일'"],
  ['onclick="sortTable(\'chg1dPct\')">1일</th>', 'onclick="sortTable(\'chg1dPct\')">1일</th>'],
  ['onclick="sortTable(\'ret20dPct\')">20일</th>', 'onclick="sortTable(\'ret20dPct\')">20일</th>'],
  ['onclick="sortTable(\'ret50dPct\')">50일</th>', 'onclick="sortTable(\'ret50dPct\')">50일</th>'],
  ['onclick="sortTable(\'ret120dPct\')">120일</th>', 'onclick="sortTable(\'ret120dPct\')">120일</th>'],
  ['onclick="sortTable(\'ret250dPct\')">250일</th>', 'onclick="sortTable(\'ret250dPct\')">250일</th>'],
  ['"thChg1d":"1일"', '"thChg1d":"1일"'],
  ['"thRet20d":"20일"', '"thRet20d":"20일"'],
  ['"thRet50d":"50일"', '"thRet50d":"50일"'],
  ['"thRet120d":"120일"', '"thRet120d":"120일"'],
  ['"thRet250d":"250일"', '"thRet250d":"250일"'],
];

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  let text = fs.readFileSync(fp, 'utf8');
  for (const [from, to] of REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  fs.writeFileSync(fp, text, 'utf8');
  console.log('patched', rel);
}
