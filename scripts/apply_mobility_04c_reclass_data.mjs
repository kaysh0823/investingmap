/**
 * §0-4 batch C data: chain_overrides, field fixes, exclusive moves, review CSV.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MOBILITY_04C } from '../lib/mobility_04c_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = {
  auto: {
    완성차: ['005380', '000270', '003620'],
    '구동·파워트레인': ['011210', '064960', '437730'],
    '섀시·안전': ['204320', '012330', '007340', '000430'],
    '차체·내외장': ['015750', '009900', '200880', '010690', '125490'],
    '전장·차량 소프트웨어': ['307950', '097520', '005850', '025540'],
    열관리: ['018880'],
    타이어: ['161390', '073240', '002350', '000240'],
    '유통·모빌리티 서비스': ['403550', '381970'],
  },
  ship: {
    조선: ['329180', '042660', '009540', '010140', '439260', '097230'],
    '엔진·추진': ['082740', '071970', '077970'],
    '선체·구조물': ['044490', '075580', '460930'],
    '탱크·보냉': ['017960', '033500'],
    '배관·의장': ['014620', '023160', '013030'],
    '전장·항해·제어': [],
    '해양플랜트 설비': [],
    '유지보수·개조': ['443060'],
  },
  shipping: {
    '컨테이너 해운': ['011200', '003280'],
    '벌크 해운': ['028670', '005880'],
    '탱커·가스 운송': [],
    '자동차·특수화물 운송': [],
    종합물류: [],
    '택배·풀필먼트': [],
    '포워딩·국제물류': [],
    '항만·터미널': [],
  },
  defense: {
    육상체계: ['064350', '003570', '012450'],
    '유도무기·탄약': ['079550', '103140'],
    '항공체계·엔진': ['047810'],
    '해양 방산': [],
    '방산전자·센서': ['272210', '214430'],
    '우주·위성': ['099320'],
    '소재·핵심부품': ['082920', '347700'],
    '정비·지원': [],
  },
};

/** Spec universe but currently below mcap floor — overrides kept, map inject skipped. */
const MCAP_FLOOR_SKIP = [
  {
    ticker: '000430',
    name: '대원강업',
    sector: 'auto',
    chain: '섀시·안전',
    reason: '매핑표 섀시·안전이나 시총 3천억 미만으로 미편입',
  },
  {
    ticker: '010690',
    name: '화신',
    sector: 'auto',
    chain: '차체·내외장',
    reason: '매핑표 차체·내외장이나 시총 3천억 미만으로 미편입',
  },
];

const NEEDS_REVIEW = [
  ['012330', 'auto', '섀시·안전', '현대모비스 — 섀시·안전 대표 잠정(모듈·전장 비중 검토)'],
  ['007340', 'auto', '섀시·안전', 'DN오토모티브 — 섀시·안전 잠정'],
  ['044490', 'ship', '선체·구조물', '태웅 — 선체·구조물 잠정'],
  [
    '012450',
    'defense',
    '육상체계',
    '한화에어로스페이스 — 육상체계(K9·천무) 확정, 항공엔진·우주·해양 고유성 주석/태그',
  ],
];

const TAGS = {
  '012450': ['지상방산', '항공엔진', '우주', '해양', 'K9', '천무'],
  '079550': ['미사일', '레이더', 'C4ISR'],
  '189300': ['방산', '위성통신'],
  '437730': ['로봇 액추에이터', '자동차 부품', '전장'],
};

function pad(t) {
  return String(t).padStart(6, '0');
}

function buildSectorMap(sectorKey, groupMap) {
  const allowed = MOBILITY_04C[sectorKey].chains;
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
// Remove shipping tickers leftover under ship if any
for (const t of ['011200', '003280', '028670', '005880']) {
  if (overrides.ship?.[pad(t)]) delete overrides.ship[pad(t)];
}
delete overrides.ship?.['101930'];
delete overrides.ship?.['064820'];
delete overrides.ship?.['092460'];
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');

const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

function ensureIndustry(ticker, industry) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry[industry]) fields[ticker].byIndustry[industry] = {};
  return fields[ticker].byIndustry[industry];
}

// §3 한화에어로스페이스
{
  const t = '012450';
  fields[t] = fields[t] || {};
  fields[t].semType = '지상방산(K9·천무)';
  fields[t].semTypeEn = 'Land defense (K9, Chunmoo)';
  fields[t].products =
    '자주포·다연장로켓 등 지상방산 체계 (항공엔진·우주·해양 사업 병행)';
  fields[t].productsEn =
    'Land defense systems incl. howitzers and MLRS (also aero engines, space, naval)';
  const ind = ensureIndustry(t, 'defense');
  ind.chain = '육상체계';
  ind.semType = fields[t].semType;
  ind.products = fields[t].products;
  ind.semTypeEn = fields[t].semTypeEn;
  ind.productsEn = fields[t].productsEn;
}

