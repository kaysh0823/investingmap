/**
 * Cosmetics sector metrics — Phase 5E.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY_TYPES = new Set([
  'manufactures_for',
  'supplies_ingredient_to',
  'supplies_packaging_to',
  'provides_odm_for',
  'provides_oem_for',
  'develops_formula_for',
  'supplies_bulk_product_to',
]);
const DISTRIBUTION_TYPES = new Set([
  'distributes_for',
  'exclusive_distributor_for',
  'licenses_brand_to',
]);
const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in', 'acquired', 'divested']);
const BRAND_STRUCTURAL = new Set(['owns_brand', 'operates_brand', 'licenses_brand']);
const ODM_STRUCTURAL = new Set(['provides_odm', 'provides_oem']);
const MARKET_EXPOSURE_TYPES = new Set(['exposed_to_market', 'sold_through_channel']);
const BUSINESS_TYPES = new Set([
  ...SUPPLY_TYPES,
  ...DISTRIBUTION_TYPES,
  ...OWNERSHIP_TYPES,
  'operates_joint_venture',
  'develops_with',
  'awarded_contract',
  'endorses_brand',
  'collaborates_with_brand',
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
export function computeCosmeticsMetrics(network) {
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
  let ownedBrandRelationshipCount = 0;
  let operatedBrandRelationshipCount = 0;
  let licensedBrandRelationshipCount = 0;
  let odmRelationshipCount = 0;
  let oemRelationshipCount = 0;
  let ingredientSupplyCount = 0;
  let packagingSupplyCount = 0;
  let distributionRelationshipCount = 0;
  let ownershipEdgeCount = 0;
  let jointVentureEdgeCount = 0;
  let marketExposureCount = 0;
  let crossSectorReferenceCount = 0;
  let endorsementRelationshipCount = 0;

  const businessEdges = [];
  const brandOwnershipEdges = [];
  const odmEdges = [];
  const distributionEdges = [];
  const marketExposureEdges = [];
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
    if (e.type === 'owns_brand') ownedBrandRelationshipCount += 1;
    if (e.type === 'operates_brand') operatedBrandRelationshipCount += 1;
    if (e.type === 'licenses_brand') licensedBrandRelationshipCount += 1;
    if (e.type === 'provides_odm' || e.type === 'provides_odm_for') odmRelationshipCount += 1;
    if (e.type === 'provides_oem' || e.type === 'provides_oem_for') oemRelationshipCount += 1;
    if (e.type === 'supplies_ingredient_to') ingredientSupplyCount += 1;
    if (e.type === 'supplies_packaging_to') packagingSupplyCount += 1;
    if (DISTRIBUTION_TYPES.has(e.type)) distributionRelationshipCount += 1;
    if (OWNERSHIP_TYPES.has(e.type)) ownershipEdgeCount += 1;
    if (e.type === 'operates_joint_venture') jointVentureEdgeCount += 1;
    if (MARKET_EXPOSURE_TYPES.has(e.type)) marketExposureCount += 1;
    if (e.type === 'endorses_brand' || e.type === 'collaborates_with_brand') endorsementRelationshipCount += 1;

    if (e.status === 'confirmed' && isBusinessEdge(e)) confirmedBusinessEdgeCount += 1;
    if (e.status === 'reported' && isBusinessEdge(e)) reportedBusinessEdgeCount += 1;
    if (e.status === 'inferred' && BUSINESS_TYPES.has(e.type)) inferredBusinessEdgeCount += 1;

    if (isBusinessEdge(e)) businessEdges.push(e);
    if (BRAND_STRUCTURAL.has(e.type)) brandOwnershipEdges.push(e);
    if (ODM_STRUCTURAL.has(e.type) || SUPPLY_TYPES.has(e.type)) odmEdges.push(e);
    if (DISTRIBUTION_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) distributionEdges.push(e);
    if (MARKET_EXPOSURE_TYPES.has(e.type)) marketExposureEdges.push(e);
  }

  const brandNodeCount = nodes.filter((n) => n.type === 'brand').length;

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const zeroDegree = nodes.filter((n) => (degree.get(n.id) || 0) === 0);

  const nodeCountByType = Object.fromEntries(
    [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length]),
  );

  const brandStructuralWithEvidence = brandOwnershipEdges.filter((e) =>
    (e.evidence || []).some((ev) => ev.claimSupport?.brand || ev.claimSupport?.legalOwner)).length;

  const odmBusiness = edges.filter((e) =>
    ['provides_odm_for', 'provides_oem_for', 'manufactures_for'].includes(e.type)
    && BUSINESS_STATUS.has(e.status));
  const odmDirect = odmBusiness.filter(edgeHasDirectEvidence).length;
  const odmPrimary = odmBusiness.filter(edgeHasPrimary).length;

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
    brandOwnershipDirectEvidenceCoverage: computeCoverageMetric(
      brandStructuralWithEvidence,
      brandOwnershipEdges.length,
      { reason: 'no_eligible_brand_ownership_edges' },
    ),
    odmDirectEvidenceCoverage: computeCoverageMetric(
      odmDirect,
      odmBusiness.length,
      { reason: 'no_eligible_odm_business_edges' },
    ),
    odmPrimarySourceCoverage: computeCoverageMetric(
      odmPrimary,
      odmBusiness.length,
      { reason: 'no_eligible_odm_business_edges' },
    ),
    distributionDirectEvidenceCoverage: computeCoverageMetric(
      distributionEdges.filter(edgeHasDirectEvidence).length,
      distributionEdges.length,
      { reason: 'no_eligible_distribution_edges' },
    ),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      edges.filter((e) => OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status) && edgeHasPrimary(e)).length,
      edges.filter((e) => OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)).length,
      { reason: 'no_eligible_ownership_edges' },
    ),
    marketExposureEvidenceCoverage: computeCoverageMetric(
      marketExposureEdges.filter((e) => (e.evidence || []).length > 0).length,
      marketExposureEdges.length,
      { reason: 'no_market_exposure_edges' },
    ),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      crossSectorRefEdges.filter((e) => (e.evidence || []).some((ev) => ev.title || ev.url)).length,
      crossSectorRefEdges.length,
      { reason: 'no_cross_sector_reference_edges' },
    ),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      odmDenominator: 'confirmed + reported ODM/OEM/manufactures_for edges only',
      distributionDenominator: 'confirmed + reported distribution/license edges only',
      brandOwnershipDenominator: 'owns_brand/operates_brand/licenses_brand structural edges',
      marketExposureDenominator: 'exposed_to_market/sold_through_channel structural only',
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
    brandNodeCount,
    ownedBrandRelationshipCount,
    operatedBrandRelationshipCount,
    licensedBrandRelationshipCount,
    odmRelationshipCount,
    oemRelationshipCount,
    ingredientSupplyCount,
    packagingSupplyCount,
    distributionRelationshipCount,
    ownershipEdgeCount,
    jointVentureEdgeCount,
    marketExposureCount,
    crossSectorReferenceCount,
    endorsementRelationshipCount,
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
