import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'software', 'korea_software_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const network = fs.existsSync(join(ROOT, 'data/networks/software.json'))
  ? JSON.parse(fs.readFileSync(join(ROOT, 'data/networks/software.json'), 'utf8')) : null;
const profile = NETWORK_PROFILES.software;
const chainCounts = {};
for (const c of companies) chainCounts[c.chain || '(none)'] = (chainCounts[c.chain || '(none)'] || 0) + 1;
const audit = {
  phase: '5H', sector: 'software', auditedAt: '2026-08-29',
  htmlPath: 'software/korea_software_map.html', dataSector: 'software',
  listedCompanyCount: companies.length,
  tickers: companies.map((c) => ({ ticker: c.ticker, nameKo: c.name, chain: c.chain, partners: c.partners || [] })),
  chainCounts,
  partnersTotal: companies.reduce((n, c) => n + (c.partners || []).length, 0),
  profile: { model: profile?.model, layout: profile?.layout, networkPath: profile?.networkPath, lanes: profile?.lanes || network?.lanes },
  network: network ? {
    nodeCount: network.nodes?.length, edgeCount: network.edges?.length,
    legacyFallback: network._legacyFallback === false ? false : true,
    confirmedBusiness: network.metrics?.confirmedBusinessEdgeCount,
    peerEdges: network.metrics?.peerEdgeCount,
    products: network.metrics?.softwareProductCount,
    platforms: network.metrics?.platformNodeCount,
    crossSectorRefs: network.metrics?.crossSectorReferenceCount,
  } : null,
  policyNotes: [
    'No customer logos as active contracts',
    'API integration ≠ strategic partnership',
    'Marketplace listing ≠ supply contract',
    'cp_list must remain 13',
  ],
};
fs.writeFileSync(join(ROOT, 'data/software_relation_phase5h_audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
console.log('OK audit software', companies.length, audit.network);
