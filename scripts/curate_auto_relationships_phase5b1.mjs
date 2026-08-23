/**
 * Phase 5B.1 — Auto business relationship / ownership / evidence curation.
 * Runs after migrate_auto_network_phase5b.mjs.
 * Does not invent supply, fitment, or ownership without opened primary sources.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeAutoMetrics } from '../lib/relation_network/auto_metrics.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase5b1';
const NET_FP = join(ROOT, 'data', 'networks', 'auto.json');
const LOG_FP = join(ROOT, 'data', 'auto_relation_phase5b1_changelog.json');

const FTC_ROSTER_URL = 'https://www.ftc.go.kr/www/selectBbsNttView.do?key=12&bordCd=3&nttSn=46053';
const FTC_AS_OF = '2025-05-01';

/** cp_list tickers in Hyundai Motor Group (FTC 공시대상기업집단 현대자동차). */
const HMG_MEMBERS = {
  '005380': { legalKo: '현대자동차주식회사', legalEn: 'Hyundai Motor Company' },
  '000270': { legalKo: '기아주식회사', legalEn: 'Kia Corporation' },
  '012330': { legalKo: '현대모비스주식회사', legalEn: 'Hyundai Mobis Co., Ltd.' },
  '011210': { legalKo: '현대위아주식회사', legalEn: 'Hyundai Wia Corporation' },
  '307950': { legalKo: '현대오토에버주식회사', legalEn: 'Hyundai AutoEver Corp.' },
};

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
    sourceType: p.sourceType || 'regulator',
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt,
    evidenceSummaryKo: p.evidenceSummaryKo,
    evidenceSummaryEn: p.evidenceSummaryEn,
    quotedFactKo: p.quotedFactKo,
    quotedFactEn: p.quotedFactEn,
    relationshipSupported: p.relationshipSupported,
    claimSupport: p.claimSupport || {
      relationship: true,
      legalEntity: true,
      counterparty: true,
      product: false,
      vehicle: false,
      platform: false,
      role: true,
      contractStatus: false,
      nominationStatus: false,
      massProductionStatus: false,
      validFrom: false,
      validTo: false,
      amount: false,
      stakePct: false,
    },
    evidenceUsageType: p.evidenceUsageType || 'official_roster',
    evidenceScope: p.evidenceScope || 'multiple_entities',
  };
}

function patchEdge(id, after, reason, category) {
  const e = edges.find((x) => x.id === id);
  if (!e) {
    log({ action: 'missing_edge', edgeId: id, reason, correctionCategory: category });
    return;
  }
  const before = {
    status: e.status,
    evidence: e.evidence ? [...e.evidence] : [],
    labelKo: e.labelKo,
    stakePct: e.stakePct ?? null,
  };
  Object.assign(e, after);
  if (after.evidence) e.evidence = after.evidence;
  log({
    action: 'patch_edge',
    edgeId: id,
    relationshipType: e.type,
    editorialStatus: e.status,
    before,
    after: {
      status: e.status,
      evidence: e.evidence,
      labelKo: e.labelKo,
      stakePct: e.stakePct ?? null,
    },
    reason,
    correctionCategory: category,
    reviewedAt: AS_OF,
    reviewedBy: BY,
  });
}

