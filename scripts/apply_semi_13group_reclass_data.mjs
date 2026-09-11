/**
 * Rewrite data/chain_overrides.json "semi" to the 13-group mapping (81 tickers),
 * write needs_review CSV, and append product tags without overwriting descriptions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { LEGEND_CHAINS } from '../lib/semi_chain_ui.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** New chain → tickers (explicit table; do not auto-infer). */
const SEMI_MAP = {
  '팹리스·IP': ['440110', '080220', '108320', '094170'],
  디자인하우스: ['399720', '200710', '490470'],
  파운드리: ['000990'],
  '전공정 장비': [
    '036930', '240810', '403870', '319660', '084370', '095610', '089970', '281820', '122640', '079370',
  ],
  '패키징 장비': ['042700', '031980', '053610', '089890', '039030'],
  '검사·계측 장비': [
    '098460', '140860', '089030', '420770', '064290', '253590', '092870', '348210', '232140', '003160', '332570',
  ],
  '공정 소재': [
    '357780', '014680', '005290', '281740', '101490', '102710', '104830', '036810',
  ],
  '공정 부품·유지관리': ['064760', '183300', '166090', '074600', '101160', '114810', '059090', '178320', '241770'],
  '기판·패키징 소재': [
    '007660', '353200', '222800', '007810', '356860', '195870', '033160', '178920', '272290', '327260', '078600', '077360',
  ],
  '테스트 부품·인터페이스': [
    '058470', '095340', '131290', '252990', '425420', '080580', '098120', '219130',
  ],
  '패키징·테스트 서비스': ['067310', '131970', '036540', '033640'],
  '팹 인프라·지원설비': ['083450', '045100', '039440', '417840', '144960'],
  '반도체 유통': ['093520'],
};

const NEEDS_REVIEW = [];

/** Append-only process tags (ko). */
const TAG_APPEND = {
  '089970': ['식각'],
  '183300': ['세정·코팅 서비스'],
  '131970': ['테스트 대행'],
  '064760': ['공정 부품'],
  '074600': ['공정 부품'],
  '039440': ['CCSS·유틸리티'],
  '083450': ['CCSS·유틸리티'],
  '348210': ['결함·번인 검사'],
  '232140': ['결함·번인 검사'],
};

function pad(t) {
  return String(t).padStart(6, '0');
}

const semi = {};
const byTicker = new Map();
for (const [chain, tickers] of Object.entries(SEMI_MAP)) {
  if (!LEGEND_CHAINS.includes(chain)) throw new Error(`unknown chain ${chain}`);
  for (const t of tickers) {
    const ticker = pad(t);
    if (byTicker.has(ticker)) throw new Error(`duplicate ticker ${ticker}`);
    byTicker.set(ticker, chain);
    semi[ticker] = chain;
  }
}
if (byTicker.size !== 80) throw new Error(`expected 80 tickers, got ${byTicker.size}`);

const overridesPath = path.join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const prevSemi = { ...(overrides.semi || {}) };
overrides.semi = semi;
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides.json semi rewritten', Object.keys(semi).length);

// needs_review CSV
const reviewDir = path.join(ROOT, 'docs', 'reports');
fs.mkdirSync(reviewDir, { recursive: true });
const companies = extractCompaniesFromHtml(
  fs.readFileSync(path.join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8'),
);
const nameByTicker = new Map(companies.map((c) => [pad(c.ticker), c.name]));
const oldChainByTicker = new Map(companies.map((c) => [pad(c.ticker), c.chain]));

const reviewRows = [
  'ticker,name,provisional_group,previous_group,status,notes',
  ...NEEDS_REVIEW.map((t) => {
    const ticker = pad(t);
    const name = nameByTicker.get(ticker) || '';
    const neo = byTicker.get(ticker) || '';
    const old = oldChainByTicker.get(ticker) || prevSemi[ticker] || '';
    return `${ticker},"${name}","${neo}","${old}",needs_review,잠정 배정 — 배포 전 제품/공정 근거 재확인`;
  }),
];
fs.writeFileSync(path.join(reviewDir, 'semi_reclass_review.csv'), reviewRows.join('\n') + '\n', 'utf8');
console.log('OK docs/reports/semi_reclass_review.csv', NEEDS_REVIEW.length);

// Append tags in ticker_field_overrides without overwriting descriptions
const fieldsPath = path.join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
for (const [t, tags] of Object.entries(TAG_APPEND)) {
  const ticker = pad(t);
  if (!fields[ticker]) fields[ticker] = {};
  const existing = Array.isArray(fields[ticker].tags) ? fields[ticker].tags : [];
  const merged = [...existing];
  for (const tag of tags) if (!merged.includes(tag)) merged.push(tag);
  fields[ticker].tags = merged;
  // Append to products display string only if missing
  if (fields[ticker].products) {
    for (const tag of tags) {
      if (!String(fields[ticker].products).includes(tag)) {
        fields[ticker].products = `${fields[ticker].products} · ${tag}`;
      }
    }
  }
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry.semi) fields[ticker].byIndustry.semi = {};
  fields[ticker].byIndustry.semi.needs_review = NEEDS_REVIEW.includes(ticker);
  fields[ticker].byIndustry.semi.chain = byTicker.get(ticker);
}
// Sync byIndustry.semi.chain for all 81 mapped tickers (clear stale leaf names).
for (const [ticker, chain] of byTicker) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry.semi) fields[ticker].byIndustry.semi = {};
  fields[ticker].byIndustry.semi.chain = chain;
  if (fields[ticker].chain && fields[ticker].chain !== chain) delete fields[ticker].chain;
}
// Flag needs_review on all listed tickers (even without tag append)
for (const t of NEEDS_REVIEW) {
  const ticker = pad(t);
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry.semi) fields[ticker].byIndustry.semi = {};
  fields[ticker].byIndustry.semi.needs_review = true;
  if (byTicker.has(ticker)) fields[ticker].byIndustry.semi.chain = byTicker.get(ticker);
}
fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides tags/needs_review');

// Mapping report for later print
const mapReport = companies.map((c) => {
  const ticker = pad(c.ticker);
  const neo = byTicker.get(ticker);
  return {
    ticker,
    name: c.name,
    old: c.chain,
    neo: neo || 'MISSING',
    tags: fields[ticker]?.tags || [],
    needs_review: NEEDS_REVIEW.includes(ticker),
    evidence: NEEDS_REVIEW.includes(ticker) ? '✎ 추가조사(잠정)' : '★ 원본표 배정',
  };
});
const missingOnMap = [...byTicker.keys()].filter((t) => !nameByTicker.has(t));
const extraOnMap = companies.map((c) => pad(c.ticker)).filter((t) => !byTicker.has(t));
fs.writeFileSync(
  path.join(reviewDir, 'semi_reclass_mapping.json'),
  JSON.stringify({ mapReport, missingOnMap, extraOnMap, groups: SEMI_MAP }, null, 2),
  'utf8',
);
console.log('missingOnMap', missingOnMap);
console.log('extraOnMap', extraOnMap);
