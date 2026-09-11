/**
 * Confirm semi needs_review 16 tickers: clear flags, 3 chain moves, 036830→holdings.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIRM_KEEP = [
  ['039030', '패키징 장비', '레이저 마킹·컷 등 패키징 공정 장비 — 현 그룹 확정'],
  ['232140', '검사·계측 장비', '결함·번인 검사 장비 — 현 그룹 확정'],
  ['003160', '검사·계측 장비', '반도체 검사 장비 — 현 그룹 확정'],
  ['332570', '검사·계측 장비', '검사·계측 장비 — 현 그룹 확정'],
  ['059090', '공정 부품·유지관리', '공정 부품·세정 부품 — 현 그룹 확정'],
  ['178320', '공정 부품·유지관리', '공정 부품·기구물 (ESS 주력 비중↑ 모니터링) — 그룹 유지'],
  ['272290', '기판·패키징 소재', 'FPCB/패키징 소재 — 현 그룹 확정'],
  ['327260', '기판·패키징 소재', 'RF·세라믹 기판·패키징 소재 — 현 그룹 확정'],
  ['219130', '테스트 부품·인터페이스', '테스트 보드·인터페이스 — 현 그룹 확정'],
  ['039440', '팹 인프라·지원설비', 'CCSS·유틸리티 — 현 그룹 확정'],
  ['417840', '팹 인프라·지원설비', '팹 유틸리티·환경설비 — 현 그룹 확정'],
  ['144960', '팹 인프라·지원설비', '플라즈마·팹 설비 (방산 매출 비중↑ 모니터링) — 그룹 유지'],
];

const CORRECTIONS = [
  ['241770', '공정 소재', '공정 부품·유지관리', '메카로 — 공정 부품·유지관리로 정정 확정'],
  ['036810', '팹 인프라·지원설비', '공정 소재', '에프에스티 — 칠러/TCU 등 공정 소재·부품성 제품으로 정정'],
  ['078600', '공정 소재', '기판·패키징 소재', '대주전자재료 — 기판·패키징 소재로 정정 (배터리 주력 모니터링)'],
];

const MOVED = [
  ['036830', '공정 소재', 'holdings/반도체', '솔브레인홀딩스 — 지주 성격, holdings(반도체)로 이동'],
];

function pad(t) {
  return String(t).padStart(6, '0');
}

function ensureSemi(fields, ticker) {
  if (!fields[ticker]) fields[ticker] = {};
  if (!fields[ticker].byIndustry) fields[ticker].byIndustry = {};
  if (!fields[ticker].byIndustry.semi) fields[ticker].byIndustry.semi = {};
  return fields[ticker].byIndustry.semi;
}

function appendTag(fields, ticker, tags) {
  const row = fields[ticker] || (fields[ticker] = {});
  const existing = Array.isArray(row.tags) ? row.tags : [];
  for (const tag of tags) if (!existing.includes(tag)) existing.push(tag);
  row.tags = existing;
  const semi = ensureSemi(fields, ticker);
  if (semi.products) {
    for (const tag of tags) {
      if (!String(semi.products).includes(tag)) semi.products = `${semi.products} · ${tag}`;
    }
  }
}

// --- chain_overrides ---
const ovPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
const semi = { ...(overrides.semi || {}) };
for (const [t, from, to] of CORRECTIONS) {
  const ticker = pad(t);
  if (semi[ticker] !== from && semi[ticker] !== to) {
    console.warn(`warn ${ticker}: expected ${from} or ${to}, got ${semi[ticker]}`);
  }
  semi[ticker] = to;
}
delete semi[pad('036830')];
overrides.semi = semi;
fs.writeFileSync(ovPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides semi', Object.keys(semi).length, '(036830 removed)');

// --- ticker_field_overrides ---
const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

for (const [t, chain, evidence] of CONFIRM_KEEP) {
  const ticker = pad(t);
  const semiRow = ensureSemi(fields, ticker);
  semiRow.needs_review = false;
  semiRow.chain = chain;
  semiRow.review_status = 'confirmed';
  semiRow.review_evidence = evidence;
  if (ticker === '178320') {
    semiRow.monitor_note = 'ESS 주력 비중 확대 — semi 비중 축소 모니터링, 그룹 유지';
  }
  if (ticker === '144960') {
    semiRow.monitor_note = '방산 매출 비중 약 52% — semi 비중 축소 모니터링, 그룹 유지';
  }
}

for (const [t, , to, evidence] of CORRECTIONS) {
  const ticker = pad(t);
  const semiRow = ensureSemi(fields, ticker);
  semiRow.needs_review = false;
  semiRow.chain = to;
  semiRow.review_status = 'corrected';
  semiRow.review_evidence = evidence;
  if (ticker === '078600') {
    semiRow.monitor_note = '배터리 주력 — 향후 elec/battery 홈 재검토 후보, 현 그룹 기판·패키징 소재 유지';
  }
}
appendTag(fields, '036810', ['칠러', 'TCU']);

{
  const ticker = pad('036830');
  const semiRow = ensureSemi(fields, ticker);
  semiRow.needs_review = false;
  delete semiRow.chain;
  semiRow.review_status = 'moved_holdings';
  semiRow.review_evidence = MOVED[0][3];
  if (!fields[ticker].byIndustry.holdings) fields[ticker].byIndustry.holdings = {};
  fields[ticker].byIndustry.holdings.chain = '반도체';
  fields[ticker].semType = fields[ticker].semType || '반도체 소재 지주';
  fields[ticker].semTypeEn = fields[ticker].semTypeEn || 'Semiconductor materials holding';
  fields[ticker].products = fields[ticker].products || '솔브레인 등 반도체 공정 소재 계열 지주';
  fields[ticker].productsEn =
    fields[ticker].productsEn || 'Holding company for Soulbrain and semiconductor process materials affiliates';
}

fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides needs_review cleared + tags/notes');

// --- holdings additions ---
const holdPath = join(ROOT, 'holdings', 'cp_list_holdings_additions.json');
const holdings = JSON.parse(fs.readFileSync(holdPath, 'utf8'));
if (!holdings.some((r) => pad(r.ticker) === '036830')) {
  holdings.push({
    ticker: '036830',
    name: '솔브레인홀딩스',
    nameEn: 'Soulbrain Holdings',
    chain: '반도체',
    semType: '반도체 소재 지주',
    semTypeEn: 'Semiconductor materials holding',
    products: '솔브레인 등 반도체 공정 소재 계열 지주',
    productsEn: 'Holding company for Soulbrain and semiconductor process materials affiliates',
    partners: [],
    subSector: '반도체 소재 지주',
    level: 'core',
  });
  fs.writeFileSync(holdPath, JSON.stringify(holdings, null, 2) + '\n', 'utf8');
  console.log('OK holdings additions +036830');
} else {
  console.log('OK holdings additions already has 036830');
}

// --- reports ---
const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const csv = [
  'ticker,name,final_group,previous_group,action,status,evidence',
  ...CONFIRM_KEEP.map(
    ([t, chain, ev]) =>
      `${pad(t)},,${chain},${chain},keep_group,confirmed,"${ev.replace(/"/g, '""')}"`,
  ),
  ...CORRECTIONS.map(
    ([t, from, to, ev]) =>
      `${pad(t)},,${to},${from},chain_corrected,confirmed,"${ev.replace(/"/g, '""')}"`,
  ),
  ...MOVED.map(
    ([t, from, to, ev]) =>
      `${pad(t)},,${to},${from},moved_holdings,confirmed,"${ev.replace(/"/g, '""')}"`,
  ),
];
fs.writeFileSync(join(reportDir, 'semi_needs_review_confirmed.csv'), csv.join('\n') + '\n', 'utf8');
fs.writeFileSync(
  join(reportDir, 'semi_reclass_review.csv'),
  'ticker,name,provisional_group,previous_group,status,notes\n',
  'utf8',
);
console.log('OK docs/reports/semi_needs_review_confirmed.csv; review CSV cleared (0 pending)');
