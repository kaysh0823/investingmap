/**
 * Phase 5H — migrate telecom legacy partners → data/networks/telecom.json
 * No invented equipment supply, MVNO contracts, spectrum-as-ownership, or cert-as-supply.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeTelecomMetrics } from '../lib/relation_network/telecom_metrics.mjs';
import { focusForTicker, TELECOM_FOCUS_BY_TICKER } from '../lib/relation_network/telecom_network_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-29';
const BY = 'editorial_phase5h';
const OUT_NET = join(ROOT, 'data', 'networks', 'telecom.json');
const OUT_LOG = join(ROOT, 'data', 'telecom_relation_phase5h_changelog.json');

const CHAIN_LANE = {
  '통신서비스': 'network_operator',
  '무선장비': 'network_equipment',
  '광통신': 'optical_wireless_component',
};

/** Populated lanes only — empty 위성통신 has no hub. */
const LANE_HUBS = [
  { id: 'group:network_operator', lane: 'network_operator', nameKo: '통신서비스', nameEn: 'Network operators' },
  { id: 'group:network_equipment', lane: 'network_equipment', nameKo: '무선장비', nameEn: 'Network equipment' },
  { id: 'group:optical_wireless_component', lane: 'optical_wireless_component', nameKo: '광통신', nameEn: 'Optical components' },
];

const GLOBAL_META = {
  verizon: { nameKo: 'Verizon', nameEn: 'Verizon', country: '미국/USA', region: 'us' },
  deutsche: { nameKo: 'Deutsche Telekom', nameEn: 'Deutsche Telekom', country: '독일/Germany', region: 'eu' },
  ericsson: { nameKo: 'Ericsson', nameEn: 'Ericsson', country: '스웨덴/Sweden', region: 'eu' },
  ciena: { nameKo: 'Ciena', nameEn: 'Ciena', country: '미국/USA', region: 'us' },
};

const CROSS_SECTOR = [
  { ticker: '017670', target: 'sector:software', noteKo: '플랫폼·클라우드는 software 중심. 통신사 ICT≠소프트웨어 공급계약 자동생성.', noteEn: 'Platform/cloud is software-centric; carrier ICT ≠ auto software supply.' },
  { ticker: '030200', target: 'sector:kcontent', noteKo: '콘텐츠 IP·제작은 kcontent. IPTV 노출≠콘텐츠 배급계약.', noteEn: 'Content IP is kcontent; IPTV exposure ≠ distribution contract.' },
  { ticker: '218410', target: 'sector:semi', noteKo: 'RF/통신 반도체 공급망은 semiconductor. 장비사 peer≠칩 공급 복제.', noteEn: 'RF/comms semiconductors stay in semi; equipment peer ≠ chip supply clone.' },
  { ticker: '010170', target: 'sector:elec', noteKo: '전자부품과 광통신 완제품·케이블을 구분. elec 공급망 중복 금지.', noteEn: 'Separate electronic components from optical finished goods; no elec chain clone.' },
];

const SECTOR_ANCHORS = [
  { id: 'sector:software', nameKo: '소프트웨어 섹터', nameEn: 'Software sector', lane: 'network_operator' },
  { id: 'sector:kcontent', nameKo: '콘텐츠 섹터', nameEn: 'K-content sector', lane: 'network_operator' },
  { id: 'sector:semi', nameKo: '반도체 섹터', nameEn: 'Semiconductor sector', lane: 'network_equipment' },
  { id: 'sector:elec', nameKo: '전자 섹터', nameEn: 'Electronics sector', lane: 'optical_wireless_component' },
];

