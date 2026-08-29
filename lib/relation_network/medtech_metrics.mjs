/**
 * Medtech sector metrics — Phase 5G.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY_TYPES = new Set([
  'supplies_device_to', 'manufactures_for', 'awarded_contract', 'installed_at_provider',
  'supplied_to_provider',
]);
const DISTRIBUTION_TYPES = new Set([
  'distributes_for', 'exclusive_distributor_for', 'licenses_technology_to', 'licenses_product_to',
]);
const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in', 'acquired', 'divested', 'operates_joint_venture']);
const INSTALL_TYPES = new Set(['installed_at_provider', 'used_by_provider']);
const CLINICAL_TYPES = new Set([
  'clinical_collaboration_with', 'clinical_evidence_for', 'evaluated_in_study',
]);
const REGULATORY_STRUCTURAL = new Set([
  'approved_or_cleared_by', 'registered_in_market',
]);
const BUSINESS_TYPES = new Set([
  ...SUPPLY_TYPES,
  ...DISTRIBUTION_TYPES,
  ...OWNERSHIP_TYPES,
  'develops_with',
  'licenses_technology_to',
  'licenses_product_to',
]);
const BUSINESS_STATUS = new Set(['confirmed', 'reported']);

function isPrimary(ev) {
  if (!ev) return false;
  if (ev.primarySource === true) return true;
  return ['government', 'regulator', 'disclosure', 'company_ir', 'dart', 'ftc', 'kind', 'mfds', 'fda'].includes(ev.sourceType);
}

function isDirectReviewed(ev) {
  return !!(ev && ev.directEvidence === true && ev.reviewStatus === 'reviewed'
    && ev.reviewedAt && ev.reviewedBy && ev.sourceOpened !== false);
}

function edgeHasDirectEvidence(e) {
  return (e.evidence || []).some((ev) => isDirectReviewed(ev));
}

function edgeHasPrimary(e) {
  return (e.evidence || []).some((ev) => isPrimary(ev));
}

function isBusinessEdge(e) {
  return BUSINESS_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status);
}

export function computeMedtechMetrics(network) {
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
  let supplyRelationshipCount = 0;
  let installationRelationshipCount = 0;
  let distributionRelationshipCount = 0;
  let licensingRelationshipCount = 0;
  let clinicalCollaborationCount = 0;
  let ownershipEdgeCount = 0;
  let jointVentureEdgeCount = 0;
  let crossSectorReferenceCount = 0;
  let marketExposureCount = 0;
  let regulatoryClearanceCount = 0;
  let activeClearanceCount = 0;
  let withdrawnClearanceCount = 0;

  const businessEdges = [];
  const regulatoryEdges = [];
  const supplyEdges = [];
  const installEdges = [];
  const distributionEdges = [];
  const ownershipEdges = [];
  const crossSectorRefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;
    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.type === 'cross_sector_reference') {
      crossSectorReferenceCount += 1;
      crossSectorRefEdges.push(e);
    }
    if (e.type === 'exposed_to_market' || e.type === 'registered_in_market') marketExposureCount += 1;
    if (REGULATORY_STRUCTURAL.has(e.type)) {
      regulatoryClearanceCount += 1;
      regulatoryEdges.push(e);
    }
    if (SUPPLY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) {
      supplyRelationshipCount += 1;
      supplyEdges.push(e);
    }
    if (INSTALL_TYPES.has(e.type)) {
      installationRelationshipCount += 1;
      installEdges.push(e);
    }
    if (DISTRIBUTION_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) {
      distributionRelationshipCount += 1;
      distributionEdges.push(e);
    }
    if (e.type === 'licenses_technology_to' || e.type === 'licenses_product_to') {
      if (BUSINESS_STATUS.has(e.status)) licensingRelationshipCount += 1;
    }
    if (CLINICAL_TYPES.has(e.type)) clinicalCollaborationCount += 1;
    if (e.type === 'owns' || e.type === 'owns_stake_in') {
      if (BUSINESS_STATUS.has(e.status)) {
        ownershipEdgeCount += 1;
        ownershipEdges.push(e);
      }
    }
    if (e.type === 'operates_joint_venture' && BUSINESS_STATUS.has(e.status)) jointVentureEdgeCount += 1;
    if (isBusinessEdge(e)) {
      businessEdges.push(e);
      if (e.status === 'confirmed') confirmedBusinessEdgeCount += 1;
      if (e.status === 'reported') reportedBusinessEdgeCount += 1;
    }
  }

  for (const n of nodes) {
    if (n.type === 'regulatory_clearance') {
      regulatoryClearanceCount += 1;
      if (n.currentStatus === 'withdrawn' || n.currentStatus === 'expired' || n.currentStatus === 'suspended') {
        withdrawnClearanceCount += 1;
      } else if (['cleared', 'approved', 'registered', 'renewed'].includes(n.currentStatus)) {
        activeClearanceCount += 1;
      }
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
      businessEdges.length,
      { reason: 'no_eligible_business_edges' },
    ),
    businessRelationshipDirectEvidenceCoverage: computeCoverageMetric(
      businessEdges.filter(edgeHasDirectEvidence).length,
      businessEdges.length,
      { reason: 'no_eligible_business_edges' },
    ),
    businessRelationshipPrimarySourceCoverage: computeCoverageMetric(
      businessEdges.filter(edgeHasPrimary).length,
      businessEdges.length,
      { reason: 'no_eligible_business_edges' },
    ),
    regulatoryEvidenceCoverage: computeCoverageMetric(
      regulatoryEdges.length,
      regulatoryEdges.length,
      { reason: 'no_regulatory_structural_edges' },
    ),
    activeClearancePrimarySourceCoverage: computeCoverageMetric(
      0,
      activeClearanceCount,
      { reason: 'no_active_clearance_nodes' },
    ),
    supplyDirectEvidenceCoverage: computeCoverageMetric(
      supplyEdges.filter(edgeHasDirectEvidence).length,
      supplyEdges.length,
      { reason: 'no_eligible_supply_edges' },
    ),
    installationDirectEvidenceCoverage: computeCoverageMetric(
      installEdges.filter((e) => BUSINESS_STATUS.has(e.status) && edgeHasDirectEvidence(e)).length,
      installEdges.filter((e) => BUSINESS_STATUS.has(e.status)).length,
      { reason: 'no_eligible_installation_edges' },
    ),
    distributionDirectEvidenceCoverage: computeCoverageMetric(
      distributionEdges.filter(edgeHasDirectEvidence).length,
      distributionEdges.length,
      { reason: 'no_eligible_distribution_edges' },
    ),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      ownershipEdges.filter(edgeHasPrimary).length,
      ownershipEdges.length,
      { reason: 'no_eligible_ownership_edges' },
    ),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      crossSectorRefEdges.length,
      crossSectorRefEdges.length,
      { reason: 'no_cross_sector_refs' },
    ),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      regulatoryDenominator: 'approved_or_cleared_by/registered_in_market structural — not business',
      zeroDenominator: 'percentage=null, displayValue=N/A, applicable=false',
      clearanceNotBusiness: 'regulatory clearances never count toward business orphan resolution',
    },
  };

  return {
    listedCompanyCount: listed.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    structuralGeneratedEdgeCount,
    legacyMigratedEdgeCount,
    manuallyCuratedEdgeCount,
    medicalDeviceNodeCount: nodes.filter((n) => n.type === 'medical_device' || n.type === 'software_medical_device').length,
    deviceCategoryCount: nodes.filter((n) => n.type === 'device_category').length,
    specialtyNodeCount: nodes.filter((n) => n.type === 'clinical_specialty' || n.type === 'indication').length,
    regulatoryClearanceCount,
    activeClearanceCount,
    withdrawnClearanceCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    peerEdgeCount,
    supplyRelationshipCount,
    installationRelationshipCount,
    distributionRelationshipCount,
    licensingRelationshipCount,
    clinicalCollaborationCount,
    ownershipEdgeCount,
    jointVentureEdgeCount,
    crossSectorReferenceCount,
    marketExposureCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directCommercialRelationshipOrphanCount: orphan.businessRelationOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount ?? 0,
    hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount ?? 0,
    peerOnlyCompanyCount: orphan.peerOnlyCompanyCount ?? 0,
    zeroDegreeNodeCount,
    duplicateSemanticNodeCount: 0,
    claimCoverage,
    nodeCountByType: Object.fromEntries(
      [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length]),
    ),
  };
}
