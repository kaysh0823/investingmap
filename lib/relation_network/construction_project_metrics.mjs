/**
 * Construction Phase 5A/5A.1/5A.3 — project qualification & value-semantics metrics.
 * Orphan counts share definitions with orphan_metrics.mjs.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import {
  computeConstructionClaimCoverageMetrics,
  isReviewedDirect,
} from './construction_claim_support.mjs';

const PROJECT_ROLE_TYPES = new Set([
  'owns_stake_in', 'project_owner', 'project_developer', 'spc_shareholder', 'pfv_shareholder',
  'reit_shareholder', 'architect_for', 'engineering_for', 'main_contractor', 'epc_for', 'constructs',
  'consortium_member', 'subcontractor_for', 'commissioning_for', 'finances', 'arranges_pf', 'guarantees',
  'operates', 'property_manages', 'maintains', 'awarded_contract', 'preferred_bidder_for',
]);

const STRUCTURAL_TYPES = new Set([
  'member_of', 'operates_brand', 'specializes_in', 'builds', 'manufactures', 'exposed_to',
]);

const EQUIPMENT_SUPPLY = new Set([
  'supplies_equipment_to', 'supplies_machinery_to', 'supplies_material_to',
]);

const OWNERSHIP = new Set(['owns_stake_in', 'spc_shareholder', 'pfv_shareholder', 'reit_shareholder', 'owns']);
const MAIN_CONTRACTOR = new Set(['main_contractor', 'constructs']);
const EPC = new Set(['epc_for']);
const DEVELOPER = new Set(['project_developer']);
const PROJECT_NODE_TYPES = new Set(['construction_project', 'overseas_epc_project']);

const PRIMARY_SOURCE_TYPES = new Set([
  'government', 'regulator', 'disclosure', 'company_ir', 'dart',
]);

function editorialOf(e) {
  return e.editorialStatus || e.status || 'reported';
}

function statusOf(p) {
  return p.projectStatus || 'unknown';
}

function projectHasDirectEvidence(p) {
  return (p.evidence || []).some((ev) =>
    isReviewedDirect(ev)
    && (ev.claimSupport
      ? Object.values(ev.claimSupport).some(Boolean)
      : ev.relationshipSupported));
}

function projectHasPrimarySource(p) {
  return (p.evidence || []).some((ev) =>
    isReviewedDirect(ev)
    && (ev.primarySource === true || PRIMARY_SOURCE_TYPES.has(ev.sourceType))
    && (ev.claimSupport
      ? Object.values(ev.claimSupport).some(Boolean)
      : true));
}

/**
 * @param {{ nodes?: object[], edges?: object[] }} network
 */
