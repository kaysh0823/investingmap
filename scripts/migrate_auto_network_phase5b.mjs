/**
 * Phase 5B — migrate auto partners → data/networks/auto.json
 * Automotive value-chain ecosystem. Never invents supply contracts from peer labels.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeAutoMetrics } from '../lib/relation_network/auto_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_phase5b';
const OUT_NET = join(ROOT, 'data', 'networks', 'auto.json');
const OUT_LOG = join(ROOT, 'data', 'auto_relation_phase5b_changelog.json');

const LANE_HUBS = [
  { id: 'group:vehicle_oem', lane: 'vehicle_oem', nameKo: '완성차', nameEn: 'Vehicle OEMs' },
  { id: 'group:powertrain', lane: 'powertrain', nameKo: '파워트레인', nameEn: 'Powertrain' },
  { id: 'group:electrification', lane: 'electrification', nameKo: '전동화', nameEn: 'Electrification' },
  { id: 'group:thermal_management', lane: 'thermal_management', nameKo: '열관리', nameEn: 'Thermal management' },
  { id: 'group:chassis_braking_steering', lane: 'chassis_braking_steering', nameKo: '샤시·제동·조향', nameEn: 'Chassis / braking / steering' },
  { id: 'group:body_exterior', lane: 'body_exterior', nameKo: '차체·외장', nameEn: 'Body & exterior' },
  { id: 'group:interior', lane: 'interior', nameKo: '내장', nameEn: 'Interior' },
  { id: 'group:lighting', lane: 'lighting', nameKo: '조명', nameEn: 'Lighting' },
  { id: 'group:electronics_adas', lane: 'electronics_adas', nameKo: '전장·ADAS', nameEn: 'Electronics / ADAS' },
  { id: 'group:tire', lane: 'tire', nameKo: '타이어', nameEn: 'Tires' },
  { id: 'group:materials', lane: 'materials', nameKo: '소재·부품소재', nameEn: 'Materials' },
  { id: 'group:aftermarket', lane: 'aftermarket', nameKo: '애프터마켓', nameEn: 'Aftermarket' },
];

/** Primary lane for each ticker (must match cp_list / map companies). */
const TICKER_LANE = {
  '005380': 'vehicle_oem',
  '000270': 'vehicle_oem',
  '003620': 'vehicle_oem',
  '012330': 'chassis_braking_steering',
  '204320': 'chassis_braking_steering',
  '018880': 'thermal_management',
  '011210': 'powertrain',
  '005850': 'lighting',
  '007340': 'materials',
  '009900': 'body_exterior',
  '015750': 'body_exterior',
  '200880': 'interior',
  '010690': 'chassis_braking_steering',
  '000430': 'chassis_braking_steering',
  '064960': 'electrification',
  '025540': 'electronics_adas',
  '161390': 'tire',
  '073240': 'tire',
  '002350': 'tire',
  '000240': 'tire',
  '307950': 'electronics_adas',
  '097520': 'electronics_adas',
};

