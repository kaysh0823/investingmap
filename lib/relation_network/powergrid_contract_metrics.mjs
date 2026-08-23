/**
 * Powergrid contract metrics (Phase 4A.2).
 * Separates contract counts from edge counts, and editorial vs lifecycle vs counterparty.
 */

const CONTRACT_BUSINESS_TYPES = new Set(['awarded_contract']);

const ACTIVE_CONTRACT_STATUSES = new Set([
  'effective', 'in_delivery', 'announced', 'letter_of_award',
]);

const COMPLETED = 'completed';
const CANCELLED = 'cancelled';
const TERMINATED = 'terminated';

function contractStatusOf(n) {
  return n.contractStatus || n.status || 'unknown';
}

function isActiveContract(n) {
  return ACTIVE_CONTRACT_STATUSES.has(contractStatusOf(n));
}

function awardEvidence(edges, contractId) {
  const award = edges.find((e) => e.type === 'awarded_contract' && e.target === contractId);
  return { award, ev: (award?.evidence || [])[0] || null };
}

function hasPrimarySource(ev) {
  if (!ev) return false;
  if (ev.primarySource === true) return true;
  if (ev.sourceType === 'dart' || ev.sourceType === 'regulator') return true;
  const u = ev.url || '';
  return /dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}/.test(u);
}

function hasDirectEvidenceReviewed(ev) {
  return !!(
    ev
    && ev.directEvidence === true
    && ev.sourceAccessStatus === 'opened'
    && (ev.reviewStatus === 'reviewed')
    && ev.reviewedAt
    && ev.reviewedBy
  );
}

