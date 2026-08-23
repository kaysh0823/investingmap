/**
 * Read-only finance structure audit for Phase 3D.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(ROOT, 'finance', 'korea_finance_map.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const companies = extractCompaniesFromHtml(html);

const byChain = {};
const partnerRows = [];
let stringPeer = 0;
let theme = 0;
let labeled = 0;
const noPartners = [];

for (const c of companies) {
  byChain[c.chain] = (byChain[c.chain] || 0) + 1;
  const ps = c.partners || [];
  if (!ps.length) noPartners.push(`${c.ticker}:${c.name}`);
  for (const p of ps) {
    if (typeof p === 'string') {
      stringPeer += 1;
      partnerRows.push({ src: c.ticker, name: c.name, chain: c.chain, tgt: p, kind: 'string' });
    } else if (p.kind === 'theme') {
      theme += 1;
      partnerRows.push({ src: c.ticker, tgt: p.id, kind: 'theme', label: p.edgeLabel });
    } else {
      labeled += 1;
      partnerRows.push({
        src: c.ticker,
        tgt: p.id,
        kind: 'labeled',
        label: p.edgeLabel || '',
      });
    }
  }
}

let globals = [];
const gMatch = html.match(/const globalCompanies = (\[[\s\S]*?\n    \]);/);
if (gMatch) {
  try { globals = Function(`return (${gMatch[1]})`)(); } catch { /* ignore */ }
}

const holdingLike = companies.filter((c) => /지주|금융지주|Holding/i.test(`${c.chain}${c.name}${c.nameEn || ''}`));
const bankLike = companies.filter((c) => /은행|Bank/i.test(`${c.chain}${c.name}`));
const secLike = companies.filter((c) => /증권|자산운용|Securit|Asset/i.test(`${c.chain}${c.name}`));
const insLike = companies.filter((c) => /보험|Insurance|생명|화재|손해/i.test(`${c.chain}${c.name}`));
const cardLike = companies.filter((c) => /카드|캐피탈|Card|Capital/i.test(`${c.chain}${c.name}`));

const out = {
  path: 'finance/korea_finance_map.html',
  dataSector: (html.match(/data-sector="([^"]+)"/) || [])[1],
  listedCount: companies.length,
  byChain,
  partnerEdgeEstimate: partnerRows.length,
  stringPeer,
  theme,
  labeled,
  globalCount: globals.length,
  companiesWithoutPartners: noPartners,
  roles: companies.map((c) => ({ ticker: c.ticker, name: c.name, nameEn: c.nameEn, chain: c.chain })),
  holdingLike: holdingLike.map((c) => `${c.ticker}:${c.name}`),
  bankLike: bankLike.map((c) => `${c.ticker}:${c.name}`),
  secLike: secLike.map((c) => `${c.ticker}:${c.name}`),
  insLike: insLike.map((c) => `${c.ticker}:${c.name}`),
  cardLike: cardLike.map((c) => `${c.ticker}:${c.name}`),
  samplePartners: partnerRows.slice(0, 40),
  globals: globals.map((g) => ({ id: g.id, name: g.name, sector: g.sector })),
  sourceFiles: [
    'finance/korea_finance_map.html',
    'build_korea_finance_map.mjs (if present)',
    'lib/relation_network/profiles.mjs (finance stub)',
  ],
};

fs.writeFileSync(join(ROOT, 'data', '_finance_phase3d_audit.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(
  join(ROOT, 'data', '_finance_companies.json'),
  JSON.stringify(companies.map((c) => ({
    id: c.id, ticker: c.ticker, name: c.name, nameEn: c.nameEn, chain: c.chain, partners: c.partners, market: c.market, mcapWon: c.mcapWon,
  })), null, 2),
);
console.log(JSON.stringify({
  listedCount: out.listedCount,
  byChain: out.byChain,
  partners: out.partnerEdgeEstimate,
  stringPeer,
  labeled,
  theme,
  globals: out.globalCount,
  holdingLike: out.holdingLike,
  chains: Object.keys(byChain),
}, null, 2));
