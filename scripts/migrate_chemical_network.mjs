/**
 * Migrate chemical legacy partners → data/networks/chemical.json
 * Petrochemical, specialty chemical, refining & gas value chain. No invented supply from peer strings.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeChemicalMetrics } from '../lib/relation_network/chemical_metrics.mjs';
import { CHEMICAL_CONFIG } from '../lib/curated_sector_configs.mjs';
import { productFocusForTicker } from '../lib/relation_network/chemical_network_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-30';
const BY = 'editorial_chemical';
const OUT_NET = join(ROOT, 'data', 'networks', 'chemical.json');
const OUT_LOG = join(ROOT, 'data', 'chemical_relation_changelog.json');

const CHAIN_LANE = {
  '석유화학': 'petrochemical',
  '정밀·특수화학': 'specialty_chemical',
  '정유·가스': 'refining_gas',
  '화학소재·기타': 'chemical_materials',
};

const LANE_HUBS = [
  { id: 'group:petrochemical', lane: 'petrochemical', nameKo: '석유화학', nameEn: 'Petrochemicals' },
  { id: 'group:specialty_chemical', lane: 'specialty_chemical', nameKo: '정밀·특수화학', nameEn: 'Specialty chemicals' },
  { id: 'group:refining_gas', lane: 'refining_gas', nameKo: '정유·가스', nameEn: 'Refining & gas' },
  { id: 'group:chemical_materials', lane: 'chemical_materials', nameKo: '화학소재·기타', nameEn: 'Chemical materials' },
];

const GLOBAL_META = Object.fromEntries(
  (CHEMICAL_CONFIG.globals || []).map((g) => [g.id, {
    nameKo: g.name,
    nameEn: g.name,
    country: g.country || '',
    region: g.region || 'us',
    sector: g.sector || '',
  }]),
);

const CROSS_SECTOR = [
  { ticker: '457190', target: 'sector:battery', noteKo: '전해액 첨가제는 battery 섹터와 겹침. confirmed 공급은 battery에서만.', noteEn: 'Electrolyte additives overlap battery; confirmed supply curated in battery only.' },
  { ticker: '298050', target: 'sector:auto', noteKo: '타이어코드·탄소섬유 적용은 auto와 겹침. OEM 공급은 auto에서만.', noteEn: 'Tire cord and carbon fiber overlap auto; OEM supply curated in auto only.' },
  { ticker: '014820', target: 'sector:kconsume', noteKo: '식품·음료 포장 CAN은 kconsume과 겹침. confirmed 유통은 kconsume에서만.', noteEn: 'Food/beverage cans overlap kconsume; confirmed distribution curated there only.' },
  { ticker: '004690', target: 'sector:powergrid', noteKo: '도시가스 인프라는 powergrid·에너지와 겹침.', noteEn: 'City-gas infrastructure overlaps powergrid/energy sectors.' },
];

const SECTOR_ANCHORS = [
  { id: 'sector:battery', nameKo: '배터리 섹터', nameEn: 'Battery sector', lane: 'chemical_materials' },
  { id: 'sector:auto', nameKo: '자동차 섹터', nameEn: 'Automotive sector', lane: 'chemical_materials' },
  { id: 'sector:kconsume', nameKo: 'K-소비 섹터', nameEn: 'K-consume sector', lane: 'chemical_materials' },
  { id: 'sector:powergrid', nameKo: '전력설비 섹터', nameEn: 'Power grid sector', lane: 'refining_gas' },
];

const seedByTicker = Object.fromEntries(CHEMICAL_CONFIG.companies.map((c) => [c.ticker, c]));
const html = fs.readFileSync(join(ROOT, 'chemical', 'korea_chemical_map.html'), 'utf8');
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
  const type = nodeType || (id.startsWith('refining_product:') ? 'refining_product' : 'chemical_product');
  addNode({ id, type, nameKo, nameEn, lane: lane || 'petrochemical' });
}
function laneForCompany(c) {
  const seed = seedByTicker[c.ticker];
  return CHAIN_LANE[c.chain] || CHAIN_LANE[seed?.chain] || 'petrochemical';
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
    legacyId: c.id, owningSector: 'chemical',
  });
  const hub = LANE_HUBS.find((h) => h.lane === lane);
  if (hub && addEdge({
    id: `member-${c.ticker}-${hub.lane}`, source: id, target: hub.id, type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: `${hub.nameKo} 분류`, labelEn: `${hub.nameEn} category`,
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    noteKo: '가치사슬 분류. 원료 공급·정유 도매·지분 관계가 아닙니다.',
    noteEn: 'Value-chain category only; not feedstock supply, wholesale refining or ownership.',
    edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
  }, { action: 'structural_member_of', ticker: c.ticker, lane })) structuralGenerated += 1;

  for (const focus of productFocusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    if (addEdge({
      id: `${focus.type}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id, target: focus.id, type: focus.type, direction: 'source_to_target', status: 'reference',
      labelKo: focus.nameKo, labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo}`), confidence: 'medium', lastVerifiedAt: AS_OF,
      noteKo: '제품·사업 구조 분류. 공급계약·정유 도매·지분이 아닙니다.',
      noteEn: 'Product/business structure classification; not supply, wholesale or ownership.',
      edgeOrigin: 'structuralGenerated', excludesFromBusinessCoverage: true, excludesFromOrphanResolution: true,
    }, { action: `structural_${focus.type}`, ticker: c.ticker, target: focus.id })) structuralGenerated += 1;
  }
}

for (const [gid, meta] of Object.entries(GLOBAL_META)) {
  addNode({
    id: `global:${gid}`, type: 'global_company', nameKo: meta.nameKo, nameEn: meta.nameEn,
    country: meta.country, region: meta.region, lane: 'petrochemical', legacyId: gid, isMapConstituent: false,
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
      labelKo: '글로벌 화학·정유 peer (레거시)', labelEn: 'Global chemical/refining peer (legacy)',
      evidence: [], confidence: 'low', lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. 원료 공급·정유 도매·지분 계약이 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not feedstock supply, wholesale or ownership contract. Hidden by default.',
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
    crossSectorReference: true, referencedBySectors: ['chemical'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true, duplicateBusinessCountExcluded: true, excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

const network = {
  version: 1, sectorId: 'chemical',
  model: 'chemicals_refining_value_chain_ecosystem', layout: 'chemicalRefiningValueChainEcosystem',
  asOf: AS_OF, lastReviewedAt: AS_OF, curatedBy: BY, chemicalCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane), _legacyFallback: false, nodes, edges, metrics: {},
};
network.metrics = {
  ...computeChemicalMetrics(network),
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

console.log('OK migrate chemical', {
  listed: companies.length, nodes: nodes.length, edges: edges.length,
  structuralGenerated, legacyMigrated, demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: report.warnings.length, failures: report.failures.length,
});
if (report.failures.length) { console.error(report.failures.slice(0, 20)); process.exitCode = 1; }
