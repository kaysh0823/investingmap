/**
 * Phase 5A.3 — Construction claim-scoped evidence, coverage metrics, closing audit.
 * Runs after curate_construction_phase5a2.mjs. No new projects/edges. No confirmed auto-promote.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeConstructionProjectMetrics } from '../lib/relation_network/construction_project_metrics.mjs';
import {
  mkClaimSupport,
  syncLegacyEvidenceFlags,
  computeConstructionClaimCoverageMetrics,
} from '../lib/relation_network/construction_claim_support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase5a3';
const NET_FP = join(ROOT, 'data', 'networks', 'construction.json');
const LOG_FP = join(ROOT, 'data', 'construction_relation_phase5a3_changelog.json');

const WIRYE_TOTAL = 3039406100000;
const WIRYE_SHARE = 2696131000000 + Math.round(343275100000 * 0.7);

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
}

function findNode(id) {
  return nodes.find((n) => n.id === id);
}

function findEdge(id) {
  return edges.find((e) => e.id === id);
}

function patchNode(id, after, reason, category, meta = {}) {
  const n = findNode(id);
  if (!n) return;
  const before = JSON.parse(JSON.stringify(n));
  Object.assign(n, after);
  log({
    entityKind: 'node',
    edgeOrProjectId: id,
    before,
    after: JSON.parse(JSON.stringify(n)),
    reason,
    correctionCategory: category,
    affectedClaim: meta.affectedClaim || null,
    evidenceId: meta.evidenceId || null,
    primaryDirect: meta.primaryDirect || null,
    unresolved: meta.unresolved ?? false,
    reviewedAt: AS_OF,
    reviewedBy: BY,
  });
}

function patchEdge(id, after, reason, category, meta = {}) {
  const e = findEdge(id);
  if (!e) return;
  const before = JSON.parse(JSON.stringify(e));
  Object.assign(e, after);
  if (after.evidence) e.evidence = after.evidence;
  log({
    entityKind: 'edge',
    edgeOrProjectId: id,
    before,
    after: JSON.parse(JSON.stringify(e)),
    reason,
    correctionCategory: category,
    affectedClaim: meta.affectedClaim || null,
    evidenceId: meta.evidenceId || null,
    unresolved: meta.unresolved ?? false,
    reviewedAt: AS_OF,
    reviewedBy: BY,
  });
}

function mkEv(base) {
  const ev = {
    evidenceId: base.evidenceId,
    reviewStatus: base.reviewStatus || 'needs_human_review',
    reviewedAt: base.reviewedAt || null,
    reviewedBy: base.reviewedBy || null,
    accessedAt: AS_OF,
    directEvidence: !!base.directEvidence,
    primarySource: !!base.primarySource,
    sourceOpened: base.sourceOpened !== false,
    sourceType: base.sourceType || 'other',
    evidenceUsageType: base.evidenceUsageType || 'general_business_page',
    title: base.title || '',
    url: base.url || '',
    publisher: base.publisher || null,
    publishedAt: base.publishedAt || null,
    evidenceIdentifier: base.evidenceIdentifier || null,
    evidenceSummaryKo: base.evidenceSummaryKo || '',
    evidenceSummaryEn: base.evidenceSummaryEn || '',
    relationshipSupported: base.relationshipSupported || '',
    claimSupport: base.claimSupport || mkClaimSupport(),
    rcpNo: base.rcpNo || null,
    kindAcptNo: base.kindAcptNo || null,
    dcmNo: base.dcmNo || null,
    supersedes: base.supersedes || null,
    supersededBy: base.supersededBy || null,
    correctionChain: base.correctionChain || null,
    dartRcpUnresolved: base.dartRcpUnresolved ?? null,
  };
  return syncLegacyEvidenceFlags(ev);
}

async function limitedDukhanRcpProbe() {
  const candidates = [];
  for (let i = 1; i <= 80; i++) {
    candidates.push(`202512128${String(i).padStart(5, '0')}`);
  }
  for (let i = 1; i <= 40; i++) {
    candidates.push(`202608198${String(i).padStart(5, '0')}`);
  }
  const hits = [];
  for (const rcp of candidates) {
    try {
      const res = await fetch(`https://www.awakeplus.co.kr/data/view/${rcp}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (/삼성물산/.test(html) && /Dukhan|두칸|DUKHAN|태양광/.test(html)) {
        const title = (html.match(/<title>([^<]+)/i) || [])[1] || '';
        hits.push({ rcp, title: title.trim() });
      }
    } catch (_) { /* rate limit / network */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  return hits;
}

