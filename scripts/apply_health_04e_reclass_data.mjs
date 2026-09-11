/**
 * §0-4 batch E data: bio/medtech/cosmetics overrides, bio_data rewrite, moves, CSVs.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BIO_CHAINS, BIO_COLORS, BIO_SECTOR_IDS, HEALTH_04E } from '../lib/health_04e_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pad(t) {
  const s = String(t || '');
  if (/[A-Za-z]/.test(s)) return s.toUpperCase().length === 6 ? s.toUpperCase() : s;
  return s.padStart(6, '0');
}

const MAPS = {
  bio: {
    '종합 제약': [
      '128940', '000100', '000250', '068760', '069620', '195940', '086450', '185750', '003850',
      '317450', '001060', '019170', '249420', '003000', '170900', '009420', '009290', '041960',
    ],
    신약개발: [
      '196170', '326030', '028300', '298380', '087010', '141080', '310210', '347850', '226950',
      '140410', '007390', '0009K0', '950160', '039200', '475830', '115180', '476830', '456160',
      '048410', '052020', '358570', '174900', '476060', '397030', '372320', '389470', '078160',
      '215600', '199800',
    ],
    바이오시밀러: ['068270', '950210'],
    '백신·혈액제제': ['302440', '006280', '206650'],
    'CDMO·CMO': ['207940', '237690'],
    '원료의약품·생산소재': ['005690'],
    '연구도구·서비스': ['445680', '468530'],
    '제약·바이오 지주': ['0126Z0', '008930', '003090', '000640', '005250', '084110', '085660'],
  },
  medtech: {
    체외진단: ['096530', '137310', '377740', '067630'],
    '영상진단 장비': [],
    '의료AI·소프트웨어': ['328130'],
    '생체측정·모니터링': ['041830', '458870', '099190'],
    치과: ['145720'],
    '수술·치료 장비': ['491000', '060280'],
    '재활·보조기기': [],
    '의료소모품·재생재료': ['340570', '376900', '290650', '0120G0'],
    '연구·분석 장비': ['475960'],
  },
  cosmetics: {
    '화장품 브랜드': [
      '278470', '090430', '051900', '483650', '018290', '092730', '018250', '002790',
    ],
    '화장품 ODM·OEM': ['161890', '192820', '241710'],
    '원료·소재': [],
    '용기·부자재': ['251970'],
    '유통·채널': ['257720'],
    '홈뷰티 기기': [],
    '미용 의료장비': ['214150', '336570'],
    '에스테틱 의약품·소모품': ['145020', '214450', '214370', '086900'],
  },
};

/** Spec universe below mcap floor — overrides not forced onto maps. */
const MCAP_FLOOR_SKIP = [
  { ticker: '228760', name: '지노믹트리', sector: 'medtech', chain: '체외진단', reason: '매핑표 체외진단이나 시총 3천억 미만' },
  { ticker: '389650', name: '넥스트바이오메디컬', sector: 'medtech', chain: '의료소모품·재생재료', reason: '매핑표 의료소모품·재생재료이나 시총 3천억 미만' },
  { ticker: '003350', name: '한국화장품제조', sector: 'cosmetics', chain: '화장품 브랜드', reason: '매핑표 화장품 브랜드이나 시총 3천억 미만' },
  { ticker: '078520', name: '에이블씨엔씨', sector: 'cosmetics', chain: '화장품 브랜드', reason: '매핑표 화장품 브랜드이나 시총 3천억 미만' },
  { ticker: '352480', name: '씨앤씨인터내셔널', sector: 'cosmetics', chain: '화장품 ODM·OEM', reason: '매핑표 ODM·OEM이나 시총 3천억 미만' },
];

const NEEDS_REVIEW = [
  ['028300', 'bio', '신약개발', 'HLB — 복합 파이프라인, 신약개발 잠정'],
  ['082270', 'bio', '신약개발', '젬백스 — 신약개발 잠정'],
  ['199800', 'bio', '신약개발', '툴젠 — 유전자가위 플랫폼 vs 신약개발 경계'],
  ['468530', 'bio', '연구도구·서비스', '프로티나 — 연구도구·서비스 잠정'],
  ['085660', 'bio', '제약·바이오 지주', '차바이오텍 — 지주 vs 세포치료 사업 비중'],
  ['041960', 'bio', '종합 제약', '코미팜 — 동물약품·바이오, 종합 제약 잠정'],
  ['214370', 'cosmetics', '에스테틱 의약품·소모품', '케어젠 — 원료 vs 에스테틱 경계'],
  ['067630', 'medtech', '체외진단', 'HLB생명과학 — 체외진단 잠정(복합 의료기기)'],
  ['290650', 'medtech', '의료소모품·재생재료', '엘앤씨바이오 — bio→medtech 재생재료 이동, 적합성 모니터링'],
  ['0120G0', 'medtech', '의료소모품·재생재료', '삼양바이오팜 — bio→medtech 검토 잠정(제약 성격 잔존)'],
];

