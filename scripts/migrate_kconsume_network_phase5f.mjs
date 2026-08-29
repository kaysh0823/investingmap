/**
 * Phase 5F — migrate kconsume legacy partners → data/networks/kconsume.json
 * Consumer brand / distribution ecosystem. No invented retail or export contracts.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeKconsumeMetrics } from '../lib/relation_network/kconsume_metrics.mjs';
import { focusForTicker, KCONSUME_FOCUS_BY_TICKER } from '../lib/relation_network/kconsume_brand_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-29';
const BY = 'editorial_phase5f';
const OUT_NET = join(ROOT, 'data', 'networks', 'kconsume.json');
const OUT_LOG = join(ROOT, 'data', 'kconsume_relation_phase5f_changelog.json');

const CHAIN_LANE = {
  '음식·라면·식품': 'brand_owner',
  '패션': 'brand_owner',
  '쇼핑/유통': 'retail_channel',
  '여행·레저·항공': 'leisure_lifestyle',
};

const LANE_HUBS = [
  { id: 'group:brand_owner', lane: 'brand_owner', nameKo: '브랜드', nameEn: 'Brand owners' },
  { id: 'group:manufacturing', lane: 'manufacturing', nameKo: '제조·소재', nameEn: 'Manufacturing' },
  { id: 'group:retail_channel', lane: 'retail_channel', nameKo: '유통·리테일', nameEn: 'Retail / distribution' },
  { id: 'group:leisure_lifestyle', lane: 'leisure_lifestyle', nameKo: '여행·레저', nameEn: 'Travel / leisure' },
];

const CROSS_SECTOR = [
  {
    ticker: '097950',
    target: 'sector:cosmetics',
    noteKo: '뷰티·퍼스널케어는 cosmetics 중심. kconsume는 식품·리테일 경계만 참조.',
    noteEn: 'Beauty/personal care owned by cosmetics; kconsume holds food/retail boundary only.',
  },
  {
    ticker: '280360',
    target: 'sector:kcontent',
    noteKo: '캐릭터·IP 콜라보·굿즈는 kcontent IP와 겹칠 수 있음. 계약 없이 business로 집계하지 않음.',
    noteEn: 'Character/IP collab may overlap kcontent; not counted as business without contract evidence.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:cosmetics', nameKo: '화장품 섹터', nameEn: 'Cosmetics sector', lane: 'brand_owner' },
  { id: 'sector:kcontent', nameKo: 'K-콘텐츠 섹터', nameEn: 'K-content sector', lane: 'brand_owner' },
];

const LEGACY_PEER_DEMOTIONS = [
  { from: '003230', partner: 'nestle', note: 'theme/global peer → peer defaultHidden' },
  { from: '271560', partner: 'pepsico', note: 'theme/global peer → peer defaultHidden' },
  { from: '139480', partner: 'costco', note: 'retail peer → peer defaultHidden' },
  { from: '008770', partner: 'marriott', note: 'hospitality peer → peer defaultHidden' },
];

const html = fs.readFileSync(join(ROOT, 'kconsume', 'korea_kconsume_map.html'), 'utf8');
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
      brand: true,
      brandOwner: false,
      productCategory: true,
      contractStatus: false,
    },
    accessedAt: AS_OF,
    evidenceUsageType: 'classification',
  }];
}

function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  addNode({ id, type: nodeType, nameKo, nameEn, lane });
}

function laneForCompany(c) {
  const spec = KCONSUME_FOCUS_BY_TICKER[c.ticker];
  return spec?.lane || CHAIN_LANE[c.chain] || 'brand_owner';
}

for (const h of LANE_HUBS) {
  addNode({
    id: h.id, type: 'group', nameKo: h.nameKo, nameEn: h.nameEn,
    lane: h.lane, role: h.lane, layer: h.lane,
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
    noteKo: '타 섹터 경계 참조. kconsume에서 business edge 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary; no duplicate business edges in kconsume.',
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
    owningSector: 'kconsume',
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
      edgeOrigin: 'structuralGenerated',
      relationClass: 'structural',
      asOf: AS_OF,
    }, { action: 'structural_member_of', ticker: c.ticker, lane: hub.lane })) {
      structuralGenerated += 1;
    }
  }

  const focus = focusForTicker(c.ticker);
  const brands = (focus?.brands || []).slice(0, 3);
  for (const b of brands) {
    ensureFocusNode(b.id, b.nameKo, b.nameEn, 'brand', 'brand_owner');
    if (addEdge({
      id: `operates-brand-${c.ticker}-${b.id.replace(/:/g, '-')}`,
      source: id,
      target: b.id,
      type: 'operates_brand',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '브랜드 운영(구조 분류·법적 소유 미확정)',
      labelEn: 'Operates brand (structural; legal ownership not confirmed)',
      evidence: mkStructEv('Brand association from public brand portfolio classification'),
      confidence: 'medium',
      edgeOrigin: 'structuralGenerated',
      relationClass: 'structural',
      asOf: AS_OF,
      noteKo: '브랜드 홈페이지만으로 owns_brand confirmed 금지',
      noteEn: 'Must not confirm owns_brand from brand homepage alone',
    }, { action: 'structural_operates_brand', ticker: c.ticker, brand: b.id })) {
      structuralGenerated += 1;
    }
  }

  const cats = (focus?.categories || []).slice(0, 2);
  for (const cat of cats) {
    ensureFocusNode(cat.id, cat.nameKo, cat.nameEn, 'product_category', lane);
    if (addEdge({
      id: `specializes-${c.ticker}-${cat.id.replace(/:/g, '-')}`,
      source: id,
      target: cat.id,
      type: 'specializes_in',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '제품군 분류',
      labelEn: 'Product category classification',
      evidence: mkStructEv('Category from map chain / editorial focus'),
      confidence: 'high',
      edgeOrigin: 'structuralGenerated',
      relationClass: 'structural',
      asOf: AS_OF,
    }, { action: 'structural_specializes_in', ticker: c.ticker, category: cat.id })) {
      structuralGenerated += 1;
    }
  }
}

// Legacy theme/global partners → peer only (defaultHidden). No contract inference.
const GLOBAL_PEER = {
  nestle: { id: 'global:nestle', nameKo: 'Nestlé', nameEn: 'Nestlé' },
  pepsico: { id: 'global:pepsico', nameKo: 'PepsiCo', nameEn: 'PepsiCo' },
  costco: { id: 'global:costco', nameKo: 'Costco', nameEn: 'Costco' },
  marriott: { id: 'global:marriott', nameKo: 'Marriott', nameEn: 'Marriott' },
};

for (const row of LEGACY_PEER_DEMOTIONS) {
  const g = GLOBAL_PEER[row.partner];
  if (!g || !nodeIds.has(`krx:${row.from}`)) {
    removedUnsupported += 1;
    logChange({ action: 'removed_unsupported_partner', ...row });
    continue;
  }
  addNode({
    id: g.id, type: 'global_company', nameKo: g.nameKo, nameEn: g.nameEn,
    lane: 'brand_owner', isMapConstituent: false, country: '',
  });
  if (addEdge({
    id: `peer-${row.from}-${row.partner}`,
    source: `krx:${row.from}`,
    target: g.id,
    type: 'peer',
    direction: 'undirected',
    status: 'peer',
    labelKo: '글로벌 peer/참고',
    labelEn: 'Global peer / reference',
    evidence: [],
    confidence: 'low',
    edgeOrigin: 'legacyMigrated',
    relationClass: 'peer',
    defaultHidden: true,
    asOf: AS_OF,
  }, { action: 'demote_legacy_partner_to_peer', ...row })) {
    legacyMigrated += 1;
    demotedPeer += 1;
  }
}

for (const cs of CROSS_SECTOR) {
  if (cs.skipIfMissing && !nodeIds.has(`krx:${cs.ticker}`)) continue;
  if (!nodeIds.has(`krx:${cs.ticker}`)) continue;
  if (addEdge({
    id: `xref-${cs.ticker}-${cs.target.replace(/:/g, '-')}`,
    source: `krx:${cs.ticker}`,
    target: cs.target,
    type: 'cross_sector_reference',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '인접 섹터 경계 참조',
    labelEn: 'Adjacent sector boundary reference',
    evidence: mkStructEv(cs.noteEn),
    confidence: 'high',
    edgeOrigin: 'structuralGenerated',
    relationClass: 'structural',
    excludesFromBusinessCoverage: true,
    excludesFromOrphanResolution: true,
    duplicateBusinessCountExcluded: true,
    defaultHidden: true,
    asOf: AS_OF,
    noteKo: cs.noteKo,
    noteEn: cs.noteEn,
  }, { action: 'cross_sector_reference', ticker: cs.ticker, target: cs.target })) {
    structuralGenerated += 1;
    manuallyCurated += 1;
  }
}

const network = {
  version: 1,
  sectorId: 'kconsume',
  model: 'consumer_brand_distribution_ecosystem',
  layout: 'consumerBrandDistributionEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  curatedBy: BY,
  phase5fCuratedAt: AS_OF,
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = computeKconsumeMetrics(network);
const report = validateNetworkReport(network);
if ((report.failures || []).length) {
  console.error('kconsume validate failures', report.failures);
  process.exit(1);
}

fs.mkdirSync(dirname(OUT_NET), { recursive: true });
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({
  phase: '5F',
  sector: 'kconsume',
  asOf: AS_OF,
  listedCompanyCount: companies.length,
  nodeCount: nodes.length,
  edgeCount: edges.length,
  structuralGenerated,
  legacyMigrated,
  manuallyCurated,
  removedUnsupported,
  demotedPeer,
  confirmedBusinessEdgeCount: network.metrics.confirmedBusinessEdgeCount,
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log('OK migrate kconsume', {
  listed: companies.length,
  nodes: nodes.length,
  edges: edges.length,
  structuralGenerated,
  legacyMigrated,
  demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: (report.warnings || []).length,
});