/** Product / technology structural focus (1–3 per company). */
const PRODUCT_FOCUS = {
  '005380': [
    { id: 'product:passenger_vehicle', nameKo: '승용차', nameEn: 'Passenger vehicles', type: 'produces' },
    { id: 'technology:electric_drive_unit', nameKo: '전기 구동', nameEn: 'Electric drive', type: 'exposed_to' },
    { id: 'technology:hydrogen_fuel_cell', nameKo: '수소연료전지', nameEn: 'Hydrogen fuel cell', type: 'exposed_to' },
  ],
  '000270': [
    { id: 'product:passenger_vehicle', nameKo: '승용차', nameEn: 'Passenger vehicles', type: 'produces' },
    { id: 'technology:electric_drive_unit', nameKo: '전기 구동', nameEn: 'Electric drive', type: 'exposed_to' },
    { id: 'technology:hybrid_powertrain', nameKo: '하이브리드 파워트레인', nameEn: 'Hybrid powertrain', type: 'exposed_to' },
  ],
  '003620': [
    { id: 'product:suv_pickup', nameKo: 'SUV·픽업', nameEn: 'SUV & pickup', type: 'produces' },
  ],
  '012330': [
    { id: 'product:chassis_module', nameKo: '샤시 모듈', nameEn: 'Chassis modules', type: 'manufactures' },
    { id: 'product:automotive_lamp', nameKo: '자동차 램프', nameEn: 'Automotive lamps', type: 'manufactures' },
    { id: 'technology:adas', nameKo: 'ADAS', nameEn: 'ADAS', type: 'exposed_to' },
  ],
  '204320': [
    { id: 'product:steering_system', nameKo: '조향 시스템', nameEn: 'Steering systems', type: 'manufactures' },
    { id: 'product:brake_system', nameKo: '제동 시스템', nameEn: 'Brake systems', type: 'manufactures' },
    { id: 'technology:adas', nameKo: 'ADAS', nameEn: 'ADAS', type: 'exposed_to' },
  ],
  '018880': [
    { id: 'product:thermal_hvac', nameKo: '공조·열관리', nameEn: 'HVAC & thermal', type: 'manufactures' },
    { id: 'technology:thermal_management', nameKo: '열관리', nameEn: 'Thermal management', type: 'used_in_technology' },
  ],
  '011210': [
    { id: 'product:engine_transmission', nameKo: '엔진·변속기', nameEn: 'Engines & transmissions', type: 'manufactures' },
    { id: 'technology:internal_combustion_engine', nameKo: '내연기관', nameEn: 'Internal combustion engine', type: 'exposed_to' },
    { id: 'technology:transmission', nameKo: '변속기', nameEn: 'Transmission', type: 'exposed_to' },
  ],
  '005850': [
    { id: 'product:automotive_lamp', nameKo: '자동차 램프', nameEn: 'Automotive lamps', type: 'manufactures' },
  ],
  '007340': [
    { id: 'product:battery_pack_component', nameKo: '배터리 팩 부품', nameEn: 'Battery pack components', type: 'manufactures' },
    { id: 'technology:battery_pack_component', nameKo: '배터리 팩 부품 기술', nameEn: 'Battery pack component tech', type: 'exposed_to' },
  ],
  '009900': [
    { id: 'product:body_press_part', nameKo: '차체·프레스', nameEn: 'Body & press parts', type: 'manufactures' },
  ],
  '015750': [
    { id: 'product:bumper_body', nameKo: '범퍼·차체', nameEn: 'Bumpers & body', type: 'manufactures' },
  ],
  '200880': [
    { id: 'product:interior_trim_seat', nameKo: '내장·시트', nameEn: 'Interior trim & seats', type: 'manufactures' },
  ],
  '010690': [
    { id: 'product:suspension_chassis', nameKo: '현가·샤시', nameEn: 'Suspension & chassis', type: 'manufactures' },
  ],
  '000430': [
    { id: 'product:spring_suspension', nameKo: '스프링·현가', nameEn: 'Springs & suspension', type: 'manufactures' },
  ],
  '064960': [
    { id: 'product:traction_motor', nameKo: '구동 모터', nameEn: 'Traction motors', type: 'manufactures' },
    { id: 'technology:electric_drive_unit', nameKo: '전기 구동', nameEn: 'Electric drive', type: 'exposed_to' },
  ],
  '025540': [
    { id: 'product:auto_connector', nameKo: '자동차 커넥터', nameEn: 'Automotive connectors', type: 'manufactures' },
  ],
  '161390': [
    { id: 'product:passenger_tire', nameKo: '승용·상용 타이어', nameEn: 'Passenger & commercial tires', type: 'manufactures' },
  ],
  '073240': [
    { id: 'product:passenger_tire', nameKo: '승용·상용 타이어', nameEn: 'Passenger & commercial tires', type: 'manufactures' },
  ],
  '002350': [
    { id: 'product:passenger_tire', nameKo: '승용 타이어', nameEn: 'Passenger tires', type: 'manufactures' },
  ],
  '000240': [
    { id: 'product:tire_holding', nameKo: '타이어 지주', nameEn: 'Tire holding', type: 'specializes_in' },
  ],
  '307950': [
    { id: 'product:vehicle_software', nameKo: '차량 SW·IT', nameEn: 'Vehicle software & IT', type: 'produces' },
    { id: 'technology:software_defined_vehicle', nameKo: '소프트웨어 정의 차량', nameEn: 'Software-defined vehicle', type: 'exposed_to' },
  ],
  '097520': [
    { id: 'product:auto_camera_module', nameKo: '차량 카메라 모듈', nameEn: 'Automotive camera modules', type: 'manufactures' },
    { id: 'technology:adas', nameKo: 'ADAS', nameEn: 'ADAS', type: 'exposed_to' },
  ],
};

