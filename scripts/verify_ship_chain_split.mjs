/**
 * Verifies the approved ship chain split in data, UI, SEO rows and overrides.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { PRERENDER_START, PRERENDER_END } from '../lib/seo_prerender_lib.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { inferChain } from '../lib/cp_list_chain_infer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(join(ROOT, 'ship', 'korea_ship_map.html'), 'utf8');
const EXPECTED = {
  종합조선: 5,
  엔진: 5,
  '의장/배관': 4,
  '선체·보냉·구조재': 5,
  '서비스·해양플랜트': 3,
  해운물류: 3,
};
const RETIRED = ['조선기자재', '기타 기자재', '해양플랜트', '방산해양', '철강소재'];
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function counts(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] || 0) + 1;
  return out;
}

function compare(label, got) {
  for (const chain of new Set([...Object.keys(EXPECTED), ...Object.keys(got)])) {
    check((got[chain] || 0) === (EXPECTED[chain] || 0), `${label}: ${chain} expected ${EXPECTED[chain] || 0}, got ${got[chain] || 0}`);
  }
}

const companies = extractCompaniesFromHtml(HTML);
check(companies.length === 25, `companies: expected 25, got ${companies.length}`);
compare('companies', counts(companies.map((c) => c.chain)));
for (const c of companies) {
  check(!RETIRED.includes(c.chain), `${c.ticker} still uses retired chain ${c.chain}`);
  check(chainOverride('ship', c.ticker) === c.chain, `${c.ticker} override does not match ${c.chain}`);
}

const colorKeys = extractChainColors(HTML);
for (const chain of Object.keys(EXPECTED)) check(colorKeys.includes(chain), `CHAIN_COLORS missing ${chain}`);
for (const chain of RETIRED) check(!colorKeys.includes(chain), `CHAIN_COLORS still includes ${chain}`);

for (const field of ['chainLabel', 'chainFilter']) {
  const dicts = HTML.match(new RegExp(`"${field}": \\{[\\s\\S]*?\\n        \\}`, 'g')) || [];
  check(dicts.length === 2, `${field}: expected ko/en dictionaries`);
  for (const dict of dicts) {
    for (const chain of Object.keys(EXPECTED)) check(dict.includes(`"${chain}"`), `${field} missing ${chain}`);
  }
}

const block = HTML.slice(HTML.indexOf(PRERENDER_START), HTML.indexOf(PRERENDER_END));
const rows = [...block.matchAll(/<tr data-ticker="(\d{6})">([\s\S]*?)<\/tr>/g)].map(([, ticker, row]) => [
  ticker,
  row.match(/<span class="chain-tag">([^<]+)<\/span>/)?.[1],
]);
check(rows.length === 25, `prerender rows: expected 25, got ${rows.length}`);
const byTicker = new Map(companies.map((c) => [c.ticker, c.chain]));
for (const [ticker, chain] of rows) check(byTicker.get(ticker) === chain, `prerender ${ticker}: ${chain} != ${byTicker.get(ticker)}`);

for (const sample of ['선박엔진', '피팅·밸브', '선박평형수 계측', '해양플랜트', 'LNG 보냉재', '해운물류']) {
  const inferred = inferChain(sample, 'ship', colorKeys);
  check(!RETIRED.includes(inferred), `inferChain('${sample}') returned retired ${inferred}`);
}

console.log('Ship chain split verification');
console.log('=============================');
console.log('companies:', companies.length, counts(companies.map((c) => c.chain)));
console.log('prerender rows:', rows.length);
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
