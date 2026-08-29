/**
 * Telecom sector metrics — Phase 5H.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const EQUIP = new Set(['supplies_equipment_to', 'supplies_component_to']);
const DEPLOY = new Set(['deploys_network_for']);
const WHOLESALE = new Set(['wholesales_network_to', 'roaming_agreement_with', 'distributes_service_for']);
const OWNER = new Set(['owns', 'owns_stake_in', 'acquired', 'divested', 'operates_joint_venture']);
const LICENSE = new Set(['assigned_by', 'licensed_by', 'authorized_for_service']);
const BUSINESS = new Set([...EQUIP, ...DEPLOY, ...WHOLESALE, ...OWNER, 'develops_with', 'awarded_contract']);
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

export function computeTelecomMetrics(network) {
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
  let equipmentSupplyCount = 0;
  let networkDeploymentCount = 0;
  let wholesaleNetworkRelationshipCount = 0;
  let roamingRelationshipCount = 0;
  let ownershipEdgeCount = 0;
  let jointVentureEdgeCount = 0;
  let crossSectorReferenceCount = 0;
  let activeLicenseCount = 0;

  const businessEdges = [];
  const equipEdges = [];
  const deployEdges = [];
  const wholesaleEdges = [];
  const ownershipEdges = [];
  const licenseEdges = [];
  const xrefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;
    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.type === 'cross_sector_reference') { crossSectorReferenceCount += 1; xrefEdges.push(e); }
    if (EQUIP.has(e.type) && BIZ_STATUS.has(e.status)) { equipmentSupplyCount += 1; equipEdges.push(e); }
    if (DEPLOY.has(e.type) && BIZ_STATUS.has(e.status)) { networkDeploymentCount += 1; deployEdges.push(e); }
    if (WHOLESALE.has(e.type) && BIZ_STATUS.has(e.status)) {
      wholesaleNetworkRelationshipCount += 1; wholesaleEdges.push(e);
      if (e.type === 'roaming_agreement_with') roamingRelationshipCount += 1;
    }
    if ((e.type === 'owns' || e.type === 'owns_stake_in') && BIZ_STATUS.has(e.status)) {
      ownershipEdgeCount += 1; ownershipEdges.push(e);
    }
    if (e.type === 'operates_joint_venture' && BIZ_STATUS.has(e.status)) jointVentureEdgeCount += 1;
    if (LICENSE.has(e.type)) licenseEdges.push(e);
    if (isBiz(e)) {
      businessEdges.push(e);
      if (e.status === 'confirmed') confirmedBusinessEdgeCount += 1;
      if (e.status === 'reported') reportedBusinessEdgeCount += 1;
    }
  }

  for (const n of nodes) {
    if (n.type === 'license_or_allocation' && ['assigned', 'active', 'renewed'].includes(n.status || n.currentStatus)) {
      activeLicenseCount += 1;
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
      equipEdges.filter(edgeHasDirect).length, equipEdges.length, { reason: 'no_eligible_supply_edges' }),
    partnershipDirectEvidenceCoverage: computeCoverageMetric(0, 0, { reason: 'no_eligible_partnership_edges' }),
    ownershipPrimarySourceCoverage: computeCoverageMetric(
      ownershipEdges.filter(edgeHasPrimary).length, ownershipEdges.length, { reason: 'no_eligible_ownership_edges' }),
    equipmentSupplyDirectEvidenceCoverage: computeCoverageMetric(
      equipEdges.filter(edgeHasDirect).length, equipEdges.length, { reason: 'no_eligible_equipment_supply' }),
    networkDeploymentDirectEvidenceCoverage: computeCoverageMetric(
      deployEdges.filter(edgeHasDirect).length, deployEdges.length, { reason: 'no_eligible_deployments' }),
    activeLicensePrimarySourceCoverage: computeCoverageMetric(
      0, activeLicenseCount, { reason: 'no_active_license_nodes' }),
    wholesaleNetworkDirectEvidenceCoverage: computeCoverageMetric(
      wholesaleEdges.filter(edgeHasDirect).length, wholesaleEdges.length, { reason: 'no_eligible_wholesale' }),
    crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
      xrefEdges.length, xrefEdges.length, { reason: 'no_cross_sector_refs' }),
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      spectrumNotOwnership: 'spectrum assignment is regulatory, not company ownership or business edge',
      certificationNotSupply: 'network certification/compatibility is not equipment supply',
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
    operatorNodeCount: nodes.filter((n) => n.type === 'network_operator' || (n.type === 'listed_company' && n.lane === 'network_operator')).length,
    telecomServiceCount: nodes.filter((n) => n.type === 'telecom_service').length,
    equipmentNodeCount: nodes.filter((n) => n.type === 'network_equipment').length,
    componentNodeCount: nodes.filter((n) => n.type === 'network_component').length,
    spectrumBandCount: nodes.filter((n) => n.type === 'spectrum_band').length,
    activeLicenseCount,
    infrastructureAssetCount: nodes.filter((n) => n.type === 'infrastructure_asset').length,
    datacenterCount: nodes.filter((n) => n.type === 'data_center').length,
    equipmentSupplyCount,
    networkDeploymentCount,
    wholesaleNetworkRelationshipCount,
    roamingRelationshipCount,
    ownershipEdgeCount,
    jointVentureEdgeCount,
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
