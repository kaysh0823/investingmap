/**
 * Verify needs_review closure: moves, new groups, residual flags.
 * Residual needs_review must be empty (taxonomy gaps 001740/126560 are not needs_review).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { INDUSTRY_04B } from '../lib/industry_04b_chain_ui.mjs';
import { FINANCE_04G } from '../lib/finance_04g_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

function load(rel) {
  return extractCompaniesFromHtml(fs.readFileSync(join(ROOT, rel), 'utf8'));
}
function bioCompanies() {
  const src = fs.readFileSync(join(ROOT, 'bio/korea_bio_map.inline.js'), 'utf8');
  const match = src.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  return Function(`"use strict"; return (${match[1]});`)();
}

const maps = {
  semi: load('semiconductor/korea_semiconductor_map.html'),
  bio: bioCompanies(),
  battery: load('battery/korea_battery_map.html'),
  chemical: load('chemical/korea_chemical_map.html'),
  ship: load('ship/korea_ship_map.html'),
  renewable: load('renewable/korea_renewable_map.html'),
  powergrid: load('powergrid/korea_powergrid_map.html'),
  holdings: load('holdings/korea_holdings_map.html'),
  kcontent: load('kcontent/korea_kcontent_map.html'),
  bigchip: load('bigchip/korea_bigchip_map.html'),
};

check(maps.semi.length === 92, `semi ${maps.semi.length}`);
check(maps.bio.length === 66, `bio ${maps.bio.length}`);
check(maps.battery.length === 26, `battery ${maps.battery.length}`);
check(maps.chemical.length === 29, `chemical ${maps.chemical.length}`);
check(maps.ship.length === 17, `ship ${maps.ship.length}`);
check(maps.renewable.length === 13, `renewable ${maps.renewable.length}`);
check(maps.powergrid.length === 17, `powergrid ${maps.powergrid.length}`);
check(maps.holdings.length === 52, `holdings ${maps.holdings.length}`);

check(
  maps.semi.some((c) => c.ticker === '082270' && c.chain === '팹 인프라·지원설비'),
  '082270 not on semi',
);
check(!maps.bio.some((c) => c.ticker === '082270'), '082270 still bio');
check(
  maps.chemical.some((c) => c.ticker === '001570' && c.chain === '정밀·특수화학'),
  '001570 not chemical',
);
check(!maps.battery.some((c) => c.ticker === '001570'), '001570 still battery');
check(
  maps.renewable.some((c) => c.ticker === '044490' && c.chain === '구조물·보조설비'),
  '044490 not renewable',
);
check(!maps.ship.some((c) => c.ticker === '044490'), '044490 still ship');

check(
  maps.powergrid.some((c) => c.ticker === '005090' && c.chain === '유틸리티'),
  '005090 not powergrid 유틸리티',
);
check(!maps.chemical.some((c) => c.ticker === '005090'), '005090 still chemical');
check(exclusiveSector('005090') === 'powergrid', 'excl 005090');

check(maps.holdings.some((c) => c.ticker === '004800' && c.chain === '복합사업'), '004800');
check(maps.holdings.some((c) => c.ticker === '012030' && c.chain === '금융'), '012030 금융');
check(maps.holdings.some((c) => c.ticker === '023590' && c.chain === '금융'), '023590 금융');
check(maps.holdings.some((c) => c.ticker === '032190' && c.chain === '금융'), '032190 금융');
check(maps.kcontent.some((c) => c.ticker === '035760' && c.chain === '방송·스트리밍'), '035760');

check(maps.chemical.some((c) => c.ticker === '014820' && c.chain === '포장재'), '014820');
check(maps.chemical.some((c) => c.ticker === '008730' && c.chain === '포장재'), '008730');

check(FINANCE_04G.holdings.chains.length === 9, 'holdings groups');
check(FINANCE_04G.holdings.chains[8] === '금융', 'holdings 금융 9th');
check(INDUSTRY_04B.chemical.chains.length === 10, 'chemical groups');
check(INDUSTRY_04B.chemical.chains[9] === '포장재', 'chemical 포장재 10th');

const holdHtml = fs.readFileSync(join(ROOT, 'holdings/korea_holdings_map.html'), 'utf8');
const chemHtml = fs.readFileSync(join(ROOT, 'chemical/korea_chemical_map.html'), 'utf8');
check(extractChainColors(holdHtml).includes('금융'), 'holdings CHAIN_COLORS 금융');
check(extractChainColors(chemHtml).includes('포장재'), 'chemical CHAIN_COLORS 포장재');
check(holdHtml.includes("'금융'"), 'holdings filter 금융');
check(chemHtml.includes("'포장재'"), 'chemical filter 포장재');

check(exclusiveSector('082270') === 'semi', 'excl 082270');
check(exclusiveSector('001570') === 'chemical', 'excl 001570');
check(exclusiveSector('044490') === 'renewable', 'excl 044490');
check(exclusiveSector('005930') === 'bigchip', 'bigchip');
check(maps.bigchip.length === 2, 'bigchip n');

const fields = JSON.parse(fs.readFileSync(join(ROOT, 'data/ticker_field_overrides.json'), 'utf8'));
check(!String(fields['005090']?.products || '').includes('정유'), '005090 products still 정유');
const residual = [];
for (const [t, row] of Object.entries(fields)) {
  if (t.startsWith('_')) continue;
  if (row?.needs_review === true) residual.push(t);
  for (const by of Object.values(row?.byIndustry || {})) {
    if (by?.needs_review === true) residual.push(t);
  }
}
const residualUnique = [...new Set(residual)];
check(residualUnique.length === 0, `unexpected needs_review residual: ${residualUnique.join(',')}`);

check(!maps.chemical.some((c) => c.ticker === '126560'), '126560 not auto chemical');
check(!maps.holdings.some((c) => c.ticker === '001740'), '001740 not on holdings');

console.log('needs_review closure verification');
console.log('counts', Object.fromEntries(Object.entries(maps).map(([k, v]) => [k, v.length])));
console.log('residual needs_review', residualUnique);
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
