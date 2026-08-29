/**
 * Electrical & electronics (elec) sector metrics — Phase 5C.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY_TYPES = new Set([
  'supplies_component_to',
  'supplies_module_to',
  'supplies_material_to',
  'supplies_equipment_to',
  'manufactures_for',
  'awarded_contract',
  'nominated_supplier_for',
]);

const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in']);
const JV_TYPES = new Set(['joint_venture', 'operates_joint_venture', 'develops_with']);
const DEVICE_ADOPTION_TYPES = new Set([
  'used_in_device',
  'used_in_product_family',
  'designed_for',
  'certified_for',
]);
const BUSINESS_TYPES = new Set([
  ...SUPPLY_TYPES,
  ...OWNERSHIP_TYPES,
  ...JV_TYPES,
  ...DEVICE_ADOPTION_TYPES,
  'licenses_to',
  'participates_in',
]);
const BUSINESS_STATUS = new Set(['confirmed', 'reported']);

function isPrimary(ev) {
  if (!ev) return false;
  if (ev.primarySource === true) return true;
  return ['government', 'regulator', 'disclosure', 'company_ir', 'dart', 'ftc', 'kind'].includes(ev.sourceType);
}

function isDirectReviewed(ev) {
  return !!(
    ev
    && ev.directEvidence === true
    && ev.reviewStatus === 'reviewed'
    && ev.reviewedAt
    && ev.reviewedBy
    && (ev.sourceOpened !== false)
  );
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

/**
 * @param {object} network
 */
