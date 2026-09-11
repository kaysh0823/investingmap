/**
 * §0-4 batch F data: kconsume/kcontent/travel overrides + shipping logistics moves.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CONSUMER_04F } from '../lib/consumer_04f_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pad(t) {
  return String(t || '').padStart(6, '0');
}

const MAPS = {
  kconsume: {
    가공식품: [
      '003230', '271560', '097950', '004370', '280360', '007310', '005180', '001680',
      '017810', '005610', '026960',
    ],
    '음료·주류': ['000080', '005300'],
    '식품소재·급식': ['453340', '145990'],
    '농축수산·가공': ['006040'],
    '담배·건강소비재': ['033780'],
    '패션 브랜드': ['383220', '081660', '093050', '036620', '020000'],
    '의류 제조': ['111770', '105630'],
    유통: ['004170', '023530', '282330', '007070', '069960', '139480', '031430'],
    '가구·생활소비재': ['003800', '016800'],
    종합상사: ['001120', '011760'],
  },
  kcontent: {
    게임: [
      '259960', '036570', '251270', '263750', '462870', '192080', '293490', '225570',
      '112040', '078340', '095660', '069080', '101730',
    ],
    '음악·엔터테인먼트': ['352820', '041510', '035900', '122870'],
    '팬덤 플랫폼': ['376300'],
    '영상 제작·IP': ['253450', '035760'],
    '웹툰·출판': [],
    '방송·스트리밍': ['067160'],
    '극장·배급': ['079160'],
    '광고·마케팅': ['030000', '214320'],
    교육서비스: ['215200'],
  },
  travel: {
    항공운송: ['003490', '020560', '089590', '272450'],
    '여행·예약': ['039130'],
    '호텔·리조트': ['025980'],
    카지노: ['035250', '032350', '034230', '114090'],
    '레저·스포츠': [],
    면세: ['008770'],
  },
};

const NEEDS_REVIEW = [
  ['035760', 'kcontent', '영상 제작·IP', 'CJ ENM — 영상 제작·IP vs 방송·스트리밍 경계'],
  ['008770', 'travel', '면세', '호텔신라 — 면세 vs 호텔·리조트 경계'],
  ['020560', 'travel', '항공운송', '아시아나항공 — 통합 시 상장상태 모니터링'],
  ['031430', 'kconsume', '유통', '신세계인터내셔날 — 유통 vs 패션 브랜드 경계'],
];

const TAGS = {
  '086280': ['종합물류', '자동차', 'CKD'],
  '000120': ['택배', '풀필먼트', '종합물류'],
  '293490': ['게임', '퍼블리싱'],
  '008770': ['면세', '호텔'],
  '035760': ['영상', '방송', 'IP'],
  '031430': ['유통', '패션'],
  '003490': ['FSC', '여객'],
  '020560': ['FSC', '여객'],
  '089590': ['LCC', '여객'],
  '272450': ['LCC', '여객'],
};

function buildSectorMap(sectorKey, groupMap) {
  const allowed = CONSUMER_04F[sectorKey].chains;
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

if (!overrides.shipping) overrides.shipping = {};
overrides.shipping[pad('086280')] = '자동차·특수화물 운송';
overrides.shipping[pad('000120')] = '종합물류';
// Keep prior shipping four
overrides.shipping[pad('011200')] = overrides.shipping[pad('011200')] || '컨테이너 해운';
overrides.shipping[pad('003280')] = overrides.shipping[pad('003280')] || '컨테이너 해운';
overrides.shipping[pad('028670')] = overrides.shipping[pad('028670')] || '벌크 해운';
overrides.shipping[pad('005880')] = overrides.shipping[pad('005880')] || '벌크 해운';

delete overrides.kconsume?.[pad('086280')];
delete overrides.kconsume?.[pad('000120')];
// SK네트웍스 must NOT auto-enter 종합상사
delete overrides.kconsume?.[pad('001740')];

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
  const t = '293490';
  fields[t] = fields[t] || {};
  fields[t].semType = '게임 개발·퍼블리싱';
  fields[t].semTypeEn = 'Game development & publishing';
  fields[t].products = '게임 개발·퍼블리싱';
  fields[t].productsEn = 'Game development and publishing';
  const ind = ensureIndustry(t, 'kcontent');
  ind.chain = '게임';
  ind.semType = fields[t].semType;
  ind.products = fields[t].products;
  ind.semTypeEn = fields[t].semTypeEn;
  ind.productsEn = fields[t].productsEn;
}
{
  const t = '086280';
  fields[t] = fields[t] || {};
  fields[t].semType = '자동차·특수화물 운송';
  fields[t].semTypeEn = 'Auto & special cargo transport';
  fields[t].products = '자동차·CKD·특수화물 운송 (종합물류)';
  fields[t].productsEn = 'Auto, CKD and special-cargo transport (integrated logistics)';
  ensureIndustry(t, 'shipping').chain = '자동차·특수화물 운송';
}
{
  const t = '000120';
  fields[t] = fields[t] || {};
  fields[t].semType = '종합물류';
  fields[t].semTypeEn = 'Integrated logistics';
  fields[t].products = '종합물류·택배·풀필먼트·국제물류';
  fields[t].productsEn = 'Integrated logistics, parcel, fulfillment and intl logistics';
  ensureIndustry(t, 'shipping').chain = '종합물류';
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

fields._policy = fields._policy || {};
fields._policy.travel_shipping_air_cargo =
  '여객항공사 화물사업만으로 shipping 자동이동 금지. 항공 여객·화물 분할 중복집계 금지. shipping에 항공화물 그룹 신설 금지(분류 공백).';
fields._policy.sk_networks_trading =
  '001740 SK네트웍스 — 화학 제외·분류공백 유지. kconsume 종합상사 자동편입 금지.';

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
upsertExclusive('086280', 'shipping', '현대글로비스 (kconsume→shipping 자동차·특수화물 운송)');
upsertExclusive('000120', 'shipping', 'CJ대한통운 (kconsume→shipping 종합물류)');
// 001740 SK네트웍스: 종합상사 자동편입 금지. 화학 잠정 유지(industry_04b needs_review) — exclusive 재지정하지 않음.
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

removeAddition('kconsume/cp_list_kconsume_additions.json', '086280');
removeAddition('kconsume/cp_list_kconsume_additions.json', '000120');

upsertAddition('shipping/cp_list_shipping_additions.json', {
  ticker: '086280',
  name: '현대글로비스',
  nameEn: 'Hyundai Glovis',
  chain: '자동차·특수화물 운송',
  semType: '자동차·특수화물 운송',
  semTypeEn: 'Auto & special cargo transport',
  products: '자동차·CKD·특수화물 운송 (종합물류)',
  productsEn: 'Auto, CKD and special-cargo transport (integrated logistics)',
  partners: [],
  subSector: '자동차·특수화물 운송',
  level: 'core',
});
upsertAddition('shipping/cp_list_shipping_additions.json', {
  ticker: '000120',
  name: 'CJ대한통운',
  nameEn: 'CJ Logistics',
  chain: '종합물류',
  semType: '종합물류',
  semTypeEn: 'Integrated logistics',
  products: '종합물류·택배·풀필먼트·국제물류',
  productsEn: 'Integrated logistics, parcel, fulfillment and intl logistics',
  partners: [],
  subSector: '종합물류',
  level: 'core',
});
upsertAddition('kcontent/cp_list_kcontent_additions.json', {
  ticker: '293490',
  name: '카카오게임즈',
  nameEn: 'Kakao Games',
  chain: '게임',
  semType: '게임 개발·퍼블리싱',
  semTypeEn: 'Game development & publishing',
  products: '게임 개발·퍼블리싱',
  productsEn: 'Game development and publishing',
  partners: [],
  subSector: '게임',
  level: 'core',
});

const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  join(reportDir, 'consumer_04f_reclass_review.csv'),
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
  join(reportDir, 'consumer_04f_taxonomy_gaps.csv'),
  [
    'ticker,name,status,notes',
    '001740,"SK네트웍스",taxonomy_gap,"종합상사 자동편입 금지 — 화학 제외·분류공백 유지"',
    ',"여객항공 화물",taxonomy_gap,"shipping 항공화물 그룹 신설 금지 — 여객항공사 화물사업만으로 shipping 이동 금지"',
  ].join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(
  join(reportDir, 'consumer_04f_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: Object.fromEntries(Object.keys(MAPS).map((k) => [k, overrides[k]])),
      moves: [
        { ticker: '086280', from: 'kconsume', to: 'shipping', chain: '자동차·특수화물 운송' },
        { ticker: '000120', from: 'kconsume', to: 'shipping', chain: '종합물류' },
      ],
      needs_review: NEEDS_REVIEW,
      tags: TAGS,
      expected_on_map: { kconsume: 35, kcontent: 25, travel: 11, shipping: 6 },
      note: 'kcontent 스펙 26은 현재 유니버스 25(맵 멤버)와 일치; 웹툰·출판·레저·스포츠 빈 그룹 유지',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

const NAMES = {
  '086280': '현대글로비스',
  '000120': 'CJ대한통운',
  '293490': '카카오게임즈',
  '035760': 'CJ ENM',
  '008770': '호텔신라',
  '020560': '아시아나항공',
  '031430': '신세계인터내셔날',
  '001740': 'SK네트웍스',
};
const reviewSet = new Set(NEEDS_REVIEW.map(([t]) => pad(t)));
const mappingRows = ['sector,ticker,name,old_group,new_group,evidence,needs_review,status'];
for (const [sector, groupMap] of Object.entries(MAPS)) {
  for (const [chain, tickers] of Object.entries(groupMap)) {
    for (const t of tickers) {
      const ticker = pad(t);
      const name = NAMES[ticker] || fields[ticker]?.name || '';
      const nr = reviewSet.has(ticker);
      mappingRows.push(
        `${sector},${ticker},"${name}","","${chain}","chain_overrides §0-4F",${nr},${nr ? 'needs_review' : 'mapped'}`,
      );
    }
  }
}
mappingRows.push(
  'shipping,086280,"현대글로비스","kconsume/물류·상사","자동차·특수화물 운송","물류 교차이동",false,mapped',
);
mappingRows.push(
  'shipping,000120,"CJ대한통운","kconsume/물류·상사","종합물류","물류 교차이동",false,mapped',
);
mappingRows.push(
  'taxonomy_gap,001740,"SK네트웍스","chemical/화학 유통(잠정)","","종합상사 자동편입 금지·분류공백",true,taxonomy_gap',
);
fs.writeFileSync(join(reportDir, 'consumer_04f_mapping_table.csv'), mappingRows.join('\n') + '\n', 'utf8');
console.log('OK docs/reports/consumer_04f_*');