// §3 LIG rename
{
  const t = '079550';
  fields[t] = fields[t] || {};
  fields[t].name = 'LIG디펜스앤에어로스페이스';
  fields[t].nameEn = 'LIG Defense & Aerospace';
  fields[t].semType = '유도무기·탄약';
  fields[t].semTypeEn = 'Missiles & munitions';
  fields[t].products = '미사일·레이더·C4ISR';
  fields[t].productsEn = 'Missiles, radar and C4ISR';
  const ind = ensureIndustry(t, 'defense');
  ind.chain = '유도무기·탄약';
}

// 삼현 fine group
{
  const t = '437730';
  fields[t] = fields[t] || {};
  const ind = ensureIndustry(t, 'auto');
  ind.chain = '구동·파워트레인';
}

// 인텔리안테크 → telecom
{
  const t = '189300';
  fields[t] = fields[t] || {};
  fields[t].semType = '위성통신';
  fields[t].semTypeEn = 'Satellite communications';
  fields[t].products = '위성통신 안테나·단말 (방산 관계)';
  fields[t].productsEn = 'Satellite communication antennas and terminals (defense adjacency)';
  const ind = ensureIndustry(t, 'telecom');
  ind.chain = '위성통신';
  if (fields[t].byIndustry?.defense) {
    delete fields[t].byIndustry.defense.chain;
    fields[t].byIndustry.defense.moved_to = 'telecom';
  }
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

for (const g of MCAP_FLOOR_SKIP) {
  const t = pad(g.ticker);
  const ind = ensureIndustry(t, g.sector);
  ind.chain = g.chain;
  ind.mcap_floor_skip = true;
  ind.review_evidence = g.reason;
  ind.needs_review = false;
}

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

upsertExclusive('189300', 'telecom', '인텔리안테크 (defense→telecom 위성통신)');
upsertExclusive('437730', 'auto', '삼현 (구동·파워트레인)');
upsertExclusive('012450', 'defense', '한화에어로스페이스 (육상체계)');
upsertExclusive('079550', 'defense', 'LIG디펜스앤에어로스페이스');
upsertExclusive('381970', 'auto', '케이카 (유통·모빌리티 서비스)');
upsertExclusive('403550', 'auto', '쏘카 (유통·모빌리티 서비스)');
upsertExclusive('011200', 'shipping', 'HMM (컨테이너 해운)');
upsertExclusive('003280', 'shipping', '흥아해운 (컨테이너 해운)');
upsertExclusive('028670', 'shipping', '팬오션 (벌크 해운)');
upsertExclusive('005880', 'shipping', '대한해운 (벌크 해운)');
// keep exclusive for below-floor auto names so they do not reappear elsewhere
upsertExclusive('000430', 'auto', '대원강업 (시총 미달 잠정 exclusive)');
upsertExclusive('010690', 'auto', '화신 (시총 미달 잠정 exclusive)');
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

removeAddition('defense/cp_list_defense_additions.json', '189300');
removeAddition('ship/cp_list_ship_additions.json', '003280');
removeAddition('ship/cp_list_ship_additions.json', '011200');
removeAddition('ship/cp_list_ship_additions.json', '028670');
removeAddition('ship/cp_list_ship_additions.json', '005880');

upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '437730',
  name: '삼현',
  nameEn: 'Samhyun',
  chain: '구동·파워트레인',
  semType: '자동차 부품·전장',
  semTypeEn: 'Auto parts & electronics',
  products: '자동차 부품·전장 (로봇 액추에이터)',
  productsEn: 'Automotive parts and electronics (robot actuators)',
  partners: [],
  subSector: '구동·파워트레인',
  level: 'core',
});
upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '403550',
  name: '쏘카',
  nameEn: 'Socar',
  chain: '유통·모빌리티 서비스',
  semType: '모빌리티(카셰어링)',
  semTypeEn: 'Mobility (car sharing)',
  products: '카셰어링·모빌리티 플랫폼',
  productsEn: 'Car-sharing and mobility platform',
  partners: ['uber', 'lyft', 'toyota'],
  subSector: '유통·모빌리티 서비스',
  level: 'core',
});
upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '381970',
  name: '케이카',
  nameEn: 'K Car',
  chain: '유통·모빌리티 서비스',
  semType: '중고차 유통',
  semTypeEn: 'Used-car retail',
  products: '중고차 매매·플랫폼',
  productsEn: 'Used-car sales and marketplace',
  partners: ['carvana', 'autonation', 'vw'],
  subSector: '유통·모빌리티 서비스',
  level: 'core',
});
// below-floor: still in additions for when mcap recovers; inject gated by floor
upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '000430',
  name: '대원강업',
  nameEn: 'Daewon Kangup',
  chain: '섀시·안전',
  semType: '자동차 스프링·부품',
  semTypeEn: 'Auto springs & parts',
  products: '스프링·섀시 관련 부품',
  productsEn: 'Springs and chassis-related parts',
  partners: [],
  subSector: '섀시·안전',
  level: 'core',
});
upsertAddition('auto/cp_list_auto_additions.json', {
  ticker: '010690',
  name: '화신',
  nameEn: 'Hwashin',
  chain: '차체·내외장',
  semType: '차체 부품',
  semTypeEn: 'Body parts',
  products: '차체·샤시 부품',
  productsEn: 'Body and chassis parts',
  partners: [],
  subSector: '차체·내외장',
  level: 'core',
});

