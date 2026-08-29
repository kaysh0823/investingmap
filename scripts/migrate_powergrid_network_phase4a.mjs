/**
 * Phase 4A — Migrate powergrid partners → data/networks/powergrid.json
 * Model: grid_infrastructure_ecosystem / gridInfrastructureEcosystem
 * Never auto-promotes to confirmed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review';
const HTML = join(ROOT, 'powergrid', 'korea_powergrid_map.html');
const OUT_NET = join(ROOT, 'data', 'networks', 'powergrid.json');
const OUT_LOG = join(ROOT, 'data', 'powergrid_relation_phase4a_changelog.json');

const html = fs.readFileSync(HTML, 'utf8');
const companies = extractCompaniesFromHtml(html);

let globals = [];
const gMatch = html.match(/const globalCompanies\s*=\s*(\[[\s\S]*?\n\s*\]);/);
if (gMatch) {
  try { globals = Function(`return (${gMatch[1]})`)(); } catch { globals = []; }
}

const nodes = [];
const edges = [];
const nodeIds = new Set();
const edgeKeys = new Set();
const changelog = [];
let structuralGenerated = 0;
let legacyMigrated = 0;
let manuallyCurated = 0;
let removedUnsupported = 0;

function addNode(n) {
  if (!n?.id || nodeIds.has(n.id)) return;
  nodeIds.add(n.id);
  nodes.push(n);
}

function addEdge(e, meta) {
  const key = `${e.source}|${e.target}|${e.type}`;
  if (!e?.id || edgeKeys.has(key) || e.source === e.target) return false;
  if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
  edgeKeys.add(key);
  edges.push(e);
  if (meta) changelog.push(meta);
  return true;
}

function mkEv(p) {
  return {
    reviewStatus: p.reviewStatus || 'needs_human_review',
    reviewedAt: p.reviewedAt || null,
    reviewedBy: p.reviewedBy || null,
    accessedAt: AS_OF,
    directEvidence: !!p.directEvidence,
    sourceType: p.sourceType || 'other',
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt || null,
    evidenceSummaryKo: p.evidenceSummaryKo || '',
    evidenceSummaryEn: p.evidenceSummaryEn || '',
    quotedFactKo: p.quotedFactKo || '',
    relationshipSupported: p.relationshipSupported || '',
  };
}

const CHAIN = {
  전력설비: {
    lane: 'substation_protection',
    role: 'transformer_switchgear',
    equipment: ['equipment:power_transformer', 'equipment:switchgear', 'equipment:circuit_breaker'],
    stages: ['grid-stage:transmission', 'grid-stage:substation'],
    markets: ['market:utility_grid', 'market:data_center', 'market:overseas_grid_expansion'],
  },
  송배전: {
    lane: 'transmission_hvdc',
    role: 'td_equipment',
    equipment: ['equipment:power_transformer', 'equipment:switchgear', 'equipment:grid_automation'],
    stages: ['grid-stage:transmission', 'grid-stage:distribution'],
    markets: ['market:utility_grid', 'market:renewable_interconnection'],
  },
  '전선·케이블': {
    lane: 'transmission_hvdc',
    role: 'cable',
    equipment: ['equipment:cable', 'equipment:submarine_cable'],
    stages: ['grid-stage:transmission', 'grid-stage:distribution'],
    markets: ['market:utility_grid', 'market:overseas_grid_expansion', 'market:renewable_interconnection'],
  },
  발전설비: {
    lane: 'generation_utility',
    role: 'utility_operator',
    equipment: [],
    stages: ['grid-stage:generation', 'grid-stage:end_use'],
    markets: ['market:utility_grid', 'market:industrial_plant'],
  },
};

const LISTED_META = {
  '267260': { equipment: ['equipment:power_transformer', 'equipment:circuit_breaker'], key: true },
  '010120': { equipment: ['equipment:switchgear', 'equipment:grid_automation', 'equipment:inverter'], key: true },
  '298040': { equipment: ['equipment:power_transformer', 'equipment:hvdc_converter'], key: true },
  '001440': { equipment: ['equipment:cable', 'equipment:submarine_cable'], key: true },
  '103590': { equipment: ['equipment:power_transformer', 'equipment:cable'], key: true },
  '062040': { equipment: ['equipment:power_transformer'], key: true },
  '033100': { equipment: ['equipment:distribution_transformer', 'equipment:switchgear'], key: false },
  '000500': { equipment: ['equipment:cable'], key: false },
  '229640': { equipment: ['equipment:cable', 'equipment:submarine_cable'], key: false },
  '060370': { equipment: ['equipment:submarine_cable'], key: false },
  '006340': { equipment: ['equipment:cable'], key: false },
  '015760': { equipment: [], key: false, utilityListed: true },
  '036460': { equipment: [], key: false, utilityListed: true },
  '071320': { equipment: [], key: false, utilityListed: true },
};

for (const [id, ko, en, lane] of [
  ['grid-stage:generation', '발전', 'Generation', 'generation_utility'],
  ['grid-stage:transmission', '송전', 'Transmission', 'transmission_hvdc'],
  ['grid-stage:substation', '변전', 'Substation', 'substation_protection'],
  ['grid-stage:distribution', '배전', 'Distribution', 'distribution_power_electronics'],
  ['grid-stage:end_use', '최종수요', 'End use', 'demand_overseas'],
]) {
  addNode({ id, type: 'grid_stage', nameKo: ko, nameEn: en, role: 'grid_stage', lane, layer: ko });
}

for (const [id, ko, en, lane] of [
  ['equipment:power_transformer', '초고압·전력용 변압기', 'Power transformer', 'transmission_hvdc'],
  ['equipment:distribution_transformer', '배전용 변압기', 'Distribution transformer', 'distribution_power_electronics'],
  ['equipment:switchgear', '개폐기·배전반', 'Switchgear', 'substation_protection'],
  ['equipment:circuit_breaker', '차단기', 'Circuit breaker', 'substation_protection'],
  ['equipment:cable', '전선·케이블', 'Power cable', 'transmission_hvdc'],
  ['equipment:submarine_cable', '해저케이블', 'Submarine cable', 'transmission_hvdc'],
  ['equipment:protection_relay', '보호계전', 'Protection relay', 'substation_protection'],
  ['equipment:grid_automation', '전력자동화', 'Grid automation', 'substation_protection'],
  ['equipment:inverter', '전력변환·인버터', 'Inverter / power electronics', 'distribution_power_electronics'],
  ['equipment:hvdc_converter', 'HVDC 변환설비', 'HVDC converter', 'transmission_hvdc'],
  ['equipment:energy_storage_interface', 'ESS 연계', 'ESS interface', 'distribution_power_electronics'],
]) {
  addNode({ id, type: 'equipment_category', nameKo: ko, nameEn: en, role: 'equipment', lane, layer: ko });
}

for (const [id, ko, en] of [
  ['market:utility_grid', '유틸리티 전력망', 'Utility grid'],
  ['market:renewable_interconnection', '신재생 연계', 'Renewable interconnection'],
  ['market:data_center', '데이터센터 전력수요', 'Data center demand'],
  ['market:semiconductor_fab', '반도체 팹 전력수요', 'Semiconductor fab demand'],
  ['market:industrial_plant', '산업플랜트', 'Industrial plant'],
  ['market:commercial_building', '건물·인프라', 'Commercial building'],
  ['market:overseas_grid_expansion', '해외 전력망 확충', 'Overseas grid expansion'],
]) {
  addNode({
    id, type: 'end_market', nameKo: ko, nameEn: en, role: 'end_market',
    lane: 'demand_overseas', layer: ko,
  });
}

for (const [id, ko, en] of [
  ['region:north_america', '북미', 'North America'],
  ['region:middle_east', '중동', 'Middle East'],
  ['region:korea', '한국', 'Korea'],
]) {
  addNode({ id, type: 'region', nameKo: ko, nameEn: en, role: 'region', lane: 'demand_overseas', layer: ko });
}

addNode({
  id: 'group:epc_services',
  type: 'group',
  nameKo: 'EPC·시공·유지보수',
  nameEn: 'EPC / construction / O&M',
  role: 'epc',
  lane: 'epc_services',
  layer: 'EPC',
});

addNode({
  id: 'counterparty:undisclosed_us_utility',
  type: 'organization',
  nameKo: '미국 유틸리티(비공개)',
  nameEn: 'Undisclosed U.S. utility',
  role: 'anonymous_counterparty',
  lane: 'demand_overseas',
  isAnonymousCounterparty: true,
  noteKo: '공시상 최종 발주처 상호 미기재. 실제 회사로 표시하지 않음.',
  noteEn: 'End utility not named in disclosure — not shown as a real company.',
});

addNode({
  id: 'utility:kahramaa',
  type: 'utility',
  nameKo: '카타르 수전력청(KAHRAMAA)',
  nameEn: 'Qatar General Electricity & Water Corporation (KAHRAMAA)',
  role: 'utility',
  lane: 'demand_overseas',
  isListedKorea: false,
});

for (const [eq, st] of [
  ['equipment:power_transformer', 'grid-stage:transmission'],
  ['equipment:power_transformer', 'grid-stage:substation'],
  ['equipment:distribution_transformer', 'grid-stage:distribution'],
  ['equipment:switchgear', 'grid-stage:substation'],
  ['equipment:circuit_breaker', 'grid-stage:substation'],
  ['equipment:cable', 'grid-stage:transmission'],
  ['equipment:cable', 'grid-stage:distribution'],
  ['equipment:submarine_cable', 'grid-stage:transmission'],
  ['equipment:protection_relay', 'grid-stage:substation'],
  ['equipment:grid_automation', 'grid-stage:substation'],
  ['equipment:grid_automation', 'grid-stage:distribution'],
  ['equipment:inverter', 'grid-stage:distribution'],
  ['equipment:hvdc_converter', 'grid-stage:transmission'],
  ['equipment:energy_storage_interface', 'grid-stage:distribution'],
]) {
  if (addEdge({
    id: `used-${eq.split(':')[1]}-${st.split(':')[1]}`,
    source: eq,
    target: st,
    type: 'used_in_grid_stage',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '전력망 단계 적용',
    labelEn: 'Used in grid stage',
    defaultHidden: false,
    edgeOrigin: 'structuralGenerated',
    evidence: [],
    confidence: 'medium',
  }, {
    legacyEdgeId: null, source: eq, target: st,
    beforeType: null, afterType: 'used_in_grid_stage',
    beforeStatus: null, afterStatus: 'reference',
    origin: 'structuralGenerated', reason: 'equipment→stage',
  })) structuralGenerated += 1;
}

for (const c of companies) {
  const meta = LISTED_META[c.ticker] || { equipment: [], key: false };
  const chain = CHAIN[c.chain] || CHAIN['송배전'];
  const id = `krx:${c.ticker}`;
  addNode({
    id,
    type: 'listed_company',
    ticker: c.ticker,
    nameKo: c.name,
    nameEn: c.nameEn || c.name,
    isListedKorea: true,
    role: meta.utilityListed ? 'utility_operator' : chain.role,
    lane: chain.lane,
    layer: c.chain,
    chain: c.chain,
    mcapWon: c.mcap ?? null,
    keyCompany: !!meta.key,
  });

  const hubId = `group:chain_${encodeURIComponent(c.chain)}`;
  addNode({
    id: hubId,
    type: 'group',
    nameKo: c.chain,
    nameEn: c.chain,
    role: 'chain',
    lane: chain.lane,
    layer: c.chain,
  });

  if (addEdge({
    id: `member-${c.ticker}-chain`,
    source: id,
    target: hubId,
    type: 'member_of',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: `${c.chain} 분류`,
    labelEn: `${c.chain} classification`,
    defaultHidden: false,
    edgeOrigin: 'structuralGenerated',
    evidence: [],
    confidence: 'medium',
  }, {
    legacyEdgeId: null, source: id, target: hubId,
    beforeType: null, afterType: 'member_of',
    beforeStatus: null, afterStatus: 'reference',
    origin: 'structuralGenerated', reason: 'chain classification',
  })) structuralGenerated += 1;

  const eqs = meta.equipment.length ? meta.equipment : chain.equipment;
  for (const eq of eqs) {
    if (addEdge({
      id: `mfg-${c.ticker}-${eq.split(':')[1]}`,
      source: id,
      target: eq,
      type: 'manufactures',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '주요 설비',
      labelEn: 'Manufactures equipment',
      defaultHidden: false,
      edgeOrigin: 'structuralGenerated',
      evidence: [],
      confidence: 'medium',
      noteKo: '제품·분류 근거. 특정 고객 공급을 의미하지 않음.',
      noteEn: 'Product/classification only — not a customer supply claim.',
    }, {
      legacyEdgeId: null, source: id, target: eq,
      beforeType: null, afterType: 'manufactures',
      beforeStatus: null, afterStatus: 'reference',
      origin: 'structuralGenerated', reason: 'role equipment',
    })) structuralGenerated += 1;
  }

  for (const st of chain.stages) {
    if (addEdge({
      id: `stage-${c.ticker}-${st.split(':')[1]}`,
      source: id,
      target: st,
      type: 'used_in_grid_stage',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '적용 전력망 단계',
      labelEn: 'Grid stage exposure',
      defaultHidden: false,
      edgeOrigin: 'structuralGenerated',
      evidence: [],
      confidence: 'medium',
    })) structuralGenerated += 1;
  }

  for (const mk of chain.markets) {
    if (addEdge({
      id: `mkt-${c.ticker}-${mk.split(':')[1]}`,
      source: id,
      target: mk,
      type: 'exposed_to',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '수요시장 노출',
      labelEn: 'End-market exposure',
      defaultHidden: false,
      edgeOrigin: 'structuralGenerated',
      evidence: [],
      confidence: 'medium',
      noteKo: '수요시장 노출. 특정 고객 계약이 아님.',
      noteEn: 'Market exposure only — not a named customer contract.',
    })) structuralGenerated += 1;
  }
}

const GRID_GLOBALS = new Set(['siemens_energy', 'ge_vernova', 'schneider_e', 'abb']);
for (const g of globals) {
  if (!GRID_GLOBALS.has(g.id)) continue;
  addNode({
    id: `global:${g.id}`,
    type: 'global_company',
    nameKo: g.name || g.id,
    nameEn: g.nameEn || g.name || g.id,
    role: 'global_peer',
    lane: 'demand_overseas',
    isListedKorea: false,
  });
}

function partnerId(p) { return p && typeof p === 'object' ? p.id : p; }
function partnerKind(p) { return p && typeof p === 'object' ? (p.kind || 'partner') : 'partner'; }

for (const c of companies) {
  const src = `krx:${c.ticker}`;
  for (const raw of c.partners || []) {
    const pid = partnerId(raw);
    const kind = partnerKind(raw);
    const legacyId = `${c.ticker}-${pid}`;
    if (kind === 'theme' || pid === 'kepco') {
      removedUnsupported += 1;
      changelog.push({
        legacyEdgeId: legacyId, source: src, target: String(pid),
        beforeType: 'partner', afterType: 'removed',
        beforeStatus: 'legacy', afterStatus: 'removed',
        origin: 'legacyMigrated',
        reason: 'theme/utility demand → market exposure, not partner edge',
      });
      continue;
    }
    if (!GRID_GLOBALS.has(pid)) {
      removedUnsupported += 1;
      changelog.push({
        legacyEdgeId: legacyId, source: src, target: String(pid),
        beforeType: 'partner', afterType: 'removed',
        beforeStatus: 'legacy', afterStatus: 'removed',
        origin: 'legacyMigrated',
        reason: 'non-grid global dropped from powergrid peer set',
      });
      continue;
    }
    const tgt = `global:${pid}`;
    if (addEdge({
      id: `peer-${c.ticker}-${pid}`,
      source: src,
      target: tgt,
      type: 'peer',
      direction: 'undirected',
      status: 'peer',
      labelKo: '글로벌 피어',
      labelEn: 'Global peer',
      defaultHidden: true,
      edgeOrigin: 'legacyMigrated',
      evidence: [],
      confidence: 'low',
      noteKo: '동종 설비 글로벌 경쟁사. 거래·수주 아님.',
      noteEn: 'Global equipment peer — not a trade/award edge.',
    }, {
      legacyEdgeId: legacyId, source: src, target: tgt,
      beforeType: 'partner', afterType: 'peer',
      beforeStatus: 'legacy', afterStatus: 'peer',
      origin: 'legacyMigrated', reason: 'legacy partner → peer (default hidden)',
    })) legacyMigrated += 1;
  }
}

// ——— Curated contracts ———
addNode({
  id: 'contract:hde-20260507-us-transformer',
  type: 'contract',
  nameKo: 'HD현대일렉트릭 美 765kV 변압기·리액터 공급계약',
  nameEn: 'HD Hyundai Electric U.S. 765kV transformer/reactor supply',
  role: 'contract',
  lane: 'demand_overseas',
  announcementDate: '2026-05-07',
  contractDate: '2026-05-06',
  effectiveFrom: '2026-05-06',
  validTo: '2029-08-31',
  contractValue: 173000000000,
  currency: 'KRW',
  counterpartyDisclosure: 'undisclosed',
  productScope: '765kV transformer, reactor',
  status: 'effective',
  lastVerifiedAt: AS_OF,
});

addNode({
  id: 'project:qatar-gtc-1217a-2024',
  type: 'project',
  nameKo: '카타르 송전계통 확장 EHV 케이블 (GTC/1217A/2024)',
  nameEn: 'Qatar Power Transmission Expansion EHV cables (GTC/1217A/2024)',
  role: 'project',
  lane: 'demand_overseas',
  status: 'announced',
  lastVerifiedAt: AS_OF,
});

addNode({
  id: 'contract:taihan-20250825-kahramaa-loa',
  type: 'contract',
  nameKo: '대한전선 카타르 KAHRAMAA 낙찰통지 (GTC/1217A/2024)',
  nameEn: 'Taihan LOA from KAHRAMAA (GTC/1217A/2024)',
  role: 'contract',
  lane: 'demand_overseas',
  announcementDate: '2025-08-25',
  contractDate: '2025-08-25',
  contractValue: 180400000000,
  currency: 'KRW',
  counterpartyDisclosure: 'named',
  productScope: '400kV/220kV EHV cable full turnkey',
  status: 'announced',
  lastVerifiedAt: AS_OF,
});

function curated(e, reason) {
  e.edgeOrigin = 'manuallyCurated';
  e.lastVerifiedAt = AS_OF;
  if (addEdge(e, {
    legacyEdgeId: null, source: e.source, target: e.target,
    beforeType: null, afterType: e.type,
    beforeStatus: null, afterStatus: e.status,
    origin: 'manuallyCurated', reason,
  })) manuallyCurated += 1;
}

curated({
  id: 'award-267260-hde-20260507',
  source: 'krx:267260',
  target: 'contract:hde-20260507-us-transformer',
  type: 'awarded_contract',
  direction: 'source_to_target',
  status: 'reported',
  labelKo: '단일판매·공급계약 체결',
  labelEn: 'Major supply contract disclosed',
  defaultHidden: false,
  confidence: 'high',
  asOf: '2026-05-07',
  evidence: [mkEv({
    reviewStatus: 'reviewed', reviewedAt: AS_OF, reviewedBy: BY,
    directEvidence: true, sourceType: 'dart',
    title: 'HD현대일렉트릭 단일판매ㆍ공급계약체결 (rcpNo=20260507800238)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507800238',
    publishedAt: '2026-05-07',
    evidenceSummaryKo: '미국 자회사 경유 765kV 변압기·리액터 공급 ~1,730억원. 최종 유틸리티명 비공개.',
    evidenceSummaryEn: '~KRW 173bn 765kV transformer/reactor via U.S. sub; end utility undisclosed.',
    quotedFactKo: '765KV 초고압 변압기 및 리액터',
    relationshipSupported: 'krx:267260 awarded_contract contract:hde-20260507-us-transformer',
  })],
}, 'HD Hyundai Electric DART award');

curated({
  id: 'supply-hde-undisclosed-us',
  source: 'contract:hde-20260507-us-transformer',
  target: 'counterparty:undisclosed_us_utility',
  type: 'supplies_transformer_to',
  direction: 'source_to_target',
  status: 'reference',
  labelKo: '미국 유틸리티(비공개) 향 변압기 공급',
  labelEn: 'Transformer supply to undisclosed U.S. utility',
  defaultHidden: false,
  confidence: 'medium',
  asOf: '2026-05-07',
  evidence: [mkEv({
    reviewStatus: 'reviewed', reviewedAt: AS_OF, reviewedBy: BY,
    directEvidence: true, sourceType: 'dart',
    title: 'HD현대일렉트릭 — 공급지역 미국, 최종 발주처 비공개',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507800238',
    publishedAt: '2026-05-07',
    evidenceSummaryKo: '공급지역 미국. 공시 본문에 최종 유틸리티 상호 미기재.',
    evidenceSummaryEn: 'Supply region U.S.; end utility legal name not disclosed.',
    relationshipSupported: 'contract:hde-20260507-us-transformer supplies_transformer_to counterparty:undisclosed_us_utility',
  })],
}, 'anonymous US utility path');

curated({
  id: 'located-hde-na',
  source: 'contract:hde-20260507-us-transformer',
  target: 'region:north_america',
  type: 'located_in',
  direction: 'source_to_target',
  status: 'reference',
  defaultHidden: false,
  confidence: 'high',
  evidence: [mkEv({
    reviewStatus: 'reviewed', reviewedAt: AS_OF, reviewedBy: BY,
    directEvidence: true, sourceType: 'dart',
    title: 'HD현대일렉트릭 공급지역 미국',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507800238',
    publishedAt: '2026-05-07',
    evidenceSummaryKo: '공시 공급지역: 미국',
    evidenceSummaryEn: 'Disclosure supply region: United States',
    relationshipSupported: 'contract:hde-20260507-us-transformer located_in region:north_america',
  })],
}, 'contract region');

curated({
  id: 'award-001440-kahramaa-loa',
  source: 'krx:001440',
  target: 'contract:taihan-20250825-kahramaa-loa',
  type: 'awarded_contract',
  direction: 'source_to_target',
  status: 'reported',
  labelKo: '카타르 수전력청 낙찰통지',
  labelEn: 'KAHRAMAA letter of award',
  defaultHidden: false,
  confidence: 'high',
  asOf: '2025-08-25',
  evidence: [mkEv({
    reviewStatus: 'reviewed', reviewedAt: AS_OF, reviewedBy: BY,
    directEvidence: true, sourceType: 'dart',
    title: '대한전선 투자판단관련주요경영사항 (rcpNo=20250825800543)',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250825800543',
    publishedAt: '2025-08-25',
    evidenceSummaryKo: 'KAHRAMAA GTC/1217A/2024 낙찰통지. 400/220kV EHV 케이블 Full-Turnkey.',
    evidenceSummaryEn: 'LOA from KAHRAMAA for GTC/1217A/2024 400/220kV EHV cable full turnkey.',
    quotedFactKo: '카타르 국영 수전력청 … 낙찰 통지서',
    relationshipSupported: 'krx:001440 awarded_contract contract:taihan-20250825-kahramaa-loa',
  })],
}, 'Taihan KAHRAMAA LOA');

curated({
  id: 'owner-kahramaa-qatar',
  source: 'utility:kahramaa',
  target: 'project:qatar-gtc-1217a-2024',
  type: 'project_owner',
  direction: 'source_to_target',
  status: 'reference',
  defaultHidden: false,
  confidence: 'high',
  evidence: [mkEv({
    reviewStatus: 'reviewed', reviewedAt: AS_OF, reviewedBy: BY,
    directEvidence: true, sourceType: 'dart',
    title: '대한전선 — 발주처 KAHRAMAA',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250825800543',
    publishedAt: '2025-08-25',
    evidenceSummaryKo: '공시 발주처: Qatar General Electricity & Water Corporation',
    evidenceSummaryEn: 'Disclosed owner: KAHRAMAA',
    relationshipSupported: 'utility:kahramaa project_owner project:qatar-gtc-1217a-2024',
  })],
}, 'KAHRAMAA owner');

// supplier-001440-qatar and cable-001440-kahramaa added in Phase 4A.1 curation (canonical contract path)

curated({
  id: 'located-qatar-me',
  source: 'project:qatar-gtc-1217a-2024',
  target: 'region:middle_east',
  type: 'located_in',
  direction: 'source_to_target',
  status: 'reference',
  defaultHidden: false,
  confidence: 'high',
  evidence: [mkEv({
    reviewStatus: 'reviewed', reviewedAt: AS_OF, reviewedBy: BY,
    directEvidence: true, sourceType: 'dart',
    title: '카타르 프로젝트 소재지',
    url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250825800543',
    publishedAt: '2025-08-25',
    evidenceSummaryKo: '카타르 송전계통 확장 프로젝트',
    evidenceSummaryEn: 'Qatar transmission expansion project',
    relationshipSupported: 'project:qatar-gtc-1217a-2024 located_in region:middle_east',
  })],
}, 'project region');

const STRUCTURAL = new Set([
  'member_of', 'manufactures', 'develops', 'used_in_grid_stage', 'exposed_to', 'supports_market', 'located_in',
]);
const BUSINESS = new Set([
  'supplies_transformer_to', 'supplies_cable_to', 'supplies_switchgear_to', 'supplies_equipment_to',
  'awarded_contract', 'project_supplier', 'epc_for', 'consortium_member', 'technology_partnership',
  'owns', 'joint_venture', 'maintains', 'project_owner', 'project_operator', 'participates_in',
]);
const WEAK = new Set(['peer', 'reference', 'inferred', 'ended']);

const listedIds = nodes.filter((n) => n.type === 'listed_company').map((n) => n.id);
const bizDeg = new Map(listedIds.map((id) => [id, 0]));
const structDeg = new Map(listedIds.map((id) => [id, 0]));
const weakDeg = new Map(listedIds.map((id) => [id, 0]));
for (const e of edges) {
  for (const end of [e.source, e.target]) {
    if (!bizDeg.has(end)) continue;
    if (BUSINESS.has(e.type)) bizDeg.set(end, bizDeg.get(end) + 1);
    else if (STRUCTURAL.has(e.type)) structDeg.set(end, structDeg.get(end) + 1);
    else if (WEAK.has(e.type) || e.status === 'peer') weakDeg.set(end, weakDeg.get(end) + 1);
  }
}

let businessRelationOrphanCount = 0;
let classificationOnlyCompanyCount = 0;
let weakRelationOnlyCompanyCount = 0;
for (const id of listedIds) {
  const b = bizDeg.get(id) || 0;
  const s = structDeg.get(id) || 0;
  const w = weakDeg.get(id) || 0;
  if (b === 0) businessRelationOrphanCount += 1;
  if (b === 0 && s > 0 && w === 0) classificationOnlyCompanyCount += 1;
  if (b === 0 && w > 0 && s === 0) weakRelationOnlyCompanyCount += 1;
}

const statusCounts = {};
const typeCounts = {};
for (const e of edges) {
  statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
  typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
}

const metrics = {
  legacyMigratedEdgeCount: legacyMigrated,
  structuralGeneratedEdgeCount: structuralGenerated,
  manuallyCuratedEdgeCount: manuallyCurated,
  removedEdgeCount: removedUnsupported,
  finalEdgeCount: edges.length,
  legacyMigratedBusinessEdgeCount: legacyMigrated,
  manuallyCuratedBusinessEdgeCount: manuallyCurated,
  confirmedBusinessEdgeCount: edges.filter((e) => BUSINESS.has(e.type) && e.status === 'confirmed').length,
  reportedBusinessEdgeCount: edges.filter((e) => BUSINESS.has(e.type) && e.status === 'reported').length,
  businessRelationOrphanCount,
  classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount,
  directRelationshipOrphanCount: businessRelationOrphanCount,
  phase4aMigratedAt: AS_OF,
};

const network = {
  sectorId: 'powergrid',
  model: 'grid_infrastructure_ecosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  layers: ['발전설비', '전력설비', '송배전', '전선·케이블', '수요·해외'],
  lanes: [
    'generation_utility', 'transmission_hvdc', 'substation_protection',
    'distribution_power_electronics', 'demand_overseas', 'epc_services',
  ],
  _legacyFallback: false,
  metrics,
  nodes,
  edges,
};

const report = validateNetworkReport(network, { sectorKey: 'powergrid' });
fs.writeFileSync(OUT_NET, JSON.stringify(network, null, 2), 'utf8');
fs.writeFileSync(OUT_LOG, JSON.stringify({
  asOf: AS_OF,
  changelog,
  metrics,
  statusCounts,
  typeCounts,
  validate: { failures: report.failures, warnings: report.warnings },
  audit: {
    listedCount: companies.length,
    tickers: companies.map((c) => ({ ticker: c.ticker, name: c.name, chain: c.chain, partners: (c.partners || []).length })),
    legacyPartnerEdges: companies.reduce((n, c) => n + (c.partners || []).length, 0),
    globalCandidates: globals.length,
    gridGlobalsKept: [...GRID_GLOBALS],
  },
}, null, 2), 'utf8');

console.log(JSON.stringify({
  nodes: nodes.length,
  edges: edges.length,
  metrics,
  statusCounts,
  typeCounts,
  failures: report.failures,
  warnings: report.warnings,
}, null, 2));
if (report.failures.length) process.exit(1);
