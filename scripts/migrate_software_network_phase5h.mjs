/**
 * Phase 5H — migrate software legacy partners → data/networks/software.json
 * No invented customers, marketplace listings-as-contracts, or API-as-partnership.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeSoftwareMetrics } from '../lib/relation_network/software_metrics.mjs';
import { focusForTicker, SOFTWARE_FOCUS_BY_TICKER } from '../lib/relation_network/software_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-29';
const BY = 'editorial_phase5h';
const OUT_NET = join(ROOT, 'data', 'networks', 'software.json');
const OUT_LOG = join(ROOT, 'data', 'software_relation_phase5h_changelog.json');

const CHAIN_LANE = {
  '플랫폼·AI': 'data_ai',
  'SI·클라우드': 'managed_service',
  '보안': 'cybersecurity',
  '기업SW·SaaS': 'enterprise_software',
};

const LANE_HUBS = [
  { id: 'group:data_ai', lane: 'data_ai', nameKo: '플랫폼·AI', nameEn: 'Platform / AI' },
  { id: 'group:managed_service', lane: 'managed_service', nameKo: 'SI·매니지드', nameEn: 'SI / managed' },
  { id: 'group:cloud_infrastructure', lane: 'cloud_infrastructure', nameKo: '클라우드 인프라', nameEn: 'Cloud infrastructure' },
  { id: 'group:cybersecurity', lane: 'cybersecurity', nameKo: '보안', nameEn: 'Cybersecurity' },
  { id: 'group:enterprise_software', lane: 'enterprise_software', nameKo: '기업 SW', nameEn: 'Enterprise software' },
  { id: 'group:commerce_platform', lane: 'commerce_platform', nameKo: '커머스 플랫폼', nameEn: 'Commerce platform' },
  { id: 'group:industrial_software', lane: 'industrial_software', nameKo: '산업 SW', nameEn: 'Industrial software' },
];

const GLOBAL_META = {
  microsoft: { nameKo: 'Microsoft', nameEn: 'Microsoft', country: '미국/USA', region: 'us' },
  google: { nameKo: 'Google', nameEn: 'Google', country: '미국/USA', region: 'us' },
  sap: { nameKo: 'SAP', nameEn: 'SAP', country: '독일/Germany', region: 'eu' },
  accenture: { nameKo: 'Accenture', nameEn: 'Accenture', country: '아일랜드/Ireland', region: 'eu' },
  paloalto: { nameKo: 'Palo Alto Networks', nameEn: 'Palo Alto Networks', country: '미국/USA', region: 'us' },
  shopify: { nameKo: 'Shopify', nameEn: 'Shopify', country: '캐나다/Canada', region: 'na' },
};

const CROSS_SECTOR = [
  { ticker: '035420', target: 'sector:kcontent', noteKo: '콘텐츠·스트리밍 IP는 kcontent 중심. 플랫폼 노출≠콘텐츠 배급계약.', noteEn: 'Content/streaming IP is kcontent-centric; platform exposure ≠ distribution contract.' },
  { ticker: '035720', target: 'sector:finance', noteKo: '핀테크·금융서비스 지분은 finance와 구분. 메신저 플랫폼≠금융 계약.', noteEn: 'Fintech/finance ownership is finance-sector; messenger platform ≠ finance contract.' },
  { ticker: '018260', target: 'sector:telecom', noteKo: '통신망·통신서비스는 telecom. 클라우드 SI≠망 공급계약.', noteEn: 'Networks/services are telecom; cloud SI ≠ network supply contract.' },
  { ticker: '053800', target: 'sector:medtech', noteKo: '의료 AI·SaMD 인허가는 medtech cross-reference. 일반 보안 SW≠의료기기.', noteEn: 'SaMD clearances are medtech; general security SW ≠ medical device.' },
];

const SECTOR_ANCHORS = [
  { id: 'sector:kcontent', nameKo: '콘텐츠 섹터', nameEn: 'K-content sector', lane: 'data_ai' },
  { id: 'sector:finance', nameKo: '금융 섹터', nameEn: 'Finance sector', lane: 'data_ai' },
  { id: 'sector:telecom', nameKo: '통신 섹터', nameEn: 'Telecom sector', lane: 'managed_service' },
  { id: 'sector:medtech', nameKo: '메드텍 섹터', nameEn: 'Medtech sector', lane: 'cybersecurity' },
];

const html = fs.readFileSync(join(ROOT, 'software', 'korea_software_map.html'), 'utf8');
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
  addNode({ id, type: nodeType, nameKo, nameEn, lane: lane || 'data_ai' });
}
function laneForCompany(c) {
  return SOFTWARE_FOCUS_BY_TICKER[c.ticker]?.lane || CHAIN_LANE[c.chain] || 'managed_service';
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
    legacyId: c.id, owningSector: 'software',
  });
  const hub = LANE_HUBS.find((h) => h.lane === lane);
  if (hub && addEdge({
    id: `member-${c.ticker}-${hub.lane}`, source: id, target: hub.id, type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: `${hub.nameKo} 분류`, labelEn: `${hub.nameEn} category`,
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    noteKo: '가치사슬 분류. 고객 계약·파트너십·클라우드 제휴가 아닙니다.',
    noteEn: 'Value-chain category only; not customer contract, partnership or cloud alliance.',
    edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
  }, { action: 'structural_member_of', ticker: c.ticker, lane })) structuralGenerated += 1;

  for (const focus of focusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    const isIndustry = focus.type === 'used_in_industry';
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id, target: focus.id, type: focus.type, direction: 'source_to_target', status: 'reference',
      labelKo: focus.nameKo, labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo}`), confidence: 'medium', lastVerifiedAt: AS_OF,
      noteKo: isIndustry
        ? '산업 노출 분류. 특정 고객 계약·도입 사례가 아닙니다.'
        : '제품·플랫폼 구조 분류. 공급계약·마켓플레이스 등록·API 제휴가 아닙니다.',
      noteEn: isIndustry
        ? 'Industry exposure classification; not a named customer contract.'
        : 'Product/platform structure; not supply contract, marketplace listing or API partnership.',
      edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: `structural_${focus.type}`, ticker: c.ticker, target: focus.id })) structuralGenerated += 1;
  }
}

for (const [gid, meta] of Object.entries(GLOBAL_META)) {
  addNode({
    id: `global:${gid}`, type: 'global_company', nameKo: meta.nameKo, nameEn: meta.nameEn,
    country: meta.country, region: meta.region, lane: 'data_ai', legacyId: gid, isMapConstituent: false,
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
      labelKo: '글로벌 SW peer (레거시)', labelEn: 'Global software peer (legacy)',
      evidence: [], confidence: 'low', lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. 공급·리셀러·클라우드 제휴·고객 계약이 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not supply, reseller, cloud alliance or customer contract. Hidden by default.',
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
    crossSectorReference: true, referencedBySectors: ['software'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true, duplicateBusinessCountExcluded: true, excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

logChange({
  action: 'defer_business_relationships',
  reason: 'Phase 5H does not invent customers from logos, marketplace listings, API integrations as partnerships, or cloud usage as alliances without DART/primary evidence',
});

const network = {
  version: 1, sectorId: 'software',
  model: 'software_product_platform_ecosystem', layout: 'softwarePlatformEcosystem',
  asOf: AS_OF, lastReviewedAt: AS_OF, curatedBy: BY, phase5hCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane), _legacyFallback: false, nodes, edges, metrics: {},
};
network.metrics = {
  ...computeSoftwareMetrics(network),
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
  metrics: network.metrics, validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR, changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log('OK migrate software', {
  listed: companies.length, nodes: nodes.length, edges: edges.length,
  structuralGenerated, legacyMigrated, demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: report.warnings.length, failures: report.failures.length,
});
if (report.failures.length) { console.error(report.failures.slice(0, 20)); process.exitCode = 1; }
