/**
 * Phase 5B.2 — Auto confirmed business relationship curation (minimal).
 * Runs after curate_auto_relationships_phase5b1.mjs.
 * Does not invent supply/fitment/JV without opened DART/KIND primary sources.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeAutoMetrics } from '../lib/relation_network/auto_metrics.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase5b2';
const NET_FP = join(ROOT, 'data', 'networks', 'auto.json');
const LOG_FP = join(ROOT, 'data', 'auto_relation_phase5b2_changelog.json');

const DART_HNC_REPORT_URL = 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250318000944';
const DART_HNC_REPORT_RCP = '20250318000944';
const OWNERSHIP_AS_OF = '2024-12-31';

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
}

function mkEv(p) {
  return {
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    accessedAt: AS_OF,
    sourceOpened: true,
    directEvidence: true,
    primarySource: true,
    sourceType: p.sourceType || 'dart',
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt,
    rcpNo: p.rcpNo || null,
    evidenceSummaryKo: p.evidenceSummaryKo,
    evidenceSummaryEn: p.evidenceSummaryEn,
    quotedFactKo: p.quotedFactKo,
    quotedFactEn: p.quotedFactEn,
    relationshipSupported: p.relationshipSupported,
    claimSupport: p.claimSupport || {
      relationship: true,
      legalEntity: true,
      counterparty: true,
      stakePct: true,
      asOf: true,
      directOwnership: true,
    },
    evidenceUsageType: p.evidenceUsageType || 'annual_report',
    evidenceScope: p.evidenceScope || 'single_entity',
  };
}

// ── 1. Ownership: 한국앤컴퍼니 → 한국타이어앤테크놀로지 (관계기업 31.15%) ──
const OWNERSHIP_ID = 'owns-stake-000240-161390';
const ownershipExisting = edges.find((e) => e.id === OWNERSHIP_ID);
if (ownershipExisting) {
  if (!ownershipExisting.lastVerifiedAt) ownershipExisting.lastVerifiedAt = AS_OF;
  log({
    action: 'idempotent_skip',
    candidateId: OWNERSHIP_ID,
    reason: 'ownership edge already present',
    finalDecision: 'accepted',
  });
} else if (!ownershipExisting) {
  const source = 'krx:000240';
  const target = 'krx:161390';
  if (!nodeById.has(source) || !nodeById.has(target)) {
    log({
      action: 'rejected',
      candidateId: OWNERSHIP_ID,
      source,
      target,
      relationshipType: 'owns_stake_in',
      reason: 'missing canonical listed nodes',
      finalDecision: 'rejected',
    });
  } else {
    const edge = {
      id: OWNERSHIP_ID,
      source,
      target,
      type: 'owns_stake_in',
      direction: 'source_to_target',
      status: 'confirmed',
      labelKo: '한국타이어앤테크놀로지 관계기업 지분 31.15%',
      labelEn: 'Associate stake in Hankook Tire & Technology (31.15%)',
      stakePct: 31.15,
      votingRightsPct: null,
      ownershipKind: 'direct',
      directOrIndirect: 'direct',
      asOf: OWNERSHIP_AS_OF,
      sourceDocumentDate: OWNERSHIP_AS_OF,
      defaultHidden: false,
      confidence: 'high',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: 'DART 사업보고서 관계기업 현황(유효지분율). 지배·완전자회사(owns) 아님.',
      noteEn: 'DART annual report associate table (effective stake %). Not controlling owns.',
      reviewStatus: 'reviewed',
      reviewedAt: AS_OF,
      reviewedBy: BY,
      evidence: [mkEv({
        sourceType: 'dart',
        title: '한국앤컴퍼니 2024 사업보고서 — 관계기업 현황',
        url: DART_HNC_REPORT_URL,
        rcpNo: DART_HNC_REPORT_RCP,
        publishedAt: '2025-03-18',
        evidenceSummaryKo: '관계기업 한국타이어앤테크놀로지㈜ 유효지분율 당기말 31.15%.',
        evidenceSummaryEn: 'Associate Hankook Tire & Technology effective stake 31.15% at period-end.',
        quotedFactKo: '한국타이어앤테크놀로지㈜ | 관계기업 | 31.15 | 31.15',
        quotedFactEn: 'Hankook Tire & Technology | associate | 31.15% | 31.15%',
        relationshipSupported: 'krx:000240 owns_stake_in krx:161390 at 31.15%',
        claimSupport: {
          relationship: true,
          legalEntity: true,
          counterparty: true,
          stakePct: true,
          asOf: true,
          directOwnership: true,
          product: false,
          contractStatus: false,
          massProductionStatus: false,
        },
        evidenceUsageType: 'annual_report',
        evidenceScope: 'single_entity',
      })],
    };
    edges.push(edge);
    log({
      action: 'accepted',
      candidateId: OWNERSHIP_ID,
      source,
      target,
      relationshipType: 'owns_stake_in',
      editorialStatus: 'confirmed',
      before: null,
      after: { stakePct: 31.15, asOf: OWNERSHIP_AS_OF, status: 'confirmed' },
      evidence: edge.evidence,
      claimSupport: edge.evidence[0].claimSupport,
      lifecycle: null,
      counterpartyDisclosure: 'exact',
      finalDecision: 'accepted',
      reason: 'DART 사업보고서 관계기업 표 — 유효지분율·법인명 확인',
    });
  }
}

// ── 2. Supply audit — defer without opened contract primary source ──
const supplyCandidates = [
  {
    candidateId: 'supply-012330-deferred',
    source: 'krx:012330',
    sourceLegal: '현대모비스주식회사',
    targetLegal: 'anonymous',
    relationType: 'supplies_system_to',
    product: 'chassis/module',
    contractStatus: 'unknown',
    evidenceUrl: null,
    rcpNo: null,
    sourceOpened: false,
    relationshipClaim: false,
    finalDecision: 'deferred',
    rejectionReason: '사업보고서 고객 집계만 — 개별 DART 단일판매·공급계약 원문 미개봉',
  },
  {
    candidateId: 'supply-005850-deferred',
    source: 'krx:005850',
    sourceLegal: '에스엘주식회사',
    targetLegal: 'anonymous',
    relationType: 'supplies_lighting_to',
    product: 'headlamp',
    contractStatus: 'unknown',
    evidenceUrl: null,
    rcpNo: null,
    sourceOpened: false,
    finalDecision: 'deferred',
    rejectionReason: '단일판매·공급계약 DART 본문(상대방·계약상태) 미확인',
  },
  {
    candidateId: 'supply-161390-deferred',
    source: 'krx:161390',
    sourceLegal: '한국타이어앤테크놀로지㈜',
    targetLegal: 'anonymous',
    relationType: 'supplies_tire_to',
    product: 'passenger tire',
    contractStatus: 'unknown',
    evidenceUrl: null,
    rcpNo: null,
    sourceOpened: false,
    finalDecision: 'deferred',
    rejectionReason: '익명/집계 매출처 — exact OEM supplies 미생성',
  },
  {
    candidateId: 'supply-018880-deferred',
    source: 'krx:018880',
    sourceLegal: '한온시스템',
    targetLegal: 'anonymous',
    relationType: 'supplies_system_to',
    product: 'thermal HVAC',
    contractStatus: 'unknown',
    evidenceUrl: null,
    rcpNo: null,
    sourceOpened: false,
    finalDecision: 'deferred',
    rejectionReason: '양산 공급 DART/KIND 직접 근거 미개봉',
  },
];
for (const c of supplyCandidates) {
  log({
    action: 'supply_audit',
    ...c,
    correctionCategory: 'supply_audit',
  });
}

// ── 3. Vehicle fitment audit — 0 maintained ──
log({
  action: 'fitment_audit',
  relationshipType: 'used_in_vehicle',
  count: edges.filter((e) => e.type === 'used_in_vehicle').length,
  finalDecision: 'deferred',
  reason: '공식 완성차·부품사 원문에서 차종·양산 탑재 동시 확인 전 0건 유지',
  correctionCategory: 'fitment_audit',
});

// ── 4. JV / joint development audit — 0 maintained ──
log({
  action: 'jv_audit',
  relationshipTypes: ['develops_with', 'operates_joint_venture', 'joint_development', 'licenses_to'],
  count: edges.filter((e) => ['develops_with', 'operates_joint_venture', 'joint_development', 'licenses_to', 'joint_venture'].includes(e.type)).length,
  finalDecision: 'deferred',
  reason: 'MOU·업무협약과 JV/양산계약 구분 — DART/KIND 직접 근거 없으면 미생성',
  correctionCategory: 'jv_audit',
});

network.edges = edges;
network.phase5b2CuratedAt = AS_OF;
network.lastReviewedAt = AS_OF;
network.metrics = computeAutoMetrics(network);

const orphan = computeListedRelationOrphanMetrics(network);
const report = validateNetworkReport(network);

fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({
  asOf: AS_OF,
  phase: '5B.2',
  reviewedBy: BY,
  metrics: network.metrics,
  orphan,
  validate: { failures: report.failures, warnings: report.warnings },
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ownershipEdges: edges.filter((e) => e.type === 'owns' || e.type === 'owns_stake_in').length,
  supplyEdges: edges.filter((e) => ['supplies_component_to', 'supplies_system_to', 'supplies_tire_to', 'supplies_lighting_to', 'supplies_electronics_to', 'awarded_contract', 'nominated_supplier_for'].includes(e.type)).length,
  fitmentEdges: edges.filter((e) => e.type === 'used_in_vehicle').length,
  businessRelationOrphanCount: orphan.businessRelationOrphanCount,
  directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
  hasPeerButNoBusinessCompanyCount: orphan.hasPeerButNoBusinessCompanyCount,
  peerOnlyCompanyCount: orphan.peerOnlyCompanyCount,
  structuralOnlyCompanyCount: orphan.structuralOnlyCompanyCount,
  claimCoverage: network.metrics.claimCoverage,
  failures: report.failures,
  warnings: report.warnings,
}, null, 2));

if (report.failures.length) process.exitCode = 1;
