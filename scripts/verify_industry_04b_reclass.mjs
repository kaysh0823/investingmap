/**
 * Verify §0-4 batch B (chemical / metal / machinery / construction) + related moves.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import {
  countByChain,
  validateChainInvariants,
} from '../lib/chain_reclass_invariants.mjs';
import { INDUSTRY_04B } from '../lib/industry_04b_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const EXPECTED_N = { chemical: 29, metal: 15, machinery: 6, construction: 20 };

for (const key of ['chemical', 'metal', 'machinery', 'construction']) {
  const cfg = INDUSTRY_04B[key];
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
  ['chemical', 'metal', 'machinery', 'construction', 'powergrid', 'auto'].map((k) => {
    const path =
      k === 'chemical'
        ? 'chemical/korea_chemical_map.html'
        : k === 'metal'
          ? 'metal/korea_metal_map.html'
          : k === 'machinery'
            ? 'machinery/korea_machinery_map.html'
            : k === 'construction'
              ? 'construction/korea_construction_map.html'
              : k === 'powergrid'
                ? 'powergrid/korea_powergrid_map.html'
                : 'auto/korea_auto_map.html';
    return [k, extractCompaniesFromHtml(fs.readFileSync(join(ROOT, path), 'utf8'))];
  }),
);

check(!maps.construction.some((c) => c.ticker === '267270'), '267270 still on construction');
check(maps.machinery.some((c) => c.ticker === '267270' && c.chain === '건설기계'), '267270 missing on machinery');
check(maps.machinery.find((c) => c.ticker === '267270')?.name === 'HD건설기계', '267270 name not HD건설기계');
check(!maps.construction.some((c) => c.ticker === '002380'), '002380 still on construction');
check(
  maps.chemical.some((c) => c.ticker === '002380' && c.chain === '정밀·특수화학'),
  '002380 missing on chemical',
);
check(!maps.chemical.some((c) => c.ticker === '004690'), '004690 still on chemical');
check(maps.powergrid.some((c) => c.ticker === '004690' && c.chain === '유틸리티'), '004690 missing on powergrid');
check(!maps.chemical.some((c) => c.ticker === '005090'), '005090 still on chemical');
check(maps.powergrid.some((c) => c.ticker === '005090' && c.chain === '유틸리티'), '005090 missing on powergrid');
check(exclusiveSector('005090') === 'powergrid', 'exclusive 005090');
check(!maps.machinery.some((c) => c.ticker === '437730'), '437730 still on machinery');
check(maps.auto.some((c) => c.ticker === '437730'), '437730 missing on auto');
check(maps.chemical.some((c) => c.ticker === '014820' && c.chain === '포장재'), '014820 missing packaging');
check(maps.chemical.some((c) => c.ticker === '008730' && c.chain === '포장재'), '008730 missing packaging');
check(
  maps.chemical.some((c) => c.ticker === '001570' && c.chain === '정밀·특수화학'),
  '001570 missing chemical',
);

check(exclusiveSector('267270') === 'machinery', 'exclusive 267270');
check(exclusiveSector('002380') === 'chemical', 'exclusive 002380');
check(exclusiveSector('004690') === 'powergrid', 'exclusive 004690');
check(exclusiveSector('437730') === 'auto', 'exclusive 437730');
check(exclusiveSector('005930') === 'bigchip', 'bigchip');

const fields = JSON.parse(fs.readFileSync(join(ROOT, 'data/ticker_field_overrides.json'), 'utf8'));
check(String(fields['009520']?.products || '').includes('포장'), '009520 products');
check(!String(fields['009520']?.products || '').includes('제조업'), '009520 still bad text');

const semi = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'semiconductor/korea_semiconductor_map.html'), 'utf8'),
);
check(semi.length === 92, `semi expected 92, got ${semi.length}`);
const battery = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'battery/korea_battery_map.html'), 'utf8'));
check(battery.length === 26, `battery expected 26, got ${battery.length}`);

console.log('Industry §0-4B verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
