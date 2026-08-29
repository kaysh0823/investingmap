/**
 * Construction Phase 5A.3 — per-claim evidence support & coverage metrics.
 */
export const CLAIM_KEYS = [
  'relationship',
  'legalEntity',
  'counterparty',
  'role',
  'projectStatus',
  'contractStatus',
  'contractSigned',
  'contractValue',
  'companyShareValue',
  'validFrom',
  'validTo',
  'stakePct',
];

const PROJECT_NODE_TYPES = new Set(['construction_project', 'overseas_epc_project']);

const PRIMARY_SOURCE_TYPES = new Set([
  'government', 'regulator', 'disclosure', 'company_ir', 'dart',
]);

/** @param {Record<string, boolean>} partial */
export function mkClaimSupport(partial = {}) {
  /** @type {Record<string, boolean>} */
  const out = Object.fromEntries(CLAIM_KEYS.map((k) => [k, false]));
  for (const [k, v] of Object.entries(partial)) {
    if (CLAIM_KEYS.includes(k)) out[k] = !!v;
  }
  return out;
}

/** Keep legacy boolean flags aligned with claimSupport. */
export function syncLegacyEvidenceFlags(ev) {
  const cs = ev.claimSupport || {};
  if (cs.relationship || cs.role || cs.counterparty || cs.legalEntity) {
    ev.relationshipSupported = ev.relationshipSupported || '';
  }
  ev.amountSupported = !!(cs.contractValue || cs.companyShareValue);
  ev.statusSupported = !!(cs.projectStatus || cs.contractStatus || cs.contractSigned);
  return ev;
}

export function isReviewedDirect(ev) {
  return ev.directEvidence === true
    && ev.reviewStatus === 'reviewed'
    && ev.reviewedAt
    && ev.reviewedBy
    && ev.sourceOpened !== false;
}

export function isPrimarySource(ev) {
  return ev.primarySource === true || PRIMARY_SOURCE_TYPES.has(ev.sourceType);
}

/**
 * @param {object[]} evidence
 * @param {string} claim
 * @param {{ direct?: boolean, primary?: boolean }} opts
 */
export function evidenceSupportsClaim(evidence, claim, { direct = true, primary = false } = {}) {
  return (evidence || []).some((ev) => {
    if (!ev.claimSupport?.[claim]) return false;
    if (direct && !isReviewedDirect(ev)) return false;
    if (primary && !isPrimarySource(ev)) return false;
    return true;
  });
}

function pct(n, d) {
  return {
    numerator: n,
    denominator: d,
    percentage: d ? n / d : null,
  };
}

function metricBlock(includedClaims, includedProjects, excludedProjects, numerator, denominator) {
  return {
    ...pct(numerator, denominator),
    includedClaims,
    includedProjects,
    excludedProjects,
    exclusionReason: excludedProjects.map((p) => ({
      projectId: p.id,
      reason: p.reason,
    })),
  };
}

/**
 * @param {{ nodes?: object[] }} network
 */
