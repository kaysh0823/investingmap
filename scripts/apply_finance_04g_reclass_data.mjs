/**
 * §0-4 batch G data: finance/holdings overrides + Kakao Pay cross-list + reports.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FINANCE_04G } from '../lib/finance_04g_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

const MAPS = {
  finance: {
    '은행·은행계 금융그룹': [
      '105560', '055550', '086790', '316140', '024110', '138930', '175330', '139130',
      '323410', '279570', '006220',
    ],
    '비은행 금융그룹': ['138040', '071050'],
    증권: [
      '006800', '005940', '016360', '039490', '003540', '003470', '001720', '030610',
      '003530', '001510', '001270', '001500', '016610', '001200', '078020',
    ],
    생명보험: ['032830', '088350', '085620', '082640'],
    '손해보험·재보험': ['000810', '005830', '001450', '000370', '000400', '003690', '031210'],
    '카드·캐피탈·여신금융': ['029780'],
    '자산운용·PE·VC': ['100790', '027360', '041190', '026890'],
    '결제·핀테크': ['377300'],
    '금융정보·평가': ['030190', '034950'],
    '보험판매·중개': ['211050', '244920'],
    '부동산금융·투자기구': ['094800'],
  },
  holdings: {
    복합사업: [
      '034730', '267250', '000150', '003550', '000880', '383800', '002020', '000210',
      '024720', '000070', '023590', '032190', '0220W0', '012030',
    ],
    'IT·전자': ['402340', '030530', '036830'],
    '에너지·화학': ['078930', '006120', '092230'],
    '소재·산업재': [
      '005490', '006260', '058650', '005810', '003030', '001940', '001230', '060980',
      '005720', '004800', '036530', '015860',
    ],
    '소비·유통': [
      '001040', '004990', '009970', '005440', '001800', '003380', '007700', '072710',
      '027410', '192400', '121440',
    ],
    '건설·부동산': ['012630', '003300', '002030'],
    '운송·물류': ['180640'],
    헬스케어: ['096760'],
  },
};

const NEEDS_REVIEW = [
  ['071050', 'finance', '비은행 금융그룹', '한국금융지주 — 비은행 금융그룹 vs 증권 경계'],
  ['004800', 'holdings', '소재·산업재', '효성 — 에너지·화학 vs 소재·산업재 경계'],
  ['000070', 'holdings', '복합사업', '삼양홀딩스 — 에너지·화학 vs 소재·산업재 vs 복합사업'],
  ['024720', 'holdings', '복합사업', '콜마홀딩스 — 복합사업 vs 헬스케어 경계'],
  ['192400', 'holdings', '소비·유통', '쿠쿠홀딩스 — 소비·유통 경계'],
  ['121440', 'holdings', '소비·유통', '골프존홀딩스 — 소비·유통 경계'],
];

const TAXONOMY_GAPS = [
  ['012030', 'DB', '금융 중심 지주 수용그룹 부재 — 복합사업 잠정 (software 자동 덮어쓰기 금지)'],
  ['023590', '다우기술', '금융 중심 지주 수용그룹 부재 — 복합사업 잠정 (software 자동 덮어쓰기 금지)'],
  ['032190', '다우데이타', '금융 중심 지주 수용그룹 부재 — 복합사업 잠정 (software 자동 덮어쓰기 금지)'],
];

const TAGS = {
  '377300': ['결제', '핀테크', '개인'],
  '071050': ['비은행', '증권계열'],
  '012030': ['금융중심지주', '복합사업'],
  '023590': ['금융중심지주', '복합사업'],
  '032190': ['금융중심지주', '복합사업'],
  '004800': ['소재·산업재', '섬유·산업재'],
  '000070': ['복합사업', '화학·소재'],
  '024720': ['복합사업', '헬스케어'],
  '192400': ['소비·유통'],
  '121440': ['소비·유통', '레저'],
  '105560': ['은행', '개인', '기업'],
  '055550': ['은행', '개인', '기업'],
  '029780': ['카드', '여신', '개인'],
  '402340': ['IT·전자', '투자중심'],
  '180640': ['운송·물류'],
  '096760': ['헬스케어'],
};

function buildSectorMap(sectorKey, groupMap) {
  const allowed = FINANCE_04G[sectorKey].chains;
  const out = {};
  const seen = new Set();
  for (const [chain, tickers] of Object.entries(groupMap)) {
    if (!allowed.includes(chain)) throw new Error(`${sectorKey}: unknown chain ${chain}`);
    for (const raw of tickers) {
      const ticker = pad(raw);
      if (seen.has(ticker)) throw new Error(`${sectorKey}: duplicate ${ticker}`);
      seen.add(ticker);
      out[ticker] = chain;
    }
  }
  return out;
}

const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
for (const [sector, groupMap] of Object.entries(MAPS)) {
  overrides[sector] = buildSectorMap(sector, groupMap);
  console.log(`OK chain_overrides.${sector}`, Object.keys(overrides[sector]).length);
}

// Kakao Pay software cross — do not rewrite other software mappings
overrides.software = overrides.software || {};
overrides.software[pad('377300')] = '결제·데이터 인프라';
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');

const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
function ensureIndustry(ticker, industry) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry[industry]) fields[ticker].byIndustry[industry] = {};
  return fields[ticker].byIndustry[industry];
}

{
  const t = pad('377300');
  fields[t] = fields[t] || {};
  fields[t].semType = fields[t].semType || '간편결제·핀테크';
  fields[t].semTypeEn = fields[t].semTypeEn || 'Payments & fintech';
  fields[t].products = fields[t].products || '간편결제·디지털 금융 플랫폼';
  fields[t].productsEn = fields[t].productsEn || 'Mobile payments and digital finance platform';
  const fin = ensureIndustry(t, 'finance');
  fin.chain = '결제·핀테크';
  fin.semType = '간편결제·핀테크';
  fin.products = '간편결제·디지털 금융 플랫폼';
  const soft = ensureIndustry(t, 'software');
  soft.chain = '결제·데이터 인프라';
  soft.semType = '결제·핀테크 플랫폼';
  soft.products = '간편결제·디지털 금융 플랫폼 (결제·데이터 인프라 교차)';
}

for (const [sector, map] of Object.entries(MAPS)) {
  for (const [ticker, chain] of Object.entries(map)) {
    const ind = ensureIndustry(ticker, sector);
    ind.chain = chain;
    ind.needs_review = false;
    if (sector === 'holdings') {
      const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
      if (!existing.includes(chain)) existing.push(chain);
      fields[ticker].tags = existing;
      ind.holding_form = fields[ticker].holding_form || '사업형/투자중심(메타)';
    }
  }
}
for (const [t, sector, chain, note] of NEEDS_REVIEW) {
  const ind = ensureIndustry(pad(t), sector);
  ind.needs_review = true;
  ind.chain = chain;
  ind.review_evidence = note;
}
for (const [t, name, note] of TAXONOMY_GAPS) {
  const ticker = pad(t);
  const ind = ensureIndustry(ticker, 'holdings');
  ind.needs_review = true;
  ind.chain = '복합사업';
  ind.taxonomy_gap = true;
  ind.review_evidence = note;
  fields[ticker].name = fields[ticker].name || name;
}
for (const [t, tags] of Object.entries(TAGS)) {
  const ticker = pad(t);
  if (!fields[ticker]) fields[ticker] = {};
  const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
  for (const tag of tags) if (!existing.includes(tag)) existing.push(tag);
  fields[ticker].tags = existing;
}

fields._policy = fields._policy || {};
fields._policy.kakao_pay_cross =
  '377300 카카오페이 — finance 결제·핀테크 + software 결제·데이터 인프라 교차. 지도별 대표그룹 1개, 통합 ticker 집계 중복제거.';
fields._policy.holdings_axis =
  'holdings 기본 분류 명칭: 주요 투자·사업영역. 순수/사업/금융/중간지주는 대표그룹이 아닌 메타데이터.';
fields._policy.finance_holding_gap =
  '012030·023590·032190 — 금융 중심 지주 수용그룹 부재. 복합사업 잠정. software·이전 배치 매핑 자동 덮어쓰기 금지.';

fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

const exclusivePath = join(ROOT, 'lib', 'sector_exclusive.mjs');
let exclusiveSrc = fs.readFileSync(exclusivePath, 'utf8');

// Remove exclusive single-home for Kakao Pay; use SECTOR_CROSS instead
exclusiveSrc = exclusiveSrc.replace(/\s*'377300':\s*'finance',\s*\/\/[^\n]*\n/, '\n');
exclusiveSrc = exclusiveSrc.replace(
  /No multi-sector memberships are currently active\./,
  'Kakao Pay (377300) is cross-listed finance+software; other multi-sector memberships inactive.',
);
exclusiveSrc = exclusiveSrc.replace(
  /Kakao Pay \(377300\) is cross-listed finance\+software; other multi-sector memberships inactive\./,
  'Kakao Pay (377300) is cross-listed finance+software; other multi-sector memberships inactive.',
);

function upsertCross(ticker, sectors, comment) {
  const list = `[${sectors.map((s) => `'${s}'`).join(', ')}]`;
  const re = new RegExp(`\\s*'${ticker}':\\s*\\[[^\\]]*\\],\\s*//[^\\n]*\\n`);
  const line = `  '${ticker}': ${list}, // ${comment}\n`;
  if (re.test(exclusiveSrc)) {
    exclusiveSrc = exclusiveSrc.replace(re, `\n${line}`);
    return;
  }
  if (/export const SECTOR_CROSS = \{\};/.test(exclusiveSrc)) {
    exclusiveSrc = exclusiveSrc.replace(
      'export const SECTOR_CROSS = {};',
      `export const SECTOR_CROSS = {\n${line}};`,
    );
    return;
  }
  exclusiveSrc = exclusiveSrc.replace(
    'export const SECTOR_CROSS = {\n',
    `export const SECTOR_CROSS = {\n${line}`,
  );
}
upsertCross('377300', ['finance', 'software'], '카카오페이 (finance 결제·핀테크 + software 결제·데이터 인프라)');
fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
console.log('OK sector_exclusive / SECTOR_CROSS');