const TAXONOMY_GAPS = [
  ...MCAP_FLOOR_SKIP.map((g) => ({
    ticker: g.ticker,
    name: g.name,
    from: g.sector,
    status: 'mcap_floor_skip',
    reason: g.reason,
  })),
];

/** Modality / disease tags derived from prior modality chains + known products. */
const TAGS = {
  '000100': ['저분자', '항암'],
  '000250': ['펩타이드', '비만·대사'],
  '087010': ['펩타이드', '비만·대사', '약물전달'],
  '128940': ['펩타이드', '비만·대사'],
  '347850': ['펩타이드', '비만·대사'],
  '196170': ['항체', 'ADC'],
  '298380': ['항체', 'ADC'],
  '141080': ['항체', 'ADC'],
  '0009K0': ['항체', 'ADC', '항암'],
  '475830': ['항체', 'ADC', '항암'],
  '397030': ['항체'],
  '028300': ['저분자', '항암'],
  '310210': ['저분자', '항암'],
  '048410': ['저분자', '감염', '항암'],
  '052020': ['항체', '항암'],
  '358570': ['항체', '자가면역'],
  '476060': ['항암'],
  '215600': ['유전자치료', '항암'],
  '078160': ['세포치료'],
  '085660': ['세포치료'],
  '950160': ['세포치료', '유전자치료'],
  '372320': ['세포치료', '항암'],
  '199800': ['유전자치료'],
  '226950': ['RNA'],
  '476830': ['RNA'],
  '389470': ['약물전달'],
  '456160': ['약물전달'],
  '468530': ['연구도구'],
  '445680': ['연구도구'],
  '086900': ['톡신', '필러', '에스테틱'],
  '145020': ['톡신', '필러'],
  '214450': ['리쥬란', '에스테틱'],
  '336570': ['에너지기반', '미용장비'],
  '214150': ['HIFU', '미용장비'],
  '290650': ['재생재료', '인체조직'],
  '0120G0': ['의료소재', '제약'],
};

