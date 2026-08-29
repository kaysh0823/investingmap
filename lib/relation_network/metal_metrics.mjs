/**
 * Metal sector metrics — Phase 5D.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY_TYPES = new Set([
  'supplies_material_to',
  'supplies_metal_product_to',
  'awarded_contract',
  'offtake_agreement_with',
  'toll_processes_for',
  'sources_from',
]);

const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in', 'owns_facility']);
const FACILITY_TYPES = new Set(['operates_facility', 'owns_facility']);
const JV_TYPES = new Set(['operates_joint_venture', 'develops_with', 'participates_in']);
const COMMODITY_EXPOSURE_TYPES = new Set(['exposed_to_commodity']);
const BUSINESS_TYPES = new Set([
  ...SUPPLY_TYPES,
  ...OWNERSHIP_TYPES,
  ...FACILITY_TYPES,
  ...JV_TYPES,
  'licenses_to',
]);
const BUSINESS_STATUS = new Set(['confirmed', 'reported']);
const STRUCTURAL_TYPES = new Set([
  'member_of', 'specializes_in', 'produces', 'processes', 'refines', 'smelts',
  'rolls', 'recycles', 'uses_input', 'used_in_end_market', 'cross_sector_reference',
  'group_member',
]);

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
export function computeMetalMetrics(network) {
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
  let offtakeAgreementCount = 0;
  let ownershipEdgeCount = 0;
  let jointVentureEdgeCount = 0;
  let crossSectorReferenceCount = 0;
  let commodityExposureCount = 0;

  const businessEdges = [];
  const supplyEdges = [];
  const ownershipEdges = [];
  const commodityEdges = [];
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
    if (COMMODITY_EXPOSURE_TYPES.has(e.type)) commodityExposureCount += 1;
    if (SUPPLY_TYPES.has(e.type)) supplyRelationshipCount += 1;
    if (e.type === 'offtake_agreement_with') offtakeAgreementCount += 1;
    if (OWNERSHIP_TYPES.has(e.type)) ownershipEdgeCount += 1;
    if (JV_TYPES.has(e.type)) jointVentureEdgeCount += 1;

    if (e.status === 'confirmed' && isBusinessEdge(e)) confirmedBusinessEdgeCount += 1;
    if (e.status === 'reported' && isBusinessEdge(e)) reportedBusinessEdgeCount += 1;
    if (e.status === 'inferred' && BUSINESS_TYPES.has(e.type)) inferredBusinessEdgeCount += 1;

    if (isBusinessEdge(e)) businessEdges.push(e);
    if (SUPPLY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) supplyEdges.push(e);
    if (OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) ownershipEdges.push(e);
    if (COMMODITY_EXPOSURE_TYPES.has(e.type)) commodityEdges.push(e);
  }

  const facilityNodes = nodes.filter((n) => n.type === 'facility' || n.type === 'mine');
  const operatingFacilityCount = facilityNodes.filter((n) => n.operationalStatus === 'operating').length;
  const plannedFacilityCount = facilityNodes.filter((n) => ['planned', 'permitted', 'under_construction'].includes(n.operationalStatus)).length;

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const zeroDegree = nodes.filter((n) => (degree.get(n.id) || 0) === 0);

  const nodeCountByType = Object.fromEntries(
    [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length]),
  );

  const businessDirect = businessEdges.filter(edgeHasDirectEvidence).length;
  const businessPrimary = businessEdges.filter(edgeHasPrimary).length;
  const supplyDirect = supplyEdges.filter(edgeHasDirectEvidence).length;
  const supplyPrimary = supplyEdges.filter(edgeHasPrimary).length;
  const ownershipPrimary = ownershipEdges.filter(edgeHasPrimary).length;
  const commodityWithEvidence = commodityEdges.filter((e) =>
    (e.evidence || []).length > 0 && (e.evidence || []).some((ev) => ev.claimSupport?.product || ev.claimSupport?.commodity)).length;
  const crossSectorWithEvidence = crossSectorRefEdges.filter((e) =>
    (e.evidence || []).some((ev) => ev.title || ev.url)).length;

  const claimCoverage = {
    evidenceFieldCoverage: computeCoverageMetric(
      businessEdges.filter((e) => (e.evidence || []).some((ev) => ev.url || ev.title)).length,
      businessEdges.length,
      { reason: 'no_eligible_business_edges' },
    ),
    businessRelationshipDirectEvidenceCoverage: computeCoverageMetric(
      businessDirect,
      businessEdges.length,
      { reason: 'no_eligible_business_edges' },
    ),
    businessRelationshipPrimarySourceCoverage: computeCoverageMetric(
      businessPrimary,
      businessEdges.length,
      { reason: 'no_eligible_business_edges' },
    ),
    supplyDirectEvidenceCoverage: computeCoverageMetric(
      supplyDirect,
      supplyEdges.length,
      { reason: 'no_eligible_supply_edges' },
    ),
    supplyPrimarySourceCoverage: computeCoverageMetric(
      supplyPrimary,
      supplyEdges.length,
      { reason: 'no_eligible_supply_edges' },
    ),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      ownershipPrimary,
      ownershipEdges.length,
      { reason: 'no_eligible_ownership_edges' },
    ),
    facilityDirectEvidenceCoverage: computeCoverageMetric(
      edges.filter((e) => FACILITY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status) && edgeHasDirectEvidence(e)).length,
      edges.filter((e) => FACILITY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)).length,
      { reason: 'no_eligible_facility_edges' },
    ),
    commodityExposureEvidenceCoverage: computeCoverageMetric(
      commodityWithEvidence,
      commodityEdges.length,
      { reason: 'no_commodity_exposure_edges' },
    ),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      crossSectorWithEvidence,
      crossSectorRefEdges.length,
      { reason: 'no_cross_sector_reference_edges' },
    ),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      supplyDenominator: 'confirmed + reported supply-type edges only',
      ownershipDenominator: 'confirmed + reported owns/owns_stake_in/owns_facility only',
      commodityExposureDenominator: 'exposed_to_commodity structural edges with classification evidence',
      zeroDenominator: 'percentage=null, displayValue=N/A, applicable=false',
    },
  };

  return {
    listedCompanyCount: listed.length,
    listedReferenceCompanyCount: listedRef.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeCountByType,
    structuralGeneratedEdgeCount,
    legacyMigratedEdgeCount,
    manuallyCuratedEdgeCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    inferredBusinessEdgeCount,
    peerEdgeCount,
    supplyRelationshipCount,
    offtakeAgreementCount,
    ownershipEdgeCount,
    jointVentureEdgeCount,
    facilityCount: facilityNodes.length,
    operatingFacilityCount,
    plannedFacilityCount,
    commodityExposureCount,
    crossSectorReferenceCount,
    actualSupplyRelationshipCount: supplyEdges.length,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directCommercialRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
    groupMembershipOnlyCompanyCount: orphan.groupMembershipOnlyCompanyCount ?? 0,
    hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount,
    peerOnlyCompanyCount: orphan.peerOnlyCompanyCount,
    weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
    zeroDegreeNodeCount: zeroDegree.length,
    duplicateSemanticNodeCount: 0,
    claimCoverage,
    ...orphan,
  };
}
