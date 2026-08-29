/**
 * Phase 4A.2 — Powergrid contract evidence / status semantics correction.
 * Existing 7 contracts only. No new contracts. No orphan-fill edges.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { computePowergridContractMetrics, dartUrl } from '../lib/relation_network/powergrid_contract_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const REVIEWED_BY = 'editorial_manual_review';
const NET = join(ROOT, 'data', 'networks', 'powergrid.json');
const CHANGELOG = join(ROOT, 'data', 'powergrid_relation_phase4a2_changelog.json');

const TAIHAN_BAD = '20250924800543';
const TAIHAN_LOA = '20250825800543';
const TAIHAN_FINAL_LOA = '20250924800002';
const TAIHAN_FORMAL = '20251120800410';

/** DART bodies opened on AS_OF — source of truth for this phase. */
const REVIEWS = [
  {
    contractId: 'contract:hde-20260507-us-transformer',
    awardId: 'award-267260-hde-20260507',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'effective',
    counterpartyStatus: 'intermediary_disclosed',
    counterpartyDisclosure: 'undisclosed',
    originalReceiptNo: '20260507800238',
    latestReceiptNo: '20260507800238',
    correctionReceiptNos: [],
    correctionReviewStatus: 'reviewed',
    statusReview: 'reviewed',
    validTo: '2029-08-31',
    defaultHidden: false,
    evidenceSummaryKo: 'DART 원문 확인: 765kV 변압기·리액터 1,730억원, 상대 HD Hyundai Electric America Corporation, 2026-05-06~2029-08-31. 최종 유틸리티명 비공개.',
    evidenceSummaryEn: 'DART body opened: 765kV transformer/reactor KRW 173bn via HD Hyundai Electric America; end utility unnamed.',
    quotedFactKo: '계약상대방 HD Hyundai Electric America Corporation / 판매·공급지역 미국 / 765KV 초고압 변압기 및 리액터',
    relationshipSupported: 'krx:267260 awarded_contract contract:hde-20260507-us-transformer',
    noteKo: '중간 자회사만 공개. 특정 미국 utility 노드 생성하지 않음. 회사→계약 사실은 원문으로 확인.',
    noteEn: 'Intermediary U.S. sub only; no named utility node; company→contract confirmed from opened body.',
    reason: 'Reopened DART body successfully; intermediary_disclosed; anonymous end customer does not block award confirmation.',
  },
  {
    contractId: 'contract:taihan-gtc-1217a-2024-kahramaa',
    awardId: 'award-001440-gtc-1217a',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'effective',
    counterpartyStatus: 'exact',
    counterpartyDisclosure: 'named',
    originalReceiptNo: TAIHAN_LOA,
    latestReceiptNo: TAIHAN_FORMAL,
    correctionReceiptNos: [TAIHAN_FINAL_LOA],
    correctionReviewStatus: 'reviewed',
    statusReview: 'reviewed',
    validTo: '2029-04-30',
    defaultHidden: false,
    loaReceivedAt: '2025-08-25',
    evidenceSummaryKo: 'LOA(20250825800543)→Final LOA 금액정정(20250924800002)→정식계약(20251120800410) 원문 확인. KAHRAMAA GTC/1217A/2024.',
    evidenceSummaryEn: 'Opened LOA, Final LOA correction 20250924800002, and formal contract 20251120800410. KAHRAMAA GTC/1217A/2024.',
    quotedFactKo: '계약상대방 카타르 일반전기수자원청 (Qatar General Electricity & Water Corporation) / GTC/1217A/2024',
    relationshipSupported: 'krx:001440 awarded_contract contract:taihan-gtc-1217a-2024-kahramaa',
    noteKo: '거부된 rcp 20250924800543 제거. 실제 Final LOA 정정은 20250924800002 (LOA 금액 QAR 471M→480M).',
    noteEn: 'Removed rejected rcp 20250924800543; Final LOA correction is 20250924800002 (amount QAR 471M→480M).',
    reason: 'Correction chain verified from opened bodies; exact KAHRAMAA; confirmed.',
  },
  {
    contractId: 'contract:ls-20251107-bigtech-dc-p2',
    awardId: 'award-ls-20251107-bigtech-dc-p2',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'completed',
    counterpartyStatus: 'intermediary_disclosed',
    counterpartyDisclosure: 'undisclosed',
    originalReceiptNo: '20251110800106',
    latestReceiptNo: '20251110800106',
    correctionReceiptNos: [],
    correctionReviewStatus: 'reviewed',
    statusReview: 'needs_review',
    validTo: '2026-04-01',
    defaultHidden: true,
    evidenceSummaryKo: 'DART 원문 확인: Big Tech Data Center PJT(2차), LS ELECTRIC AMERICA Inc., 132,910,198,720원, 2025-11-07~2026-04-01.',
    evidenceSummaryEn: 'DART body opened: Big Tech DC PJT phase 2 to LS ELECTRIC AMERICA Inc., KRW 132.9bn.',
    quotedFactKo: '계약상대방 LS ELECTRIC AMERICA Inc. / Big Tech Data Center PJT(2차)',
    relationshipSupported: 'krx:010120 awarded_contract contract:ls-20251107-bigtech-dc-p2',
    noteKo: '계약기간 종료로 completed. 별도 완료공시 없어 statusReview=needs_review. ended와 중복 집계하지 않음.',
    noteEn: 'Marked completed by period end without completion filing → statusReview=needs_review. Not double-counted as ended.',
    reason: 'Opened source; completed lifecycle with needs_review; award confirmable.',
  },
  {
    contractId: 'contract:hyosung-20260209-hico-765kv',
    awardId: 'award-hyosung-20260209-hico-765kv',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'effective',
    counterpartyStatus: 'intermediary_disclosed',
    counterpartyDisclosure: 'undisclosed',
    originalReceiptNo: '20260210800044',
    latestReceiptNo: '20260210800044',
    correctionReceiptNos: [],
    correctionReviewStatus: 'reviewed',
    statusReview: 'reviewed',
    validTo: '2031-01-31',
    defaultHidden: false,
    evidenceSummaryKo: 'DART 원문 확인: 765kV Transformer/Reactor, HICO America, 787,063,743,500원. 최종 유틸리티 비공개.',
    evidenceSummaryEn: 'DART body opened: 765kV transformer/reactor to HICO America; end utility unnamed.',
    quotedFactKo: '계약상대방 HICO America Sales & Tech,Inc. / 765kV Transformer and Reactor Purchase Agreement',
    relationshipSupported: 'krx:298040 awarded_contract contract:hyosung-20260209-hico-765kv',
    noteKo: '중간 법인 HICO America만 공개. 최종 미국 유틸리티 실명 없음.',
    noteEn: 'Intermediary HICO America disclosed; end U.S. utility unnamed.',
    reason: 'Opened source; intermediary_disclosed; confirmed company→contract.',
  },
  {
    contractId: 'contract:iljin-20260511-spgroup-cables',
    awardId: 'award-iljin-20260511-spgroup-cables',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'effective',
    counterpartyStatus: 'exact',
    counterpartyDisclosure: 'named',
    originalReceiptNo: '20260512800198',
    latestReceiptNo: '20260512800198',
    correctionReceiptNos: [],
    correctionReviewStatus: 'reviewed',
    statusReview: 'reviewed',
    validTo: '2028-12-31',
    defaultHidden: false,
    evidenceSummaryKo: 'DART 원문 확인: 싱가포르 전력청(SP Group) 230kV 케이블 NDC418.',
    evidenceSummaryEn: 'DART body opened: SP Group 230kV cables NDC418.',
    quotedFactKo: '계약상대방 싱가포르 전력청(SPGroup) / SUPPLY AND INSTALLATION OF 230KV POWER CABLES',
    relationshipSupported: 'krx:103590 awarded_contract contract:iljin-20260511-spgroup-cables',
    noteKo: 'SP Group 실명 exact.',
    noteEn: 'SP Group exact named counterparty.',
    reason: 'Opened source; exact counterparty; confirmed.',
  },
  {
    contractId: 'contract:sanil-20260430-bloom-dc',
    awardId: 'award-sanil-20260430-bloom-dc',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'effective',
    counterpartyStatus: 'exact',
    counterpartyDisclosure: 'named',
    originalReceiptNo: '20260430800407',
    latestReceiptNo: '20260430800407',
    correctionReceiptNos: [],
    correctionReviewStatus: 'reviewed',
    statusReview: 'reviewed',
    validTo: '2027-03-29',
    defaultHidden: false,
    evidenceSummaryKo: 'DART 원문 확인: Bloom Energy 미국 데이터센터 변압기 50,277,275,000원.',
    evidenceSummaryEn: 'DART body opened: Bloom Energy U.S. data-center transformers KRW 50.3bn.',
    quotedFactKo: '계약상대방 Bloom Energy / 미국 Data Center용 변압기 공급',
    relationshipSupported: 'krx:062040 awarded_contract contract:sanil-20260430-bloom-dc',
    noteKo: 'Bloom Energy 실명 exact.',
    noteEn: 'Bloom Energy exact named counterparty.',
    reason: 'Opened source; exact Bloom Energy; confirmed.',
  },
  {
    contractId: 'contract:sanil-20260619-eu-bess',
    awardId: 'award-sanil-20260619-eu-bess',
    sourceAccess: 'opened',
    editorialStatus: 'confirmed',
    contractStatus: 'effective',
    counterpartyStatus: 'anonymous',
    counterpartyDisclosure: 'undisclosed',
    originalReceiptNo: '20260622800670',
    latestReceiptNo: '20260622800670',
    correctionReceiptNos: [],
    correctionReviewStatus: 'reviewed',
    statusReview: 'reviewed',
    validTo: '2031-12-07',
    defaultHidden: false,
    evidenceSummaryKo: 'DART 원문 확인: 유럽 BESS·신재생 변압기. 계약상대 공란(경영상 비밀).',
    evidenceSummaryEn: 'DART body opened: Europe BESS/renewable transformers; counterparty field blank.',
    quotedFactKo: '계약상대방 - (미공개) / 판매·공급지역 유럽 / BESS, 신재생용 변압기',
    relationshipSupported: 'krx:062040 awarded_contract contract:sanil-20260619-eu-bess',
    noteKo: '익명 상대 노드만 사용. 회사→계약 사실은 원문 확인.',
    noteEn: 'Anonymous counterparty node only; company→contract confirmed from body.',
    reason: 'Opened source; anonymous counterparty; award confirmed without naming customer.',
  },
];

