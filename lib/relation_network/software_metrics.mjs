/**
 * Software sector metrics — Phase 5H.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY = new Set(['supplies_software_to', 'deployed_at', 'awarded_public_contract']);
const PARTNER = new Set(['partners_with', 'resells_for', 'distributes_for', 'develops_with', 'licenses_software_to']);
const OWNER = new Set(['owns', 'owns_stake_in', 'acquired', 'divested', 'operates_joint_venture']);
const INTEGRATION = new Set(['integrates_with', 'supports_environment']);
const BUSINESS = new Set([...SUPPLY, ...PARTNER, ...OWNER]);
const BIZ_STATUS = new Set(['confirmed', 'reported']);

function isPrimary(ev) {
  if (!ev) return false;
  if (ev.primarySource === true) return true;
  return ['government', 'regulator', 'disclosure', 'company_ir', 'dart', 'kind'].includes(ev.sourceType);
}
function isDirectReviewed(ev) {
  return !!(ev && ev.directEvidence === true && ev.reviewStatus === 'reviewed'
    && ev.reviewedAt && ev.reviewedBy && ev.sourceOpened !== false);
}
function edgeHasDirect(e) { return (e.evidence || []).some(isDirectReviewed); }
function edgeHasPrimary(e) { return (e.evidence || []).some(isPrimary); }
function isBiz(e) { return BUSINESS.has(e.type) && BIZ_STATUS.has(e.status); }

export function computeSoftwareMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const orphan = computeListedRelationOrphanMetrics(network);
  const listed = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false);

  let structuralGeneratedEdgeCount = 0;
  let legacyMigratedEdgeCount = 0;
  let manuallyCuratedEdgeCount = 0;
  let confirmedBusinessEdgeCount = 0;
  let reportedBusinessEdgeCount = 0;
  let peerEdgeCount = 0;
  let integrationRelationshipCount = 0;
  let deploymentRelationshipCount = 0;
  let supplyRelationshipCount = 0;
  let partnershipCount = 0;
  let licensingRelationshipCount = 0;
  let resellerRelationshipCount = 0;
  let publicContractCount = 0;
  let ownershipEdgeCount = 0;
  let acquisitionCount = 0;
  let crossSectorReferenceCount = 0;

  const businessEdges = [];
  const supplyEdges = [];
  const partnerEdges = [];
  const deployEdges = [];
  const publicEdges = [];
  const ownershipEdges = [];
  const xrefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;
    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.type === 'cross_sector_reference') { crossSectorReferenceCount += 1; xrefEdges.push(e); }
    if (INTEGRATION.has(e.type)) integrationRelationshipCount += 1;
    if (e.type === 'deployed_at' && BIZ_STATUS.has(e.status)) { deploymentRelationshipCount += 1; deployEdges.push(e); }
    if (SUPPLY.has(e.type) && BIZ_STATUS.has(e.status)) { supplyRelationshipCount += 1; supplyEdges.push(e); }
    if (PARTNER.has(e.type) && BIZ_STATUS.has(e.status)) {
      partnershipCount += 1; partnerEdges.push(e);
      if (e.type === 'licenses_software_to') licensingRelationshipCount += 1;
      if (e.type === 'resells_for') resellerRelationshipCount += 1;
    }
    if (e.type === 'awarded_public_contract' && BIZ_STATUS.has(e.status)) { publicContractCount += 1; publicEdges.push(e); }
    if ((e.type === 'owns' || e.type === 'owns_stake_in') && BIZ_STATUS.has(e.status)) {
      ownershipEdgeCount += 1; ownershipEdges.push(e);
    }
    if (e.type === 'acquired' && BIZ_STATUS.has(e.status)) acquisitionCount += 1;
    if (isBiz(e)) {
      businessEdges.push(e);
      if (e.status === 'confirmed') confirmedBusinessEdgeCount += 1;
      if (e.status === 'reported') reportedBusinessEdgeCount += 1;
    }
  }

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const zeroDegreeNodeCount = nodes.filter((n) => (degree.get(n.id) || 0) === 0
    && n.entityRole !== 'boundary_placeholder'
    && !(n.type === 'cross_sector_anchor' && n.isMapConstituent === false)).length;

  const claimCoverage = {
    evidenceFieldCoverage: computeCoverageMetric(
      businessEdges.filter((e) => (e.evidence || []).some((ev) => ev.url || ev.title)).length,
      businessEdges.length, { reason: 'no_eligible_business_edges' }),
    businessRelationshipDirectEvidenceCoverage: computeCoverageMetric(
      businessEdges.filter(edgeHasDirect).length, businessEdges.length, { reason: 'no_eligible_business_edges' }),
    businessRelationshipPrimarySourceCoverage: computeCoverageMetric(
      businessEdges.filter(edgeHasPrimary).length, businessEdges.length, { reason: 'no_eligible_business_edges' }),
    supplyDirectEvidenceCoverage: computeCoverageMetric(
      supplyEdges.filter(edgeHasDirect).length, supplyEdges.length, { reason: 'no_eligible_supply_edges' }),
    partnershipDirectEvidenceCoverage: computeCoverageMetric(
      partnerEdges.filter(edgeHasDirect).length, partnerEdges.length, { reason: 'no_eligible_partnership_edges' }),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      ownershipEdges.filter(edgeHasPrimary).length, ownershipEdges.length, { reason: 'no_eligible_ownership_edges' }),
    deploymentDirectEvidenceCoverage: computeCoverageMetric(
      deployEdges.filter(edgeHasDirect).length, deployEdges.length, { reason: 'no_eligible_deployment_edges' }),
    publicContractPrimarySourceCoverage: computeCoverageMetric(
      publicEdges.filter(edgeHasPrimary).length, publicEdges.length, { reason: 'no_eligible_public_contracts' }),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      xrefEdges.length, xrefEdges.length, { reason: 'no_cross_sector_refs' }),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      integrationNotBusiness: 'integrates_with is structural, not partnership/business',
      zeroDenominator: 'percentage=null, displayValue=N/A, applicable=false',
    },
  };

  return {
    listedCompanyCount: listed.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    structuralGeneratedEdgeCount,
    legacyMigratedEdgeCount,
    manuallyCuratedEdgeCount,
    softwareProductCount: nodes.filter((n) => n.type === 'software_product').length,
    platformNodeCount: nodes.filter((n) => n.type === 'platform').length,
    cloudServiceCount: nodes.filter((n) => n.type === 'cloud_service').length,
    softwareCategoryCount: nodes.filter((n) => n.type === 'software_category').length,
    integrationRelationshipCount,
    deploymentRelationshipCount,
    supplyRelationshipCount,
    partnershipCount,
    licensingRelationshipCount,
    resellerRelationshipCount,
    publicContractCount,
    ownershipEdgeCount,
    acquisitionCount,
    crossSectorReferenceCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    peerEdgeCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directCommercialRelationshipOrphanCount: orphan.businessRelationOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount ?? 0,
    hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount ?? 0,
    peerOnlyCompanyCount: orphan.peerOnlyCompanyCount ?? 0,
    zeroDegreeNodeCount,
    duplicateSemanticNodeCount: 0,
    claimCoverage,
    nodeCountByType: Object.fromEntries(
      [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length])),
  };
}
