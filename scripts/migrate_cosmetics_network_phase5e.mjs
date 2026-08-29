/**
 * Phase 5E — migrate cosmetics legacy partners → data/networks/cosmetics.json
 * Beauty brand / ODM / distribution ecosystem. No invented ODM customers or export contracts.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeCosmeticsMetrics } from '../lib/relation_network/cosmetics_metrics.mjs';
import { focusForTicker, COSMETICS_FOCUS_BY_TICKER } from '../lib/relation_network/cosmetics_brand_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_phase5e';
const OUT_NET = join(ROOT, 'data', 'networks', 'cosmetics.json');
const OUT_LOG = join(ROOT, 'data', 'cosmetics_relation_phase5e_changelog.json');

const CHAIN_LANE = {
  '브랜드': 'brand_owner',
  'ODM·OEM': 'odm_oem',
  '유통·채널': 'distributor',
  '미용기기': 'beauty_device',
};

/** Populated lanes only — no empty ingredient/packaging hubs. */
const LANE_HUBS = [
  { id: 'group:brand_owner', lane: 'brand_owner', nameKo: '브랜드', nameEn: 'Brand owners' },
  { id: 'group:odm_oem', lane: 'odm_oem', nameKo: 'ODM·OEM', nameEn: 'ODM / OEM' },
  { id: 'group:beauty_device', lane: 'beauty_device', nameKo: '미용기기', nameEn: 'Aesthetic devices' },
  { id: 'group:distributor', lane: 'distributor', nameKo: '유통·채널', nameEn: 'Distribution & channels' },
];

const GLOBAL_META = {
  glob_isrg: {
    nameKo: 'Intuitive Surgical', nameEn: 'Intuitive Surgical', country: '미국/USA', region: 'us', sector: 'Surgical robots',
  },
  glob_mdt: {
    nameKo: 'Medtronic', nameEn: 'Medtronic', country: '아일랜드/Ireland', region: 'eu', sector: 'Med devices',
  },
  glob_syk: {
    nameKo: 'Stryker', nameEn: 'Stryker', country: '미국/USA', region: 'us', sector: 'Ortho / devices',
  },
  glob_veev: {
    nameKo: 'Veeva Systems', nameEn: 'Veeva Systems', country: '미국/USA', region: 'us', sector: 'Life sciences software',
  },
};

const CROSS_SECTOR = [
  {
    ticker: '145020',
    target: 'sector:medtech',
    noteKo: '보툴리눔·필러 에스테틱 의료는 medtech 섹터와 겹침. 의료기기 허가·유통은 medtech에서만 큐레이션.',
    noteEn: 'Botulinum/filler aesthetics overlaps medtech; device regulation curated in medtech only.',
  },
  {
    ticker: '214150',
    target: 'sector:medtech',
    noteKo: 'HIFU·RF 에스테틱 의료기기는 medtech와 겹침.',
    noteEn: 'HIFU/RF aesthetic medical devices overlap medtech sector.',
  },
  {
    ticker: '214450',
    target: 'sector:medtech',
    noteKo: '파마리서치 주력 섹터는 medtech. 화장품 맵에는 cross-sector reference만.',
    noteEn: 'Pharmaresearch primary sector is medtech; cosmetics map holds boundary reference only.',
  },
  {
    ticker: '336570',
    target: 'sector:medtech',
    noteKo: '레이저·에스테틱 기기는 medtech 규제·유통과 겹침.',
    noteEn: 'Laser aesthetic devices overlap medtech regulation and distribution.',
  },
  {
    ticker: '214370',
    target: 'sector:bio',
    noteKo: '펩타이드·바이오 원료는 bio 섹터와 겹침. 임상·의약과 화장품 효능을 혼동하지 않음.',
    noteEn: 'Peptide/bio ingredients overlap bio sector; do not conflate pharma clinical with cosmetic claims.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:medtech', nameKo: '메드텍 섹터', nameEn: 'Medtech sector', lane: 'beauty_device' },
  { id: 'sector:bio', nameKo: '바이오 섹터', nameEn: 'Bio sector', lane: 'beauty_device' },
];

const html = fs.readFileSync(join(ROOT, 'cosmetics', 'korea_cosmetics_map.html'), 'utf8');
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

function mkStructEv(summary, provenance) {
  return [{
    title: summary,
    sourceType: provenance?.sourceType || 'editorial_structure',
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
      brand: true,
      brandOwner: false,
      productCategory: true,
      serviceType: false,
      contractStatus: false,
      validFrom: false,
      validTo: false,
    },
    accessedAt: AS_OF,
    evidenceUsageType: 'classification',
  }];
}

function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  const type = nodeType || (id.startsWith('brand:') ? 'brand'
    : id.startsWith('beauty_product:') ? 'product_category'
      : id.startsWith('manufacturing_service:') ? 'manufacturing_service'
        : id.startsWith('channel:') ? 'retail_channel' : 'product_category');
  addNode({ id, type, nameKo, nameEn, lane: lane || 'brand_owner' });
}

