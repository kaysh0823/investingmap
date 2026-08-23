/**
 * Nuclear Phase 4B / 4B.1 — project/lifecycle metrics.
 * Separates actual projects from ecosystem/technology nodes.
 */

const PROJECT_ROLE_TYPES = new Set([
  'project_owner',
  'project_developer',
  'project_operator',
  'export_lead',
  'selected_for',
  'preferred_bidder_for',
  'negotiates_for',
  'epc_for',
  'architect_engineer_for',
  'designs_for',
  'builds',
  'commissions',
  'operates',
  'maintains',
  'decommissions',
  'supplies_nsss_to',
  'supplies_reactor_to',
  'supplies_turbine_to',
  'supplies_equipment_to',
  'supplies_ic_to',
  'supplies_fuel_to',
  'supplies_service_to',
  'consortium_member',
  'memorandum_with',
  'feasibility_study_for',
]);

const SUPPLY_TYPES = new Set([
  'supplies_nsss_to',
  'supplies_reactor_to',
  'supplies_turbine_to',
  'supplies_equipment_to',
  'supplies_ic_to',
  'supplies_fuel_to',
  'supplies_service_to',
]);

const STRUCTURAL_TYPES = new Set([
  'manufactures',
  'supports_lifecycle_stage',
  'used_in_reactor',
  'member_of',
  'exposed_to',
]);

/**
 * @param {{ nodes?: object[], edges?: object[] }} network
 */
