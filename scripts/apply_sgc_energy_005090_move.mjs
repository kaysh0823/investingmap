/**
 * 005090 SGC에너지: chemical(정유·석유제품) → powergrid(유틸리티).
 * 집단에너지(열병합) 중심·정유 없음. 삼천리(004690)와 동일 성격. 태그: 건설·유리.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKER = '005090';

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

// --- chain_overrides ---
const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
if (overrides.chemical) delete overrides.chemical[TICKER];
if (!overrides.powergrid) overrides.powergrid = {};
overrides.powergrid[TICKER] = '유틸리티';
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides');

// --- field overrides ---
const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
fields[TICKER] = fields[TICKER] || {};
fields[TICKER].name = 'SGC에너지';
fields[TICKER].nameEn = 'SGC Energy';
fields[TICKER].semType = '집단에너지·열병합';
fields[TICKER].semTypeEn = 'District energy & cogeneration';
fields[TICKER].products = '집단에너지·열병합발전 (주력)';
fields[TICKER].productsEn = 'District energy and cogeneration (core)';
fields[TICKER].tags = ['건설', '유리'];
fields[TICKER].byIndustry = fields[TICKER].byIndustry || {};
if (fields[TICKER].byIndustry.chemical) {
  fields[TICKER].byIndustry.chemical.needs_review = false;
  delete fields[TICKER].byIndustry.chemical.review_evidence;
  delete fields[TICKER].byIndustry.chemical.chain;
}
fields[TICKER].byIndustry.powergrid = {
  chain: '유틸리티',
  needs_review: false,
  evidence: '집단에너지(열병합발전) 중심·정유 사업 없음. 삼천리와 동일 성격(유틸리티)',
  semType: '집단에너지·열병합',
  products: '집단에너지·열병합발전 (주력)',
};
fields._policy = fields._policy || {};
fields._policy.needs_review_closure =
  '2026-09 needs_review 마감: 이동4(含005090→powergrid)·정정4·신설2. needs_review 잔여 0. 공백=001740·126560.';
fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

// --- exclusive ---
const exclusivePath = join(ROOT, 'lib', 'sector_exclusive.mjs');
let exclusiveSrc = fs.readFileSync(exclusivePath, 'utf8');
const re = new RegExp(`\\s*'${TICKER}':\\s*'[^']+',\\s*//[^\\n]*\\n`);
const line = `  '${TICKER}': 'powergrid', // SGC에너지 (chemical→powergrid 유틸리티, 집단에너지·정유 없음)\n`;
if (re.test(exclusiveSrc)) exclusiveSrc = exclusiveSrc.replace(re, `\n${line}`);
else {
  exclusiveSrc = exclusiveSrc.replace(
    'export const SECTOR_EXCLUSIVE = {\n',
    `export const SECTOR_EXCLUSIVE = {\n${line}`,
  );
}
fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
console.log('OK sector_exclusive');

// --- additions ---
function upsertAddition(fileRel, row) {
  const fp = join(ROOT, fileRel);
  const arr = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : [];
  const i = arr.findIndex((r) => pad(r.ticker) === pad(row.ticker));
  if (i >= 0) arr[i] = { ...arr[i], ...row };
  else arr.push(row);
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}
function removeAddition(fileRel, ticker) {
  const fp = join(ROOT, fileRel);
  if (!fs.existsSync(fp)) return;
  const arr = JSON.parse(fs.readFileSync(fp, 'utf8')).filter((r) => pad(r.ticker) !== pad(ticker));
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

removeAddition('chemical/cp_list_chemical_additions.json', TICKER);
upsertAddition('powergrid/cp_list_powergrid_additions.json', {
  ticker: TICKER,
  name: 'SGC에너지',
  nameEn: 'SGC Energy',
  chain: '유틸리티',
  semType: '집단에너지·열병합',
  semTypeEn: 'District energy & cogeneration',
  products: '집단에너지·열병합발전 (주력)',
  productsEn: 'District energy and cogeneration (core)',
  partners: [],
  subSector: '유틸리티',
  level: 'core',
});
console.log('OK additions');

// --- reports ---
const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  join(reportDir, 'needs_review_residual.csv'),
  [
    'ticker,name,status,notes',
    '001740,"SK네트웍스",taxonomy_gap,"화학 잠정 유지·종합상사/타지도 자동편입 금지. 그룹 신설 대상 아님"',
    '126560,"현대퓨처넷",taxonomy_gap,"telecom 분류공백·미수록 유지. 타지도 자동편입 금지. 그룹 신설 대상 아님"',
  ].join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(
  join(reportDir, 'sgc_energy_005090_move.json'),
  JSON.stringify(
    {
      ticker: TICKER,
      name: 'SGC에너지',
      from: { sector: 'chemical', chain: '정유·석유제품' },
      to: { sector: 'powergrid', chain: '유틸리티' },
      evidence: '집단에너지(열병합발전) 중심 + 건설·유리 겸업, 정유 사업 없음(오설명 정정). 삼천리와 동일 성격.',
      tags: ['건설', '유리'],
      products: '집단에너지·열병합발전 (주력)',
      needs_review: false,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK reports');
