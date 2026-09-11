/**
 * Verify §0-4 batch E (bio / medtech / cosmetics).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { countByChain, validateChainInvariants } from '../lib/chain_reclass_invariants.mjs';
import { HEALTH_04E } from '../lib/health_04e_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

function bioCompanies() {
  const src = fs.readFileSync(join(ROOT, 'bio/korea_bio_map.inline.js'), 'utf8');
  const match = src.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('bio koreanCompanies not found');
  return Function(`"use strict"; return (${match[1]});`)();
}

const EXPECTED_N = { bio: 66, medtech: 17, cosmetics: 19 };

const maps = {
  bio: bioCompanies(),
  medtech: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'medtech/korea_medtech_map.html'), 'utf8')),
  cosmetics: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'cosmetics/korea_cosmetics_map.html'), 'utf8')),
};

for (const key of ['bio', 'medtech', 'cosmetics']) {
  const cfg = HEALTH_04E[key];
  const companies = maps[key];
  console.log(key, companies.length, countByChain(companies).counts);
  check(companies.length === EXPECTED_N[key], `${key}: expected ${EXPECTED_N[key]}, got ${companies.length}`);
  for (const err of validateChainInvariants(key, companies, { label: key })) failures.push(err);
  for (const c of companies) {
    const forced = chainOverride(key, c.ticker);
    check(!!forced, `${key}: missing override ${c.ticker}`);
    check(forced === c.chain, `${key}: ${c.ticker} override ${forced} != ${c.chain}`);
    check(!cfg.retired.includes(c.chain), `${key}: ${c.ticker} still retired ${c.chain}`);
  }
}

const medtechHtml = fs.readFileSync(join(ROOT, 'medtech/korea_medtech_map.html'), 'utf8');
const cosmeticsHtml = fs.readFileSync(join(ROOT, 'cosmetics/korea_cosmetics_map.html'), 'utf8');
for (const chain of HEALTH_04E.medtech.chains) {
  check(extractChainColors(medtechHtml).includes(chain), `medtech CHAIN_COLORS missing ${chain}`);
}
for (const chain of HEALTH_04E.cosmetics.chains) {
  check(extractChainColors(cosmeticsHtml).includes(chain), `cosmetics CHAIN_COLORS missing ${chain}`);
}

check(!maps.bio.some((c) => c.ticker === '082270'), '082270 still on bio');
check(!maps.bio.some((c) => c.ticker === '086900'), '086900 still on bio');
check(
  maps.cosmetics.some((c) => c.ticker === '086900' && c.chain === '에스테틱 의약품·소모품'),
  '086900 missing on cosmetics',
);
check(!maps.bio.some((c) => c.ticker === '290650' || c.ticker === '0120G0'), 'regenerative still on bio');
check(maps.medtech.some((c) => c.ticker === '290650'), '290650 missing on medtech');
check(maps.medtech.some((c) => c.ticker === '0120G0'), '0120G0 missing on medtech');

const curo = maps.bio.find((c) => c.ticker === '372320');
check(curo?.nameEn === 'Curocell', `372320 nameEn=${curo?.nameEn}`);
check(curo?.chain === '신약개발', '372320 not 신약개발');

const pharma = maps.cosmetics.find((c) => c.ticker === '214450');
check(String(pharma?.products || '').includes('리쥬란'), '214450 products');
const wontech = maps.cosmetics.find((c) => c.ticker === '336570');
check(String(wontech?.products || '').includes('에너지'), '336570 products');

check(exclusiveSector('086900') === 'cosmetics', 'exclusive 086900');
check(exclusiveSector('290650') === 'medtech', 'exclusive 290650');
check(exclusiveSector('082270') === 'semi', 'exclusive 082270');
check(exclusiveSector('005930') === 'bigchip', 'bigchip');

for (const r of HEALTH_04E.bio.retired) {
  check(!maps.bio.some((c) => c.chain === r), `bio still has ${r}`);
}

const semi = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'semiconductor/korea_semiconductor_map.html'), 'utf8'),
);
check(semi.length === 92, `semi expected 92, got ${semi.length}`);
const elec = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'elec/korea_elec_map.html'), 'utf8'));
check(elec.length === 29, `elec expected 29, got ${elec.length}`);

console.log('Health §0-4E verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
