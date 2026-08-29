/**
 * Phase 5D — migrate metal legacy partners → data/networks/metal.json
 * Metals & materials value chain. No invented supply from peer strings or commodity exposure.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeMetalMetrics } from '../lib/relation_network/metal_metrics.mjs';
import { METAL_CONFIG } from '../lib/curated_sector_configs.mjs';
import { productFocusForTicker } from '../lib/relation_network/metal_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_phase5d';
const OUT_NET = join(ROOT, 'data', 'networks', 'metal.json');
const OUT_LOG = join(ROOT, 'data', 'metal_relation_phase5d_changelog.json');

const CHAIN_LANE = {
  '철강': 'steelmaking',
  '비철': 'nonferrous_metal',
  '철강 트레이딩': 'distribution_trading',
  '산업기계': 'metal_products',
};

const LANE_HUBS = [
  { id: 'group:steelmaking', lane: 'steelmaking', nameKo: '철강', nameEn: 'Steelmaking' },
  { id: 'group:smelting_refining', lane: 'smelting_refining', nameKo: '제련·정련', nameEn: 'Smelting & refining' },
  { id: 'group:nonferrous_metal', lane: 'nonferrous_metal', nameKo: '비철금속', nameEn: 'Nonferrous metals' },
  { id: 'group:rolling_processing', lane: 'rolling_processing', nameKo: '압연·가공', nameEn: 'Rolling & processing' },
  { id: 'group:distribution_trading', lane: 'distribution_trading', nameKo: '트레이딩', nameEn: 'Trading & distribution' },
  { id: 'group:specialty_alloy', lane: 'specialty_alloy', nameKo: '특수강·합금', nameEn: 'Specialty alloys' },
  { id: 'group:metal_products', lane: 'metal_products', nameKo: '금속제품·기계', nameEn: 'Metal products & machinery' },
];

const GLOBAL_META = Object.fromEntries(
  (METAL_CONFIG.globals || []).map((g) => [g.id, {
    nameKo: g.name,
    nameEn: g.name,
    country: (g.country || '').split('/')[1] || g.country || 'Global',
    region: g.region || 'us',
    sector: g.sector || '',
  }]),
);

/** Cross-sector boundary — reference only, no duplicate confirmed business. */
const CROSS_SECTOR = [
  {
    ticker: '006110',
    target: 'sector:battery',
    noteKo: '배터리용 알루미늄 압연재는 battery 섹터와 겹침. confirmed 공급은 battery에서만 큐레이션.',
    noteEn: 'Battery-grade aluminium overlaps battery sector; confirmed supply curated in battery only.',
  },
  {
    ticker: '004020',
    target: 'sector:auto',
    noteKo: '자동차강판·일관제철 적용은 auto 섹터와 겹침. OEM 공급은 auto에서만.',
    noteEn: 'Automotive steel overlaps auto sector; OEM supply curated in auto only.',
  },
  {
    ticker: '306200',
    target: 'sector:ship',
    noteKo: '에너지·구조용 강관은 ship 섹터와 겹침. 조선용 강재 공급은 ship에서만.',
    noteEn: 'Energy and structural pipe overlaps ship sector; shipbuilding steel supply curated in ship only.',
  },
  {
    ticker: '460860',
    target: 'sector:construction',
    noteKo: '철근·형강은 construction 섹터와 겹침. 건설용 강재 공급은 construction에서만.',
    noteEn: 'Rebar and sections overlap construction sector; construction steel supply curated in construction only.',
  },
  {
    ticker: '295310',
    target: 'sector:semiconductor',
    noteKo: '반도체용 고순도 특수금속은 semiconductor 섹터와 겹침.',
    noteEn: 'High-purity specialty metals for semiconductors overlap semiconductor sector.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:battery', nameKo: '배터리 섹터', nameEn: 'Battery sector', lane: 'end_market' },
  { id: 'sector:auto', nameKo: '자동차 섹터', nameEn: 'Automotive sector', lane: 'end_market' },
  { id: 'sector:ship', nameKo: '조선 섹터', nameEn: 'Shipbuilding sector', lane: 'end_market' },
  { id: 'sector:construction', nameKo: '건설 섹터', nameEn: 'Construction sector', lane: 'end_market' },
  { id: 'sector:semiconductor', nameKo: '반도체 섹터', nameEn: 'Semiconductor sector', lane: 'end_market' },
  { id: 'sector:powergrid', nameKo: '전력망 섹터', nameEn: 'Power grid sector', lane: 'end_market' },
];