const network = JSON.parse(fs.readFileSync(NET, 'utf8'));
const nodes = network.nodes;
const edges = network.edges;
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const edgeById = new Map(edges.map((e) => [e.id, e]));
const changelog = [];

function snap(contract, award) {
  const ev = (award?.evidence || [])[0] || {};
  return {
    editorialStatus: award?.status ?? null,
    contractStatus: contract?.contractStatus || contract?.status || null,
    counterpartyStatus: contract?.counterpartyStatus || null,
    counterpartyDisclosure: contract?.counterpartyDisclosure || null,
    directEvidence: ev.directEvidence === true,
    reviewStatus: ev.reviewStatus || null,
    sourceAccessStatus: ev.sourceAccessStatus || null,
    correctionReceiptNos: [...(contract?.correctionReceiptNos || [])],
    correctionReviewStatus: contract?.correctionReviewStatus || null,
    statusReview: contract?.statusReview || null,
    defaultHidden: award?.defaultHidden === true,
  };
}

function mkEvidence(r, prev) {
  return {
    reviewStatus: r.sourceAccess === 'opened' ? 'reviewed' : 'needs_human_review',
    reviewedAt: AS_OF,
    reviewedBy: REVIEWED_BY,
    accessedAt: AS_OF,
    sourceAccessStatus: r.sourceAccess,
    directEvidence: r.sourceAccess === 'opened',
    primarySource: true,
    sourceType: 'dart',
    title: prev?.title || `${r.contractId} DART ${r.latestReceiptNo}`,
    url: dartUrl(r.latestReceiptNo),
    publishedAt: prev?.publishedAt || null,
    evidenceSummaryKo: r.evidenceSummaryKo,
    evidenceSummaryEn: r.evidenceSummaryEn,
    quotedFactKo: r.quotedFactKo,
    relationshipSupported: r.relationshipSupported,
    originalReceiptNo: r.originalReceiptNo,
    latestReceiptNo: r.latestReceiptNo,
    correctionReceiptNos: [...(r.correctionReceiptNos || [])],
  };
}