const GLOBAL_META = {
  toyota: { nameKo: '토요타', nameEn: 'Toyota', country: 'JP', region: 'jp' },
  gm: { nameKo: 'GM', nameEn: 'General Motors', country: 'US', region: 'us' },
  vw: { nameKo: '폭스바겐', nameEn: 'Volkswagen', country: 'DE', region: 'eu' },
  stellantis: { nameKo: '스텔란티스', nameEn: 'Stellantis', country: 'NL', region: 'eu' },
  bosch: { nameKo: '보쉬', nameEn: 'Bosch', country: 'DE', region: 'eu' },
  continental: { nameKo: '콘티넨탈', nameEn: 'Continental', country: 'DE', region: 'eu' },
  denso: { nameKo: '덴소', nameEn: 'DENSO', country: 'JP', region: 'jp' },
  zf: { nameKo: 'ZF', nameEn: 'ZF', country: 'DE', region: 'eu' },
  michelin: { nameKo: '미쉐린', nameEn: 'Michelin', country: 'FR', region: 'eu' },
  bridgestone: { nameKo: '브리지스톤', nameEn: 'Bridgestone', country: 'JP', region: 'jp' },
  goodyear: { nameKo: '굿이어', nameEn: 'Goodyear', country: 'US', region: 'us' },
  nvidia: { nameKo: '엔비디아', nameEn: 'NVIDIA', country: 'US', region: 'us' },
  mahindra: { nameKo: '마힌드라', nameEn: 'Mahindra', country: 'IN', region: 'as' },
};

const HYUNDAI_GROUP_MEMBERS = ['005380', '000270', '012330', '011210', '307950'];

const html = fs.readFileSync(join(ROOT, 'auto', 'korea_auto_map.html'), 'utf8');
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
      vehicle: false,
      platform: false,
      role: true,
      contractStatus: false,
      nominationStatus: false,
      massProductionStatus: false,
      validFrom: false,
      validTo: false,
      amount: false,
      stakePct: false,
    },
    accessedAt: AS_OF,
  }];
}

function ensureProductNode(id, nameKo, nameEn) {
  const type = id.startsWith('technology:') ? 'technology' : 'product';
  addNode({
    id,
    type,
    nameKo,
    nameEn,
    lane: type === 'technology' ? 'end_market' : undefined,
  });
}

// --- Lane hubs ---
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

addNode({
  id: 'group:hyundai_motor_group',
  type: 'group',
  nameKo: '현대차그룹',
  nameEn: 'Hyundai Motor Group',
  lane: 'vehicle_oem',
  noteKo: '기업집단 소속 표기용. 공급·지분 관계를 대체하지 않습니다.',
  noteEn: 'Group membership reference only; not a substitute for supply or ownership edges.',
});

addNode({
  id: 'end_market:automotive',
  type: 'end_market',
  nameKo: '자동차 수요',
  nameEn: 'Automotive end market',
  lane: 'end_market',
});

// --- Listed companies ---
for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const lane = TICKER_LANE[c.ticker] || 'materials';
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
    }, {
      action: 'add_structural',
      afterType: 'member_of',
      source: id,
      target: hub.id,
    })) structuralGenerated += 1;
  }

  for (const focus of PRODUCT_FOCUS[c.ticker] || []) {
    ensureProductNode(focus.id, focus.nameKo, focus.nameEn);
    const edgeType = focus.type;
    if (addEdge({
      id: `${edgeType}-${c.ticker}-${focus.id.replace(/:/g, '-')}`,
      source: id,
      target: focus.id,
      type: edgeType,
      direction: 'source_to_target',
      status: 'reference',
      labelKo: focus.nameKo,
      labelEn: focus.nameEn,
      evidence: mkStructEv(`${c.name} ↔ ${focus.nameKo} (map product/semType classification)`),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      noteKo: '맵 제품·사업 분류 기반 구조 관계. OEM 공급계약을 의미하지 않습니다.',
      noteEn: 'Structural classification from map product fields; not an OEM supply contract.',
      edgeOrigin: 'structuralGenerated',
      defaultHidden: false,
    }, {
      action: 'add_structural',
      afterType: edgeType,
      source: id,
      target: focus.id,
    })) structuralGenerated += 1;
  }
}