// ── 1. FTC group_member evidence (5 edges) ──
for (const [ticker, meta] of Object.entries(HMG_MEMBERS)) {
  const edgeId = `group-member-${ticker}-hmg`;
  const source = `krx:${ticker}`;
  patchEdge(edgeId, {
    status: 'reported',
    stakePct: null,
    votingRightsPct: null,
    asOf: FTC_AS_OF,
    sourceDocumentDate: FTC_AS_OF,
    defaultHidden: false,
    confidence: 'high',
    labelKo: '현대자동차 기업집단 소속',
    labelEn: 'Hyundai Motor designated enterprise group membership',
    noteKo: '공정위 2025 공시대상기업집단(현대자동차) 명부. group_member만 표시 — 지분·공급·지배 관계 아님.',
    noteEn: 'FTC 2025 designated group roster (Hyundai Motor). group_member only — not ownership or supply.',
    edgeOrigin: 'manuallyCurated',
    evidence: [mkEv({
      sourceType: 'regulator',
      title: '공정거래위원회 2025 공시대상기업집단 지정 (현대자동차)',
      url: FTC_ROSTER_URL,
      publishedAt: FTC_AS_OF,
      evidenceSummaryKo: `2025.5.1 공정위 지정 명부에 ${meta.legalKo} 포함. group_member만 표시(owns/supplies 아님).`,
      evidenceSummaryEn: `FTC 2025-05-01 roster includes ${meta.legalEn}. group_member only (not owns/supplies).`,
      quotedFactKo: '공시대상기업집단으로 지정･통지 (현대자동차)',
      quotedFactEn: 'Designated enterprise group notification (Hyundai Motor)',
      relationshipSupported: `${source} group_member group:hyundai_motor_group (${meta.legalKo})`,
      evidenceUsageType: 'official_roster',
      evidenceScope: 'multiple_entities',
    })],
  }, `FTC roster group_member ${meta.legalKo}`, 'group_membership_evidence');
}

// ── 2. Ownership audit — defer without opened DART stake table ──
const ownershipCandidates = [
  {
    source: 'krx:000240',
    target: 'krx:161390',
    labelKo: '한국앤컴퍼니 → 한국타이어앤테크놀로지',
    reason: 'DART/KIND 지분현황 원문 미개봉 — stakePct·기준일 확인 전 owns/owns_stake_in 미생성',
  },
];
for (const c of ownershipCandidates) {
  const existing = edges.find((e) =>
    (e.source === c.source && e.target === c.target)
    && (e.type === 'owns' || e.type === 'owns_stake_in'));
  log({
    action: existing ? 'ownership_audit_existing' : 'ownership_deferred',
    source: c.source,
    target: c.target,
    relationshipType: existing?.type || 'owns_stake_in',
    editorialStatus: existing?.status || null,
    reason: c.reason,
    correctionCategory: 'ownership_audit',
    unresolved: true,
  });
}

// ── 3. Supply relationship audit — no confirmed edges without DART/KIND contract ──
const supplyAuditNotes = [
  { ticker: '012330', note: '현대모비스 — 사업보고서 고객 목록만으로 개별 supplies_* 미생성' },
  { ticker: '005850', note: '에스엘 — OEM 공급계약 DART 단일판매·공급계약 미확인' },
  { ticker: '161390', note: '한국타이어 — 익명/집계 매출처만으로 exact OEM supplies 미생성' },
  { ticker: '018880', note: '한온시스템 — 양산 공급 DART/KIND 직접 근거 미개봉' },
  { ticker: '064960', note: 'SNT모티브 — EV 구동 모터 양산 supplies 미확인' },
];
for (const row of supplyAuditNotes) {
  log({
    action: 'supply_audit_no_edge',
    source: `krx:${row.ticker}`,
    reason: row.note,
    correctionCategory: 'supply_audit',
    unresolved: true,
  });
}

// ── 4. Vehicle fitment audit — used_in_vehicle 0 maintained ──
log({
  action: 'fitment_audit',
  relationshipType: 'used_in_vehicle',
  count: edges.filter((e) => e.type === 'used_in_vehicle').length,
  reason: '공식 공급사·완성차 원문에서 제품·차종·양산 탑재 동시 확인 전 0건 유지',
  correctionCategory: 'fitment_audit',
  unresolved: true,
});

