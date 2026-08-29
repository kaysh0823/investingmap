import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'telecom', 'korea_telecom_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const network = fs.existsSync(join(ROOT, 'data/networks/telecom.json'))
  ? JSON.parse(fs.readFileSync(join(ROOT, 'data/networks/telecom.json'), 'utf8')) : null;
const profile = NETWORK_PROFILES.telecom;
const chainCounts = {};
for (const c of companies) chainCounts[c.chain || '(none)'] = (chainCounts[c.chain || '(none)'] || 0) + 1;
const audit = {
  phase: '5H', sector: 'telecom', auditedAt: '2026-08-29',
  htmlPath: 'telecom/korea_telecom_map.html', dataSector: 'telecom',
  listedCompanyCount: companies.length,
  tickers: companies.map((c) => ({ ticker: c.ticker, nameKo: c.name, chain: c.chain, partners: c.partners || [] })),
  chainCounts,
  partnersTotal: companies.reduce((n, c) => n + (c.partners || []).length, 0),
  emptyChains: ['위성통신'],
  profile: { model: profile?.model, layout: profile?.layout, networkPath: profile?.networkPath, lanes: profile?.lanes || network?.lanes },
  network: network ? {
    nodeCount: network.nodes?.length, edgeCount: network.edges?.length,
    legacyFallback: network._legacyFallback === false ? false : true,
    confirmedBusiness: network.metrics?.confirmedBusinessEdgeCount,
    peerEdges: network.metrics?.peerEdgeCount,
    services: network.metrics?.telecomServiceCount,
    equipment: network.metrics?.equipmentNodeCount,
    licenseNodes: (network.nodes || []).filter((n) => n.type === 'license_or_allocation').length,
    crossSectorRefs: network.metrics?.crossSectorReferenceCount,
  } : null,
  policyNotes: [
    'Spectrum assignment is not company ownership',
    'No license nodes without official identifiers',
    'Certification ≠ equipment supply',
    'Empty 위성통신 lane omitted',
    'cp_list must remain 11',
  ],
};
fs.writeFileSync(join(ROOT, 'data/telecom_relation_phase5h_audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
console.log('OK audit telecom', companies.length, audit.network);
