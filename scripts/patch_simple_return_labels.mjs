/**
 * Company table headers: simple 1일/20일/… (KO) and 1D/20D/… (EN) only.
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
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
  'bio/bio_translations.json',
  'scripts/patch_return_columns.mjs',
  'scripts/patch_dual_return_labels.mjs',
];

const REPLACEMENTS = [
  ['>1D(1일)</th>', '>1일</th>'],
  ['>20D(1개월)</th>', '>20일</th>'],
  ['>50D(3개월)</th>', '>50일</th>'],
  ['>120D(6개월)</th>', '>120일</th>'],
  ['>200D</th>', '>200일</th>'],
  ["thChg1d: '1D(1일)'", "thChg1d: '1일'"],
  ["thRet20d: '20D(1개월)'", "thRet20d: '20일'"],
  ["thRet50d: '50D(3개월)'", "thRet50d: '50일'"],
  ["thRet120d: '120D(6개월)'", "thRet120d: '120일'"],
  ["thRet200d: '200D'", "thRet200d: '200일'"],
  ['"thChg1d": "1D(1일)"', '"thChg1d": "1일"'],
  ['"thRet20d": "20D(1개월)"', '"thRet20d": "20일"'],
  ['"thRet50d": "50D(3개월)"', '"thRet50d": "50일"'],
  ['"thRet120d": "120D(6개월)"', '"thRet120d": "120일"'],
  ['"thRet200d": "200D"', '"thRet200d": "200일"'],
  ["lang === 'en' ? '1D (1 day)' : '1D(1일)'", "lang === 'en' ? '1D' : '1일'"],
  ["lang === 'en' ? '20D (1M)' : '20D(1개월)'", "lang === 'en' ? '20D' : '20일'"],
  ["lang === 'en' ? '50D (3M)' : '50D(3개월)'", "lang === 'en' ? '50D' : '50일'"],
  ["lang === 'en' ? '120D (6M)' : '120D(6개월)'", "lang === 'en' ? '120D' : '120일'"],
  ["lang === 'en' ? '200D' : '200D'", "lang === 'en' ? '200D' : '200일'"],
  ["thChg1d: '1D(1일)', thRet20d: '20D(1개월)'", "thChg1d: '1일', thRet20d: '20일'"],
  ["thRet50d: '50D(3개월)'", "thRet50d: '50일'"],
  ["thRet120d: '120D(6개월)'", "thRet120d: '120일'"],
  ["thRet200d: '200D'", "thRet200d: '200일'"],
  ['onclick="sortTable(\'chg1dPct\')">1D(1일)</th>', 'onclick="sortTable(\'chg1dPct\')">1일</th>'],
  ['onclick="sortTable(\'ret20dPct\')">20D(1개월)</th>', 'onclick="sortTable(\'ret20dPct\')">20일</th>'],
  ['onclick="sortTable(\'ret50dPct\')">50D(3개월)</th>', 'onclick="sortTable(\'ret50dPct\')">50일</th>'],
  ['onclick="sortTable(\'ret120dPct\')">120D(6개월)</th>', 'onclick="sortTable(\'ret120dPct\')">120일</th>'],
  ['onclick="sortTable(\'ret200dPct\')">200D</th>', 'onclick="sortTable(\'ret200dPct\')">200일</th>'],
  ['"thChg1d":"1D(1일)"', '"thChg1d":"1일"'],
  ['"thRet20d":"20D(1개월)"', '"thRet20d":"20일"'],
  ['"thRet50d":"50D(3개월)"', '"thRet50d":"50일"'],
  ['"thRet120d":"120D(6개월)"', '"thRet120d":"120일"'],
  ['"thRet200d":"200D"', '"thRet200d":"200일"'],
  ['thChg1d: "1D(1일)"', 'thChg1d: "1일"'],
  ['thRet20d: "20D(1개월)"', 'thRet20d: "20일"'],
  ['thRet50d: "50D(3개월)"', 'thRet50d: "50일"'],
  ['thRet120d: "120D(6개월)"', 'thRet120d: "120일"'],
  ['thRet200d: "200D"', 'thRet200d: "200일"'],
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
