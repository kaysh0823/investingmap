/** Verifies the approved power-grid cable split in data, UI and overrides. */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { inferChain } from '../lib/cp_list_chain_infer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(join(ROOT, 'powergrid', 'korea_powergrid_map.html'), 'utf8');
const EXPECTED = { 전력설비: 3, 송배전: 4, '전선·케이블': 4, 발전설비: 3 };
const EXPECTED_TICKERS = {
  '001440': '전선·케이블',
  '000500': '전선·케이블',
  '006340': '전선·케이블',
  '229640': '전선·케이블',
  '062040': '송배전',
  '103590': '송배전',
  '060370': '송배전',
  '033100': '송배전',
};
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function counts(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] || 0) + 1;
  return out;
}

const companies = extractCompaniesFromHtml(HTML);
const got = counts(companies.map((c) => c.chain));
check(companies.length === 14, `companies: expected 14, got ${companies.length}`);
for (const chain of new Set([...Object.keys(EXPECTED), ...Object.keys(got)])) {
  check((got[chain] || 0) === (EXPECTED[chain] || 0), `${chain}: expected ${EXPECTED[chain] || 0}, got ${got[chain] || 0}`);
}
const byTicker = new Map(companies.map((c) => [c.ticker, c.chain]));
for (const [ticker, chain] of Object.entries(EXPECTED_TICKERS)) {
  check(byTicker.get(ticker) === chain, `${ticker}: expected ${chain}, got ${byTicker.get(ticker)}`);
  check(chainOverride('powergrid', ticker) === chain, `${ticker}: override does not match ${chain}`);
}

const colorKeys = extractChainColors(HTML);
for (const chain of Object.keys(EXPECTED)) check(colorKeys.includes(chain), `CHAIN_COLORS missing ${chain}`);
for (const retired of ['송배전·케이블']) check(!colorKeys.includes(retired), `CHAIN_COLORS still includes ${retired}`);
for (const field of ['chainLabel', 'chainFilter']) {
  const dicts = HTML.match(new RegExp(`"${field}": \\{[\\s\\S]*?\\n        \\}`, 'g')) || [];
  check(dicts.length === 2, `${field}: expected ko/en dictionaries`);
  for (const dict of dicts) {
    for (const chain of Object.keys(EXPECTED)) check(dict.includes(`"${chain}"`), `${field} missing ${chain}`);
  }
}

check(inferChain('전력·통신 케이블', 'powergrid', colorKeys) === '전선·케이블', 'cable inference failed');
check(inferChain('해저케이블 시공·유지보수', 'powergrid', colorKeys) === '송배전', 'marine service inference failed');

console.log('Powergrid chain split verification');
console.log('==================================');
console.log('companies:', companies.length, got);
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
