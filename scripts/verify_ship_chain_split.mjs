/**
 * Verifies the approved ship chain split in data, UI, SEO rows and overrides.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { PRERENDER_START, PRERENDER_END } from '../lib/seo_prerender_lib.mjs';
import {
  SECTOR_INVARIANT_CONFIG,
  countByChain,
  validateChainInvariants,
} from '../lib/chain_reclass_invariants.mjs';
import { inferChain } from '../lib/cp_list_chain_infer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(join(ROOT, 'ship', 'korea_ship_map.html'), 'utf8');
const SHIP = SECTOR_INVARIANT_CONFIG.ship;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const companies = extractCompaniesFromHtml(HTML);
check(companies.length > 0, 'companies: empty map');
for (const err of validateChainInvariants('ship', companies, { label: 'companies' })) {
  failures.push(err);
}
const got = countByChain(companies).counts;

for (const c of companies) {
  check(!SHIP.retiredChains.includes(c.chain), `${c.ticker} still uses retired chain ${c.chain}`);
}

const colorKeys = extractChainColors(HTML);
for (const chain of SHIP.expectedChains) check(colorKeys.includes(chain), `CHAIN_COLORS missing ${chain}`);
for (const chain of SHIP.retiredChains) check(!colorKeys.includes(chain), `CHAIN_COLORS still includes ${chain}`);

for (const field of ['chainLabel', 'chainFilter']) {
  const dicts = HTML.match(new RegExp(`"${field}": \\{[\\s\\S]*?\\n        \\}`, 'g')) || [];
  check(dicts.length === 2, `${field}: expected ko/en dictionaries`);
  for (const dict of dicts) {
    for (const chain of SHIP.expectedChains) check(dict.includes(`"${chain}"`), `${field} missing ${chain}`);
  }
}

const block = HTML.slice(HTML.indexOf(PRERENDER_START), HTML.indexOf(PRERENDER_END));
const rows = [...block.matchAll(/<tr data-ticker="(\d{6})">([\s\S]*?)<\/tr>/g)].map(([, ticker, row]) => [
  ticker,
  row.match(/<span class="chain-tag">([^<]+)<\/span>/)?.[1],
]);
check(rows.length === companies.length, `prerender rows: expected ${companies.length}, got ${rows.length}`);
const byTicker = new Map(companies.map((c) => [c.ticker, c.chain]));
for (const [ticker, chain] of rows) check(byTicker.get(ticker) === chain, `prerender ${ticker}: ${chain} != ${byTicker.get(ticker)}`);

for (const sample of ['선박엔진', '피팅·밸브', '선박평형수 계측', '해양플랜트', 'LNG 보냉재', '해운물류']) {
  const inferred = inferChain(sample, 'ship', colorKeys);
  check(!SHIP.retiredChains.includes(inferred), `inferChain('${sample}') returned retired ${inferred}`);
}

console.log('Ship chain split verification');
console.log('=============================');
console.log('companies:', companies.length, got);
console.log('prerender rows:', rows.length);
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