const dukhanProbeHits = await limitedDukhanRcpProbe();
const dukhanSignedRcpUnresolved = dukhanProbeHits.find((h) => /단일판매|공급계약/.test(h.title))?.rcp || null;
const dukhanCorrectionRcpUnresolved = dukhanProbeHits.find((h) => /정정/.test(h.title))?.rcp || null;

const dukhanCorrectionChain = {
  originalFilingDate: '2025-12-12',
  originalTitle: '단일판매ㆍ공급계약체결 (Dukhan Solar EPIC)',
  latestCorrectionDate: '2026-08-19',
  latestCorrectionTitle: '(정정)단일판매ㆍ공급계약체결',
  correctionReason: '계약기간 변경 (종료일 2030-02-28 → 2030-06-30)',
  originalSignedRcpNo: dukhanSignedRcpUnresolved,
  latestCorrectionRcpNo: dukhanCorrectionRcpUnresolved,
  loaRcpNo: '20250825800525',
  probeHits: dukhanProbeHits,
  unresolved: !dukhanSignedRcpUnresolved,
  note: 'Phase 5A.3 limited Awake probe; 본계약/정정 DART rcp 미확정 시 secondary 재전송으로 종료.',
};

// ——— 1) Dukhan claim-scoped evidence ———
{
  const loaId = 'ev:dukhan-loa-dart';
  const signedId = 'ev:dukhan-signed-repub';

  const loaEv = mkEv({
    evidenceId: loaId,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceType: 'dart',
    evidenceUsageType: 'letter_of_award_document',
    title: '삼성물산 — Dukhan Solar LOA (DART 투자판단관련주요경영사항)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250825800525',
    publisher: 'DART / 삼성물산',
    publishedAt: '2025-08-25',
    rcpNo: '20250825800525',
    evidenceIdentifier: 'LOA only — does not prove signed contract amounts or latest validTo',
    relationshipSupported: 'epc_for|krx:028260|epc-project:qatar-dukhan-solar',
    claimSupport: mkClaimSupport({
      relationship: true,
      legalEntity: true,
      role: true,
      contractSigned: false,
      contractValue: false,
      companyShareValue: false,
      validTo: false,
      counterparty: false,
      projectStatus: false,
      contractStatus: false,
    }),
    supersededBy: { filingDate: '2025-12-12', title: '단일판매ㆍ공급계약체결' },
    correctionChain: dukhanCorrectionChain,
    evidenceSummaryKo: 'LOA DART primary: 관계·법인만. 본계약 체결·금액·최신 종료일은 LOA 범위 밖.',
    evidenceSummaryEn: 'LOA DART primary for relationship/legal entity only.',
  });

  const signedEv = mkEv({
    evidenceId: signedId,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceType: 'disclosure_republication',
    evidenceUsageType: 'exact_project_document',
    title: '삼성물산 (정정)단일판매ㆍ공급계약체결 — Dukhan EPIC (secondary republication)',
    url: 'https://www.sedaily.com/market/domesticStock/stockNotice/841904',
    publisher: 'KOSCOM via Sedaily / Thinkpool',
    publishedAt: '2026-08-19',
    dartRcpUnresolved: true,
    evidenceIdentifier: 'Secondary direct — signed contract + correction table; DART rcp unresolved',
    relationshipSupported: 'epc_for|krx:028260|epc-project:qatar-dukhan-solar|org:qatar-energy',
    claimSupport: mkClaimSupport({
      relationship: true,
      legalEntity: true,
      counterparty: true,
      role: true,
      projectStatus: true,
      contractStatus: true,
      contractSigned: true,
      contractValue: true,
      companyShareValue: true,
      validFrom: true,
      validTo: true,
    }),
    supersedes: { filingDate: '2025-12-12', endDateBefore: '2030-02-28' },
    correctionChain: dukhanCorrectionChain,
    evidenceSummaryKo: '2차 재전송: 본계약·정정 금액/기간/체결. primarySource=false.',
    evidenceSummaryEn: 'Secondary republication for signed terms; not primary DART.',
  });

  patchNode('epc-project:qatar-dukhan-solar', {
    representativeEvidenceId: signedId,
    relationshipEvidenceId: loaId,
    contractStatusEvidenceId: signedId,
    contractValueEvidenceId: signedId,
    companyShareValueEvidenceId: signedId,
    validToEvidenceId: signedId,
    loaCounterparty: null,
    contractCounterparty: 'QatarEnergy',
    counterpartyContinuityStatus: 'reported',
    counterpartyScope: 'signed_contract',
    valueDisclosureStatus: 'disclosed',
    companyShareDisclosureStatus: 'disclosed',
    primarySourcePending: dukhanSignedRcpUnresolved ? 'signed_and_correction_dart_rcp' : null,
    dartRcpSearchStatus: dukhanSignedRcpUnresolved ? 'unresolved_after_limited_probe' : 'partial',
    correctionChain: dukhanCorrectionChain,
    noteKo: 'LOA(DART)≠본계약 증거. 금액·체결·종료일은 2차 정정 재전송 direct. 본계약 DART rcp 미확정.',
    evidence: [loaEv, signedEv],
  }, 'Dukhan: claim-scoped LOA primary vs signed secondary; limited rcp probe', 'evidence', {
    affectedClaim: 'relationship,contractValue,validTo',
    evidenceId: loaId,
    unresolved: !dukhanSignedRcpUnresolved,
  });
}

