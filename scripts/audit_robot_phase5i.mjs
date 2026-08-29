/**
 * Phase 5I robot legacy audit snapshot.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'robot', 'korea_robot_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const network = fs.existsSync(join(ROOT, 'data/networks/robot.json'))
  ? JSON.parse(fs.readFileSync(join(ROOT, 'data/networks/robot.json'), 'utf8')) : null;
const profile = NETWORK_PROFILES.robot;
const chainCounts = {};
for (const c of companies) chainCounts[c.chain || '(none)'] = (chainCounts[c.chain || '(none)'] || 0) + 1;

const partnerRows = [];
let partnersTotal = 0;
for (const c of companies) {
  for (const p of c.partners || []) {
    partnersTotal += 1;
    const pid = typeof p === 'string' ? p : p.id;
    const kind = typeof p === 'object' && p.kind ? p.kind : null;
    let classification = 'peer';
    if (['samsung_eco', 'doosan_grp', 'hyundai_mt'].includes(pid)) classification = 'theme/reference';
    else if (pid === 'doosan_robot') classification = 'inferred customer/supplier';
    else if (kind === 'backing') classification = 'theme/reference';
    partnerRows.push({
      ticker: c.ticker, partner: pid, kind, classification,
      edgeLabel: typeof p === 'object' ? p.edgeLabel || null : null,
    });
  }
}

const audit = {
  phase: '5I', sector: 'robot', auditedAt: '2026-08-29',
  htmlPath: 'robot/korea_robot_map.html',
  dataSector: (html.match(/data-sector="([^"]+)"/) || [])[1] || null,
  listedCompanyCount: companies.length,
  tickers: companies.map((c) => ({
    ticker: c.ticker, nameKo: c.name, chain: c.chain,
    products: c.products, partners: (c.partners || []).map((p) => (typeof p === 'string' ? p : p.id)),
  })),
  chainCounts,
  partnersTotal,
  partnerClassification: partnerRows,
  semiProfileLeak: {
    bodySemi: html.includes('<body data-sector="semi">'),
    dataSectorRobot: html.includes('data-sector="robot"'),
    semiconductorFooterLink: html.includes('korea_semiconductor'),
    networkPathWasNull: true,
    legacyFallbackWasTrue: true,
  },
  profile: {
    model: profile?.model, layout: profile?.layout,
    networkPath: profile?.networkPath, lanes: profile?.lanes || network?.lanes,
  },
  network: network ? {
    nodeCount: network.nodes?.length, edgeCount: network.edges?.length,
    legacyFallback: network._legacyFallback === false ? false : true,
    confirmedBusiness: network.metrics?.confirmedBusinessEdgeCount,
    peerEdges: network.metrics?.peerEdgeCount,
    products: network.metrics?.robotProductCount,
    categories: network.metrics?.robotCategoryCount,
    crossSectorRefs: network.metrics?.crossSectorReferenceCount,
    partnerClassCounts: network.metrics?.legacyPartnerClassCounts,
  } : null,
  policyNotes: [
    'Do not promote legacy partners to confirmed business',
    'Investment/theme ≠ supply or deployment',
    'Motion/servo label to cobot OEM is inferred, not confirmed supply',
    'Empty medical/defense robot lanes omitted',
    'cp_list must remain 17',
  ],
};
fs.writeFileSync(join(ROOT, 'data/robot_relation_phase5i_audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
console.log('OK audit robot', companies.length, audit.network);
