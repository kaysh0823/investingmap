/**
 * Phase 2.6 — evidence review: demote unverified confirmed, enrich reviewed edges.
 * Run: node scripts/apply_evidence_review_phase26.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWED_AT = '2026-08-22';
const REVIEWED_BY = 'phase26_evidence_audit';

/** @type {Array<{edgeId:string,source:string,target:string,type:string,before:string,after:string,reason:string,evidenceUrl?:string}>} */
const changeLog = [];

function loadNetwork(name) {
  const fp = join(ROOT, 'data', 'networks', `${name}.json`);
  return { fp, network: JSON.parse(fs.readFileSync(fp, 'utf8')) };
}

function saveNetwork(fp, network) {
  fs.writeFileSync(fp, JSON.stringify(network, null, 2) + '\n', 'utf8');
}

function findEdge(network, id) {
  return network.edges.find((e) => e.id === id);
}

function logChange(edge, before, after, reason, evidenceUrl) {
  changeLog.push({
    edgeId: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    before,
    after,
    reason,
    evidenceUrl: evidenceUrl || edge.evidence?.[0]?.url,
  });
  edge.status = after;
}

const HOMEPAGE_PATTERNS = [
  /\/products?\/?$/i,
  /\/product\//i,
  /\/foundry\/?$/i,
  /\/semiconductor\.html/i,
  /\/supplyChain\.do/i,
  /\/en\/pr\/press\/?$/i,
  /ti\.com\/about-ti\//i,
  /\/electronics-industrial\.html/i,
  /\/electronics\.html/i,
  /dart\.fss\.or\.kr\/\/?$/,
  /ftc\.go\.kr\/www\/selectReport\.do\?key=/,
];

function isWeakUrl(url) {
  return HOMEPAGE_PATTERNS.some((re) => re.test(url || ''));
}

function reviewedEvidence(fields) {
  return {
    reviewStatus: 'reviewed',
    reviewedAt: REVIEWED_AT,
    reviewedBy: REVIEWED_BY,
    accessedAt: REVIEWED_AT,
    ...fields,
  };
}

// ── Semiconductor: demote all 17 confirmed ──
function reviewSemiconductor() {
  const { fp, network } = loadNetwork('semiconductor');
  const confirmedIds = network.edges.filter((e) => e.status === 'confirmed').map((e) => e.id);

  for (const id of confirmedIds) {
    const edge = findEdge(network, id);
    if (!edge) continue;
    const url = edge.evidence?.[0]?.url || '';
    let after = 'reported';
    let reason = 'confirmed 유지 조건 미충족(reviewStatus≠reviewed, directEvidence 미검증)';

    if (isWeakUrl(url) || /asml\.com|appliedmaterials|tel\.com|tsmc\.com|semiconductor\.samsung|dupont|henkel|ti\.com/i.test(url)) {
      after = 'reference';
      reason = '제품/사업 소개 페이지만 있어 특정 거래 상대·관계 유형 직접 입증 불가';
    } else if (url.includes('Supplier%20List') || url.includes('Supplier_List')) {
      after = 'reported';
      reason = '공급사 목록 PDF는 존재하나 밸류체인 그룹→고객 집계 관계로 특정 상장사 거래 직접 입증 불가';
    } else if (url.includes('Interim_Report') || url.includes('supplyChain')) {
      after = 'reference';
      reason = 'IR/공급망 포털 URL — 특정 거래 관계 문서 아님';
    }

    for (const ev of edge.evidence || []) {
      ev.reviewStatus = 'needs_human_review';
      ev.directEvidence = false;
      delete ev.reviewedAt;
      delete ev.reviewedBy;
    }
    edge.reviewStatus = 'needs_human_review';
    edge.confidence = after === 'reference' ? 'low' : 'medium';
    logChange(edge, 'confirmed', after, reason);
  }

  // Add Hanmi→SK hynix from DART (priority review) — reported with enriched evidence
  const hanmiId = 'krx:042700';
  const hynixId = ['anchor:000660', 'krx:000660', 'global:skhynix_d'].find((id) =>
    network.nodes.some((n) => n.id === id));
  if (network.nodes.some((n) => n.id === hanmiId) && hynixId) {
    const existing = network.edges.find((e) =>
      (e.source === hanmiId && (e.target === hynixId || e.target === 'anchor:000660')) ||
      (e.target === hanmiId && e.source === hynixId));
    if (!existing) {
      network.edges.push({
        id: 'trade-hanmi-hynix-tcbonder-2025',
        source: hanmiId,
        target: hynixId.startsWith('anchor:') ? hynixId : 'anchor:000660',
        type: 'supplies_to',
        direction: 'source_to_target',
        status: 'reported',
        labelKo: 'TC 본더(후공정 장비) 공급',
        labelEn: 'TC bonder (back-end equipment) supply',
        evidence: [reviewedEvidence({
          sourceType: 'dart',
          title: '한미반도체 단일판매·공급계약체결 (DART)',
          url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250114800153',
          publishedAt: '2025-01-14',
          directEvidence: true,
          evidenceSummaryKo: 'DART 공시 유형이 단일판매·공급계약체결로, 한미반도체가 SK하이닉스에 장비 공급 계약을 공시함.',
          evidenceSummaryEn: 'DART filing type is single sales/supply contract; Hanmi disclosed equipment supply to SK hynix.',
          quotedFactKo: '공시 제목: 단일판매·공급계약체결(2025.01.14).',
          relationshipSupported: '한미반도체(042700) → SK하이닉스(000660) 장비 공급 계약',
        })],
        confidence: 'high',
        lastVerifiedAt: REVIEWED_AT,
        reviewStatus: 'reviewed',
        reviewedAt: REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
      });
      changeLog.push({
        edgeId: 'trade-hanmi-hynix-tcbonder-2025',
        source: hanmiId,
        target: hynixId,
        type: 'supplies_to',
        before: '(none)',
        after: 'reported',
        reason: 'DART 단일판매·공급계약 공시 확인 — confirmed 승격 전 추가 검토 필요',
        evidenceUrl: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250114800153',
      });
    }
  }

  network.asOf = REVIEWED_AT;
  network.lastReviewedAt = REVIEWED_AT;
  saveNetwork(fp, network);
  return validateNetworkReport(network);
}

