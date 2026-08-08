/**
 * Relabel return columns to trading-day horizons (1/20/50/120/250D)
 * and rename snapshot/merge field keys.
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
  'js/live_quotes.js',
  'js/map_mobile_table.js',
  'scripts/patch_return_columns.mjs',
];

const REPLACEMENTS = [
  ["sortTable('ret1mPct')", "sortTable('ret20dPct')"],
  ["sortTable('ret3mPct')", "sortTable('ret50dPct')"],
  ["sortTable('ret6mPct')", "sortTable('ret120dPct')"],
  ["sortTable('ret1yPct')", "sortTable('ret200dPct')"],
  ['ret1mPct', 'ret20dPct'],
  ['ret3mPct', 'ret50dPct'],
  ['ret6mPct', 'ret120dPct'],
  ['ret1yPct', 'ret200dPct'],
  ['var thRet1m =', 'var thRet20d ='],
  ['var thRet3m =', 'var thRet50d ='],
  ['var thRet6m =', 'var thRet120d ='],
  ['var thRet1y =', 'var thRet200d ='],
  ['if (thRet1m)', 'if (thRet20d)'],
  ['if (thRet3m)', 'if (thRet50d)'],
  ['if (thRet6m)', 'if (thRet120d)'],
  ['if (thRet1y)', 'if (thRet200d)'],
  ['thRet1m)', 'thRet20d)'],
  ['thRet3m)', 'thRet50d)'],
  ['thRet6m)', 'thRet120d)'],
  ['thRet1y)', 'thRet200d)'],
  ['thRet1m:', 'thRet20d:'],
  ['thRet3m:', 'thRet50d:'],
  ['thRet6m:', 'thRet120d:'],
  ['thRet1y:', 'thRet200d:'],
  ["lang === 'en' ? '1D' : '전일대비'", "lang === 'en' ? '1D' : '1일'"],
  ['t.thRet1m', 't.thRet20d'],
  ['t.thRet3m', 't.thRet50d'],
  ['t.thRet6m', 't.thRet120d'],
  ['t.thRet1y', 't.thRet200d'],
  ["thChg1d: '전일대비'", "thChg1d: '1일'"],
  ['thChg1d: "전일대비"', 'thChg1d: "1일"'],
  ["\"thChg1d\": \"전일대비\"", "\"thChg1d\": \"1일\""],
  ["thRet20d: '1개월'", "thRet20d: '20일'"],
  ["thRet50d: '3개월'", "thRet50d: '50일'"],
  ["thRet120d: '6개월'", "thRet120d: '120일'"],
  ["thRet200d: '1년'", "thRet200d: '200일'"],
  ['"thRet20d": "1개월"', '"thRet20d": "20일"'],
  ['"thRet50d": "3개월"', '"thRet50d": "50일"'],
  ['"thRet120d": "6개월"', '"thRet120d": "120일"'],
  ['"thRet200d": "1년"', '"thRet200d": "200일"'],
  ["lang === 'en' ? '20D' : '1개월'", "lang === 'en' ? '20D' : '20일'"],
  ["lang === 'en' ? '50D' : '3개월'", "lang === 'en' ? '50D' : '50일'"],
  ["lang === 'en' ? '120D' : '6개월'", "lang === 'en' ? '120D' : '120일'"],
  ["lang === 'en' ? '200D' : '1년'", "lang === 'en' ? '200D' : '200일'"],
  ['thRet1m.textContent', 'thRet20d.textContent'],
  ['thRet3m.textContent', 'thRet50d.textContent'],
  ['thRet6m.textContent', 'thRet120d.textContent'],
  ['thRet1y.textContent', 'thRet200d.textContent'],
  ['"thChg1d":"전일대비"', '"thChg1d":"1일"'],
  ['"thRet20d":"1개월"', '"thRet20d":"20일"'],
  ['"thRet50d":"3개월"', '"thRet50d":"50일"'],
  ['"thRet120d":"6개월"', '"thRet120d":"120일"'],
  ['"thRet200d":"1년"', '"thRet200d":"200일"'],
  ['qr.ret3m', 'qr.ret50d'],
  ['qr.ret6m', 'qr.ret120d'],
  ['qr.ret1y', 'qr.ret200d'],
  ['>전일대비</th>', '>1일</th>'],
  ['>1개월</th>', '>20일</th>'],
  ['>3개월</th>', '>50일</th>'],
  ['>6개월</th>', '>120일</th>'],
  ['>1년</th>', '>200일</th>'],
];

function applyReplacements(text) {
  let out = text;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip', rel);
    continue;
  }
  const before = fs.readFileSync(fp, 'utf8');
  const after = applyReplacements(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8');
    console.log('patched', rel);
  } else {
    console.log('unchanged', rel);
  }
}
