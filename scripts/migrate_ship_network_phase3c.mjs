/**
 * Phase 3C — migrate ship partners → data/networks/ship.json
 * Model: shipbuilding_project_ecosystem / projectEcosystem
 * Never auto-promotes to confirmed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const OUT_NET = join(ROOT, 'data', 'networks', 'ship.json');
const OUT_LOG = join(ROOT, 'data', 'ship_relation_phase3c_changelog.json');

const html = fs.readFileSync(join(ROOT, 'ship', 'korea_ship_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const byLegacyId = new Map(companies.map((c) => [c.id, c]));
const byTicker = new Map(companies.map((c) => [c.ticker, c]));

let globals = [];
const gMatch = html.match(/const globalCompanies = (\[[\s\S]*?\n    \]);/);
if (gMatch) {
  try { globals = Function(`return (${gMatch[1]})`)(); } catch { globals = []; }
}

const nodes = [];
const edges = [];
const nodeIds = new Set();
const edgeKeys = new Set();
const changelog = [];
let legacyMigrated = 0;
let structuralGenerated = 0;
let manuallyCurated = 0;
let removedUnsupported = 0;

function addNode(n) {
  if (!n?.id || nodeIds.has(n.id)) return;
  nodeIds.add(n.id);
  nodes.push(n);
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

function mkEv(fields) {
  return [{
    reviewStatus: 'needs_human_review',
    accessedAt: AS_OF,
    directEvidence: false,
    ...fields,
  }];
}

const CHAIN_HUBS = [
  { id: 'group:shipyard', chain: '종합조선', nameKo: '종합조선', nameEn: 'Integrated shipbuilding', lane: 'shipyard' },
  { id: 'group:engine', chain: '엔진', nameKo: '엔진', nameEn: 'Marine engines', lane: 'engine_propulsion' },
  { id: 'group:hull_materials', chain: '선체·보냉·구조재', nameKo: '선체·보냉·구조재', nameEn: 'Hull / cryogenic / structures', lane: 'steel_material' },
  { id: 'group:outfitting', chain: '의장/배관', nameKo: '의장/배관', nameEn: 'Outfitting & piping', lane: 'equipment' },
  { id: 'group:offshore_mro', chain: '서비스·해양플랜트', nameKo: '서비스·해양플랜트', nameEn: 'Services & offshore', lane: 'delivery_mro' },
  { id: 'group:shipping', chain: '해운물류', nameKo: '해운물류', nameEn: 'Shipping & logistics', lane: 'shipowner' },
];

for (const h of CHAIN_HUBS) {
  addNode({
    id: h.id,
    type: 'group',
    nameKo: h.nameKo,
    nameEn: h.nameEn,
    role: h.chain,
    group: h.chain,
    layer: h.chain,
    lane: h.lane,
  });
}

const VESSEL_TYPES = [
  ['vessel-type:lng_carrier', 'LNG 운반선', 'LNG carrier'],
  ['vessel-type:container', '컨테이너선', 'Container ship'],
  ['vessel-type:tanker', '탱커', 'Tanker'],
  ['vessel-type:bulk_carrier', '벌크선', 'Bulk carrier'],
  ['vessel-type:car_carrier', '자동차운반선', 'Car carrier'],
  ['vessel-type:fpso', 'FPSO', 'FPSO'],
  ['vessel-type:flng', 'FLNG', 'FLNG'],
  ['vessel-type:naval', '함정', 'Naval vessel'],
];
for (const [id, ko, en] of VESSEL_TYPES) {
  addNode({
    id, type: 'vessel_type', nameKo: ko, nameEn: en,
    role: 'vessel_type', layer: '종합조선', lane: 'shipyard',
  });
}

const PRODUCTS = [
  ['product:marine_engine', '선박용 엔진', 'Marine engine', 'engine_product', '엔진', 'engine_propulsion'],
  ['product:hull_steel', '선체용 후판·강재', 'Hull steel plate', 'material_category', '선체·보냉·구조재', 'steel_material'],
  ['product:cryogenic_insulation', 'LNG 보냉재', 'Cryogenic insulation', 'material_category', '선체·보냉·구조재', 'steel_material'],
  ['product:piping_fitting', '배관·피팅', 'Piping & fittings', 'equipment_category', '의장/배관', 'equipment'],
  ['product:mro_service', '선박 MRO·솔루션', 'Marine MRO / solutions', 'mro_service', '서비스·해양플랜트', 'delivery_mro'],
  ['product:offshore_module', '해양플랜트 모듈', 'Offshore module', 'equipment_category', '서비스·해양플랜트', 'delivery_mro'],
];
for (const [id, ko, en, type, layer, lane] of PRODUCTS) {
  addNode({ id, type, nameKo: ko, nameEn: en, role: 'product', layer, lane });
}

addNode({
  id: 'org:classnk', type: 'classification_society',
  nameKo: 'ClassNK', nameEn: 'ClassNK',
  role: 'classification', layer: '서비스·해양플랜트', lane: 'classification',
});
addNode({
  id: 'org:dnv', type: 'classification_society',
  nameKo: 'DNV', nameEn: 'DNV',
  role: 'classification', layer: '서비스·해양플랜트', lane: 'classification',
});
addNode({
  id: 'market:global_shipbuilding', type: 'end_market',
  nameKo: '글로벌 조선 수요', nameEn: 'Global shipbuilding demand',
  role: 'end_market', layer: '해운물류', lane: 'shipowner',
});
addNode({
  id: 'counterparty:undisclosed_european_shipowner', type: 'shipowner',
  nameKo: '비공개 유럽 선주', nameEn: 'Undisclosed European shipowner',
  role: 'undisclosed_counterparty', layer: '해운물류', lane: 'shipowner',
  isAnonymousCounterparty: true,
});
addNode({
  id: 'counterparty:undisclosed_oceania_shipowner', type: 'shipowner',
  nameKo: '비공개 오세아니아 선주', nameEn: 'Undisclosed Oceania shipowner',
  role: 'undisclosed_counterparty', layer: '해운물류', lane: 'shipowner',
  isAnonymousCounterparty: true,
});

const THEME_TO_VESSEL = {
  theme_lng: 'vessel-type:lng_carrier',
  theme_contain: 'vessel-type:container',
  theme_offshore: 'vessel-type:fpso',
  theme_green: 'vessel-type:lng_carrier',
};

const PRODUCT_BY_CHAIN = {
  '종합조선': ['vessel-type:lng_carrier', 'vessel-type:container'],
  '엔진': ['product:marine_engine'],
  '선체·보냉·구조재': ['product:hull_steel', 'product:cryogenic_insulation'],
  '의장/배관': ['product:piping_fitting'],
  '서비스·해양플랜트': ['product:mro_service', 'product:offshore_module'],
  '해운물류': ['market:global_shipbuilding'],
};

// Listed companies
for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const lane = (CHAIN_HUBS.find((h) => h.chain === c.chain) || {}).lane || 'shipyard';
  addNode({
    id,
    type: 'listed_company',
    ticker: c.ticker,
    nameKo: c.name,
    nameEn: c.nameEn || c.name,
    market: c.market || '',
    role: c.chain || '',
    group: c.chain || '',
    layer: c.chain || '',
    lane,
    mcapWon: c.mcapWon ?? null,
    isListedKorea: true,
    legacyId: c.id,
  });
  const hub = CHAIN_HUBS.find((h) => h.chain === c.chain);
  if (hub) {
    addEdge({
      id: `member-${c.ticker}-${hub.id.replace(':', '-')}`,
      source: id,
      target: hub.id,
      type: 'member_of',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: `${c.chain} 분류`,
      labelEn: `${c.chain} category`,
      evidence: [],
      confidence: 'high',
      lastVerifiedAt: AS_OF,
      noteKo: '밸류체인 분류이며 기업 간 거래를 의미하지 않습니다.',
      noteEn: 'Value-chain category only; not a trade relationship.',
      edgeOrigin: 'structuralGenerated',
    }, {
      legacyEdgeId: null, source: id, target: hub.id,
      beforeType: '(none)', afterType: 'member_of',
      beforeStatus: '(none)', afterStatus: 'reference',
      origin: 'structuralGenerated', reason: 'cp_list chain → member_of group',
    });
    structuralGenerated += 1;
  }
  for (const pid of (PRODUCT_BY_CHAIN[c.chain] || [])) {
    const isMarket = pid.startsWith('market:');
    const isVessel = pid.startsWith('vessel-type:');
    const type = isMarket ? 'exposed_to' : (isVessel ? 'builds_vessel_type' : 'manufactures');
    if (c.chain === '해운물류' && isVessel) continue;
    if (c.chain !== '종합조선' && isVessel) continue;
    if (c.chain === '종합조선' && type === 'manufactures') continue;
    addEdge({
      id: `${type}-${c.ticker}-${pid.replace(/:/g, '-')}`,
      source: id,
      target: pid,
      type,
      direction: 'source_to_target',
      status: 'reference',
      labelKo: isVessel ? '주요 선종 노출' : (isMarket ? '수요시장 노출' : '제품·공정'),
      labelEn: isVessel ? 'Vessel-type exposure' : (isMarket ? 'Demand exposure' : 'Product / process'),
      evidence: [],
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      noteKo: '산업 역할·제품 표시이며 특정 수주·납품을 의미하지 않습니다.',
      noteEn: 'Industry role / product only; not a specific order or supply.',
      edgeOrigin: 'structuralGenerated',
      defaultHidden: false,
    }, {
      legacyEdgeId: null, source: id, target: pid,
      beforeType: '(none)', afterType: type,
      beforeStatus: '(none)', afterStatus: 'reference',
      origin: 'structuralGenerated', reason: 'chain → product/vessel_type/market',
    });
    structuralGenerated += 1;
  }
}

// Global companies (non-theme)
for (const g of globals) {
  if (!g?.id || String(g.id).startsWith('theme_')) continue;
  addNode({
    id: `global:${g.id}`,
    type: 'global_company',
    nameKo: g.name || g.id,
    nameEn: g.nameEn || g.name || g.id,
    role: g.sector || 'global',
    region: g.region || '',
    legacyId: g.id,
    lane: /engine|Wärtsilä|MAN|Rolls/i.test(String(g.sector) + g.name) ? 'engine_propulsion'
      : /shipping|liner|bulk|cruise/i.test(String(g.sector)) ? 'shipowner'
        : /FPSO|offshore|EPCI/i.test(String(g.sector)) ? 'order_contract'
          : 'shipowner',
  });
}

// --- Curated contracts / ownership (reported, not confirmed) ---
function addContract(c) {
  addNode({
    id: c.id,
    type: 'order_contract',
    nameKo: c.nameKo,
    nameEn: c.nameEn,
    role: 'order_contract',
    layer: '종합조선',
    lane: 'order_contract',
    contractName: c.nameEn,
    announcementDate: c.announcementDate || null,
    vesselCount: c.vesselCount ?? null,
    vesselType: c.vesselType || null,
    contractStatus: c.contractStatus || 'announced',
    counterpartyDisclosure: c.counterpartyDisclosure || 'disclosed',
    contractValue: c.contractValue ?? null,
    currency: c.currency || null,
    lastVerifiedAt: AS_OF,
  });
}

addContract({
  id: 'contract:hmm-hhi-container-2020s',
  nameKo: 'HMM 컨테이너선 신조 (HD현대중공업)',
  nameEn: 'HMM containership newbuilds (HD HHI)',
  announcementDate: '2021-01-01',
  vesselCount: null,
  vesselType: 'container',
  contractStatus: 'under_construction',
  counterpartyDisclosure: 'disclosed',
});
addContract({
  id: 'contract:undisclosed-eu-shi-lng',
  nameKo: '비공개 유럽 선주 LNGC (삼성중공업)',
  nameEn: 'Undisclosed EU owner LNGC (SHI)',
  announcementDate: '2024-01-01',
  vesselCount: null,
  vesselType: 'lng_carrier',
  contractStatus: 'announced',
  counterpartyDisclosure: 'undisclosed',
});
addContract({
  id: 'contract:shell-shi-lng-historic',
  nameKo: 'Shell 계열 LNGC 노출 (삼성중공업, 대표 사례)',
  nameEn: 'Shell-related LNGC exposure (SHI, illustrative)',
  announcementDate: '2019-01-01',
  vesselCount: null,
  vesselType: 'lng_carrier',
  contractStatus: 'delivered',
  counterpartyDisclosure: 'disclosed',
});
addNode({
  id: 'naval:rok-navy-submarine-program',
  type: 'naval_program',
  nameKo: '대한민국 해군 잠수함·함정 프로그램',
  nameEn: 'ROK Navy submarine / naval programs',
  role: 'naval_program',
  layer: '종합조선',
  lane: 'order_contract',
  contractStatus: 'under_construction',
  lastVerifiedAt: AS_OF,
});

// Phase 3D-0: homepage-only / unverified named contracts stay reference|inferred|ended — never reported
const curated = [
  // Ownership HD KSOE → HD HHI — homepage IR only → reference
  {
    edge: {
      id: 'owns-009540-329180',
      source: 'krx:009540',
      target: 'krx:329180',
      type: 'owns',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '조선 자회사 (HD현대중공업)',
      labelEn: 'Shipbuilding subsidiary (HD HHI)',
      evidence: mkEv({
        url: 'https://www.hd-ksoe.co.kr/',
        title: 'HD Korea Shipbuilding & Offshore Engineering — group structure',
        sourceType: 'company',
        publishedAt: '2024-01-01',
      }),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: '그룹 소개 페이지만으로는 reported 소유관계를 유지하지 않습니다. DART 출자현황 검토 필요.',
      noteEn: 'Homepage group overview is insufficient for reported ownership. Needs DART review.',
    },
    reason: 'HD KSOE → HD HHI ownership (homepage → reference)',
  },
  // HMM → contract → HHI (no individual filing URL → inferred hidden)
  {
    edge: {
      id: 'ordered-011200-contract-hmm-hhi',
      source: 'krx:011200',
      target: 'contract:hmm-hhi-container-2020s',
      type: 'ordered',
      direction: 'source_to_target',
      status: 'inferred',
      defaultHidden: true,
      labelKo: '컨테이너선 발주',
      labelEn: 'Containership order',
      evidence: mkEv({
        url: 'https://www.hmm21.com/',
        title: 'HMM fleet / newbuild disclosures (company IR)',
        sourceType: 'company',
        publishedAt: '2021-06-01',
      }),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: '개별 발주·수주 공시 URL이 없어 실명 발주 관계를 inferred·기본 숨김으로 강등.',
      noteEn: 'No specific order filing URL; demoted to inferred (default hidden).',
    },
    reason: 'HMM ordered containership (inferred, no filing)',
  },
  {
    edge: {
      id: 'awarded-contract-hmm-hhi-329180',
      source: 'contract:hmm-hhi-container-2020s',
      target: 'krx:329180',
      type: 'awarded_to',
      direction: 'source_to_target',
      status: 'inferred',
      defaultHidden: true,
      labelKo: 'HD현대중공업 수주',
      labelEn: 'Awarded to HD HHI',
      evidence: mkEv({
        url: 'https://www.hd.com/hhi/',
        title: 'HD Hyundai Heavy Industries — containership deliveries / orders',
        sourceType: 'company',
        publishedAt: '2021-06-01',
      }),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: '개별 수주 발표 원문 없음 → inferred·기본 숨김.',
      noteEn: 'No individual award filing → inferred hidden.',
    },
    reason: 'contract awarded to HD HHI (inferred)',
  },
  {
    edge: {
      id: 'builtby-contract-hmm-hhi-329180',
      source: 'contract:hmm-hhi-container-2020s',
      target: 'krx:329180',
      type: 'built_by',
      direction: 'source_to_target',
      status: 'inferred',
      labelKo: '건조',
      labelEn: 'Built by',
      evidence: mkEv({
        url: 'https://www.hd.com/hhi/',
        title: 'HD HHI newbuild program',
        sourceType: 'company',
        publishedAt: '2021-06-01',
      }),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      defaultHidden: true,
    },
    reason: 'built_by parallel — inferred hidden',
  },
  // Undisclosed EU → SHI LNG (no individual contract doc → inferred hidden)
  {
    edge: {
      id: 'ordered-undisclosed-eu-shi-lng',
      source: 'counterparty:undisclosed_european_shipowner',
      target: 'contract:undisclosed-eu-shi-lng',
      type: 'ordered',
      direction: 'source_to_target',
      status: 'inferred',
      defaultHidden: true,
      labelKo: '비공개 선주 발주',
      labelEn: 'Undisclosed owner order',
      evidence: mkEv({
        url: 'https://www.samsungshi.com/',
        title: 'Samsung Heavy Industries — LNG carrier order disclosures (owner often undisclosed)',
        sourceType: 'company',
        publishedAt: '2024-01-01',
      }),
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: '개별 계약 문서 없이 익명 선주 reported 유지 금지.',
      noteEn: 'Anonymous counterparty without contract document cannot stay reported.',
    },
    reason: 'anonymous counterparty → contract (inferred)',
  },
  {
    edge: {
      id: 'awarded-undisclosed-eu-shi-lng-010140',
      source: 'contract:undisclosed-eu-shi-lng',
      target: 'krx:010140',
      type: 'awarded_to',
      direction: 'source_to_target',
      status: 'inferred',
      defaultHidden: true,
      labelKo: '삼성중공업 수주',
      labelEn: 'Awarded to SHI',
      evidence: mkEv({
        url: 'https://www.samsungshi.com/',
        title: 'SHI LNG carrier orders',
        sourceType: 'company',
        publishedAt: '2024-01-01',
      }),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: '익명 계약 awarded_to를 homepage만으로 유지하지 않음.',
      noteEn: 'Anonymous awarded_to demoted without individual filing.',
    },
    reason: 'LNG contract to SHI (inferred)',
  },
  // Shell historic delivered — ended hidden
  {
    edge: {
      id: 'ordered-shell-shi-historic',
      source: 'global:shell',
      target: 'contract:shell-shi-lng-historic',
      type: 'ordered',
      direction: 'source_to_target',
      status: 'ended',
      labelKo: '과거 LNGC 발주 (인도 완료 사례)',
      labelEn: 'Historic LNGC order (delivered example)',
      evidence: mkEv({
        url: 'https://www.samsungshi.com/',
        title: 'SHI LNG deliveries involving major energy majors',
        sourceType: 'company',
        publishedAt: '2019-01-01',
      }),
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      defaultHidden: true,
      contractStatus: 'delivered',
      noteKo: '개별 계약·인도 상태 미재검증 → historical ended 숨김.',
      noteEn: 'Historic case not re-verified → ended hidden.',
    },
    reason: 'completed/delivered contract defaultHidden',
  },
  {
    edge: {
      id: 'awarded-shell-shi-historic-010140',
      source: 'contract:shell-shi-lng-historic',
      target: 'krx:010140',
      type: 'awarded_to',
      direction: 'source_to_target',
      status: 'ended',
      labelKo: '삼성중공업 건조 (완료)',
      labelEn: 'Built by SHI (completed)',
      evidence: mkEv({
        url: 'https://www.samsungshi.com/',
        title: 'SHI delivered LNG carriers',
        sourceType: 'company',
        publishedAt: '2019-01-01',
      }),
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      defaultHidden: true,
      noteKo: '과거 사례 미검증 → ended 숨김.',
      noteEn: 'Historic award → ended hidden.',
    },
    reason: 'completed award defaultHidden',
  },
  // Hanwha Ocean ↔ naval — homepage only → manufactures/reference
  {
    edge: {
      id: 'awarded-naval-rok-042660',
      source: 'naval:rok-navy-submarine-program',
      target: 'krx:042660',
      type: 'manufactures',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '함정·특수선 건조 역량 (특정 프로그램 수주 단정 아님)',
      labelEn: 'Naval / specialty build capability (not a verified program award)',
      evidence: mkEv({
        url: 'https://www.hanwhaocean.com/',
        title: 'Hanwha Ocean — naval / special ship programs',
        sourceType: 'company',
        publishedAt: '2023-01-01',
      }),
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'manuallyCurated',
      noteKo: '회사 소개만으로는 해군 프로그램 awarded_to 유지 불가 → manufactures/reference.',
      noteEn: 'Homepage cannot support naval awarded_to → manufactures/reference.',
    },
    reason: 'Hanwha Ocean naval capability (manufactures/reference)',
  },
  // HD Marine Solution MRO structural already; add maintains to market as soft
  {
    edge: {
      id: 'maintains-443060-market-global',
      source: 'krx:443060',
      target: 'market:global_shipbuilding',
      type: 'maintains',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '선박 솔루션·MRO',
      labelEn: 'Marine solutions / MRO',
      evidence: [],
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'structuralGenerated',
      noteKo: '사업영역 표시이며 특정 선주 계약을 의미하지 않습니다.',
      noteEn: 'Business-scope only; not a specific owner contract.',
    },
    reason: 'MRO company → market (structural)',
    origin: 'structuralGenerated',
  },
];

for (const row of curated) {
  const ok = addEdge(row.edge, {
    legacyEdgeId: null,
    source: row.edge.source,
    target: row.edge.target,
    beforeType: '(none)',
    afterType: row.edge.type,
    beforeStatus: '(none)',
    afterStatus: row.edge.status,
    origin: row.origin || 'manuallyCurated',
    reason: row.reason,
  });
  if (ok) {
    if ((row.origin || 'manuallyCurated') === 'structuralGenerated') structuralGenerated += 1;
    else manuallyCurated += 1;
  }
}

// Skip duplicate built_by if it fails validation preference — keep awarded_to only
// Remove built_by duplicate to avoid reverse-ish clutter
const builtByIdx = edges.findIndex((e) => e.id === 'builtby-contract-hmm-hhi-329180');
if (builtByIdx >= 0) {
  edges.splice(builtByIdx, 1);
  edgeKeys.delete('contract:hmm-hhi-container-2020s|krx:329180|built_by');
  manuallyCurated = Math.max(0, manuallyCurated - 1);
  logChange({
    legacyEdgeId: null,
    source: 'contract:hmm-hhi-container-2020s',
    target: 'krx:329180',
    beforeType: 'built_by',
    afterType: '(removed)',
    beforeStatus: 'reported',
    afterStatus: '(removed)',
    origin: 'manuallyCurated',
    reason: 'avoid awarded_to + built_by duplicate on same contract/yard',
  });
  removedUnsupported += 1;
}

// Migrate legacy partners
for (const c of companies) {
  const src = `krx:${c.ticker}`;
  for (const p of c.partners || []) {
    const legacyEdgeId = `legacy-${c.id}-${typeof p === 'string' ? p : p.id}`;
    if (typeof p === 'string') {
      if (p.startsWith('theme_')) continue;
      const gid = `global:${p}`;
      if (!nodeIds.has(gid)) {
        addNode({
          id: gid, type: 'global_company', nameKo: p, nameEn: p,
          role: 'global', legacyId: p, lane: 'shipowner',
        });
      }
      // Global liner/owner names without contract URL → peer (hidden) + optional market exposure
      const isOwnerLike = ['maersk', 'msc', 'cma_cgm', 'carnival', 'vale', 'bhp', 'rio_tinto', 'shell', 'total'].includes(p);
      const isEnginePeer = ['wartsila', 'man_es', 'rolls_marine'].includes(p);
      if (isOwnerLike && c.chain === '종합조선') {
        addEdge({
          id: `exposed-${c.ticker}-market-global`,
          source: src,
          target: 'market:global_shipbuilding',
          type: 'exposed_to',
          direction: 'source_to_target',
          status: 'reference',
          labelKo: '글로벌 선주·발주 시장 노출',
          labelEn: 'Global owner / order-market exposure',
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          edgeOrigin: 'legacyMigrated',
          noteKo: '파트너 문자열만 있어 특정 수주로 연결하지 않음.',
          noteEn: 'Partner string only; not linked as a specific order.',
        }, {
          legacyEdgeId, source: src, target: 'market:global_shipbuilding',
          beforeType: 'partner', afterType: 'exposed_to',
          beforeStatus: 'legacy', afterStatus: 'reference',
          origin: 'legacyMigrated',
          reason: 'owner/global string without contract URL → market exposure',
        });
        legacyMigrated += 1;
      }
      addEdge({
        id: `peer-${c.ticker}-${p}`,
        source: src,
        target: gid,
        type: 'peer',
        direction: 'undirected',
        status: 'peer',
        labelKo: isEnginePeer ? '엔진 기술·라이선스 peer' : '글로벌 peer',
        labelEn: isEnginePeer ? 'Engine tech / license peer' : 'Global peer',
        evidence: [],
        confidence: 'low',
        lastVerifiedAt: AS_OF,
        edgeOrigin: 'legacyMigrated',
        defaultHidden: true,
      }, {
        legacyEdgeId, source: src, target: gid,
        beforeType: 'partner', afterType: 'peer',
        beforeStatus: 'legacy', afterStatus: 'peer',
        origin: 'legacyMigrated',
        reason: 'string partner → peer defaultHidden',
      });
      legacyMigrated += 1;
      continue;
    }

    if (p.kind === 'theme' || String(p.id || '').startsWith('theme_')) {
      const vid = THEME_TO_VESSEL[p.id] || 'vessel-type:lng_carrier';
      addEdge({
        id: `vesseltype-${c.ticker}-${vid.replace(/:/g, '-')}`,
        source: src,
        target: vid,
        type: 'builds_vessel_type',
        direction: 'source_to_target',
        status: 'reference',
        labelKo: p.edgeLabel || '선종 테마',
        labelEn: p.edgeLabelEn || 'Vessel theme',
        evidence: [],
        confidence: 'medium',
        lastVerifiedAt: AS_OF,
        edgeOrigin: 'legacyMigrated',
        noteKo: '선종 테마이며 개별 계약이 아닙니다.',
        noteEn: 'Vessel-type theme; not an individual contract.',
      }, {
        legacyEdgeId, source: src, target: vid,
        beforeType: 'theme', afterType: 'builds_vessel_type',
        beforeStatus: 'legacy', afterStatus: 'reference',
        origin: 'legacyMigrated',
        reason: 'theme partner → vessel_type structural',
      });
      legacyMigrated += 1;
      continue;
    }

    // Labeled domestic (engine → yard) without DART → inferred supplies_engine_to, defaultHidden
    const tgtCo = byLegacyId.get(p.id);
    if (tgtCo) {
      const tgt = `krx:${tgtCo.ticker}`;
      const supplyType = c.chain === '엔진' ? 'supplies_engine_to'
        : c.chain === '선체·보냉·구조재' ? 'supplies_steel_to'
          : 'supplies_equipment_to';
      addEdge({
        id: `inferred-${c.ticker}-${tgtCo.ticker}-${supplyType}`,
        source: src,
        target: tgt,
        type: supplyType,
        direction: 'source_to_target',
        status: 'inferred',
        labelKo: p.edgeLabel || '추정 공급',
        labelEn: p.edgeLabelEn || 'Inferred supply',
        evidence: [],
        confidence: 'low',
        lastVerifiedAt: AS_OF,
        edgeOrigin: 'legacyMigrated',
        defaultHidden: true,
        noteKo: '레거시 라벨만 있고 개별 공시 URL이 없어 inferred·기본 숨김.',
        noteEn: 'Legacy label without filing URL → inferred, default hidden.',
      }, {
        legacyEdgeId, source: src, target: tgt,
        beforeType: 'labeled_partner', afterType: supplyType,
        beforeStatus: 'legacy', afterStatus: 'inferred',
        origin: 'legacyMigrated',
        reason: 'labeled domestic supply without DART → inferred hidden',
      });
      legacyMigrated += 1;
    } else if (p.id && nodeIds.has(`global:${p.id}`)) {
      addEdge({
        id: `peer-${c.ticker}-${p.id}-obj`,
        source: src,
        target: `global:${p.id}`,
        type: 'peer',
        direction: 'undirected',
        status: 'peer',
        labelKo: p.edgeLabel || 'peer',
        labelEn: p.edgeLabelEn || 'peer',
        evidence: [],
        confidence: 'low',
        lastVerifiedAt: AS_OF,
        edgeOrigin: 'legacyMigrated',
        defaultHidden: true,
      }, {
        legacyEdgeId, source: src, target: `global:${p.id}`,
        beforeType: 'partner', afterType: 'peer',
        beforeStatus: 'legacy', afterStatus: 'peer',
        origin: 'legacyMigrated',
        reason: 'object partner unresolved domestic → peer',
      });
      legacyMigrated += 1;
    } else {
      removedUnsupported += 1;
      logChange({
        legacyEdgeId, source: src, target: p.id || '(unknown)',
        beforeType: 'partner', afterType: '(removed)',
        beforeStatus: 'legacy', afterStatus: '(removed)',
        origin: 'legacyMigrated',
        reason: 'unsupported partner target',
      });
    }
  }
}

const network = {
  sectorId: 'ship',
  model: 'shipbuilding_project_ecosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  layers: CHAIN_HUBS.map((h) => h.chain),
  lanes: [
    'shipowner', 'order_contract', 'shipyard', 'engine_propulsion',
    'steel_material', 'equipment', 'electrical_automation', 'classification', 'delivery_mro',
  ],
  _legacyFallback: false,
  metrics: {
    legacyMigratedEdgeCount: legacyMigrated,
    structuralGeneratedEdgeCount: structuralGenerated,
    manuallyCuratedEdgeCount: manuallyCurated,
    removedEdgeCount: removedUnsupported,
    finalEdgeCount: edges.length,
    legacyMigratedBusinessEdgeCount: edges.filter((e) => e.edgeOrigin === 'legacyMigrated' && !['member_of', 'builds_vessel_type', 'manufactures', 'exposed_to', 'develops', 'used_in_vessel'].includes(e.type)).length,
    manuallyCuratedBusinessEdgeCount: edges.filter((e) => e.edgeOrigin === 'manuallyCurated').length,
    confirmedBusinessEdgeCount: edges.filter((e) => e.status === 'confirmed').length,
    reportedBusinessEdgeCount: edges.filter((e) => e.status === 'reported').length,
  },
  nodes,
  edges,
};

const report = validateNetworkReport(network);
fs.writeFileSync(OUT_NET, JSON.stringify(network, null, 2));
fs.writeFileSync(OUT_LOG, JSON.stringify({
  migratedAt: AS_OF,
  ...network.metrics,
  statusCounts: report.summary.statusCounts,
  typeCounts: report.summary.typeCounts,
  orphanMetrics: {
    structuralOrphanCount: report.summary.structuralOrphanCount,
    businessRelationOrphanCount: report.summary.businessRelationOrphanCount,
    directRelationshipOrphanCount: report.summary.directRelationshipOrphanCount,
    classificationOnlyCompanyCount: report.summary.classificationOnlyCompanyCount,
    weakRelationOnlyCompanyCount: report.summary.weakRelationOnlyCompanyCount,
  },
  changes: changelog,
}, null, 2));

console.log(JSON.stringify({
  nodes: nodes.length,
  edges: edges.length,
  metrics: network.metrics,
  statusCounts: report.summary.statusCounts,
  typeCounts: report.summary.typeCounts,
  orphan: {
    structuralOrphanCount: report.summary.structuralOrphanCount,
    businessRelationOrphanCount: report.summary.businessRelationOrphanCount,
    classificationOnlyCompanyCount: report.summary.classificationOnlyCompanyCount,
  },
  failures: report.failures,
  warnings: report.warnings.slice(0, 15),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
