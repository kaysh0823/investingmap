/**
 * Verify §0-4 batch C (auto / ship / shipping / defense) + Intellian telecom move.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { countByChain, validateChainInvariants } from '../lib/chain_reclass_invariants.mjs';
import { MOBILITY_04C } from '../lib/mobility_04c_chain_ui.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

/** Spec auto=25 but 000430/010690 below mcap floor — on-map 24. */
const EXPECTED_N = { auto: 28, ship: 17, shipping: 6, defense: 13 };

for (const key of ['auto', 'ship', 'shipping', 'defense']) {
  const cfg = MOBILITY_04C[key];
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
  ['auto', 'ship', 'shipping', 'defense', 'telecom'].map((k) => {
    const path =
      k === 'auto'
        ? 'auto/korea_auto_map.html'
        : k === 'ship'
          ? 'ship/korea_ship_map.html'
          : k === 'shipping'
            ? 'shipping/korea_shipping_map.html'
            : k === 'defense'
              ? 'defense/korea_defense_map.html'
              : 'telecom/korea_telecom_map.html';
    return [k, extractCompaniesFromHtml(fs.readFileSync(join(ROOT, path), 'utf8'))];
  }),
);

check(!maps.defense.some((c) => c.ticker === '189300'), '189300 still on defense');
check(
  maps.telecom.some((c) => c.ticker === '189300' && c.chain === '위성통신 장비'),
  '189300 missing on telecom',
);
check(
  maps.auto.some((c) => c.ticker === '437730' && c.chain === '구동·파워트레인'),
  '437730 not 구동·파워트레인',
);
check(!maps.auto.some((c) => c.ticker === '000430' || c.ticker === '010690'), 'below-floor auto still on map');
check(maps.shipping.length === 6, `shipping expected 6, got ${maps.shipping.length}`);
check(
  maps.shipping.some((c) => c.ticker === '086280' && c.chain === '자동차·특수화물 운송'),
  '086280 missing on shipping',
);
check(maps.shipping.some((c) => c.ticker === '000120' && c.chain === '종합물류'), '000120 missing on shipping');
check(!maps.ship.some((c) => c.ticker === '044490'), '044490 still on ship');

check(maps.defense.find((c) => c.ticker === '012450')?.chain === '육상체계', '012450 not 육상체계');
check(
  maps.defense.find((c) => c.ticker === '079550')?.name === 'LIG디펜스앤에어로스페이스',
  '079550 name',
);

check(exclusiveSector('189300') === 'telecom', 'exclusive 189300');
check(exclusiveSector('437730') === 'auto', 'exclusive 437730');
check(exclusiveSector('012450') === 'defense', 'exclusive 012450');
check(exclusiveSector('005930') === 'bigchip', 'bigchip');

const fields = JSON.parse(fs.readFileSync(join(ROOT, 'data/ticker_field_overrides.json'), 'utf8'));
check(String(fields['012450']?.products || '').includes('지상방산'), '012450 products');
check(fields['079550']?.name === 'LIG디펜스앤에어로스페이스', '079550 field name');

const semi = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'semiconductor/korea_semiconductor_map.html'), 'utf8'),
);
check(semi.length === 92, `semi expected 92, got ${semi.length}`);
const chemical = extractCompaniesFromHtml(
  fs.readFileSync(join(ROOT, 'chemical/korea_chemical_map.html'), 'utf8'),
);
check(chemical.length === 29, `chemical expected 29, got ${chemical.length}`);
const battery = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'battery/korea_battery_map.html'), 'utf8'));
check(battery.length === 26, `battery expected 26, got ${battery.length}`);
check(maps.auto.some((c) => c.ticker === '125490' && c.chain === '차체·내외장'), '125490 on auto');

console.log('Mobility §0-4C verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
