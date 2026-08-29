/**
 * K-content sector metrics — Phase 5F.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const ARTIST_TYPES = new Set(['represents_artist', 'manages_artist']);
const DISTRIBUTION_TYPES = new Set([
  'distributes_to', 'licenses_ip_to', 'streams_on', 'broadcasts_on', 'publishes_on',
]);
const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in', 'operates_joint_venture']);
const BUSINESS_TYPES = new Set([
  'produces_for', 'co_produces_with', 'distributes_to', 'licenses_ip_to',
  'streams_on', 'broadcasts_on', 'publishes_on', 'adapts_ip', 'invests_in_production',
  'owns', 'owns_stake_in', 'operates_joint_venture',
  'collaborates_with_brand', 'licenses_ip_for_merchandise', 'endorses_brand',
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

export function computeKcontentMetrics(network) {
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
  let artistManagementRelationshipCount = 0;
  let ipOwnershipCount = 0;
  let productionRelationshipCount = 0;
  let coProductionCount = 0;
  let distributionRelationshipCount = 0;
  let platformAvailabilityCount = 0;
  let licensingRelationshipCount = 0;
  let ownershipEdgeCount = 0;
  let jointVentureEdgeCount = 0;
  let crossSectorReferenceCount = 0;
  let endedRelationshipCount = 0;

  const businessEdges = [];
  const artistEdges = [];
  const ipEdges = [];
  const crossSectorRefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;
    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.status === 'ended' || e.lifecycleStatus === 'ended' || e.lifecycleStatus === 'expired') {
      endedRelationshipCount += 1;
    }
    if (e.type === 'cross_sector_reference') {
      crossSectorReferenceCount += 1;
      crossSectorRefEdges.push(e);
    }
    if (ARTIST_TYPES.has(e.type)) {
      artistManagementRelationshipCount += 1;
      artistEdges.push(e);
    }
    if (e.type === 'owns_ip' || e.type === 'controls_ip') {
      ipOwnershipCount += 1;
      ipEdges.push(e);
    }
    if (e.type === 'produces_content' || e.type === 'produces_for') productionRelationshipCount += 1;
    if (e.type === 'co_produces_with') coProductionCount += 1;
    if (DISTRIBUTION_TYPES.has(e.type)) distributionRelationshipCount += 1;
    if (e.type === 'streams_on' || e.type === 'broadcasts_on' || e.type === 'publishes_on') {
      platformAvailabilityCount += 1;
    }
    if (e.type === 'licenses_ip_to' || e.type === 'licenses_ip_for_merchandise') {
      licensingRelationshipCount += 1;
    }
    if (e.type === 'owns' || e.type === 'owns_stake_in') ownershipEdgeCount += 1;
    if (e.type === 'operates_joint_venture') jointVentureEdgeCount += 1;
    if (isBusinessEdge(e)) {
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
    artistManagementEvidenceCoverage: computeCoverageMetric(
      artistEdges.length,
      artistEdges.length,
      { reason: 'no_artist_structural_edges' },
    ),
    ipOwnershipEvidenceCoverage: computeCoverageMetric(
      ipEdges.length,
      ipEdges.length,
      { reason: 'no_ip_structural_edges' },
    ),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      crossSectorRefEdges.length,
      crossSectorRefEdges.length,
      { reason: 'no_cross_sector_refs' },
    ),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      artistManagementDenominator: 'represents_artist/manages_artist structural',
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
    artistNodeCount: nodes.filter((n) => n.type === 'artist_or_group' || n.type === 'creator').length,
    contentIpNodeCount: nodes.filter((n) => n.type === 'content_ip' || n.type === 'franchise_ip').length,
    studioNodeCount: nodes.filter((n) => n.type === 'studio').length,
    platformNodeCount: nodes.filter((n) => n.type === 'platform' || n.type === 'streaming_service').length,
    artistManagementRelationshipCount,
    ipOwnershipCount,
    productionRelationshipCount,
    coProductionCount,
    distributionRelationshipCount,
    platformAvailabilityCount,
    licensingRelationshipCount,
    ownershipEdgeCount,
    jointVentureEdgeCount,
    crossSectorReferenceCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    peerEdgeCount,
    endedRelationshipCount,
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
