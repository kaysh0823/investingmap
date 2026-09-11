/**
 * §0-4 batch B data: chain_overrides, field fixes, exclusive moves, review/gap CSV.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { INDUSTRY_04B } from '../lib/industry_04b_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = {
  chemical: {
    '정유·석유제품': ['010950', '002960', '005090'],
    가스: ['018670', '017940'],
    '기초유분·석유화학': ['011170', '006650', '006380', '005950'],
    '합성수지·고무': ['011780'],
    '섬유·산업소재': ['120110', '298020', '003240', '298050'],
    '정밀·특수화학': ['004000', '069260', '268280', '002840', '161000', '007690', '457190', '002380'],
    '전자·첨단소재': [],
    '비료·농화학': ['025860'],
    '화학 유통': ['002810', '001740'], // 001740 provisional + needs_review
  },
  metal: {
    '종합 철강': ['004020'],
    '판재·도금강판': ['016380'],
    '봉형강·선재': ['460860', '002240', '104700'],
    강관: ['306200', '092790'],
    '특수강·단조': ['001430'],
    '비철 제련': ['010130', '000670'],
    '비철 가공·첨단금속': ['006110', '295310', '001530'],
    '금속 유통·가공서비스': ['047050', '009520'],
  },
  machinery: {
    건설기계: ['241560', '267270'],
    '공작·금속가공기계': ['009160'],
    '물류·운반기계': [],
    승강기: ['017800'],
    '산업용 설비': [],
    '핵심부품·공구': ['019210'],
    '유지보수·서비스': [],
  },
  construction: {
    종합건설: ['028260', '000720', '047040', '006360', '375500', '002990', '009410', '010780'],
    '주택·개발': ['294870', '035890', '317400'],
    '플랜트·EPC': ['028050'],
    '토목·인프라': [],
    '전문건설·엔지니어링': [],
    '시멘트·기초 건자재': ['300720', '038500', '183190'],
    '마감재·인테리어': ['009240', '344820', '025900', '108670'],
    '부동산 서비스': ['123890'], // 034830 below mcap floor — not added
  },
};

/** Tickers removed from home map (taxonomy gap — no forced group). */
const TAXONOMY_GAPS = [
  {
    ticker: '014820',
    name: '동원시스템즈',
    from: 'chemical',
    reason: '포장재 — 분류체계 공백(화학 9그룹에 해당 없음)',
  },
  {
    ticker: '008730',
    name: '율촌화학',
    from: 'chemical',
    reason: '포장재 — 분류체계 공백(화학 9그룹에 해당 없음)',
  },
];

const NEEDS_REVIEW = [
  ['001740', 'chemical', '화학 유통', 'SK네트웍스 — 화학 근거 약함, 제외/이동 확정 대기(잠정 화학 유통)'],
  ['005090', 'chemical', '정유·석유제품', 'SGC에너지 — 발전 비중, 정유·석유제품 잠정'],
  ['001430', 'metal', '특수강·단조', '세아베스틸지주 — 지주/특수강 잠정'],
  ['001530', 'metal', '비철 가공·첨단금속', 'DI동일 — 지주 성격 잠정'],
];

const TAGS = {
  '002380': ['건자재', '실리콘', '도료'],
  '437730': ['로봇 액추에이터', '자동차 부품', '전장'],
  '267270': ['건설기계'],
  '004690': ['도시가스', '유틸리티'],
  '009520': ['철강 포장', '탈산제'],
};

function pad(t) {
  return String(t).padStart(6, '0');
}

function buildSectorMap(sectorKey, groupMap) {
  const allowed = INDUSTRY_04B[sectorKey].chains;
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
// powergrid: add 삼천리
if (!overrides.powergrid) overrides.powergrid = {};
overrides.powergrid[pad('004690')] = '유틸리티';
// auto: no fine groups yet — do not write auto chain_overrides leaf
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');

const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

function ensureIndustry(ticker, industry) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry[industry]) fields[ticker].byIndustry[industry] = {};
  return fields[ticker].byIndustry[industry];
}