function upsertAddition(fileRel, row) {
  const fp = join(ROOT, fileRel);
  const dir = dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const arr = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : [];
  const i = arr.findIndex((r) => pad(r.ticker) === pad(row.ticker));
  if (i >= 0) arr[i] = { ...arr[i], ...row };
  else arr.push(row);
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

upsertAddition('software/cp_list_software_additions.json', {
  ticker: '377300',
  name: '카카오페이',
  nameEn: 'Kakao Pay',
  chain: '결제·데이터 인프라',
  semType: '결제·핀테크 플랫폼',
  semTypeEn: 'Payments & fintech platform',
  products: '간편결제·디지털 금융 플랫폼 (결제·데이터 인프라 교차)',
  productsEn: 'Mobile payments / digital finance (payments & data infra cross-list)',
  partners: ['visa', 'mastercard'],
  subSector: '결제·데이터 인프라',
  level: 'cross',
});

const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  join(reportDir, 'finance_04g_reclass_review.csv'),
  [
    'ticker,sector,provisional_group,status,notes',
    ...NEEDS_REVIEW.map(
      ([t, sector, chain, note]) =>
        `${pad(t)},${sector},"${chain}",needs_review,"${note.replace(/"/g, '""')}"`,
    ),
  ].join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(
  join(reportDir, 'finance_04g_taxonomy_gaps.csv'),
  [
    'ticker,name,status,notes',
    ...TAXONOMY_GAPS.map(
      ([t, name, note]) => `${pad(t)},"${name}",taxonomy_gap,"${note.replace(/"/g, '""')}"`,
    ),
    ',"금융중심지주 수용그룹",taxonomy_gap,"holdings에 금융 중심 지주 전용 그룹 미신설 — 공백 유지"',
  ].join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(
  join(reportDir, 'finance_04g_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: {
        finance: overrides.finance,
        holdings: overrides.holdings,
      },
      cross: [{ ticker: '377300', sectors: ['finance', 'software'], chains: { finance: '결제·핀테크', software: '결제·데이터 인프라' } }],
      needs_review: NEEDS_REVIEW,
      taxonomy_gaps: TAXONOMY_GAPS,
      tags: TAGS,
      expected_on_map: { finance: 50, holdings: 48, software: 21 },
      axis: { holdings: '주요 투자·사업영역' },
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK docs/reports/finance_04g_*');