// ——— 2) Wirye aggregation + claims ———
{
  const dartId = 'ev:wirye-dart';
  const components = [
    {
      componentName: '2BL',
      componentContractValue: 2696131000000,
      componentCompanySharePct: 100,
      componentCompanyShareValue: 2696131000000,
    },
    {
      componentName: '3BL',
      componentContractValue: 343275100000,
      componentCompanySharePct: 70,
      componentCompanyShareValue: 240292570000,
    },
  ];
  const dartEv = mkEv({
    evidenceId: dartId,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceType: 'dart',
    evidenceUsageType: 'exact_project_document',
    title: '현대건설 — 위례 복정 2BL·3BL (DART)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260608800044',
    publisher: 'DART / 현대건설',
    publishedAt: '2026-06-08',
    rcpNo: '20260608800044',
    kindAcptNo: '20260608000044',
    dcmNo: '11421460',
    relationshipSupported: 'main_contractor|krx:000720|construction-project:wirye-bokjeong-mixed|pfv:songpa-biz-cluster',
    claimSupport: mkClaimSupport({
      relationship: true,
      legalEntity: true,
      counterparty: true,
      role: true,
      projectStatus: true,
      contractStatus: true,
      contractSigned: true,
      contractValue: true,
      companyShareValue: true,
      validFrom: true,
      validTo: true,
    }),
    evidenceSummaryKo: 'DART: 블록별 당사 시공지분(≠PFV 지분). 합산식 명시.',
  });

  patchNode('construction-project:wirye-bokjeong-mixed', {
    totalContractValue: WIRYE_TOTAL,
    aggregationType: 'multi_block_contract',
    aggregationMethod: 'sum_block_company_shares',
    aggregatedComponents: components,
    aggregationReview: 'needs_review',
    valueDisclosureStatus: 'disclosed',
    companyShareDisclosureStatus: 'disclosed',
    constructionContractValue: WIRYE_TOTAL,
    contractValue: WIRYE_TOTAL,
    companyContractValue: WIRYE_SHARE,
    companyShareValue: WIRYE_SHARE,
    representativeEvidenceId: dartId,
    relationshipEvidenceId: dartId,
    contractValueEvidenceId: dartId,
    companyShareValueEvidenceId: dartId,
    contractStatusEvidenceId: dartId,
    validToEvidenceId: dartId,
    blockShares: {
      '2BL': { total: 2696131000000, companyPct: 100, companyShare: 2696131000000 },
      '3BL': { total: 343275100000, companyPct: 70, companyShare: 240292570000 },
    },
    noteKo: 'total=3,039,406,100,000; companyShare=2,936,423,570,000 (=2BL100%+3BL70%). PFV equity stakePct 별도 null.',
    evidence: [dartEv],
  }, 'Wirye: aggregatedComponents + claimSupport', 'amount_semantics', {
    affectedClaim: 'contractValue,companyShareValue',
    evidenceId: dartId,
  });
}

