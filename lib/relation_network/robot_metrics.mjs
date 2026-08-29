/**
 * Robot sector metrics — Phase 5I.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY = new Set([
  'supplies_component_to', 'supplies_reducer_to', 'supplies_actuator_to',
  'supplies_sensor_to', 'supplies_controller_to', 'supplies_robot_to',
]);
const DEPLOY = new Set(['deployed_at', 'pilot_at', 'integrates_for', 'awarded_contract', 'participates_in_project']);
const DEV = new Set(['develops_with', 'licenses_technology_to']);
const OWNER = new Set(['owns', 'owns_stake_in', 'acquired', 'divested', 'operates_joint_venture', 'invests_in']);
const BUSINESS = new Set([...SUPPLY, ...DEPLOY, ...DEV, ...OWNER, 'distributes_for']);
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

export function computeRobotMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const orphan = computeListedRelationOrphanMetrics(network);
  const listed = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false);

  let structuralGeneratedEdgeCount = 0;
  let legacyMigratedEdgeCount = 0;
  let manuallyCuratedEdgeCount = 0;
  let confirmedBusinessEdgeCount = 0;
  let reportedBusinessEdgeCount = 0;
  let inferredBusinessEdgeCount = 0;
  let peerEdgeCount = 0;
  let componentSupplyCount = 0;
  let robotSupplyCount = 0;
  let deploymentRelationshipCount = 0;
  let pilotRelationshipCount = 0;
  let developmentRelationshipCount = 0;
  let investmentRelationshipCount = 0;
  let ownershipEdgeCount = 0;
  let acquisitionCount = 0;
  let projectParticipationCount = 0;
  let crossSectorReferenceCount = 0;

  const businessEdges = [];
  const supplyEdges = [];
  const deployEdges = [];
  const investEdges = [];
  const ownershipEdges = [];
  const projectEdges = [];
  const xrefEdges = [];

  for (const e of edges) {
    if (e.edgeOrigin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (e.edgeOrigin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (e.edgeOrigin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;
    if (e.type === 'peer' || e.status === 'peer') peerEdgeCount += 1;
    if (e.type === 'cross_sector_reference') { crossSectorReferenceCount += 1; xrefEdges.push(e); }
    if (SUPPLY.has(e.type) && BIZ_STATUS.has(e.status)) {
      if (e.type === 'supplies_robot_to') robotSupplyCount += 1;
      else componentSupplyCount += 1;
      supplyEdges.push(e);
    }
    if (e.type === 'deployed_at' && BIZ_STATUS.has(e.status)) { deploymentRelationshipCount += 1; deployEdges.push(e); }
    if (e.type === 'pilot_at' && BIZ_STATUS.has(e.status)) pilotRelationshipCount += 1;
    if (DEV.has(e.type) && BIZ_STATUS.has(e.status)) developmentRelationshipCount += 1;
    if (e.type === 'invests_in' && BIZ_STATUS.has(e.status)) { investmentRelationshipCount += 1; investEdges.push(e); }
    if ((e.type === 'owns' || e.type === 'owns_stake_in') && BIZ_STATUS.has(e.status)) {
      ownershipEdgeCount += 1; ownershipEdges.push(e);
    }
    if (e.type === 'acquired' && BIZ_STATUS.has(e.status)) acquisitionCount += 1;
    if (['participates_in_project', 'awarded_contract', 'integrates_for'].includes(e.type) && BIZ_STATUS.has(e.status)) {
      projectParticipationCount += 1; projectEdges.push(e);
    }
    if (e.status === 'inferred' && BUSINESS.has(e.type)) inferredBusinessEdgeCount += 1;
    if (isBiz(e)) {
      businessEdges.push(e);
      if (e.status === 'confirmed') confirmedBusinessEdgeCount += 1;
      if (e.status === 'reported') reportedBusinessEdgeCount += 1;
    }
  }

  const byType = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1;

  const degree = new Map();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    if (degree.has(e.source)) degree.set(e.source, degree.get(e.source) + 1);
    if (degree.has(e.target)) degree.set(e.target, degree.get(e.target) + 1);
  }
  let zeroDegreeNodeCount = 0;
  for (const n of nodes) {
    if (n.excludedFromCounts === true || n.entityRole === 'boundary_placeholder') continue;
    if ((degree.get(n.id) || 0) === 0) zeroDegreeNodeCount += 1;
  }

  const nameKey = new Map();
  let duplicateSemanticNodeCount = 0;
  for (const n of nodes) {
    if (!n.nameKo && !n.nameEn) continue;
    const k = `${n.type}|${(n.nameKo || n.nameEn || '').toLowerCase()}`;
    if (nameKey.has(k)) duplicateSemanticNodeCount += 1;
    else nameKey.set(k, n.id);
  }

  return {
    listedCompanyCount: listed.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeCountByType: byType,
    robotProductCount: nodes.filter((n) => n.type === 'robot_product').length,
    robotCategoryCount: nodes.filter((n) => n.type === 'robot_category').length,
    componentNodeCount: nodes.filter((n) => n.type === 'robot_component').length,
    reducerNodeCount: nodes.filter((n) => n.type === 'reducer').length,
    actuatorNodeCount: nodes.filter((n) => n.type === 'actuator').length,
    sensorNodeCount: nodes.filter((n) => n.type === 'sensor').length,
    controllerNodeCount: nodes.filter((n) => n.type === 'controller').length,
    softwareNodeCount: nodes.filter((n) => n.type === 'robot_software').length,
    applicationNodeCount: nodes.filter((n) => n.type === 'application' || n.type === 'end_market').length,
    projectNodeCount: nodes.filter((n) => n.type === 'project').length,
    structuralGeneratedEdgeCount,
    legacyMigratedEdgeCount,
    manuallyCuratedEdgeCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    inferredBusinessEdgeCount,
    peerEdgeCount,
    componentSupplyCount,
    robotSupplyCount,
    deploymentRelationshipCount,
    pilotRelationshipCount,
    developmentRelationshipCount,
    investmentRelationshipCount,
    ownershipEdgeCount,
    acquisitionCount,
    projectParticipationCount,
    crossSectorReferenceCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directCommercialRelationshipOrphanCount: orphan.directCommercialRelationshipOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
    hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount,
    peerOnlyCompanyCount: orphan.peerOnlyCompanyCount,
    zeroDegreeNodeCount,
    duplicateSemanticNodeCount,
    claimCoverage: {
      evidenceFieldCoverage: computeCoverageMetric(
        edges.filter((e) => (e.evidence || []).length > 0).length, edges.length,
        { reason: 'no_edges' }),
      businessRelationshipDirectEvidenceCoverage: computeCoverageMetric(
        businessEdges.filter(edgeHasDirect).length, businessEdges.length,
        { reason: 'no_eligible_business_edges' }),
      businessRelationshipPrimarySourceCoverage: computeCoverageMetric(
        businessEdges.filter(edgeHasPrimary).length, businessEdges.length,
        { reason: 'no_eligible_business_edges' }),
      componentSupplyDirectEvidenceCoverage: computeCoverageMetric(
        supplyEdges.filter(edgeHasDirect).length, supplyEdges.length,
        { reason: 'no_eligible_supply_edges' }),
      deploymentDirectEvidenceCoverage: computeCoverageMetric(
        deployEdges.filter(edgeHasDirect).length, deployEdges.length,
        { reason: 'no_eligible_deployment_edges' }),
      investmentPrimarySourceCoverage: computeCoverageMetric(
        investEdges.filter(edgeHasPrimary).length, investEdges.length,
        { reason: 'no_eligible_investment_edges' }),
      ownershipPrimarySourceCoverage: computeCoverageMetric(
        ownershipEdges.filter(edgeHasPrimary).length, ownershipEdges.length,
        { reason: 'no_eligible_ownership_edges' }),
      projectRoleDirectEvidenceCoverage: computeCoverageMetric(
        projectEdges.filter(edgeHasDirect).length, projectEdges.length,
        { reason: 'no_eligible_project_edges' }),
      crossSectorReferenceEvidenceCoverage: computeCoverageMetric(
        xrefEdges.filter((e) => (e.evidence || []).length > 0).length, xrefEdges.length,
        { reason: 'no_cross_sector_refs' }),
      metricNotes: {
        businessRelationshipDenominator: 'confirmed + reported business edges only',
        zeroDenominator: 'percentage=null, displayValue=N/A, applicable=false',
        phase5i: 'No invented supply/deploy/invest; legacy partners demoted to peer',
      },
    },
  };
}
