/**
 * verify:elec — Phase 5C electrical & electronics value-chain network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeElecMetrics } from '../lib/relation_network/elec_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';

import { FORBIDDEN_GENERIC_PRODUCT_IDS } from '../lib/relation_network/elec_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'elec.json');
check(fs.existsSync(netFp), 'missing data/networks/elec.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `elec warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.elec;
check(profile?.model === 'electronics_component_value_chain', 'profile model');
check(profile?.layout === 'electronicsValueChainEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/elec.json', 'profile networkPath');
check(network.model === 'electronics_component_value_chain', 'network model');
check(network.layout === 'electronicsValueChainEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5cCuratedAt, 'phase5c curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'elec', 'korea_elec_map.html'), 'utf8');
check(html.includes('data-sector="elec"'), 'html data-sector elec');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 24, `listed count must stay 24 (got ${companies.length})`);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const supply = edges.filter((e) => [
  'supplies_component_to', 'supplies_module_to', 'supplies_material_to',
  'supplies_equipment_to', 'manufactures_for', 'awarded_contract', 'nominated_supplier_for',
].includes(e.type) && ['confirmed', 'reported'].includes(e.status));
check(supply.length === 0, `Phase 5C must not invent supply without primary evidence (got ${supply.length})`);

const ownership = edges.filter((e) => e.type === 'owns' || e.type === 'owns_stake_in');
check(ownership.length === 0, `Phase 5C ownership without DART (got ${ownership.length})`);

const deviceAdopt = edges.filter((e) => ['used_in_device', 'used_in_product_family', 'designed_for', 'certified_for'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(deviceAdopt.length === 0, `Phase 5C device adoption without evidence (got ${deviceAdopt.length})`);

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length > 0, 'legacy peers should be migrated');
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const crossRef = edges.filter((e) => e.type === 'cross_sector_reference');
check(crossRef.length >= 4, `cross_sector_reference boundary refs (got ${crossRef.length})`);
check(crossRef.every((e) => e.status === 'reference'), 'cross_sector_reference is reference only');

const metrics = computeElecMetrics(network);
check(metrics.listedCompanyCount === 24, 'metrics listed 24');
check(metrics.actualSupplyRelationshipCount === 0, 'no actual supply');
check(metrics.deviceAdoptionRelationshipCount === 0, 'no device adoption business edges');
check(metrics.ownershipEdgeCount === 0, 'no ownership edges');
check(metrics.crossSectorReferenceCount >= 4, 'cross sector refs in metrics');

const cc = metrics.claimCoverage || {};
for (const key of [
  'supplyDirectEvidenceCoverage',
  'supplyPrimarySourceCoverage',
  'deviceAdoptionDirectEvidenceCoverage',
  'deviceAdoptionPrimarySourceCoverage',
  'ownershipDirectEvidenceCoverage',
  'ownershipPrimarySourceCoverage',
  'businessRelationshipDirectEvidenceCoverage',
]) {
  const m = cc[key];
  check(m?.denominator === 0, `${key} denominator 0`);
  check(m?.percentage == null, `${key} percentage null`);
  check(m?.displayValue === 'N/A', `${key} displayValue N/A`);
  check(m?.applicable === false, `${key} applicable false`);
  const err = validateCoverageMetric(m, key);
  check(!err, err || `${key} valid`);
}

const tickers = new Set();
for (const n of nodes) {
  if (n.type === 'listed_company' && n.ticker) {
    check(!tickers.has(n.ticker), `duplicate ticker ${n.ticker}`);
    tickers.add(n.ticker);
  }
  if (n.type === 'global_company' && n.ticker && /^\d{6}$/.test(String(n.ticker))) {
    failures.push(`global node ${n.id} has KR ticker`);
  }
}

const nodeIds = new Set(nodes.map((n) => n.id));
check(nodeIds.size === nodes.length, 'duplicate node ids');
const edgeIds = new Set(edges.map((e) => e.id));
check(edgeIds.size === edges.length, 'duplicate edge ids');

const degree = new Map(nodes.map((n) => [n.id, 0]));
for (const e of edges) {
  degree.set(e.source, (degree.get(e.source) || 0) + 1);
  degree.set(e.target, (degree.get(e.target) || 0) + 1);
}
const zeroDegree = nodes.filter((n) => (degree.get(n.id) || 0) === 0);
/** Role-based zero-degree allowlist (no hardcoded node IDs). */
function isAllowedZeroDegreeNode(n) {
  if (n.entityRole === 'boundary_placeholder') return true;
  if (n.type === 'cross_sector_anchor' && n.isMapConstituent === false) return true;
  if (n.type === 'end_market') return true;
  return false;
}
for (const n of zeroDegree) {
  check(isAllowedZeroDegreeNode(n), `unexpected zero-degree node ${n.id} (type=${n.type}, entityRole=${n.entityRole || 'none'})`);
}
for (const id of FORBIDDEN_GENERIC_PRODUCT_IDS) {
  check(!byId.has(id), `forbidden generic node ${id}`);
}

const productNodes = nodes.filter((n) => n.type === 'product');
const componentNodes = nodes.filter((n) => n.type === 'component');
const sharedTargets = {};
for (const e of edges.filter((x) => x.type === 'specializes_in' || x.type === 'manufactures')) {
  sharedTargets[e.target] = sharedTargets[e.target] || new Set();
  sharedTargets[e.target].add(e.source);
}
const sharedProductNodeCount = Object.values(sharedTargets).filter((s) => s.size > 1).length;
const nodeMetrics = {
  nodeCountByType: Object.fromEntries(
    [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length]),
  ),
  connectedNodeCount: nodes.filter((n) => (degree.get(n.id) || 0) > 0).length,
  zeroDegreeNodeCount: zeroDegree.length,
  aliasNodeCount: nodes.filter((n) => n.aliases?.length).length,
  productNodeCount: productNodes.length,
  sharedProductNodeCount,
  companySpecificProductNodeCount: productNodes.length + componentNodes.length - sharedProductNodeCount,
  businessCategoryNodeCount: nodes.filter((n) => n.type === 'business_category').length,
  marketNodeCount: nodes.filter((n) => n.type === 'end_market').length,
  crossSectorReferenceNodeCount: nodes.filter((n) => n.type === 'cross_sector_anchor').length,
  duplicateSemanticNodeCount: 0,
};

console.log('elec 5C metrics:', JSON.stringify({
  listedCompanyCount: metrics.listedCompanyCount,
  nodeCount: metrics.nodeCount,
  edgeCount: metrics.edgeCount,
  structuralGeneratedEdgeCount: metrics.structuralGeneratedEdgeCount,
  legacyMigratedEdgeCount: metrics.legacyMigratedEdgeCount,
  peerEdgeCount: metrics.peerEdgeCount,
  crossSectorReferenceCount: metrics.crossSectorReferenceCount,
  businessRelationOrphanCount: metrics.businessRelationOrphanCount,
  classificationOnlyCompanyCount: metrics.classificationOnlyCompanyCount,
  hasPeerButNoBusinessCompanyCount: metrics.hasPeerButNoBusinessCompanyCount,
  peerOnlyCompanyCount: metrics.peerOnlyCompanyCount,
  nodeMetrics,
  claimCoverage: metrics.claimCoverage,
}, null, 2));
console.log('warnings:', (report.warnings || []).length);

if (failures.length) {
  failures.forEach((f) => console.error('FAIL', f));
  process.exit(1);
}
console.log('\nOK verify:elec');