export function computeElecMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const orphan = computeListedRelationOrphanMetrics(network);

  const listed = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false);
  const listedRef = nodes.filter((n) => n.type === 'listed_reference_company');

  let structuralGeneratedEdgeCount = 0;
  let legacyMigratedEdgeCount = 0;
  let manuallyCuratedEdgeCount = 0;
  let confirmedBusinessEdgeCount = 0;
  let reportedBusinessEdgeCount = 0;
  let inferredBusinessEdgeCount = 0;
  let peerEdgeCount = 0;
  let supplyRelationshipCount = 0;
  let deviceAdoptionRelationshipCount = 0;
  let jointDevelopmentCount = 0;
  let ownershipEdgeCount = 0;
  let groupMembershipEdgeCount = 0;
  let crossSectorReferenceCount = 0;

  const businessEdges = [];
  const supplyEdges = [];
  const ownershipEdges = [];
  const deviceEdges = [];
  const groupMemberEdges = [];
  const crossSectorRefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;

    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.type === 'group_member') groupMembershipEdgeCount += 1;
    if (e.type === 'cross_sector_reference') {
      crossSectorReferenceCount += 1;
      crossSectorRefEdges.push(e);
    }

    if (SUPPLY_TYPES.has(e.type)) supplyRelationshipCount += 1;
    if (DEVICE_ADOPTION_TYPES.has(e.type)) deviceAdoptionRelationshipCount += 1;
    if (JV_TYPES.has(e.type)) jointDevelopmentCount += 1;
    if (OWNERSHIP_TYPES.has(e.type)) ownershipEdgeCount += 1;

    if (e.status === 'confirmed' && isBusinessEdge(e)) confirmedBusinessEdgeCount += 1;
    if (e.status === 'reported' && isBusinessEdge(e)) reportedBusinessEdgeCount += 1;
    if (e.status === 'inferred' && BUSINESS_TYPES.has(e.type)) inferredBusinessEdgeCount += 1;

    if (isBusinessEdge(e)) businessEdges.push(e);
    if (SUPPLY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) supplyEdges.push(e);
    if (OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) ownershipEdges.push(e);
    if (DEVICE_ADOPTION_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) deviceEdges.push(e);
    if (e.type === 'group_member') groupMemberEdges.push(e);
  }

  const evidenceFieldCount = edges.filter((e) =>
    (BUSINESS_STATUS.has(e.status) || e.type === 'group_member')
    && (e.evidence || []).some((ev) => ev.url || ev.title)).length;
  const evidenceEligible = edges.filter((e) => BUSINESS_STATUS.has(e.status) || e.type === 'group_member').length;

  const businessDirect = businessEdges.filter(edgeHasDirectEvidence).length;
  const businessPrimary = businessEdges.filter(edgeHasPrimary).length;
  const supplyDirect = supplyEdges.filter(edgeHasDirectEvidence).length;
  const supplyPrimary = supplyEdges.filter(edgeHasPrimary).length;
  const deviceDirect = deviceEdges.filter(edgeHasDirectEvidence).length;
  const devicePrimary = deviceEdges.filter(edgeHasPrimary).length;
  const ownershipDirect = ownershipEdges.filter(edgeHasDirectEvidence).length;
  const ownershipPrimary = ownershipEdges.filter(edgeHasPrimary).length;
  const groupPrimary = groupMemberEdges.filter(edgeHasPrimary).length;
  const crossSectorWithEvidence = crossSectorRefEdges.filter((e) =>
    (e.evidence || []).some((ev) => ev.title || ev.url)).length;

  const crossSectorReferenceEvidenceCoverage = computeCoverageMetric(
    crossSectorWithEvidence,
    crossSectorRefEdges.length,
    { reason: 'no_cross_sector_reference_edges' },
  );

  const listedIds = listed.map((n) => n.id);
  const crossSectorReferenceOnlyCompanyCount = listedIds.filter((id) => {
    const incident = edges.filter((ed) => ed.source === id || ed.target === id);
    const hasCross = incident.some((ed) => ed.type === 'cross_sector_reference');
    const hasBusiness = incident.some((ed) =>
      BUSINESS_TYPES.has(ed.type) && BUSINESS_STATUS.has(ed.status));
    const hasOnlyStructuralPeerCross = incident.every((ed) =>
      ['member_of', 'specializes_in', 'manufactures', 'produces', 'exposed_to', 'peer',
        'cross_sector_reference', 'reference'].includes(ed.type)
      || ed.status === 'peer' || ed.status === 'reference');
    return hasCross && !hasBusiness && hasOnlyStructuralPeerCross;
  }).length;

  const evidenceFieldCoverage = computeCoverageMetric(evidenceFieldCount, evidenceEligible);
  const businessRelationshipDirectEvidenceCoverage = computeCoverageMetric(
    businessDirect,
    businessEdges.length,
    { reason: 'no_eligible_business_edges' },
  );
  const businessRelationshipPrimarySourceCoverage = computeCoverageMetric(
    businessPrimary,
    businessEdges.length,
    { reason: 'no_eligible_business_edges' },
  );
  const supplyDirectEvidenceCoverage = computeCoverageMetric(
    supplyDirect,
    supplyEdges.length,
    { reason: 'no_eligible_supply_edges' },
  );
  const supplyPrimarySourceCoverage = computeCoverageMetric(
    supplyPrimary,
    supplyEdges.length,
    { reason: 'no_eligible_supply_edges' },
  );
  const deviceAdoptionDirectEvidenceCoverage = computeCoverageMetric(
    deviceDirect,
    deviceEdges.length,
    { reason: 'no_eligible_device_adoption_edges' },
  );
  const deviceAdoptionPrimarySourceCoverage = computeCoverageMetric(
    devicePrimary,
    deviceEdges.length,
    { reason: 'no_eligible_device_adoption_edges' },
  );
  const ownershipDirectEvidenceCoverage = computeCoverageMetric(
    ownershipDirect,
    ownershipEdges.length,
    { reason: 'no_eligible_ownership_edges' },
  );
  const ownershipPrimarySourceCoverage = computeCoverageMetric(
    ownershipPrimary,
    ownershipEdges.length,
    { reason: 'no_eligible_ownership_edges' },
  );
  const groupMembershipPrimarySourceCoverage = computeCoverageMetric(
    groupPrimary,
    groupMemberEdges.length,
    { reason: 'no_group_membership_edges' },
  );

  const claimCoverage = {
    evidenceFieldCoverage,
    businessRelationshipDirectEvidenceCoverage,
    businessRelationshipPrimarySourceCoverage,
    supplyDirectEvidenceCoverage,
    supplyPrimarySourceCoverage,
    supplyRelationshipDirectEvidenceCoverage: supplyDirectEvidenceCoverage,
    supplyRelationshipPrimarySourceCoverage: supplyPrimarySourceCoverage,
    deviceAdoptionDirectEvidenceCoverage,
    deviceAdoptionPrimarySourceCoverage,
    ownershipDirectEvidenceCoverage,
    ownershipPrimarySourceCoverage,
    groupMembershipPrimarySourceCoverage,
    crossSectorReferenceEvidenceCoverage,
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      supplyDenominator: 'confirmed + reported supply-type edges only',
      deviceAdoptionDenominator: 'confirmed + reported device adoption edges only',
      ownershipDenominator: 'confirmed + reported owns/owns_stake_in only',
      zeroDenominator: 'percentage=null, displayValue=N/A, applicable=false',
    },
  };

  return {
    listedCompanyCount: listed.length,
    listedReferenceCompanyCount: listedRef.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    structuralGeneratedEdgeCount,
    legacyMigratedEdgeCount,
    manuallyCuratedEdgeCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    inferredBusinessEdgeCount,
    peerEdgeCount,
    supplyRelationshipCount,
    actualSupplyRelationshipCount: supplyEdges.length,
    ownershipEdgeCount,
    jointDevelopmentCount,
    deviceAdoptionRelationshipCount,
    groupMembershipEdgeCount,
    crossSectorReferenceCount,
    crossSectorReferenceOnlyCompanyCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
    directCommercialRelationshipOrphanCount: orphan.directCommercialRelationshipOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
    groupMembershipOnlyCompanyCount: orphan.groupMembershipOnlyCompanyCount,
    hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount,
    peerOnlyCompanyCount: orphan.peerOnlyCompanyCount,
    weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
    structuralOnlyCompanyCount: orphan.structuralOnlyCompanyCount,
    orphanMetricDefinitions: orphan.metricDefinitions,
    orphanDetails: orphan.details,
    claimCoverage,
    phase5cCuratedAt: network.phase5cCuratedAt || '2026-08-23',
  };
}