// §3 포스코엠텍
{
  const t = '009520';
  fields[t] = fields[t] || {};
  fields[t].semType = '철강 포장·탈산제';
  fields[t].semTypeEn = 'Steel packaging & deoxidizer';
  fields[t].products = '철강 포장 용역·알루미늄 탈산제';
  fields[t].productsEn = 'Steel packaging services and aluminum deoxidizers';
  const ind = ensureIndustry(t, 'metal');
  ind.chain = '금속 유통·가공서비스';
  ind.semType = fields[t].semType;
  ind.products = fields[t].products;
  ind.semTypeEn = fields[t].semTypeEn;
  ind.productsEn = fields[t].productsEn;
}

// KCC chemical
{
  const t = '002380';
  fields[t] = fields[t] || {};
  fields[t].semType = '실리콘·도료·특수화학';
  fields[t].semTypeEn = 'Silicones, coatings & specialty chemicals';
  fields[t].products = '실리콘·도료 등 정밀·특수화학 (건자재 관계)';
  fields[t].productsEn = 'Silicones and coatings specialty chemicals (building-materials adjacency)';
  const ind = ensureIndustry(t, 'chemical');
  ind.chain = '정밀·특수화학';
}

// HD건설기계 rename
{
  const t = '267270';
  fields[t] = fields[t] || {};
  fields[t].name = 'HD건설기계';
  fields[t].nameEn = 'HD Construction Equipment';
  fields[t].semType = '건설기계';
  fields[t].semTypeEn = 'Construction equipment';
  fields[t].products = '굴착기·휠로더 등 건설기계 (구 인프라코어 합병)';
  fields[t].productsEn = 'Excavators, wheel loaders and construction equipment (ex-Infracore)';
  const ind = ensureIndustry(t, 'machinery');
  ind.chain = '건설기계';
}

// 삼천리 powergrid
{
  const t = '004690';
  const ind = ensureIndustry(t, 'powergrid');
  ind.chain = '유틸리티';
  fields[t] = fields[t] || {};
  fields[t].semType = fields[t].semType || '도시가스';
  fields[t].products = fields[t].products || '도시가스 공급·에너지';
}