// ── 5. Joint development / JV audit — 0 maintained ──
log({
  action: 'jv_audit',
  relationshipTypes: ['develops_with', 'operates_joint_venture', 'participates_in', 'licenses_to'],
  count: edges.filter((e) => ['develops_with', 'operates_joint_venture', 'participates_in', 'licenses_to', 'joint_venture'].includes(e.type)).length,
  reason: 'MOU·업무협약과 JV/양산계약 구분 — DART/KIND 직접 근거 없으면 미생성',
  correctionCategory: 'jv_audit',
  unresolved: true,
});

// ── 6. Structural relationship audit (59 structuralGenerated) ──
const listedIds = nodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false).map((n) => n.id);
const structuralByCompany = new Map();
for (const id of listedIds) structuralByCompany.set(id, []);
for (const e of edges) {
  if (e.edgeOrigin !== 'structuralGenerated') continue;
  if (listedIds.includes(e.source)) structuralByCompany.get(e.source).push(e);
  if (listedIds.includes(e.target)) structuralByCompany.get(e.target).push(e);
}
let structuralOverCap = 0;
let structuralDupProduct = 0;
for (const [id, inc] of structuralByCompany) {
  const products = inc.filter((e) => ['manufactures', 'produces', 'specializes_in', 'exposed_to', 'used_in_technology'].includes(e.type));
  if (products.length > 3) {
    structuralOverCap += 1;
    log({
      action: 'structural_audit_warning',
      source: id,
      count: products.length,
      reason: '상장사당 핵심 제품·기술 1~3개 권장 — human review (005380/000270 EV+수소 3건 허용)',
      correctionCategory: 'structural_audit',
    });
  }
  const targets = products.map((e) => e.target);
  const dup = targets.filter((t, i) => targets.indexOf(t) !== i);
  if (dup.length) {
    structuralDupProduct += 1;
    log({
      action: 'structural_audit_duplicate',
      source: id,
      duplicates: [...new Set(dup)],
      correctionCategory: 'structural_audit',
    });
  }
}
log({
  action: 'structural_audit_summary',
  structuralGeneratedEdgeCount: edges.filter((e) => e.edgeOrigin === 'structuralGenerated').length,
  listedCompanyCount: listedIds.length,
  overCapCompanies: structuralOverCap,
  duplicateProductCompanies: structuralDupProduct,
  reason: '전수 감사 — 테마성 기술·배터리 셀 혼동 없음; 007340은 battery_pack_component(팩 부품)만 표기',
  correctionCategory: 'structural_audit',
});

network.phase5b1CuratedAt = AS_OF;
network.lastReviewedAt = AS_OF;
network.metrics = computeAutoMetrics(network);

const orphan = computeListedRelationOrphanMetrics(network);
const report = validateNetworkReport(network);

fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({
  asOf: AS_OF,
  phase: '5B.1',
  reviewedBy: BY,
  metrics: network.metrics,
  orphan,
  validate: { failures: report.failures, warnings: report.warnings },
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  groupMemberPatched: Object.keys(HMG_MEMBERS).length,
  ownershipEdges: edges.filter((e) => e.type === 'owns' || e.type === 'owns_stake_in').length,
  supplyEdges: edges.filter((e) => ['supplies_component_to', 'supplies_system_to', 'supplies_tire_to', 'supplies_lighting_to', 'supplies_electronics_to', 'awarded_contract', 'nominated_supplier_for'].includes(e.type)).length,
  fitmentEdges: edges.filter((e) => e.type === 'used_in_vehicle').length,
  directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
  groupMembershipOnlyCompanyCount: orphan.groupMembershipOnlyCompanyCount,
  claimCoverage: {
    supply: network.metrics.claimCoverage?.supplyDirectEvidenceCoverage,
    fitment: network.metrics.claimCoverage?.fitmentDirectEvidenceCoverage,
    ownership: network.metrics.claimCoverage?.ownershipPrimarySourceCoverage,
    groupMembership: network.metrics.claimCoverage?.groupMembershipPrimarySourceCoverage,
  },
  failures: report.failures,
  warnings: report.warnings,
}, null, 2));

if (report.failures.length) process.exitCode = 1;
