/**
 * Verify §0-4 batch D (elec / software / telecom / robot) + cross-moves.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { countByChain, validateChainInvariants } from '../lib/chain_reclass_invariants.mjs';
import { TECH_04D } from '../lib/tech_04d_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const EXPECTED_N = { elec: 29, software: 23, telecom: 10, robot: 15 };

for (const key of ['elec', 'software', 'telecom', 'robot']) {
  const cfg = TECH_04D[key];
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
    ['elec', 'elec/korea_elec_map.html'],
    ['software', 'software/korea_software_map.html'],
    ['telecom', 'telecom/korea_telecom_map.html'],
    ['robot', 'robot/korea_robot_map.html'],
    ['battery', 'battery/korea_battery_map.html'],
    ['semi', 'semiconductor/korea_semiconductor_map.html'],
    ['auto', 'auto/korea_auto_map.html'],
  ].map(([k, p]) => [k, extractCompaniesFromHtml(fs.readFileSync(join(ROOT, p), 'utf8'))]),
);

check(!maps.elec.some((c) => c.ticker === '222080'), '222080 still on elec');
check(
  maps.battery.some((c) => c.ticker === '222080' && c.chain === '제조·검사 장비'),
  '222080 missing on battery',
);
check(maps.battery.find((c) => c.ticker === '222080')?.name === 'SFA넥셀', '222080 name');
check(!maps.elec.some((c) => c.ticker === '077360'), '077360 still on elec');
check(
  maps.semi.some((c) => c.ticker === '077360' && c.chain === '기판·패키징 소재'),
  '077360 missing on semi',
);
check(!maps.robot.some((c) => c.ticker === '125490'), '125490 still on robot');
check(
  maps.auto.some((c) => c.ticker === '125490' && c.chain === '차체·내외장'),
  '125490 missing on auto',
);
check(!maps.telecom.some((c) => c.ticker === '126560'), '126560 still on telecom');
check(maps.telecom.some((c) => c.ticker === '189300' && c.chain === '위성통신 장비'), '189300 chain');

check(maps.battery.length === 26, `battery expected 26, got ${maps.battery.length}`);
check(maps.semi.length === 92, `semi expected 92, got ${maps.semi.length}`);
check(maps.auto.length === 28, `auto expected 28, got ${maps.auto.length}`);
check(
  maps.software.some((c) => c.ticker === '377300' && c.chain === '결제·데이터 인프라'),
  '377300 software cross',
);

check(exclusiveSector('222080') === 'battery', 'exclusive 222080');
check(exclusiveSector('077360') === 'semi', 'exclusive 077360');
check(exclusiveSector('125490') === 'auto', 'exclusive 125490');
check(exclusiveSector('005930') === 'bigchip', 'bigchip 005930');
check(exclusiveSector('000660') === 'bigchip', 'bigchip 000660');

const chemical = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'chemical/korea_chemical_map.html'), 'utf8'),
);
check(chemical.length === 29, `chemical expected 29, got ${chemical.length}`);
const defense = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'defense/korea_defense_map.html'), 'utf8'),
);
check(defense.length === 13, `defense expected 13, got ${defense.length}`);

console.log('Tech §0-4D verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
