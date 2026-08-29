/**
 * Phase 5F — migrate kcontent legacy partners → data/networks/kcontent.json
 * Content IP / production / distribution ecosystem. No invented exclusives or fan lists.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeKcontentMetrics } from '../lib/relation_network/kcontent_metrics.mjs';
import { focusForTicker, KCONTENT_FOCUS_BY_TICKER } from '../lib/relation_network/kcontent_ip_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-29';
const BY = 'editorial_phase5f';
const OUT_NET = join(ROOT, 'data', 'networks', 'kcontent.json');
const OUT_LOG = join(ROOT, 'data', 'kcontent_relation_phase5f_changelog.json');

const CHAIN_LANE = {
  'K-pop·엔터테인먼트': 'label_agency',
  '드라마·미디어·웹툰·컨텐츠': 'production_studio',
  '게임': 'ip_rights',
};

const LANE_HUBS = [
  { id: 'group:label_agency', lane: 'label_agency', nameKo: '레이블·기획사', nameEn: 'Labels / agencies' },
  { id: 'group:production_studio', lane: 'production_studio', nameKo: '제작·스튜디오', nameEn: 'Production / studios' },
  { id: 'group:ip_rights', lane: 'ip_rights', nameKo: '게임·IP', nameEn: 'Games / IP' },
  { id: 'group:distributor', lane: 'distributor', nameKo: '배급·상영', nameEn: 'Distribution / exhibition' },
  { id: 'group:platform', lane: 'platform', nameKo: '플랫폼', nameEn: 'Platforms' },
];

const CROSS_SECTOR = [
  {
    ticker: '352820',
    target: 'sector:kconsume',
    noteKo: '굿즈·브랜드 협업은 kconsume/cosmetics와 겹침. business orphan을 해소하지 않음.',
    noteEn: 'Merch/brand collab overlaps kconsume/cosmetics; does not clear business orphans.',
  },
  {
    ticker: '035760',
    target: 'sector:telecom',
    noteKo: 'IPTV·통신 플랫폼 유통은 telecom owning sector일 수 있음.',
    noteEn: 'IPTV/telecom platform distribution may be owned by telecom sector.',
  },
  {
    ticker: '376300',
    target: 'sector:software',
    noteKo: '팬 플랫폼 기술 스택은 software와 구분. 앱 기술≠콘텐츠 유통계약.',
    noteEn: 'Fan-platform tech stack overlaps software; app tech ≠ content distribution contract.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:kconsume', nameKo: 'K-소비 섹터', nameEn: 'K-consume sector', lane: 'label_agency' },
  { id: 'sector:telecom', nameKo: '통신 섹터', nameEn: 'Telecom sector', lane: 'platform' },
  { id: 'sector:software', nameKo: '소프트웨어 섹터', nameEn: 'Software sector', lane: 'platform' },
];

const LEGACY_PEER_DEMOTIONS = [
  { from: '352820', partner: 'spotify', note: 'platform availability ≠ exclusive' },
  { from: '035900', partner: 'spotify', note: 'platform availability ≠ exclusive' },
  { from: '041510', partner: 'umg', note: 'label peer / licensing theme' },
  { from: '122870', partner: 'warner', note: 'label peer / licensing theme' },
  { from: '035760', partner: 'netflix', note: 'streaming availability ≠ exclusive' },
  { from: '253450', partner: 'netflix', note: 'streaming availability ≠ exclusive' },
  { from: '259960', partner: 'tencent', note: 'global game peer' },
];

const GLOBAL_PEER = {
  spotify: { id: 'global:spotify', nameKo: 'Spotify', nameEn: 'Spotify' },
  umg: { id: 'global:universal-music', nameKo: 'Universal Music Group', nameEn: 'Universal Music Group' },
  warner: { id: 'global:warner-music', nameKo: 'Warner Music Group', nameEn: 'Warner Music Group' },
  netflix: { id: 'global:netflix', nameKo: 'Netflix', nameEn: 'Netflix' },
  tencent: { id: 'global:tencent', nameKo: 'Tencent', nameEn: 'Tencent' },
};

const html = fs.readFileSync(join(ROOT, 'kcontent', 'korea_kcontent_map.html'), 'utf8');
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
      artist: true,
      ip: true,
      contractStatus: false,
      exclusive: false,
      validFrom: false,
      validTo: false,
    },
    accessedAt: AS_OF,
    evidenceUsageType: 'classification',
  }];
}

function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  addNode({ id, type: nodeType, nameKo, nameEn, lane });
}

function laneForCompany(c) {
  const spec = KCONTENT_FOCUS_BY_TICKER[c.ticker];
  return spec?.lane || CHAIN_LANE[c.chain] || 'ip_rights';
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
    noteKo: '타 섹터 경계 참조. kcontent에서 business edge 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary; no duplicate business edges in kcontent.',
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
    owningSector: 'kcontent',
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
  const artists = (focus?.artists || []).slice(0, 3);
  for (const a of artists) {
    ensureFocusNode(a.id, a.nameKo, a.nameEn, 'artist_or_group', 'label_agency');
    if (addEdge({
      id: `represents-${c.ticker}-${a.id.replace(/:/g, '-')}`,
      source: id,
      target: a.id,
      type: 'represents_artist',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '공식 소속(구조 분류·전속계약 미확정)',
      labelEn: 'Public affiliation (structural; exclusive contract not confirmed)',
      evidence: mkStructEv('Artist affiliation classification from public agency roster'),
      confidence: 'medium',
      edgeOrigin: 'structuralGenerated',
      relationClass: 'structural',
      asOf: AS_OF,
      exclusive: null,
      contractStatus: 'unknown',
      noteKo: '전속·기간 미확인 시 영구 active 금지',
      noteEn: 'Must not mark permanent active without exclusive term evidence',
    }, { action: 'structural_represents_artist', ticker: c.ticker, artist: a.id })) {
      structuralGenerated += 1;
    }
  }

  const ips = (focus?.ips || []).slice(0, 3);
  for (const ip of ips) {
    ensureFocusNode(ip.id, ip.nameKo, ip.nameEn, 'content_ip', lane);
    if (addEdge({
      id: `controls-ip-${c.ticker}-${ip.id.replace(/:/g, '-')}`,
      source: id,
      target: ip.id,
      type: 'controls_ip',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: 'IP 사업권·포트폴리오(법적 소유 미확정)',
      labelEn: 'IP portfolio / control (legal ownership not confirmed)',
      evidence: mkStructEv('IP association from public portfolio classification'),
      confidence: 'medium',
      edgeOrigin: 'structuralGenerated',
      relationClass: 'structural',
      asOf: AS_OF,
      noteKo: '제작사≠자동 IP 소유자. owns_ip confirmed는 DART 등 필요',
      noteEn: 'Producer ≠ automatic IP owner; owns_ip confirmed needs primary evidence',
    }, { action: 'structural_controls_ip', ticker: c.ticker, ip: ip.id })) {
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
      labelKo: '콘텐츠 카테고리 분류',
      labelEn: 'Content category classification',
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

for (const row of LEGACY_PEER_DEMOTIONS) {
  const g = GLOBAL_PEER[row.partner];
  if (!g || !nodeIds.has(`krx:${row.from}`)) {
    removedUnsupported += 1;
    logChange({ action: 'removed_unsupported_partner', ...row });
    continue;
  }
  addNode({
    id: g.id, type: 'global_company', nameKo: g.nameKo, nameEn: g.nameEn,
    lane: 'platform', isMapConstituent: false,
  });
  if (addEdge({
    id: `peer-${row.from}-${row.partner}`,
    source: `krx:${row.from}`,
    target: g.id,
    type: 'peer',
    direction: 'undirected',
    status: 'peer',
    labelKo: '글로벌 peer/플랫폼 참고(독점 유통 아님)',
    labelEn: 'Global peer / platform reference (not exclusive distribution)',
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
  sectorId: 'kcontent',
  model: 'content_ip_production_distribution_ecosystem',
  layout: 'contentIpDistributionEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  curatedBy: BY,
  phase5fCuratedAt: AS_OF,
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = computeKcontentMetrics(network);
const report = validateNetworkReport(network);
if ((report.failures || []).length) {
  console.error('kcontent validate failures', report.failures);
  process.exit(1);
}

fs.mkdirSync(dirname(OUT_NET), { recursive: true });
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({
  phase: '5F',
  sector: 'kcontent',
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

console.log('OK migrate kcontent', {
  listed: companies.length,
  nodes: nodes.length,
  edges: edges.length,
  structuralGenerated,
  legacyMigrated,
  demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: (report.warnings || []).length,
});
