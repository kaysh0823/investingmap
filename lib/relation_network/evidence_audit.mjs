/**
 * Evidence quality heuristics — local audit only; never auto-approve directEvidence.
 */

const PRIMARY_HOSTS = [
  'dart.fss.or.kr',
  'opendart.fss.or.kr',
  'kind.krx.co.kr',
  'finance.naver.com',
  'sec.gov',
  'dapa.go.kr',
  'ftc.go.kr',
  'skhynix.com',
  'samsung.com',
  'skbioscience.co.kr',
  'gsk.com',
  'koreaaero.com',
  'hdhyundai.com',
];

const HOMEPAGE_ONLY = /^https?:\/\/[^/?#]+(?:\/(?:en|ko|eng|kor)?)?\/?(?:index\.(html?|php|aspx))?$/i;
const SEARCH_URL = /(?:google\.|naver\.com\/search|bing\.com\/search|duckduckgo\.)/i;
const GENERIC_PORTAL = /ftc\.go\.kr\/www\/selectReport\.do\?key=/i;

/**
 * @param {object} ev
 * @param {object} edge
 * @param {object} [nodesById]
 */
export function auditEvidence(ev, edge, nodesById = {}) {
  const issues = [];
  if (!ev || typeof ev !== 'object') {
    return { reviewStatus: 'needs_human_review', issues: ['missing_evidence_object'] };
  }
  if (!ev.url || !/^https?:\/\//.test(ev.url)) issues.push('missing_url');
  if (!ev.title || String(ev.title).trim().length < 4) issues.push('missing_title');
  if (!ev.publishedAt && !ev.accessedAt) issues.push('missing_date');

  const url = String(ev.url || '');
  if (HOMEPAGE_ONLY.test(url)) issues.push('homepage_only_url');
  if (SEARCH_URL.test(url)) issues.push('search_portal_url');
  if (GENERIC_PORTAL.test(url)) issues.push('generic_ftc_portal');

  let sourceType = ev.sourceType || 'unknown';
  if (!ev.sourceType) issues.push('missing_source_type');

  let primarySource = PRIMARY_HOSTS.some((h) => url.includes(h));
  if (sourceType === 'dart' || sourceType === 'ftc' || sourceType === 'official' || sourceType === 'kind') {
    primarySource = primarySource || url.includes('dart') || url.includes('dapa') || url.includes('ftc');
  }

  // Local heuristic — never set directEvidence true automatically
  let directEvidence = false;
  let reviewStatus = 'needs_human_review';

  if (issues.length === 0 && primarySource && !issues.includes('homepage_only_url') && !issues.includes('generic_ftc_portal')) {
    reviewStatus = 'needs_human_review';
  }

  if (edge?.type === 'peer' || edge?.status === 'peer' || edge?.status === 'reference') {
    if (edge.status !== 'confirmed' && edge.status !== 'reported') {
      reviewStatus = 'not_applicable';
    }
  }

  return {
    reviewStatus,
    directEvidence,
    primarySource,
    issues,
    sourceType,
  };
}

/**
 * @param {object} edge
 * @param {Map<string,object>} nodeMap
 */
export function auditEdgeEvidence(edge, nodeMap = new Map()) {
  const status = edge.status;
  if (status === 'peer' || status === 'reference' || edge.type === 'member_of') {
    return {
      evidenceFieldCoverage: false,
      directEvidenceCoverage: false,
      primarySourceCoverage: false,
      reviewStatus: status === 'peer' ? 'not_applicable' : 'category_edge',
      issues: [],
    };
  }

  if (status !== 'confirmed' && status !== 'reported') {
    return {
      evidenceFieldCoverage: Array.isArray(edge.evidence) && edge.evidence.length > 0,
      directEvidenceCoverage: false,
      primarySourceCoverage: false,
      reviewStatus: 'not_required',
      issues: [],
    };
  }

  const evs = Array.isArray(edge.evidence) ? edge.evidence : [];
  if (!evs.length) {
    return {
      evidenceFieldCoverage: false,
      directEvidenceCoverage: false,
      primarySourceCoverage: false,
      reviewStatus: 'needs_human_review',
      issues: ['confirmed_or_reported_without_evidence'],
    };
  }

  const audits = evs.map((ev) => auditEvidence(ev, edge, nodeMap));
  const hasField = evs.every((ev) => ev.url && ev.title);
  const anyPrimary = audits.some((a) => a.primarySource);
  const anyBlocking = audits.some((a) =>
    a.issues.includes('homepage_only_url') ||
    a.issues.includes('search_portal_url') ||
    a.issues.includes('generic_ftc_portal'),
  );

  return {
    evidenceFieldCoverage: hasField,
    directEvidenceCoverage: false,
    primarySourceCoverage: anyPrimary && !anyBlocking,
    reviewStatus: anyBlocking ? 'needs_human_review' : 'needs_human_review',
    issues: audits.flatMap((a) => a.issues),
  };
}

export function aggregateEvidenceMetrics(edges) {
  let withField = 0;
  let direct = 0;
  let primary = 0;
  let needsReview = 0;
  const urlReuse = new Map();

  const transactional = edges.filter((e) => e.status === 'confirmed' || e.status === 'reported');

  for (const e of transactional) {
    const a = auditEdgeEvidence(e);
    if (a.evidenceFieldCoverage) withField += 1;
    if (a.primarySourceCoverage) primary += 1;
    if (a.reviewStatus === 'needs_human_review') needsReview += 1;
    const evs = e.evidence || [];
    // Count edges that assert directEvidence=true (review gate is separate from coverage %)
    if (evs.some((ev) => ev.directEvidence === true)) {
      direct += 1;
    }
    for (const ev of e.evidence || []) {
      if (!ev.url) continue;
      urlReuse.set(ev.url, (urlReuse.get(ev.url) || 0) + 1);
    }
  }

  const total = transactional.length || 1;
  return {
    evidenceFieldCoverage: Math.round((withField / total) * 100),
    directEvidenceCoverage: Math.round((direct / total) * 100),
    primarySourceCoverage: Math.round((primary / total) * 100),
    needsHumanReviewCount: needsReview,
    overusedEvidenceUrls: [...urlReuse.entries()].filter(([, n]) => n >= 8).map(([url, n]) => ({ url, count: n })),
  };
}

/**
 * Split coverage metrics (Phase 3B reporting).
 * directEvidenceCoverage in aggregateEvidenceMetrics uses confirmed+reported denominator only
 * (ended/inferred/reference/peer excluded by design).
 */
export function computeEvidenceCoverageBreakdown(edges) {
  const hasDE = (e) => (e.evidence || []).some((ev) => ev.directEvidence === true);
  const hasEv = (e) => Array.isArray(e.evidence) && e.evidence.length > 0;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  const active = edges.filter((e) => e.status !== 'ended' && e.status !== 'peer');
  const allBearing = edges.filter(hasEv);
  const ended = edges.filter((e) => e.status === 'ended');
  const confRep = edges.filter((e) => e.status === 'confirmed' || e.status === 'reported');

  return {
    denominatorNote: {
      aggregateDirectEvidenceCoverage: 'confirmed + reported only (ended excluded)',
      activeDirectEvidenceCoverage: 'all non-ended, non-peer edges with evidence fields considered in denominator? No — DE among active edges that have evidence',
    },
    activeDirectEvidenceCoverage: pct(active.filter(hasDE).length, active.filter(hasEv).length || 1),
    allEvidenceBearingEdgesDirectCoverage: pct(allBearing.filter(hasDE).length, allBearing.length || 1),
    endedDirectEvidenceCoverage: pct(ended.filter(hasDE).length, ended.length || 1),
    confirmedReportedDirectCoverage: pct(confRep.filter(hasDE).length, confRep.length || 1),
    counts: {
      activeWithEvidence: active.filter(hasEv).length,
      activeWithDirect: active.filter(hasDE).length,
      allBearing: allBearing.length,
      allBearingDirect: allBearing.filter(hasDE).length,
      ended: ended.length,
      endedDirect: ended.filter(hasDE).length,
      confirmedReported: confRep.length,
      confirmedReportedDirect: confRep.filter(hasDE).length,
    },
  };
}