function buildSectorMap(sectorKey, groupMap) {
  const allowed = HEALTH_04E[sectorKey].chains;
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
delete overrides.bio?.['086900'];
delete overrides.bio?.['290650'];
delete overrides.bio?.['0120G0'];
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');

// Rewrite bio_data_from_jsx.json around new business-model sectors
const oldBio = JSON.parse(fs.readFileSync(join(ROOT, 'bio/bio_data_from_jsx.json'), 'utf8'));
const noteByTicker = new Map();
const nameByTicker = new Map();
const globalsPool = [];
for (const sec of oldBio) {
  for (const d of sec.domestic || []) {
    noteByTicker.set(pad(d.ticker), d.note || '');
    nameByTicker.set(pad(d.ticker), d.name);
  }
  for (const g of sec.global || []) globalsPool.push(g);
}
const adds = fs.existsSync(join(ROOT, 'bio/cp_list_bio_additions.json'))
  ? JSON.parse(fs.readFileSync(join(ROOT, 'bio/cp_list_bio_additions.json'), 'utf8'))
  : [];
for (const a of adds) {
  const t = pad(a.ticker);
  if (!nameByTicker.has(t)) nameByTicker.set(t, a.name);
  if (!noteByTicker.has(t) && (a.products || a.subSector)) {
    noteByTicker.set(t, a.products || a.subSector);
  }
}

const NAMES = {
  '389470': '인벤티지랩',
  '078160': '메디포스트',
  '215600': '신라젠',
  '206650': '유바이오로직스',
  '468530': '프로티나',
  '084110': '휴온스글로벌',
  '199800': '툴젠',
  '0009K0': '에임드바이오',
  '0126Z0': '삼성에피스홀딩스',
  '372320': '큐로셀',
};

const newBioSectors = BIO_CHAINS.map((chain, idx) => {
  const tickers = MAPS.bio[chain] || [];
  return {
    id: BIO_SECTOR_IDS[chain],
    sector: chain,
    sectorEn: HEALTH_04E.bio.labelEn[chain],
    icon: ['💊', '🔬', '🧬', '💉', '🏭', '🧪', '🧰', '🏛️'][idx],
    color: BIO_COLORS[chain],
    bg: `${BIO_COLORS[chain]}14`,
    description: HEALTH_04E.bio.labelEn[chain],
    domestic: tickers.map((t) => {
      const ticker = pad(t);
      return {
        name: NAMES[ticker] || nameByTicker.get(ticker) || ticker,
        ticker,
        note: noteByTicker.get(ticker) || '',
        mcap: '—',
      };
    }),
    global: idx < 3 ? globalsPool.slice(idx * 3, idx * 3 + 3) : [],
  };
});
fs.writeFileSync(join(ROOT, 'bio/bio_data_from_jsx.json'), JSON.stringify(newBioSectors, null, 2) + '\n', 'utf8');
console.log('OK bio_data_from_jsx.json', newBioSectors.reduce((n, s) => n + s.domestic.length, 0));

// Prune bio additions that moved away; keep others synced to new chains
const bioAddPath = join(ROOT, 'bio/cp_list_bio_additions.json');
const bioAdds = adds
  .filter((a) => !['086900', '290650', '0120G0'].includes(pad(a.ticker)))
  .map((a) => {
    const t = pad(a.ticker);
    const chain = overrides.bio[t];
    if (!chain) return a;
    return {
      ...a,
      chain,
      sectorId: BIO_SECTOR_IDS[chain],
      subSector: chain,
    };
  });
fs.writeFileSync(bioAddPath, JSON.stringify(bioAdds, null, 2) + '\n', 'utf8');

const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
function ensureIndustry(ticker, industry) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry[industry]) fields[ticker].byIndustry[industry] = {};
  return fields[ticker].byIndustry[industry];
}

