/**
 * Phase 5I — migrate robot legacy partners → data/networks/robot.json
 * No invented supply, deployment, MOU-as-contract, or investment-as-customer.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeRobotMetrics } from '../lib/relation_network/robot_metrics.mjs';
import { focusForTicker, ROBOT_FOCUS_BY_TICKER } from '../lib/relation_network/robot_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-29';
const BY = 'editorial_phase5i';
const OUT_NET = join(ROOT, 'data', 'networks', 'robot.json');
const OUT_LOG = join(ROOT, 'data', 'robot_relation_phase5i_changelog.json');

const CHAIN_LANE = {
  '완성로봇·플랫폼': 'industrial_robot',
  '액추에이터·모터': 'actuator_drive',
  '감속기·동력전달': 'precision_component',
  '센서·비전·정밀부품': 'precision_component',
  '제어·모션·로봇SW': 'robot_software',
  '자동화·SI·물류시스템': 'system_integration',
};

const LANE_HUBS = [
  { id: 'group:precision_component', lane: 'precision_component', nameKo: '정밀부품·감속기', nameEn: 'Precision / reducer' },
  { id: 'group:actuator_drive', lane: 'actuator_drive', nameKo: '액추에이터·구동', nameEn: 'Actuator / drive' },
  { id: 'group:robot_software', lane: 'robot_software', nameKo: '제어·로봇 SW', nameEn: 'Control / robot SW' },
  { id: 'group:industrial_robot', lane: 'industrial_robot', nameKo: '산업용 로봇', nameEn: 'Industrial robot' },
  { id: 'group:collaborative_robot', lane: 'collaborative_robot', nameKo: '협동로봇', nameEn: 'Collaborative robot' },
  { id: 'group:logistics_robot', lane: 'logistics_robot', nameKo: '물류·AMR', nameEn: 'Logistics / AMR' },
  { id: 'group:system_integration', lane: 'system_integration', nameKo: '자동화·SI', nameEn: 'Automation / SI' },
  { id: 'group:end_market', lane: 'end_market', nameKo: '적용 산업', nameEn: 'End market' },
];

const GLOBAL_META = {
  nvidia: { nameKo: 'NVIDIA', nameEn: 'NVIDIA', country: '미국/USA', region: 'us' },
  fanuc: { nameKo: 'FANUC', nameEn: 'FANUC', country: '일본/Japan', region: 'jp' },
  abb: { nameKo: 'ABB', nameEn: 'ABB', country: '스위스/Switzerland', region: 'eu' },
  siemens: { nameKo: 'Siemens', nameEn: 'Siemens', country: '독일/Germany', region: 'eu' },
  amazon: { nameKo: 'Amazon Robotics', nameEn: 'Amazon Robotics', country: '미국/USA', region: 'us' },
  google: { nameKo: 'Google DeepMind', nameEn: 'Google DeepMind', country: '미국/USA', region: 'us' },
  intel: { nameKo: 'Intel', nameEn: 'Intel', country: '미국/USA', region: 'us' },
  keyence: { nameKo: 'Keyence', nameEn: 'Keyence', country: '일본/Japan', region: 'jp' },
  cognex: { nameKo: 'Cognex', nameEn: 'Cognex', country: '미국/USA', region: 'us' },
  hyundai_mt: { nameKo: '현대자동차', nameEn: 'Hyundai Motor', country: '한국/Korea', region: 'kr' },
  mitsubishi_e: { nameKo: 'Mitsubishi Electric', nameEn: 'Mitsubishi Electric', country: '일본/Japan', region: 'jp' },
  doosan_grp: { nameKo: '두산그룹', nameEn: 'Doosan Group', country: '한국/Korea', region: 'kr' },
  samsung_eco: { nameKo: '삼성 역량(참고)', nameEn: 'Samsung ecosystem (ref.)', country: '한국/Korea', region: 'kr' },
};

const THEME_PARTNERS = new Set(['samsung_eco', 'doosan_grp', 'hyundai_mt']);
const INFERRED_SUPPLY_LABEL = new Set(['doosan_robot']);

const CROSS_SECTOR = [
  {
    ticker: '277810', target: 'sector:auto',
    noteKo: '현대차그룹 투자·모빌리티 테마는 auto 경계. 투자≠완성차 납품계약.',
    noteEn: 'Hyundai group investment/mobility theme is auto-boundary; investment ≠ OEM supply.',
  },
  {
    ticker: '125490', target: 'sector:auto',
    noteKo: '전장·ADAS 하우징은 auto 부품 노출. 로봇 다이캐스팅≠완성차 공급계약.',
    noteEn: 'ADAS/electronics housings are auto exposure; die-cast capability ≠ auto supply contract.',
  },
  {
    ticker: '117730', target: 'sector:semiconductor',
    noteKo: '반도체·디스플레이 이송은 semi fab 노출. 장비 카테고리≠특정 fab 계약.',
    noteEn: 'Semi/display transfer is fab exposure; category ≠ named fab contract.',
  },
  {
    ticker: '056190', target: 'sector:semiconductor',
    noteKo: '반도체·디스플레이 물류장비는 semi 공정 노출. SI 역량≠특정 고객 납품.',
    noteEn: 'Semi/display logistics equipment is process exposure; SI capability ≠ named supply.',
  },
  {
    ticker: '466100', target: 'sector:software',
    noteKo: '관제·자율주행 SW는 robot 구조. 일반 클라우드/AI 플랫폼≠로봇 제품 계약.',
    noteEn: 'Fleet/nav SW is robot-structure; general cloud/AI platform ≠ robot product contract.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:auto', nameKo: '자동차 섹터', nameEn: 'Auto sector', lane: 'end_market' },
  { id: 'sector:semiconductor', nameKo: '반도체 섹터', nameEn: 'Semiconductor sector', lane: 'end_market' },
  { id: 'sector:software', nameKo: '소프트웨어 섹터', nameEn: 'Software sector', lane: 'robot_software' },
  { id: 'sector:medtech', nameKo: '메드텍 섹터', nameEn: 'Medtech sector', lane: 'end_market' },
  { id: 'sector:defense', nameKo: '방산 섹터', nameEn: 'Defense sector', lane: 'end_market' },
];

const html = fs.readFileSync(join(ROOT, 'robot', 'korea_robot_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const listedByLegacyId = Object.fromEntries(companies.map((c) => [c.id, c.ticker]));

const nodes = []; const edges = [];
const nodeIds = new Set(); const edgeKeys = new Set(); const changelog = [];
let legacyMigrated = 0; let structuralGenerated = 0; let manuallyCurated = 0;
let removedUnsupported = 0; let demotedPeer = 0;
const partnerClassCounts = {
  peer: 0, theme_reference: 0, inferred_customer_supplier: 0,
  invalid: 0, duplicate: 0, cross_sector_reference: 0,
};

function addNode(n) {
  if (!n?.id || nodeIds.has(n.id)) return false;
  nodeIds.add(n.id); nodes.push(n); return true;
}
function logChange(row) { changelog.push(row); }
function addEdge(e, meta) {
  const key = `${e.source}|${e.target}|${e.type}`;
  if (edgeKeys.has(key) || e.source === e.target) return false;
  if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
  edgeKeys.add(key); edges.push(e); if (meta) logChange(meta); return true;
}
function mkStructEv(summary) {
  return [{
    title: summary, sourceType: 'editorial_structure', primarySource: false, directEvidence: false,
    sourceOpened: false, reviewStatus: 'needs_human_review', reviewedAt: null, reviewedBy: null,
    relationshipSupported: summary, claimSupport: { relationship: true, legalEntity: false, product: true, contractStatus: false },
    accessedAt: AS_OF, evidenceUsageType: 'classification',
  }];
}
function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  addNode({ id, type: nodeType, nameKo, nameEn, lane: lane || 'industrial_robot' });
}
function laneForCompany(c) {
  return ROBOT_FOCUS_BY_TICKER[c.ticker]?.lane || CHAIN_LANE[c.chain] || 'industrial_robot';
}
function partnerId(p) {
  return typeof p === 'string' ? p : p?.id;
}

for (const h of LANE_HUBS) {
  addNode({ id: h.id, type: 'group', nameKo: h.nameKo, nameEn: h.nameEn, lane: h.lane, role: h.lane, layer: h.lane });
}
for (const s of SECTOR_ANCHORS) {
  addNode({
    id: s.id, type: 'cross_sector_anchor', nameKo: s.nameKo, nameEn: s.nameEn, lane: s.lane,
    isMapConstituent: false, entityRole: 'boundary_placeholder', defaultHidden: true,
    excludedFromCounts: true, excludedFromLayout: true,
    noteKo: '타 섹터 경계 참조. business 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary; no duplicate business counts.',
  });
}

for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const lane = laneForCompany(c);
  addNode({
    id, type: 'listed_company', ticker: c.ticker, nameKo: c.name, nameEn: c.nameEn || c.name,
    market: c.market || '', role: c.chain || '', lane, group: c.chain || '', layer: lane,
    mcapWon: c.mcapWon ?? null, isListedKorea: true, isMapConstituent: true,
    legacyId: c.id, owningSector: 'robot',
  });
  const hub = LANE_HUBS.find((h) => h.lane === lane);
  if (hub && addEdge({
    id: `member-${c.ticker}-${hub.lane}`, source: id, target: hub.id, type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: `${hub.nameKo} 분류`, labelEn: `${hub.nameEn} category`,
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    noteKo: '가치사슬 분류. 부품 공급·도입·투자·계약이 아닙니다.',
    noteEn: 'Value-chain category only; not component supply, deployment, investment or contract.',
    edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
  }, { action: 'structural_member_of', ticker: c.ticker, lane })) structuralGenerated += 1;

  for (const focus of focusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    const isApp = focus.type === 'supports_application';
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id, target: focus.id, type: focus.type, direction: 'source_to_target', status: 'reference',
      labelKo: focus.nameKo, labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo}`), confidence: 'medium', lastVerifiedAt: AS_OF,
      noteKo: isApp
        ? '적용 가능 분야 분류. 실제 도입·납품 계약이 아닙니다.'
        : '제품·부품·로봇 유형 구조 분류. 고객 공급·배포 계약이 아닙니다.',
      noteEn: isApp
        ? 'Application exposure classification; not a deployment or supply contract.'
        : 'Product/component/category structure; not customer supply or deployment.',
      edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: `structural_${focus.type}`, ticker: c.ticker, target: focus.id })) structuralGenerated += 1;
  }
}

const endMarketHub = LANE_HUBS.find((h) => h.lane === 'end_market');
if (endMarketHub) {
  for (const n of [...nodes]) {
    if (n.type !== 'application' && n.type !== 'end_market') continue;
    if (addEdge({
      id: `member-app-${n.id.replace(/:/g, '-')}-end_market`,
      source: n.id, target: endMarketHub.id, type: 'member_of',
      direction: 'source_to_target', status: 'reference',
      labelKo: '적용산업 분류', labelEn: 'End-market category',
      evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
      noteKo: '적용산업 lane 분류. 고객 계약이 아닙니다.',
      noteEn: 'End-market lane category; not a customer contract.',
      edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: 'structural_application_hub', target: n.id })) structuralGenerated += 1;
  }
}

const usedPartnerIds = new Set();
for (const c of companies) {
  for (const p of c.partners || []) {
    const pid = partnerId(p);
    if (pid) usedPartnerIds.add(pid);
  }
}
for (const gid of usedPartnerIds) {
  if (!GLOBAL_META[gid] || listedByLegacyId[gid]) continue;
  const meta = GLOBAL_META[gid];
  addNode({
    id: `global:${gid}`, type: 'global_company', nameKo: meta.nameKo, nameEn: meta.nameEn,
    country: meta.country, region: meta.region, lane: 'industrial_robot', legacyId: gid, isMapConstituent: false,
  });
}

for (const c of companies) {
  const source = `krx:${c.ticker}`;
  for (const p of c.partners || []) {
    const pid = partnerId(p);
    if (!pid) {
      removedUnsupported += 1;
      partnerClassCounts.invalid += 1;
      logChange({ action: 'drop_invalid_partner', source, partner: p });
      continue;
    }
    let target = null;
    let classTag = 'peer';
    if (listedByLegacyId[pid]) {
      target = `krx:${listedByLegacyId[pid]}`;
      classTag = INFERRED_SUPPLY_LABEL.has(pid) ? 'inferred_customer_supplier' : 'peer';
    } else if (GLOBAL_META[pid]) {
      target = `global:${pid}`;
      classTag = THEME_PARTNERS.has(pid) ? 'theme_reference' : 'peer';
    } else {
      removedUnsupported += 1;
      partnerClassCounts.invalid += 1;
      logChange({ action: 'drop_unknown_partner', source, partner: pid });
      continue;
    }
    partnerClassCounts[classTag] = (partnerClassCounts[classTag] || 0) + 1;
    if (addEdge({
      id: `peer-${c.ticker}-${pid}`, source, target, type: 'peer', direction: 'undirected', status: 'peer',
      labelKo: classTag === 'theme_reference'
        ? '테마·지분 참고 (레거시)'
        : classTag === 'inferred_customer_supplier'
          ? '추정 공급 라벨 강등 (레거시)'
          : '글로벌/국내 peer (레거시)',
      labelEn: classTag === 'theme_reference'
        ? 'Theme / backing reference (legacy)'
        : classTag === 'inferred_customer_supplier'
          ? 'Inferred supply label demoted (legacy)'
          : 'Global/domestic peer (legacy)',
      evidence: [], confidence: 'low', lastVerifiedAt: AS_OF,
      noteKo: '기존 partners. 공급·도입·투자·MOU·계약을 confirmed로 승격하지 않음. 기본 숨김.',
      noteEn: 'Legacy partners. Not promoted to confirmed supply/deploy/invest/MOU. Hidden by default.',
      edgeOrigin: 'legacyMigrated', defaultHidden: true,
      excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
      legacyPartnerClass: classTag,
    }, { action: 'demote_legacy_partner_to_peer', source, target, classTag })) {
      legacyMigrated += 1; demotedPeer += 1;
    } else {
      partnerClassCounts.duplicate += 1;
      logChange({ action: 'skip_duplicate_peer', source, target });
    }
  }
}

for (const ref of CROSS_SECTOR) {
  const source = `krx:${ref.ticker}`;
  if (!nodeIds.has(source) || !nodeIds.has(ref.target)) continue;
  if (addEdge({
    id: `cross-sector-${ref.ticker}-${ref.target.replace(':', '-')}`,
    source, target: ref.target, type: 'cross_sector_reference', direction: 'source_to_target', status: 'reference',
    labelKo: '타 섹터 경계 참조', labelEn: 'Cross-sector boundary reference',
    evidence: mkStructEv(`${source} xref ${ref.target}`), confidence: 'high', lastVerifiedAt: AS_OF,
    noteKo: ref.noteKo, noteEn: ref.noteEn, edgeOrigin: 'manuallyCurated',
    crossSectorReference: true, referencedBySectors: ['robot'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true, duplicateBusinessCountExcluded: true, excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) {
    manuallyCurated += 1;
    partnerClassCounts.cross_sector_reference += 1;
  }
}

logChange({
  action: 'defer_business_relationships',
  reason: 'Phase 5I does not invent component/robot supply, deployment, MOU-as-commercial, investment-as-customer, or PoC-as-deployment without DART/primary evidence',
});

const network = {
  version: 1, sectorId: 'robot',
  model: 'robotics_component_system_application_ecosystem', layout: 'roboticsValueChainEcosystem',
  asOf: AS_OF, lastReviewedAt: AS_OF, curatedBy: BY, phase5iCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane), _legacyFallback: false, nodes, edges, metrics: {},
};
network.metrics = {
  ...computeRobotMetrics(network),
  legacyMigratedEdgeCount: legacyMigrated,
  structuralGeneratedEdgeCount: structuralGenerated,
  manuallyCuratedEdgeCount: manuallyCurated,
  removedUnsupportedPartnerCount: removedUnsupported,
  demotedLegacyPeerCount: demotedPeer,
  legacyPartnerClassCounts: partnerClassCounts,
};

const report = validateNetworkReport(network);
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({
  asOf: AS_OF, phase: '5I', reviewedBy: BY, listedCompanyCount: companies.length,
  nodeCount: nodes.length, edgeCount: edges.length, structuralGenerated, legacyMigrated,
  manuallyCurated, demotedPeer, partnerClassCounts,
  confirmedBusinessEdgeCount: network.metrics.confirmedBusinessEdgeCount,
  metrics: network.metrics, validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR, changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log('OK migrate robot', {
  listed: companies.length, nodes: nodes.length, edges: edges.length,
  structuralGenerated, legacyMigrated, demotedPeer, partnerClassCounts,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: report.warnings.length, failures: report.failures.length,
});
if (report.failures.length) { console.error(report.failures.slice(0, 20)); process.exitCode = 1; }