for (const row of [
  {
    ticker: '011200',
    name: 'HMM',
    nameEn: 'HMM',
    chain: '컨테이너 해운',
    semType: '컨테이너 해운',
    semTypeEn: 'Container shipping',
    products: '컨테이너선 해상운송',
    productsEn: 'Container liner shipping',
  },
  {
    ticker: '003280',
    name: '흥아해운',
    nameEn: 'Heung-A Shipping',
    chain: '컨테이너 해운',
    semType: '컨테이너 해운',
    semTypeEn: 'Container shipping',
    products: '컨테이너·근해 정기선',
    productsEn: 'Container and short-sea liner services',
  },
  {
    ticker: '028670',
    name: '팬오션',
    nameEn: 'Pan Ocean',
    chain: '벌크 해운',
    semType: '벌크 해운',
    semTypeEn: 'Bulk shipping',
    products: '건화물 벌크 해상운송',
    productsEn: 'Dry bulk shipping',
  },
  {
    ticker: '005880',
    name: '대한해운',
    nameEn: 'Korea Line',
    chain: '벌크 해운',
    semType: '벌크 해운',
    semTypeEn: 'Bulk shipping',
    products: '벌크·특수화물 해상운송',
    productsEn: 'Bulk and specialized cargo shipping',
  },
]) {
  upsertAddition('shipping/cp_list_shipping_additions.json', {
    ...row,
    productsEn: row.productsEn,
    partners: [],
    subSector: row.chain,
    level: 'core',
  });
}

upsertAddition('telecom/cp_list_telecom_additions.json', {
  ticker: '189300',
  name: '인텔리안테크',
  nameEn: 'Intellian Technologies',
  chain: '위성통신',
  semType: '위성통신',
  semTypeEn: 'Satellite communications',
  products: '위성통신 안테나·단말 (방산 관계)',
  productsEn: 'Satellite communication antennas and terminals (defense adjacency)',
  partners: [],
  subSector: '위성통신',
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
fs.writeFileSync(join(reportDir, 'mobility_04c_reclass_review.csv'), review.join('\n') + '\n', 'utf8');
const gaps = [
  'ticker,name,sector,status,notes',
  ...MCAP_FLOOR_SKIP.map(
    (g) =>
      `${pad(g.ticker)},"${g.name}",${g.sector},mcap_floor_skip,"${g.reason.replace(/"/g, '""')}"`,
  ),
];
fs.writeFileSync(join(reportDir, 'mobility_04c_mcap_skips.csv'), gaps.join('\n') + '\n', 'utf8');
fs.writeFileSync(
  join(reportDir, 'mobility_04c_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: Object.fromEntries(Object.keys(MAPS).map((k) => [k, overrides[k]])),
      moves: [
        { ticker: '189300', from: 'defense', to: 'telecom', chain: '위성통신' },
        { ticker: '437730', from: 'auto', to: 'auto', chain: '구동·파워트레인', note: '배치B 편입 후 세부배정' },
      ],
      needs_review: NEEDS_REVIEW,
      mcap_floor_skip: MCAP_FLOOR_SKIP,
      tags: TAGS,
      expected_on_map: { auto: 23, ship: 18, shipping: 4, defense: 11 },
      expected_spec_universe: { auto: 25, ship: 18, shipping: 4, defense: 11 },
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK docs/reports/mobility_04c_*');
