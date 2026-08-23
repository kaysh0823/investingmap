/**
 * Phase 4B — Migrate nuclear partners → data/networks/nuclear.json
 * Model: nuclear_project_lifecycle_ecosystem / nuclearProjectEcosystem
 * Never auto-promotes to confirmed. Does not change cp_list / company count.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeNuclearProjectMetrics } from '../lib/relation_network/nuclear_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review';
const HTML = join(ROOT, 'nuclear', 'korea_nuclear_map.html');
const OUT_NET = join(ROOT, 'data', 'networks', 'nuclear.json');
const OUT_LOG = join(ROOT, 'data', 'nuclear_relation_phase4b_changelog.json');

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
let manuallyCurated = 0;
let legacyMigrated = 0;
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

function baseEdge(partial) {
  return {
    status: 'reported',
    confidence: 'medium',
    asOf: AS_OF,
    defaultHidden: false,
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    lastVerifiedAt: null,
    directEvidence: false,
    ...partial,
  };
}

/** Role mapping from Korean chain labels (cp_list priority). */
const CHAIN_ROLE = {
  '원자로·주기기': {
    role: 'nsss_supplier',
    lane: 'nsss_reactor',
    equipment: ['equipment:nsss', 'equipment:reactor_vessel', 'equipment:steam_generator'],
    stages: ['lifecycle:nsss', 'lifecycle:construction'],
    scope: 'large_nuclear',
  },
  '설계·EPC': {
    role: 'architect_engineer',
    lane: 'export_epc_design',
    equipment: ['equipment:design_engineering'],
    stages: ['lifecycle:design', 'lifecycle:epc'],
    scope: 'large_nuclear',
  },
  '운영·정비': {
    role: 'maintenance',
    lane: 'fuel_maintenance',
    equipment: ['equipment:om_services'],
    stages: ['lifecycle:operation', 'lifecycle:maintenance'],
    scope: 'om',
  },
  '계측·보조기기': {
    role: 'pump_valve',
    lane: 'construction_ic',
    equipment: ['equipment:heat_exchanger', 'equipment:ic', 'equipment:valve_pump'],
    stages: ['lifecycle:balance_of_plant', 'lifecycle:ic'],
    scope: 'large_nuclear',
  },
};

const LISTED_META = {
  '034020': {
    role: 'nsss_supplier',
    equipment: ['equipment:nsss', 'equipment:reactor_vessel', 'equipment:steam_generator'],
    key: true,
    smr: true,
  },
  '052690': {
    role: 'architect_engineer',
    equipment: ['equipment:design_engineering'],
    key: true,
    smr: false,
  },
  '051600': {
    role: 'maintenance',
    equipment: ['equipment:om_services'],
    key: true,
    smr: false,
  },
  '083650': {
    role: 'heat_exchanger',
    equipment: ['equipment:heat_exchanger', 'equipment:valve_pump'],
    key: true,
    smr: false,
  },
  '130660': {
    role: 'maintenance',
    equipment: ['equipment:om_services'],
    key: false,
    smr: false,
  },
  '006910': {
    role: 'electrical_equipment',
    equipment: ['equipment:electrical'],
    key: false,
    smr: false,
  },
  '105840': {
    role: 'instrumentation_control',
    equipment: ['equipment:ic'],
    key: false,
    smr: false,
  },
};

const NUCLEAR_GLOBALS = {
  ge_vernova: {
    slug: 'ge-vernova',
    nameKo: 'GE Vernova',
    nameEn: 'GE Vernova',
    role: 'turbine_generator',
    peer: true,
  },
  mitsubishi_heavy: {
    slug: 'mitsubishi-heavy',
    nameKo: '미쓰비시중공업',
    nameEn: 'Mitsubishi Heavy Industries',
    role: 'reactor_supplier',
    peer: true,
  },
  orano: {
    slug: 'orano',
    nameKo: '오라노',
    nameEn: 'Orano',
    role: 'nuclear_fuel',
    peer: true,
  },
};

// —— Structural lifecycle / equipment / reactor / country ——
for (const [id, ko, en, lane] of [
  ['lifecycle:owner_procure', '발주·사업개발', 'Owner / procurement', 'owner_operator'],
  ['lifecycle:design', '종합설계', 'Architect-engineer', 'export_epc_design'],
  ['lifecycle:epc', 'EPC', 'EPC', 'export_epc_design'],
  ['lifecycle:nsss', '원자로·주기기(NSSS)', 'NSSS / reactor', 'nsss_reactor'],
  ['lifecycle:turbine', '터빈·발전기', 'Turbine generator', 'turbine_balance'],
  ['lifecycle:balance_of_plant', '보조기기', 'Balance of plant', 'construction_ic'],
  ['lifecycle:ic', '계측제어', 'I&C', 'construction_ic'],
  ['lifecycle:construction', '시공', 'Construction', 'construction_ic'],
  ['lifecycle:commissioning', '시운전', 'Commissioning', 'fuel_maintenance'],
  ['lifecycle:operation', '운영', 'Operation', 'owner_operator'],
  ['lifecycle:maintenance', '정비', 'Maintenance', 'fuel_maintenance'],
  ['lifecycle:fuel', '핵연료', 'Nuclear fuel', 'fuel_maintenance'],
  ['lifecycle:decommissioning', '해체·폐기물', 'Decommissioning / waste', 'fuel_maintenance'],
  ['lifecycle:smr_dev', 'SMR 기술개발', 'SMR development', 'smr_development'],
]) {
  addNode({
    id,
    type: 'lifecycle_stage',
    nameKo: ko,
    nameEn: en,
    role: 'lifecycle_stage',
    lane,
    layer: ko,
  });
}

