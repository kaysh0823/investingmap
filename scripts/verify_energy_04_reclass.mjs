/**
 * Verify §0-4 energy chain reclass (battery / renewable / nuclear / powergrid).
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
import { ENERGY_04 } from '../lib/energy_04_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const EXPECTED_N = { battery: 26, renewable: 13, nuclear: 9, powergrid: 18 };

for (const key of ['battery', 'renewable', 'nuclear', 'powergrid']) {
  const cfg = ENERGY_04[key];
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

const maps = {
  battery: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'battery/korea_battery_map.html'), 'utf8')),
  renewable: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'renewable/korea_renewable_map.html'), 'utf8')),
  powergrid: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'powergrid/korea_powergrid_map.html'), 'utf8')),
  chemical: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'chemical/korea_chemical_map.html'), 'utf8')),
};

check(!maps.battery.some((c) => c.ticker === '126340'), '126340 still on battery');
check(
  maps.renewable.some((c) => c.ticker === '126340' && c.chain === '수소·연료전지'),
  '126340 missing on renewable',
);
check(!maps.renewable.some((c) => c.ticker === '119850'), '119850 still on renewable');
check(
  maps.powergrid.some((c) => c.ticker === '119850' && c.chain === '발전·비상전원 설비'),
  '119850 missing on powergrid',
);
check(!maps.renewable.some((c) => c.ticker === '018670'), '018670 still on renewable');
check(maps.chemical.some((c) => c.ticker === '018670' && c.chain === '가스'), '018670 missing on chemical');
check(exclusiveSector('126340') === 'renewable', 'exclusive 126340');
check(exclusiveSector('119850') === 'powergrid', 'exclusive 119850');
check(exclusiveSector('018670') === 'chemical', 'exclusive 018670');

check(!maps.battery.some((c) => c.ticker === '001570'), '001570 still on battery');
check(
  maps.renewable.some((c) => c.ticker === '044490' && c.chain === '구조물·보조설비'),
  '044490 not renewable 구조물·보조설비',
);
check(
  maps.battery.some((c) => c.ticker === '222080' && c.chain === '제조·검사 장비'),
  '222080 not battery 제조·검사 장비',
);
check(exclusiveSector('001570') === 'chemical', 'exclusive 001570');
check(exclusiveSector('044490') === 'renewable', 'exclusive 044490');
check(exclusiveSector('222080') === 'battery', 'exclusive 222080');
check(
  maps.powergrid.some((c) => c.ticker === '005090' && c.chain === '유틸리티'),
  '005090 not powergrid 유틸리티',
);
check(!maps.chemical.some((c) => c.ticker === '005090'), '005090 still chemical');
check(exclusiveSector('005090') === 'powergrid', 'exclusive 005090');
check(
  maps.powergrid.some((c) => c.ticker === '034020' && c.chain === '발전·비상전원 설비'),
  '034020 not powergrid cross',
);
check(!exclusiveSector('034020'), '034020 still exclusive');

const fields = JSON.parse(fs.readFileSync(join(ROOT, 'data/ticker_field_overrides.json'), 'utf8'));
check(!String(fields['005090']?.products || '').includes('정유'), '005090 products still mentions 정유');
check(String(fields['005090']?.products || '').includes('집단에너지'), '005090 products missing 집단에너지');
check(!String(fields['278280']?.products || '').includes('윤활'), '278280 still mentions 윤활');
check(String(fields['278280']?.products || '').includes('전해질'), '278280 missing 전해질');
check(String(fields['271940']?.products || '').includes('Type4'), '271940 missing Type4');
check(!String(fields['271940']?.products || '').includes('알루미늄리튬전지'), '271940 still old materials text');
check(String(fields['100840']?.products || '').includes('열교환기'), '100840 products');
check(String(fields['006910']?.products || '').includes('내진'), '006910 products');

const semi = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'semiconductor/korea_semiconductor_map.html'), 'utf8'),
);
check(semi.length === 92, `semi expected 92, got ${semi.length}`);
check(!semi.some((c) => c.ticker === '005930' || c.ticker === '000660'), 'bigchip on semi');
check(exclusiveSector('005930') === 'bigchip', 'bigchip 005930');
check(exclusiveSector('000660') === 'bigchip', 'bigchip 000660');

console.log('Energy §0-4 verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