export function computeConstructionProjectMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const projects = nodes.filter((n) => PROJECT_NODE_TYPES.has(n.type) && !n.isStructuralBundle);
  const brands = nodes.filter((n) => n.type === 'apartment_brand');
  const equipment = nodes.filter((n) => n.type === 'equipment_category');
  const buildingTypes = nodes.filter((n) => n.type === 'building_type' || n.type === 'infrastructure_type');

  const structuralGeneratedEdgeCount = edges.filter((e) =>
    e.relationClass === 'structural' || STRUCTURAL_TYPES.has(e.type)).length;
  const buildingTypeEdgeCount = edges.filter((e) =>
    e.type === 'specializes_in' || e.type === 'builds'
    || byId.get(e.target)?.type === 'building_type'
    || byId.get(e.target)?.type === 'infrastructure_type').length;
  const equipmentCategoryEdgeCount = edges.filter((e) =>
    byId.get(e.target)?.type === 'equipment_category' || byId.get(e.source)?.type === 'equipment_category').length;
  const brandEdgeCount = edges.filter((e) => e.type === 'operates_brand').length;

  const uniqueActualProjectCount = projects.length;
  const domesticProjectCount = projects.filter((p) => p.type === 'construction_project' || p.scope === 'domestic').length;
  const overseasProjectCount = projects.filter((p) => p.type === 'overseas_epc_project' || p.scope === 'overseas').length;
  const housingProjectCount = projects.filter((p) =>
    p.projectCategory === 'housing' || p.buildingType === 'housing' || p.lane === 'developer_housing').length;
  const infrastructureProjectCount = projects.filter((p) =>
    p.projectCategory === 'infrastructure' || (p.lane === 'plant_infra' && p.subCategory === 'infra')).length;
  const plantProjectCount = projects.filter((p) =>
    p.projectCategory === 'plant' || p.type === 'overseas_epc_project' || p.lane === 'overseas_epc').length;
  const machineryProductCount = equipment.length;

  const preferredBidderProjectCount = projects.filter((p) => statusOf(p) === 'preferred_bidder').length;
  const contractSignedProjectCount = projects.filter((p) =>
    ['contract_signed', 'notice_to_proceed', 'financial_close'].includes(statusOf(p))).length;
  const presaleProjectCount = projects.filter((p) => statusOf(p) === 'presale').length;
  const underConstructionProjectCount = projects.filter((p) =>
    ['under_construction', 'commissioning'].includes(statusOf(p))).length;
  const completedProjectCount = projects.filter((p) =>
    ['completed', 'operating'].includes(statusOf(p))).length;
  const suspendedCancelledTerminatedCount = projects.filter((p) =>
    ['suspended', 'cancelled', 'terminated'].includes(statusOf(p))).length;

  const projectRoleEdges = edges.filter((e) =>
    PROJECT_ROLE_TYPES.has(e.type)
    && (PROJECT_NODE_TYPES.has(byId.get(e.target)?.type)
      || PROJECT_NODE_TYPES.has(byId.get(e.source)?.type)
      || ['spc', 'pfv', 'reit', 'consortium', 'contract'].includes(byId.get(e.target)?.type)));

  const confirmedProjectRoleEdgeCount = projectRoleEdges.filter((e) => editorialOf(e) === 'confirmed').length;
  const reportedProjectRoleEdgeCount = projectRoleEdges.filter((e) => editorialOf(e) === 'reported').length;
  const referenceProjectRoleEdgeCount = projectRoleEdges.filter((e) => editorialOf(e) === 'reference').length;
  const inferredProjectRoleEdgeCount = projectRoleEdges.filter((e) => editorialOf(e) === 'inferred').length;
  const developerRoleEdgeCount = edges.filter((e) => DEVELOPER.has(e.type)).length;
  const ownershipEdgeCount = edges.filter((e) => OWNERSHIP.has(e.type)).length;
  const mainContractorEdgeCount = edges.filter((e) => MAIN_CONTRACTOR.has(e.type)).length;
  const epcEdgeCount = edges.filter((e) => EPC.has(e.type)).length;
  const consortiumEdgeCount = edges.filter((e) => e.type === 'consortium_member').length;
  const equipmentSupplyEdgeCount = edges.filter((e) => EQUIPMENT_SUPPLY.has(e.type)).length;
  const pfFinanceEdgeCount = edges.filter((e) =>
    e.type === 'finances' || e.type === 'arranges_pf' || e.type === 'guarantees').length;

  let projectValueKnownCount = 0;
  let companyContractValueKnownCount = 0;
  let companyShareValueKnownCount = 0;
  let participationPctKnownCount = 0;
  let pfAmountKnownCount = 0;
  let guaranteeAmountKnownCount = 0;
  let potentialValueCount = 0;

  for (const p of projects) {
    if (p.totalProjectValue != null || p.projectTotalValue != null) projectValueKnownCount += 1;
    if (p.companyContractValue != null || p.constructionContractValue != null || p.contractValue != null) {
      companyContractValueKnownCount += 1;
    }
    if (p.companyShareValue != null) companyShareValueKnownCount += 1;
    if (p.companyParticipationPct != null || p.equityStakePct != null) participationPctKnownCount += 1;
    if (p.projectFinanceAmount != null || p.financingAmount != null) pfAmountKnownCount += 1;
    if (p.guaranteeAmount != null) guaranteeAmountKnownCount += 1;
    if (p.valueType === 'potential_value') potentialValueCount += 1;
  }
  for (const e of edges) {
    if (e.companyContractValue != null || e.contractValue != null) companyContractValueKnownCount += 1;
    if (e.companyShareValue != null) companyShareValueKnownCount += 1;
    if (e.companyParticipationPct != null || e.participationPct != null || e.equityStakePct != null) {
      participationPctKnownCount += 1;
    }
    if (e.projectFinanceAmount != null || e.financingAmount != null || e.guaranteedAmount != null
      || e.guaranteeAmount != null) {
      if (e.guaranteedAmount != null || e.guaranteeAmount != null) guaranteeAmountKnownCount += 1;
      else pfAmountKnownCount += 1;
    }
    if (e.valueType === 'potential_value') potentialValueCount += 1;
  }

  const projectsWithEv = projects.filter((p) => Array.isArray(p.evidence) && p.evidence.length);
  const projectsDirect = projects.filter(projectHasDirectEvidence);
  const projectsPrimary = projects.filter(projectHasPrimarySource);
  const ownershipEdges = edges.filter((e) => OWNERSHIP.has(e.type));
  const ownershipDirect = ownershipEdges.filter((e) =>
    (e.directEvidence && e.reviewStatus === 'reviewed' && e.reviewedAt && e.reviewedBy)
    || (e.evidence || []).some((ev) =>
      ev.directEvidence && ev.reviewStatus === 'reviewed' && ev.reviewedAt && ev.reviewedBy));

  const denomP = projects.length || 1;
  const orphan = computeListedRelationOrphanMetrics({ nodes, edges });
  const claimCoverage = computeConstructionClaimCoverageMetrics({ nodes, edges });

  return {
    structuralGeneratedEdgeCount,
    buildingTypeEdgeCount,
    equipmentCategoryEdgeCount,
    brandEdgeCount,
    uniqueActualProjectCount,
    domesticProjectCount,
    overseasProjectCount,
    housingProjectCount,
    infrastructureProjectCount,
    plantProjectCount,
    machineryProductCount,
    preferredBidderProjectCount,
    contractSignedProjectCount,
    presaleProjectCount,
    underConstructionProjectCount,
    completedProjectCount,
    suspendedCancelledTerminatedCount,
    confirmedProjectRoleEdgeCount,
    reportedProjectRoleEdgeCount,
    referenceProjectRoleEdgeCount,
    inferredProjectRoleEdgeCount,
    developerRoleEdgeCount,
    ownershipEdgeCount,
    mainContractorEdgeCount,
    epcEdgeCount,
    consortiumEdgeCount,
    equipmentSupplyEdgeCount,
    pfFinanceEdgeCount,
    projectValueKnownCount,
    companyContractValueKnownCount,
    companyShareValueKnownCount,
    participationPctKnownCount,
    pfAmountKnownCount,
    guaranteeAmountKnownCount,
    potentialValueCount,
    projectDirectEvidenceCoverage: projectsDirect.length / denomP,
    projectPrimarySourceCoverage: projectsPrimary.length / denomP,
    projectEvidenceFieldCoverage: projectsWithEv.length / denomP,
    projectAnyDirectEvidenceCoverage: projectsDirect.length / denomP,
    projectAnyPrimarySourceCoverage: projectsPrimary.length / denomP,
    relationshipDirectEvidenceCoverage: claimCoverage.relationshipDirectEvidenceCoverage.percentage,
    relationshipPrimarySourceCoverage: claimCoverage.relationshipPrimarySourceCoverage.percentage,
    contractStatusDirectEvidenceCoverage: claimCoverage.contractStatusDirectEvidenceCoverage.percentage,
    contractStatusPrimarySourceCoverage: claimCoverage.contractStatusPrimarySourceCoverage.percentage,
    contractValueDirectEvidenceCoverage: claimCoverage.contractValueDirectEvidenceCoverage.percentage,
    contractValuePrimarySourceCoverage: claimCoverage.contractValuePrimarySourceCoverage.percentage,
    companyShareValueDirectEvidenceCoverage: claimCoverage.companyShareValueDirectEvidenceCoverage.percentage,
    companyShareValuePrimarySourceCoverage: claimCoverage.companyShareValuePrimarySourceCoverage.percentage,
    lifecycleDirectEvidenceCoverage: claimCoverage.lifecycleDirectEvidenceCoverage.percentage,
    lifecyclePrimarySourceCoverage: claimCoverage.lifecyclePrimarySourceCoverage.percentage,
    claimCoverage,
    ownershipDirectEvidenceCoverage: ownershipEdges.length ? ownershipDirect.length / ownershipEdges.length : 1,
    evidenceDenominators: {
      projects: projects.length,
      projectsDirectEvidence: projectsDirect.length,
      projectsPrimarySource: projectsPrimary.length,
      ownershipEdges: ownershipEdges.length,
      brands: brands.length,
      buildingTypes: buildingTypes.length,
      directEvidenceGate: 'directEvidence=true AND reviewStatus=reviewed AND reviewedAt/By AND claimSupport or relationshipSupported',
      primarySourceTypes: [...PRIMARY_SOURCE_TYPES],
      projectAnyDirectEvidenceCoverage: '≥1 reviewed direct evidence supports any claimSupport field',
      projectAnyPrimarySourceCoverage: '≥1 reviewed direct primary evidence supports any claim (not all claims)',
    },
    listedCompanyCount: orphan.listedCompanyCount,
    structuralOrphanCount: orphan.structuralOrphanCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
    weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
    confirmedReportedBusinessOrphanCount: orphan.confirmedReportedBusinessOrphanCount,
    orphanMetricDefinitions: orphan.metricDefinitions,
    orphanDetails: orphan.details,
    brandNodeCount: brands.length,
    phase5aCuratedAt: '2026-08-23',
    phase5a1CuratedAt: network.phase5a1CuratedAt || null,
    phase5a2CuratedAt: network.phase5a2CuratedAt || null,
    phase5a3CuratedAt: network.phase5a3CuratedAt || null,
  };
}
