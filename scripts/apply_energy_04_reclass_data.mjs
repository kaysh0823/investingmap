/**
 * §0-4 data rewrite: chain_overrides, field fixes/tags, exclusive moves, needs_review CSV.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ENERGY_04 } from '../lib/energy_04_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = {
  battery: {
    '원료·정제': ['005420'],
    '양극재·전구체': ['247540', '066970', '450080', '005070', '051910', '003670', '086520'],
    음극재: [],
    '전해액·전해질': ['348370', '093370', '278280'],
    분리막: ['361610', '393890'],
    '집전체·기타 소재': ['011790', '020150', '121600', '336370'],
    '셀 제조': ['373220', '006400', '004490', '096770', '001570'],
    '모듈·팩·시스템 부품': ['107640'],
    '제조·검사 장비': ['137400', '222080'],
    '재사용·재활용': ['365340'],
  },
  renewable: {
    '핵심 소재·부품': ['456040', '010060'],
    '발전설비 제조': ['009830', '322000', '018000', '011930'],
    '구조물·보조설비': ['112610', '100090'],
    '개발·EPC': ['475150'],
    '발전 운영·유지보수': [],
    '수소·연료전지': ['336260', '271940', '126340'],
  },
  nuclear: {
    '설계·엔지니어링': ['052690'],
    '건설·EPC': [],
    '원자로·주기기': ['034020'],
    '보조기기·소재': ['083650', '100840', '006910'],
    '계측·제어': [],
    '정비·운영지원': ['051600', '130660'],
    '연료·해체·폐기물': [],
  },
  powergrid: {
    변압기: ['267260', '298040', '062040', '033100'],
    '개폐·배전기기': ['010120'],
    '전선·케이블': ['000500', '001440', '229640', '006340', '103590'],
    '전력변환·제어': [],
    '전력망 시공·서비스': ['060370'],
    '발전·비상전원 설비': ['119850'],
    유틸리티: ['015760', '036460', '071320'],
  },
};

const TAGS = {
  '006400': ['전고체', '개발'],
  '004490': ['납축'],
  '001570': ['개발'],
  '271940': ['저장·운송', '수소'],
  '336260': ['활용', '수소·연료전지'],
  '112610': ['해상풍력'],
  '100090': ['해상풍력'],
  '034020': ['SMR'],
  '298040': ['ESS', 'PCS'],
  '126340': ['슈퍼커패시터'],
  '119850': ['바이오가스', '연료전지 운영'],
  '006910': ['중전기'],
};

const NEEDS_REVIEW = [
  '096770',
  '051910',
  '086520',
  '003670',
  '001570',
  '010060',
  '011930',
  '010120',
  '103590',
];

function pad(t) {
  return String(t).padStart(6, '0');
}

function buildSectorMap(sectorKey, groupMap) {
  const allowed = ENERGY_04[sectorKey].chains;
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
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');

// field overrides: products fixes + tags + needs_review + chains
const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

function ensureIndustry(ticker, industry) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry[industry]) fields[ticker].byIndustry[industry] = {};
  return fields[ticker].byIndustry[industry];
}

function setProducts(ticker, industry, products, productsEn, semType, semTypeEn) {
  const row = fields[ticker] || (fields[ticker] = {});
  row.products = products;
  if (productsEn) row.productsEn = productsEn;
  if (semType) row.semType = semType;
  if (semTypeEn) row.semTypeEn = semTypeEn;
  const ind = ensureIndustry(ticker, industry);
  ind.products = products;
  if (productsEn) ind.productsEn = productsEn;
  if (semType) ind.semType = semType;
  if (semTypeEn) ind.semTypeEn = semTypeEn;
}

// §4 product fixes
setProducts(
  '278280',
  'battery',
  '전해질(LiFSI·F/P/D)·전해액 첨가제',
  'Electrolytes (LiFSI, F/P/D) and electrolyte additives',
  '전해질·전해액 첨가제',
  'Electrolyte & additives',
);
setProducts(
  '271940',
  'renewable',
  'Type4 수소 저장용기(넥쏘)',
  'Type4 hydrogen storage vessels (Nexo)',
  '수소 저장용기',
  'Hydrogen storage vessels',
);
setProducts(
  '100840',
  'nuclear',
  '원전·발전 열교환기·압력용기 기자재',
  'Heat exchangers and pressure vessels for nuclear and power plants',
  '원전·발전 보조기기',
  'Nuclear & power plant auxiliaries',
);
setProducts(
  '006910',
  'nuclear',
  '원전 내진 강구조물·철구조물',
  'Seismic steel structures for nuclear plants',
  '원전 철구조물·보조기기',
  'Nuclear steel structures & auxiliaries',
);

for (const [sector, map] of Object.entries(overrides)) {
  if (!MAPS[sector]) continue;
  for (const [ticker, chain] of Object.entries(map)) {
    const ind = ensureIndustry(ticker, sector);
    ind.chain = chain;
    ind.needs_review = NEEDS_REVIEW.includes(ticker);
  }
}

for (const [t, tags] of Object.entries(TAGS)) {
  const ticker = pad(t);
  if (!fields[ticker]) fields[ticker] = {};
  const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
  for (const tag of tags) if (!existing.includes(tag)) existing.push(tag);
  fields[ticker].tags = existing;
}

// SK가스 chemical home
{
  const ind = ensureIndustry('018670', 'chemical');
  ind.chain = '정유·가스';
  fields['018670'].semType = fields['018670'].semType || 'LPG·가스';
  fields['018670'].semTypeEn = fields['018670'].semTypeEn || 'LPG & gas';
  fields['018670'].products = fields['018670'].products || 'LPG·가스 유통·트레이딩';
  fields['018670'].productsEn = fields['018670'].productsEn || 'LPG and gas distribution and trading';
}

fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

// exclusive moves
const exclusivePath = join(ROOT, 'lib', 'sector_exclusive.mjs');
let exclusiveSrc = fs.readFileSync(exclusivePath, 'utf8');
function upsertExclusive(ticker, sector, comment) {
  const re = new RegExp(`\\s*'${ticker}':\\s*'[^']+',\\s*//[^\\n]*\\n`);
  const line = `  '${ticker}': '${sector}', // ${comment}\n`;
  if (re.test(exclusiveSrc)) {
    exclusiveSrc = exclusiveSrc.replace(re, `\n${line}`);
  } else {
    // insert near other energy exclusives after 093370 block if possible
    if (exclusiveSrc.includes(`'093370':`)) {
      exclusiveSrc = exclusiveSrc.replace(
        /('093370': 'battery',[^\n]*\n)/,
        `$1${line}`,
      );
    } else {
      exclusiveSrc = exclusiveSrc.replace(
        'export const SECTOR_EXCLUSIVE = {\n',
        `export const SECTOR_EXCLUSIVE = {\n${line}`,
      );
    }
  }
}
upsertExclusive('126340', 'renewable', '비나텍 (battery→renewable 수소·연료전지)');
upsertExclusive('119850', 'powergrid', '지엔씨에너지 (renewable→powergrid 비상전원)');
upsertExclusive('018670', 'chemical', 'SK가스 (renewable→chemical 정유·가스)');
fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
console.log('OK sector_exclusive moves');

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