export function computeConstructionClaimCoverageMetrics(network) {
  const nodes = network.nodes || [];
  const projects = nodes.filter((n) => PROJECT_NODE_TYPES.has(n.type) && !n.isStructuralBundle);
  const allFive = projects.map((p) => p.id);

  /** @param {(p: object) => boolean} inDenom */
  function buildClaimMetric(claim, inDenom, exclusionReasonFn) {
    const included = [];
    const excluded = [];
    for (const p of projects) {
      if (inDenom(p)) included.push(p.id);
      else excluded.push({ id: p.id, reason: exclusionReasonFn(p) });
    }
    const numDirect = included.filter((id) => {
      const p = projects.find((x) => x.id === id);
      return evidenceSupportsClaim(p?.evidence, claim, { direct: true, primary: false });
    }).length;
    const numPrimary = included.filter((id) => {
      const p = projects.find((x) => x.id === id);
      return evidenceSupportsClaim(p?.evidence, claim, { direct: true, primary: true });
    }).length;
    return {
      direct: metricBlock([claim], included, excluded, numDirect, included.length),
      primary: metricBlock([claim], included, excluded, numPrimary, included.length),
    };
  }

  const relationship = buildClaimMetric(
    'relationship',
    () => true,
    () => 'n/a — all five audit projects in denominator',
  );

  const contractStatus = buildClaimMetric(
    'contractStatus',
    (p) => !!(p.contractStatus || p.projectStatus),
    (p) => 'no contractStatus/projectStatus on node',
  );

  const contractValue = buildClaimMetric(
    'contractValue',
    (p) => p.contractValue != null && p.valueDisclosureStatus !== 'not_applicable',
    (p) => {
      if (p.valueDisclosureStatus === 'not_applicable') return 'valueDisclosureStatus=not_applicable';
      if (p.contractValue == null) return 'contractValue is null (undisclosed)';
      return 'excluded';
    },
  );

  const companyShareValue = buildClaimMetric(
    'companyShareValue',
    (p) => p.companyShareValue != null && p.companyShareDisclosureStatus === 'disclosed',
    (p) => {
      if (p.companyShareDisclosureStatus === 'unknown') return 'companyShareDisclosureStatus=unknown';
      if (p.companyShareDisclosureStatus === 'not_applicable') return 'companyShareDisclosureStatus=not_applicable';
      if (p.companyShareValue == null) return 'companyShareValue is null';
      return 'excluded';
    },
  );

  const lifecycleClaims = ['projectStatus', 'contractStatus', 'contractSigned'];
  const lifecycleIncluded = [];
  const lifecycleExcluded = [];
  for (const p of projects) {
    if (p.projectStatus || p.contractStatus || p.contractSigned != null) lifecycleIncluded.push(p.id);
    else lifecycleExcluded.push({ id: p.id, reason: 'no lifecycle fields' });
  }
  const lifecycleDirectNum = lifecycleIncluded.filter((id) => {
    const p = projects.find((x) => x.id === id);
    return lifecycleClaims.some((c) => evidenceSupportsClaim(p?.evidence, c, { direct: true }));
  }).length;
  const lifecyclePrimaryNum = lifecycleIncluded.filter((id) => {
    const p = projects.find((x) => x.id === id);
    return lifecycleClaims.some((c) => evidenceSupportsClaim(p?.evidence, c, { direct: true, primary: true }));
  }).length;

  return {
    auditProjectIds: allFive,
    relationshipDirectEvidenceCoverage: relationship.direct,
    relationshipPrimarySourceCoverage: relationship.primary,
    contractStatusDirectEvidenceCoverage: contractStatus.direct,
    contractStatusPrimarySourceCoverage: contractStatus.primary,
    contractValueDirectEvidenceCoverage: contractValue.direct,
    contractValuePrimarySourceCoverage: contractValue.primary,
    companyShareValueDirectEvidenceCoverage: companyShareValue.direct,
    companyShareValuePrimarySourceCoverage: companyShareValue.primary,
    lifecycleDirectEvidenceCoverage: {
      ...pct(lifecycleDirectNum, lifecycleIncluded.length),
      includedClaims: lifecycleClaims,
      includedProjects: lifecycleIncluded,
      excludedProjects: lifecycleExcluded,
    },
    lifecyclePrimarySourceCoverage: {
      ...pct(lifecyclePrimaryNum, lifecycleIncluded.length),
      includedClaims: lifecycleClaims,
      includedProjects: lifecycleIncluded,
      excludedProjects: lifecycleExcluded,
    },
    metricNotes: {
      projectEvidenceFieldCoverage: 'anyClaim — project has ≥1 evidence row with claimSupport fields',
      projectDirectEvidenceCoverage: 'anyClaim — ≥1 reviewed direct evidence supports any claim',
      projectPrimarySourceCoverage: 'anyClaim — ≥1 reviewed direct primary evidence supports any claim (not all claims)',
    },
  };
}