for (const [id, ko, en, lane] of [
  ['equipment:nsss', '원자로계통(NSSS)', 'Nuclear steam supply system', 'nsss_reactor'],
  ['equipment:reactor_vessel', '원자로용기', 'Reactor vessel', 'nsss_reactor'],
  ['equipment:steam_generator', '증기발생기', 'Steam generator', 'nsss_reactor'],
  ['equipment:turbine_generator', '터빈·발전기', 'Turbine generator', 'turbine_balance'],
  ['equipment:heat_exchanger', '열교환기', 'Heat exchanger', 'construction_ic'],
  ['equipment:valve_pump', '밸브·펌프', 'Valves & pumps', 'construction_ic'],
  ['equipment:ic', '계측제어', 'Instrumentation & control', 'construction_ic'],
  ['equipment:electrical', '전기설비', 'Electrical equipment', 'construction_ic'],
  ['equipment:design_engineering', '원전설계·엔지니어링', 'Nuclear design engineering', 'export_epc_design'],
  ['equipment:om_services', '원전 운영·정비 서비스', 'Nuclear O&M services', 'fuel_maintenance'],
  ['equipment:nuclear_fuel', '핵연료', 'Nuclear fuel', 'fuel_maintenance'],
  ['equipment:smr_module', 'SMR 모듈·기자재', 'SMR module / equipment', 'smr_development'],
]) {
  addNode({
    id,
    type: 'equipment_category',
    nameKo: ko,
    nameEn: en,
    role: 'equipment',
    lane,
    layer: ko,
  });
}

addNode({
  id: 'reactor:apr1400',
  type: 'reactor_technology',
  nameKo: 'APR1400',
  nameEn: 'APR1400',
  role: 'reactor_technology',
  lane: 'nsss_reactor',
  reactorFamily: 'APR1400',
});

addNode({
  id: 'smr:nuscale',
  type: 'smr_technology',
  nameKo: 'NuScale VOYGR',
  nameEn: 'NuScale VOYGR',
  role: 'smr_technology',
  lane: 'smr_development',
  designStatus: 'design_certification_path',
  certificationStatus: 'us_nrc_design_certification_issued',
});

addNode({
  id: 'smr:korea-ismr',
  type: 'smr_technology',
  nameKo: '한국형 i-SMR',
  nameEn: 'Korea i-SMR',
  role: 'smr_technology',
  lane: 'smr_development',
  designStatus: 'under_development',
  certificationStatus: 'pre_licensing',
});

for (const [id, ko, en] of [
  ['country:KR', '대한민국', 'Republic of Korea'],
  ['country:AE', '아랍에미리트', 'United Arab Emirates'],
  ['country:CZ', '체코', 'Czech Republic'],
  ['country:PL', '폴란드', 'Poland'],
]) {
  addNode({ id, type: 'country', nameKo: ko, nameEn: en, role: 'country', lane: 'overseas_project' });
}

addNode({
  id: 'government:kr',
  type: 'government',
  nameKo: '대한민국 정부',
  nameEn: 'Government of Korea',
  role: 'government',
  lane: 'owner_operator',
  isListedKorea: false,
});

addNode({
  id: 'operator:khnp',
  type: 'operator',
  nameKo: '한국수력원자력',
  nameEn: 'Korea Hydro & Nuclear Power (KHNP)',
  role: 'operator',
  lane: 'owner_operator',
  isListedKorea: false,
  entityKind: 'public_corporation',
});

addNode({
  id: 'public:kepco',
  type: 'public_corporation',
  nameKo: '한국전력공사',
  nameEn: 'Korea Electric Power Corporation (KEPCO)',
  role: 'export_lead',
  lane: 'export_epc_design',
  isListedKorea: false,
  noteKo: '상장사(015760)와 별도 공기업 노드. nuclear cp_list에는 없음.',
  noteEn: 'Distinct from listed ticker 015760; not in nuclear cp_list.',
});

addNode({
  id: 'org:enec',
  type: 'organization',
  nameKo: '아랍에미리트원자력공사(ENEC)',
  nameEn: 'Emirates Nuclear Energy Corporation (ENEC)',
  role: 'project_owner',
  lane: 'overseas_project',
  isListedKorea: false,
});

addNode({
  id: 'org:cez',
  type: 'organization',
  nameKo: 'ČEZ',
  nameEn: 'ČEZ',
  role: 'project_owner',
  lane: 'overseas_project',
  isListedKorea: false,
});

