/**
 * Phase 3D-0 — demote ship reported edges that only cite company homepage URLs.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { aggregateEvidenceMetrics } from '../lib/relation_network/evidence_audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NET = join(ROOT, 'data', 'networks', 'ship.json');
const LOG = join(ROOT, 'data', 'ship_relation_phase3d0_reported_fix.json');
const AS_OF = '2026-08-23';

const network = JSON.parse(fs.readFileSync(NET, 'utf8'));
const changes = [];

function patch(id, fields, reason) {
  const e = network.edges.find((x) => x.id === id);
  if (!e) {
    changes.push({ edgeId: id, reason: 'missing edge — skipped', missing: true });
    return;
  }
  const before = { type: e.type, status: e.status, defaultHidden: !!e.defaultHidden };
  Object.assign(e, fields);
  changes.push({
    edgeId: id,
    source: e.source,
    target: e.target,
    beforeType: before.type,
    afterType: e.type,
    beforeStatus: before.status,
    afterStatus: e.status,
    reason,
  });
}

// Homepage-only ownership → reference (not reported)
patch('owns-009540-329180', {
  status: 'reference',
  defaultHidden: false,
  noteKo: '그룹 소개 페이지만으로는 reported 소유관계를 유지하지 않습니다. DART 출자현황 검토 필요.',
  noteEn: 'Homepage group overview is insufficient for reported ownership. Needs DART review.',
}, 'homepage-only owns → reference');

// HMM named contract without specific filing → inferred + hidden
patch('ordered-011200-contract-hmm-hhi', {
  status: 'inferred',
  defaultHidden: true,
  noteKo: '개별 발주·수주 공시 URL이 없어 실명 발주 관계를 inferred·기본 숨김으로 강등.',
  noteEn: 'No specific order filing URL; demoted to inferred (default hidden).',
}, 'HMM order without filing → inferred hidden');

patch('awarded-contract-hmm-hhi-329180', {
  status: 'inferred',
  defaultHidden: true,
  noteKo: '개별 수주 발표 원문 없음 → inferred·기본 숨김.',
  noteEn: 'No individual award filing → inferred hidden.',
}, 'HMM award without filing → inferred hidden');

// Undisclosed EU without individual contract document
patch('ordered-undisclosed-eu-shi-lng', {
  status: 'inferred',
  defaultHidden: true,
  noteKo: '개별 계약 문서 없이 익명 선주 reported 유지 금지.',
  noteEn: 'Anonymous counterparty without contract document cannot stay reported.',
}, 'anonymous EU order → inferred hidden');

patch('awarded-undisclosed-eu-shi-lng-010140', {
  status: 'inferred',
  defaultHidden: true,
  noteKo: '익명 계약 awarded_to를 homepage만으로 유지하지 않음.',
  noteEn: 'Anonymous awarded_to demoted without individual filing.',
}, 'anonymous EU award → inferred hidden');

// Shell historic → ended hidden (historical reference)
patch('ordered-shell-shi-historic', {
  status: 'ended',
  defaultHidden: true,
  noteKo: '개별 계약·인도 상태 미재검증 → historical ended 숨김.',
  noteEn: 'Historic case not re-verified → ended hidden.',
}, 'Shell historic order → ended hidden');

patch('awarded-shell-shi-historic-010140', {
  status: 'ended',
  defaultHidden: true,
  noteKo: '과거 사례 미검증 → ended 숨김.',
  noteEn: 'Historic award → ended hidden.',
}, 'Shell historic award → ended hidden');

// Naval homepage → manufactures / reference (not awarded_to)
patch('awarded-naval-rok-042660', {
  type: 'manufactures',
  status: 'reference',
  defaultHidden: false,
  labelKo: '함정·특수선 건조 역량 (특정 프로그램 수주 단정 아님)',
  labelEn: 'Naval / specialty build capability (not a verified program award)',
  noteKo: '회사 소개만으로는 해군 프로그램 awarded_to 유지 불가 → manufactures/reference.',
  noteEn: 'Homepage cannot support naval awarded_to → manufactures/reference.',
}, 'naval homepage → manufactures/reference');

// Any remaining reported with homepage-only evidence
for (const e of network.edges) {
  if (e.status !== 'reported') continue;
  const evs = e.evidence || [];
  const onlyHome = !evs.length || evs.every((ev) => {
    try {
      const u = new URL(ev.url || '');
      return u.pathname === '/' || u.pathname === '' || /^\/(en|ko|kr|eng)?\/?$/i.test(u.pathname);
    } catch {
      return true;
    }
  });
  if (onlyHome) {
    patch(e.id, {
      status: 'reference',
      defaultHidden: true,
      noteKo: 'homepage-only URL → reference 강등',
      noteEn: 'homepage-only URL → demoted to reference',
    }, 'remaining reported homepage-only → reference');
  }
}

const reportedBiz = network.edges.filter((e) => e.status === 'reported').length;
const metrics = aggregateEvidenceMetrics(network.edges);
const report = validateNetworkReport(network);

network.metrics = {
  ...(network.metrics || {}),
  reportedBusinessEdgeCount: reportedBiz,
  confirmedBusinessEdgeCount: network.edges.filter((e) => e.status === 'confirmed').length,
  phase3d0FixedAt: AS_OF,
};
network.lastReviewedAt = AS_OF;

fs.writeFileSync(NET, JSON.stringify(network, null, 2));
fs.writeFileSync(LOG, JSON.stringify({
  fixedAt: AS_OF,
  changes,
  after: {
    reportedBusiness: reportedBiz,
    statusCounts: report.summary.statusCounts,
    evidenceFieldCoverage: metrics.evidenceFieldCoverage,
    directEvidenceCoverage: metrics.directEvidenceCoverage,
    primarySourceCoverage: metrics.primarySourceCoverage,
    validateFailures: report.failures.length,
    validateWarnings: report.warnings.length,
    warnings: report.warnings,
  },
}, null, 2));

console.log(JSON.stringify({
  reportedBusiness: reportedBiz,
  directEvidenceCoverage: metrics.directEvidenceCoverage,
  primarySourceCoverage: metrics.primarySourceCoverage,
  evidenceFieldCoverage: metrics.evidenceFieldCoverage,
  statusCounts: report.summary.statusCounts,
  warnings: report.warnings.length,
  warningSamples: report.warnings.slice(0, 10),
  failures: report.failures,
  changeCount: changes.filter((c) => !c.missing).length,
  missing: changes.filter((c) => c.missing).map((c) => c.edgeId),
}, null, 2));
if (report.failures.length) process.exitCode = 1;
