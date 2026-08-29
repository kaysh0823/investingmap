/**
 * K-consume sector metrics — Phase 5F.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY_TYPES = new Set([
  'manufactures_for', 'supplies_product_to', 'supplies_ingredient_to',
]);
const DISTRIBUTION_TYPES = new Set([
  'distributes_for', 'exclusive_distributor_for', 'licenses_brand_to', 'franchises_to',
]);
const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in', 'acquired', 'divested']);
const BRAND_STRUCTURAL = new Set(['owns_brand', 'operates_brand', 'licenses_brand']);
const MARKET_TYPES = new Set(['exposed_to_market', 'sold_through_channel']);
const BUSINESS_TYPES = new Set([
  ...SUPPLY_TYPES, ...DISTRIBUTION_TYPES, ...OWNERSHIP_TYPES,
  'operates_joint_venture',
]);
const BUSINESS_STATUS = new Set(['confirmed', 'reported']);

function isPrimary(ev) {
  if (!ev) return false;
  if (ev.primarySource === true) return true;
  return ['government', 'regulator', 'disclosure', 'company_ir', 'dart', 'ftc', 'kind'].includes(ev.sourceType);
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

export function computeKconsumeMetrics(network) {
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
  let manufacturingRelationshipCount = 0;
  let supplyRelationshipCount = 0;
  let distributionRelationshipCount = 0;
  let franchiseRelationshipCount = 0;
  let ownershipEdgeCount = 0;
  let acquisitionCount = 0;
  let marketExposureCount = 0;
  let crossSectorReferenceCount = 0;
  let operatedBrandRelationshipCount = 0;
  let ownedBrandRelationshipCount = 0;

  const businessEdges = [];
  const brandOwnershipEdges = [];
  const distributionBiz = [];
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
    if (e.type === 'operates_brand') operatedBrandRelationshipCount += 1;
    if (e.type === 'owns_brand') ownedBrandRelationshipCount += 1;
    if (BRAND_STRUCTURAL.has(e.type)) brandOwnershipEdges.push(e);
    if (e.type === 'manufactures' || e.type === 'produces') manufacturingRelationshipCount += 1;
    if (SUPPLY_TYPES.has(e.type)) supplyRelationshipCount += 1;
    if (DISTRIBUTION_TYPES.has(e.type)) {
      distributionRelationshipCount += 1;
      if (BUSINESS_STATUS.has(e.status)) distributionBiz.push(e);
    }
    if (e.type === 'operates_franchise' || e.type === 'franchises_to') franchiseRelationshipCount += 1;
    if (OWNERSHIP_TYPES.has(e.type)) ownershipEdgeCount += 1;
    if (e.type === 'acquired' || e.type === 'divested') acquisitionCount += 1;
    if (MARKET_TYPES.has(e.type)) {
      marketExposureCount += 1;
      marketExposureEdges.push(e);
    }
    if (isBusinessEdge(e)) {
      businessEdges.push(e);
      if (e.status === 'confirmed') confirmedBusinessEdgeCount += 1;
      if (e.status === 'reported') reportedBusinessEdgeCount += 1;
    }
  }

  const brandNodeCount = nodes.filter((n) => n.type === 'brand').length;
  const productCategoryCount = nodes.filter((n) => n.type === 'product_category' || n.type === 'consumer_product').length;

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const zeroDegreeNodeCount = nodes.filter((n) => (degree.get(n.id) || 0) === 0
    && n.entityRole !== 'boundary_placeholder'
    && !(n.type === 'cross_sector_anchor' && n.isMapConstituent === false)).length;

  const brandStructuralWithEvidence = brandOwnershipEdges.filter((e) =>
    (e.evidence || []).some((ev) => ev.claimSupport?.brand || ev.claimSupport?.legalOwner)).length;

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
      { reason: 'no_brand_structural_edges' },
    ),
    distributionDirectEvidenceCoverage: computeCoverageMetric(
      distributionBiz.filter(edgeHasDirectEvidence).length,
      distributionBiz.length,
      { reason: 'no_eligible_distribution_edges' },
    ),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      edges.filter((e) => OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status) && edgeHasPrimary(e)).length,
      edges.filter((e) => OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)).length,
      { reason: 'no_eligible_ownership_edges' },
    ),
    marketExposureEvidenceCoverage: computeCoverageMetric(
      marketExposureEdges.length ? marketExposureEdges.length : 0,
      marketExposureEdges.length,
      { reason: 'no_market_exposure_edges' },
    ),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      crossSectorRefEdges.length,
      crossSectorRefEdges.length,
      { reason: 'no_cross_sector_refs' },
    ),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      brandOwnershipDenominator: 'owns_brand/operates_brand/licenses_brand structural edges',
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
    brandNodeCount,
    productCategoryCount,
    manufacturingRelationshipCount,
    supplyRelationshipCount,
    distributionRelationshipCount,
    franchiseRelationshipCount,
    ownershipEdgeCount,
    acquisitionCount,
    marketExposureCount,
    crossSectorReferenceCount,
    operatedBrandRelationshipCount,
    ownedBrandRelationshipCount,
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
      [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length]),
    ),
  };
}