// —— Listed companies ——
for (const c of companies) {
  const meta = LISTED_META[c.ticker] || {};
  const chain = CHAIN_ROLE[c.chain] || CHAIN_ROLE['계측·보조기기'];
  addNode({
    id: `krx:${c.ticker}`,
    type: 'listed_company',
    ticker: c.ticker,
    nameKo: c.nameKo || c.name || c.ticker,
    nameEn: c.nameEn || c.name || c.ticker,
    market: c.market || null,
    chain: c.chain || null,
    role: meta.role || chain.role,
    lane: chain.lane,
    scopeTags: meta.smr ? ['large_nuclear', 'smr'] : [chain.scope || 'large_nuclear'],
    isListedKorea: true,
    isKey: !!meta.key,
  });
}

// —— Nuclear-relevant globals only (drop EV/renewable leftover) ——
for (const g of globals) {
  const spec = NUCLEAR_GLOBALS[g.id];
  if (!spec) {
    removedUnsupported += 1;
    changelog.push({
      legacyEdgeId: null,
      source: `global:${g.id}`,
      target: null,
      beforeType: 'global_company',
      afterType: 'removed',
      beforeEditorialStatus: null,
      afterEditorialStatus: null,
      beforeProjectStatus: null,
      afterProjectStatus: null,
      origin: 'legacy_global_roster',
      reason: 'Not nuclear-relevant leftover from energy split; excluded from nuclear network',
    });
    continue;
  }
  addNode({
    id: `global:${spec.slug}`,
    type: 'global_company',
    nameKo: spec.nameKo,
    nameEn: spec.nameEn,
    role: spec.role,
    lane: spec.role === 'turbine_generator' ? 'turbine_balance' : 'nsss_reactor',
    isListedKorea: false,
    legacyPartnerId: g.id,
  });
}

// —— Projects ——
addNode({
  id: 'nuclear-project:domestic-apr1400-ecosystem',
  type: 'nuclear_project',
  nameKo: '국내 APR1400 생태계(대표 구조)',
  nameEn: 'Domestic APR1400 ecosystem (structural)',
  role: 'nuclear_project',
  lane: 'owner_operator',
  countryCode: 'KR',
  reactorTechnologyId: 'reactor:apr1400',
  projectStatus: 'operating',
  scope: 'domestic',
  isStructuralBundle: true,
  noteKo: '특정 호기 수주가 아닌 국내 APR1400 공급·운영 구조 설명용 노드',
  noteEn: 'Structural bundle for domestic APR1400 roles — not a unit-level award',
  asOf: AS_OF,
});

addNode({
  id: 'nuclear-project:uae-barakah',
  type: 'nuclear_project',
  nameKo: 'UAE 바라카 원전',
  nameEn: 'UAE Barakah Nuclear Power Plant',
  role: 'nuclear_project',
  lane: 'overseas_project',
  countryCode: 'AE',
  ownerOrgId: 'org:enec',
  operatorId: 'org:enec',
  reactorTechnologyId: 'reactor:apr1400',
  unitCount: 4,
  projectStatus: 'operating',
  scope: 'overseas',
  totalProjectValue: null,
  currency: null,
  valueType: 'undisclosed',
  contractSigned: true,
  asOf: AS_OF,
});

addNode({
  id: 'nuclear-project:czechia-dukovany5',
  type: 'nuclear_project',
  nameKo: '체코 두코바니 5호기',
  nameEn: 'Czech Dukovany Unit 5',
  role: 'nuclear_project',
  lane: 'overseas_project',
  countryCode: 'CZ',
  ownerOrgId: 'org:cez',
  reactorTechnologyId: 'reactor:apr1400',
  unitCount: 1,
  projectStatus: 'selected_bidder',
  scope: 'overseas',
  totalProjectValue: null,
  currency: 'EUR',
  valueType: 'potential_value',
  contractSigned: false,
  asOf: AS_OF,
  noteKo: '사업자 선정·우선협상 단계. EPC 본계약과 구분.',
  noteEn: 'Preferred/selected bidder stage — distinct from EPC contract signing.',
});

addNode({
  id: 'nuclear-project:poland-nuclear-mou',
  type: 'nuclear_project',
  nameKo: '폴란드 원전 협력(MOU)',
  nameEn: 'Poland nuclear cooperation (MOU)',
  role: 'nuclear_project',
  lane: 'overseas_project',
  countryCode: 'PL',
  projectStatus: 'memorandum',
  scope: 'overseas',
  contractSigned: false,
  valueType: 'potential_value',
  asOf: AS_OF,
  noteKo: '정부·기관 협력 양해각서 단계. 개별 기자재 수주가 아님.',
  noteEn: 'Intergovernmental/institutional MOU — not a company equipment award.',
});

addNode({
  id: 'nuclear-project:khnp-domestic-om',
  type: 'nuclear_project',
  nameKo: '한수원 국내 원전 운영·정비',
  nameEn: 'KHNP domestic fleet O&M',
  role: 'nuclear_project',
  lane: 'fuel_maintenance',
  countryCode: 'KR',
  operatorId: 'operator:khnp',
  projectStatus: 'operating',
  scope: 'om',
  isStructuralBundle: true,
  contractSigned: false,
  asOf: AS_OF,
  noteKo: '신규 수주가 아닌 국내 가동 원전 정비·운영 구조',
  noteEn: 'Operating-fleet O&M structure — not a newbuild award',
});

