/**
 * §0-4 batch D data: chain_overrides, exclusives, additions, review/gap CSV.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TECH_04D } from '../lib/tech_04d_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = {
  elec: {
    '가전·생활기기': ['066570', '021240', '284740', '029530'],
    '디스플레이 패널': ['034220'],
    '디스플레이 장비': ['171090', '161580'],
    '디스플레이 소재': ['213420'],
    '전자부품·기판': [
      '009150',
      '001820',
      '090460',
      '248070',
      '004710',
      '089010',
      '417200',
      '441270',
      '290550',
      '043260',
    ],
    '카메라·광학·센서': [
      '011070',
      '204270',
      '192650',
      '033240',
      '489790',
      '046890',
      '092190',
      '017900',
    ],
    '전자제품 제조·조립': ['065350'],
  },
  software: {
    '인터넷 플랫폼': ['035420', '035720', '181710'],
    'IT서비스·SI': ['018260', '064400', '022100', '124500'],
    '클라우드·인터넷 인프라': ['093320', '079940'],
    '기업 소프트웨어': ['030520', '042000'],
    'AI 소프트웨어': ['477850', '486990'],
    '보안·인증': ['053800', '236200', '356680'],
    '결제·데이터 인프라': ['060250', '052400', '036800', '294570'],
  },
  telecom: {
    통신서비스: ['017670', '030200', '032640'],
    '무선통신 장비': ['218410', '032500', '050890', '037460'],
    '광통신 부품·장비': ['010170', '069540'],
    '네트워크 장비': [],
    '위성통신 장비': ['189300'],
  },
  robot: {
    완성로봇: [
      '277810',
      '454910',
      '388720',
      '090710',
      '090360',
      '056080',
      '439960',
      '348340',
      '455900',
    ],
    구동부품: ['108490', '058610', '160190'],
    '센싱·정밀부품': [],
    '제어·로봇 소프트웨어': ['466100'],
    '자동화·시스템 통합': ['319400', '056190'],
  },
};

const NEEDS_REVIEW = [
  ['046890', 'elec', '카메라·광학·센서', '서울반도체 — LED 전용그룹 부재, 카메라·광학·센서 잠정'],
  ['092190', 'elec', '카메라·광학·센서', '서울바이오시스 — LED 전용그룹 부재, 카메라·광학·센서 잠정'],
  ['017900', 'elec', '카메라·광학·센서', '광전자 — LED 전용그룹 부재, 카메라·광학·센서 잠정'],
  ['248070', 'elec', '전자부품·기판', '솔루엠 — 부품/EMS·조립 경계, 전자부품·기판 잠정'],
  ['065350', 'elec', '전자제품 제조·조립', '신성델타테크 — 부품/조립 경계, 전자제품 제조·조립 잠정'],
];

const TAXONOMY_GAPS = [
  {
    ticker: '126560',
    name: '현대퓨처넷',
    from: 'telecom',
    reason:
      '통신 사업 근거 부족(디지털사이니지·메시징·화장품소재). 분류체계 공백 — 타 지도 자동편입 금지',
  },
];

const TAGS = {
  '222080': ['디스플레이 장비', 'OLED', '검사장비'],
  '077360': ['패키징 소재', '솔더볼'],
  '125490': ['로봇', '다이캐스팅', '차체'],
  '189300': ['방산', '위성통신'],
  '218410': ['GaN', 'RF', '방산', '핵심부품'],
  '046890': ['LED'],
  '092190': ['LED', 'UV'],
  '017900': ['LED'],
  '213420': ['OLED'],
  '009150': ['MLCC', '카메라모듈', '스마트폰'],
  '034220': ['OLED', 'TV·IT', '자동차'],
  '489790': ['영상보안 완제품'],
  '477850': ['산업AI', 'SaaS'],
  '486990': ['온디바이스AI', 'SaaS'],
  '060250': ['PG'],
  '052400': ['선불·결제'],
  '036800': ['VAN', 'PG'],
  '294570': ['데이터 API', '마이데이터'],
};

function pad(t) {
  return String(t).padStart(6, '0');
}

function buildSectorMap(sectorKey, groupMap) {
  const allowed = TECH_04D[sectorKey].chains;
  const out = {};
  const seen = new Set();
  for (const [chain, tickers] of Object.entries(groupMap)) {
    if (!allowed.includes(chain)) throw new Error(`${sectorKey}: unknown chain ${chain}`);
    for (const t of tickers) {
      const ticker = pad(t);
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

// Cross-move overrides on destination maps
if (!overrides.battery) overrides.battery = {};
overrides.battery[pad('222080')] = '제조·검사 장비';
if (!overrides.semi) overrides.semi = {};
overrides.semi[pad('077360')] = '기판·패키징 소재';
if (!overrides.auto) overrides.auto = {};
overrides.auto[pad('125490')] = '차체·내외장';

// Ensure moved tickers removed from source override maps
for (const t of ['222080', '077360']) delete overrides.elec?.[pad(t)];
delete overrides.robot?.[pad('125490')];
delete overrides.telecom?.[pad('126560')];
// stale robot overrides not on map / moved
for (const t of ['117730', '140670', '389500', '452450', '475400', '125490']) {
  delete overrides.robot?.[pad(t)];
}

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
  const t = '222080';
  fields[t] = fields[t] || {};
  fields[t].name = 'SFA넥셀';
  fields[t].nameEn = 'SFA Nexel';
  fields[t].semType = '배터리·디스플레이 공정·검사장비';
  fields[t].semTypeEn = 'Battery & display process/inspection equipment';
  fields[t].products = '2차전지 제조·검사 장비 (디스플레이 장비 이력)';
  fields[t].productsEn = 'Secondary-battery manufacturing and inspection equipment (display equipment adjacency)';
  const ind = ensureIndustry(t, 'battery');
  ind.chain = '제조·검사 장비';
}

{
  const t = '077360';
  fields[t] = fields[t] || {};
  fields[t].semType = '솔더볼·패키징 소재';
  fields[t].semTypeEn = 'Solder ball & packaging materials';
  fields[t].products = '솔더볼 등 반도체 패키징 소재';
  fields[t].productsEn = 'Semiconductor packaging materials including solder balls';
  const ind = ensureIndustry(t, 'semi');
  ind.chain = '기판·패키징 소재';
}

{
  const t = '125490';
  fields[t] = fields[t] || {};
  fields[t].semType = '차체·다이캐스팅';
  fields[t].semTypeEn = 'Body & die-casting parts';
  fields[t].products = '자동차 차체·하우징 다이캐스팅 (로봇 구조부품 관계)';
  fields[t].productsEn = 'Automotive body and housing die-casting (robot structural adjacency)';
  const ind = ensureIndustry(t, 'auto');
  ind.chain = '차체·내외장';
}

{
  const t = '189300';
  const ind = ensureIndustry(t, 'telecom');
  ind.chain = '위성통신 장비';
}

for (const [sector, map] of Object.entries(overrides)) {
  if (!MAPS[sector]) continue;
  for (const [ticker, chain] of Object.entries(map)) {
    const ind = ensureIndustry(ticker, sector);
    ind.chain = chain;
    ind.needs_review = false;
  }
}
for (const [t, sector, chain, note] of NEEDS_REVIEW) {
  const ind = ensureIndustry(pad(t), sector);
  ind.needs_review = true;
  ind.chain = chain;
  ind.review_evidence = note;
}
for (const g of TAXONOMY_GAPS) {
  const t = pad(g.ticker);
  const ind = ensureIndustry(t, g.from);
  delete ind.chain;
  ind.taxonomy_gap = true;
  ind.needs_review = false;
  ind.review_evidence = g.reason;
}
for (const [t, tags] of Object.entries(TAGS)) {
  const ticker = pad(t);
  if (!fields[ticker]) fields[ticker] = {};
  const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
  for (const tag of tags) if (!existing.includes(tag)) existing.push(tag);
  fields[ticker].tags = existing;
}

// Cross-list policy note for software payments vs finance
fields._policy = fields._policy || {};
fields._policy.software_finance_payments =
  '결제·데이터 인프라(software)는 PG·VAN·결제 플랫폼·데이터 API 기술·인프라 역할. finance의 결제·핀테크는 금융서비스 역할. 교차 수록 시 통합 집계는 ticker 중복 제거.';

fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

const exclusivePath = join(ROOT, 'lib', 'sector_exclusive.mjs');
let exclusiveSrc = fs.readFileSync(exclusivePath, 'utf8');
function upsertExclusive(ticker, sector, comment) {
  const re = new RegExp(`\\s*'${ticker}':\\s*'[^']+',\\s*//[^\\n]*\\n`);
  const line = `  '${ticker}': '${sector}', // ${comment}\n`;
  if (re.test(exclusiveSrc)) exclusiveSrc = exclusiveSrc.replace(re, `\n${line}`);
  else {
    exclusiveSrc = exclusiveSrc.replace(
      'export const SECTOR_EXCLUSIVE = {\n',
      `export const SECTOR_EXCLUSIVE = {\n${line}`,
    );
  }
}
function removeExclusive(ticker) {
  exclusiveSrc = exclusiveSrc.replace(new RegExp(`\\s*'${ticker}':\\s*'[^']+',\\s*//[^\\n]*\\n`), '\n');
}