const seedByTicker = Object.fromEntries(METAL_CONFIG.companies.map((c) => [c.ticker, c]));

const html = fs.readFileSync(join(ROOT, 'metal', 'korea_metal_map.html'), 'utf8');
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

function logChange(row) {
  changelog.push(row);
}

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
    title: summary,
    sourceType: 'editorial_structure',
    primarySource: false,
    directEvidence: false,
    sourceOpened: false,
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    relationshipSupported: summary,
    claimSupport: {
      relationship: true,
      legalEntity: false,
      counterparty: false,
      product: true,
      facility: false,
      commodity: false,
      contractStatus: false,
      validFrom: false,
      validTo: false,
      amount: false,
      stakePct: false,
    },
    accessedAt: AS_OF,
    evidenceUsageType: 'classification',
  }];
}

function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  const type = nodeType || (id.startsWith('commodity:') ? 'commodity'
    : id.startsWith('end_market:') ? 'end_market' : 'metal_product');
  addNode({ id, type, nameKo, nameEn, lane: lane || 'steelmaking' });
}

function laneForCompany(c) {
  const seed = seedByTicker[c.ticker];
  const chainLane = CHAIN_LANE[c.chain] || CHAIN_LANE[seed?.chain];
  const spec = productFocusForTicker(c.ticker)[0];
  return spec?.lane || chainLane || 'steelmaking';
}

for (const h of LANE_HUBS) {
  addNode({
    id: h.id,
    type: 'business_category',
    nameKo: h.nameKo,
    nameEn: h.nameEn,
    lane: h.lane,
    role: h.lane,
    layer: h.lane,
  });
}

for (const s of SECTOR_ANCHORS) {
  addNode({
    id: s.id,
    type: 'cross_sector_anchor',
    nameKo: s.nameKo,
    nameEn: s.nameEn,
    lane: s.lane,
    isMapConstituent: false,
    entityRole: 'boundary_placeholder',
    defaultHidden: true,
    excludedFromCounts: true,
    excludedFromLayout: true,
    noteKo: '타 섹터 경계 참조. metal에서 business edge 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary reference; no duplicate business edges in metal.',
  });
}

addNode({
  id: 'end_market:industrial_machinery',
  type: 'end_market',
  nameKo: '산업기계',
  nameEn: 'Industrial machinery',
  lane: 'end_market',
  entityRole: 'boundary_placeholder',
  defaultHidden: true,
  excludedFromCounts: true,
  excludedFromLayout: true,
});

