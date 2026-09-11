/**
 * needs_review final closure: moves C + group fixes B + new groups + clear flags.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

const MOVES = [
  {
    ticker: '082270',
    name: '젬백스',
    from: 'bio',
    to: 'semi',
    chain: '팹 인프라·지원설비',
    evidence: '반도체 케미컬필터 매출 95.5%',
    tags: ['신약개발', 'GV1001'],
    semType: '팹 케미컬필터·유틸리티',
    semTypeEn: 'Fab chemical filters & utilities',
    products: '반도체 케미컬필터·팹 유틸리티 (주력)',
    productsEn: 'Semiconductor chemical filters and fab utilities (core)',
  },
  {
    ticker: '001570',
    name: '금양',
    from: 'battery',
    to: 'chemical',
    chain: '정밀·특수화학',
    evidence: '발포제 매출 100%',
    tags: ['2차전지 셀', '개발단계'],
    semType: '발포제·정밀화학',
    semTypeEn: 'Blowing agents & specialty chemicals',
    products: '발포제 등 정밀·특수화학 (주력)',
    productsEn: 'Blowing agents and specialty chemicals (core)',
  },
  {
    ticker: '044490',
    name: '태웅',
    from: 'ship',
    to: 'renewable',
    chain: '구조물·보조설비',
    evidence: '해상풍력 플랜지 매출 44%',
    tags: ['조선', '산업기계'],
    semType: '해상풍력 플랜지·단조',
    semTypeEn: 'Offshore wind flanges & forgings',
    products: '해상풍력 타워 플랜지·단조 (주력)',
    productsEn: 'Offshore wind tower flanges and forgings (core)',
  },
];

const GROUP_FIXES = [
  { ticker: '004800', sector: 'holdings', chain: '복합사업', name: '효성', note: '소재·산업재→복합사업' },
  { ticker: '000070', sector: 'holdings', chain: '복합사업', name: '삼양홀딩스', note: '에너지·화학→복합사업' },
  { ticker: '024720', sector: 'holdings', chain: '복합사업', name: '콜마홀딩스', note: '헬스케어 경계→복합사업 확정' },
  {
    ticker: '035760',
    sector: 'kcontent',
    chain: '방송·스트리밍',
    name: 'CJ ENM',
    note: '영상 제작·IP→방송·스트리밍',
    tags: ['커머스', '음악', '영상'],
  },
];

const HOLDINGS_FINANCE = [
  { ticker: '012030', name: 'DB', form: '사업형' },
  { ticker: '023590', name: '다우기술', form: '사업형' },
  { ticker: '032190', name: '다우데이타', form: '사업형' },
];

const PACKAGING = [
  {
    ticker: '014820',
    name: '동원시스템즈',
    nameEn: 'Dongwon Systems',
    semType: '포장재·알루미늄',
    semTypeEn: 'Packaging & aluminium',
    products: 'CAN·알루미늄 포장재',
    productsEn: 'Cans and aluminium packaging',
    tags: ['2차전지 소재'],
  },
  {
    ticker: '008730',
    name: '율촌화학',
    nameEn: 'Yulchon Chemical',
    semType: '포장필름',
    semTypeEn: 'Packaging films',
    products: 'BOPP·CPP·포장필름',
    productsEn: 'BOPP, CPP and packaging films',
    tags: ['2차전지 소재'],
  },
];

const KEEP_REVIEW = new Set(); // needs_review residual cleared (005090 → powergrid)
const KEEP_GAP = [
  {
    ticker: '001740',
    name: 'SK네트웍스',
    status: 'taxonomy_gap',
    notes: '화학 잠정 유지·종합상사/타지도 자동편입 금지. 그룹 신설 대상 아님',
  },
  {
    ticker: '126560',
    name: '현대퓨처넷',
    status: 'taxonomy_gap',
    notes: 'telecom 분류공백·미수록 유지. 타지도 자동편입 금지. 그룹 신설 대상 아님',
  },
];

// --- chain_overrides ---
const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

for (const m of MOVES) {
  if (overrides[m.from]) delete overrides[m.from][pad(m.ticker)];
  if (!overrides[m.to]) overrides[m.to] = {};
  overrides[m.to][pad(m.ticker)] = m.chain;
}
for (const g of GROUP_FIXES) {
  if (!overrides[g.sector]) overrides[g.sector] = {};
  overrides[g.sector][pad(g.ticker)] = g.chain;
}
for (const h of HOLDINGS_FINANCE) {
  overrides.holdings[pad(h.ticker)] = '금융';
}
if (!overrides.chemical) overrides.chemical = {};
for (const p of PACKAGING) {
  overrides.chemical[pad(p.ticker)] = '포장재';
}
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides moves/fixes/new groups');

// --- field overrides ---
const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

function ensureIndustry(ticker, industry) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry[industry]) fields[ticker].byIndustry[industry] = {};
  return fields[ticker].byIndustry[industry];
}

function mergeTags(ticker, tags) {
  if (!fields[ticker]) fields[ticker] = {};
  const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
  for (const tag of tags || []) if (tag && !existing.includes(tag)) existing.push(tag);
  fields[ticker].tags = existing;
}

for (const m of MOVES) {
  const t = pad(m.ticker);
  fields[t] = fields[t] || {};
  fields[t].name = fields[t].name || m.name;
  fields[t].semType = m.semType;
  fields[t].semTypeEn = m.semTypeEn;
  fields[t].products = m.products;
  fields[t].productsEn = m.productsEn;
  if (fields[t].byIndustry?.[m.from]) {
    fields[t].byIndustry[m.from].needs_review = false;
    delete fields[t].byIndustry[m.from].taxonomy_gap;
  }
  const ind = ensureIndustry(t, m.to);
  ind.chain = m.chain;
  ind.needs_review = false;
  ind.evidence = m.evidence;
  ind.semType = m.semType;
  ind.products = m.products;
  mergeTags(t, m.tags);
}

for (const g of GROUP_FIXES) {
  const t = pad(g.ticker);
  const ind = ensureIndustry(t, g.sector);
  ind.chain = g.chain;
  ind.needs_review = false;
  ind.evidence = g.note;
  if (g.tags) mergeTags(t, g.tags);
  if (g.ticker === '035760') {
    fields[t].semType = '방송·스트리밍·콘텐츠';
    fields[t].semTypeEn = 'Broadcast, streaming & content';
    fields[t].products = '방송·스트리밍·커머스·음악·영상 IP';
    fields[t].productsEn = 'Broadcasting, streaming, commerce, music and video IP';
    ind.semType = fields[t].semType;
    ind.products = fields[t].products;
  }
}

for (const h of HOLDINGS_FINANCE) {
  const t = pad(h.ticker);
  const ind = ensureIndustry(t, 'holdings');
  ind.chain = '금융';
  ind.needs_review = false;
  ind.taxonomy_gap = false;
  ind.holding_form = h.form;
  ind.evidence = '금융 자회사 중심 지주 — holdings 금융 그룹 신설 수용';
  mergeTags(t, ['금융', h.form]);
}

for (const p of PACKAGING) {
  const t = pad(p.ticker);
  fields[t] = fields[t] || {};
  fields[t].name = p.name;
  fields[t].nameEn = p.nameEn;
  fields[t].semType = p.semType;
  fields[t].semTypeEn = p.semTypeEn;
  fields[t].products = p.products;
  fields[t].productsEn = p.productsEn;
  const ind = ensureIndustry(t, 'chemical');
  ind.chain = '포장재';
  ind.needs_review = false;
  ind.semType = p.semType;
  ind.products = p.products;
  mergeTags(t, p.tags);
}

// Clear all needs_review (KEEP_REVIEW empty after 005090 move)
let cleared = 0;
for (const [ticker, row] of Object.entries(fields)) {
  if (ticker.startsWith('_') || !row || typeof row !== 'object') continue;
  if (row.needs_review === true && !KEEP_REVIEW.has(pad(ticker))) {
    row.needs_review = false;
    cleared++;
  }
  for (const [ind, by] of Object.entries(row.byIndustry || {})) {
    if (!by || typeof by !== 'object') continue;
    if (by.needs_review === true && !KEEP_REVIEW.has(pad(ticker))) {
      by.needs_review = false;
      cleared++;
    }
  }
}
// SK networks stays provisional on chemical
{
  const ind = ensureIndustry('001740', 'chemical');
  ind.needs_review = false;
  ind.taxonomy_gap = true;
  ind.review_evidence = '종합상사·타지도 자동편입 금지. 화학 잠정 유지(미확정)';
}

fields._policy = fields._policy || {};
fields._policy.needs_review_closure =
  '2026-09 needs_review 마감: 이동4(含005090→powergrid)·정정4·신설2. needs_review 잔여 0. 공백=001740·126560.';

fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides cleared=', cleared);

// --- exclusives ---
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
upsertExclusive('082270', 'semi', '젬백스 (bio→semi 팹 인프라·지원설비, 케미컬필터 95.5%)');
upsertExclusive('001570', 'chemical', '금양 (battery→chemical 정밀·특수화학, 발포제 100%)');
upsertExclusive('044490', 'renewable', '태웅 (ship→renewable 구조물·보조설비, 해상풍력 플랜지 44%)');
upsertExclusive('014820', 'chemical', '동원시스템즈 (포장재 복원)');
upsertExclusive('008730', 'chemical', '율촌화학 (포장재 복원)');
fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
console.log('OK sector_exclusive');

// --- additions ---
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

removeAddition('battery/cp_list_battery_additions.json', '001570');
removeAddition('ship/cp_list_ship_additions.json', '044490');

upsertAddition('semiconductor/cp_list_semi_additions.json', {
  ticker: '082270',
  name: '젬백스',
  nameEn: 'GemVax',
  chain: '팹 인프라·지원설비',
  semType: '팹 케미컬필터·유틸리티',
  semTypeEn: 'Fab chemical filters & utilities',
  products: '반도체 케미컬필터·팹 유틸리티 (주력)',
  productsEn: 'Semiconductor chemical filters and fab utilities (core)',
  partners: [],
  subSector: '팹 인프라·지원설비',
  level: 'core',
});
upsertAddition('chemical/cp_list_chemical_additions.json', {
  ticker: '001570',
  name: '금양',
  nameEn: 'Kumyang',
  chain: '정밀·특수화학',
  semType: '발포제·정밀화학',
  semTypeEn: 'Blowing agents & specialty chemicals',
  products: '발포제 등 정밀·특수화학 (주력)',
  productsEn: 'Blowing agents and specialty chemicals (core)',
  partners: [],
  subSector: '정밀·특수화학',
  level: 'core',
});
for (const p of PACKAGING) {
  upsertAddition('chemical/cp_list_chemical_additions.json', {
    ticker: p.ticker,
    name: p.name,
    nameEn: p.nameEn,
    chain: '포장재',
    semType: p.semType,
    semTypeEn: p.semTypeEn,
    products: p.products,
    productsEn: p.productsEn,
    partners: ['toray'],
    subSector: '포장재',
    level: 'core',
  });
}
upsertAddition('renewable/cp_list_renewable_additions.json', {
  ticker: '044490',
  name: '태웅',
  nameEn: 'Taewoong',
  chain: '구조물·보조설비',
  semType: '해상풍력 플랜지·단조',
  semTypeEn: 'Offshore wind flanges & forgings',
  products: '해상풍력 타워 플랜지·단조 (주력)',
  productsEn: 'Offshore wind tower flanges and forgings (core)',
  partners: [],
  subSector: '구조물·보조설비',
  level: 'core',
});

// --- bio_data remove 082270 ---
const bioDataPath = join(ROOT, 'bio/bio_data_from_jsx.json');
if (fs.existsSync(bioDataPath)) {
  const bio = JSON.parse(fs.readFileSync(bioDataPath, 'utf8'));
  if (Array.isArray(bio)) {
    for (const sector of bio) {
      if (Array.isArray(sector.domestic)) {
        sector.domestic = sector.domestic.filter((c) => pad(c.ticker) !== '082270');
      }
    }
    fs.writeFileSync(bioDataPath, JSON.stringify(bio, null, 2) + '\n', 'utf8');
  }
  console.log('OK bio_data_from_jsx stripped 082270');
}

// health MAPS list in apply script is historical; override file is source of truth for rebuild

const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });

const closureRows = [
  'kind,ticker,name,from,to,group,evidence,status',
  ...MOVES.map(
    (m) =>
      `move,${m.ticker},${m.name},${m.from},${m.to},${m.chain},"${m.evidence}",confirmed`,
  ),
  ...GROUP_FIXES.map(
    (g) =>
      `group_fix,${g.ticker},${g.name},${g.sector},${g.sector},${g.chain},"${g.note}",confirmed`,
  ),
  ...HOLDINGS_FINANCE.map(
    (h) =>
      `new_group,${h.ticker},${h.name},holdings/복합사업,holdings,금융,"금융 자회사 중심 지주 수용",confirmed`,
  ),
  ...PACKAGING.map(
    (p) =>
      `new_group,${p.ticker},${p.name},(미수록),chemical,포장재,"배치B 포장재 공백 복원",confirmed`,
  ),
  'new_group_def,,holdings,,,금융,"#5C6BC0 9번째",created',
  'new_group_def,,chemical,,,포장재,"#90A4AE 화학 유통 뒤 10번째",created',
];
fs.writeFileSync(join(reportDir, 'needs_review_closure_table.csv'), closureRows.join('\n') + '\n', 'utf8');

fs.writeFileSync(
  join(reportDir, 'needs_review_residual.csv'),
  [
    'ticker,name,status,notes',
    ...KEEP_GAP.map((g) => `${g.ticker},"${g.name}",${g.status},"${g.notes.replace(/"/g, '""')}"`),
  ].join('\n') + '\n',
  'utf8',
);

fs.writeFileSync(
  join(reportDir, 'needs_review_taxonomy_gaps.csv'),
  [
    'ticker,name,status,notes',
    '001740,"SK네트웍스",taxonomy_gap,"종합상사·타지도 자동편입 금지. 화학 잠정. 그룹 신설 대상 아님"',
    '126560,"현대퓨처넷",taxonomy_gap,"telecom 미수록 유지. 타지도 자동편입 금지. 그룹 신설 대상 아님"',
  ].join('\n') + '\n',
  'utf8',
);

fs.writeFileSync(
  join(reportDir, 'needs_review_closure.json'),
  JSON.stringify(
    {
      moves: MOVES,
      group_fixes: GROUP_FIXES,
      holdings_finance: HOLDINGS_FINANCE,
      packaging: PACKAGING,
      residual_needs_review: ['005090'],
      taxonomy_gaps: ['001740', '126560'],
      expected: {
        semi: 82,
        bio: 64,
        battery: 25,
        chemical: 28,
        ship: 17,
        renewable: 13,
        holdings_groups: 9,
        chemical_groups: 10,
      },
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('OK docs/reports/needs_review_closure_*');
