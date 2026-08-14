/**
 * Verifies the semiconductor value-chain split (장비 → 전공정 장비 / 후공정 장비) stayed applied:
 * company data, prerendered SEO table, chain UI definitions, and rebuild-time persistence.
 *
 * Usage: node scripts/verify_semi_chain_split.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { PRERENDER_START, PRERENDER_END } from '../lib/seo_prerender_lib.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { inferChain } from '../lib/cp_list_chain_infer.mjs';
import { enrichCompanyList } from '../lib/company_field_enrich.mjs';
import { loadCpListUniverse } from '../lib/cp_list_universe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'semiconductor', 'korea_semiconductor_map.html');
const CP_LIST_DIR = process.argv[2] || join(ROOT, '..', 'cp_list');

const EXPECTED_COUNTS = {
  '전공정 장비': 16,
  '후공정 장비': 10,
  소재: 22,
  '부품/기판': 11,
  '패키징/테스트': 13,
  팹리스: 10,
  파운드리: 1,
  IDM: 1,
  '반도체 유통': 1,
};

const RETIRED_CHAINS = ['장비', '후공정'];
const LEAF_CHAINS = Object.keys(EXPECTED_COUNTS);
const AGGREGATE_CHAINS = ['전공정', '후공정'];

const failures = [];

function check(cond, message) {
  if (!cond) failures.push(message);
}

function countChains(list) {
  const counts = {};
  for (const chain of list) counts[chain] = (counts[chain] || 0) + 1;
  return counts;
}

function compareCounts(label, counts) {
  for (const chain of new Set([...LEAF_CHAINS, ...Object.keys(counts)])) {
    const got = counts[chain] || 0;
    const want = EXPECTED_COUNTS[chain] || 0;
    check(got === want, `${label}: ${chain} expected ${want}, got ${got}`);
  }
}

const html = fs.readFileSync(HTML_PATH, 'utf8');

// 1) koreanCompanies
const companies = extractCompaniesFromHtml(html);
check(companies.length === 85, `koreanCompanies: expected 85 companies, got ${companies.length}`);
const companyCounts = countChains(companies.map((c) => c.chain));
compareCounts('koreanCompanies', companyCounts);

// 2) prerendered SEO table (static tbody served to crawlers)
const block = html.slice(html.indexOf(PRERENDER_START), html.indexOf(PRERENDER_END));
const rowChains = [...block.matchAll(/<tr data-ticker="(\d{6})">([\s\S]*?)<\/tr>/g)].map(([, ticker, body]) => {
  const m = body.match(/<span class="chain-tag">([^<]*)<\/span>/);
  return [ticker, m ? m[1] : 'NONE'];
});
check(rowChains.length === 85, `prerender table: expected 85 rows, got ${rowChains.length}`);
compareCounts('prerender table', countChains(rowChains.map(([, chain]) => chain)));
const byTicker = new Map(companies.map((c) => [c.ticker, c.chain]));
for (const [ticker, chain] of rowChains) {
  check(byTicker.get(ticker) === chain, `prerender table: ${ticker} shows ${chain}, data says ${byTicker.get(ticker)}`);
}

// 3) chain UI definitions
const chainColorKeys = extractChainColors(html);
for (const chain of [...LEAF_CHAINS, ...AGGREGATE_CHAINS]) {
  check(chainColorKeys.includes(chain), `CHAIN_COLORS missing key: ${chain}`);
}
check(!chainColorKeys.includes('장비'), 'CHAIN_COLORS still has retired key: 장비');

const feChains = JSON.parse(html.match(/const FE_CHAINS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
const beChains = JSON.parse(html.match(/const BE_CHAINS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
check(feChains.includes('전공정 장비'), 'FE_CHAINS missing 전공정 장비');
check(beChains.includes('후공정 장비'), 'BE_CHAINS missing 후공정 장비');
check(
  [...feChains, ...beChains].length === new Set([...feChains, ...beChains]).size,
  'FE_CHAINS / BE_CHAINS overlap',
);
for (const chain of LEAF_CHAINS) {
  check(
    feChains.includes(chain) || beChains.includes(chain),
    `${chain} is in neither FE_CHAINS nor BE_CHAINS (hidden from 전공정/후공정 filters)`,
  );
}

for (const chain of [...LEAF_CHAINS, ...RETIRED_CHAINS]) {
  const stale = RETIRED_CHAINS.includes(chain);
  const inChips = html.includes(`const chains = ['all',`) && new RegExp(`'${chain.replace('/', '\\/')}'`).test(
    html.match(/const chains = \['all',[^\]]+\];/)[0],
  );
  if (stale) continue;
  check(inChips, `filter chips missing chain: ${chain}`);
}

// T.ko / T.en 각각 chainLabel·chainFilter 사전을 가지므로 필드당 2개여야 한다.
for (const field of ['chainLabel', 'chainFilter']) {
  const dicts = html.match(new RegExp(`${field}: \\{[^{}\\n]*\\}`, 'g')) || [];
  check(dicts.length === 2, `${field}: expected 2 dictionaries (ko, en), found ${dicts.length}`);
  dicts.forEach((dict, idx) => {
    const lang = idx === 0 ? 'ko' : 'en';
    for (const chain of [...LEAF_CHAINS, ...AGGREGATE_CHAINS]) {
      const key = new RegExp(`(?:[{,]\\s*)'?${chain.replace('/', '\\/')}'?\\s*:`);
      check(key.test(dict), `T.${lang}.${field} missing key: ${chain}`);
    }
    check(!/(?:[{,]\s*)장비\s*:/.test(dict), `T.${lang}.${field} still has retired key: 장비`);
  });
}

// 4) rebuild persistence
// 4a) 오버라이드가 현재 지도의 벨류체인과 충돌하지 않아야 한다.
const enriched = companies.map((c) => ({ ...c }));
enrichCompanyList(enriched, 'semi', CP_LIST_DIR);
compareCounts('after enrichCompanyList', countChains(enriched.map((c) => c.chain)));
for (const c of companies) {
  const forced = chainOverride('semi', c.ticker);
  if (forced) check(forced === c.chain, `chain_overrides.json: ${c.ticker} says ${forced}, map says ${c.chain}`);
}

// 4b) 지도 HTML 없이 다시 만들어도(신규 stub) 확정 분류가 나와야 한다.
const cpMap = loadCpListUniverse(CP_LIST_DIR).get('semi') || new Map();
const fieldOverrides = JSON.parse(
  fs.readFileSync(join(ROOT, 'data', 'ticker_field_overrides.json'), 'utf8'),
);
for (const c of companies) {
  const pinned = chainOverride('semi', c.ticker) || fieldOverrides[c.ticker]?.byIndustry?.semi?.chain;
  const resolved = pinned || inferChain(cpMap.get(c.ticker)?.subSector || '', 'semi', chainColorKeys);
  check(
    resolved === c.chain,
    `rebuild drift: ${c.ticker} ${c.name} would become ${resolved}, confirmed ${c.chain}`,
  );
}

// 5) inference must never produce retired chains
const availableChains = chainColorKeys;
for (const sub of ['전공정 장비', '후공정 장비', '반도체 유통·메모리', '메모리 모듈 PCB', '메모리 검사장비', '패키징·OSAT', '—']) {
  const inferred = inferChain(sub, 'semi', availableChains);
  check(!RETIRED_CHAINS.includes(inferred), `inferChain('${sub}') returned retired chain: ${inferred}`);
}

console.log('Semiconductor chain split verification');
console.log('======================================');
console.log('companies:', companies.length, countChains(companies.map((c) => c.chain)));
console.log('prerender rows:', rowChains.length);
console.log('failures:', failures.length);
for (const f of failures) console.log(`  - ${f}`);

process.exit(failures.length ? 1 : 0);