{
  const t = '372320';
  fields[t] = fields[t] || {};
  fields[t].name = '큐로셀';
  fields[t].nameEn = 'Curocell';
  fields[t].semType = '신약개발·세포치료';
  fields[t].semTypeEn = 'Drug discovery & cell therapy';
  fields[t].products = 'CAR-T·세포치료 파이프라인';
  fields[t].productsEn = 'CAR-T and cell therapy pipeline';
  ensureIndustry(t, 'bio').chain = '신약개발';
}
{
  const t = '214450';
  fields[t] = fields[t] || {};
  fields[t].semType = '에스테틱 의약품·소모품';
  fields[t].semTypeEn = 'Aesthetic drugs & consumables';
  fields[t].products = '리쥬란 등 에스테틱 의약품·소모품';
  fields[t].productsEn = 'Rejuran and aesthetic pharmaceutical consumables';
  ensureIndustry(t, 'cosmetics').chain = '에스테틱 의약품·소모품';
}
{
  const t = '336570';
  fields[t] = fields[t] || {};
  fields[t].semType = '미용 의료장비';
  fields[t].semTypeEn = 'Aesthetic medical devices';
  fields[t].products = '에너지 기반 미용 의료장비';
  fields[t].productsEn = 'Energy-based aesthetic medical devices';
  ensureIndustry(t, 'cosmetics').chain = '미용 의료장비';
}
{
  const t = '086900';
  fields[t] = fields[t] || {};
  fields[t].name = '메디톡스';
  fields[t].nameEn = 'Medytox';
  fields[t].semType = '에스테틱 의약품·소모품';
  fields[t].semTypeEn = 'Aesthetic drugs & consumables';
  fields[t].products = '보툴리눔 톡신·필러';
  fields[t].productsEn = 'Botulinum toxin and fillers';
  ensureIndustry(t, 'cosmetics').chain = '에스테틱 의약품·소모품';
}
{
  const t = '290650';
  fields[t] = fields[t] || {};
  fields[t].semType = '의료소모품·재생재료';
  fields[t].semTypeEn = 'Consumables & regenerative materials';
  fields[t].products = '인체조직·재생의료 소재';
  fields[t].productsEn = 'Human tissue and regenerative materials';
  ensureIndustry(t, 'medtech').chain = '의료소모품·재생재료';
}
{
  const t = '0120G0';
  fields[t] = fields[t] || {};
  fields[t].semType = '의료소모품·재생재료';
  fields[t].semTypeEn = 'Consumables & regenerative materials';
  fields[t].products = '의료·바이오 소재·전문의약품 (재생재료 관계)';
  fields[t].productsEn = 'Medical/biotech materials and specialty pharma';
  ensureIndustry(t, 'medtech').chain = '의료소모품·재생재료';
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
  const ind = ensureIndustry(pad(g.ticker), g.sector);
  ind.chain = g.chain;
  ind.mcap_floor_skip = true;
  ind.review_evidence = g.reason;
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
upsertExclusive('086900', 'cosmetics', '메디톡스 (bio→cosmetics 에스테틱 의약품·소모품)');
upsertExclusive('290650', 'medtech', '엘앤씨바이오 (bio→medtech 의료소모품·재생재료)');
upsertExclusive('0120G0', 'medtech', '삼양바이오팜 (bio→medtech 의료소모품·재생재료)');
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

removeAddition('bio/cp_list_bio_additions.json', '086900');
removeAddition('bio/cp_list_bio_additions.json', '290650');
removeAddition('bio/cp_list_bio_additions.json', '0120G0');

upsertAddition('cosmetics/cp_list_cosmetics_additions.json', {
  ticker: '086900',
  name: '메디톡스',
  nameEn: 'Medytox',
  chain: '에스테틱 의약품·소모품',
  semType: '에스테틱 의약품·소모품',
  semTypeEn: 'Aesthetic drugs & consumables',
  products: '보툴리눔 톡신·필러',
  productsEn: 'Botulinum toxin and fillers',
  partners: [],
  subSector: '에스테틱 의약품·소모품',
  level: 'core',
});
upsertAddition('medtech/cp_list_medtech_additions.json', {
  ticker: '290650',
  name: '엘앤씨바이오',
  nameEn: 'L&C Bio',
  chain: '의료소모품·재생재료',
  semType: '의료소모품·재생재료',
  semTypeEn: 'Consumables & regenerative materials',
  products: '인체조직·재생의료 소재',
  productsEn: 'Human tissue and regenerative materials',
  partners: [],
  subSector: '의료소모품·재생재료',
  level: 'core',
});
upsertAddition('medtech/cp_list_medtech_additions.json', {
  ticker: '0120G0',
  name: '삼양바이오팜',
  nameEn: 'Samyang Biopharm',
  chain: '의료소모품·재생재료',
  semType: '의료소모품·재생재료',
  semTypeEn: 'Consumables & regenerative materials',
  products: '의료·바이오 소재·전문의약품 (재생재료 관계)',
  productsEn: 'Medical/biotech materials and specialty pharma',
  partners: [],
  subSector: '의료소모품·재생재료',
  level: 'core',
});

const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  join(reportDir, 'health_04e_reclass_review.csv'),
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
  join(reportDir, 'health_04e_taxonomy_gaps.csv'),
  [
    'ticker,name,from_sector,status,notes',
    ...TAXONOMY_GAPS.map(
      (g) =>
        `${pad(g.ticker)},"${g.name}",${g.from},${g.status},"${g.reason.replace(/"/g, '""')}"`,
    ),
  ].join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(
  join(reportDir, 'health_04e_reclass_mapping.json'),
  JSON.stringify(
    {
      maps: Object.fromEntries(Object.keys(MAPS).map((k) => [k, overrides[k]])),
      moves: [
        { ticker: '086900', from: 'bio', to: 'cosmetics', chain: '에스테틱 의약품·소모품' },
        { ticker: '290650', from: 'bio', to: 'medtech', chain: '의료소모품·재생재료' },
        { ticker: '0120G0', from: 'bio', to: 'medtech', chain: '의료소모품·재생재료' },
      ],
      needs_review: NEEDS_REVIEW,
      mcap_floor_skip: MCAP_FLOOR_SKIP,
      tags: TAGS,
      expected_on_map: { bio: 65, medtech: 16, cosmetics: 19 },
      expected_spec_note:
        'cosmetics/medtech spec counts include below-floor tickers recorded as mcap_floor_skip',
      name_resolutions: {
        인벤티지랩: '389470',
        메디포스트: '078160',
        신라젠: '215600',
        유바이오로직스: '206650',
        프로티나: '468530',
        휴온스글로벌: '084110',
        툴젠: '199800',
        '0009K0': '에임드바이오',
        '0126Z0': '삼성에피스홀딩스',
        '0120G0': '삼양바이오팜',
      },
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('OK docs/reports/health_04e_*');
