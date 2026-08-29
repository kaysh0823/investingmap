/**
 * Phase 5G — write data/medtech_relation_phase5g_audit.json
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'medtech', 'korea_medtech_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const netFp = join(ROOT, 'data', 'networks', 'medtech.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : null;
const profile = NETWORK_PROFILES.medtech;

const chainCounts = {};
for (const c of companies) {
  chainCounts[c.chain || '(none)'] = (chainCounts[c.chain || '(none)'] || 0) + 1;
}

const partnersTotal = companies.reduce((n, c) => n + (c.partners || []).length, 0);
const audit = {
  phase: '5G',
  sector: 'medtech',
  auditedAt: '2026-08-29',
  htmlPath: 'medtech/korea_medtech_map.html',
  dataSector: 'medtech',
  listedCompanyCount: companies.length,
  tickers: companies.map((c) => ({
    ticker: c.ticker,
    nameKo: c.name,
    chain: c.chain,
    partners: c.partners || [],
  })),
  chainCounts,
  partnersTotal,
  emptyChains: ['미용기기'],
  profile: {
    model: profile?.model,
    layout: profile?.layout,
    networkPath: profile?.networkPath,
    lanes: profile?.lanes || network?.lanes,
  },
  network: network ? {
    nodeCount: network.nodes?.length,
    edgeCount: network.edges?.length,
    legacyFallback: network._legacyFallback === false ? false : true,
    confirmedBusiness: network.metrics?.confirmedBusinessEdgeCount ?? null,
    peerEdges: network.metrics?.peerEdgeCount ?? null,
    deviceCategories: network.metrics?.deviceCategoryCount ?? null,
    specialties: network.metrics?.specialtyNodeCount ?? null,
    clearanceNodes: (network.nodes || []).filter((n) => n.type === 'regulatory_clearance').length,
    crossSectorRefs: network.metrics?.crossSectorReferenceCount ?? null,
  } : null,
  policyNotes: [
    'No invented hospital supply or exclusive distribution',
    'Clearance is regulatory status, not sales contract',
    'No clearance nodes without verified authority identifiers',
    'Clinical evidence is not commercial relationship',
    'Cosmetics aesthetic devices curated separately; empty 미용기기 lane omitted',
    'cp_list / koreanCompanies count must remain 10',
  ],
};

const out = join(ROOT, 'data', 'medtech_relation_phase5g_audit.json');
fs.writeFileSync(out, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log('OK audit medtech', companies.length, audit.network);
