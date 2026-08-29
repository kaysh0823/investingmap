/**
 * verify:medtech — Phase 5G medical device / specialty / regulatory network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeMedtechMetrics } from '../lib/relation_network/medtech_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_MEDTECH_IDS } from '../lib/relation_network/medtech_device_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'medtech.json');
check(fs.existsSync(netFp), 'missing data/networks/medtech.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `medtech warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.medtech;
check(profile?.model === 'medical_device_product_regulatory_ecosystem', 'profile model');
check(profile?.layout === 'medicalDeviceEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/medtech.json', 'profile networkPath');
check(network.model === 'medical_device_product_regulatory_ecosystem', 'network model');
check(network.layout === 'medicalDeviceEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5gCuratedAt, 'phase5g curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'medtech', 'korea_medtech_map.html'), 'utf8');
check(html.includes('data-sector="medtech"'), 'html data-sector medtech');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 10, `listed must be 10 (got ${companies.length})`);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const inventedBiz = edges.filter((e) => [
  'supplies_device_to', 'distributes_for', 'exclusive_distributor_for', 'manufactures_for',
  'installed_at_provider', 'supplied_to_provider', 'awarded_contract', 'licenses_technology_to',
].includes(e.type) && ['confirmed', 'reported', 'inferred'].includes(e.status));
check(inventedBiz.length === 0, `Phase 5G must not invent supply/distribution/install (got ${inventedBiz.length})`);

const clearanceAsBiz = edges.filter((e) => ['approved_or_cleared_by', 'registered_in_market', 'approved_in'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(clearanceAsBiz.length === 0, 'clearance must not be confirmed/reported business');

const clearanceNodes = nodes.filter((n) => n.type === 'regulatory_clearance');
check(clearanceNodes.length === 0, `no clearance nodes without verified IDs (got ${clearanceNodes.length})`);

const clinicalAsBiz = edges.filter((e) => ['clinical_evidence_for', 'evaluated_in_study', 'clinical_collaboration_with'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(clinicalAsBiz.length === 0, 'clinical edges must not be confirmed business in Phase 5G');

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length >= 20, `legacy peers demoted (got ${peers.length})`);
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const crossRef = edges.filter((e) => e.type === 'cross_sector_reference');
check(crossRef.length >= 4, `cross_sector_reference (got ${crossRef.length})`);
check(crossRef.every((e) => e.status === 'reference'), 'cross_sector is reference');
check(crossRef.every((e) => e.excludesFromBusinessCoverage === true), 'cross_sector excludes business');
check(crossRef.every((e) => e.excludesFromOrphanResolution === true), 'cross_sector excludes orphan resolution');

check(nodes.every((n) => n.type !== 'device_category' || !String(n.id).startsWith('krx:')), 'device categories separate from listed');
check(nodes.every((n) => n.type !== 'clinical_specialty' || !String(n.id).startsWith('krx:')), 'specialties separate from listed');

const metrics = computeMedtechMetrics(network);
check(metrics.listedCompanyCount === 10, 'metrics listed 10');
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed business');
check(metrics.reportedBusinessEdgeCount === 0, 'no reported business');
check(metrics.deviceCategoryCount > 0, 'device categories exist');
check(metrics.specialtyNodeCount > 0, 'specialties exist');
check(metrics.zeroDegreeNodeCount === 0, 'zero-degree must be 0 (non-placeholder)');
check(metrics.duplicateSemanticNodeCount === 0, 'no duplicate semantic');

for (const id of FORBIDDEN_GENERIC_MEDTECH_IDS) {
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
  return false;
}
for (const n of zeroDegree) {
  check(isAllowedZeroDegreeNode(n), `unexpected zero-degree node ${n.id} (type=${n.type})`);
}

const cc = metrics.claimCoverage || {};
for (const key of Object.keys(cc)) {
  if (key === 'metricNotes') continue;
  const val = cc[key];
  if (!val || typeof val !== 'object') continue;
  const err = validateCoverageMetric(val, `medtech.${key}`);
  if (err) failures.push(err);
}

console.log(JSON.stringify({
  listedCompanyCount: metrics.listedCompanyCount,
  nodeCount: metrics.nodeCount,
  edgeCount: metrics.edgeCount,
  confirmedBusinessEdgeCount: metrics.confirmedBusinessEdgeCount,
  peerEdgeCount: metrics.peerEdgeCount,
  deviceCategoryCount: metrics.deviceCategoryCount,
  specialtyNodeCount: metrics.specialtyNodeCount,
  crossSectorReferenceCount: metrics.crossSectorReferenceCount,
  businessRelationOrphanCount: metrics.businessRelationOrphanCount,
  claimCoverage: metrics.claimCoverage,
  nodeCountByType: metrics.nodeCountByType,
}, null, 2));
console.log('warnings:', (report.warnings || []).length);
if (failures.length) {
  console.error('FAILURES:', failures);
  process.exit(1);
}
console.log('OK verify:medtech');
