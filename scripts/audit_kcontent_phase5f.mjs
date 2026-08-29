/**
 * Audit kcontent for Phase 5F (pre/post migrate snapshot).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'kcontent', 'korea_kcontent_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const profile = NETWORK_PROFILES.kcontent;
const netFp = join(ROOT, 'data', 'networks', 'kcontent.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : null;

const chainCounts = {};
for (const c of companies) {
  chainCounts[c.chain || '(none)'] = (chainCounts[c.chain || '(none)'] || 0) + 1;
}

const audit = {
  phase: '5F',
  sector: 'kcontent',
  auditedAt: new Date().toISOString().slice(0, 10),
  htmlPath: 'kcontent/korea_kcontent_map.html',
  dataSector: 'kcontent',
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
    artistNodes: (network.nodes || []).filter((n) => n.type === 'artist_or_group').length,
    contentIpNodes: (network.nodes || []).filter((n) => n.type === 'content_ip').length,
    crossSectorRefs: (network.edges || []).filter((e) => e.type === 'cross_sector_reference').length,
  } : null,
  policyNotes: [
    'No fan-list artist expansion',
    'Platform availability ≠ exclusive distribution',
    'Producer ≠ automatic IP owner',
    'Artist exclusive terms unknown → not permanent active',
    'cp_list HTML count must remain 20',
  ],
};

fs.writeFileSync(
  join(ROOT, 'data', 'kcontent_relation_phase5f_audit.json'),
  `${JSON.stringify(audit, null, 2)}\n`,
  'utf8',
);
console.log('OK audit kcontent', audit.listedCompanyCount, audit.network);
