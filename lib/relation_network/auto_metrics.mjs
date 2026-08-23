/**
 * Auto sector metrics — Phase 5B / 5B.1.
 * Counts only; does not invent relationships.
 */
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';
import { computeCoverageMetric } from './coverage_metrics.mjs';

const SUPPLY_TYPES = new Set([
  'supplies_component_to',
  'supplies_system_to',
  'supplies_material_to',
  'supplies_tire_to',
  'supplies_lighting_to',
  'supplies_electronics_to',
  'awarded_contract',
  'nominated_supplier_for',
]);

const OWNERSHIP_TYPES = new Set(['owns', 'owns_stake_in']);
const JV_TYPES = new Set(['joint_venture', 'operates_joint_venture']);
const BUSINESS_TYPES = new Set([
  ...SUPPLY_TYPES,
  ...OWNERSHIP_TYPES,
  ...JV_TYPES,
  'used_in_vehicle',
  'develops_with',
  'joint_development',
  'licenses_to',
  'participates_in',
]);
const BUSINESS_STATUS = new Set(['confirmed', 'reported']);
const STRUCTURAL_TYPES = new Set([
  'member_of', 'specializes_in', 'manufactures', 'produces', 'exposed_to',
  'used_in_technology', 'used_in_vehicle_segment', 'located_in_stage', 'operates_brand',
]);
const GROUP_MEMBERSHIP = new Set(['group_member']);

const ELECTRIFICATION_TECH = new Set([
  'technology:electric_drive_unit',
  'technology:inverter',
  'technology:onboard_charger',
  'technology:battery_pack_component',
  'technology:hydrogen_fuel_cell',
  'technology:hybrid_powertrain',
]);
const ICE_TECH = new Set([
  'technology:internal_combustion_engine',
  'technology:transmission',
]);
const HYBRID_TECH = new Set(['technology:hybrid_powertrain']);

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

function edgeHasClaim(e, claim) {
  return (e.evidence || []).some((ev) => ev.claimSupport && ev.claimSupport[claim] === true);
}

function isBusinessEdge(e) {
  return BUSINESS_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status);
}

/**
 * @param {object} network
 */
