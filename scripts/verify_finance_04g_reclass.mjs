/**
 * Verify §0-4 batch G (finance / holdings) + Kakao Pay software cross.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { countByChain, validateChainInvariants } from '../lib/chain_reclass_invariants.mjs';
import { FINANCE_04G } from '../lib/finance_04g_chain_ui.mjs';
import { crossSectors, exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const EXPECTED_N = { finance: 50, holdings: 52 };

for (const key of ['finance', 'holdings']) {
  const cfg = FINANCE_04G[key];
  const html = fs.readFileSync(join(ROOT, cfg.html), 'utf8');
  const companies = extractCompaniesFromHtml(html);
  console.log(key, companies.length, countByChain(companies).counts);
  check(companies.length === EXPECTED_N[key], `${key}: expected ${EXPECTED_N[key]}, got ${companies.length}`);
  for (const err of validateChainInvariants(key, companies, { label: key })) failures.push(err);
  const colors = extractChainColors(html);
  for (const chain of cfg.chains) check(colors.includes(chain), `${key}: CHAIN_COLORS missing ${chain}`);
  for (const retired of cfg.retired) {
    check(!colors.includes(retired), `${key}: CHAIN_COLORS still has retired ${retired}`);
    check(!companies.some((c) => c.chain === retired), `${key}: company still on retired ${retired}`);
  }
  for (const c of companies) {
    const forced = chainOverride(key, c.ticker);
    check(!!forced, `${key}: missing override ${c.ticker}`);
    check(forced === c.chain, `${key}: ${c.ticker} override ${forced} != ${c.chain}`);
  }
}

const financeHtml = fs.readFileSync(join(ROOT, 'finance/korea_finance_map.html'), 'utf8');
const holdingsHtml = fs.readFileSync(join(ROOT, 'holdings/korea_holdings_map.html'), 'utf8');
check(!financeHtml.includes('기타금융'), 'finance still mentions 기타금융');
check(holdingsHtml.includes('주요 투자·사업영역'), 'holdings axis label missing');
check(!/const chains = \[[^\]]*(반도체|철강·금속·기계|조선\/해운|IT·소프트웨어)/.test(holdingsHtml), 'holdings filter still has old taxonomy');

const finance = extractCompaniesFromHtml(financeHtml);
const holdings = extractCompaniesFromHtml(holdingsHtml);
const software = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'software/korea_software_map.html'), 'utf8'));

check(finance.some((c) => c.ticker === '377300' && c.chain === '결제·핀테크'), '377300 not finance 결제·핀테크');
check(software.some((c) => c.ticker === '377300' && c.chain === '결제·데이터 인프라'), '377300 not software cross');
check(software.length === 23, `software expected 23, got ${software.length}`);
check(!exclusiveSector('377300'), '377300 still exclusive');
check(
  JSON.stringify(crossSectors('377300')?.slice().sort()) === JSON.stringify(['finance', 'software']),
  '377300 SECTOR_CROSS',
);

for (const t of ['012030', '023590', '032190']) {
  check(holdings.some((c) => c.ticker === t && c.chain === '금융'), `${t} not holdings 금융`);
  check(!software.some((c) => c.ticker === t), `${t} wrongly on software`);
}
check(FINANCE_04G.holdings.chains.length === 9, 'holdings groups != 9');
check(FINANCE_04G.holdings.chains[8] === '금융', 'holdings 금융 not 9th');

check(exclusiveSector('005930') === 'bigchip', 'bigchip');
const kconsume = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'kconsume/korea_kconsume_map.html'), 'utf8'));
check(kconsume.length === 38, `kconsume expected 38, got ${kconsume.length}`);
const shipping = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'shipping/korea_shipping_map.html'), 'utf8'));
check(shipping.length === 6, `shipping expected 6, got ${shipping.length}`);

const hubPath = join(ROOT, 'data', 'hub_index.json');
if (fs.existsSync(hubPath)) {
  const cross = JSON.parse(fs.readFileSync(hubPath, 'utf8')).crossIndex || {};
  check(
    Array.isArray(cross['377300']) &&
      cross['377300'].includes('finance') &&
      cross['377300'].includes('software'),
    'hub crossIndex 377300',
  );
  check(
    Array.isArray(cross['028260']) &&
      cross['028260'].includes('construction') &&
      cross['028260'].includes('kconsume'),
    'hub crossIndex 028260',
  );
  check(
    Array.isArray(cross['034020']) &&
      cross['034020'].includes('nuclear') &&
      cross['034020'].includes('powergrid'),
    'hub crossIndex 034020',
  );
}

console.log('Finance §0-4G verification');
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
