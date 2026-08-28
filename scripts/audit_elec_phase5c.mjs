/**
 * Phase 5C — audit elec sector legacy partners / structure (read-only).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { ELEC_CONFIG } from '../lib/curated_sector_configs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'elec', 'korea_elec_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);

const GLOBALS = (ELEC_CONFIG.globals || []).map((g) => g.id);

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

const legacyClassification = {
  peer: partnerPairs.filter((p) => GLOBALS.includes(p.partner)),
  invalid: partnerPairs.filter((p) => !GLOBALS.includes(p.partner)),
};

const report = {
  asOf: '2026-08-23',
  phase: '5C-audit',
  sectorId: 'elec',
  htmlPath: 'elec/korea_elec_map.html',
  dataSector: 'elec',
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
  globalIds: GLOBALS,
  partnerPairs,
  legacyClassification,
  risks: [
    'partners are string peer labels (murata/panasonic/sony/bosch) — not supply contracts',
    'no DART/URL evidence on legacy partners',
    '077360 semiconductor packaging materials overlap semiconductor sector',
    '011070/192650/049070 automotive electronics overlap auto sector',
    'Samsung/LG group affiliates are separate listed entities — do not merge nodes',
  ],
  networkJsonExists: fs.existsSync(join(ROOT, 'data', 'networks', 'elec.json')),
  priorProfile: {
    model: 'component_supply',
    layout: 'layeredSupplyChain',
    networkPath: null,
    legacyFallback: true,
  },
};

fs.writeFileSync(
  join(ROOT, 'data', 'elec_relation_phase5c_audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  sectorId: 'elec',
  listed: report.listedCompanyCount,
  byChain,
  partnerRefs,
  uniquePartners: partnerIds.size,
  globals: GLOBALS.length,
  networkJsonExists: report.networkJsonExists,
}, null, 2));
