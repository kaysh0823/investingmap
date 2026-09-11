/**
 * Verifies semiconductor 13-group value-chain reclass:
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
import {
  SECTOR_INVARIANT_CONFIG,
  countByChain,
  validateChainInvariants,
} from '../lib/chain_reclass_invariants.mjs';
import { inferChain } from '../lib/cp_list_chain_infer.mjs';
import { enrichCompanyList } from '../lib/company_field_enrich.mjs';
import { loadCpListUniverse } from '../lib/cp_list_universe.mjs';
import { SEMI_BE_CHAINS, SEMI_FE_CHAINS, LEGEND_CHAINS } from '../lib/semi_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'semiconductor', 'korea_semiconductor_map.html');
const CP_LIST_DIR = process.argv[2] || join(ROOT, '..', 'cp_list');

const SEMI = SECTOR_INVARIANT_CONFIG.semi;
const LEAF_CHAINS = SEMI.expectedChains;
const RETIRED_CHAINS = SEMI.retiredChains;
const AGGREGATE_CHAINS = ['전공정', '후공정'];
const BIGCHIP = ['005930', '000660'];

const failures = [];

function check(cond, message) {
  if (!cond) failures.push(message);
}

const html = fs.readFileSync(HTML_PATH, 'utf8');

// 1) koreanCompanies + invariant rules
const companies = extractCompaniesFromHtml(html);
check(companies.length > 0, 'koreanCompanies: empty map');
check(companies.length === 92, `koreanCompanies: expected 92, got ${companies.length}`);
for (const err of validateChainInvariants('semi', companies, { label: 'koreanCompanies' })) {
  failures.push(err);
}
const companyCounts = countByChain(companies).counts;
for (const t of BIGCHIP) {
  check(!companies.some((c) => c.ticker === t), `bigchip ${t} must not appear on semi map`);
  check(exclusiveSector(t) === 'bigchip', `exclusiveSector(${t}) must be bigchip`);
}
check(
  companies.some((c) => c.ticker === '082270' && c.chain === '팹 인프라·지원설비'),
  '082270 must be on 팹 인프라·지원설비',
);

// 2) prerendered SEO table
const block = html.slice(html.indexOf(PRERENDER_START), html.indexOf(PRERENDER_END));
const rowChains = [...block.matchAll(/<tr data-ticker="(\d{6})">([\s\S]*?)<\/tr>/g)].map(([, ticker, body]) => {
  const m = body.match(/<span class="chain-tag">([^<]*)<\/span>/);
  return [ticker, m ? m[1] : 'NONE'];
});
check(rowChains.length === companies.length, `prerender table: expected ${companies.length} rows, got ${rowChains.length}`);
const byTicker = new Map(companies.map((c) => [c.ticker, c.chain]));
for (const [ticker, chain] of rowChains) {
  check(byTicker.get(ticker) === chain, `prerender table: ${ticker} shows ${chain}, data says ${byTicker.get(ticker)}`);
}
for (const [ticker, chain] of [
  ['399720', '디자인하우스'],
  ['200710', '디자인하우스'],
  ['490470', '디자인하우스'],
  ['440110', '팹리스·IP'],
]) {
  if (!byTicker.has(ticker)) continue;
  check(byTicker.get(ticker) === chain, `${ticker} should be ${chain}, got ${byTicker.get(ticker)}`);
  check(
    companies.filter((c) => c.chain === '팹리스').every((c) => c.ticker !== ticker),
    `${ticker} must not remain under 팹리스`,
  );
}

// 3) chain UI definitions
const chainColorKeys = extractChainColors(html);
for (const chain of LEGEND_CHAINS) {
  check(chainColorKeys.includes(chain), `CHAIN_COLORS missing LEGEND chain: ${chain}`);
}
for (const chain of [...LEAF_CHAINS, ...AGGREGATE_CHAINS]) {
  check(chainColorKeys.includes(chain), `CHAIN_COLORS missing key: ${chain}`);
}
for (const retired of ['장비', '소재', '후공정 장비', '부품/기판', '패키징/테스트', '팹리스', 'IDM']) {
  check(!chainColorKeys.includes(retired), `CHAIN_COLORS still has retired key: ${retired}`);
}

const feChains = JSON.parse(html.match(/const FE_CHAINS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
const beChains = JSON.parse(html.match(/const BE_CHAINS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
check(JSON.stringify(feChains) === JSON.stringify(SEMI_FE_CHAINS), 'FE_CHAINS mismatch vs semi_chain_ui');
check(JSON.stringify(beChains) === JSON.stringify(SEMI_BE_CHAINS), 'BE_CHAINS mismatch vs semi_chain_ui');
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

const chipMatch = html.match(/const chains = \['all',[^\]]+\];/);
check(!!chipMatch, 'filter chips const chains missing');
if (chipMatch) {
  for (const chain of LEAF_CHAINS) {
    check(
      new RegExp(`'${chain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(chipMatch[0]),
      `filter chips missing chain: ${chain}`,
    );
  }
  for (const retired of ['소재', '후공정 장비', '부품/기판', '패키징/테스트', '팹리스']) {
    check(
      !new RegExp(`'${retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(chipMatch[0]),
      `filter chips still has retired: ${retired}`,
    );
  }
}

check(html.includes('SEMI_LEGACY_CHAIN_ALIASES'), 'missing SEMI_LEGACY_CHAIN_ALIASES for ?chain= remap');
check(html.includes('normalizeChainFilter'), 'missing normalizeChainFilter');

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

check(LEGEND_CHAINS.length === 13, `expected 13 legend chains, got ${LEGEND_CHAINS.length}`);

// 4) rebuild persistence
const enriched = companies.map((c) => ({ ...c }));
enrichCompanyList(enriched, 'semi', CP_LIST_DIR);
for (const err of validateChainInvariants('semi', enriched, { label: 'after enrichCompanyList' })) {
  failures.push(err);
}
for (const c of companies) {
  const forced = chainOverride('semi', c.ticker);
  if (forced) check(forced === c.chain, `chain_overrides.json: ${c.ticker} says ${forced}, map says ${c.chain}`);
  else failures.push(`chain_overrides.json missing semi ticker ${c.ticker}`);
}

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

for (const sub of [
  'IDM',
  '종합반도체',
  '후공정 장비',
  '전공정 장비',
  '반도체 유통·메모리',
  '메모리 모듈 PCB',
  '메모리 검사장비',
  '패키징·OSAT',
  '팹',
]) {
  const inferred = inferChain(sub, 'semi', chainColorKeys);
  check(!RETIRED_CHAINS.includes(inferred), `inferChain('${sub}') returned retired chain: ${inferred}`);
  check(
    LEAF_CHAINS.includes(inferred) || AGGREGATE_CHAINS.includes(inferred),
    `inferChain('${sub}') → ${inferred} not a leaf`,
  );
}

console.log('Semiconductor 13-group chain verification');
console.log('=========================================');
console.log('companies:', companies.length, companyCounts);
console.log('prerender rows:', rowChains.length);
console.log('failures:', failures.length);
for (const f of failures) console.log(`  - ${f}`);

process.exit(failures.length ? 1 : 0);