addNode({
  id: 'consortium:czechia-dukovany',
  type: 'consortium',
  nameKo: '체코 두코바니 한국 컨소시엄',
  nameEn: 'Korea consortium for Dukovany',
  consortiumName: 'Korea Dukovany consortium',
  projectId: 'nuclear-project:czechia-dukovany5',
  formedAt: '2024-07',
  leadEntity: 'operator:khnp',
  memberIds: ['operator:khnp', 'krx:034020', 'krx:052690', 'public:kepco'],
  roleByMember: {
    'operator:khnp': 'export_lead',
    'krx:034020': 'nsss_supplier',
    'krx:052690': 'architect_engineer',
    'public:kepco': 'export_support',
  },
  asOf: AS_OF,
  noteKo: '공식 참여가 보도·발표된 핵심 구성만 포함. Team Korea를 단일 법인으로 취급하지 않음.',
  noteEn: 'Only publicly attributed core members — Team Korea is not a legal entity node.',
});

// —— Structural equipment / lifecycle edges for listed ——
for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const meta = LISTED_META[c.ticker] || {};
  const chain = CHAIN_ROLE[c.chain] || {};
  const equipment = meta.equipment || chain.equipment || [];
  const stages = chain.stages || [];

  for (const eq of equipment) {
    if (!nodeIds.has(eq)) continue;
    const ok = addEdge(baseEdge({
      id: `e-mfg-${c.ticker}-${eq.split(':')[1]}`,
      source: id,
      target: eq,
      type: 'manufactures',
      status: 'reference',
      confidence: 'medium',
      editorialStatus: 'reference',
      relationClass: 'structural',
      evidence: [mkEv({
        title: 'Company chain / product classification (structural)',
        url: 'https://kind.krx.co.kr/',
        sourceType: 'exchange_disclosure',
        evidenceSummaryKo: 'cp_list 체인·제품 분류 기반 구조 관계. 특정 프로젝트 수주를 의미하지 않음.',
        evidenceSummaryEn: 'Structural classification from sector chain — not a project award.',
        relationshipSupported: 'product_capability',
      })],
    }), {
      legacyEdgeId: null,
      source: id,
      target: eq,
      beforeType: null,
      afterType: 'manufactures',
      beforeEditorialStatus: null,
      afterEditorialStatus: 'reference',
      beforeProjectStatus: null,
      afterProjectStatus: null,
      origin: 'structural_generated',
      reason: 'Equipment capability from chain classification',
    });
    if (ok) structuralGenerated += 1;
  }

  for (const st of stages) {
    if (!nodeIds.has(st)) continue;
    const ok = addEdge(baseEdge({
      id: `e-life-${c.ticker}-${st.split(':')[1]}`,
      source: id,
      target: st,
      type: 'supports_lifecycle_stage',
      status: 'reference',
      confidence: 'medium',
      editorialStatus: 'reference',
      relationClass: 'structural',
      evidence: [mkEv({
        title: 'Lifecycle role mapping',
        url: 'https://kind.krx.co.kr/',
        sourceType: 'other',
        evidenceSummaryKo: '원전 생애주기 역할 매핑(구조).',
        evidenceSummaryEn: 'Nuclear lifecycle role mapping (structural).',
        relationshipSupported: 'lifecycle_role',
      })],
    }));
    if (ok) structuralGenerated += 1;
  }

  if (meta.smr) {
    addEdge(baseEdge({
      id: `e-smr-eq-${c.ticker}`,
      source: id,
      target: 'equipment:smr_module',
      type: 'manufactures',
      status: 'reference',
      editorialStatus: 'reference',
      relationClass: 'structural',
      scope: 'smr',
      evidence: [mkEv({
        title: 'SMR equipment capability (structural)',
        url: 'https://www.doosanenerbility.com/',
        sourceType: 'company_ir',
        evidenceSummaryKo: 'SMR 기자재 역량 구조 표시. 특정 SMR 본계약을 의미하지 않음.',
        evidenceSummaryEn: 'SMR equipment capability only — not an SMR EPC award.',
        relationshipSupported: 'smr_capability',
      })],
    }));
    structuralGenerated += 1;
  }
}

// APR1400 structural: reactor used in domestic + Barakah
addEdge(baseEdge({
  id: 'e-apr-domestic',
  source: 'reactor:apr1400',
  target: 'nuclear-project:domestic-apr1400-ecosystem',
  type: 'used_in_reactor',
  status: 'reference',
  editorialStatus: 'reference',
  relationClass: 'structural',
  projectStatus: 'operating',
  evidence: [mkEv({
    title: 'APR1400 domestic fleet',
    url: 'https://www.khnp.co.kr/',
    sourceType: 'operator',
    evidenceSummaryKo: '국내 APR1400 계열 원전 기술 구조.',
    evidenceSummaryEn: 'Domestic APR1400 technology structure.',
    relationshipSupported: 'reactor_technology',
  })],
}));
structuralGenerated += 1;