// 삼현 auto (no fine chain yet)
{
  const t = '437730';
  fields[t] = fields[t] || {};
  fields[t].semType = '자동차 부품·전장';
  fields[t].semTypeEn = 'Auto parts & electronics';
  fields[t].products = '자동차 부품·전장 (로봇 액추에이터)';
  fields[t].productsEn = 'Automotive parts and electronics (robot actuators)';
  const ind = ensureIndustry(t, 'auto');
  ind.chain = ind.chain || '부품';
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

for (const [t, tags] of Object.entries(TAGS)) {
  const ticker = pad(t);
  if (!fields[ticker]) fields[ticker] = {};
  const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
  for (const tag of tags) if (!existing.includes(tag)) existing.push(tag);
  fields[ticker].tags = existing;
}

// mark taxonomy gaps
for (const g of TAXONOMY_GAPS) {
  const t = pad(g.ticker);
  const ind = ensureIndustry(t, g.from);
  delete ind.chain;
  ind.taxonomy_gap = true;
  ind.review_evidence = g.reason;
  ind.needs_review = false;
}

fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

// exclusive
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

upsertExclusive('267270', 'machinery', 'HD건설기계 (construction→machinery)');
upsertExclusive('002380', 'chemical', 'KCC (construction→chemical 정밀·특수화학)');
upsertExclusive('004690', 'powergrid', '삼천리 (chemical→powergrid 유틸리티)');
upsertExclusive('437730', 'auto', '삼현 (machinery→auto 부품/전장)');
removeExclusive('014820');
removeExclusive('008730');
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

removeAddition('chemical/cp_list_chemical_additions.json', '004690');
removeAddition('chemical/cp_list_chemical_additions.json', '014820');
removeAddition('chemical/cp_list_chemical_additions.json', '008730');
removeAddition('construction/cp_list_construction_additions.json', '267270');
removeAddition('construction/cp_list_construction_additions.json', '002380');
removeAddition('machinery/cp_list_machinery_additions.json', '437730');

upsertAddition('machinery/cp_list_machinery_additions.json', {
  ticker: '267270',
  name: 'HD건설기계',
  nameEn: 'HD Construction Equipment',
  chain: '건설기계',
  semType: '건설기계',
  semTypeEn: 'Construction equipment',
  products: '굴착기·휠로더 등 건설기계 (구 인프라코어 합병)',
  productsEn: 'Excavators, wheel loaders and construction equipment (ex-Infracore)',
  partners: [],
  subSector: '건설기계',
  level: 'core',
});

upsertAddition('chemical/cp_list_chemical_additions.json', {
  ticker: '002380',
  name: 'KCC',
  nameEn: 'KCC',
  chain: '정밀·특수화학',
  semType: '실리콘·도료·특수화학',
  semTypeEn: 'Silicones, coatings & specialty chemicals',
  products: '실리콘·도료 등 정밀·특수화학 (건자재 관계)',
  productsEn: 'Silicones and coatings specialty chemicals',
  partners: [],
  subSector: '정밀·특수화학',
  level: 'core',
});

upsertAddition('powergrid/cp_list_powergrid_additions.json', {
  ticker: '004690',
  name: '삼천리',
  nameEn: 'Samchully',
  chain: '유틸리티',
  semType: '도시가스',
  semTypeEn: 'City gas',
  products: '도시가스 공급·에너지',
  productsEn: 'City gas supply and energy',
  partners: [],
  subSector: '유틸리티',
  level: 'core',
});

upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '437730',
  name: '삼현',
  nameEn: 'Samhyun',
  chain: '부품',
  semType: '자동차 부품·전장',
  semTypeEn: 'Auto parts & electronics',
  products: '자동차 부품·전장 (로봇 액추에이터)',
  productsEn: 'Automotive parts and electronics (robot actuators)',
  partners: [],
  subSector: '자동차 부품',
  level: 'core',
});

console.log('OK additions');

const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const review = [
  'ticker,sector,provisional_group,status,notes',
  ...NEEDS_REVIEW.map(
    ([t, sector, chain, note]) =>
      `${pad(t)},${sector},"${chain}",needs_review,"${note.replace(/"/g, '""')}"`,
  ),
];
fs.writeFileSync(join(reportDir, 'industry_04b_reclass_review.csv'), review.join('\n') + '\n', 'utf8');
const gaps = [
  'ticker,name,from_sector,status,notes',
  ...TAXONOMY_GAPS.map(
    (g) =>
      `${pad(g.ticker)},"${g.name}",${g.from},taxonomy_gap,"${g.reason.replace(/"/g, '""')}"`,
  ),
  '034830,"한국토지신탁",construction,mcap_floor_skip,"매핑표 부동산 서비스이나 시총 3천억 미만으로 미편입"',
];
fs.writeFileSync(join(reportDir, 'industry_04b_taxonomy_gaps.csv'), gaps.join('\n') + '\n', 'utf8');
fs.writeFileSync(
  join(reportDir, 'industry_04b_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: Object.fromEntries(Object.keys(MAPS).map((k) => [k, overrides[k]])),
      moves: [
        { ticker: '267270', from: 'construction', to: 'machinery', chain: '건설기계' },
        { ticker: '002380', from: 'construction', to: 'chemical', chain: '정밀·특수화학' },
        { ticker: '004690', from: 'chemical', to: 'powergrid', chain: '유틸리티' },
        { ticker: '437730', from: 'machinery', to: 'auto', chain: '부품' },
      ],
      needs_review: NEEDS_REVIEW,
      taxonomy_gaps: TAXONOMY_GAPS,
      tags: TAGS,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK docs/reports/industry_04b_*');