const html = fs.readFileSync(join(ROOT, 'telecom', 'korea_telecom_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);

const nodes = []; const edges = [];
const nodeIds = new Set(); const edgeKeys = new Set(); const changelog = [];
let legacyMigrated = 0; let structuralGenerated = 0; let manuallyCurated = 0;
let removedUnsupported = 0; let demotedPeer = 0;

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
  addNode({ id, type: nodeType, nameKo, nameEn, lane: lane || 'network_operator' });
}
function laneForCompany(c) {
  return TELECOM_FOCUS_BY_TICKER[c.ticker]?.lane || CHAIN_LANE[c.chain] || 'network_equipment';
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
    legacyId: c.id, owningSector: 'telecom',
  });
  const hub = LANE_HUBS.find((h) => h.lane === lane);
  if (hub && addEdge({
    id: `member-${c.ticker}-${hub.lane}`, source: id, target: hub.id, type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: `${hub.nameKo} 분류`, labelEn: `${hub.nameEn} category`,
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    noteKo: '가치사슬 분류. 장비 공급·도매망·주파수 소유가 아닙니다.',
    noteEn: 'Value-chain category only; not equipment supply, wholesale network or spectrum ownership.',
    edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
  }, { action: 'structural_member_of', ticker: c.ticker, lane })) structuralGenerated += 1;

  for (const focus of focusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    const isGen = focus.type === 'supports_network_generation';
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id, target: focus.id, type: focus.type, direction: 'source_to_target', status: 'reference',
      labelKo: focus.nameKo, labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo}`), confidence: 'medium', lastVerifiedAt: AS_OF,
      noteKo: isGen
        ? '망 세대 구조 분류. 호환 인증≠장비 공급계약.'
        : '서비스·장비·부품 구조 분류. 납품·도매·주파수 할당이 아닙니다.',
      noteEn: isGen
        ? 'Network-generation classification; certification ≠ equipment supply.'
        : 'Service/equipment/component structure; not delivery, wholesale or spectrum assignment.',
      edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: `structural_${focus.type}`, ticker: c.ticker, target: focus.id })) structuralGenerated += 1;
  }
}

for (const [gid, meta] of Object.entries(GLOBAL_META)) {
  addNode({
    id: `global:${gid}`, type: 'global_company', nameKo: meta.nameKo, nameEn: meta.nameEn,
    country: meta.country, region: meta.region, lane: 'network_operator', legacyId: gid, isMapConstituent: false,
  });
}

for (const c of companies) {
  const source = `krx:${c.ticker}`;
  for (const p of c.partners || []) {
    const target = `global:${p}`;
    if (!nodeIds.has(target)) {
      removedUnsupported += 1;
      logChange({ action: 'drop_unknown_partner', source, partner: p });
      continue;
    }
    if (addEdge({
      id: `peer-${c.ticker}-${p}`, source, target, type: 'peer', direction: 'undirected', status: 'peer',
      labelKo: '글로벌 통신 peer (레거시)', labelEn: 'Global telecom peer (legacy)',
      evidence: [], confidence: 'low', lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. 장비 공급·로밍·도매망 계약이 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not equipment supply, roaming or wholesale contract. Hidden by default.',
      edgeOrigin: 'legacyMigrated', defaultHidden: true,
      excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: 'demote_legacy_partner_to_peer', source, target })) {
      legacyMigrated += 1; demotedPeer += 1;
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
    crossSectorReference: true, referencedBySectors: ['telecom'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true, duplicateBusinessCountExcluded: true, excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

logChange({
  action: 'defer_business_and_spectrum',
  reason: 'Phase 5H does not invent equipment supply from compatibility, MVNO wholesale from general facts, or spectrum licenses without official identifiers. Spectrum is not company ownership.',
});

const network = {
  version: 1, sectorId: 'telecom',
  model: 'telecommunications_network_service_ecosystem', layout: 'telecomNetworkServiceEcosystem',
  asOf: AS_OF, lastReviewedAt: AS_OF, curatedBy: BY, phase5hCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane), _legacyFallback: false, nodes, edges, metrics: {},
};
network.metrics = {
  ...computeTelecomMetrics(network),
  legacyMigratedEdgeCount: legacyMigrated,
  structuralGeneratedEdgeCount: structuralGenerated,
  manuallyCuratedEdgeCount: manuallyCurated,
  removedUnsupportedPartnerCount: removedUnsupported,
  demotedLegacyPeerCount: demotedPeer,
};

const report = validateNetworkReport(network);
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({
  asOf: AS_OF, phase: '5H', reviewedBy: BY, listedCompanyCount: companies.length,
  nodeCount: nodes.length, edgeCount: edges.length, structuralGenerated, legacyMigrated,
  manuallyCurated, demotedPeer, confirmedBusinessEdgeCount: network.metrics.confirmedBusinessEdgeCount,
  emptyChainsSkipped: ['위성통신'],
  metrics: network.metrics, validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR, changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log('OK migrate telecom', {
  listed: companies.length, nodes: nodes.length, edges: edges.length,
  structuralGenerated, legacyMigrated, demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: report.warnings.length, failures: report.failures.length,
});
if (report.failures.length) { console.error(report.failures.slice(0, 20)); process.exitCode = 1; }
