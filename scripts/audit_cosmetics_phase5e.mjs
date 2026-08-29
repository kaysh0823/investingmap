/**
 * Phase 5E — audit cosmetics sector legacy partners / structure (read-only).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'cosmetics', 'korea_cosmetics_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);

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
  medtechGlobalPeer: partnerPairs.filter((p) => String(p.partner).startsWith('glob_')),
  invalid: partnerPairs.filter((p) => !String(p.partner).startsWith('glob_')),
};

const report = {
  asOf: '2026-08-23',
  phase: '5E-audit',
  sectorId: 'cosmetics',
  htmlPath: 'cosmetics/korea_cosmetics_map.html',
  dataSector: 'cosmetics',
  buildScript: 'build_korea_cosmetics_map.mjs → scripts/split_kconsume_cosmetics.mjs',
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
  partnerPairs,
  legacyClassification,
  emptyChains: ['원료', '용기'],
  risks: [
    'partners on Hugel (145020) are glob_* medtech globals — not supply contracts or ODM customers',
    'globalCompanies array contains kconsume template leftovers (netflix, disney) — not used as partners',
    '214450 Pharmaresearch primary sector is medtech per split script — cross-sector boundary required',
    'aesthetic device companies overlap medtech; peptide (214370) overlaps bio',
    'ODM customer names must not be inferred from industry estimates',
    'export regions must not become distributes_for or exclusive_distributor_for',
    'brand legal owner vs operator must be separated (002790 holding vs 090430 operating)',
    'Amazon/olive young listing must not become strategic partnership edge',
  ],
  networkJsonExists: fs.existsSync(join(ROOT, 'data', 'networks', 'cosmetics.json')),
  priorProfile: {
    model: 'brand_odm',
    layout: 'platformEcosystem',
    networkPath: null,
    legacyFallback: true,
  },
};

fs.writeFileSync(
  join(ROOT, 'data', 'cosmetics_relation_phase5e_audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  sectorId: 'cosmetics',
  listed: report.listedCompanyCount,
  byChain,
  partnerRefs,
  uniquePartners: partnerIds.size,
  networkJsonExists: report.networkJsonExists,
}, null, 2));
