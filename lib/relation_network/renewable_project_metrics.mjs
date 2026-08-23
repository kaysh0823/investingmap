/**
 * Renewable Phase 4C / 4C.1 — project qualification & capacity-semantics metrics.
 */

const PROJECT_ROLE_TYPES = new Set([
  'project_owner', 'project_developer', 'owns_stake_in', 'spv_shareholder', 'project_operator',
  'development_rights', 'epc_for', 'engineering_for', 'constructs', 'commissions', 'operates',
  'maintains', 'grid_connects', 'participates_in', 'supplies_module_to', 'supplies_inverter_to',
  'supplies_turbine_to', 'supplies_structure_to', 'supplies_cable_to', 'supplies_substation_to',
  'supplies_fuel_cell_to', 'supplies_hydrogen_equipment_to', 'supplies_storage_to',
  'power_purchase_agreement', 'rec_purchase_agreement', 'hydrogen_offtake', 'finances', 'insures',
  'consortium_member', 'joint_development', 'memorandum_with', 'technology_partnership', 'joint_venture',
]);

const STRUCTURAL_TYPES = new Set([
  'member_of', 'develops', 'manufactures', 'used_in_technology', 'supports_project_stage', 'exposed_to',
]);

const EQUIPMENT_SUPPLY_TYPES = new Set([
  'supplies_module_to', 'supplies_inverter_to', 'supplies_turbine_to', 'supplies_structure_to',
  'supplies_cable_to', 'supplies_substation_to', 'supplies_fuel_cell_to',
  'supplies_hydrogen_equipment_to', 'supplies_storage_to',
]);

const OWNERSHIP_TYPES = new Set(['project_owner', 'owns_stake_in', 'spv_shareholder', 'owns']);
const EPC_TYPES = new Set(['epc_for', 'engineering_for', 'constructs']);
const OM_TYPES = new Set(['operates', 'maintains', 'commissions', 'project_operator']);
const PPA_TYPES = new Set(['power_purchase_agreement', 'rec_purchase_agreement', 'hydrogen_offtake']);

const TECH_KEYS = ['solar', 'onshore_wind', 'offshore_wind', 'fuel_cell', 'hydrogen'];
const DEVELOPMENT_STATUSES = new Set([
  'concept', 'memorandum', 'site_secured', 'development', 'feasibility_study',
  'permit_application', 'financing',
]);

function emptyTechMap() {
  return Object.fromEntries(TECH_KEYS.map((k) => [k, 0]));
}

function emptyCompanyMap() {
  return {};
}

function statusOf(p) {
  return p.projectStatus || 'unknown';
}

function techOf(p) {
  return p.technology || p.techLane || 'unknown';
}

function editorialOf(e) {
  return e.editorialStatus || e.status || 'reported';
}

/** Convert capacity to MW when unit is power; null for hydrogen tonnes etc. */
function toMw(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const u = String(unit || 'MW').toLowerCase();
  const n = Number(value);
  if (u === 'gw') return n * 1000;
  if (u === 'kw') return n / 1000;
  if (u === 'mw' || u === 'mwac' || u === 'mwdc' || u === 'mwth') return n;
  return null;
}

function capacityField(p, prefer) {
  if (prefer === 'project') {
    return toMw(p.projectTotalCapacity ?? p.capacityValue, p.capacityUnit);
  }
  if (prefer === 'equity') return toMw(p.equityCapacity, p.capacityUnit);
  if (prefer === 'operating') return toMw(p.operatingCapacity ?? (statusOf(p) === 'operating' ? p.capacityValue : null), p.capacityUnit);
  if (prefer === 'uc') return toMw(p.underConstructionCapacity, p.capacityUnit);
  if (prefer === 'pipeline') return toMw(p.pipelineCapacity ?? p.developmentPipelineCapacity, p.capacityUnit);
  if (prefer === 'epc') return toMw(p.epcScopeCapacity, p.capacityUnit);
  if (prefer === 'supply') return toMw(p.contractedSupplyVolume, p.capacityUnit);
  if (prefer === 'mfg') return toMw(p.manufacturingCapacity, p.capacityUnit);
  return null;
}

function addTo(map, key, mw) {
  if (mw == null || !key) return;
  map[key] = (map[key] || 0) + mw;
}

/**
 * @param {{ nodes?: object[], edges?: object[] }} network
 */