for (const r of REVIEWS) {
  const contract = nodeById.get(r.contractId);
  if (!contract) {
    console.warn('missing contract', r.contractId);
    continue;
  }
  const award = edgeById.get(r.awardId)
    || edges.find((e) => e.type === 'awarded_contract' && e.target === r.contractId);
  if (!award) {
    console.warn('missing award', r.contractId, r.awardId);
    continue;
  }

  const before = snap(contract, award);
  const prevEv = (award.evidence || [])[0] || {};

  Object.assign(contract, {
    counterpartyDisclosure: r.counterpartyDisclosure,
    counterpartyStatus: r.counterpartyStatus,
    contractStatus: r.contractStatus,
    status: r.contractStatus,
    originalReceiptNo: r.originalReceiptNo,
    latestReceiptNo: r.latestReceiptNo,
    correctionReceiptNos: (r.correctionReceiptNos || []).filter((x) => x !== TAIHAN_BAD),
    correctionReviewStatus: r.correctionReviewStatus,
    statusReview: r.statusReview,
    validTo: r.validTo,
    lastVerifiedAt: AS_OF,
    noteKo: r.noteKo,
    noteEn: r.noteEn,
    phase4a2ReviewedAt: AS_OF,
  });
  if (r.loaReceivedAt) contract.loaReceivedAt = r.loaReceivedAt;

  Object.assign(award, {
    status: r.editorialStatus,
    editorialStatus: r.editorialStatus,
    defaultHidden: r.defaultHidden,
    contractStatus: r.contractStatus,
    lastVerifiedAt: AS_OF,
    reviewStatus: r.sourceAccess === 'opened' ? 'reviewed' : 'needs_human_review',
    reviewedAt: AS_OF,
    reviewedBy: REVIEWED_BY,
    countAsContractBusiness: true,
    evidence: [mkEvidence(r, prevEv)],
    labelKo: r.contractStatus === 'completed' ? '단일판매·공급계약(완료)' : '단일판매·공급계약',
    labelEn: r.contractStatus === 'completed' ? 'Supply contract (completed)' : 'Major supply contract disclosed',
  });

  for (const e of edges) {
    if (e === award) continue;
    if (e.source !== r.contractId && e.target !== r.contractId) continue;
    if (e.countAsContractBusiness) e.countAsContractBusiness = false;
    for (const ev of e.evidence || []) {
      if (!Array.isArray(ev.correctionReceiptNos)) continue;
      const hadBad = ev.correctionReceiptNos.includes(TAIHAN_BAD);
      ev.correctionReceiptNos = ev.correctionReceiptNos.filter((x) => x !== TAIHAN_BAD);
      if (hadBad && r.contractId === 'contract:taihan-gtc-1217a-2024-kahramaa'
        && !ev.correctionReceiptNos.includes(TAIHAN_FINAL_LOA)) {
        ev.correctionReceiptNos.push(TAIHAN_FINAL_LOA);
      }
    }
  }

  const after = snap(contract, award);
  changelog.push({
    contractId: r.contractId,
    awardEdgeId: award.id,
    previousEditorialStatus: before.editorialStatus,
    nextEditorialStatus: after.editorialStatus,
    previousContractStatus: before.contractStatus,
    nextContractStatus: after.contractStatus,
    previousDirectEvidence: before.directEvidence,
    nextDirectEvidence: after.directEvidence,
    previousReviewStatus: before.reviewStatus,
    nextReviewStatus: after.reviewStatus,
    previousCounterpartyStatus: before.counterpartyStatus || before.counterpartyDisclosure,
    nextCounterpartyStatus: after.counterpartyStatus,
    previousCorrectionReceiptNos: before.correctionReceiptNos,
    nextCorrectionReceiptNos: after.correctionReceiptNos,
    previousCorrectionReviewStatus: before.correctionReviewStatus,
    nextCorrectionReviewStatus: after.correctionReviewStatus,
    previousStatusReview: before.statusReview,
    nextStatusReview: after.statusReview,
    reason: r.reason,
    reviewedEvidenceUrls: [dartUrl(r.latestReceiptNo), dartUrl(r.originalReceiptNo)]
      .concat((r.correctionReceiptNos || []).map(dartUrl))
      .filter((v, i, a) => a.indexOf(v) === i),
    phase: '4A.2',
    asOf: AS_OF,
  });
}

