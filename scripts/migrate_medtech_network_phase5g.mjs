/**
 * Phase 5G — migrate medtech legacy partners → data/networks/medtech.json
 * Medical device / specialty / regulatory ecosystem.
 * No invented hospital supply, distribution, or clearance-as-contract edges.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeMedtechMetrics } from '../lib/relation_network/medtech_metrics.mjs';
import { focusForTicker, MEDTECH_FOCUS_BY_TICKER } from '../lib/relation_network/medtech_device_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-29';
const BY = 'editorial_phase5g';
const OUT_NET = join(ROOT, 'data', 'networks', 'medtech.json');
const OUT_LOG = join(ROOT, 'data', 'medtech_relation_phase5g_changelog.json');

const CHAIN_LANE = {
  '진단·IVD': 'in_vitro_diagnostics',
  '의료장비·수술': 'surgical_device',
  '임플란트·치과': 'dental_device',
};

/** Populated lanes only — empty 미용기기 chain has no hub. */
const LANE_HUBS = [
  { id: 'group:in_vitro_diagnostics', lane: 'in_vitro_diagnostics', nameKo: '진단·IVD', nameEn: 'IVD / diagnostics' },
  { id: 'group:digital_health_samd', lane: 'digital_health_samd', nameKo: '디지털헬스·SaMD', nameEn: 'Digital health / SaMD' },
  { id: 'group:patient_monitoring', lane: 'patient_monitoring', nameKo: '환자모니터링', nameEn: 'Patient monitoring' },
  { id: 'group:surgical_device', lane: 'surgical_device', nameKo: '의료장비·수술', nameEn: 'Surgical / equipment' },
  { id: 'group:dental_device', lane: 'dental_device', nameKo: '임플란트·치과', nameEn: 'Dental devices' },
];

const GLOBAL_META = {
  roche: { nameKo: 'Roche', nameEn: 'Roche', country: '스위스/Switzerland', region: 'eu', sector: 'Diagnostics' },
  abbott: { nameKo: 'Abbott', nameEn: 'Abbott', country: '미국/USA', region: 'us', sector: 'Diagnostics / devices' },
  siemens_health: { nameKo: 'Siemens Healthineers', nameEn: 'Siemens Healthineers', country: '독일/Germany', region: 'eu', sector: 'Imaging & diagnostics' },
  ge_health: { nameKo: 'GE HealthCare', nameEn: 'GE HealthCare', country: '미국/USA', region: 'us', sector: 'Imaging' },
  philips: { nameKo: 'Philips', nameEn: 'Philips', country: '네덜란드/Netherlands', region: 'eu', sector: 'Imaging & monitoring' },
  straumann: { nameKo: 'Straumann', nameEn: 'Straumann', country: '스위스/Switzerland', region: 'eu', sector: 'Dental implants' },
  dentsply: { nameKo: 'Dentsply Sirona', nameEn: 'Dentsply Sirona', country: '미국/USA', region: 'us', sector: 'Dental' },
  zimmer: { nameKo: 'Zimmer Biomet', nameEn: 'Zimmer Biomet', country: '미국/USA', region: 'us', sector: 'Ortho / dental' },
  intuitive: { nameKo: 'Intuitive Surgical', nameEn: 'Intuitive Surgical', country: '미국/USA', region: 'us', sector: 'Surgical robots' },
  stryker: { nameKo: 'Stryker', nameEn: 'Stryker', country: '미국/USA', region: 'us', sector: 'Ortho / devices' },
  medtronic: { nameKo: 'Medtronic', nameEn: 'Medtronic', country: '아일랜드/Ireland', region: 'eu', sector: 'Med devices' },
  boston_sci: { nameKo: 'Boston Scientific', nameEn: 'Boston Scientific', country: '미국/USA', region: 'us', sector: 'Med devices' },
  olympus: { nameKo: 'Olympus', nameEn: 'Olympus', country: '일본/Japan', region: 'jp', sector: 'Endoscopy' },
  illumina: { nameKo: 'Illumina', nameEn: 'Illumina', country: '미국/USA', region: 'us', sector: 'Sequencing / genomics' },
};

const CROSS_SECTOR = [
  {
    ticker: '328130',
    target: 'sector:software',
    noteKo: '의료 AI·영상 소프트웨어 기술은 software와 교차. 일반 AI 발표≠의료기기 인허가.',
    noteEn: 'Medical AI/imaging software overlaps software; general AI announcements are not device clearances.',
  },
  {
    ticker: '060280',
    target: 'sector:robot',
    noteKo: '수술로봇은 robot과 교차 가능. 로봇 기술 보유≠의료기기 허가·공급계약.',
    noteEn: 'Surgical robots may cross-reference robot sector; robot capability ≠ clearance or supply contract.',
  },
  {
    ticker: '096530',
    target: 'sector:bio',
    noteKo: '분자진단은 의약품·백신 임상(bio)과 구분. IVD 의료기기 분류를 신약 파이프라인으로 오인하지 않음.',
    noteEn: 'Molecular IVD is distinct from drug/vaccine clinical pipelines in bio.',
  },
  {
    ticker: '145720',
    target: 'sector:cosmetics',
    noteKo: '치과 임플란트는 일반 화장품·홈뷰티(cosmetics)와 별개. 에스테틱 의료기기 허가는 medtech 기준.',
    noteEn: 'Dental implants are separate from cosmetics/home beauty; aesthetic device clearances stay under medtech rules.',
  },
];

