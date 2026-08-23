/**
 * verify:auto — Phase 5B / 5B.1 automotive value-chain network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeAutoMetrics } from '../lib/relation_network/auto_metrics.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'auto.json');
check(fs.existsSync(netFp), 'missing data/networks/auto.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `auto warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.auto;
check(profile?.model === 'automotive_value_chain_ecosystem', 'profile model');
check(profile?.layout === 'automotiveValueChainEcosystem', 'profile layout');
check(network.model === 'automotive_value_chain_ecosystem', 'network model');
check(network.layout === 'automotiveValueChainEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5bCuratedAt, 'phase5b curated');
check(!!network.phase5b1CuratedAt, 'phase5b1 curated');
check(!!network.phase5b2CuratedAt, 'phase5b2 curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'auto', 'korea_auto_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 22, `listed count must stay 22 (got ${companies.length})`);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const supply = edges.filter((e) => [
  'supplies_component_to', 'supplies_system_to', 'supplies_material_to',
  'supplies_tire_to', 'supplies_lighting_to', 'supplies_electronics_to',
  'awarded_contract', 'nominated_supplier_for',
].includes(e.type));
check(supply.length === 0, `Phase 5B.2 must not invent supply edges without DART contract (got ${supply.length})`);

const fitment = edges.filter((e) => e.type === 'used_in_vehicle');
check(fitment.length === 0, `Phase 5B.1 must not invent used_in_vehicle without filings (got ${fitment.length})`);

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length > 0, 'legacy peers should be migrated');
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const groupMembers = edges.filter((e) => e.type === 'group_member');
check(groupMembers.length === 5, `hyundai group_member count 5 (got ${groupMembers.length})`);
check(groupMembers.every((e) => e.status === 'reported'), 'group_member is reported (FTC roster) not business');
check(groupMembers.every((e) =>
  (e.evidence || []).some((ev) =>
    ev.evidenceUsageType === 'official_roster'
    && ev.evidenceScope === 'multiple_entities'
    && /ftc\.go\.kr/i.test(String(ev.url || '')))), 'group_member FTC official_roster evidence');

const ownership = edges.filter((e) => e.type === 'owns' || e.type === 'owns_stake_in');
check(ownership.length === 1, `Phase 5B.2 confirmed ownership 1 (got ${ownership.length})`);
const ownEdge = ownership[0];
if (ownEdge) {
  check(ownEdge.type === 'owns_stake_in', 'ownership must be owns_stake_in (associate, not control)');
  check(ownEdge.source === 'krx:000240' && ownEdge.target === 'krx:161390', 'ownership source/target');
  check(ownEdge.status === 'confirmed', 'ownership confirmed');
  check(ownEdge.stakePct === 31.15, `ownership stakePct 31.15 (got ${ownEdge.stakePct})`);
  check(ownEdge.asOf === '2024-12-31', 'ownership asOf');
}

const metrics = computeAutoMetrics(network);
const orphan = computeListedRelationOrphanMetrics(network);
check(metrics.listedCompanyCount === 22, 'metrics listed 22');
check(metrics.actualSupplyRelationshipCount === 0, 'no actual supply in metrics');
check(metrics.vehicleFitmentRelationshipCount === 0, 'no fitment in metrics');
check(orphan.businessRelationOrphanCount === 20, `business orphan 20 (got ${orphan.businessRelationOrphanCount})`);
check(orphan.directRelationshipOrphanCount === 20, `direct commercial orphan 20 (got ${orphan.directRelationshipOrphanCount})`);
check(orphan.groupMembershipOnlyCompanyCount === 5, `groupMembershipOnly 5 (got ${orphan.groupMembershipOnlyCompanyCount})`);
check(orphan.classificationOnlyCompanyCount === 20, `classificationOnly 20 (got ${orphan.classificationOnlyCompanyCount})`);
check(orphan.hasPeerButNoBusinessCompanyCount === 20, `hasPeerButNoBusiness 20 (got ${orphan.hasPeerButNoBusinessCompanyCount})`);
check(orphan.peerOnlyCompanyCount === 0, `strict peerOnly 0 (got ${orphan.peerOnlyCompanyCount})`);
check(!(orphan.details?.classificationOnly || []).includes('krx:000240'), 'krx:000240 must not be classificationOnly after ownership');
check(!(orphan.details?.classificationOnly || []).includes('krx:161390'), 'krx:161390 must not be classificationOnly as stake target');

const cc = metrics.claimCoverage || {};
for (const key of [
  'supplyDirectEvidenceCoverage',
  'supplyPrimarySourceCoverage',
  'fitmentDirectEvidenceCoverage',
  'fitmentPrimarySourceCoverage',
]) {
  const m = cc[key];
  check(m?.denominator === 0, `${key} denominator 0`);
  check(m?.percentage == null, `${key} percentage null`);
  check(m?.displayValue === 'N/A', `${key} displayValue N/A`);
  check(m?.applicable === false, `${key} applicable false`);
  const err = validateCoverageMetric(m, key);
  check(!err, err || `${key} valid`);
}

check(cc.groupMembershipPrimarySourceCoverage?.denominator === 5, 'groupMembership denom 5');
check(cc.groupMembershipPrimarySourceCoverage?.numerator === 5, 'groupMembership primary 5/5');
check(cc.ownershipDirectEvidenceCoverage?.denominator === 1, 'ownership direct denom 1');
check(cc.ownershipDirectEvidenceCoverage?.numerator === 1, 'ownership direct 1/1');
check(cc.ownershipPrimarySourceCoverage?.denominator === 1, 'ownership primary denom 1');
check(cc.ownershipPrimarySourceCoverage?.numerator === 1, 'ownership primary 1/1');

const nodeIds = new Set(nodes.map((n) => n.id));
check(nodeIds.size === nodes.length, 'duplicate node ids');
const edgeIds = new Set(edges.map((e) => e.id));
check(edgeIds.size === edges.length, 'duplicate edge ids');

console.log('auto 5B.2 metrics:', JSON.stringify({
  listedCompanyCount: metrics.listedCompanyCount,
  nodeCount: metrics.nodeCount,
  edgeCount: metrics.edgeCount,
  structuralGeneratedEdgeCount: metrics.structuralGeneratedEdgeCount,
  legacyMigratedEdgeCount: metrics.legacyMigratedEdgeCount,
  manuallyCuratedEdgeCount: metrics.manuallyCuratedEdgeCount,
  peerEdgeCount: metrics.peerEdgeCount,
  groupMembershipEdgeCount: metrics.groupMembershipEdgeCount,
  ownershipEdgeCount: metrics.ownershipEdgeCount,
  actualSupplyRelationshipCount: metrics.actualSupplyRelationshipCount,
  electrificationExposedCompanyCount: metrics.electrificationExposedCompanyCount,
  iceExposedCompanyCount: metrics.iceExposedCompanyCount,
  hybridExposedCompanyCount: metrics.hybridExposedCompanyCount,
  businessRelationOrphanCount: metrics.businessRelationOrphanCount,
  directRelationshipOrphanCount: metrics.directRelationshipOrphanCount,
  groupMembershipOnlyCompanyCount: metrics.groupMembershipOnlyCompanyCount,
  classificationOnlyCompanyCount: metrics.classificationOnlyCompanyCount,
  hasPeerButNoBusinessCompanyCount: metrics.hasPeerButNoBusinessCompanyCount,
  peerOnlyCompanyCount: metrics.peerOnlyCompanyCount,
  structuralOnlyCompanyCount: metrics.structuralOnlyCompanyCount,
  orphanDetails: {
    businessRelationOrphans: orphan.details?.businessRelationOrphans,
    classificationOnly: orphan.details?.classificationOnly,
    hasPeerButNoBusiness: orphan.details?.hasPeerButNoBusiness,
  },
  claimCoverage: metrics.claimCoverage,
}, null, 2));
console.log('warnings:', (report.warnings || []).length);

if (failures.length) {
  failures.forEach((f) => console.error('FAIL', f));
  process.exit(1);
}
console.log('\nOK verify:auto');