for (const n of nodes) {
  if (n.isAnonymousCounterparty || String(n.id || '').startsWith('counterparty:undisclosed')) {
    n.isAnonymousCounterparty = true;
    delete n.ticker;
    delete n.mcapWon;
    delete n.logoUrl;
  }
}

const contractMetrics = computePowergridContractMetrics({ nodes, edges });
const orphan = computeListedRelationOrphanMetrics({ nodes, edges });

network.metrics = {
  ...network.metrics,
  ...contractMetrics,
  confirmedBusinessEdgeCount: edges.filter((e) => e.type === 'awarded_contract' && e.status === 'confirmed').length,
  reportedBusinessEdgeCount: edges.filter((e) => e.type === 'awarded_contract' && e.status === 'reported').length,
  businessRelationOrphanCount: orphan.businessRelationOrphanCount,
  directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
  classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
  phase4a2CuratedAt: AS_OF,
};
network.lastVerifiedAt = AS_OF;

const report = validateNetworkReport(network);
fs.writeFileSync(NET, JSON.stringify(network, null, 2), 'utf8');
fs.writeFileSync(CHANGELOG, JSON.stringify({
  asOf: AS_OF,
  phase: '4A.2',
  purpose: 'Evidence and status semantics correction for existing 7 contracts only',
  changelog,
  contractMetrics,
  orphan,
  validate: { failures: report.failures, warnings: report.warnings },
  denominators: {
    uniqueContractCount: 'all contract nodes',
    activeContractCount: 'contractStatus ∈ {effective, in_delivery, announced, letter_of_award}',
    historicalContractCount: 'completed + cancelled + terminated (exclusive; no ended double-count)',
    activeContractDirectEvidenceCoverage: 'active contracts whose award evidence has directEvidence=true AND sourceAccessStatus=opened',
    activeContractPrimarySourceCoverage: 'active contracts with DART/primary URL (independent of directEvidence)',
  },
}, null, 2), 'utf8');

console.log(JSON.stringify({
  phase: '4A.2',
  contractsReviewed: changelog.length,
  contractMetrics,
  failures: report.failures,
  warnings: report.warnings.slice(0, 20),
}, null, 2));
if (report.failures.length) process.exit(1);