function reviewHoldings() {
  const { fp, network } = loadNetwork('holdings');

  for (const edge of network.edges) {
    if (edge.type === 'group_member') {
      for (const ev of edge.evidence || []) {
        ev.reviewStatus = 'needs_human_review';
        ev.directEvidence = false;
        ev.evidenceSummaryKo = 'FTC 기업집단 포털 — 동일 그룹 소속 참고용, 지배·지분 아님';
        ev.relationshipSupported = '동일 기업집단 소속(참고)';
      }
    }
    if (edge.id === 'controls-sk-sksquare') {
      edge.status = 'reported';
      edge.stakePct = null;
      edge.evidence = [{
        ...reviewedEvidence({
          sourceType: 'dart',
          title: 'SK스퀘어 반기보고서 — 주주에 관한 사항',
          url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250814002335',
          publishedAt: '2025-08-14',
          directEvidence: false,
          evidenceSummaryKo: 'SK스퀘어 정기보고서에서 SK(주) 최대주주 지분 확인 필요 — 지배(controls) 직접 입증 미완',
          evidenceSummaryEn: 'SK Inc. stake in SK Square should be read from periodic report shareholder section; control not fully verified here.',
          quotedFactKo: 'SK스퀘어 반기보고서 Ⅶ. 주주에 관한 사항에서 SK(주) 지분율 확인 필요.',
          relationshipSupported: 'SK(주) → SK스퀘어 주주 관계(지분율 별도 확인)',
        }),
      }];
      edge.reviewStatus = 'needs_human_review';
      logChange(edge, edge.status, 'reported', 'DART 루트 URL → SK스퀘어 반기보고서로 교체, controls 직접 입증 미완');
    }
  }

  network.lastReviewedAt = REVIEWED_AT;
  saveNetwork(fp, network);
  return validateNetworkReport(network);
}