// --- Global peers (canonical) ---
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
  });
}

// --- Legacy partners → peer (defaultHidden); never supplies_* ---
for (const c of companies) {
  const source = `krx:${c.ticker}`;
  for (const p of c.partners || []) {
    const target = `global:${p}`;
    if (!nodeIds.has(target)) {
      removedUnsupported += 1;
      logChange({
        action: 'drop_unknown_partner',
        source,
        partner: p,
        reason: 'partner id not in GLOBAL_META',
      });
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
      labelEn: 'Legacy peer / theme reference',
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
      defaultHidden: true,
    })) {
      legacyMigrated += 1;
      demotedPeer += 1;
    }
  }
}

// --- Hyundai Motor Group membership (not supply) ---
for (const ticker of HYUNDAI_GROUP_MEMBERS) {
  const source = `krx:${ticker}`;
  if (!nodeIds.has(source)) continue;
  if (addEdge({
    id: `group-member-${ticker}-hmg`,
    source,
    target: 'group:hyundai_motor_group',
    type: 'group_member',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '현대차그룹 소속 (참고)',
    labelEn: 'Hyundai Motor Group membership (reference)',
    evidence: [{
      title: 'Hyundai Motor Group affiliate classification (editorial; FTC roster review pending)',
      sourceType: 'editorial_structure',
      primarySource: false,
      directEvidence: false,
      sourceOpened: false,
      reviewStatus: 'needs_human_review',
      relationshipSupported: `${source} group_member group:hyundai_motor_group`,
      claimSupport: {
        relationship: true,
        legalEntity: true,
        counterparty: true,
        product: false,
        vehicle: false,
        platform: false,
        role: true,
        contractStatus: false,
        nominationStatus: false,
        massProductionStatus: false,
        validFrom: false,
        validTo: false,
        amount: false,
        stakePct: false,
      },
      accessedAt: AS_OF,
      evidenceScope: 'group_membership_only',
      evidenceUsageType: 'classification',
    }],
    confidence: 'medium',
    lastVerifiedAt: AS_OF,
    noteKo: '그룹 소속만 표시. 상호 공급·지분을 자동 생성하지 않습니다.',
    noteEn: 'Group membership only. Does not invent intra-group supply or ownership.',
    edgeOrigin: 'manuallyCurated',
    defaultHidden: false,
  }, {
    action: 'add_group_member',
    source,
    target: 'group:hyundai_motor_group',
  })) manuallyCurated += 1;
}

// --- Ownership: Hankook & Company → Hankook Tire deferred (needs DART stakePct) ---
logChange({
  action: 'defer_ownership_pending_dart',
  source: 'krx:000240',
  target: 'krx:161390',
  reason: 'Phase 5B does not invent ownership without opened DART stake disclosure',
});
removedUnsupported += 1;

const network = {
  sectorId: 'auto',
  model: 'automotive_value_chain_ecosystem',
  layout: 'automotiveValueChainEcosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  lanes: LANE_HUBS.map((h) => h.lane).concat(['end_market']),
  _legacyFallback: false,
  phase5bCuratedAt: AS_OF,
  nodes,
  edges,
  metrics: {},
};

network.metrics = {
  ...computeAutoMetrics(network),
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
  phase: '5B',
  reviewedBy: BY,
  listedCompanyCount: companies.length,
  metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  nodes: nodes.length,
  edges: edges.length,
  listed: companies.length,
  metrics: {
    structuralGeneratedEdgeCount: structuralGenerated,
    legacyMigratedEdgeCount: legacyMigrated,
    manuallyCuratedEdgeCount: manuallyCurated,
    demotedLegacyPeerCount: demotedPeer,
    actualSupplyRelationshipCount: network.metrics.actualSupplyRelationshipCount,
    vehicleFitmentRelationshipCount: network.metrics.vehicleFitmentRelationshipCount,
    businessRelationOrphanCount: network.metrics.businessRelationOrphanCount,
    classificationOnlyCompanyCount: network.metrics.classificationOnlyCompanyCount,
  },
  failures: report.failures,
  warnings: report.warnings.slice(0, 20),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