upsertExclusive('222080', 'battery', 'SFA넥셀 (elec→battery 제조·검사 장비)');
upsertExclusive('077360', 'semi', '덕산하이메탈 (elec→semi 기판·패키징 소재)');
upsertExclusive('125490', 'auto', '한라캐스트 (robot→auto 차체·내외장)');
upsertExclusive('189300', 'telecom', '인텔리안테크 (위성통신 장비)');
removeExclusive('126560');
fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
console.log('OK sector_exclusive');

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
function removeAddition(fileRel, ticker) {
  const fp = join(ROOT, fileRel);
  if (!fs.existsSync(fp)) return;
  const arr = JSON.parse(fs.readFileSync(fp, 'utf8')).filter((r) => pad(r.ticker) !== pad(ticker));
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

removeAddition('elec/cp_list_elec_additions.json', '222080');
removeAddition('elec/cp_list_elec_additions.json', '077360');
removeAddition('robot/cp_list_robot_additions.json', '125490');
removeAddition('telecom/cp_list_telecom_additions.json', '126560');

upsertAddition('battery/cp_list_battery_additions.json', {
  ticker: '222080',
  name: 'SFA넥셀',
  nameEn: 'SFA Nexel',
  chain: '제조·검사 장비',
  semType: '배터리·디스플레이 공정·검사장비',
  semTypeEn: 'Battery & display process/inspection equipment',
  products: '2차전지 제조·검사 장비 (디스플레이 장비 이력)',
  productsEn: 'Secondary-battery manufacturing and inspection equipment',
  partners: [],
  subSector: '제조·검사 장비',
  level: 'core',
});
upsertAddition('semiconductor/cp_list_semi_additions.json', {
  ticker: '077360',
  name: '덕산하이메탈',
  nameEn: 'Duksan Hi Metal',
  chain: '기판·패키징 소재',
  semType: '솔더볼·패키징 소재',
  semTypeEn: 'Solder ball & packaging materials',
  products: '솔더볼 등 반도체 패키징 소재',
  productsEn: 'Semiconductor packaging materials including solder balls',
  partners: [],
  subSector: '기판·패키징 소재',
  level: 'core',
});
upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '125490',
  name: '한라캐스트',
  nameEn: 'Halla Cast',
  chain: '차체·내외장',
  semType: '차체·다이캐스팅',
  semTypeEn: 'Body & die-casting parts',
  products: '자동차 차체·하우징 다이캐스팅 (로봇 구조부품 관계)',
  productsEn: 'Automotive body and housing die-casting (robot structural adjacency)',
  partners: [],
  subSector: '차체·내외장',
  level: 'core',
});
upsertAddition('telecom/cp_list_telecom_additions.json', {
  ticker: '189300',
  name: '인텔리안테크',
  nameEn: 'Intellian Technologies',
  chain: '위성통신 장비',
  semType: '위성통신',
  semTypeEn: 'Satellite communications',
  products: '위성통신 안테나·단말 (방산 관계)',
  productsEn: 'Satellite communication antennas and terminals (defense adjacency)',
  partners: [],
  subSector: '위성통신 장비',
  level: 'core',
});