// ——— 3) Sajik3 — company share unknown ———
{
  const dartId = 'ev:sajik-dart';
  const dartEv = mkEv({
    evidenceId: dartId,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceType: 'dart',
    title: 'GS건설 — 사직3구역 (DART)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260807800114',
    publishedAt: '2026-08-07',
    rcpNo: '20260807800114',
    kindAcptNo: '20260807000114',
    relationshipSupported: 'main_contractor|krx:006360|construction-project:busan-sajik3-redev|org:sajik3-redev-union',
    claimSupport: mkClaimSupport({
      relationship: true,
      legalEntity: true,
      counterparty: true,
      role: true,
      projectStatus: true,
      contractStatus: true,
      contractSigned: true,
      contractValue: true,
      validFrom: true,
    }),
    evidenceSummaryKo: '계약금액 공시됨. 당사분 100%/단독 문구 없음→companyShare unknown.',
  });

  patchNode('construction-project:busan-sajik3-redev', {
    constructionContractValue: 408232163334,
    contractValue: 408232163334,
    companyContractValue: null,
    companyShareValue: null,
    companyParticipationPct: null,
    valueDisclosureStatus: 'disclosed',
    companyShareDisclosureStatus: 'unknown',
    amountReviewStatus: 'needs_human_review',
    representativeEvidenceId: dartId,
    relationshipEvidenceId: dartId,
    contractValueEvidenceId: dartId,
    contractStatusEvidenceId: dartId,
    companyShareValueEvidenceId: null,
    noteKo: '공시 계약금액만 확정. 회사 귀속액=단독/100% 미입증→null.',
    evidence: [dartEv],
  }, 'Sajik3: contractValue yes; companyShare unknown', 'amount_semantics', {
    affectedClaim: 'companyShareValue',
    evidenceId: dartId,
  });

  patchEdge('e-sajik-gs-mc', {
    companyContractValue: null,
    companyShareValue: null,
    contractValue: 408232163334,
    amountReviewStatus: 'needs_human_review',
  }, 'Sajik MC edge: no assumed 100% share', 'amount_semantics', {
    affectedClaim: 'companyShareValue',
  });
}

// ——— 4) Yongsan — legal entity + share unknown ———
{
  const dartId = 'ev:yongsan-dart';
  const dartEv = mkEv({
    evidenceId: dartId,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceType: 'dart',
    title: '아이파크현대산업개발 — 정비창전면 제1구역 (DART)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260205800384',
    publishedAt: '2026-02-05',
    rcpNo: '20260205800384',
    kindAcptNo: '20260205000384',
    relationshipSupported: 'main_contractor|krx:294870|construction-project:yongsan-jeongbichang-zone1|org:yongsan-jeongbichang-zone1-union',
    claimSupport: mkClaimSupport({
      relationship: true,
      legalEntity: true,
      counterparty: true,
      role: true,
      projectStatus: true,
      contractStatus: true,
      contractSigned: true,
      contractValue: true,
      validFrom: true,
    }),
    evidenceSummaryKo: '제출법인=아이파크현대산업개발(294870). brand:ipark≠당사자. 당사분 100% 미입증.',
  });

  patchNode('construction-project:yongsan-jeongbichang-zone1', {
    legalContractingEntity: '아이파크현대산업개발',
    legalContractingEntityEn: 'IPARK Hyundai Development Co., Ltd. (ticker 294870)',
    constructionContractValue: 924430915470,
    contractValue: 924430915470,
    companyContractValue: null,
    companyShareValue: null,
    companyParticipationPct: null,
    valueDisclosureStatus: 'disclosed',
    companyShareDisclosureStatus: 'unknown',
    amountReviewStatus: 'needs_human_review',
    representativeEvidenceId: dartId,
    relationshipEvidenceId: dartId,
    contractValueEvidenceId: dartId,
    contractStatusEvidenceId: dartId,
    companyShareValueEvidenceId: null,
    noteKo: 'DART 제출=아이파크현대산업개발. IPARK 브랜드 표시≠법적 당사자. 회사 귀속액 미입증.',
    evidence: [dartEv],
  }, 'Yongsan: legal filer name; companyShare unknown', 'legal_entity', {
    affectedClaim: 'legalEntity,companyShareValue',
    evidenceId: dartId,
  });

  patchEdge('e-yongsan-hdc-mc', {
    companyContractValue: null,
    companyShareValue: null,
    contractValue: 924430915470,
    amountReviewStatus: 'needs_human_review',
  }, 'Yongsan MC: no assumed 100% share', 'amount_semantics');
}

