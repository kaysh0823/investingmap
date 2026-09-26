/**
 * 오분류 4종목 섹터/체인 정정 (rebuild마다 재적용 — 원천이 되돌아가지 않도록).
 * - 127120 제이에스링크: semi → bio / 연구도구·서비스
 * - 015360 INVENI: semi → holdings / 에너지·화학
 * - 332570 PS일렉트로닉스: semi → elec / 전자부품·기판 (nameEn 정정)
 * - 033790 피노: battery 유지, chain → 양극재·전구체
 *
 * data/netmap/*.json 은 건드리지 않음(이미 반영).
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
    ticker: '127120',
    name: '제이에스링크',
    nameEn: 'JS Link',
    from: 'semi',
    to: 'bio',
    chain: '연구도구·서비스',
    semType: '유전체 분석·영구자석',
    semTypeEn: 'Genomic analysis & permanent magnets',
    products: '유전체 분석 서비스, 희토류 영구자석(신사업)',
    productsEn: 'Genomic analysis services; rare-earth permanent magnets (new business)',
    evidence: '2026-09 reclass: 유전체 분석 서비스(구 디엔에이링크) · 희토류 영구자석 신사업 — bio 연구도구·서비스',
  },
  {
    ticker: '015360',
    name: 'INVENI',
    nameEn: 'INVENI',
    from: 'semi',
    to: 'holdings',
    chain: '에너지·화학',
    semType: '투자형 지주',
    semTypeEn: 'Investment holding company',
    products: '투자형 지주회사(구 예스코홀딩스, 도시가스 자회사 예스코)',
    productsEn: 'Investment holding (formerly YESCO Holdings; city-gas subsidiary YESCO)',
    evidence: '2026-09 reclass: 구 예스코홀딩스 투자형 지주 — holdings 에너지·화학',
  },
  {
    ticker: '332570',
    name: 'PS일렉트로닉스',
    nameEn: 'PS Electronics',
    from: 'semi',
    to: 'elec',
    chain: '전자부품·기판',
    semType: 'RF PAM/FEM',
    semTypeEn: 'RF PAM/FEM modules',
    products: 'RF 전력증폭모듈(PAM/FEM), 차량용 RF·무선충전 부품',
    productsEn: 'RF power amplifier modules (PAM/FEM); automotive RF and wireless charging parts',
    evidence: '2026-09 reclass: RF PAM/FEM·차량 RF (구 와이팜) — elec 전자부품·기판; nameEn Pentastone→PS Electronics',
  },
  {
    ticker: '033790',
    name: '피노',
    nameEn: 'FINO INC.',
    from: 'battery',
    to: 'battery',
    chain: '양극재·전구체',
    semType: '전구체',
    semTypeEn: 'Precursors',
    products: '이차전지 전구체(CNGR 계열)',
    productsEn: 'Secondary-battery precursors (CNGR group)',
    evidence: '2026-09 reclass: CNGR 계열 전구체 — battery 양극재·전구체 (장비 오분류 정정)',
  },
];

const ADDITION_FILES = {
  semi: 'semiconductor/cp_list_semi_additions.json',
  bio: 'bio/cp_list_bio_additions.json',
  holdings: 'holdings/cp_list_holdings_additions.json',
  elec: 'elec/cp_list_elec_additions.json',
  battery: 'battery/cp_list_battery_additions.json',
};

function upsertAddition(fileRel, row) {
  const fp = join(ROOT, fileRel);
  const arr = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : [];
  const i = arr.findIndex((r) => pad(r.ticker) === pad(row.ticker));
  const next = {
    ticker: row.ticker,
    name: row.name,
    nameEn: row.nameEn,
    chain: row.chain,
    semType: row.semType,
    semTypeEn: row.semTypeEn,
    products: row.products,
    productsEn: row.productsEn,
    partners: [],
    subSector: row.chain,
    level: 'core',
  };
  if (i >= 0) arr[i] = { ...arr[i], ...next };
  else arr.push(next);
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

function removeAddition(fileRel, ticker) {
  const fp = join(ROOT, fileRel);
  if (!fs.existsSync(fp)) return;
  const arr = JSON.parse(fs.readFileSync(fp, 'utf8')).filter((r) => pad(r.ticker) !== pad(ticker));
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

// --- chain_overrides ---
const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
for (const m of MOVES) {
  if (m.from !== m.to && overrides[m.from]) delete overrides[m.from][m.ticker];
  if (!overrides[m.to]) overrides[m.to] = {};
  overrides[m.to][m.ticker] = m.chain;
}
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides');

// --- field overrides ---
const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
for (const m of MOVES) {
  fields[m.ticker] = fields[m.ticker] || {};
  fields[m.ticker].name = m.name;
  fields[m.ticker].nameEn = m.nameEn;
  fields[m.ticker].semType = m.semType;
  fields[m.ticker].semTypeEn = m.semTypeEn;
  fields[m.ticker].products = m.products;
  fields[m.ticker].productsEn = m.productsEn;
  fields[m.ticker].byIndustry = fields[m.ticker].byIndustry || {};
  if (m.from !== m.to && fields[m.ticker].byIndustry[m.from]) {
    delete fields[m.ticker].byIndustry[m.from];
  }
  fields[m.ticker].byIndustry[m.to] = {
    chain: m.chain,
    needs_review: false,
    evidence: m.evidence,
    semType: m.semType,
    products: m.products,
  };
}
fields._policy = fields._policy || {};
fields._policy.sector_reclass_4tickers_20260927 =
  '2026-09-27: 127120→bio, 015360→holdings, 332570→elec, 033790 battery chain→양극재·전구체';
fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

// --- exclusive ---
const exclusivePath = join(ROOT, 'lib', 'sector_exclusive.mjs');
let exclusiveSrc = fs.readFileSync(exclusivePath, 'utf8');
for (const m of MOVES) {
  const comment =
    m.from === m.to
      ? `${m.name} (${m.to} ${m.chain})`
      : `${m.name} (${m.from}→${m.to} ${m.chain})`;
  const line = `  '${m.ticker}': '${m.to}', // ${comment}\n`;
  const re = new RegExp(`\\s*'${m.ticker}':\\s*'[^']+',\\s*//[^\\n]*\\n`);
  if (re.test(exclusiveSrc)) exclusiveSrc = exclusiveSrc.replace(re, `\n${line}`);
  else {
    exclusiveSrc = exclusiveSrc.replace(
      'export const SECTOR_EXCLUSIVE = {\n',
      `export const SECTOR_EXCLUSIVE = {\n${line}`,
    );
  }
}
fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
console.log('OK sector_exclusive');

// --- additions ---
for (const m of MOVES) {
  if (m.from !== m.to) {
    const fromRel = ADDITION_FILES[m.from];
    if (fromRel) removeAddition(fromRel, m.ticker);
  }
  const toRel = ADDITION_FILES[m.to];
  if (!toRel) throw new Error(`no addition file for ${m.to}`);
  upsertAddition(toRel, m);
}
console.log('OK additions');

console.log('OK apply_sector_reclass_4tickers_20260927', MOVES.map((m) => m.ticker).join(','));