export function computePowergridContractMetrics(network) {
  const nodes = network.nodes || [];
  const edges = network.edges || [];

  const contractNodes = nodes.filter((n) => n.type === 'contract');
  const projectNodes = nodes.filter((n) => n.type === 'project');

  const activeContracts = contractNodes.filter(isActiveContract);
  const completedContracts = contractNodes.filter((n) => contractStatusOf(n) === COMPLETED);
  const cancelledContracts = contractNodes.filter((n) => contractStatusOf(n) === CANCELLED);
  const terminatedContracts = contractNodes.filter((n) => contractStatusOf(n) === TERMINATED);
  const historicalContracts = [...completedContracts, ...cancelledContracts, ...terminatedContracts];
  const loaOnly = contractNodes.filter((n) => contractStatusOf(n) === 'letter_of_award');

  const awardEdges = edges.filter((e) => CONTRACT_BUSINESS_TYPES.has(e.type));
  const confirmedAwardEdges = awardEdges.filter((e) => e.status === 'confirmed');
  const reportedAwardEdges = awardEdges.filter((e) => e.status === 'reported');
  const inferredAwardEdges = awardEdges.filter((e) => e.status === 'inferred');

  const humanReviewContracts = contractNodes.filter((n) => {
    const { ev } = awardEvidence(edges, n.id);
    return n.statusReview === 'needs_review'
      || n.correctionReviewStatus === 'needs_review'
      || ev?.reviewStatus === 'needs_human_review'
      || ev?.sourceAccessStatus === 'failed';
  });

  const exactCp = contractNodes.filter((n) => n.counterpartyStatus === 'exact'
    || (n.counterpartyDisclosure === 'named' && !n.counterpartyStatus));
  const anonymousCp = contractNodes.filter((n) => n.counterpartyStatus === 'anonymous'
    || (n.counterpartyDisclosure === 'undisclosed'
      && (!n.counterpartyStatus || n.counterpartyStatus === 'anonymous')
      && String(n.legalCounterparty || '').startsWith('counterparty:undisclosed')));
  const partialCp = contractNodes.filter((n) => n.counterpartyStatus === 'partially_disclosed');
  const intermediaryCp = contractNodes.filter((n) => n.counterpartyStatus === 'intermediary_disclosed');

  let primarySourceContractCount = 0;
  let directEvidenceReviewedContractCount = 0;
  let activeDirect = 0;
  let activePrimary = 0;
  let exactDirect = 0;
  let anonymousDirect = 0;

  for (const c of contractNodes) {
    const { ev } = awardEvidence(edges, c.id);
    if (hasPrimarySource(ev)) primarySourceContractCount += 1;
    if (hasDirectEvidenceReviewed(ev)) directEvidenceReviewedContractCount += 1;
  }
  for (const c of activeContracts) {
    const { ev } = awardEvidence(edges, c.id);
    if (hasDirectEvidenceReviewed(ev)) activeDirect += 1;
    if (hasPrimarySource(ev)) activePrimary += 1;
  }
  for (const c of exactCp) {
    const { ev } = awardEvidence(edges, c.id);
    if (hasDirectEvidenceReviewed(ev)) exactDirect += 1;
  }
  for (const c of anonymousCp) {
    const { ev } = awardEvidence(edges, c.id);
    if (hasDirectEvidenceReviewed(ev)) anonymousDirect += 1;
  }

  const corrected = contractNodes.filter((n) => (n.correctionReceiptNos || []).length > 0
    || (n.originalReceiptNo && n.latestReceiptNo && n.originalReceiptNo !== n.latestReceiptNo));
  const correctionReviewed = corrected.filter((n) => n.correctionReviewStatus === 'reviewed');
  const correctionNeedsReview = contractNodes.filter((n) => n.correctionReviewStatus === 'needs_review');

  const nonContractBusiness = edges.filter((e) =>
    !CONTRACT_BUSINESS_TYPES.has(e.type)
    && (e.status === 'confirmed' || e.status === 'reported')
    && e.countAsContractBusiness === true);

  const ownershipOrGroup = edges.filter((e) => e.type === 'member_of' || e.type === 'owns').length;

  const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

  // Backward-compatible aliases used by Phase 4A.1 verify
  return {
    contractNodeCount: contractNodes.length,
    projectNodeCount: projectNodes.length,
    uniqueContractCount: contractNodes.length,

    activeContractCount: activeContracts.length,
    completedContractCount: completedContracts.length,
    cancelledContractCount: cancelledContracts.length,
    terminatedContractCount: terminatedContracts.length,
    historicalContractCount: historicalContracts.length,
    letterOfAwardOnlyCount: loaOnly.length,
    // deprecated alias — do not double-count completed
    endedContractCount: historicalContracts.length,
    letterOfAwardCount: loaOnly.length,

    confirmedContractEdgeCount: confirmedAwardEdges.length,
    reportedContractEdgeCount: reportedAwardEdges.length,
    inferredContractEdgeCount: inferredAwardEdges.length,
    humanReviewContractCount: humanReviewContracts.length,

    confirmedActiveContractCount: activeContracts.filter((n) => awardEvidence(edges, n.id).award?.status === 'confirmed').length,
    reportedActiveContractCount: activeContracts.filter((n) => awardEvidence(edges, n.id).award?.status === 'reported').length,
    uniqueConfirmedContractCount: new Set(confirmedAwardEdges.map((e) => e.target)).size,
    uniqueReportedContractCount: new Set(reportedAwardEdges.map((e) => e.target)).size,
    confirmedContractBusinessEdgeCount: confirmedAwardEdges.length,
    reportedContractBusinessEdgeCount: reportedAwardEdges.length,
    reportedNonContractBusinessEdgeCount: nonContractBusiness.filter((e) => e.status === 'reported').length,
    contractBusinessEdgeCount: awardEdges.filter((e) => e.status === 'confirmed' || e.status === 'reported').length,
    nonContractBusinessEdgeCount: nonContractBusiness.length,
    structuralReportedEdgeCount: edges.filter((e) => e.status === 'reported' && !CONTRACT_BUSINESS_TYPES.has(e.type) && e.countAsContractBusiness !== true).length,
    totalReportedEdgeCount: edges.filter((e) => e.status === 'reported').length,

    exactCounterpartyContractCount: exactCp.length,
    anonymousCounterpartyContractCount: anonymousCp.length,
    partiallyDisclosedCounterpartyContractCount: partialCp.length,
    intermediaryDisclosedCounterpartyContractCount: intermediaryCp.length,

    primarySourceContractCount,
    directEvidenceReviewedContractCount,
    activeContractDirectEvidenceCoverage: pct(activeDirect, activeContracts.length),
    activeContractPrimarySourceCoverage: pct(activePrimary, activeContracts.length),
    allContractDirectEvidenceCoverage: pct(directEvidenceReviewedContractCount, contractNodes.length),
    exactCounterpartyDirectEvidenceCoverage: pct(exactDirect, exactCp.length),
    anonymousCounterpartyDirectEvidenceCoverage: pct(anonymousDirect, anonymousCp.length),

    // legacy aliases from 4A.1 naming
    activeContractEvidenceFieldCoverage: pct(activeDirect, activeContracts.length),
    correctedContractCount: corrected.length,
    correctionReviewedCount: correctionReviewed.length,
    correctionNeedsReviewCount: correctionNeedsReview.length,
    ownershipOrGroupEdgeCount: ownershipOrGroup,

    denominators: {
      uniqueContractCount: 'all contract nodes',
      activeContractCount: 'contractStatus ∈ {effective, in_delivery, announced, letter_of_award}',
      historicalContractCount: 'completed + cancelled + terminated (mutually exclusive)',
      activeContractDirectEvidenceCoverage: 'directEvidence=true AND sourceAccessStatus=opened AND reviewStatus=reviewed among active contracts',
      activeContractPrimarySourceCoverage: 'DART/primary URL present among active contracts (independent of directEvidence)',
    },
  };
}

export function dartUrl(rcpNo) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcpNo}`;
}

export function isExactDartDocumentUrl(url) {
  return /dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}/.test(url || '');
}