export function computeAutoMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];
  const orphan = computeListedRelationOrphanMetrics(network);

  const listed = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false);
  const listedRef = nodes.filter((n) => n.type === 'listed_reference_company' || n.isMapConstituent === false);

  let structuralEdgeCount = 0;
  let structuralGeneratedEdgeCount = 0;
  let legacyMigratedEdgeCount = 0;
  let manuallyCuratedEdgeCount = 0;
  let confirmedBusinessEdgeCount = 0;
  let reportedBusinessEdgeCount = 0;
  let inferredBusinessEdgeCount = 0;
  let peerEdgeCount = 0;
  let supplyRelationshipCount = 0;
  let vehicleFitmentRelationshipCount = 0;
  let jointDevelopmentCount = 0;
  let ownershipEdgeCount = 0;
  let jointVentureEdgeCount = 0;
  let groupMembershipEdgeCount = 0;

  const electrificationCompanies = new Set();
  const iceCompanies = new Set();
  const hybridCompanies = new Set();
  let electrificationStructuralEdgeCount = 0;
  let iceStructuralEdgeCount = 0;
  let hybridStructuralEdgeCount = 0;

  for (const e of edges) {
    const origin = e.edgeOrigin || '';
    if (STRUCTURAL_TYPES.has(e.type) || GROUP_MEMBERSHIP.has(e.type)) structuralEdgeCount += 1;
    if (origin === 'structuralGenerated') structuralGeneratedEdgeCount += 1;
    if (origin === 'legacyMigrated') legacyMigratedEdgeCount += 1;
    if (origin === 'manuallyCurated') manuallyCuratedEdgeCount += 1;

    if (e.type === 'peer') peerEdgeCount += 1;
    if (GROUP_MEMBERSHIP.has(e.type)) groupMembershipEdgeCount += 1;
    if (OWNERSHIP_TYPES.has(e.type)) ownershipEdgeCount += 1;
    if (JV_TYPES.has(e.type)) jointVentureEdgeCount += 1;
    if (e.type === 'develops_with' || e.type === 'joint_development') jointDevelopmentCount += 1;
    if (e.type === 'used_in_vehicle') vehicleFitmentRelationshipCount += 1;
    if (SUPPLY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status)) supplyRelationshipCount += 1;

    if (isBusinessEdge(e)) {
      if (e.status === 'confirmed') confirmedBusinessEdgeCount += 1;
      else if (e.status === 'reported') reportedBusinessEdgeCount += 1;
    } else if (BUSINESS_TYPES.has(e.type) && e.status === 'inferred') {
      inferredBusinessEdgeCount += 1;
    }

    if (e.type === 'exposed_to' || e.type === 'used_in_technology') {
      const techId = e.target.startsWith('technology:') ? e.target : e.source;
      const companyId = e.source.startsWith('krx:') ? e.source : (e.target.startsWith('krx:') ? e.target : null);
      if (companyId && ELECTRIFICATION_TECH.has(techId)) {
        electrificationCompanies.add(companyId);
        electrificationStructuralEdgeCount += 1;
      }
      if (companyId && ICE_TECH.has(techId)) {
        iceCompanies.add(companyId);
        iceStructuralEdgeCount += 1;
      }
      if (companyId && HYBRID_TECH.has(techId)) {
        hybridCompanies.add(companyId);
        hybridStructuralEdgeCount += 1;
      }
    }
  }

  const businessEdges = edges.filter((e) => isBusinessEdge(e));
  const supplyEdges = edges.filter((e) => SUPPLY_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status));
  const fitmentEdges = edges.filter((e) => e.type === 'used_in_vehicle' && BUSINESS_STATUS.has(e.status));
  const ownershipEdges = edges.filter((e) => OWNERSHIP_TYPES.has(e.type) && BUSINESS_STATUS.has(e.status));
  const groupMemberEdges = edges.filter((e) => GROUP_MEMBERSHIP.has(e.type));

  const withEvidence = edges.filter((e) => (e.evidence || []).length > 0);
  const businessWithEvidence = businessEdges.filter((e) => (e.evidence || []).length > 0);
  const businessWithDirect = businessEdges.filter((e) => (e.evidence || []).some(isDirectReviewed));
  const businessWithPrimary = businessEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && isPrimary(ev)));

  const supplyDirect = supplyEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && (ev.claimSupport?.relationship || ev.relationshipSupported)));
  const supplyPrimary = supplyEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && isPrimary(ev) && (ev.claimSupport?.relationship || ev.relationshipSupported)));
  const fitmentDirect = fitmentEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && edgeHasClaim(e, 'vehicle')));
  const fitmentPrimary = fitmentEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && isPrimary(ev) && edgeHasClaim(e, 'vehicle')));
  const ownershipDirect = ownershipEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && (ev.claimSupport?.stakePct || ev.claimSupport?.relationship)));
  const ownershipPrimary = ownershipEdges.filter((e) =>
    (e.evidence || []).some((ev) => isDirectReviewed(ev) && isPrimary(ev)));
  const groupMembershipPrimary = groupMemberEdges.filter((e) =>
    (e.evidence || []).some((ev) => isPrimary(ev) && /ftc\.go\.kr/i.test(String(ev.url || ''))));

  const evidenceFieldCoverage = computeCoverageMetric(withEvidence.length, edges.length);
  const businessRelationshipDirectEvidenceCoverage = computeCoverageMetric(
    businessWithDirect.length,
    businessEdges.length,
    { reason: 'no_confirmed_reported_business_edges' },
  );
  const businessRelationshipPrimarySourceCoverage = computeCoverageMetric(
    businessWithPrimary.length,
    businessEdges.length,
    { reason: 'no_confirmed_reported_business_edges' },
  );
  const supplyDirectEvidenceCoverage = computeCoverageMetric(
    supplyDirect.length,
    supplyEdges.length,
    { reason: 'no_eligible_supply_edges' },
  );
  const supplyPrimarySourceCoverage = computeCoverageMetric(
    supplyPrimary.length,
    supplyEdges.length,
    { reason: 'no_eligible_supply_edges' },
  );
  const fitmentDirectEvidenceCoverage = computeCoverageMetric(
    fitmentDirect.length,
    fitmentEdges.length,
    { reason: 'no_eligible_fitment_edges' },
  );
  const fitmentPrimarySourceCoverage = computeCoverageMetric(
    fitmentPrimary.length,
    fitmentEdges.length,
    { reason: 'no_eligible_fitment_edges' },
  );
  const ownershipDirectEvidenceCoverage = computeCoverageMetric(
    ownershipDirect.length,
    ownershipEdges.length,
    { reason: 'no_eligible_ownership_edges' },
  );
  const ownershipPrimarySourceCoverage = computeCoverageMetric(
    ownershipPrimary.length,
    ownershipEdges.length,
    { reason: 'no_eligible_ownership_edges' },
  );
  const groupMembershipPrimarySourceCoverage = computeCoverageMetric(
    groupMembershipPrimary.length,
    groupMemberEdges.length,
    { reason: 'no_group_membership_edges' },
  );

  const claimCoverage = {
    evidenceFieldCoverage,
    businessRelationshipDirectEvidenceCoverage,
    businessRelationshipPrimarySourceCoverage,
    supplyDirectEvidenceCoverage,
    supplyPrimarySourceCoverage,
    supplyRelationshipDirectEvidenceCoverage: supplyDirectEvidenceCoverage,
    supplyRelationshipPrimarySourceCoverage: supplyPrimarySourceCoverage,
    fitmentDirectEvidenceCoverage,
    fitmentPrimarySourceCoverage,
    vehicleFitmentDirectEvidenceCoverage: fitmentDirectEvidenceCoverage,
    vehicleFitmentPrimarySourceCoverage: fitmentPrimarySourceCoverage,
    ownershipDirectEvidenceCoverage,
    ownershipPrimarySourceCoverage,
    groupMembershipPrimarySourceCoverage,
    metricNotes: {
      businessRelationshipDenominator: 'confirmed + reported business edges only',
      supplyDenominator: 'confirmed + reported supply-type edges only',
      fitmentDenominator: 'confirmed + reported used_in_vehicle only',
      ownershipDenominator: 'confirmed + reported owns/owns_stake_in only',
      zeroDenominator: 'percentage=null, displayValue=N/A, applicable=false',
    },
  };

  return {
    listedCompanyCount: listed.length,
    listedReferenceCompanyCount: listedRef.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    structuralEdgeCount,
    structuralGeneratedEdgeCount,
    legacyMigratedEdgeCount,
    manuallyCuratedEdgeCount,
    confirmedBusinessEdgeCount,
    reportedBusinessEdgeCount,
    inferredBusinessEdgeCount,
    peerEdgeCount,
    supplyRelationshipCount,
    actualSupplyRelationshipCount: supplyRelationshipCount,
    vehicleFitmentRelationshipCount,
    jointDevelopmentCount,
    ownershipEdgeCount,
    jointVentureEdgeCount,
    groupMembershipEdgeCount,
    electrificationExposedCompanyCount: electrificationCompanies.size,
    electrificationExposureCount: electrificationCompanies.size,
    electrificationStructuralEdgeCount,
    iceExposedCompanyCount: iceCompanies.size,
    iceExposureCount: iceCompanies.size,
    iceStructuralEdgeCount,
    hybridExposedCompanyCount: hybridCompanies.size,
    hybridExposureCount: hybridCompanies.size,
    hybridStructuralEdgeCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
    directCommercialRelationshipOrphanCount: orphan.directCommercialRelationshipOrphanCount,
    confirmedReportedBusinessOrphanCount: orphan.confirmedReportedBusinessOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
    groupMembershipOnlyCompanyCount: orphan.groupMembershipOnlyCompanyCount,
    weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
    hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount,
    peerOnlyCompanyCount: orphan.peerOnlyCompanyCount,
    structuralOnlyCompanyCount: orphan.structuralOnlyCompanyCount,
    orphanListedCompanyCount: orphan.orphanListedCompanyCount,
    structuralOrphanCount: orphan.structuralOrphanCount,
    orphanMetricDefinitions: orphan.metricDefinitions,
    orphanDetails: orphan.details,
    evidenceFieldCoverage: evidenceFieldCoverage.percentage,
    businessRelationshipDirectEvidenceCoverage: businessRelationshipDirectEvidenceCoverage.percentage,
    businessRelationshipPrimarySourceCoverage: businessRelationshipPrimarySourceCoverage.percentage,
    supplyRelationshipDirectEvidenceCoverage: supplyDirectEvidenceCoverage.percentage,
    supplyRelationshipPrimarySourceCoverage: supplyPrimarySourceCoverage.percentage,
    vehicleFitmentDirectEvidenceCoverage: fitmentDirectEvidenceCoverage.percentage,
    vehicleFitmentPrimarySourceCoverage: fitmentPrimarySourceCoverage.percentage,
    ownershipDirectEvidenceCoverage: ownershipDirectEvidenceCoverage.percentage,
    ownershipPrimarySourceCoverage: ownershipPrimarySourceCoverage.percentage,
    groupMembershipPrimarySourceCoverage: groupMembershipPrimarySourceCoverage.percentage,
    claimCoverage,
    phase5bCuratedAt: network.phase5bCuratedAt || '2026-08-23',
    phase5b1CuratedAt: network.phase5b1CuratedAt || null,
  };
}