function laneForCompany(c) {
  const spec = COSMETICS_FOCUS_BY_TICKER[c.ticker];
  return spec?.lane || CHAIN_LANE[c.chain] || 'brand_owner';
}

for (const h of LANE_HUBS) {
  addNode({
    id: h.id,
    type: 'group',
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
    noteKo: '타 섹터 경계 참조. cosmetics에서 business edge 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary reference; no duplicate business edges in cosmetics.',
  });
}

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
    owningSector: 'cosmetics',
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
      noteKo: '밸류체인 분류이며 기업 간 거래·ODM 계약·유통계약을 의미하지 않습니다.',
      noteEn: 'Value-chain category only; not trade, ODM contract or distribution agreement.',
      edgeOrigin: 'structuralGenerated',
    }, { action: 'add_structural', source: id, target: hub.id })) structuralGenerated += 1;
  }

  const spec = COSMETICS_FOCUS_BY_TICKER[c.ticker];
  for (const focus of focusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    const isBrand = focus.type === 'owns_brand' || focus.type === 'operates_brand' || focus.type === 'licenses_brand';
    const isOdm = focus.type === 'provides_odm' || focus.type === 'provides_oem';
    const noteKo = isBrand
      ? '브랜드 포트폴리오 구조. 법적 소유·운영·라이선스는 사업보고서로 추가 검증 필요. ODM 고객·유통계약이 아닙니다.'
      : isOdm
        ? 'ODM/OEM 서비스 역할 분류. 특정 브랜드 고객·계약을 추정하지 않습니다.'
        : focus.type === 'used_in_product_category'
          ? '제품군 분류. 시장 노출·수출 계약을 의미하지 않습니다.'
          : '맵 사업 분류 기반 구조 관계. 기업 간 공급·유통계약을 의미하지 않습니다.';
    const noteEn = isBrand
      ? 'Brand portfolio structure; legal ownership/operation requires filing review. Not ODM customer or distribution contract.'
      : isOdm
        ? 'ODM/OEM service role classification; no inferred brand customers.'
        : focus.type === 'used_in_product_category'
          ? 'Product category classification; not market exposure or export contract.'
          : 'Structural classification from map fields; not inter-company supply or distribution contract.';
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id,
      target: focus.id,
      type: focus.type,
      direction: 'source_to_target',
      status: 'reference',
      labelKo: focus.nameKo,
      labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo}`, spec?.provenance),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      noteKo,
      noteEn,
      edgeOrigin: 'structuralGenerated',
      defaultHidden: false,
      excludesFromBusinessCoverage: true,
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
    lane: 'beauty_device',
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
      labelKo: '글로벌 에스테틱·메드텍 peer (레거시)',
      labelEn: 'Global aesthetic/medtech peer reference (legacy)',
      evidence: [],
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. ODM 고객·유통계약·공급관계·광고모델 계약이 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not ODM customer, distribution, supply or endorsement contract. Hidden by default.',
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
    referencedBySectors: ['cosmetics'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true,
    duplicateBusinessCountExcluded: true,
    excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

logChange({
  action: 'defer_business_relationships',
  reason: 'Phase 5E does not invent ODM customers, distribution contracts, brand M&A or endorsement without DART/KIND/primary evidence',
});

const network = {
  sectorId: 'cosmetics',
  model: 'beauty_brand_manufacturing_distribution_ecosystem',
  layout: 'beautyValueChainEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  phase5eCuratedAt: AS_OF,
  lanes: ['brand_owner', 'odm_oem', 'beauty_device', 'distributor'],
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = {
  ...computeCosmeticsMetrics(network),
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
  phase: '5E',
  reviewedBy: BY,
  listedCompanyCount: companies.length,
  metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR,
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  sectorId: 'cosmetics',
  nodes: nodes.length,
  edges: edges.length,
  listed: companies.length,
  metrics: {
    structuralGeneratedEdgeCount: structuralGenerated,
    legacyMigratedEdgeCount: legacyMigrated,
    peerEdgeCount: network.metrics.peerEdgeCount,
    crossSectorReferenceCount: network.metrics.crossSectorReferenceCount,
    brandNodeCount: network.metrics.brandNodeCount,
    operatedBrandRelationshipCount: network.metrics.operatedBrandRelationshipCount,
    odmRelationshipCount: network.metrics.odmRelationshipCount,
    confirmedBusinessEdgeCount: network.metrics.confirmedBusinessEdgeCount,
    businessRelationOrphanCount: network.metrics.businessRelationOrphanCount,
    classificationOnlyCompanyCount: network.metrics.classificationOnlyCompanyCount,
  },
  failures: report.failures,
  warnings: report.warnings.slice(0, 15),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
