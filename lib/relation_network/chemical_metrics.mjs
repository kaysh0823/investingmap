/**
 * Chemical & refining sector metrics.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY = new Set(['supplies_chemical_to', 'supplies_feedstock_to', 'offtake_agreement_with']);
const REFINING = new Set(['operates_refinery', 'distributes_fuel_for']);
const OWNER = new Set(['owns', 'owns_stake_in', 'operates_joint_venture']);
const BUSINESS = new Set([...SUPPLY, ...REFINING, ...OWNER, 'develops_with', 'awarded_contract']);
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

export function computeChemicalMetrics(network) {
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
  let chemicalSupplyCount = 0;
  let refiningRelationshipCount = 0;
  let ownershipEdgeCount = 0;
  let crossSectorReferenceCount = 0;

  const businessEdges = [];
  const supplyEdges = [];
  const refiningEdges = [];
  const ownershipEdges = [];
  const xrefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;
    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.type === 'cross_sector_reference') { crossSectorReferenceCount += 1; xrefEdges.push(e); }
    if (SUPPLY.has(e.type) && BIZ_STATUS.has(e.status)) { chemicalSupplyCount += 1; supplyEdges.push(e); }
    if (REFINING.has(e.type) && BIZ_STATUS.has(e.status)) { refiningRelationshipCount += 1; refiningEdges.push(e); }
    if ((e.type === 'owns' || e.type === 'owns_stake_in') && BIZ_STATUS.has(e.status)) {
      ownershipEdgeCount += 1; ownershipEdges.push(e);
    }
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
    businessRelationshipDirectEvidenceCoverage: computeCoverageMetric(
      businessEdges.filter(edgeHasDirect).length, businessEdges.length, { reason: 'no_eligible_business_edges' }),
    supplyDirectEvidenceCoverage: computeCoverageMetric(
      supplyEdges.filter(edgeHasDirect).length, supplyEdges.length, { reason: 'no_eligible_supply_edges' }),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      ownershipEdges.filter(edgeHasPrimary).length, ownershipEdges.length, { reason: 'no_eligible_ownership_edges' }),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      xrefEdges.length, xrefEdges.length, { reason: 'no_cross_sector_refs' }),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      feedstockExposureNotSupply: 'feedstock/commodity exposure is structural, not supply contract',
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
    chemicalProductCount: nodes.filter((n) => n.type === 'chemical_product' || n.type === 'refining_product').length,
    chemicalSupplyCount,
    refiningRelationshipCount,
    ownershipEdgeCount,
    crossSectorReferenceCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    peerEdgeCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount ?? 0,
    zeroDegreeNodeCount,
    claimCoverage,
    nodeCountByType: Object.fromEntries(
      [...new Set(nodes.map((n) => n.type))].map((t) => [t, nodes.filter((n) => n.type === t).length])),
  };
}
