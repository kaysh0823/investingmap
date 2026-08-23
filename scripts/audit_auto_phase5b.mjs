/**
 * Phase 5B — audit auto sector legacy partners / structure (read-only).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'auto', 'korea_auto_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);

const GLOBALS = [
  'toyota', 'gm', 'vw', 'stellantis', 'bosch', 'continental', 'denso', 'zf',
  'michelin', 'bridgestone', 'goodyear', 'nvidia', 'mahindra',
];

const byChain = {};
let partnerRefs = 0;
const partnerIds = new Set();
const partnerPairs = [];
for (const c of companies) {
  byChain[c.chain] = (byChain[c.chain] || 0) + 1;
  for (const p of c.partners || []) {
    partnerRefs += 1;
    partnerIds.add(p);
    partnerPairs.push({ ticker: c.ticker, name: c.name, partner: p, chain: c.chain });
  }
}

const report = {
  asOf: '2026-08-23',
  phase: '5B-audit',
  listedCompanyCount: companies.length,
  byChain,
  tickers: companies.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    nameEn: c.nameEn,
    chain: c.chain,
    semType: c.semType,
    products: c.products,
    partners: c.partners || [],
  })),
  partnerEdgeRefs: partnerRefs,
  uniquePartnerIds: [...partnerIds],
  stringPeerCount: partnerRefs,
  urlEvidenceRelationCount: 0,
  globalCompanyCount: GLOBALS.length,
  partnerPairs,
  risks: [
    'partners are string peer/theme labels — not supply contracts',
    'OEM names as partners of OEMs are peer comparisons, not sales',
    'parts companies partnering Bosch/Continental are peer, not customer',
    'no DART/URL evidence on legacy partners',
    'Hyundai group affiliation is not encoded as group_member edges',
  ],
  networkJsonExists: fs.existsSync(join(ROOT, 'data', 'networks', 'auto.json')),
};

fs.writeFileSync(
  join(ROOT, 'data', 'auto_relation_phase5b_audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  listed: report.listedCompanyCount,
  byChain,
  partnerRefs,
  uniquePartners: partnerIds.size,
  globals: GLOBALS.length,
  tickers: companies.map((c) => `${c.ticker} ${c.name}`),
}, null, 2));