removeAddition('battery/cp_list_battery_additions.json', '126340');
removeAddition('renewable/cp_list_renewable_additions.json', '119850');
removeAddition('renewable/cp_list_renewable_additions.json', '018670');

upsertAddition('renewable/cp_list_renewable_additions.json', {
  ticker: '126340',
  name: '비나텍',
  nameEn: 'Vinatech',
  chain: '수소·연료전지',
  semType: '슈퍼커패시터·연료전지',
  semTypeEn: 'Supercapacitor & fuel cell',
  products: '슈퍼커패시터·연료전지 관련',
  productsEn: 'Supercapacitors and fuel-cell related products',
  partners: [],
  subSector: '수소·연료전지',
  level: 'core',
});

upsertAddition('powergrid/cp_list_powergrid_additions.json', {
  ticker: '119850',
  name: '지엔씨에너지',
  nameEn: 'GNC Energy',
  chain: '발전·비상전원 설비',
  semType: '바이오가스·비상전원',
  semTypeEn: 'Biogas & standby power',
  products: '바이오가스·연료전지 발전·비상전원 운영',
  productsEn: 'Biogas and fuel-cell generation / standby power operations',
  partners: [],
  subSector: '발전·비상전원 설비',
  level: 'core',
});

upsertAddition('chemical/cp_list_chemical_additions.json', {
  ticker: '018670',
  name: 'SK가스',
  nameEn: 'SK Gas',
  chain: '정유·가스',
  semType: 'LPG·가스',
  semTypeEn: 'LPG & gas',
  products: 'LPG·가스 유통·트레이딩',
  productsEn: 'LPG and gas distribution and trading',
  partners: [],
  subSector: '정유·가스',
  level: 'core',
});

console.log('OK additions battery/renewable/powergrid/chemical');

// needs_review CSV
const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const reviewRows = [
  'ticker,sector,provisional_group,status,notes',
  ...NEEDS_REVIEW.map((t) => {
    const ticker = pad(t);
    let sector = '';
    let group = '';
    for (const [sec, map] of Object.entries(overrides)) {
      if (!MAPS[sec]) continue;
      if (map[ticker]) {
        sector = sec;
        group = map[ticker];
        break;
      }
    }
    return `${ticker},${sector},"${group}",needs_review,잠정 배정 — 배포 전 제품/사업 근거 재확인`;
  }),
];
fs.writeFileSync(join(reportDir, 'energy_04_reclass_review.csv'), reviewRows.join('\n') + '\n', 'utf8');

const mapping = {};
for (const [sector, map] of Object.entries(overrides)) {
  if (!MAPS[sector]) continue;
  mapping[sector] = map;
}
fs.writeFileSync(
  join(reportDir, 'energy_04_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: mapping,
      moves: [
        { ticker: '126340', from: 'battery', to: 'renewable', chain: '수소·연료전지' },
        { ticker: '119850', from: 'renewable', to: 'powergrid', chain: '발전·비상전원 설비' },
        { ticker: '018670', from: 'renewable', to: 'chemical', chain: '정유·가스' },
      ],
      needs_review: NEEDS_REVIEW,
      tags: TAGS,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK docs/reports/energy_04_*');