const SECTOR_ANCHORS = [
  { id: 'sector:software', nameKo: '소프트웨어 섹터', nameEn: 'Software sector', lane: 'digital_health_samd' },
  { id: 'sector:robot', nameKo: '로봇 섹터', nameEn: 'Robot sector', lane: 'surgical_device' },
  { id: 'sector:bio', nameKo: '바이오 섹터', nameEn: 'Bio sector', lane: 'in_vitro_diagnostics' },
  { id: 'sector:cosmetics', nameKo: '화장품 섹터', nameEn: 'Cosmetics sector', lane: 'dental_device' },
];

const html = fs.readFileSync(join(ROOT, 'medtech', 'korea_medtech_map.html'), 'utf8');
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
      product: true,
      contractStatus: false,
      validFrom: false,
      validTo: false,
    },
    accessedAt: AS_OF,
    evidenceUsageType: 'classification',
  }];
}

function ensureFocusNode(id, nameKo, nameEn, nodeType, lane) {
  addNode({
    id,
    type: nodeType || (id.startsWith('specialty:') ? 'clinical_specialty' : 'device_category'),
    nameKo,
    nameEn,
    lane: lane || 'in_vitro_diagnostics',
  });
}

function laneForCompany(c) {
  const spec = MEDTECH_FOCUS_BY_TICKER[c.ticker];
  return spec?.lane || CHAIN_LANE[c.chain] || 'in_vitro_diagnostics';
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
    noteKo: '타 섹터 경계 참조. medtech에서 business edge 중복 집계하지 않음.',
    noteEn: 'Cross-sector boundary reference; no duplicate business edges in medtech.',
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
    owningSector: 'medtech',
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
      noteKo: '밸류체인 분류이며 공급·유통·병원 납품·인허가 계약을 의미하지 않습니다.',
      noteEn: 'Value-chain category only; not supply, distribution, hospital delivery or clearance contract.',
      edgeOrigin: 'structuralGenerated',
      excludesFromBusinessCoverage: true,
      excludesFromOrphanResolution: true,
    }, { action: 'structural_member_of', ticker: c.ticker, lane })) structuralGenerated += 1;
  }

  const spec = MEDTECH_FOCUS_BY_TICKER[c.ticker];
  for (const focus of focusForTicker(c.ticker)) {
    ensureFocusNode(focus.id, focus.nameKo, focus.nameEn, focus.nodeType, focus.lane || lane);
    const isSpecialty = focus.type === 'used_in_specialty';
    const noteKo = isSpecialty
      ? '진료영역 구조 분류. 병원 공급계약·임상효과를 의미하지 않습니다.'
      : '제품군 구조 분류. 인허가·유통·병원 납품 계약이 아닙니다.';
    const noteEn = isSpecialty
      ? 'Clinical specialty classification; not hospital supply or clinical efficacy claim.'
      : 'Device category classification; not clearance, distribution or hospital delivery contract.';
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
      excludesFromOrphanResolution: true,
    }, { action: `structural_${focus.type}`, ticker: c.ticker, target: focus.id })) structuralGenerated += 1;
  }
}

const referencedGlobals = new Set();
for (const c of companies) {
  for (const p of c.partners || []) referencedGlobals.add(p);
}

for (const [gid, meta] of Object.entries(GLOBAL_META)) {
  if (!referencedGlobals.has(gid)) continue;
  addNode({
    id: `global:${gid}`,
    type: 'global_company',
    nameKo: meta.nameKo,
    nameEn: meta.nameEn,
    country: meta.country,
    region: meta.region,
    lane: 'in_vitro_diagnostics',
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
      labelKo: '글로벌 메드텍 peer (레거시)',
      labelEn: 'Global medtech peer reference (legacy)',
      evidence: [],
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      noteKo: '기존 partners 문자열. 공급·유통·병원 납품·인허가·OEM 계약이 아닙니다. 기본 숨김.',
      noteEn: 'Legacy partners string. Not supply, distribution, hospital delivery, clearance or OEM contract. Hidden by default.',
      edgeOrigin: 'legacyMigrated',
      defaultHidden: true,
      excludesFromBusinessCoverage: true,
      excludesFromOrphanResolution: true,
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
    referencedBySectors: ['medtech'],
    owningSector: ref.target.replace('sector:', ''),
    excludesFromBusinessCoverage: true,
    duplicateBusinessCountExcluded: true,
    excludesFromOrphanResolution: true,
  }, { action: 'add_cross_sector_reference', source, target: ref.target })) manuallyCurated += 1;
}

logChange({
  action: 'defer_business_and_clearance_relationships',
  reason: 'Phase 5G does not invent hospital supply, exclusive distribution, OEM, or clearance-as-contract without MFDS/FDA/DART primary evidence. No clearance nodes without verified identifiers.',
});

const network = {
  version: 1,
  sectorId: 'medtech',
  model: 'medical_device_product_regulatory_ecosystem',
  layout: 'medicalDeviceEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  curatedBy: BY,
  phase5gCuratedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane),
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = {
  ...computeMedtechMetrics(network),
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
  phase: '5G',
  reviewedBy: BY,
  listedCompanyCount: companies.length,
  nodeCount: nodes.length,
  edgeCount: edges.length,
  structuralGenerated,
  legacyMigrated,
  manuallyCurated,
  demotedPeer,
  removedUnsupported,
  confirmedBusinessEdgeCount: network.metrics.confirmedBusinessEdgeCount,
  metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  crossSectorBoundary: CROSS_SECTOR,
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log('OK migrate medtech', {
  listed: companies.length,
  nodes: nodes.length,
  edges: edges.length,
  structuralGenerated,
  legacyMigrated,
  demotedPeer,
  business: network.metrics.confirmedBusinessEdgeCount,
  warnings: report.warnings.length,
  failures: report.failures.length,
});

if (report.failures.length) {
  console.error(report.failures.slice(0, 20));
  process.exitCode = 1;
}
