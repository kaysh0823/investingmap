/**
 * verify:software — Phase 5H
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeSoftwareMetrics } from '../lib/relation_network/software_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_SOFTWARE_IDS } from '../lib/relation_network/software_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const netFp = join(ROOT, 'data/networks/software.json');
check(fs.existsSync(netFp), 'missing software.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `warnings must be 0 (got ${(report.warnings || []).length})`);

const profile = NETWORK_PROFILES.software;
check(profile?.model === 'software_product_platform_ecosystem', 'profile model');
check(profile?.layout === 'softwarePlatformEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/software.json', 'profile networkPath');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5hCuratedAt, 'phase5h curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));
const companies = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'software/korea_software_map.html'), 'utf8'));
const listedExpected = companies.length;
check(listedExpected > 0, `listed empty (got ${listedExpected})`);
check(fs.readFileSync(join(ROOT, 'software/korea_software_map.html'), 'utf8').includes('data-sector="software"'), 'data-sector');
for (const c of companies) check(byId.has(`krx:${c.ticker}`), `missing ${c.ticker}`);

const invent = edges.filter((e) => ['supplies_software_to', 'deployed_at', 'partners_with', 'resells_for', 'awarded_public_contract'].includes(e.type)
  && ['confirmed', 'reported', 'inferred'].includes(e.status));
check(invent.length === 0, `no invented business (got ${invent.length})`);
const peers = edges.filter((e) => e.type === 'peer');
check(peers.length >= 15, `peers demoted (got ${peers.length})`);
check(peers.every((e) => e.defaultHidden === true), 'peers hidden');
const xref = edges.filter((e) => e.type === 'cross_sector_reference');
check(xref.length >= 4 && xref.every((e) => e.excludesFromOrphanResolution === true), 'xref ok');

const metrics = computeSoftwareMetrics(network);
check(metrics.listedCompanyCount === listedExpected, `metrics listed ${listedExpected} (got ${metrics.listedCompanyCount})`);
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed');
check(metrics.zeroDegreeNodeCount === 0, 'zero degree');
for (const id of FORBIDDEN_GENERIC_SOFTWARE_IDS) check(!byId.has(id), `forbidden ${id}`);
for (const [k, v] of Object.entries(metrics.claimCoverage || {})) {
  if (k === 'metricNotes' || !v || typeof v !== 'object') continue;
  const err = validateCoverageMetric(v, `software.${k}`);
  if (err) failures.push(err);
}
console.log(JSON.stringify({
  listed: metrics.listedCompanyCount, nodes: metrics.nodeCount, edges: metrics.edgeCount,
  confirmed: metrics.confirmedBusinessEdgeCount, peers: metrics.peerEdgeCount,
  products: metrics.softwareProductCount, platforms: metrics.platformNodeCount,
  xref: metrics.crossSectorReferenceCount, orphan: metrics.businessRelationOrphanCount,
}, null, 2));
console.log('warnings:', (report.warnings || []).length);
if (failures.length) { console.error(failures); process.exit(1); }
console.log('OK verify:software');
