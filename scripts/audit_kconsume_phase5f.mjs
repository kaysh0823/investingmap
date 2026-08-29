/**
 * Audit kconsume for Phase 5F (pre/post migrate snapshot).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'kconsume', 'korea_kconsume_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const profile = NETWORK_PROFILES.kconsume;
const netFp = join(ROOT, 'data', 'networks', 'kconsume.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : null;

const chainCounts = {};
for (const c of companies) {
  chainCounts[c.chain || '(none)'] = (chainCounts[c.chain || '(none)'] || 0) + 1;
}

const audit = {
  phase: '5F',
  sector: 'kconsume',
  auditedAt: new Date().toISOString().slice(0, 10),
  htmlPath: 'kconsume/korea_kconsume_map.html',
  dataSector: 'kconsume',
  listedCompanyCount: companies.length,
  tickers: companies.map((c) => ({ ticker: c.ticker, nameKo: c.name, chain: c.chain })),
  chainCounts,
  profile: {
    model: profile?.model,
    layout: profile?.layout,
    networkPath: profile?.networkPath,
    lanes: profile?.lanes,
  },
  network: network ? {
    nodeCount: network.nodes?.length,
    edgeCount: network.edges?.length,
    legacyFallback: network._legacyFallback,
    confirmedBusiness: network.metrics?.confirmedBusinessEdgeCount,
    peerEdges: (network.edges || []).filter((e) => e.type === 'peer').length,
    brandNodes: (network.nodes || []).filter((n) => n.type === 'brand').length,
    crossSectorRefs: (network.edges || []).filter((e) => e.type === 'cross_sector_reference').length,
  } : null,
  policyNotes: [
    'No invented retail/export contracts',
    'Brand homepage does not confirm owns_brand',
    'Health functional food is not pharmaceutical',
    'cp_list curated HTML count must remain 22',
  ],
};

fs.writeFileSync(
  join(ROOT, 'data', 'kconsume_relation_phase5f_audit.json'),
  `${JSON.stringify(audit, null, 2)}\n`,
  'utf8',
);
console.log('OK audit kconsume', audit.listedCompanyCount, audit.network);