export function computeRenewableProjectMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const projects = nodes.filter((n) => n.type === 'renewable_project' && !n.isStructuralBundle);
  const portfolios = nodes.filter((n) => n.type === 'project_portfolio');
  const supplyContracts = nodes.filter((n) => n.type === 'supply_contract' || (n.type === 'contract' && n.capacityType === 'contracted_supply_volume'));
  const products = nodes.filter((n) => n.type === 'product');
  const pipelines = nodes.filter((n) => n.type === 'development_pipeline');
  const ecosystems = nodes.filter((n) => n.type === 'ecosystem' || n.isStructuralBundle);

  const structuralGeneratedEdgeCount = edges.filter((e) =>
    e.relationClass === 'structural' || STRUCTURAL_TYPES.has(e.type)).length;
  const technologyRoleEdgeCount = edges.filter((e) =>
    e.type === 'used_in_technology' || e.type === 'develops' || e.type === 'manufactures').length;
  const equipmentCategoryEdgeCount = edges.filter((e) =>
    byId.get(e.target)?.type === 'equipment_category' || byId.get(e.source)?.type === 'equipment_category').length;

  const uniqueActualProjectCount = projects.length;
  const projectPortfolioCount = portfolios.length;
  const supplyContractCount = supplyContracts.length;
  const productNodeCount = products.length;
  const developmentPipelineCount = pipelines.length;
  const structuralEcosystemNodeCount = ecosystems.length;

  const byTech = (key) => projects.filter((p) => techOf(p) === key).length;
  const solarProjectCount = byTech('solar');
  const onshoreWindProjectCount = byTech('onshore_wind');
  const offshoreWindProjectCount = byTech('offshore_wind');
  const fuelCellProjectCount = byTech('fuel_cell');
  const hydrogenProjectCount = byTech('hydrogen');

  const developmentProjectCount = projects.filter((p) => DEVELOPMENT_STATUSES.has(statusOf(p))).length;
  const permittedProjectCount = projects.filter((p) => statusOf(p) === 'permitted').length;
  const preferredBidderProjectCount = projects.filter((p) =>
    statusOf(p) === 'preferred_bidder' || statusOf(p) === 'negotiation').length;
  const contractSignedProjectCount = projects.filter((p) =>
    statusOf(p) === 'contract_signed' || statusOf(p) === 'financial_close' || statusOf(p) === 'notice_to_proceed').length;
  const underConstructionProjectCount = projects.filter((p) =>
    statusOf(p) === 'under_construction' || statusOf(p) === 'commissioning').length;
  const operatingProjectCount = projects.filter((p) =>
    statusOf(p) === 'operating' || statusOf(p) === 'repowering').length;
  const completedProjectCount = projects.filter((p) => statusOf(p) === 'completed').length;
  const suspendedCancelledProjectCount = projects.filter((p) =>
    ['suspended', 'cancelled'].includes(statusOf(p))).length;

  const projectRoleEdges = edges.filter((e) =>
    PROJECT_ROLE_TYPES.has(e.type) && (
      byId.get(e.target)?.type === 'renewable_project'
      || byId.get(e.source)?.type === 'renewable_project'
      || byId.get(e.target)?.type === 'project_spv'
      || byId.get(e.target)?.type === 'project_portfolio'
      || byId.get(e.target)?.type === 'supply_contract'
      || byId.get(e.target)?.type === 'contract'
    ));

  const confirmedProjectRoleEdgeCount = projectRoleEdges.filter((e) => editorialOf(e) === 'confirmed').length;
  const reportedProjectRoleEdgeCount = projectRoleEdges.filter((e) => editorialOf(e) === 'reported').length;
  const projectOwnershipEdgeCount = edges.filter((e) => OWNERSHIP_TYPES.has(e.type)).length;
  const confirmedOwnershipEdgeCount = edges.filter((e) =>
    OWNERSHIP_TYPES.has(e.type) && editorialOf(e) === 'confirmed').length;
  const epcProjectEdgeCount = edges.filter((e) => EPC_TYPES.has(e.type)).length;
  const equipmentSupplyEdgeCount = edges.filter((e) => EQUIPMENT_SUPPLY_TYPES.has(e.type)).length;
  const operationMaintenanceEdgeCount = edges.filter((e) => OM_TYPES.has(e.type)).length;
  const ppaEdgeCount = edges.filter((e) => PPA_TYPES.has(e.type)).length;
  const ppaOfftakeEdgeCount = ppaEdgeCount;

  const actualProjectCapacityByTechnology = emptyTechMap();
  const operatingCapacityByTechnology = emptyTechMap();
  const underConstructionCapacityByTechnology = emptyTechMap();
  const pipelineCapacityByTechnology = emptyTechMap();
  const equityCapacityByCompany = emptyCompanyMap();
  const epcScopeCapacityByCompany = emptyCompanyMap();
  const contractedSupplyVolumeByCompany = emptyCompanyMap();
  const manufacturingCapacityByCompany = emptyCompanyMap();
  const pipelineCapacityByCompany = emptyCompanyMap();
  const hydrogenProductionCapacityByCompany = emptyCompanyMap();

  let equityAttributableCapacityKnownCount = 0;
  let capacityUnknownCount = 0;
  let unclassifiedCapacityCount = 0;

  for (const p of projects) {
    const tech = techOf(p);
    const total = capacityField(p, 'project');
    const operating = capacityField(p, 'operating');
    const uc = capacityField(p, 'uc');
    const pipe = capacityField(p, 'pipeline');
    const equity = capacityField(p, 'equity');

    if (total == null && operating == null && uc == null && pipe == null) capacityUnknownCount += 1;
    if (equity != null) equityAttributableCapacityKnownCount += 1;

    if (TECH_KEYS.includes(tech) && total != null) actualProjectCapacityByTechnology[tech] += total;
    if (TECH_KEYS.includes(tech) && statusOf(p) === 'operating' && (operating != null || total != null)) {
      operatingCapacityByTechnology[tech] += operating != null ? operating : total;
    } else if (TECH_KEYS.includes(tech) && ['under_construction', 'commissioning', 'notice_to_proceed'].includes(statusOf(p))) {
      underConstructionCapacityByTechnology[tech] += uc != null ? uc : (total || 0);
    } else if (TECH_KEYS.includes(tech) && (DEVELOPMENT_STATUSES.has(statusOf(p)) || statusOf(p) === 'permitted' || statusOf(p) === 'preferred_bidder')) {
      pipelineCapacityByTechnology[tech] += pipe != null ? pipe : (total || 0);
    }
  }

  // Do NOT fold portfolio/supply_contract into actualProjectCapacityByTechnology
  for (const e of edges) {
    const company = [e.source, e.target].find((id) => String(id).startsWith('krx:'));
    if (!company) continue;
    const mw = toMw(e.capacityValue, e.capacityUnit);
    if (e.capacityType === 'equity_attributable' || (e.type === 'owns_stake_in' && mw != null)) {
      addTo(equityCapacityByCompany, company, mw);
    }
    if (e.capacityType === 'epc_scope' || (EPC_TYPES.has(e.type) && mw != null && e.capacityType !== 'equity_attributable')) {
      addTo(epcScopeCapacityByCompany, company, mw);
    }
    if (e.capacityType === 'contracted_supply_volume' || (EQUIPMENT_SUPPLY_TYPES.has(e.type) && mw != null)) {
      addTo(contractedSupplyVolumeByCompany, company, mw);
    }
  }

  for (const p of portfolios) {
    if (p.capacityType === 'project_total') unclassifiedCapacityCount += 1;
  }

  const projectsWithEvidence = projects.filter((p) => Array.isArray(p.evidence) && p.evidence.length);
  const projectsWithDirect = projects.filter((p) => (p.evidence || []).some((ev) => ev.directEvidence === true));
  const projectsWithPrimary = projects.filter((p) =>
    (p.evidence || []).some((ev) =>
      ['government', 'regulator', 'disclosure', 'company_ir', 'project_site'].includes(ev.sourceType)));

  const denomProjects = projects.length || 1;
  const ownershipEdges = edges.filter((e) => OWNERSHIP_TYPES.has(e.type));
  const ownershipDirect = ownershipEdges.filter((e) => e.directEvidence || (e.evidence || []).some((ev) => ev.directEvidence));
  const ppaEdges = edges.filter((e) => PPA_TYPES.has(e.type));
  const ppaDirect = ppaEdges.filter((e) => e.directEvidence || (e.evidence || []).some((ev) => ev.directEvidence));
  const capacityEdges = edges.filter((e) => e.capacityValue != null);
  const capacityDirect = capacityEdges.filter((e) => e.directEvidence || (e.evidence || []).some((ev) => ev.directEvidence));

  const listed = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false
    && !n.excludeFromMapCompanyCount && n.entityRole !== 'listed_reference_company');
  const listedIds = new Set(listed.map((n) => n.id));
  const businessTouch = new Set();
  const directTouch = new Set();
  for (const e of edges) {
    const biz = editorialOf(e) !== 'inferred' && e.type !== 'peer' && e.relationClass !== 'structural'
      && !STRUCTURAL_TYPES.has(e.type);
    const direct = PROJECT_ROLE_TYPES.has(e.type) || EQUIPMENT_SUPPLY_TYPES.has(e.type)
      || OWNERSHIP_TYPES.has(e.type) || PPA_TYPES.has(e.type);
    for (const end of [e.source, e.target]) {
      if (!listedIds.has(end)) continue;
      if (biz) businessTouch.add(end);
      if (direct) directTouch.add(end);
    }
  }

  return {
    structuralGeneratedEdgeCount,
    technologyRoleEdgeCount,
    equipmentCategoryEdgeCount,
    uniqueActualProjectCount,
    projectPortfolioCount,
    supplyContractCount,
    productNodeCount,
    developmentPipelineCount,
    structuralEcosystemNodeCount,
    solarProjectCount,
    onshoreWindProjectCount,
    offshoreWindProjectCount,
    fuelCellProjectCount,
    hydrogenProjectCount,
    developmentProjectCount,
    permittedProjectCount,
    preferredBidderProjectCount,
    contractSignedProjectCount,
    underConstructionProjectCount,
    operatingProjectCount,
    completedProjectCount,
    suspendedCancelledProjectCount,
    confirmedProjectRoleEdgeCount,
    reportedProjectRoleEdgeCount,
    projectOwnershipEdgeCount,
    confirmedOwnershipEdgeCount,
    epcProjectEdgeCount,
    equipmentSupplyEdgeCount,
    operationMaintenanceEdgeCount,
    ppaEdgeCount,
    ppaOfftakeEdgeCount,
    // legacy aliases (actual projects only — portfolios excluded)
    totalProjectCapacityByTechnology: actualProjectCapacityByTechnology,
    actualProjectCapacityByTechnology,
    operatingCapacityByTechnology,
    underConstructionCapacityByTechnology,
    pipelineCapacityByTechnology,
    equityCapacityByCompany,
    epcScopeCapacityByCompany,
    contractedSupplyVolumeByCompany,
    manufacturingCapacityByCompany,
    pipelineCapacityByCompany,
    hydrogenProductionCapacityByCompany,
    equityAttributableCapacityKnownCount,
    capacityUnknownCount,
    unclassifiedCapacityCount,
    projectEvidenceFieldCoverage: projectsWithEvidence.length / denomProjects,
    projectDirectEvidenceCoverage: projectsWithDirect.length / denomProjects,
    projectPrimarySourceCoverage: projectsWithPrimary.length / denomProjects,
    capacityDirectEvidenceCoverage: capacityEdges.length ? capacityDirect.length / capacityEdges.length : 1,
    ownershipDirectEvidenceCoverage: ownershipEdges.length ? ownershipDirect.length / ownershipEdges.length : 1,
    ppaDirectEvidenceCoverage: ppaEdges.length ? ppaDirect.length / ppaEdges.length : 1,
    evidenceDenominators: {
      projects: projects.length,
      ownershipEdges: ownershipEdges.length,
      ppaEdges: ppaEdges.length,
      capacityEdges: capacityEdges.length,
    },
    businessRelationOrphanCount: [...listedIds].filter((id) => !businessTouch.has(id)).length,
    directRelationshipOrphanCount: [...listedIds].filter((id) => !directTouch.has(id)).length,
    classificationOnlyCompanyCount: [...listedIds].filter((id) => {
      const hasOnlyStructural = edges.some((e) =>
        (e.source === id || e.target === id)
        && (STRUCTURAL_TYPES.has(e.type) || e.relationClass === 'structural'));
      return hasOnlyStructural && !businessTouch.has(id);
    }).length,
    weakRelationOnlyCompanyCount: [...listedIds].filter((id) => {
      const edgesFor = edges.filter((e) => e.source === id || e.target === id);
      if (!edgesFor.length) return false;
      return edgesFor.every((e) =>
        e.type === 'peer' || e.type === 'reference' || e.type === 'inferred'
        || editorialOf(e) === 'reference' || editorialOf(e) === 'inferred');
    }).length,
    listedReferenceCompanyCount: nodes.filter((n) =>
      n.entityRole === 'listed_reference_company'
      || (n.type === 'listed_company' && n.isMapConstituent === false)).length,
    listedCompanyCount: listed.length,
    technologyNodeCount: nodes.filter((n) => n.type === 'technology').length,
    equipmentCategoryNodeCount: nodes.filter((n) => n.type === 'equipment_category').length,
    phase4cCuratedAt: '2026-08-23',
    phase4c1CuratedAt: '2026-08-23',
  };
}
