/**
 * verify:metal — Phase 5D metals & materials value-chain network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeMetalMetrics } from '../lib/relation_network/metal_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_METAL_IDS } from '../lib/relation_network/metal_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'metal.json');
check(fs.existsSync(netFp), 'missing data/networks/metal.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `metal warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.metal;
check(profile?.model === 'metals_material_value_chain', 'profile model');
check(profile?.layout === 'metalsValueChainEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/metal.json', 'profile networkPath');
check(network.model === 'metals_material_value_chain', 'network model');
check(network.layout === 'metalsValueChainEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5dCuratedAt, 'phase5d curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'metal', 'korea_metal_map.html'), 'utf8');
check(html.includes('data-sector="metal"'), 'html data-sector metal');
const companies = extractCompaniesFromHtml(html);
const expectedListed = companies.length;
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const supply = edges.filter((e) => [
  'supplies_material_to', 'supplies_metal_product_to', 'offtake_agreement_with',
  'toll_processes_for', 'awarded_contract',
].includes(e.type) && ['confirmed', 'reported'].includes(e.status));
check(supply.length === 0, `Phase 5D must not invent supply without primary evidence (got ${supply.length})`);

const ownership = edges.filter((e) => (e.type === 'owns' || e.type === 'owns_stake_in' || e.type === 'owns_facility')
  && ['confirmed', 'reported'].includes(e.status));
check(ownership.length === 0, `Phase 5D ownership without DART (got ${ownership.length})`);

const commodityAsSupply = edges.filter((e) => e.type === 'exposed_to_commodity'
  && ['confirmed', 'reported'].includes(e.status));
check(commodityAsSupply.length === 0, 'commodity exposure must not be confirmed/reported business');

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length > 0, 'legacy peers should be migrated');
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const crossRef = edges.filter((e) => e.type === 'cross_sector_reference');
check(crossRef.length >= 5, `cross_sector_reference boundary refs (got ${crossRef.length})`);
check(crossRef.every((e) => e.status === 'reference'), 'cross_sector_reference is reference only');
check(crossRef.every((e) => e.excludesFromBusinessCoverage === true), 'cross_sector excludes business coverage');

const metrics = computeMetalMetrics(network);
check(metrics.listedCompanyCount === expectedListed, `metrics listed ${expectedListed}`);
check(metrics.actualSupplyRelationshipCount === 0, 'no actual supply');
check(metrics.ownershipEdgeCount === 0 || ownership.length === 0, 'no ownership business edges');
check(metrics.crossSectorReferenceCount >= 5, 'cross sector refs in metrics');
check(metrics.commodityExposureCount > 0, 'commodity exposure structural edges exist');

for (const id of FORBIDDEN_GENERIC_METAL_IDS) {
  check(!byId.has(id), `forbidden generic node ${id}`);
}

const degree = new Map();
for (const e of edges) {
  degree.set(e.source, (degree.get(e.source) || 0) + 1);
  degree.set(e.target, (degree.get(e.target) || 0) + 1);
}
const zeroDegree = nodes.filter((n) => (degree.get(n.id) || 0) === 0);
function isAllowedZeroDegreeNode(n) {
  if (n.entityRole === 'boundary_placeholder') return true;
  if (n.type === 'cross_sector_anchor' && n.isMapConstituent === false) return true;
  if (n.type === 'end_market' && n.excludedFromLayout === true) return true;
  if (n.type === 'business_category' && n.excludedFromLayout === true) return true;
  return false;
}
for (const n of zeroDegree) {
  check(isAllowedZeroDegreeNode(n), `unexpected zero-degree node ${n.id} (type=${n.type})`);
}

const cc = metrics.claimCoverage || {};
for (const key of [
  'businessRelationshipDirectEvidenceCoverage',
  'businessRelationshipPrimarySourceCoverage',
  'supplyDirectEvidenceCoverage',
  'supplyPrimarySourceCoverage',
  'ownershipPrimarySourceCoverage',
  'commodityExposureEvidenceCoverage',
]) {
  const val = cc[key];
  if (!val) continue;
  const err = validateCoverageMetric(val, `metal.${key}`);
  if (err) failures.push(err);
}

console.log('metal 5D metrics:', JSON.stringify({
  listedCompanyCount: metrics.listedCompanyCount,
  nodeCount: metrics.nodeCount,
  edgeCount: metrics.edgeCount,
  structuralGeneratedEdgeCount: metrics.structuralGeneratedEdgeCount,
  legacyMigratedEdgeCount: metrics.legacyMigratedEdgeCount,
  peerEdgeCount: metrics.peerEdgeCount,
  crossSectorReferenceCount: metrics.crossSectorReferenceCount,
  commodityExposureCount: metrics.commodityExposureCount,
  businessRelationOrphanCount: metrics.businessRelationOrphanCount,
  classificationOnlyCompanyCount: metrics.classificationOnlyCompanyCount,
  zeroDegreeNodeCount: metrics.zeroDegreeNodeCount,
  nodeCountByType: metrics.nodeCountByType,
  claimCoverage: cc,
}, null, 2));

console.log(`warnings: ${(report.warnings || []).length}`);
if (failures.length) {
  console.error('FAILURES:', failures);
  process.exitCode = 1;
} else {
  console.log('OK verify:metal');
}