// ——— 5) Rovuma LOI scope + provisional JV ———
{
  const dartId = 'ev:rovuma-loi-dart';
  const dartEv = mkEv({
    evidenceId: dartId,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceType: 'dart',
    title: '대우건설 — Rovuma LOI (DART)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260807800011',
    publishedAt: '2026-08-07',
    rcpNo: '20260807800011',
    kindAcptNo: '20260807000011',
    dcmNo: '11513354',
    relationshipSupported: 'preferred_bidder_for|krx:047040|epc-project:mozambique-rovuma-lng-phase1|org:exxonmobil-mozambique',
    claimSupport: mkClaimSupport({
      relationship: true,
      legalEntity: true,
      counterparty: true,
      role: true,
      projectStatus: true,
      contractStatus: true,
      contractSigned: false,
    }),
    evidenceSummaryKo: 'LOI counterparty exact. 본계약·금액·JV 명칭 없음.',
  });

  patchNode('epc-project:mozambique-rovuma-lng-phase1', {
    counterpartyScope: 'letter_of_intent',
    finalContractCounterpartyStatus: 'unconfirmed',
    loiCounterpartyLegalName: 'ExxonMobil Mozambique Limitada',
    valueDisclosureStatus: 'not_disclosed',
    companyShareDisclosureStatus: 'not_applicable',
    currentValidity: 'unverified',
    statusReview: 'needs_review',
    statusReviewReason: 'LOI dated 2026-08-05; FID/NTP/signed EPC not confirmed in opened DART',
    representativeEvidenceId: dartId,
    relationshipEvidenceId: dartId,
    contractStatusEvidenceId: dartId,
    contractValueEvidenceId: null,
    companyShareValueEvidenceId: null,
    evidence: [dartEv],
  }, 'Rovuma: LOI scope; validity unverified', 'lifecycle', {
    affectedClaim: 'contractStatus,counterparty',
    evidenceId: dartId,
  });

  patchNode('consortium:smdc-jv', {
    type: 'provisional_consortium',
    entityStatus: 'provisional',
    nameKo: '참여 예정 합작법인(미확정)',
    nameEn: 'Provisional JV (to be formed; name undisclosed in DART)',
    consortiumName: null,
    legalNameKo: null,
    legalNameEn: null,
    memberIds: ['krx:047040'],
    excludedFromEntityCounts: true,
    defaultHidden: true,
    reviewStatus: 'needs_human_review',
    noteKo: 'DART: 합작법인 설립 시 지분 확정. SMDC/SNDC 약칭·법적 실체 없음.',
    noteEn: 'DART mentions future JV share TBD; no SMDC/SNDC legal name.',
  }, 'Provisional JV — no SMDC acronym as legal entity', 'legal_entity', { unresolved: true });

  patchEdge('e-rovuma-owner', {
    noteKo: 'LOI 발행/사업주 대표사. final contract counterparty unconfirmed.',
    counterpartyScope: 'letter_of_intent',
  }, 'Owner edge LOI scope', 'counterparty');
}

// Orphan freeze
log({
  entityKind: 'metrics',
  edgeOrProjectId: 'orphan_metrics',
  reason: 'Phase 5A.3 — no orphan padding',
  correctionCategory: 'orphan_metric',
  before: { businessRelationOrphanCount: 5 },
  after: { businessRelationOrphanCount: 5 },
  reviewedAt: AS_OF,
  reviewedBy: BY,
});

network.nodes = nodes;
network.edges = edges;
network.phase5a3CuratedAt = AS_OF;
network.metrics = computeConstructionProjectMetrics(network);
network.metrics.claimCoverage = computeConstructionClaimCoverageMetrics(network);
network.metrics.phase5a3CuratedAt = AS_OF;

const report = validateNetworkReport(network);
fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({
  asOf: AS_OF,
  curatedBy: BY,
  purpose: 'Phase 5A.3 construction claim-scoped evidence and closing audit',
  dukhanRcpProbe: { hits: dukhanProbeHits, signedRcp: dukhanSignedRcpUnresolved, correctionRcp: dukhanCorrectionRcpUnresolved },
  entries: changelog,
  metricsSnapshot: network.metrics,
  claimCoverage: network.metrics.claimCoverage,
  validate: { failures: report.failures || [], warnings: report.warnings || [] },
}, null, 2)}\n`, 'utf8');

console.log('OK construction Phase 5A.3 →', NET_FP);
console.log('dukhan probe hits', dukhanProbeHits.length);
console.log('claimCoverage', JSON.stringify(network.metrics.claimCoverage, null, 2));
console.log('validate failures', (report.failures || []).length, 'warnings', (report.warnings || []).length);
