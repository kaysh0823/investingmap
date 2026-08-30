/**
 * Migrate travel legacy partners → data/networks/travel.json
 * Airlines, casino, hotel/resort and travel agency value chain. No invented routes or contracts from peer strings.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeTravelMetrics } from '../lib/relation_network/travel_metrics.mjs';
import { TRAVEL_CONFIG } from '../lib/curated_sector_configs.mjs';
import { productFocusForTicker } from '../lib/relation_network/travel_network_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-30';
const BY = 'editorial_travel';
const OUT_NET = join(ROOT, 'data', 'networks', 'travel.json');
const OUT_LOG = join(ROOT, 'data', 'travel_relation_changelog.json');

const CHAIN_LANE = {
  '항공': 'airlines',
  '카지노': 'casino',
  '호텔·리조트': 'hotel_resort',
  '여행·면세': 'travel_duty_free',
};

const LANE_HUBS = [
  { id: 'group:airlines', lane: 'airlines', nameKo: '항공', nameEn: 'Airlines' },
  { id: 'group:casino', lane: 'casino', nameKo: '카지노', nameEn: 'Casino' },
  { id: 'group:hotel_resort', lane: 'hotel_resort', nameKo: '호텔·리조트', nameEn: 'Hotel & resort' },
  { id: 'group:travel_duty_free', lane: 'travel_duty_free', nameKo: '여행·면세', nameEn: 'Travel & duty-free' },
];

const GLOBAL_META = Object.fromEntries(
  (TRAVEL_CONFIG.globals || []).map((g) => [g.id, {
    nameKo: g.name,
    nameEn: g.name,
    country: g.country || '',
    region: g.region || 'us',
    sector: g.sector || '',
  }]),
);

const CROSS_SECTOR = [
  { ticker: '008770', target: 'sector:kconsume', noteKo: '면세·유통은 kconsume과 겹침. confirmed 유통은 kconsume에서만.', noteEn: 'Duty-free retail overlaps kconsume; confirmed distribution curated there only.' },
  { ticker: '003490', target: 'sector:holdings', noteKo: '한진그룹 지주 구조는 holdings와 겹침. 지분은 holdings에서만.', noteEn: 'Hanjin group ownership overlaps holdings; stakes curated there only.' },
  { ticker: '032350', target: 'sector:holdings', noteKo: '롯데 계열 지주·리조트는 holdings와 겹침.', noteEn: 'Lotte group ownership overlaps holdings sector.' },
];

const SECTOR_ANCHORS = [
  { id: 'sector:kconsume', nameKo: 'K-소비 섹터', nameEn: 'K-consume sector', lane: 'travel_duty_free' },
  { id: 'sector:holdings', nameKo: '지주회사 섹터', nameEn: 'Holdings sector', lane: 'airlines' },
];

const seedByTicker = Object.fromEntries(TRAVEL_CONFIG.companies.map((c) => [c.ticker, c]));
const html = fs.readFileSync(join(ROOT, 'travel', 'korea_travel_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);

const nodes = [];
const edges = [];
const nodeIds = new Set();
const edgeKeys = new Set();
const changelog = [];
let legacyMigrated = 0;
let structuralGenerated = 0;
let manuallyCurated = 0;
let removedUnsupported = 0;
let demotedPeer = 0;

function addNode(n) {
  if (!n?.id || nodeIds.has(n.id)) return false;
  nodeIds.add(n.id);
  nodes.push(n);
  return true;
}
function logChange(row) { changelog.push(row); }
function addEdge(e, meta) {
  const key = `${e.source}|${e.target}|${e.type}`;
  if (edgeKeys.has(key) || e.source === e.target) return false;
  if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
  edgeKeys.add(key);
  edges.push(e);
  if (meta) logChange(meta);
  return true;
}
function mkStructEv(summary) {
  return [{
    title: summary, sourceType: 'editorial_structure', primarySource: false, directEvidence: false,
    sourceOpened: false, reviewStatus: 'needs_human_review', reviewedAt: null, reviewedBy: null,
    relationshipSupported: summary,
    claimSupport: { relationship: true, legalEntity: false, product: true, contractStatus: false },
    accessedAt: AS_OF, evidenceUsageType: 'classification',
  }];
}
function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  addNode({ id, type: nodeType || 'travel_service', nameKo, nameEn, lane: lane || 'airlines' });
}
function laneForCompany(c) {
  const seed = seedByTicker[c.ticker];
  return CHAIN_LANE[c.chain] || CHAIN_LANE[seed?.chain] || 'airlines';
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
    legacyId: c.id, owningSector: 'travel',
  });
  const hub = LANE_HUBS.find((h) => h.lane === lane);
  if (hub && addEdge({
    id: `member-${c.ticker}-${hub.lane}`, source: id, target: hub.id, type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: `${hub.nameKo} 분류`, labelEn: `${hub.nameEn} category`,
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    noteKo: '가치사슬 분류. 항공 alliance·카지노 라이선스·호텔 프랜차이즈 계약이 아닙니다.',
    noteEn: 'Value-chain category only; not alliance, casino license or hotel franchise contracts.',
    edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
  }, { action: 'structural_member_of', ticker: c.ticker, lane })) structuralGenerated += 1;

  for (const focus of productFocusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id, target: focus.id, type: focus.type, direction: 'source_to_target', status: 'reference',
      labelKo: focus.nameKo, labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo}`), confidence: 'medium', lastVerifiedAt: AS_OF,
      noteKo: '서비스·사업 구조 분류. codeshare·GDS·면세 공급 계약이 아닙니다.',
      noteEn: 'Service/business structure classification; not codeshare, GDS or duty-free supply contracts.',
      edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: `structural_${focus.type}`, ticker: c.ticker, target: focus.id })) structuralGenerated += 1;
  }
}

for (const [gid, meta] of Object.entries(GLOBAL_META)) {
  addNode({
    id: `global:${gid}`, type: 'global_company', nameKo: meta.nameKo, nameEn: meta.nameEn,
    country: meta.country, region: meta.region, lane: 'airlines', legacyId: gid, isMapConstituent: false,
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
      labelKo: '글로벌 여행·레저 peer (레거시)', labelEn: 'Global travel/leisure peer (legacy)',
      evidence: [], confidence: 'low', lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. alliance·카지노 JV·호텔 관리계약이 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not alliance, casino JV or hotel management contracts. Hidden by default.',
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
    crossSectorReference: true, referencedBySectors: ['travel'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true, duplicateBusinessCountExcluded: true, excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

const network = {
  version: 1, sectorId: 'travel',
  model: 'travel_leisure_airlines_value_chain_ecosystem', layout: 'travelLeisureValueChainEcosystem',
  asOf: AS_OF, lastReviewedAt: AS_OF, curatedBy: BY, travelCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane), _legacyFallback: false, nodes, edges, metrics: {},
};
network.metrics = {
  ...computeTravelMetrics(network),
  legacyMigratedEdgeCount: legacyMigrated,
  structuralGeneratedEdgeCount: structuralGenerated,
  manuallyCuratedEdgeCount: manuallyCurated,
  removedUnsupportedPartnerCount: removedUnsupported,
  demotedLegacyPeerCount: demotedPeer,
};

const report = validateNetworkReport(network);
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({
  asOf: AS_OF, reviewedBy: BY, listedCompanyCount: companies.length,
  nodeCount: nodes.length, edgeCount: edges.length, structuralGenerated, legacyMigrated,
  manuallyCurated, demotedPeer, metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR, changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log('OK migrate travel', {
  listed: companies.length, nodes: nodes.length, edges: edges.length,
  structuralGenerated, legacyMigrated, demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: report.warnings.length, failures: report.failures.length,
});
if (report.failures.length) { console.error(report.failures.slice(0, 20)); process.exitCode = 1; }
