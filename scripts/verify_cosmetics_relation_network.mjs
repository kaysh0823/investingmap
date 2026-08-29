/**
 * verify:cosmetics — Phase 5E beauty brand / ODM / distribution network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeCosmeticsMetrics } from '../lib/relation_network/cosmetics_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_COSMETICS_IDS } from '../lib/relation_network/cosmetics_brand_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'cosmetics.json');
check(fs.existsSync(netFp), 'missing data/networks/cosmetics.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `cosmetics warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.cosmetics;
check(profile?.model === 'beauty_brand_manufacturing_distribution_ecosystem', 'profile model');
check(profile?.layout === 'beautyValueChainEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/cosmetics.json', 'profile networkPath');
check(network.model === 'beauty_brand_manufacturing_distribution_ecosystem', 'network model');
check(network.layout === 'beautyValueChainEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5eCuratedAt, 'phase5e curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'cosmetics', 'korea_cosmetics_map.html'), 'utf8');
check(html.includes('data-sector="cosmetics"'), 'html data-sector cosmetics');
const companies = extractCompaniesFromHtml(html);
const expectedListed = companies.length;
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const odmBusiness = edges.filter((e) =>
  ['provides_odm_for', 'provides_oem_for', 'manufactures_for', 'distributes_for', 'exclusive_distributor_for'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(odmBusiness.length === 0, `Phase 5E must not invent ODM/distribution without primary evidence (got ${odmBusiness.length})`);

const ownership = edges.filter((e) => (e.type === 'owns' || e.type === 'owns_stake_in' || e.type === 'acquired')
  && ['confirmed', 'reported'].includes(e.status));
check(ownership.length === 0, `Phase 5E ownership without DART (got ${ownership.length})`);

const marketAsBusiness = edges.filter((e) => ['exposed_to_market', 'sold_through_channel'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(marketAsBusiness.length === 0, 'market exposure must not be confirmed/reported business');

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length === 4, `legacy peers from Hugel (got ${peers.length})`);
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const crossRef = edges.filter((e) => e.type === 'cross_sector_reference');
check(crossRef.length >= 5, `cross_sector_reference boundary refs (got ${crossRef.length})`);
check(crossRef.every((e) => e.status === 'reference'), 'cross_sector_reference is reference only');
check(crossRef.every((e) => e.excludesFromBusinessCoverage === true), 'cross_sector excludes business coverage');

const brandNodes = nodes.filter((n) => n.type === 'brand');
check(brandNodes.length > 0, 'brand nodes exist');
check(brandNodes.every((n) => !String(n.id).startsWith('krx:')), 'brands separate from listed companies');

const metrics = computeCosmeticsMetrics(network);
check(metrics.listedCompanyCount === expectedListed, `metrics listed ${expectedListed}`);
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed business');
check(metrics.crossSectorReferenceCount >= 5, 'cross sector refs in metrics');
check(metrics.operatedBrandRelationshipCount > 0, 'operated brand structural edges exist');
check(metrics.odmRelationshipCount >= 3, 'ODM structural edges exist');

for (const id of FORBIDDEN_GENERIC_COSMETICS_IDS) {
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
for (const key of [
  'businessRelationshipDirectEvidenceCoverage',
  'businessRelationshipPrimarySourceCoverage',
  'brandOwnershipDirectEvidenceCoverage',
  'odmDirectEvidenceCoverage',
  'marketExposureEvidenceCoverage',
  'crossSectorReferenceEvidenceCoverage',
]) {
  const val = cc[key];
  if (!val) continue;
  const err = validateCoverageMetric(val, `cosmetics.${key}`);
  if (err) failures.push(err);
}

console.log('cosmetics 5E metrics:', JSON.stringify({
  listedCompanyCount: metrics.listedCompanyCount,
  nodeCount: metrics.nodeCount,
  edgeCount: metrics.edgeCount,
  structuralGeneratedEdgeCount: metrics.structuralGeneratedEdgeCount,
  legacyMigratedEdgeCount: metrics.legacyMigratedEdgeCount,
  peerEdgeCount: metrics.peerEdgeCount,
  brandNodeCount: metrics.brandNodeCount,
  operatedBrandRelationshipCount: metrics.operatedBrandRelationshipCount,
  odmRelationshipCount: metrics.odmRelationshipCount,
  crossSectorReferenceCount: metrics.crossSectorReferenceCount,
  confirmedBusinessEdgeCount: metrics.confirmedBusinessEdgeCount,
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
  console.log('OK verify:cosmetics');
}
