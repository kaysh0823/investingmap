/**
 * Verify §0-4 batch F (kconsume / kcontent / travel) + shipping logistics moves.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { countByChain, validateChainInvariants } from '../lib/chain_reclass_invariants.mjs';
import { CONSUMER_04F } from '../lib/consumer_04f_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const EXPECTED_N = { kconsume: 37, kcontent: 25, travel: 12 };

for (const key of ['kconsume', 'kcontent', 'travel']) {
  const cfg = CONSUMER_04F[key];
  const html = fs.readFileSync(join(ROOT, cfg.html), 'utf8');
  const companies = extractCompaniesFromHtml(html);
  console.log(key, companies.length, countByChain(companies).counts);
  check(companies.length === EXPECTED_N[key], `${key}: expected ${EXPECTED_N[key]}, got ${companies.length}`);
  for (const err of validateChainInvariants(key, companies, { label: key })) failures.push(err);
  const colors = extractChainColors(html);
  for (const chain of cfg.chains) check(colors.includes(chain), `${key}: CHAIN_COLORS missing ${chain}`);
  for (const retired of cfg.retired) {
    if (cfg.chains.includes(retired)) continue;
    check(!colors.includes(retired), `${key}: CHAIN_COLORS still has retired ${retired}`);
  }
  for (const c of companies) {
    const forced = chainOverride(key, c.ticker);
    check(!!forced, `${key}: missing override ${c.ticker}`);
    check(forced === c.chain, `${key}: ${c.ticker} override ${forced} != ${c.chain}`);
  }
}

const maps = Object.fromEntries(
  [
    ['kconsume', 'kconsume/korea_kconsume_map.html'],
    ['kcontent', 'kcontent/korea_kcontent_map.html'],
    ['travel', 'travel/korea_travel_map.html'],
    ['shipping', 'shipping/korea_shipping_map.html'],
    ['chemical', 'chemical/korea_chemical_map.html'],
  ].map(([k, p]) => [k, extractCompaniesFromHtml(fs.readFileSync(join(ROOT, p), 'utf8'))]),
);

check(!maps.kconsume.some((c) => c.ticker === '086280' || c.ticker === '000120'), 'logistics still on kconsume');
check(!maps.kconsume.some((c) => c.chain === '물류·상사'), 'kconsume still has 물류·상사');
check(
  maps.shipping.some((c) => c.ticker === '086280' && c.chain === '자동차·특수화물 운송'),
  '086280 missing on shipping',
);
check(maps.shipping.some((c) => c.ticker === '000120' && c.chain === '종합물류'), '000120 missing on shipping');
check(maps.shipping.length === 6, `shipping expected 6, got ${maps.shipping.length}`);

const kakao = maps.kcontent.find((c) => c.ticker === '293490');
check(kakao?.chain === '게임', '293490 not 게임');
check(String(kakao?.products || '').includes('게임'), '293490 products');
check(!String(kakao?.products || '').includes('카카오'), '293490 still has 카카오');
check(!String(kakao?.semType || '').includes('카카오'), '293490 semType still 카카오');

check(!maps.kconsume.some((c) => c.ticker === '001740'), '001740 auto-entered kconsume');
check(!maps.kconsume.some((c) => c.ticker === '028260'), '028260 still on kconsume');
check(exclusiveSector('028260') === 'construction', '028260 exclusive construction');
check(maps.chemical.length === 29, `chemical expected 29, got ${maps.chemical.length}`);
check(exclusiveSector('086280') === 'shipping', 'exclusive 086280');
check(exclusiveSector('000120') === 'shipping', 'exclusive 000120');
check(exclusiveSector('005930') === 'bigchip', 'bigchip');

const bioSrc = fs.readFileSync(join(ROOT, 'bio/korea_bio_map.inline.js'), 'utf8');
const bioMatch = bioSrc.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
const bio = Function(`"use strict"; return (${bioMatch[1]});`)();
check(bio.length === 66, `bio expected 66, got ${bio.length}`);
const elec = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'elec/korea_elec_map.html'), 'utf8'));
check(elec.length === 29, `elec expected 29, got ${elec.length}`);

console.log('Consumer §0-4F verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