export function computeNuclearProjectMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const projects = nodes.filter((n) => n.type === 'nuclear_project' && !n.isStructuralBundle);
  const ecosystems = nodes.filter((n) => n.type === 'ecosystem' || n.isStructuralBundle);
  const reactors = nodes.filter((n) => n.type === 'reactor_technology');
  const smrTech = nodes.filter((n) => n.type === 'smr_technology');

  const structuralGeneratedEdgeCount = edges.filter((e) =>
    e.relationClass === 'structural' || STRUCTURAL_TYPES.has(e.type)).length;
  const lifecycleRoleEdgeCount = edges.filter((e) => e.type === 'supports_lifecycle_stage').length;
  const equipmentCategoryEdgeCount = edges.filter((e) =>
    e.type === 'manufactures' && byId.get(e.target)?.type === 'equipment_category').length;

  const uniqueProjectCount = projects.length; // legacy alias → actual only
  const uniqueActualProjectCount = projects.length;
  const structuralEcosystemNodeCount = ecosystems.length;
  const reactorTechnologyNodeCount = reactors.length;
  const largeNuclearActualProjectCount = projects.filter((p) => p.scope !== 'smr').length;
  const smrActualProjectCount = projects.filter((p) => p.scope === 'smr').length;
  const smrProjectCount = smrTech.length; // technology nodes (not projects)
  const domesticProjectCount = projects.filter((p) => p.scope === 'domestic' || p.countryCode === 'KR').length;
  const overseasProjectCount = projects.filter((p) => p.scope === 'overseas').length;

  const statusOf = (p) => p.projectStatus || 'unknown';
  const memorandumProjectCount = projects.filter((p) => statusOf(p) === 'memorandum').length;
  const selectedBidderProjectCount = projects.filter((p) =>
    ['preferred_bidder', 'selected_bidder', 'negotiation'].includes(statusOf(p))).length;
  const preferredBidderProjectCount = selectedBidderProjectCount;
  const contractSignedProjectCount = projects.filter((p) =>
    p.contractSigned === true || statusOf(p) === 'contract_signed'
    || p.contractStatus === 'effective' || p.contractStatus === 'completed').length;
  const designLicensingProjectCount = projects.filter((p) =>
    ['design', 'licensing', 'pre_construction'].includes(statusOf(p))).length;
  const underConstructionProjectCount = projects.filter((p) => statusOf(p) === 'under_construction').length;
  const operatingProjectCount = projects.filter((p) => statusOf(p) === 'operating').length;
  const completedProjectCount = projects.filter((p) => statusOf(p) === 'completed').length;
  const suspendedCancelledProjectCount = projects.filter((p) =>
    ['suspended', 'cancelled'].includes(statusOf(p))).length;

  const projectRoleEdges = edges.filter((e) =>
    PROJECT_ROLE_TYPES.has(e.type) && byId.get(e.target)?.type === 'nuclear_project');
  const structuralRoleEdges = edges.filter((e) =>
    (e.relationClass === 'structural' || STRUCTURAL_TYPES.has(e.type)
      || (PROJECT_ROLE_TYPES.has(e.type) && byId.get(e.target)?.type === 'ecosystem'))
    && e.type !== 'peer');

  const confirmedProjectRoleEdgeCount = projectRoleEdges.filter((e) =>
    e.status === 'confirmed' || e.editorialStatus === 'confirmed').length;
  const reportedProjectRoleEdgeCount = projectRoleEdges.filter((e) =>
    e.status === 'reported' || e.editorialStatus === 'reported').length;
  const confirmedStructuralRoleEdgeCount = structuralRoleEdges.filter((e) =>
    e.status === 'confirmed' || e.editorialStatus === 'confirmed').length;
  const reportedStructuralRoleEdgeCount = structuralRoleEdges.filter((e) =>
    e.status === 'reported' || e.editorialStatus === 'reported').length;

  const maintenanceRoleEdgeCount = edges.filter((e) => e.type === 'maintains' || e.type === 'supplies_service_to').length;
  const operatorRoleEdgeCount = edges.filter((e) => e.type === 'operates' || e.type === 'project_operator').length;
  const epcRoleEdgeCount = edges.filter((e) =>
    e.type === 'epc_for' || e.type === 'export_lead' || e.type === 'architect_engineer_for').length;

  const supplyEdges = edges.filter((e) => SUPPLY_TYPES.has(e.type));
  const confirmedSupplyContractCount = supplyEdges.filter((e) => e.status === 'confirmed').length;
  const reportedSupplyContractCount = supplyEdges.filter((e) => e.status === 'reported').length;

  const listed = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false
    && n.entityRole !== 'listed_reference_company' && !n.excludeFromMapCompanyCount);
  const listedAll = nodes.filter((n) => n.type === 'listed_company');
  const listedReferenceCompanyCount = nodes.filter((n) => n.entityRole === 'listed_reference_company').length;
  const duplicateListedEntityCount = (() => {
    const tickers = listedAll.map((n) => n.ticker).filter(Boolean);
    return tickers.length - new Set(tickers).size;
  })();
  const publicListedTypeConflictCount = nodes.filter((n) =>
    n.type === 'public_corporation' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))).length
    + (nodes.some((n) => n.id === 'public:kepco') && nodes.some((n) => n.id === 'krx:015760') ? 1 : 0);

  const businessTargets = new Set(
    edges
      .filter((e) => e.relationClass === 'business' || (PROJECT_ROLE_TYPES.has(e.type) && e.status !== 'reference'))
      .flatMap((e) => [e.source, e.target]),
  );
  const structuralOnly = listed.filter((n) => {
    const touched = edges.filter((e) => e.source === n.id || e.target === n.id);
    const hasBusiness = touched.some((e) =>
      e.relationClass === 'business' || (PROJECT_ROLE_TYPES.has(e.type) && e.status !== 'reference'));
    return !hasBusiness;
  });
  const classificationOnlyCompanyCount = structuralOnly.length;
  const businessRelationOrphanCount = listed.filter((n) => !businessTargets.has(n.id)).length;
  const directRelationshipOrphanCount = listed.filter((n) => {
    const hasDirect = edges.some((e) =>
      (e.source === n.id || e.target === n.id)
      && e.directEvidence
      && (e.status === 'confirmed' || e.status === 'reported')
      && PROJECT_ROLE_TYPES.has(e.type)
      && byId.get(e.target)?.type === 'nuclear_project');
    return !hasDirect;
  }).length;

  const roleEdgesWithEv = projectRoleEdges.filter((e) => (e.evidence || []).length > 0);
  const roleDirect = projectRoleEdges.filter((e) =>
    e.directEvidence || (e.evidence || []).some((ev) => ev.directEvidence));
  const exactProject = projectRoleEdges.filter((e) =>
    (e.evidence || []).some((ev) =>
      ev.evidenceUsageType === 'exact_project_document' || ev.evidenceUsageType === 'exact_contract_document'));
  const structuralRoleEv = structuralRoleEdges.filter((e) =>
    (e.evidence || []).some((ev) =>
      ev.evidenceUsageType === 'official_role_page' || ev.evidenceUsageType === 'exact_project_document'));
  const rolePrimary = projectRoleEdges.filter((e) => (e.evidence || []).some((ev) =>
    ['dart', 'operator', 'project_owner', 'government', 'company_ir', 'exchange_disclosure'].includes(ev.sourceType)));
  const smrEdges = edges.filter((e) =>
    e.scope === 'smr' || String(e.target).startsWith('smr:') || String(e.source).startsWith('smr:'));
  const smrDirect = smrEdges.filter((e) =>
    e.directEvidence || (e.evidence || []).some((ev) => ev.directEvidence));
  const humanReviewRoleCount = edges.filter((e) =>
    e.reviewStatus === 'needs_human_review' || (e.evidence || []).some((ev) =>
      ev.reviewStatus === 'needs_human_review')).length;

  const projectEvidenceFieldCoverage = projectRoleEdges.length
    ? roleEdgesWithEv.length / projectRoleEdges.length : 1;
  const projectDirectEvidenceCoverage = projectRoleEdges.length
    ? roleDirect.length / projectRoleEdges.length : 1;
  const exactProjectEvidenceCoverage = projectRoleEdges.length
    ? exactProject.length / projectRoleEdges.length : 1;
  const structuralRoleEvidenceCoverage = structuralRoleEdges.length
    ? structuralRoleEv.length / structuralRoleEdges.length : 1;
  const projectPrimarySourceCoverage = projectRoleEdges.length
    ? rolePrimary.length / projectRoleEdges.length : 1;
  const primarySourceCoverage = projectPrimarySourceCoverage;
  const smrDirectEvidenceCoverage = smrEdges.length ? smrDirect.length / smrEdges.length : 1;
  const roleDirectEvidenceCoverage = projectDirectEvidenceCoverage;

  const projectValueKnownCount = projects.filter((p) => p.totalProjectValue != null).length;
  const companyContractValueKnownCount = edges.filter((e) => e.companyContractValue != null).length;
  const potentialValueCount = projects.filter((p) => p.valueType === 'potential_value').length
    + edges.filter((e) => e.valueType === 'potential_value').length;

  return {
    structuralGeneratedEdgeCount,
    lifecycleRoleEdgeCount,
    equipmentCategoryEdgeCount,
    uniqueProjectCount,
    uniqueActualProjectCount,
    structuralEcosystemNodeCount,
    reactorTechnologyNodeCount,
    largeNuclearProjectCount: largeNuclearActualProjectCount,
    largeNuclearActualProjectCount,
    smrProjectCount,
    smrActualProjectCount,
    domesticProjectCount,
    overseasProjectCount,
    memorandumProjectCount,
    preferredBidderProjectCount,
    selectedBidderProjectCount,
    contractSignedProjectCount,
    designLicensingProjectCount,
    underConstructionProjectCount,
    operatingProjectCount,
    completedProjectCount,
    suspendedCancelledProjectCount,
    confirmedProjectRoleEdgeCount,
    reportedProjectRoleEdgeCount,
    confirmedStructuralRoleEdgeCount,
    reportedStructuralRoleEdgeCount,
    maintenanceRoleEdgeCount,
    operatorRoleEdgeCount,
    epcRoleEdgeCount,
    confirmedSupplyContractCount,
    reportedSupplyContractCount,
    businessRelationOrphanCount,
    directRelationshipOrphanCount,
    classificationOnlyCompanyCount,
    listedReferenceCompanyCount,
    duplicateListedEntityCount,
    publicListedTypeConflictCount,
    projectEvidenceFieldCoverage,
    projectDirectEvidenceCoverage,
    exactProjectEvidenceCoverage,
    structuralRoleEvidenceCoverage,
    projectPrimarySourceCoverage,
    primarySourceCoverage,
    smrDirectEvidenceCoverage,
    roleDirectEvidenceCoverage,
    humanReviewRoleCount,
    projectValueKnownCount,
    companyContractValueKnownCount,
    potentialValueCount,
    projectRoleEdgeCount: projectRoleEdges.length,
  };
}
