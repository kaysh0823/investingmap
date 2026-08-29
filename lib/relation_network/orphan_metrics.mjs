/**
 * Separated orphan / relation-density metrics for listed companies.
 * orphanListedCompanyCount (any edge) understates investment-info gaps when
 * member_of / produces / exposed_to alone zero out the classic orphan count.
 */

export const STRUCTURAL_EDGE_TYPES = new Set([
  'member_of',
  'produces',
  'manufactures',
  'develops',
  'exposed_to',
  'supports_market',
  'used_in_process',
  'used_in_market',
  'used_in_vessel',
  'used_in_grid_stage',
  'used_in_reactor',
  'supports_lifecycle_stage',
  'used_in_technology',
  'supports_project_stage',
  'builds_vessel_type',
  'operates_in',
  'located_in',
  // construction / sector classification (not business counterparty proof)
  'specializes_in',
  'operates_brand',
  'used_in_vehicle_segment',
  'located_in_stage',
  'cross_sector_reference',
  'used_in_device',
  'used_in_product_family',
  'designed_for',
  'certified_for',
]);

export const DIRECT_RELATION_EDGE_TYPES = new Set([
  'supplies_material_to',
  'supplies_equipment_to',
  'supplies_cells_to',
  'supplies_component_to',
  'supplies_system_to',
  'supplies_tire_to',
  'supplies_lighting_to',
  'supplies_electronics_to',
  'develops_with',
  'licenses_to',
  'operates_joint_venture',
  'nominated_supplier_for',
  'used_in_vehicle',
  'supplies_engine_to',
  'supplies_steel_to',
  'supplies_electrical_to',
  'supplies_automation_to',
  'supplies_transformer_to',
  'supplies_cable_to',
  'supplies_switchgear_to',
  'supplies_to',
  'awarded_contract',
  'project_supplier',
  'epc_for',
  'project_owner',
  'project_operator',
  'owns',
  'controls',
  'equity_investment',
  'subsidiary_of',
  'second_tier_subsidiary',
  'joint_venture',
  'participates_in',
  'ordered',
  'awarded_to',
  'built_by',
  'strategic_investment',
  'strategic_partnership',
  'distribution_partnership',
  'platform_partnership',
  'bancassurance_partnership',
  'technology_partnership',
  'offtake_agreement',
  'long_term_supply',
  'technology_license',
  'joint_development',
  'recycling_partnership',
  'equipment_for',
  'material_for',
  'packages_or_tests_for',
  'customer_of',
  'competes_with',
  'clinical_collaboration',
  'subsystem_supplier',
  'maintains',
  'consortium_member',
  'supplies_nsss_to',
  'supplies_reactor_to',
  'supplies_turbine_to',
  'supplies_ic_to',
  'supplies_fuel_to',
  'supplies_service_to',
  'supplies_module_to',
  'supplies_inverter_to',
  'supplies_structure_to',
  'supplies_cable_to',
  'supplies_substation_to',
  'supplies_fuel_cell_to',
  'supplies_hydrogen_equipment_to',
  'supplies_storage_to',
  'owns_stake_in',
  'spv_shareholder',
  'pfv_shareholder',
  'spc_shareholder',
  'reit_shareholder',
  'project_developer',
  'power_purchase_agreement',
  'rec_purchase_agreement',
  'hydrogen_offtake',
  'architect_engineer_for',
  'architect_for',
  'engineering_for',
  'designs_for',
  'export_lead',
  'selected_for',
  'preferred_bidder_for',
  'negotiates_for',
  'memorandum_with',
  'feasibility_study_for',
  'operates',
  'builds',
  'commissions',
  'decommissions',
  'main_contractor',
  'constructs',
  'subcontractor_for',
  'commissioning_for',
  'finances',
  'arranges_pf',
  'guarantees',
  'property_manages',
]);

export const COMPANY_OR_PROJECT_TYPES = new Set([
  'listed_company',
  'domestic_unlisted_company',
  'global_company',
  'joint_venture',
  'order_contract',
  'vessel_project',
  'offshore_project',
  'naval_program',
  'project',
  'program',
  'shipowner',
  'shipyard',
  'contract',
  'utility',
  'organization',
  'grid_operator',
  'nuclear_project',
  'operator',
  'public_corporation',
  'consortium',
  'government',
  'smr_technology',
  'reactor_technology',
  'ecosystem',
  // construction / renewable-style project vehicles
  'construction_project',
  'overseas_epc_project',
  'pfv',
  'spc',
  'reit',
  'renewable_project',
  'project_spv',
  'project_portfolio',
  'supply_contract',
  'development_pipeline',
]);

