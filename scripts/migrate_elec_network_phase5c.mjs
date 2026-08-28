/**
 * Phase 5C — migrate elec legacy partners → data/networks/elec.json
 * Electronics component value chain. No invented supply from peer strings.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeElecMetrics } from '../lib/relation_network/elec_metrics.mjs';
import { ELEC_CONFIG } from '../lib/curated_sector_configs.mjs';
import { productFocusForTicker } from '../lib/relation_network/elec_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_phase5c';
const OUT_NET = join(ROOT, 'data', 'networks', 'elec.json');
const OUT_LOG = join(ROOT, 'data', 'elec_relation_phase5c_changelog.json');

const CHAIN_LANE = {
  '가전': 'home_appliance',
  '디스플레이': 'display',
  '카메라·모듈': 'camera_module',
  '전자부품': 'electronic_component',
};

const LANE_HUBS = [
  { id: 'group:home_appliance', lane: 'home_appliance', nameKo: '가전', nameEn: 'Home appliances' },
  { id: 'group:display', lane: 'display', nameKo: '디스플레이', nameEn: 'Display' },
  { id: 'group:camera_module', lane: 'camera_module', nameKo: '카메라·모듈', nameEn: 'Camera & modules' },
  { id: 'group:electronic_component', lane: 'electronic_component', nameKo: '전자부품', nameEn: 'Electronic components' },
];

const GLOBAL_META = Object.fromEntries(
  (ELEC_CONFIG.globals || []).map((g) => [g.id, {
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
    ticker: '077360',
    target: 'sector:semiconductor',
    noteKo: '반도체 패키징 솔더·소재는 semiconductor 섹터 범위. elec에서 공급망 중복 생성하지 않음.',
    noteEn: 'Semiconductor packaging solder/materials owned by semiconductor sector; no duplicate supply here.',
  },
  {
    ticker: '011070',
    target: 'sector:auto',
    noteKo: '차량용 카메라·전장은 auto 섹터와 겹침. confirmed OEM 공급은 auto에서만 큐레이션.',
    noteEn: 'Automotive camera/electronics overlap auto sector; confirmed OEM supply curated in auto only.',
  },
  {
    ticker: '192650',
    target: 'sector:auto',
    noteKo: '차량 카메라·생체인증 모듈은 auto 섹터와 겹침.',
    noteEn: 'Automotive camera/biometric modules overlap auto sector scope.',
  },
  {
    ticker: '049070',
    target: 'sector:auto',
    noteKo: 'EMS·자동차 모듈 조립은 auto 섹터와 겹칠 수 있음.',
    noteEn: 'EMS and automotive module assembly may overlap auto sector.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:semiconductor', nameKo: '반도체 섹터', nameEn: 'Semiconductor sector', lane: 'end_market' },
  { id: 'sector:auto', nameKo: '자동차 섹터', nameEn: 'Automotive sector', lane: 'end_market' },
  { id: 'sector:powergrid', nameKo: '전력망 섹터', nameEn: 'Power grid sector', lane: 'end_market' },
  { id: 'sector:battery', nameKo: '배터리 섹터', nameEn: 'Battery sector', lane: 'end_market' },
];

function productFocusFromSeed(seed) {
  if (seed?.ticker) {
    return productFocusForTicker(seed.ticker);
  }
  return [];
}

const seedByTicker = Object.fromEntries(ELEC_CONFIG.companies.map((c) => [c.ticker, c]));

const html = fs.readFileSync(join(ROOT, 'elec', 'korea_elec_map.html'), 'utf8');
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
      device: false,
      role: true,
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

function ensureProductNode(id, nameKo, nameEn, lane) {
  const type = id.startsWith('end_market:') ? 'end_market'
    : id.startsWith('technology:') ? 'technology'
      : id.startsWith('component:') ? 'component' : 'product';
  addNode({ id, type, nameKo, nameEn, lane: lane || 'electronic_component' });
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
    noteKo: '타 섹터 경계 참조. elec에서 business edge 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary reference; no duplicate business edges in elec.',
  });
}

addNode({
  id: 'end_market:consumer_electronics',
  type: 'end_market',
  nameKo: '소비자 전자',
  nameEn: 'Consumer electronics',
  lane: 'end_market',
});
addNode({
  id: 'end_market:industrial_electronics',
  type: 'end_market',
  nameKo: '산업·장비 전자',
  nameEn: 'Industrial electronics',
  lane: 'end_market',
});
addNode({
  id: 'end_market:automotive_electronics',
  type: 'end_market',
  nameKo: '자동차 전장',
  nameEn: 'Automotive electronics',
  lane: 'end_market',
});

for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const seed = seedByTicker[c.ticker];
  const lane = CHAIN_LANE[c.chain] || CHAIN_LANE[seed?.chain] || 'electronic_component';
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
    owningSector: 'elec',
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

  for (const focus of productFocusFromSeed(seed || { ticker: c.ticker })) {
    ensureProductNode(focus.id, focus.nameKo, focus.nameEn, focus.lane || lane);
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
      noteKo: '맵 제품·사업 분류 기반 구조 관계. OEM 공급계약을 의미하지 않습니다.',
      noteEn: 'Structural classification from map fields; not an OEM supply contract.',
      edgeOrigin: 'structuralGenerated',
      defaultHidden: false,
    }, { action: 'add_structural', source: id, target: focus.id })) structuralGenerated += 1;
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
      noteKo: '기존 partners 문자열. 공급·계약·고객 관계가 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not supply, contract, or customer. Hidden by default.',
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
    referencedBySectors: ['elec'],
    owningSector: ref.target.replace('sector:', ''),
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

logChange({
  action: 'defer_business_relationships',
  reason: 'Phase 5C does not invent supply/ownership/device adoption without DART/KIND/primary evidence',
});

const network = {
  sectorId: 'elec',
  model: 'electronics_component_value_chain',
  layout: 'electronicsValueChainEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  phase5cCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane).concat(['end_market']),
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = {
  ...computeElecMetrics(network),
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
  phase: '5C',
  reviewedBy: BY,
  listedCompanyCount: companies.length,
  metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR,
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  sectorId: 'elec',
  nodes: nodes.length,
  edges: edges.length,
  listed: companies.length,
  metrics: {
    structuralGeneratedEdgeCount: structuralGenerated,
    legacyMigratedEdgeCount: legacyMigrated,
    peerEdgeCount: network.metrics.peerEdgeCount,
    crossSectorReferenceCount: network.metrics.crossSectorReferenceCount,
    actualSupplyRelationshipCount: network.metrics.actualSupplyRelationshipCount,
    businessRelationOrphanCount: network.metrics.businessRelationOrphanCount,
    classificationOnlyCompanyCount: network.metrics.classificationOnlyCompanyCount,
  },
  failures: report.failures,
  warnings: report.warnings.slice(0, 15),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
