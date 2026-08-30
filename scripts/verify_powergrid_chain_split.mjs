/** Verifies the approved power-grid cable split in data, UI and overrides. */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import {
  SECTOR_INVARIANT_CONFIG,
  countByChain,
  validateChainInvariants,
} from '../lib/chain_reclass_invariants.mjs';
import { inferChain } from '../lib/cp_list_chain_infer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(join(ROOT, 'powergrid', 'korea_powergrid_map.html'), 'utf8');
const PG = SECTOR_INVARIANT_CONFIG.powergrid;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const companies = extractCompaniesFromHtml(HTML);
check(companies.length > 0, 'companies: empty map');
for (const err of validateChainInvariants('powergrid', companies, { label: 'companies' })) {
  failures.push(err);
}
const got = countByChain(companies).counts;

const colorKeys = extractChainColors(HTML);
for (const chain of PG.expectedChains) check(colorKeys.includes(chain), `CHAIN_COLORS missing ${chain}`);
for (const retired of PG.retiredChains) check(!colorKeys.includes(retired), `CHAIN_COLORS still includes ${retired}`);
for (const field of ['chainLabel', 'chainFilter']) {
  const dicts = HTML.match(new RegExp(`"${field}": \\{[\\s\\S]*?\\n        \\}`, 'g')) || [];
  check(dicts.length === 2, `${field}: expected ko/en dictionaries`);
  for (const dict of dicts) {
    for (const chain of PG.expectedChains) check(dict.includes(`"${chain}"`), `${field} missing ${chain}`);
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