/** Group roster membership — not business or direct commercial proof. */
export const GROUP_MEMBERSHIP_EDGE_TYPES = new Set([
  'group_member',
  'affiliated_with',
]);

/** Edges that only classify the firm (not counterparty business proof). */
export const CLASSIFICATION_OR_PEER_EDGE_TYPES = new Set([
  ...STRUCTURAL_EDGE_TYPES,
  ...GROUP_MEMBERSHIP_EDGE_TYPES,
  'peer',
]);

function isListed(n) {
  return n && (n.type === 'listed_company' || n.isListedKorea === true)
    && n.entityRole !== 'listed_reference_company'
    && n.isMapConstituent !== false
    && !n.excludeFromMapCompanyCount;
}

function touchesListed(edge, listedId) {
  return edge.source === listedId || edge.target === listedId;
}

/**
 * @param {{ nodes?: object[], edges?: object[] }} network
 * @returns {object}
 */
export function computeListedRelationOrphanMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const listed = nodes.filter(isListed);

  let structuralOrphanCount = 0;
  let businessRelationOrphanCount = 0;
  let directRelationshipOrphanCount = 0;
  let classificationOnlyCompanyCount = 0;
  let groupMembershipOnlyCompanyCount = 0;
  let weakRelationOnlyCompanyCount = 0;
  let hasPeerButNoBusinessCompanyCount = 0;
  let peerOnlyCompanyCount = 0;
  let structuralOnlyCompanyCount = 0;

  const details = {
    structuralOrphans: [],
    businessRelationOrphans: [],
    directRelationshipOrphans: [],
    classificationOnly: [],
    groupMembershipOnly: [],
    weakRelationOnly: [],
    hasPeerButNoBusiness: [],
    peerOnly: [],
    structuralOnly: [],
  };

  for (const company of listed) {
    const id = company.id;
    const incident = edges.filter((e) => touchesListed(e, id));
    if (incident.length === 0) {
      structuralOrphanCount += 1;
      details.structuralOrphans.push(id);
      businessRelationOrphanCount += 1;
      details.businessRelationOrphans.push(id);
      directRelationshipOrphanCount += 1;
      details.directRelationshipOrphans.push(id);
      continue;
    }

    const businessConfirmedReported = incident.filter((e) => {
      if (e.status !== 'confirmed' && e.status !== 'reported') return false;
      if (STRUCTURAL_EDGE_TYPES.has(e.type)) return false;
      const otherId = e.source === id ? e.target : e.source;
      const other = nodeById.get(otherId);
      return other && COMPANY_OR_PROJECT_TYPES.has(other.type);
    });

    if (businessConfirmedReported.length === 0) {
      businessRelationOrphanCount += 1;
      details.businessRelationOrphans.push(id);
    }

    const direct = incident.filter((e) => DIRECT_RELATION_EDGE_TYPES.has(e.type));
    if (direct.length === 0) {
      directRelationshipOrphanCount += 1;
      details.directRelationshipOrphans.push(id);
    }

    const hasGroupMembership = incident.some((e) => GROUP_MEMBERSHIP_EDGE_TYPES.has(e.type));
    const hasDirectCommercial = incident.some((e) => DIRECT_RELATION_EDGE_TYPES.has(e.type));
    if (hasGroupMembership && !hasDirectCommercial && businessConfirmedReported.length === 0) {
      groupMembershipOnlyCompanyCount += 1;
      details.groupMembershipOnly.push(id);
    }

    // member_of / specializes_in / operates_brand / peer / group_member only (no business counterparty)
    const onlyClassificationLike = incident.every((e) => CLASSIFICATION_OR_PEER_EDGE_TYPES.has(e.type));
    if (onlyClassificationLike && businessConfirmedReported.length === 0) {
      classificationOnlyCompanyCount += 1;
      details.classificationOnly.push(id);
    }

    const hasPeer = incident.some((e) => e.type === 'peer');
    if (hasPeer && businessConfirmedReported.length === 0) {
      hasPeerButNoBusinessCompanyCount += 1;
      details.hasPeerButNoBusiness.push(id);
    }

    // Strict: every incident edge is peer (no structural/classification/group)
    const strictPeerOnly = incident.length > 0 && incident.every((e) => e.type === 'peer');
    if (strictPeerOnly && businessConfirmedReported.length === 0) {
      peerOnlyCompanyCount += 1;
      details.peerOnly.push(id);
    }

    const onlyStructural = incident.length > 0
      && incident.every((e) => STRUCTURAL_EDGE_TYPES.has(e.type));
    if (onlyStructural && businessConfirmedReported.length === 0) {
      structuralOnlyCompanyCount += 1;
      details.structuralOnly.push(id);
    }

    const hasStrongStatus = incident.some((e) => e.status === 'confirmed' || e.status === 'reported');
    const onlyWeakStatus = incident.every((e) =>
      e.status === 'reference' || e.status === 'peer' || e.status === 'inferred' || e.status === 'ended');
    if (!hasStrongStatus && onlyWeakStatus) {
      weakRelationOnlyCompanyCount += 1;
      details.weakRelationOnly.push(id);
    }
  }

  const denom = listed.length;
  const metricDefinitions = {
    listedCompanyCount: {
      denominator: null,
      includedEditorialStatuses: null,
      includedRelationshipTypes: null,
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company', 'isMapConstituent=false'],
    },
    structuralOrphanCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: 'any',
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'listed with zero incident edges',
    },
    businessRelationOrphanCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: ['confirmed', 'reported'],
      includedRelationshipTypes: 'non-structural to COMPANY_OR_PROJECT_TYPES (excludes peer/inferred/reference-only)',
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'no confirmed/reported business edge to a company/project/vehicle node',
    },
    directRelationshipOrphanCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: [...DIRECT_RELATION_EDGE_TYPES],
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'no DIRECT_RELATION_EDGE_TYPES incident (group_member/member_of/specializes_in/peer do not count)',
    },
    directCommercialRelationshipOrphanCount: {
      aliasOf: 'directRelationshipOrphanCount',
    },
    groupMembershipOnlyCompanyCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: [...GROUP_MEMBERSHIP_EDGE_TYPES],
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'has group_member but no direct commercial or confirmed/reported business edge',
    },
    peerOnlyCompanyCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: ['peer'],
      excludedRelationshipTypes: [...STRUCTURAL_EDGE_TYPES, ...GROUP_MEMBERSHIP_EDGE_TYPES],
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'every incident edge is peer only — no structural, group, or business edges',
    },
    hasPeerButNoBusinessCompanyCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: ['peer'],
      excludedRelationshipTypes: 'non-peer business counterparty edges',
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'has at least one peer edge but no confirmed/reported business counterparty edge',
    },
    structuralOnlyCompanyCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: [...STRUCTURAL_EDGE_TYPES],
      excludedRelationshipTypes: [...DIRECT_RELATION_EDGE_TYPES, 'peer', ...GROUP_MEMBERSHIP_EDGE_TYPES],
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'only structural/classification edges (member_of, manufactures, etc.) — no peer, group, or business',
    },
    classificationOnlyCompanyCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: 'any',
      includedRelationshipTypes: [...CLASSIFICATION_OR_PEER_EDGE_TYPES],
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'only classification/structural/peer edges; no confirmed/reported business counterparty',
    },
    weakRelationOnlyCompanyCount: {
      denominator: 'listedCompanyCount',
      includedEditorialStatuses: ['reference', 'peer', 'inferred', 'ended'],
      includedRelationshipTypes: 'any',
      includeHidden: true,
      includeHistorical: true,
      excludedNodeRoles: ['listed_reference_company'],
      meaning: 'has edges but none confirmed/reported',
    },
    confirmedReportedBusinessOrphanCount: {
      denominator: 'listedCompanyCount',
      aliasOf: 'businessRelationOrphanCount',
    },
  };

  return {
    listedCompanyCount: denom,
    structuralOrphanCount,
    businessRelationOrphanCount,
    directRelationshipOrphanCount,
    directCommercialRelationshipOrphanCount: directRelationshipOrphanCount,
    classificationOnlyCompanyCount,
    groupMembershipOnlyCompanyCount,
    weakRelationOnlyCompanyCount,
    hasPeerButNoBusinessCompanyCount,
    peerOnlyCompanyCount,
    structuralOnlyCompanyCount,
    confirmedReportedBusinessOrphanCount: businessRelationOrphanCount,
    // classic metric kept for compatibility
    orphanListedCompanyCount: structuralOrphanCount,
    metricDefinitions,
    details,
  };
}