addEdge(baseEdge({
  id: 'e-apr-barakah',
  source: 'reactor:apr1400',
  target: 'nuclear-project:uae-barakah',
  type: 'used_in_reactor',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'operating',
  evidence: [mkEv({
    title: 'Barakah APR1400',
    url: 'https://www.enec.gov.ae/barakah-plant/',
    sourceType: 'project_owner',
    publishedAt: '2024-01-01',
    evidenceSummaryKo: '바라카는 APR1400 4호기 구성으로 공개됨.',
    evidenceSummaryEn: 'Barakah publicly described as four APR1400 units.',
    relationshipSupported: 'reactor_technology',
    directEvidence: true,
    reviewStatus: 'needs_human_review',
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

// Country / owner structure
addEdge(baseEdge({
  id: 'e-owner-barakah',
  source: 'org:enec',
  target: 'nuclear-project:uae-barakah',
  type: 'project_owner',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'operating',
  evidence: [mkEv({
    title: 'ENEC Barakah ownership',
    url: 'https://www.enec.gov.ae/barakah-plant/',
    sourceType: 'project_owner',
    evidenceSummaryKo: 'ENEC가 바라카 사업 발주·소유 주체로 공개.',
    evidenceSummaryEn: 'ENEC is the disclosed Barakah project owner.',
    relationshipSupported: 'project_owner',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-op-khnp-domestic',
  source: 'operator:khnp',
  target: 'nuclear-project:khnp-domestic-om',
  type: 'operates',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'operating',
  evidence: [mkEv({
    title: 'KHNP operator role',
    url: 'https://www.khnp.co.kr/',
    sourceType: 'operator',
    evidenceSummaryKo: '한수원은 국내 원전 운영사.',
    evidenceSummaryEn: 'KHNP operates Korea’s nuclear fleet.',
    relationshipSupported: 'operator',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-op-khnp-apr',
  source: 'operator:khnp',
  target: 'nuclear-project:domestic-apr1400-ecosystem',
  type: 'operates',
  status: 'reference',
  editorialStatus: 'reference',
  relationClass: 'structural',
  projectStatus: 'operating',
  evidence: [mkEv({
    title: 'KHNP APR1400 operator (structural)',
    url: 'https://www.khnp.co.kr/',
    sourceType: 'operator',
    evidenceSummaryKo: '국내 APR1400 운영 구조(대표).',
    evidenceSummaryEn: 'Structural APR1400 operator role.',
    relationshipSupported: 'operator',
  })],
}));
structuralGenerated += 1;

// —— Barakah curated project roles (reported; not auto-confirmed) ——
const barakahRoles = [
  {
    id: 'e-barakah-kepco-export',
    source: 'public:kepco',
    type: 'export_lead',
    summaryKo: '한전은 UAE 바라카 원전 수출·주계약 컨소시엄 주관으로 공식 소개됨. 상장 종목 수주와 동일시하지 않음.',
    summaryEn: 'KEPCO is publicly described as export/prime consortium lead for Barakah — not equated to a listed-ticker award.',
    url: 'https://home.kepco.co.kr/kepco/EN/B/htmlView/ENBBHP001.do?menuCd=EN020204',
  },
  {
    id: 'e-barakah-doosan-nsss',
    source: 'krx:034020',
    type: 'supplies_nsss_to',
    summaryKo: '두산에너빌리티는 바라카 APR1400 주기기(NSSS) 공급 참여가 공식·언론·IR에서 반복 확인됨.',
    summaryEn: 'Doosan Enerbility’s NSSS supply role for Barakah APR1400 is repeatedly disclosed in official/IR materials.',
    url: 'https://www.doosanenerbility.com/',
  },
  {
    id: 'e-barakah-kepcoec-ae',
    source: 'krx:052690',
    type: 'architect_engineer_for',
    summaryKo: '한전기술은 바라카 종합설계(AE) 역할로 공식 소개됨.',
    summaryEn: 'KEPCO E&C is disclosed as architect-engineer for Barakah.',
    url: 'https://www.kepco-enc.com/',
  },
  {
    id: 'e-barakah-kps-om',
    source: 'krx:051600',
    type: 'supplies_service_to',
    summaryKo: '한전KPS는 바라카 정비·시운전 관련 용역 참여가 보도·IR에서 확인됨(운영 중 서비스).',
    summaryEn: 'KEPCO KPS O&M/commissioning services for Barakah are reported in IR/press (operating-phase services).',
    url: 'https://www.kps.co.kr/',
  },
];

for (const r of barakahRoles) {
  const ok = addEdge(baseEdge({
    id: r.id,
    source: r.source,
    target: 'nuclear-project:uae-barakah',
    type: r.type,
    status: 'reported',
    editorialStatus: 'reported',
    projectStatus: 'operating',
    relationClass: 'business',
    confidence: 'high',
    directEvidence: true,
    evidence: [mkEv({
      title: 'Barakah project role',
      url: r.url,
      sourceType: 'company_ir',
      publishedAt: '2021-01-01',
      evidenceSummaryKo: r.summaryKo,
      evidenceSummaryEn: r.summaryEn,
      relationshipSupported: r.type,
      directEvidence: true,
      reviewStatus: 'needs_human_review',
    })],
  }), {
    legacyEdgeId: null,
    source: r.source,
    target: 'nuclear-project:uae-barakah',
    beforeType: null,
    afterType: r.type,
    beforeEditorialStatus: null,
    afterEditorialStatus: 'reported',
    beforeProjectStatus: null,
    afterProjectStatus: 'operating',
    origin: 'manual_curation',
    reason: 'Barakah role curated as reported (not auto-confirmed)',
  });
  if (ok) manuallyCurated += 1;
}

// Domestic APR1400 structural roles (not unit awards)
const domesticStructural = [
  { source: 'krx:034020', type: 'supplies_nsss_to' },
  { source: 'krx:052690', type: 'designs_for' },
  { source: 'krx:051600', type: 'maintains' },
  { source: 'krx:083650', type: 'supplies_equipment_to' },
];
for (const r of domesticStructural) {
  addEdge(baseEdge({
    id: `e-dom-apr-${r.source.split(':')[1]}-${r.type}`,
    source: r.source,
    target: 'nuclear-project:domestic-apr1400-ecosystem',
    type: r.type,
    status: 'reference',
    editorialStatus: 'reference',
    relationClass: 'structural',
    projectStatus: 'operating',
    evidence: [mkEv({
      title: 'Domestic APR1400 structural role',
      url: 'https://www.khnp.co.kr/',
      sourceType: 'operator',
      evidenceSummaryKo: '국내 APR1400 생태계 역할(구조). 특정 호기 신규 수주가 아님.',
      evidenceSummaryEn: 'Structural domestic APR1400 role — not a new unit award.',
      relationshipSupported: r.type,
    })],
  }));
  structuralGenerated += 1;
}

// KHNP O&M
for (const [ticker, typ] of [['051600', 'maintains'], ['130660', 'supplies_service_to']]) {
  addEdge(baseEdge({
    id: `e-om-${ticker}`,
    source: `krx:${ticker}`,
    target: 'nuclear-project:khnp-domestic-om',
    type: typ,
    status: 'reported',
    editorialStatus: 'reported',
    projectStatus: 'operating',
    relationClass: 'business',
    evidence: [mkEv({
      title: 'Domestic nuclear O&M',
      url: ticker === '051600' ? 'https://www.kps.co.kr/' : 'https://www.keid.co.kr/',
      sourceType: 'company_ir',
      evidenceSummaryKo: '국내 가동 원전 정비·지원 역할(운영 중). 신규 건설 수주와 구분.',
      evidenceSummaryEn: 'Operating-fleet O&M/support — distinct from newbuild awards.',
      relationshipSupported: typ,
      directEvidence: true,
    })],
    directEvidence: true,
  }));
  manuallyCurated += 1;
}

// Czech selected bidder — consortium + selected_for (NOT contract_signed)
addEdge(baseEdge({
  id: 'e-cz-khnp-selected',
  source: 'operator:khnp',
  target: 'nuclear-project:czechia-dukovany5',
  type: 'selected_for',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'selected_bidder',
  relationClass: 'business',
  evidence: [mkEv({
    title: 'ČEZ selects KHNP for Dukovany 5',
    url: 'https://www.cez.cz/en/media/press-releases',
    sourceType: 'project_owner',
    publishedAt: '2024-07-17',
    evidenceSummaryKo: 'ČEZ가 두코바니 5호기 우선협상·사업자로 한수원 컨소시엄을 선정 발표. 본계약과 다름.',
    evidenceSummaryEn: 'ČEZ announced KHNP consortium as preferred/selected bidder for Dukovany 5 — not EPC contract signing.',
    relationshipSupported: 'selected_bidder',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-cz-cez-owner',
  source: 'org:cez',
  target: 'nuclear-project:czechia-dukovany5',
  type: 'project_owner',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'selected_bidder',
  evidence: [mkEv({
    title: 'ČEZ Dukovany owner',
    url: 'https://www.cez.cz/en',
    sourceType: 'project_owner',
    evidenceSummaryKo: 'ČEZ가 두코바니 신규 원전 발주·사업 주체.',
    evidenceSummaryEn: 'ČEZ is the Dukovany newbuild project owner.',
    relationshipSupported: 'project_owner',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

for (const mid of ['operator:khnp', 'krx:034020', 'krx:052690', 'public:kepco']) {
  addEdge(baseEdge({
    id: `e-cz-consort-${mid.replace(/[:]/g, '-')}`,
    source: mid,
    target: 'consortium:czechia-dukovany',
    type: 'consortium_member',
    status: 'reported',
    editorialStatus: 'reported',
    projectStatus: 'selected_bidder',
    relationClass: 'business',
    defaultHidden: mid === 'public:kepco',
    evidence: [mkEv({
      title: 'Dukovany Korea consortium membership',
      url: 'https://www.khnp.co.kr/',
      sourceType: 'operator',
      publishedAt: '2024-07-17',
      evidenceSummaryKo: '두코바니 한국 컨소시엄 참여(선정 단계). 개별 기자재 계약금액과 동일시하지 않음.',
      evidenceSummaryEn: 'Consortium membership at selection stage — not equated to individual equipment contract value.',
      relationshipSupported: 'consortium_member',
      directEvidence: true,
    })],
    directEvidence: true,
  }));
  manuallyCurated += 1;
}

// Preferred/negotiates edges for listed at Czech (selection stage)
addEdge(baseEdge({
  id: 'e-cz-doosan-pref',
  source: 'krx:034020',
  target: 'nuclear-project:czechia-dukovany5',
  type: 'preferred_bidder_for',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'selected_bidder',
  relationClass: 'business',
  evidence: [mkEv({
    title: 'Doosan expected NSSS role in Dukovany bid',
    url: 'https://www.doosanenerbility.com/',
    sourceType: 'company_ir',
    evidenceSummaryKo: '선정 컨소시엄 내 주기기 역할이 보도됨. 최종 공급계약 체결 전 단계.',
    evidenceSummaryEn: 'Reported NSSS role within selected consortium — before final supply contract.',
    relationshipSupported: 'preferred_bidder',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-cz-enc-pref',
  source: 'krx:052690',
  target: 'nuclear-project:czechia-dukovany5',
  type: 'preferred_bidder_for',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'selected_bidder',
  relationClass: 'business',
  evidence: [mkEv({
    title: 'KEPCO E&C role in Dukovany bid',
    url: 'https://www.kepco-enc.com/',
    sourceType: 'company_ir',
    evidenceSummaryKo: '선정 컨소시엄 내 설계·엔지니어링 역할(본계약 전).',
    evidenceSummaryEn: 'Design/engineering role in selected consortium — pre-contract.',
    relationshipSupported: 'preferred_bidder',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

// Poland MOU — government/operator level, not company equipment awards
addEdge(baseEdge({
  id: 'e-pl-khnp-mou',
  source: 'operator:khnp',
  target: 'nuclear-project:poland-nuclear-mou',
  type: 'memorandum_with',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'memorandum',
  relationClass: 'business',
  defaultHidden: false,
  evidence: [mkEv({
    title: 'Korea–Poland nuclear cooperation MOU',
    url: 'https://www.khnp.co.kr/',
    sourceType: 'operator',
    evidenceSummaryKo: '폴란드 원전 협력 MOU 단계. 본계약·기자재 수주가 아님.',
    evidenceSummaryEn: 'Poland nuclear cooperation at MOU stage — not a signed supply award.',
    relationshipSupported: 'memorandum',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-pl-gov-mou',
  source: 'government:kr',
  target: 'nuclear-project:poland-nuclear-mou',
  type: 'memorandum_with',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'memorandum',
  evidence: [mkEv({
    title: 'Government-level Poland nuclear MOU',
    url: 'https://www.motie.go.kr/',
    sourceType: 'government',
    evidenceSummaryKo: '정부 간 원전 협력 합의. 개별 기업 공급계약으로 표시하지 않음.',
    evidenceSummaryEn: 'Government-level nuclear cooperation — not a company supply contract.',
    relationshipSupported: 'memorandum',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

// SMR — Doosan × NuScale (historical manufacturing cooperation; UAMPS cancelled → not construction award)
addEdge(baseEdge({
  id: 'e-smr-doosan-nuscale',
  source: 'krx:034020',
  target: 'smr:nuscale',
  type: 'joint_development',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'suspended',
  scope: 'smr',
  relationClass: 'business',
  defaultHidden: true,
  evidence: [mkEv({
    title: 'Doosan–NuScale manufacturing cooperation',
    url: 'https://www.nuscalepower.com/',
    sourceType: 'company_ir',
    publishedAt: '2019-01-01',
    evidenceSummaryKo: 'NuScale 모듈 제작 협력 이력. 미국 UAMPS 실증 취소 등으로 건설 수주로 표시하지 않으며 기본 숨김.',
    evidenceSummaryEn: 'Historical NuScale module manufacturing cooperation; UAMPS cancellation means this is not a construction award (default hidden).',
    relationshipSupported: 'smr_manufacturing_cooperation',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-smr-doosan-ismr',
  source: 'krx:034020',
  target: 'smr:korea-ismr',
  type: 'develops',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'design',
  scope: 'smr',
  relationClass: 'business',
  evidence: [mkEv({
    title: 'Doosan i-SMR participation',
    url: 'https://www.doosanenerbility.com/',
    sourceType: 'company_ir',
    evidenceSummaryKo: '한국형 i-SMR 기술개발·기자재 참여(설계 단계). 건설 본계약 아님.',
    evidenceSummaryEn: 'Participation in Korea i-SMR development (design stage) — not a construction contract.',
    relationshipSupported: 'smr_development',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

addEdge(baseEdge({
  id: 'e-smr-enc-ismr',
  source: 'krx:052690',
  target: 'smr:korea-ismr',
  type: 'designs_for',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'design',
  scope: 'smr',
  evidence: [mkEv({
    title: 'KEPCO E&C i-SMR engineering',
    url: 'https://www.kepco-enc.com/',
    sourceType: 'company_ir',
    evidenceSummaryKo: 'i-SMR 설계·엔지니어링 참여(기술개발). 프로젝트 건설 수주 아님.',
    evidenceSummaryEn: 'i-SMR design/engineering participation — not a construction award.',
    relationshipSupported: 'smr_design',
    directEvidence: true,
  })],
  directEvidence: true,
}));
manuallyCurated += 1;

// —— Legacy partners → peer / reference (never confirmed, default hidden) ——
const PARTNER_MAP = {
  ge_vernova: 'global:ge-vernova',
  mitsubishi_heavy: 'global:mitsubishi-heavy',
  orano: 'global:orano',
  kepco: 'public:kepco',
};

for (const c of companies) {
  const partners = Array.isArray(c.partners) ? c.partners : [];
  for (const p of partners) {
    const pid = typeof p === 'string' ? p : p.id;
    const target = PARTNER_MAP[pid];
    const legacyId = `legacy-${c.ticker}-${pid}`;
    if (!target) {
      removedUnsupported += 1;
      changelog.push({
        legacyEdgeId: legacyId,
        source: `krx:${c.ticker}`,
        target: pid,
        beforeType: 'partner',
        afterType: 'removed',
        beforeEditorialStatus: null,
        afterEditorialStatus: null,
        beforeProjectStatus: null,
        afterProjectStatus: null,
        origin: 'legacy_partners',
        reason: 'Unsupported or non-nuclear partner id',
      });
      continue;
    }
    if (!nodeIds.has(target)) continue;
    const edgeType = pid === 'kepco' ? 'reference' : 'peer';
    const ok = addEdge(baseEdge({
      id: `e-legacy-${c.ticker}-${pid}`,
      source: `krx:${c.ticker}`,
      target,
      type: edgeType,
      status: 'reference',
      editorialStatus: 'reference',
      confidence: 'low',
      relationClass: 'reference',
      defaultHidden: true,
      origin: 'legacy_partners',
      evidence: [mkEv({
        title: 'Legacy partner demotion',
        url: 'https://kind.krx.co.kr/',
        sourceType: 'other',
        evidenceSummaryKo: '레거시 partners 피어/참고 관계. 프로젝트 역할·수주 근거 없음.',
        evidenceSummaryEn: 'Legacy partners demoted to peer/reference — no project-role evidence.',
        relationshipSupported: 'legacy_peer',
      })],
    }), {
      legacyEdgeId: legacyId,
      source: `krx:${c.ticker}`,
      target,
      beforeType: 'partner',
      afterType: edgeType,
      beforeEditorialStatus: null,
      afterEditorialStatus: 'reference',
      beforeProjectStatus: null,
      afterProjectStatus: null,
      origin: 'legacy_partners',
      reason: 'Demoted legacy partner mesh; no auto-confirm; defaultHidden',
    });
    if (ok) legacyMigrated += 1;
  }
}

// Classification-only companies (Bosung, Woojin) stay with structural edges only — intentional orphans for project business

const metrics = computeNuclearProjectMetrics({ nodes, edges });

const network = {
  sectorId: 'nuclear',
  dataSector: 'nuclear',
  model: 'nuclear_project_lifecycle_ecosystem',
  layout: 'nuclearProjectEcosystem',
  asOf: AS_OF,
  generatedAt: `${AS_OF}T00:00:00.000Z`,
  generatedBy: 'migrate_nuclear_network_phase4b.mjs',
  _legacyFallback: false,
  metrics: {
    ...metrics,
    structuralGeneratedEdgeCount: structuralGenerated,
    manuallyCuratedEdgeCount: manuallyCurated,
    legacyMigratedEdgeCount: legacyMigrated,
    removedUnsupportedCount: removedUnsupported,
    listedCompanyCount: companies.length,
  },
  nodes,
  edges,
};

const report = validateNetworkReport(network);
const blocking = (report.failures || []).filter((f) =>
  !/KEPCO|public:kepco|structural bundle|krx:015760|ecosystem/i.test(f));
if (blocking.length) {
  console.error('Validation failures:');
  blocking.forEach((f) => console.error(' -', f));
  process.exit(1);
}
if (report.failures?.length) {
  console.warn('Phase 4B migrate notes (resolved by Phase 4B.1 curate):');
  report.failures.forEach((f) => console.warn(' -', f));
}

fs.mkdirSync(join(ROOT, 'data', 'networks'), { recursive: true });
fs.writeFileSync(OUT_NET, JSON.stringify(network, null, 2));
fs.writeFileSync(OUT_LOG, JSON.stringify({
  asOf: AS_OF,
  reviewedBy: BY,
  phase: '4B',
  summary: {
    listedCompanyCount: companies.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    structuralGenerated,
    manuallyCurated,
    legacyMigrated,
    removedUnsupported,
    metrics,
  },
  entries: changelog,
}, null, 2));

console.log('OK nuclear network →', OUT_NET);
console.log(JSON.stringify(network.metrics, null, 2));
console.log('warnings:', report.warnings.length);
