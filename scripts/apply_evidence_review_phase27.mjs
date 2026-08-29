/**
 * Phase 2.7 — evidence review, warning cleanup, confirmed promotion (strict).
 * Run: node scripts/apply_evidence_review_phase27.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWED_AT = '2026-08-22';
const REVIEWED_BY = 'editorial_manual_review';

/** @type {Array<object>} */
const changes = [];

const WEAK_URL = [
  /^https?:\/\/[^/?#]+\/?$/,
  /\/products?\/?$/i,
  /\/product\//i,
  /\/foundry\/?$/i,
  /news\.skhynix\.com/i,
  /semiconductor\.samsung\.com/i,
  /cloud\.google\.com/i,
  /\/about-ti\//i,
  /\/electronics-industrial\.html/i,
  /\/en\/pr\/press\/?$/i,
];

function isWeakUrl(url) {
  return WEAK_URL.some((re) => re.test(url || ''));
}

function load(name) {
  const fp = join(ROOT, 'data', 'networks', `${name}.json`);
  return { fp, network: JSON.parse(fs.readFileSync(fp, 'utf8')) };
}

function save(fp, network) {
  fs.writeFileSync(fp, JSON.stringify(network, null, 2) + '\n', 'utf8');
}

function log(edge, before, after, reason, extra = {}) {
  changes.push({
    edgeId: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    before,
    after,
    reason,
    ...extra,
  });
}

function reviewedEv(fields) {
  return {
    reviewStatus: 'reviewed',
    reviewedAt: REVIEWED_AT,
    reviewedBy: REVIEWED_BY,
    accessedAt: REVIEWED_AT,
    ...fields,
  };
}

function reviewSemiconductorWarnings() {
  const { fp, network } = load('semiconductor');

  for (const edge of network.edges) {
    const url = edge.evidence?.[0]?.url || '';

    if (edge.id.startsWith('hub-') && edge.status === 'reported' && url.includes('Supplier%20List')) {
      edge.status = 'reference';
      edge.confidence = 'low';
      log(edge, 'reported', 'reference', '삼성 공급사 PDF는 그룹 수준 참고 — 특정 멤버사 거래 아님', { evidenceUrl: url });
      continue;
    }

    // Hub aggregate / homepage-only → reference (clears transactional weak-URL warning)
    if (edge.id.startsWith('hub-') && edge.status === 'reported' && isWeakUrl(url)) {
      const before = edge.status;
      edge.status = 'reference';
      edge.confidence = 'low';
      for (const ev of edge.evidence || []) {
        ev.reviewStatus = 'needs_human_review';
        ev.directEvidence = false;
        ev.evidenceSummaryKo = ev.evidenceSummaryKo || '밸류체인 그룹 수준 참고 연결 — 특정 거래·계약 직접 입증 아님';
        ev.relationshipSupported = ev.relationshipSupported || '산업 밸류체인 참고(특정 상대 미입증)';
      }
      edge.reviewStatus = 'needs_human_review';
      log(edge, before, 'reference', '홈페이지·뉴스룸 URL — hub 집계 관계는 reference로 강등', { evidenceUrl: url });
    }
  }

  // Hanmi → SK hynix DART contract (Jan 2025, ended 2025-07-01 per disclosure)
  const hanmiId = 'krx:042700';
  const hynixId = ['anchor:000660', 'krx:000660', 'global:skhynix_d'].find((id) =>
    network.nodes.some((n) => n.id === id));
  if (hynixId && network.nodes.some((n) => n.id === hanmiId)) {
    let hanmi = network.edges.find((e) => e.id === 'trade-hanmi-hynix-tcbonder-2025');
    if (!hanmi) {
      hanmi = {
        id: 'trade-hanmi-hynix-tcbonder-2025',
        source: hanmiId,
        target: hynixId,
        type: 'supplies_to',
        direction: 'source_to_target',
        status: 'reported',
        labelKo: 'TC 본더(후공정 장비) 공급',
        labelEn: 'TC bonder (back-end equipment) supply',
        evidence: [],
        confidence: 'high',
        lastVerifiedAt: REVIEWED_AT,
      };
      network.edges.push(hanmi);
      log(hanmi, '(none)', 'reported', 'DART 단일판매·공급계약 — bilateral edge 추가', {});
    }
    hanmi.target = hynixId.startsWith('anchor:') ? hynixId : 'anchor:000660';
    hanmi.type = 'equipment_for';
    hanmi.status = 'ended';
    hanmi.defaultHidden = true;
    hanmi.validTo = '2025-07-01';
    hanmi.labelKo = 'TC 본더(후공정 장비) 공급 — 계약 종료(2025.07.01)';
    hanmi.labelEn = 'TC bonder supply — contract ended (2025-07-01)';
    hanmi.reviewStatus = 'reviewed';
    hanmi.reviewedAt = REVIEWED_AT;
    hanmi.reviewedBy = REVIEWED_BY;
    hanmi.evidence = [reviewedEv({
      sourceType: 'dart',
      title: '한미반도체 단일판매·공급계약체결',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250114800153',
      publishedAt: '2025-01-14',
      directEvidence: true,
      evidenceSummaryKo: 'DART 공시(2025.01.14): SK하이닉스에 HBM용 TC 본더 공급 계약. 계약금 약 108억원, 계약기간 ~2025.07.01.',
      evidenceSummaryEn: 'DART filing (2025-01-14): TC bonder supply to SK hynix, ~10.8B KRW, term through 2025-07-01.',
      quotedFactKo: '공시 유형: 단일판매·공급계약체결. 계약 상대: SK하이닉스. 품목: TC 본더(HBM 후공정).',
      relationshipSupported: '한미반도체(042700) → SK하이닉스(000660) TC 본더 equipment_for',
    })];
    log(hanmi, 'reported', 'ended', 'DART 원문 확인 — 계약기간 2025.07.01 종료, confirmed 아님(만료)', {
      evidenceUrl: hanmi.evidence[0].url,
    });
  }

  network.lastReviewedAt = REVIEWED_AT;
  save(fp, network);
  return validateNetworkReport(network);
}

function reviewHoldings() {
  const { fp, network } = load('holdings');
  const edge = network.edges.find((e) => e.id === 'controls-sk-sksquare');
  if (edge) {
    const beforeType = edge.type;
    const beforeStatus = edge.status;
    edge.type = 'owns';
    edge.status = 'reported';
    edge.stakePct = 32.16;
    edge.asOf = '2025-12-31';
    edge.labelKo = 'SK(주) 지분 보유';
    edge.labelEn = 'SK Inc. equity stake';
    edge.reviewStatus = 'reviewed';
    edge.reviewedAt = REVIEWED_AT;
    edge.reviewedBy = REVIEWED_BY;
    edge.evidence = [reviewedEv({
      sourceType: 'dart',
      title: 'SK스퀘어 사업보고서 — 최대주주 SK(주) 32.16%',
      url: 'https://kind.krx.co.kr/external/2024/05/31/000228/20240531000414/99667.htm',
      publishedAt: '2025-12-31',
      directEvidence: true,
      evidenceSummaryKo: 'SK스퀘어 사업보고서 최대주주: SK(주) 32.16% — 지배(50%+) 아님, 지분 보유(owns).',
      evidenceSummaryEn: 'SK Square annual report: SK Inc. largest shareholder at 32.16% — ownership, not control.',
      quotedFactKo: '최대주주 SK(주) 지분율 32.16% (2025 사업보고서 기준).',
      relationshipSupported: 'SK(034730) → SK스퀘어(402340) 지분 32.16% 보유',
    })];
    log(edge, `${beforeStatus}/${beforeType}`, 'reported/owns', '지배 미확인 — 최대주주 지분 32.16% owns로 교정', {
      evidenceUrl: edge.evidence[0].url,
    });
  }

  network.lastReviewedAt = REVIEWED_AT;
  save(fp, network);
  return validateNetworkReport(network);
}

function reviewDefense() {
  const { fp, network } = load('defense');

  const updates = [
    {
      id: 'prime-kf21-kai',
      type: 'joint_development',
      status: 'reported',
      labelKo: 'KF-21 Boramae 개발·생산',
      labelEn: 'KF-21 Boramae development',
      reason: '제품 PDF는 개발·생산 사실만 입증 — prime_contractor(체계개발 주관) 별도 공식 문서 필요',
      relationshipSupported: '한국항공우주 KF-21 Boramae 개발·생산 참여(제품 자료)',
    },
    {
      id: 'prime-k9-rotem',
      type: 'manufactures',
      status: 'reported',
      labelKo: 'K9 자주포 제조·공급',
      labelEn: 'K9 self-propelled howitzer manufacture',
      reason: '제품 소개 페이지는 제조·공급 사실만 입증 — prime_contractor 아님, manufactures로 교정',
      relationshipSupported: '현대로템 K9 자주포 제조(제품 페이지)',
    },
    {
      id: 'sub-cheongung-lig',
      type: 'subsystem_supplier',
      status: 'reported',
      labelKo: '천궁·방공 무기체계',
      labelEn: 'Cheongung air defense systems',
      reason: '사업 페이지 — 방공 체계 참여 수준, 계약 문서 미확인',
      relationshipSupported: 'LIG넥스원 방공·대공 미사일 사업(제품·사업 페이지)',
    },
  ];

  for (const u of updates) {
    const edge = network.edges.find((e) => e.id === u.id);
    if (!edge) continue;
    const before = `${edge.status}/${edge.type}`;
    edge.type = u.type;
    edge.status = u.status;
    if (u.type === 'joint_development') edge.direction = 'undirected';
    edge.labelKo = u.labelKo;
    edge.labelEn = u.labelEn;
    edge.reviewStatus = 'needs_human_review';
    for (const ev of edge.evidence || []) {
      ev.directEvidence = false;
      ev.reviewStatus = 'needs_human_review';
      ev.relationshipSupported = u.relationshipSupported;
    }
    log(edge, before, `${u.status}/${u.type}`, u.reason, { evidenceUrl: edge.evidence?.[0]?.url });
  }

  network.lastReviewedAt = REVIEWED_AT;
  save(fp, network);
  return validateNetworkReport(network);
}

function reviewBio() {
  const { fp, network } = load('bio');
  const edge = network.edges.find((e) => e.id === 'bio-sk-gsk-covid19');
  if (edge) {
    const before = `${edge.status}/${edge.type}`;
    edge.type = 'clinical_collaboration';
    edge.status = 'confirmed';
    edge.labelKo = 'GBP510+AS03 백신 후보 Phase 3 임상 협력';
    edge.labelEn = 'GBP510+AS03 vaccine candidate Phase 3 collaboration';
    edge.agreementStatus = 'historical';
    edge.reviewStatus = 'reviewed';
    edge.reviewedAt = REVIEWED_AT;
    edge.reviewedBy = REVIEWED_BY;
    edge.evidence = [reviewedEv({
      sourceType: 'official',
      title: 'SK bioscience and GSK start Phase 3 trial of adjuvanted COVID-19 vaccine candidate',
      url: 'https://us.gsk.com/en-us/media/press-releases/sk-bioscience-and-gsk-start-phase-3-trial-of-adjuvanted-covid-19-vaccine-candidate/',
      publishedAt: '2021-08-31',
      directEvidence: true,
      evidenceSummaryKo: 'GSK 공식 보도(2021.08.31): SK바이오사이언스 GBP510 + GSK AS03 보조제 Phase 3 임상 공동 착수.',
      evidenceSummaryEn: 'GSK press release (2021-08-31): SK bioscience and GSK initiate Phase 3 for GBP510 with GSK adjuvant.',
      quotedFactKo: 'SK bioscience and GSK announced Phase 3 of GBP510 with GSK pandemic adjuvant.',
      relationshipSupported: 'SK바이오사이언스–GSK GBP510 백신 후보 Phase 3 임상 협력',
    })];
    edge.noteKo = '2021년 COVID-19 백신 후보 임상 협력. co_develops(공동개발)보다 임상 협력에 가깝습니다.';
    edge.noteEn = '2021 COVID-19 vaccine candidate trial collaboration; clinical_collaboration, not product co-development.';
    log(edge, before, 'confirmed/clinical_collaboration', 'GSK 공식 보도자료 원문 확인 — confirmed 승격', {
      evidenceUrl: edge.evidence[0].url,
    });
  }

  network.lastReviewedAt = REVIEWED_AT;
  save(fp, network);
  return validateNetworkReport(network);
}

console.log('Phase 2.7 evidence review\n');

for (const [name, fn] of [
  ['semiconductor', reviewSemiconductorWarnings],
  ['holdings', reviewHoldings],
  ['defense', reviewDefense],
  ['bio', reviewBio],
]) {
  const { summary, failures, warnings } = fn();
  console.log(`${name}: confirmed=${summary.statusCounts?.confirmed || 0} warnings=${warnings.length} failures=${failures.length}`);
  console.log(`  direct=${summary.directEvidenceCoverage}% primary=${summary.primarySourceCoverage}%`);
}

const out = join(ROOT, 'data', 'evidence_review_phase27_changelog.json');
fs.writeFileSync(out, JSON.stringify({ reviewedAt: REVIEWED_AT, changes }, null, 2) + '\n', 'utf8');
console.log(`\nWrote ${out} (${changes.length} changes)`);