for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const lane = laneForCompany(c);
  addNode({
    id,
    type: 'listed_company',
    ticker: c.ticker,
    nameKo: c.name,
    nameEn: c.nameEn || c.name,
    market: c.market || '',
    role: c.chain || '',
    lane,
    group: c.chain || '',
    layer: lane,
    mcapWon: c.mcapWon ?? null,
    isListedKorea: true,
    isMapConstituent: true,
    legacyId: c.id,
    owningSector: 'metal',
  });

  const hub = LANE_HUBS.find((h) => h.lane === lane);
  if (hub) {
    if (addEdge({
      id: `member-${c.ticker}-${hub.lane}`,
      source: id,
      target: hub.id,
      type: 'member_of',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: `${hub.nameKo} 가치사슬 분류`,
      labelEn: `${hub.nameEn} value-chain category`,
      evidence: [],
      confidence: 'high',
      lastVerifiedAt: AS_OF,
      noteKo: '밸류체인 분류이며 기업 간 거래를 의미하지 않습니다.',
      noteEn: 'Value-chain category only; not a trade relationship.',
      edgeOrigin: 'structuralGenerated',
    }, { action: 'add_structural', source: id, target: hub.id })) structuralGenerated += 1;
  }

  for (const focus of productFocusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    const noteKo = focus.type === 'exposed_to_commodity'
      ? '원자재·상품 가격 노출 분류. 공급계약·매출관계가 아닙니다.'
      : focus.type === 'used_in_end_market'
        ? '최종 수요 구조 분류. 특정 고객 공급관계가 아닙니다.'
        : '맵 제품·사업 분류 기반 구조 관계. 기업 간 공급계약을 의미하지 않습니다.';
    const noteEn = focus.type === 'exposed_to_commodity'
      ? 'Commodity price/cost exposure classification; not a supply contract or revenue relationship.'
      : focus.type === 'used_in_end_market'
        ? 'End-market demand structure; not a customer supply relationship.'
        : 'Structural classification from map fields; not an inter-company supply contract.';
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id,
      target: focus.id,
      type: focus.type,
      direction: 'source_to_target',
      status: 'reference',
      labelKo: focus.nameKo,
      labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo} (map semType/products classification)`),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      noteKo,
      noteEn,
      edgeOrigin: 'structuralGenerated',
      defaultHidden: false,
      excludesFromBusinessCoverage: focus.type === 'exposed_to_commodity' || focus.type === 'cross_sector_reference',
    }, { action: 'add_structural', source: id, target: focus.id, edgeType: focus.type })) structuralGenerated += 1;
  }
}

for (const [gid, meta] of Object.entries(GLOBAL_META)) {
  addNode({
    id: `global:${gid}`,
    type: 'global_company',
    nameKo: meta.nameKo,
    nameEn: meta.nameEn,
    country: meta.country,
    region: meta.region,
    lane: 'end_market',
    legacyId: gid,
    isMapConstituent: false,
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
      id: `peer-${c.ticker}-${p}`,
      source,
      target,
      type: 'peer',
      direction: 'undirected',
      status: 'peer',
      labelKo: '동종·참고 peer (레거시)',
      labelEn: 'Legacy peer reference',
      evidence: [],
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. 공급·계약·고객·원자재 가격 관계가 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not supply, contract, customer or commodity price relationship. Hidden by default.',
      edgeOrigin: 'legacyMigrated',
      defaultHidden: true,
    }, {
      action: 'demote_legacy_partner_to_peer',
      beforeType: 'partners_string',
      afterType: 'peer',
      source,
      target,
    })) {
      legacyMigrated += 1;
      demotedPeer += 1;
    }
  }
}

for (const ref of CROSS_SECTOR) {
  const source = `krx:${ref.ticker}`;
  if (!nodeIds.has(source) || !nodeIds.has(ref.target)) continue;
  if (addEdge({
    id: `cross-sector-${ref.ticker}-${ref.target.replace(':', '-')}`,
    source,
    target: ref.target,
    type: 'cross_sector_reference',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '타 섹터 경계 참조',
    labelEn: 'Cross-sector boundary reference',
    evidence: mkStructEv(`${source} cross_sector_reference ${ref.target}`),
    confidence: 'high',
    lastVerifiedAt: AS_OF,
    noteKo: ref.noteKo,
    noteEn: ref.noteEn,
    edgeOrigin: 'manuallyCurated',
    defaultHidden: false,
    crossSectorReference: true,
    referencedBySectors: ['metal'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true,
    duplicateBusinessCountExcluded: true,
    excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

logChange({
  action: 'defer_business_relationships',
  reason: 'Phase 5D does not invent supply/ownership/offtake/facility without DART/KIND/primary evidence',
});

const network = {
  sectorId: 'metal',
  model: 'metals_material_value_chain',
  layout: 'metalsValueChainEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  phase5dCuratedAt: AS_OF,
  lanes: [
    'raw_material', 'smelting_refining', 'steelmaking', 'nonferrous_metal',
    'rolling_processing', 'specialty_alloy', 'metal_products', 'recycling',
    'distribution_trading', 'end_market',
  ],
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = {
  ...computeMetalMetrics(network),
  legacyMigratedEdgeCount: legacyMigrated,
  structuralGeneratedEdgeCount: structuralGenerated,
  manuallyCuratedEdgeCount: manuallyCurated,
  removedUnsupportedPartnerCount: removedUnsupported,
  demotedLegacyPeerCount: demotedPeer,
};

const report = validateNetworkReport(network);
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({
  asOf: AS_OF,
  phase: '5D',
  reviewedBy: BY,
  listedCompanyCount: companies.length,
  metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR,
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  sectorId: 'metal',
  nodes: nodes.length,
  edges: edges.length,
  listed: companies.length,
  metrics: {
    structuralGeneratedEdgeCount: structuralGenerated,
    legacyMigratedEdgeCount: legacyMigrated,
    peerEdgeCount: network.metrics.peerEdgeCount,
    crossSectorReferenceCount: network.metrics.crossSectorReferenceCount,
    commodityExposureCount: network.metrics.commodityExposureCount,
    supplyRelationshipCount: network.metrics.supplyRelationshipCount,
    businessRelationOrphanCount: network.metrics.businessRelationOrphanCount,
    classificationOnlyCompanyCount: network.metrics.classificationOnlyCompanyCount,
  },
  failures: report.failures,
  warnings: report.warnings.slice(0, 15),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
