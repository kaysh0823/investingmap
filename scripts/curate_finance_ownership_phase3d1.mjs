/**
 * Phase 3D.1 — Curate finance owns (9) + group_member (12) with primary sources.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NET = join(ROOT, 'data', 'networks', 'finance.json');
const LOG = join(ROOT, 'data', 'finance_relation_phase3d1_ownership_curation.json');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review';

const network = JSON.parse(fs.readFileSync(NET, 'utf8'));
const changes = [];

function mkEv(p) {
  return {
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    accessedAt: AS_OF,
    directEvidence: true,
    sourceType: p.sourceType,
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt,
    evidenceSummaryKo: p.evidenceSummaryKo,
    evidenceSummaryEn: p.evidenceSummaryEn,
    quotedFactKo: p.quotedFactKo,
    relationshipSupported: p.relationshipSupported,
    ...(p.evidenceUsageType ? { evidenceUsageType: p.evidenceUsageType } : {}),
    ...(p.evidenceScope ? { evidenceScope: p.evidenceScope } : {}),
  };
}

function patch(id, fields, reason) {
  const e = network.edges.find((x) => x.id === id);
  if (!e) {
    changes.push({ edgeId: id, missing: true, reason });
    return;
  }
  const before = {
    type: e.type, status: e.status, stakePct: e.stakePct ?? null,
    asOf: e.asOf ?? null, defaultHidden: !!e.defaultHidden,
  };
  Object.assign(e, fields, {
    lastVerifiedAt: AS_OF,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    edgeOrigin: e.edgeOrigin || 'manuallyCurated',
  });
  changes.push({
    edgeId: id, source: e.source, target: e.target, before,
    after: {
      type: e.type, status: e.status, stakePct: e.stakePct ?? null,
      asOf: e.asOf ?? null, defaultHidden: !!e.defaultHidden,
    },
    reason,
  });
}

const baseOwns = {
  ownershipKind: 'direct',
  defaultHidden: false,
  confidence: 'high',
};

patch('owns-105560-kr-kb_kookmin_bank', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2025-12-31',
  sourceDocumentDate: '2025-12-31',
  labelKo: 'KB국민은행 완전자회사 (100%)',
  labelEn: 'Wholly owned: KB Kookmin Bank (100%)',
  noteKo: 'KB금융지주 Form 20-F 종속기업 현황: Kookmin Bank 100.00% 직접 보유.',
  noteEn: 'KB Financial Group Form 20-F: Kookmin Bank 100.00% direct ownership.',
  evidence: [mkEv({
    sourceType: 'sec',
    title: 'KB Financial Group Form 20-F — Kookmin Bank 100.00%',
    url: 'https://www.sec.gov/Archives/edgar/data/1445930/000119312526183398/R93.htm',
    publishedAt: '2025-12-31',
    evidenceSummaryKo: '20-F 종속기업 표: Kookmin Bank 지분 100.00%.',
    evidenceSummaryEn: '20-F subsidiary table: Kookmin Bank ownership 100.00%.',
    quotedFactKo: 'Kookmin Bank — 100.00',
    relationshipSupported: 'krx:105560 owns kr:kb_kookmin_bank at 100%',
  })],
}, 'KB→Kookmin Bank');

patch('owns-105560-kr-kb_securities', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2025-12-31',
  sourceDocumentDate: '2025-12-31',
  labelKo: 'KB증권 완전자회사 (100%)',
  labelEn: 'Wholly owned: KB Securities (100%)',
  noteKo: 'KB금융지주 Form 20-F: KB Securities 100.00% 직접 보유.',
  noteEn: 'KB Financial Group Form 20-F: KB Securities 100.00%.',
  evidence: [mkEv({
    sourceType: 'sec',
    title: 'KB Financial Group Form 20-F — KB Securities 100.00%',
    url: 'https://www.sec.gov/Archives/edgar/data/1445930/000119312526183398/R93.htm',
    publishedAt: '2025-12-31',
    evidenceSummaryKo: '20-F 종속기업 표: KB Securities Co., Ltd. 100.00%.',
    evidenceSummaryEn: '20-F subsidiary table: KB Securities 100.00%.',
    quotedFactKo: 'KB Securities Co., Ltd. — 100.00',
    relationshipSupported: 'krx:105560 owns kr:kb_securities at 100%',
  })],
}, 'KB→KB Securities');

patch('owns-055550-kr-shinhan_bank', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2024-12-31',
  sourceDocumentDate: '2024-12-31',
  labelKo: '신한은행 완전자회사 (100%)',
  labelEn: 'Wholly owned: Shinhan Bank (100%)',
  noteKo: '신한금융지주 Form 6-K: Shinhan Bank 100.0%.',
  noteEn: 'Shinhan Financial Group Form 6-K: Shinhan Bank 100.0%.',
  evidence: [mkEv({
    sourceType: 'sec',
    title: 'Shinhan Financial Group Form 6-K — Shinhan Bank 100.0%',
    url: 'https://www.sec.gov/Archives/edgar/data/1263043/000095017025040736/form-6-k-250318.htm',
    publishedAt: '2025-03-18',
    evidenceSummaryKo: 'Form 6-K Ownership by SFG: Shinhan Bank 100.0%.',
    evidenceSummaryEn: 'Form 6-K Ownership by SFG: Shinhan Bank 100.0%.',
    quotedFactKo: 'Shinhan Bank | 100.0%',
    relationshipSupported: 'krx:055550 owns kr:shinhan_bank at 100%',
  })],
}, 'Shinhan→Bank');

patch('owns-055550-kr-shinhan_investment', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2024-12-31',
  sourceDocumentDate: '2024-12-31',
  labelKo: '신한투자증권 완전자회사 (100%)',
  labelEn: 'Wholly owned: Shinhan Securities (100%)',
  noteKo: '신한금융지주 Form 6-K: Shinhan Securities 100.0%.',
  noteEn: 'Shinhan Financial Group Form 6-K: Shinhan Securities 100.0%.',
  evidence: [mkEv({
    sourceType: 'sec',
    title: 'Shinhan Financial Group Form 6-K — Shinhan Securities 100.0%',
    url: 'https://www.sec.gov/Archives/edgar/data/1263043/000095017025040736/form-6-k-250318.htm',
    publishedAt: '2025-03-18',
    evidenceSummaryKo: 'Form 6-K Ownership by SFG: Shinhan Securities 100.0%.',
    evidenceSummaryEn: 'Form 6-K Ownership by SFG: Shinhan Securities 100.0%.',
    quotedFactKo: 'Shinhan Securities | 100.0%',
    relationshipSupported: 'krx:055550 owns kr:shinhan_investment at 100%',
  })],
}, 'Shinhan→Securities');

patch('owns-086790-kr-hana_bank', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2024-12-31',
  sourceDocumentDate: '2024-12-31',
  labelKo: '하나은행 완전자회사 (100%)',
  labelEn: 'Wholly owned: Hana Bank (100%)',
  noteKo: '하나금융지주 연결공시: Hana Bank ownership 100.0% (2024-12-31).',
  noteEn: 'Hana Financial Group disclosure: Hana Bank 100.0% as of 2024-12-31.',
  evidence: [mkEv({
    sourceType: 'company',
    title: 'Hana Financial Group subsidiary disclosure — Hana Bank 100.0%',
    url: 'https://www.kebhana.de/mediathek/pub/disclosure/Hana_Disclosure_2024.pdf',
    publishedAt: '2024-12-31',
    evidenceSummaryKo: '종속기업 표: Hana Bank Ownership 100.0 (Dec 31, 2024).',
    evidenceSummaryEn: 'Subsidiary schedule: Hana Bank ownership 100.0 as of Dec 31, 2024.',
    quotedFactKo: 'Hana Bank … Ownership (%) 100.0 … December 31, 2024',
    relationshipSupported: 'krx:086790 owns kr:hana_bank at 100%',
  })],
}, 'Hana→Bank');

patch('owns-086790-kr-hana_securities', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2024-12-31',
  sourceDocumentDate: '2024-12-31',
  labelKo: '하나증권 완전자회사 (100%)',
  labelEn: 'Wholly owned: Hana Securities (100%)',
  noteKo: '하나금융지주 연결공시: Hana Securities ownership 100.0% (2024-12-31).',
  noteEn: 'Hana Financial Group disclosure: Hana Securities 100.0% as of 2024-12-31.',
  evidence: [mkEv({
    sourceType: 'company',
    title: 'Hana Financial Group subsidiary disclosure — Hana Securities 100.0%',
    url: 'https://www.kebhana.de/mediathek/pub/disclosure/Hana_Disclosure_2024.pdf',
    publishedAt: '2024-12-31',
    evidenceSummaryKo: '종속기업 표: Hana Securities Ownership 100.0.',
    evidenceSummaryEn: 'Subsidiary schedule: Hana Securities ownership 100.0.',
    quotedFactKo: 'Hana Securities … Ownership (%) 100.0 … December 31, 2024',
    relationshipSupported: 'krx:086790 owns kr:hana_securities at 100%',
  })],
}, 'Hana→Securities');

patch('owns-316140-kr-woori_bank', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2024-12-31',
  sourceDocumentDate: '2024-12-31',
  labelKo: '우리은행 완전자회사 (100%)',
  labelEn: 'Wholly owned: Woori Bank (100%)',
  noteKo: '우리금융지주 Form 20-F: Woori Bank는 wholly-owned subsidiary.',
  noteEn: 'Woori Financial Group Form 20-F: Woori Bank is a wholly-owned subsidiary.',
  evidence: [mkEv({
    sourceType: 'sec',
    title: 'Woori Financial Group Form 20-F — Woori Bank wholly-owned',
    url: 'https://www.sec.gov/Archives/edgar/data/1264136/000119312525098257/d921487d20f.htm',
    publishedAt: '2025-04-25',
    evidenceSummaryKo: '20-F: 포괄적 주식이전 후 Woori Bank wholly-owned subsidiary.',
    evidenceSummaryEn: '20-F: Woori Bank is a wholly-owned subsidiary after stock transfer.',
    quotedFactKo: 'Woori Bank … wholly-owned subsidiaries',
    relationshipSupported: 'krx:316140 owns kr:woori_bank at 100%',
  })],
}, 'Woori→Bank');

patch('owns-138040-kr-meritz_fire', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2025-12-31',
  sourceDocumentDate: '2025-12-31',
  labelKo: '메리츠화재 완전자회사 (100%)',
  labelEn: 'Wholly owned: Meritz Fire (100%)',
  noteKo: '메리츠금융지주 현황: 자회사 메리츠화재 출자비율 100.00%. 2023.02 포괄적 주식교환.',
  noteEn: 'Meritz holding status: Meritz Fire ownership 100.00%; wholly owned after Feb 2023 stock swap.',
  evidence: [mkEv({
    sourceType: 'company',
    title: '메리츠금융지주 현황 — 메리츠화재 출자비율 100.00%',
    url: 'https://m.meritzgroup.com/commfiles/hld/attach/2026/20260331/202603311717578640001U.pdf',
    publishedAt: '2025-12-31',
    evidenceSummaryKo: '자회사 현황표: 메리츠화재 출자비율 100.00.',
    evidenceSummaryEn: 'Subsidiary status table: Meritz Fire ownership ratio 100.00.',
    quotedFactKo: '메리츠화재 … 100.00',
    relationshipSupported: 'krx:138040 owns kr:meritz_fire at 100%',
  })],
}, 'Meritz→Fire');

patch('owns-071050-kr-korea_investment_securities', {
  ...baseOwns,
  status: 'confirmed',
  stakePct: 100,
  votingRightsPct: 100,
  asOf: '2026-03-31',
  sourceDocumentDate: '2026-05-15',
  labelKo: '한국투자증권 완전자회사 (100%)',
  labelEn: 'Wholly owned: Korea Investment & Securities (100%)',
  noteKo: '한국금융지주 2026.1Q 분기보고서 종속기업 현황: 한국투자증권㈜ 지분율·의결권 100.00%. 최신 반기보고서 DART rcpNo=20260814002697.',
  noteEn: 'Korea Investment Holdings 1Q 2026 quarterly report: Korea Investment & Securities 100.00% ownership/voting. Latest half-year DART rcpNo=20260814002697.',
  evidence: [
    mkEv({
      sourceType: 'krx_kind',
      title: '한국금융지주 분기보고서(2026.05.15) — 한국투자증권㈜ 지분율 100.00%',
      url: 'https://kind.krx.co.kr/external/2026/05/15/002470/20260515005563/11013.htm',
      publishedAt: '2026-05-15',
      evidenceSummaryKo: '종속기업 현황표: 한국투자증권㈜ 지분율 100.00, 의결권비율 100.00 (기준 2026-03-31).',
      evidenceSummaryEn: 'Subsidiary status table: Korea Investment & Securities ownership 100.00% and voting rights 100.00% as of 2026-03-31.',
      quotedFactKo: '한국투자증권㈜ | 100.00 | … | 100.00',
      relationshipSupported: 'krx:071050 owns kr:korea_investment_securities at 100%',
    }),
    mkEv({
      sourceType: 'dart',
      title: '한국금융지주/반기보고서/2026.08.14 (rcpNo=20260814002697)',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814002697',
      publishedAt: '2026-08-14',
      evidenceSummaryKo: '동일 발행사 최신 반기보고서(2026.06 결산). 지분율 표는 1Q KIND 본문으로 교차확인.',
      evidenceSummaryEn: 'Same issuer latest half-year report (period ended 2026-06). Stake table cross-checked via 1Q KIND HTML.',
      quotedFactKo: '한국금융지주 반기보고서 2026.08.14',
      relationshipSupported: 'krx:071050 owns kr:korea_investment_securities (issuer continuity)',
    }),
  ],
}, 'Korea Investment→KIS');

const FTC = 'https://www.ftc.go.kr/www/selectBbsNttView.do?key=12&bordCd=3&nttSn=46053';
const GROUP = {
  'group:samsung': { ko: '삼성', en: 'Samsung' },
  'group:hanwha': { ko: '한화', en: 'Hanwha' },
  'group:hyundai_motor': { ko: '현대자동차', en: 'Hyundai Motor' },
  'group:nonghyup': { ko: '농협', en: 'Nonghyup' },
  'group:mirae_asset': { ko: '미래에셋', en: 'Mirae Asset' },
};

for (const e of network.edges.filter((x) => x.type === 'group_member')) {
  const g = GROUP[e.target];
  if (!g) {
    patch(e.id, {
      status: 'reference', defaultHidden: true, stakePct: null,
      noteKo: '기업집단 매핑 미검증', noteEn: 'Unverified group mapping', evidence: [],
    }, 'unknown group');
    continue;
  }
  const maps = e.source === 'krx:094800';
  patch(e.id, {
    status: 'reported',
    stakePct: null,
    votingRightsPct: null,
    asOf: '2025-05-01',
    sourceDocumentDate: '2025-05-01',
    defaultHidden: false,
    confidence: 'high',
    labelKo: `${g.ko} 기업집단 소속`,
    labelEn: `${g.en} group membership`,
    noteKo: maps
      ? '공정위 공시대상기업집단(미래에셋) 소속. 직접 지분 아님. REIT 스폰서 구조는 별도 확인.'
      : '공정위 공시대상기업집단 소속. 직접 지분·지배(owns)를 의미하지 않음.',
    noteEn: maps
      ? 'FTC Mirae Asset group affiliation only — not ownership.'
      : 'FTC designated group membership only — not ownership.',
    evidence: [mkEv({
      sourceType: 'regulator',
      title: `공정거래위원회 2025 공시대상기업집단 지정 (${g.ko})`,
      url: FTC,
      publishedAt: '2025-05-01',
      evidenceSummaryKo: `2025.5.1 공정위 지정 명부에 ${g.ko} 포함. group_member만 표시(owns 아님).`,
      evidenceSummaryEn: `FTC 2025-05-01 designation roster includes ${g.en}. group_member only (not owns).`,
      quotedFactKo: '공시대상기업집단으로 지정･통지',
      relationshipSupported: `${e.source} group_member of ${e.target}`,
      evidenceUsageType: 'official_roster',
      evidenceScope: 'multiple_entities',
    })],
  }, `group_member ${g.ko}`);
}

for (const e of network.edges) {
  if (e.type === 'owns' && (e.status === 'reference' || e.status === 'inferred')) e.defaultHidden = true;
  if (e.type === 'group_member') e.stakePct = null;
}

const edges = network.edges || [];
const owns = edges.filter((e) => ['owns', 'controls', 'equity_investment'].includes(e.type));
const gm = edges.filter((e) => e.type === 'group_member');
const orphan = computeListedRelationOrphanMetrics(network);
const listed = (network.nodes || []).filter((n) => n.type === 'listed_company' || n.isListedKorea);
const touched = new Set();
for (const e of owns) { touched.add(e.source); touched.add(e.target); }
const primaryRe = /sec\.gov|dart\.fss|ftc\.go\.kr|kind\.krx|opendart|meritzgroup|kebhana\.de/i;
const ownPrimary = owns.filter((e) => (e.evidence || []).some((ev) => primaryRe.test(String(ev.url || '')))).length;
const ownDirect = owns.filter((e) => (e.evidence || []).some((ev) => ev.directEvidence === true)).length;
const gmPrimary = gm.filter((e) => (e.evidence || []).some((ev) => /ftc\.go\.kr/i.test(String(ev.url || '')))).length;

network.metrics = {
  ...(network.metrics || {}),
  ownershipEdgeCount: owns.length,
  confirmedOwnershipEdgeCount: owns.filter((e) => e.status === 'confirmed').length,
  reportedOwnershipEdgeCount: owns.filter((e) => e.status === 'reported').length,
  inferredOwnershipEdgeCount: owns.filter((e) => e.status === 'inferred' || e.status === 'reference').length,
  ownershipWithStakePctCount: owns.filter((e) => e.stakePct != null).length,
  ownershipWithAsOfCount: owns.filter((e) => e.asOf).length,
  ownershipDirectEvidenceCoverage: owns.length ? Math.round((1000 * ownDirect) / owns.length) / 10 : 0,
  ownershipPrimarySourceCoverage: owns.length ? Math.round((1000 * ownPrimary) / owns.length) / 10 : 0,
  directOwnershipCount: owns.filter((e) => e.ownershipKind === 'direct').length,
  indirectOwnershipCount: owns.filter((e) => e.ownershipKind === 'indirect').length,
  groupMembershipEdgeCount: gm.length,
  confirmedGroupMembershipCount: gm.filter((e) => e.status === 'confirmed').length,
  reportedGroupMembershipCount: gm.filter((e) => e.status === 'reported').length,
  groupMembershipPrimarySourceCoverage: gm.length ? Math.round((1000 * gmPrimary) / gm.length) / 10 : 0,
  listedCompanyOwnershipOrphanCount: listed.filter((n) => !touched.has(n.id)).length,
  classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
  confirmedBusinessEdgeCount: edges.filter((e) => e.status === 'confirmed').length,
  reportedBusinessEdgeCount: edges.filter((e) => e.status === 'reported').length,
  phase3d1CuratedAt: AS_OF,
};
network.lastReviewedAt = AS_OF;

const report = validateNetworkReport(network);
fs.writeFileSync(NET, JSON.stringify(network, null, 2));
fs.writeFileSync(LOG, JSON.stringify({
  curatedAt: AS_OF, changes, metrics: network.metrics,
  statusCounts: report.summary.statusCounts,
  typeCounts: report.summary.typeCounts,
  validateFailures: report.failures,
  validateWarnings: report.warnings,
}, null, 2));

console.log(JSON.stringify({
  changeCount: changes.filter((c) => !c.missing).length,
  missing: changes.filter((c) => c.missing).map((c) => c.edgeId),
  metrics: network.metrics,
  statusCounts: report.summary.statusCounts,
  failures: report.failures,
  warnings: report.warnings.slice(0, 20),
}, null, 2));
if (report.failures.length) process.exitCode = 1;