console.log('OK additions');

const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  join(reportDir, 'tech_04d_reclass_review.csv'),
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
  join(reportDir, 'tech_04d_taxonomy_gaps.csv'),
  [
    'ticker,name,from_sector,status,notes',
    ...TAXONOMY_GAPS.map(
      (g) =>
        `${pad(g.ticker)},"${g.name}",${g.from},taxonomy_gap,"${g.reason.replace(/"/g, '""')}"`,
    ),
  ].join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(
  join(reportDir, 'tech_04d_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: Object.fromEntries(Object.keys(MAPS).map((k) => [k, overrides[k]])),
      moves: [
        { ticker: '222080', from: 'elec', to: 'battery', chain: '제조·검사 장비', name: 'SFA넥셀' },
        { ticker: '077360', from: 'elec', to: 'semi', chain: '기판·패키징 소재' },
        { ticker: '125490', from: 'robot', to: 'auto', chain: '차체·내외장' },
        { ticker: '126560', from: 'telecom', to: null, note: 'taxonomy_gap' },
      ],
      needs_review: NEEDS_REVIEW,
      taxonomy_gaps: TAXONOMY_GAPS,
      tags: TAGS,
      expected_on_map: {
        elec: 27,
        software: 20,
        telecom: 10,
        robot: 15,
        battery: 26,
        semi: 81,
        auto: 24,
      },
      software_finance_policy:
        'software 결제·데이터 인프라 vs finance 결제·핀테크 — 역할 분리, 통합집계 ticker 중복제거',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK docs/reports/tech_04d_*');