function reviewDefense() {
  const { fp, network } = loadNetwork('defense');
  const updates = {
    'prime-kf21-kai': {
      url: 'https://www.koreaaero.com/VIRTUAL_EX/PDF/FixedWing/01_Fixed_Wing_KF-21_Boramae.pdf',
      title: 'KAI KF-21 Boramae product PDF',
      publishedAt: '2024-01-01',
      summaryKo: 'KAI 공식 KF-21 보라매 PDF — 체계 개발 주관사 KAI 명시',
      supported: 'KAI(047810) KF-21 프로그램 주관',
    },
    'prime-k9-rotem': {
      url: 'https://www.hyundai-rotem.co.kr/Kor/Business/Defense/Product/K9',
      title: 'Hyundai Rotem K9 product page (KO)',
      publishedAt: '2024-01-01',
      summaryKo: '현대로템 K9 제품 페이지 — EN URL 404, KO 페이지로 교체',
      supported: '현대로템(064350) K9 체계 관련 (prime 공식 계약 문서 아님)',
    },
    'sub-cheongung-lig': {
      url: 'https://www.lignex1.com/kor/business/air-defense',
      title: 'LIG Nex1 air defense (KO)',
      publishedAt: '2024-01-01',
      summaryKo: 'LIG넥스원 방공 사업 페이지 — EN URL 404',
      supported: 'LIG넥스1(079550) 방공 무기체계 사업 (하위체계 공급 직접 입증 미완)',
    },
  };

  for (const [id, meta] of Object.entries(updates)) {
    const edge = findEdge(network, id);
    if (!edge) continue;
    edge.status = 'reported';
    edge.evidence = [{
      ...reviewedEvidence({
        sourceType: 'official',
        title: meta.title,
        url: meta.url,
        publishedAt: meta.publishedAt,
        directEvidence: false,
        evidenceSummaryKo: meta.summaryKo,
        evidenceSummaryEn: meta.summaryKo,
        quotedFactKo: meta.supported,
        relationshipSupported: meta.supported,
      }),
    }];
    edge.reviewStatus = 'needs_human_review';
    logChange(edge, 'reported', 'reported', `URL 교정·직접 입증 미완: ${meta.summaryKo}`, meta.url);
  }

  network.lastReviewedAt = REVIEWED_AT;
  saveNetwork(fp, network);
  return validateNetworkReport(network);
}

function reviewBio() {
  const { fp, network } = loadNetwork('bio');
  const edge = findEdge(network, 'bio-sk-gsk-covid19');
  if (edge) {
    edge.status = 'reported';
    edge.evidence = [{
      ...reviewedEvidence({
        sourceType: 'official',
        title: 'SK bioscience and GSK start Phase 3 trial of adjuvanted COVID-19 vaccine candidate',
        url: 'https://us.gsk.com/en-us/media/press-releases/sk-bioscience-and-gsk-start-phase-3-trial-of-adjuvanted-covid-19-vaccine-candidate/',
        publishedAt: '2021-08-31',
        directEvidence: true,
        evidenceSummaryKo: 'GSK 공식 보도자료에서 SK바이오사이언스와 GSK가 GBP510+AS03 백신 후보물 공동 Phase 3 착수를 발표.',
        evidenceSummaryEn: 'GSK press release announces SK bioscience and GSK Phase 3 start for GBP510 with GSK adjuvant.',
        quotedFactKo: 'SK bioscience and GSK announced initiation of Phase 3 clinical study of GBP510 with GSK pandemic adjuvant.',
        relationshipSupported: 'SK바이오사이언스–GSK 공동개발(co_develops) 협력',
      }),
    }];
    edge.reviewStatus = 'reviewed';
    edge.reviewedAt = REVIEWED_AT;
    edge.reviewedBy = REVIEWED_BY;
    logChange(edge, 'reported', 'reported', 'GSK 공식 보도자료 URL로 교체, co_develops 직접 입증', edge.evidence[0].url);
  }

  network.lastReviewedAt = REVIEWED_AT;
  saveNetwork(fp, network);
  return validateNetworkReport(network);
}

function main() {
  console.log('Phase 2.6 evidence review\n');
  const reports = {
    semiconductor: reviewSemiconductor(),
    holdings: reviewHoldings(),
    defense: reviewDefense(),
    bio: reviewBio(),
  };

  const logPath = join(ROOT, 'data', 'evidence_review_phase26_changelog.json');
  fs.writeFileSync(logPath, JSON.stringify({ reviewedAt: REVIEWED_AT, changes: changeLog }, null, 2) + '\n', 'utf8');

  console.log('=== Status changes ===');
  for (const c of changeLog) {
    console.log(`\n${c.edgeId}`);
    console.log(`  ${c.source} → ${c.target} (${c.type})`);
    console.log(`  ${c.before} → ${c.after}`);
    console.log(`  reason: ${c.reason}`);
    if (c.evidenceUrl) console.log(`  url: ${c.evidenceUrl}`);
  }

  console.log('\n=== Post-review metrics ===');
  for (const [sector, r] of Object.entries(reports)) {
    console.log(`${sector}: confirmed=${r.summary.statusCounts?.confirmed || 0} failures=${r.failures.length}`);
    console.log(`  evidenceField=${r.summary.evidenceFieldCoverage}% direct=${r.summary.directEvidenceCoverage}% primary=${r.summary.primarySourceCoverage}%`);
  }

  console.log(`\nWrote ${logPath}`);
  console.log(`Total changes: ${changeLog.length}`);
}

main();
