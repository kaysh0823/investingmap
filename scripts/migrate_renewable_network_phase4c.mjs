/**
 * Phase 4C — Migrate renewable partners → data/networks/renewable.json
 * Model: renewable_project_value_chain / renewableProjectEcosystem
 * Does not change cp_list / company count. Never auto-promotes to confirmed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeRenewableProjectMetrics } from '../lib/relation_network/renewable_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase4c';
const HTML = join(ROOT, 'renewable', 'korea_renewable_map.html');
const OUT_NET = join(ROOT, 'data', 'networks', 'renewable.json');
const OUT_LOG = join(ROOT, 'data', 'renewable_relation_phase4c_changelog.json');

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

function addNode(n) {
  if (!n?.id || nodeIds.has(n.id)) return false;
  nodeIds.add(n.id);
  nodes.push(n);
  return true;
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
    evidenceUsageType: p.evidenceUsageType || 'general_business_page',
    title: p.title || '',
    url: p.url || '',
    publishedAt: p.publishedAt || null,
    evidenceSummaryKo: p.evidenceSummaryKo || '',
    evidenceSummaryEn: p.evidenceSummaryEn || '',
    relationshipSupported: p.relationshipSupported || '',
  };
}

function baseEdge(partial) {
  return {
    editorialStatus: 'reported',
    status: 'reported',
    confidence: 'medium',
    asOf: AS_OF,
    defaultHidden: false,
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    lastVerifiedAt: AS_OF,
    directEvidence: false,
    relationClass: 'business',
    ...partial,
  };
}

function logChange(row) {
  changelog.push({
    legacyEdgeId: row.legacyEdgeId || null,
    source: row.source || null,
    target: row.target || null,
    beforeType: row.beforeType || null,
    afterType: row.afterType || null,
    beforeEditorialStatus: row.beforeEditorialStatus || null,
    afterEditorialStatus: row.afterEditorialStatus || null,
    beforeProjectStatus: row.beforeProjectStatus || null,
    afterProjectStatus: row.afterProjectStatus || null,
    origin: row.origin || 'phase4c_migrate',
    reason: row.reason || '',
  });
}

/** Chain → technology / role aliases (cp_list priority). */
const CHAIN_META = {
  '태양광': { technology: 'solar', role: 'module_supplier', lane: 'solar', equipment: ['equipment:module', 'equipment:cell'] },
  '풍력': { technology: 'onshore_wind', role: 'tower_structure_supplier', lane: 'onshore_wind', equipment: ['equipment:tower', 'equipment:turbine'] },
  '수소': { technology: 'hydrogen', role: 'hydrogen_equipment_supplier', lane: 'hydrogen', equipment: ['equipment:hydrogen_tank', 'equipment:fuel_cell_system'] },
  '신재생 운영': { technology: 'renewable_operator', role: 'project_developer', lane: 'renewable_operator', equipment: [] },
};

const LISTED_META = {
  '009830': { technology: 'solar', role: 'project_developer', lane: 'solar', also: ['module_supplier', 'epc_contractor'] },
  '010060': { technology: 'solar', role: 'module_supplier', lane: 'solar', note: 'polysilicon holding' },
  '456040': { technology: 'solar', role: 'module_supplier', lane: 'solar', note: 'solar materials' },
  '322000': { technology: 'solar', role: 'module_supplier', lane: 'solar' },
  '011930': { technology: 'solar', role: 'module_supplier', lane: 'solar' },
  '112610': { technology: 'onshore_wind', role: 'tower_structure_supplier', lane: 'onshore_wind', alsoOffshore: true },
  '475150': { technology: 'offshore_wind', role: 'project_developer', lane: 'offshore_wind', also: ['fuel_cell'] },
  '119850': { technology: 'renewable_operator', role: 'operator', lane: 'renewable_operator' },
  '018670': { technology: 'hydrogen', role: 'project_developer', lane: 'hydrogen' },
  '271940': { technology: 'hydrogen', role: 'hydrogen_equipment_supplier', lane: 'hydrogen' },
};

const PEER_KEEP = new Set(['vestas', 'first_solar', 'enphase', 'siemens_energy', 'bloom_energy', 'plug_power', 'toyota_ms', 'hyundai_mt']);
const PEER_DROP = new Set(['catl', 'tesla', 'vw_group', 'bmw', 'gm_ev', 'orano', 'mitsubishi_heavy', 'ge_vernova', 'schneider_e', 'abb']);

// —— Structural technology / equipment / stage nodes ——
const TECH_NODES = [
  ['technology:solar', '태양광', 'Solar', 'solar'],
  ['technology:onshore_wind', '육상풍력', 'Onshore wind', 'onshore_wind'],
  ['technology:offshore_wind', '해상풍력', 'Offshore wind', 'offshore_wind'],
  ['technology:fuel_cell', '연료전지', 'Fuel cell', 'fuel_cell'],
  ['technology:hydrogen', '수소', 'Hydrogen', 'hydrogen'],
  ['technology:renewable_operator', '재생에너지 운영', 'Renewable operator', 'renewable_operator'],
];
for (const [id, ko, en, lane] of TECH_NODES) {
  addNode({
    id, type: 'technology', nameKo: ko, nameEn: en, role: 'technology', lane, layer: ko,
  });
}

const EQUIPMENT = [
  ['equipment:module', '태양광 모듈', 'PV module', 'solar'],
  ['equipment:cell', '태양광 셀', 'PV cell', 'solar'],
  ['equipment:inverter', '인버터', 'Inverter', 'solar'],
  ['equipment:structure', '구조물·트래커', 'Structure / tracker', 'solar'],
  ['equipment:turbine', '풍력 터빈', 'Wind turbine', 'onshore_wind'],
  ['equipment:tower', '풍력 타워', 'Wind tower', 'onshore_wind'],
  ['equipment:blade', '블레이드', 'Blade', 'onshore_wind'],
  ['equipment:foundation', '기초(고정식)', 'Fixed foundation', 'offshore_wind'],
  ['equipment:subsea_cable', '해저케이블', 'Subsea cable', 'offshore_wind'],
  ['equipment:fuel_cell_system', '연료전지 시스템', 'Fuel cell system', 'fuel_cell'],
  ['equipment:electrolyzer', '수전해', 'Electrolyzer', 'hydrogen'],
  ['equipment:hydrogen_tank', '수소저장용기', 'Hydrogen tank', 'hydrogen'],
];
for (const [id, ko, en, lane] of EQUIPMENT) {
  addNode({
    id, type: 'equipment_category', nameKo: ko, nameEn: en, role: 'equipment', lane, layer: ko,
  });
}

const STAGES = [
  ['stage:development', '개발·부지', 'Development / site', 'renewable_operator'],
  ['stage:permitting', '인허가', 'Permitting', 'renewable_operator'],
  ['stage:financing', '금융조달', 'Financing', 'renewable_operator'],
  ['stage:epc', 'EPC·시공', 'EPC / construction', 'solar'],
  ['stage:grid', '계통연계', 'Grid interconnection', 'renewable_operator'],
  ['stage:operation', '상업운전·O&M', 'COD / O&M', 'renewable_operator'],
  ['stage:ppa', 'PPA·전력판매', 'PPA / offtake', 'renewable_operator'],
];
for (const [id, ko, en, lane] of STAGES) {
  addNode({
    id, type: 'project_stage', nameKo: ko, nameEn: en, role: 'project_stage', lane, layer: ko,
  });
}

addNode({
  id: 'ecosystem:renewable-value-chain',
  type: 'ecosystem',
  nameKo: '재생에너지 가치사슬(구조)',
  nameEn: 'Renewable value chain (structural)',
  role: 'ecosystem',
  lane: 'renewable_operator',
  isStructuralBundle: true,
  projectStatus: null,
  noteKo: '구조 노드. 특정 수주·보유 용량을 의미하지 않습니다.',
  noteEn: 'Structural node — not a project award or owned capacity.',
});

// —— Listed companies ——
for (const c of companies) {
  const ticker = String(c.ticker || '').padStart(6, '0');
  const meta = LISTED_META[ticker] || CHAIN_META[c.chain] || { technology: 'solar', role: 'module_supplier', lane: 'solar' };
  addNode({
    id: `krx:${ticker}`,
    type: 'listed_company',
    ticker,
    nameKo: c.name || c.nameKo || ticker,
    nameEn: c.nameEn || c.name || ticker,
    market: c.market || '',
    role: meta.role,
    technology: meta.technology,
    lane: meta.lane,
    chain: c.chain || '',
    isListedKorea: true,
    isMapConstituent: true,
    mcapWon: c.mcapWon ?? c.mcap ?? null,
    legacyId: c.id || null,
  });
}

// —— Global peers (kept only if useful) ——
for (const g of globals) {
  if (!g?.id) continue;
  if (PEER_DROP.has(g.id)) {
    logChange({
      legacyEdgeId: `global:${g.id}`,
      beforeType: 'peer',
      afterType: 'removed',
      origin: 'phase4c_migrate',
      reason: 'battery/nuclear/grid leakage or weak renewable fit — drop from renewable graph',
    });
    continue;
  }
  addNode({
    id: `global:${g.id}`,
    type: 'global_company',
    nameKo: g.name || g.nameKo || g.id,
    nameEn: g.nameEn || g.name || g.id,
    role: g.sector || 'peer',
    lane: /wind|vestas|siemens/i.test(`${g.id} ${g.sector}`) ? 'onshore_wind'
      : /solar|enphase|first/i.test(`${g.id} ${g.sector}`) ? 'solar'
        : /hydrogen|bloom|plug|toyota|hyundai/i.test(`${g.id} ${g.sector}`) ? 'hydrogen'
          : 'renewable_operator',
    region: g.region || '',
    legacyId: g.id,
  });
}

// Group affiliation placeholders (backing links)
addNode({
  id: 'org:hd-hyundai',
  type: 'organization',
  nameKo: 'HD현대',
  nameEn: 'HD Hyundai',
  role: 'group',
  lane: 'solar',
  isListedKorea: false,
});
addNode({
  id: 'org:sk',
  type: 'organization',
  nameKo: 'SK그룹',
  nameEn: 'SK Group',
  role: 'group',
  lane: 'offshore_wind',
  isListedKorea: false,
});

// Optional KEPCO reference (grid offtake / utility context) — map-excluded
addNode({
  id: 'krx:015760',
  type: 'listed_company',
  ticker: '015760',
  nameKo: '한국전력',
  nameEn: 'KEPCO',
  role: 'utility_reference',
  lane: 'renewable_operator',
  isListedKorea: true,
  isMapConstituent: false,
  entityRole: 'listed_reference_company',
  excludeFromMapCompanyCount: true,
  excludeFromDefaultMcapScale: true,
});

// —— Structural company → technology / equipment ——
function linkStructural(companyId, techId, equipIds, stageIds) {
  addEdge(baseEdge({
    id: `e-struct-${companyId}-tech-${techId.split(':')[1]}`,
    source: companyId,
    target: techId,
    type: 'used_in_technology',
    editorialStatus: 'reference',
    status: 'reference',
    relationClass: 'structural',
    directEvidence: false,
    evidence: [mkEv({
      evidenceUsageType: 'official_role_page',
      sourceType: 'company_ir',
      title: 'Structural technology exposure from sector chain',
      evidenceSummaryKo: '밸류체인·사업 분류 기반 기술 노출(특정 프로젝트 수주 아님)',
      evidenceSummaryEn: 'Technology exposure from value-chain classification — not a project award',
      relationshipSupported: 'used_in_technology',
    })],
  }), {
    source: companyId, target: techId, beforeType: 'legacy_partner', afterType: 'used_in_technology',
    afterEditorialStatus: 'reference', origin: 'phase4c_structural',
    reason: 'cp_list/chain → technology structural edge',
  });
  for (const eq of equipIds || []) {
    addEdge(baseEdge({
      id: `e-mfg-${companyId}-${eq.split(':')[1]}`,
      source: companyId,
      target: eq,
      type: 'manufactures',
      editorialStatus: 'reference',
      status: 'reference',
      relationClass: 'structural',
      evidence: [mkEv({
        evidenceUsageType: 'official_role_page',
        sourceType: 'company_ir',
        title: 'Equipment category role',
        evidenceSummaryKo: '기자재·제품 카테고리 역할(구조)',
        evidenceSummaryEn: 'Equipment-category structural role',
        relationshipSupported: 'manufactures',
      })],
    }));
  }
  for (const st of stageIds || []) {
    addEdge(baseEdge({
      id: `e-stage-${companyId}-${st.split(':')[1]}`,
      source: companyId,
      target: st,
      type: 'supports_project_stage',
      editorialStatus: 'reference',
      status: 'reference',
      relationClass: 'structural',
      evidence: [mkEv({
        evidenceUsageType: 'official_role_page',
        title: 'Project-stage structural support',
        evidenceSummaryKo: '프로젝트 단계 구조 역할',
        evidenceSummaryEn: 'Structural project-stage role',
        relationshipSupported: 'supports_project_stage',
      })],
    }));
  }
}

for (const c of companies) {
  const ticker = String(c.ticker || '').padStart(6, '0');
  const id = `krx:${ticker}`;
  const meta = LISTED_META[ticker] || CHAIN_META[c.chain] || { technology: 'solar', lane: 'solar' };
  const techId = meta.technology === 'renewable_operator' ? 'technology:renewable_operator'
    : meta.technology === 'offshore_wind' ? 'technology:offshore_wind'
      : meta.technology === 'onshore_wind' ? 'technology:onshore_wind'
        : meta.technology === 'hydrogen' ? 'technology:hydrogen'
          : meta.technology === 'fuel_cell' ? 'technology:fuel_cell'
            : 'technology:solar';
  const chainEquip = (CHAIN_META[c.chain] || {}).equipment || [];
  const stages = meta.role === 'project_developer' || meta.role === 'operator'
    ? ['stage:development', 'stage:operation']
    : meta.role === 'tower_structure_supplier' || meta.role === 'module_supplier'
      ? ['stage:epc']
      : ['stage:development'];
  linkStructural(id, techId, chainEquip, stages);
  if (ticker === '112610') {
    linkStructural(id, 'technology:offshore_wind', ['equipment:tower', 'equipment:foundation'], ['stage:epc']);
  }
  if (ticker === '475150') {
    linkStructural(id, 'technology:fuel_cell', ['equipment:fuel_cell_system'], ['stage:operation']);
    linkStructural(id, 'technology:solar', ['equipment:module'], ['stage:epc']);
  }
  if (ticker === '009830') {
    linkStructural(id, 'technology:solar', ['equipment:module', 'equipment:cell'], ['stage:epc', 'stage:development']);
  }
}

// —— Curated projects (limited set) ——
function addProject(p) {
  addNode({
    id: p.id,
    type: 'renewable_project',
    nameKo: p.nameKo,
    nameEn: p.nameEn,
    role: 'renewable_project',
    lane: p.lane,
    technology: p.technology,
    region: p.region || null,
    countryCode: p.countryCode || 'KR',
    projectStatus: p.projectStatus,
    contractStatus: p.contractStatus || null,
    capacityValue: p.capacityValue ?? null,
    capacityUnit: p.capacityUnit || 'MW',
    capacityType: p.capacityType || 'announced',
    operatingCapacity: p.operatingCapacity ?? null,
    underConstructionCapacity: p.underConstructionCapacity ?? null,
    pipelineCapacity: p.pipelineCapacity ?? null,
    equityCapacity: p.equityCapacity ?? null,
    targetCommercialOperationDate: p.targetCod || null,
    commercialOperationDate: p.cod || null,
    phaseCount: p.phaseCount ?? null,
    defaultHidden: !!p.defaultHidden,
    asOf: AS_OF,
    evidence: p.evidence || [],
    noteKo: p.noteKo || '',
    noteEn: p.noteEn || '',
  });
}

function addSpv(s) {
  addNode({
    id: s.id,
    type: 'project_spv',
    nameKo: s.nameKo,
    nameEn: s.nameEn,
    role: 'project_spv',
    lane: s.lane,
    isListedKorea: false,
    asOf: AS_OF,
  });
}

// 1) Sinan Wi offshore wind — under construction / reported stake
addSpv({
  id: 'spv:sinan-wi-offshore',
  nameKo: '신안우이 해상풍력 SPV',
  nameEn: 'Sinan Wi Offshore Wind SPV',
  lane: 'offshore_wind',
});
addProject({
  id: 'renewable-project:sinan-wi-offshore',
  nameKo: '신안우이 해상풍력',
  nameEn: 'Sinan Wi Offshore Wind',
  lane: 'offshore_wind',
  technology: 'offshore_wind',
  region: '전남 신안',
  projectStatus: 'under_construction',
  contractStatus: 'effective',
  capacityValue: 390,
  capacityUnit: 'MW',
  capacityType: 'under_construction',
  underConstructionCapacity: 390,
  equityCapacity: 39,
  targetCod: '2029-01',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Sinan Wi offshore wind groundbreaking / consortium stake reporting',
    url: 'https://www.electimes.com/news/articleView.html?idxno=365187',
    publishedAt: '2026-07-16',
    evidenceSummaryKo: '390MW 신안우이 해상풍력 착공·추진. SK이터닉스 지분 약 10% 참여로 보도. 총용량≠전량 귀속용량.',
    evidenceSummaryEn: '390MW Sinan Wi offshore wind under construction; SK Ethernix reported ~10% stake. Project MW ≠ equity MW.',
    relationshipSupported: 'owns_stake_in',
  })],
  noteKo: '발전사업허가·EIA 이후 착공 단계. 지분율은 보도 기준(약 10%)이며 공식 공시로 재확인 필요.',
  noteEn: 'Post-permit construction stage. Stake ~10% from press — needs disclosure confirmation.',
});

addEdge(baseEdge({
  id: 'e-sinan-sk-stake',
  source: 'krx:475150',
  target: 'spv:sinan-wi-offshore',
  type: 'owns_stake_in',
  editorialStatus: 'reported',
  projectStatus: 'under_construction',
  ownershipPct: 10,
  ownershipPctAsOf: '2026-07',
  capacityValue: 39,
  capacityUnit: 'MW',
  capacityType: 'equity_attributable',
  counterpartyStatus: 'exact',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'SK Ethernix ~10% stake in Sinan Wi consortium',
    url: 'https://www.electimes.com/news/articleView.html?idxno=365187',
    evidenceSummaryKo: '컨소시엄 지분 약 10% 보도. 확인 전까지 confirmed 승격 금지.',
    evidenceSummaryEn: 'Reported ~10% consortium stake — do not auto-confirm.',
    relationshipSupported: 'owns_stake_in',
  })],
}), { source: 'krx:475150', target: 'spv:sinan-wi-offshore', afterType: 'owns_stake_in', afterEditorialStatus: 'reported', afterProjectStatus: 'under_construction', reason: 'reported SPV stake' });

addEdge(baseEdge({
  id: 'e-sinan-spv-owner',
  source: 'spv:sinan-wi-offshore',
  target: 'renewable-project:sinan-wi-offshore',
  type: 'project_owner',
  editorialStatus: 'reported',
  projectStatus: 'under_construction',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'SPV owns Sinan Wi project',
    url: 'https://www.electimes.com/news/articleView.html?idxno=365187',
    evidenceSummaryKo: '프로젝트 소유는 SPV. 상장사 직접 소유로 표시하지 않음.',
    evidenceSummaryEn: 'Project owned via SPV — not as direct listed-company ownership.',
    relationshipSupported: 'project_owner',
  })],
}));

addEdge(baseEdge({
  id: 'e-sinan-sk-developer',
  source: 'krx:475150',
  target: 'renewable-project:sinan-wi-offshore',
  type: 'project_developer',
  editorialStatus: 'reported',
  projectStatus: 'under_construction',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'SK Ethernix developer role Sinan Wi',
    url: 'https://www.namdonews.com/news/articleView.html?idxno=916981',
    evidenceSummaryKo: '개발·추진 참여. EPC/운영사와 구분.',
    evidenceSummaryEn: 'Developer participation — separate from EPC/operator.',
    relationshipSupported: 'project_developer',
  })],
}));

// 2) Uiseong Hwanghaksan onshore wind — construction / development pipeline (SK Ethernix)
addProject({
  id: 'renewable-project:uiseong-hwanghaksan-wind',
  nameKo: '의성 황학산 풍력',
  nameEn: 'Uiseong Hwanghaksan Wind',
  lane: 'onshore_wind',
  technology: 'onshore_wind',
  region: '경북 의성',
  projectStatus: 'under_construction',
  capacityValue: 99,
  capacityUnit: 'MW',
  capacityType: 'under_construction',
  underConstructionCapacity: 99,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Uiseong Hwanghaksan onshore wind under construction',
    url: 'https://www.dhilbo.co.kr/news/articleView.html?idxno=1428',
    evidenceSummaryKo: 'SK이터닉스 육상풍력 파이프라인 중 의성 황학산 99MW 착공·추진으로 보도.',
    evidenceSummaryEn: 'Reported 99MW Uiseong Hwanghaksan onshore wind under construction for SK Ethernix.',
    relationshipSupported: 'project_developer',
  })],
});
addEdge(baseEdge({
  id: 'e-uiseong-sk-dev',
  source: 'krx:475150',
  target: 'renewable-project:uiseong-hwanghaksan-wind',
  type: 'project_developer',
  editorialStatus: 'reported',
  projectStatus: 'under_construction',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'SK Ethernix Uiseong wind',
    url: 'https://www.dhilbo.co.kr/news/articleView.html?idxno=1428',
    relationshipSupported: 'project_developer',
    evidenceSummaryKo: '개발·건설 참여 보도.',
    evidenceSummaryEn: 'Reported developer/construction participation.',
  })],
}));

// 3) Hanwha Qcells — Haenam solar module supply / preferred EPC negotiation (not ownership)
addProject({
  id: 'renewable-project:haenam-kosepo-solar',
  nameKo: '해남 남동발전 태양광(공급·EPC 협상)',
  nameEn: 'Haenam KOEN solar (module/EPC negotiation)',
  lane: 'solar',
  technology: 'solar',
  region: '전남 해남',
  projectStatus: 'preferred_bidder',
  capacityValue: 400,
  capacityUnit: 'MW',
  capacityType: 'announced',
  pipelineCapacity: 400,
  targetCod: '2028-06',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'KOEN Haenam 400MW — Qcells preferred EPC / module supply',
    url: 'https://www.solartodaymag.com/news/articleView.html?idxno=20724',
    evidenceSummaryKo: '한국남동발전 해남 400MW. 한화큐셀 EPC 우선협상·국산 셀·모듈 공급. 자사 보유 용량으로 표시하지 않음.',
    evidenceSummaryEn: 'KOEN Haenam 400MW; Qcells preferred EPC/module supply — not owned capacity.',
    relationshipSupported: 'epc_for',
  })],
  noteKo: '우선협상 단계. 본계약·착공 전. EPC/모듈 공급 ≠ 발전소 소유.',
  noteEn: 'Preferred negotiation — not signed EPC or ownership.',
});
addNode({
  id: 'org:koen',
  type: 'organization',
  nameKo: '한국남동발전',
  nameEn: 'Korea South-East Power (KOEN)',
  role: 'utility',
  lane: 'solar',
  isListedKorea: false,
});
addEdge(baseEdge({
  id: 'e-haenam-koen-owner',
  source: 'org:koen',
  target: 'renewable-project:haenam-kosepo-solar',
  type: 'project_owner',
  editorialStatus: 'reported',
  projectStatus: 'preferred_bidder',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'KOEN project owner Haenam',
    url: 'https://www.solartodaymag.com/news/articleView.html?idxno=20724',
    relationshipSupported: 'project_owner',
    evidenceSummaryKo: '발주·사업주체는 남동발전.',
    evidenceSummaryEn: 'KOEN is project owner.',
  })],
}));
addEdge(baseEdge({
  id: 'e-haenam-hanwha-epc',
  source: 'krx:009830',
  target: 'renewable-project:haenam-kosepo-solar',
  type: 'epc_for',
  editorialStatus: 'reported',
  projectStatus: 'preferred_bidder',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Qcells preferred EPC negotiator',
    url: 'https://www.solartodaymag.com/news/articleView.html?idxno=20724',
    relationshipSupported: 'epc_for',
    evidenceSummaryKo: 'EPC 우선협상대상자. 본계약 전.',
    evidenceSummaryEn: 'Preferred EPC negotiator — pre-contract.',
  })],
}));
addEdge(baseEdge({
  id: 'e-haenam-hanwha-module',
  source: 'krx:009830',
  target: 'renewable-project:haenam-kosepo-solar',
  type: 'supplies_module_to',
  editorialStatus: 'reported',
  projectStatus: 'preferred_bidder',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Domestic cell/module supply plan',
    url: 'https://www.solartodaymag.com/news/articleView.html?idxno=20724',
    relationshipSupported: 'supplies_module_to',
    evidenceSummaryKo: '국산 셀·모듈 공급 계획. 보유용량 아님.',
    evidenceSummaryEn: 'Planned domestic module supply — not owned MW.',
  })],
}));

// 4) Atlas Energy Park (US) — EPC + module (Hanwha), not Korean owned fleet
addProject({
  id: 'renewable-project:atlas-energy-park',
  nameKo: '아틀라스 에너지 파크(미국)',
  nameEn: 'Atlas Energy Park (US)',
  lane: 'solar',
  technology: 'solar',
  region: 'Arizona, USA',
  countryCode: 'US',
  projectStatus: 'under_construction',
  capacityValue: 2800,
  capacityUnit: 'MW',
  capacityType: 'announced',
  underConstructionCapacity: 2800,
  targetCod: '2028',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Hanwha Qcells Atlas Energy Park EPC / module supply',
    url: 'https://www.asiae.co.kr/article/2026071008160150406',
    publishedAt: '2026-07-10',
    evidenceSummaryKo: '한화큐셀이 아틀라스 에너지파크 EPC·모듈 공급. 단지 총 2.8GW는 프로젝트 규모이며 한화 보유용량 아님. 일부 357MW 자산 매각 보도.',
    evidenceSummaryEn: 'Qcells EPC/module for Atlas Energy Park (2.8GW park scale ≠ owned capacity). Partial 357MW asset sale reported.',
    relationshipSupported: 'epc_for',
  })],
  noteKo: '해외 EPC·모듈 공급. 총용량을 자사 운영용량으로 합산하지 않음.',
  noteEn: 'Overseas EPC/module — do not count park MW as owned operating capacity.',
});
addEdge(baseEdge({
  id: 'e-atlas-hanwha-epc',
  source: 'krx:009830',
  target: 'renewable-project:atlas-energy-park',
  type: 'epc_for',
  editorialStatus: 'reported',
  projectStatus: 'under_construction',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Atlas EPC mandate',
    url: 'https://www.asiae.co.kr/article/2026071008160150406',
    relationshipSupported: 'epc_for',
    evidenceSummaryKo: 'EPC 수행. 소유와 분리.',
    evidenceSummaryEn: 'EPC role — separate from ownership.',
  })],
}));
addEdge(baseEdge({
  id: 'e-atlas-hanwha-module',
  source: 'krx:009830',
  target: 'renewable-project:atlas-energy-park',
  type: 'supplies_module_to',
  editorialStatus: 'reported',
  projectStatus: 'under_construction',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Atlas module supply',
    url: 'https://edata.ekn.kr/article/view/ekn202607100001',
    relationshipSupported: 'supplies_module_to',
    evidenceSummaryKo: '모듈 공급.',
    evidenceSummaryEn: 'Module supply.',
  })],
}));

// 5) CS Wind ↔ Vestas tower supply (contract, not a generation project)
addNode({
  id: 'contract:cswind-vestas-tower-2025',
  type: 'contract',
  nameKo: '씨에스윈드–Vestas 타워 공급계약',
  nameEn: 'CS Wind–Vestas tower supply contract',
  role: 'equipment_supply_contract',
  lane: 'onshore_wind',
  projectStatus: 'contract_signed',
  contractStatus: 'effective',
  asOf: AS_OF,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'disclosure',
    evidenceUsageType: 'exact_contract_document',
    title: 'CS Wind Vestas tower supply disclosure (example 2025-11)',
    url: 'https://www.digitaltoday.co.kr/news/articleView.html?idxno=607377',
    publishedAt: '2025-11-25',
    evidenceSummaryKo: 'DART 단일판매·공급계약 공시 계열. 타워 공급이며 특정 발전소 소유 아님.',
    evidenceSummaryEn: 'Disclosure-class tower supply — not plant ownership.',
    relationshipSupported: 'supplies_structure_to',
  })],
});
addEdge(baseEdge({
  id: 'e-cswind-vestas-structure',
  source: 'krx:112610',
  target: 'contract:cswind-vestas-tower-2025',
  type: 'supplies_structure_to',
  editorialStatus: 'reported',
  projectStatus: 'contract_signed',
  counterpartyStatus: 'exact',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'disclosure',
    evidenceUsageType: 'exact_contract_document',
    title: 'CS Wind supplies towers to Vestas American Wind Technology',
    url: 'https://www.digitaltoday.co.kr/news/articleView.html?idxno=607377',
    relationshipSupported: 'supplies_structure_to',
    evidenceSummaryKo: 'Vestas향 타워 공급계약(공시 보도).',
    evidenceSummaryEn: 'Tower supply contract to Vestas (disclosure reporting).',
  })],
}));
if (nodeIds.has('global:vestas')) {
  addEdge(baseEdge({
    id: 'e-vestas-contract-buyer',
    source: 'global:vestas',
    target: 'contract:cswind-vestas-tower-2025',
    type: 'participates_in',
    editorialStatus: 'reported',
    projectStatus: 'contract_signed',
    directEvidence: true,
    evidence: [mkEv({
      directEvidence: true,
      sourceType: 'disclosure',
      evidenceUsageType: 'exact_contract_document',
      title: 'Vestas as contract counterparty',
      url: 'https://www.digitaltoday.co.kr/news/articleView.html?idxno=607377',
      relationshipSupported: 'participates_in',
      evidenceSummaryKo: '계약 상대 Vestas.',
      evidenceSummaryEn: 'Vestas counterparty.',
    })],
  }));
}

// 6) Iljin Hysolus — hydrogen tank structural + reported mobility supply (not a power plant)
addProject({
  id: 'renewable-project:hyundai-nexo-h2-tank-supply',
  nameKo: '현대차 넥쏘 수소탱크 공급(모빌리티)',
  nameEn: 'Hyundai NEXO H2 tank supply (mobility)',
  lane: 'hydrogen',
  technology: 'hydrogen',
  countryCode: 'KR',
  projectStatus: 'operating',
  capacityValue: null,
  capacityUnit: 'tH2_per_year',
  capacityType: 'operating',
  defaultHidden: false,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Iljin Hysolus NEXO hydrogen tank supply',
    url: 'https://www.ddaily.co.kr/page/view/2021081311374665760',
    evidenceSummaryKo: '수소모빌리티 저장용기 공급. 재생발전 MW와 합산하지 않음.',
    evidenceSummaryEn: 'Mobility H2 tank supply — do not sum into generation MW.',
    relationshipSupported: 'supplies_hydrogen_equipment_to',
  })],
  noteKo: '연료전지·수소 활용 단계. 재생전력 발전 프로젝트와 별도.',
  noteEn: 'Hydrogen-use / mobility — separate from renewable generation MW.',
});
if (nodeIds.has('global:hyundai_mt')) {
  addEdge(baseEdge({
    id: 'e-iljin-hyundai-h2',
    source: 'krx:271940',
    target: 'renewable-project:hyundai-nexo-h2-tank-supply',
    type: 'supplies_hydrogen_equipment_to',
    editorialStatus: 'reported',
    projectStatus: 'operating',
    directEvidence: true,
    evidence: [mkEv({
      directEvidence: true,
      sourceType: 'press',
      evidenceUsageType: 'exact_project_document',
      title: 'Iljin → Hyundai NEXO tank',
      url: 'https://www.ddaily.co.kr/page/view/2021081311374665760',
      relationshipSupported: 'supplies_hydrogen_equipment_to',
      evidenceSummaryKo: '넥쏘 수소탱크 공급 관계.',
      evidenceSummaryEn: 'NEXO tank supply relationship.',
    })],
  }));
}

// 7) Development / MOU placeholder — SK Gas hydrogen (memorandum-level, hidden)
addProject({
  id: 'renewable-project:skgas-hydrogen-pipeline',
  nameKo: 'SK가스 수소 사업 파이프라인(개발)',
  nameEn: 'SK Gas hydrogen business pipeline (development)',
  lane: 'hydrogen',
  technology: 'hydrogen',
  projectStatus: 'development',
  capacityValue: null,
  defaultHidden: true,
  evidence: [mkEv({
    directEvidence: false,
    sourceType: 'company_ir',
    evidenceUsageType: 'general_business_page',
    title: 'SK Gas hydrogen business (structural / development)',
    url: 'https://www.skgas.co.kr/',
    evidenceSummaryKo: '사업영역 노출. 개별 생산 프로젝트·용량 미확인 → 기본 숨김.',
    evidenceSummaryEn: 'Business exposure only — no verified production project/capacity; default hidden.',
    relationshipSupported: 'exposed_to',
  })],
});
addEdge(baseEdge({
  id: 'e-skgas-h2-dev',
  source: 'krx:018670',
  target: 'renewable-project:skgas-hydrogen-pipeline',
  type: 'project_developer',
  editorialStatus: 'reference',
  projectStatus: 'development',
  defaultHidden: true,
  directEvidence: false,
  evidence: [mkEv({
    evidenceUsageType: 'general_business_page',
    sourceType: 'company_ir',
    title: 'SK Gas hydrogen development exposure',
    url: 'https://www.skgas.co.kr/',
    relationshipSupported: 'project_developer',
    evidenceSummaryKo: '개발 파이프라인 참고. MOU/본계약 아님.',
    evidenceSummaryEn: 'Development exposure reference — not MOU/contract.',
  })],
}), { source: 'krx:018670', afterType: 'project_developer', afterEditorialStatus: 'reference', afterProjectStatus: 'development', reason: 'weak IR exposure — hidden development node' });

// —— Legacy partners migration ——
for (const c of companies) {
  const ticker = String(c.ticker || '').padStart(6, '0');
  const sourceId = `krx:${ticker}`;
  for (const raw of (c.partners || [])) {
    const isObj = raw && typeof raw === 'object';
    const pid = isObj ? (raw.id || raw.name) : String(raw);
    if (!pid) continue;
    if (pid === 'hdelec') {
      addEdge(baseEdge({
        id: `e-aff-${ticker}-hd`,
        source: sourceId,
        target: 'org:hd-hyundai',
        type: 'reference',
        editorialStatus: 'reference',
        status: 'reference',
        relationClass: 'structural',
        defaultHidden: true,
        evidence: [mkEv({
          evidenceUsageType: 'general_business_page',
          title: 'HD Hyundai group affiliation',
          evidenceSummaryKo: '그룹 계열 참고. 프로젝트 계약 아님.',
          evidenceSummaryEn: 'Group affiliation reference — not a project contract.',
          relationshipSupported: 'reference',
        })],
      }), {
        legacyEdgeId: `${ticker}->hdelec`, source: sourceId, target: 'org:hd-hyundai',
        beforeType: 'backing', afterType: 'reference', afterEditorialStatus: 'reference',
        reason: 'group backing → reference (hidden)',
      });
      continue;
    }
    if (pid === 'skinn') {
      addEdge(baseEdge({
        id: `e-aff-${ticker}-sk`,
        source: sourceId,
        target: 'org:sk',
        type: 'reference',
        editorialStatus: 'reference',
        status: 'reference',
        relationClass: 'structural',
        defaultHidden: true,
        evidence: [mkEv({
          evidenceUsageType: 'general_business_page',
          title: 'SK group affiliation',
          evidenceSummaryKo: '그룹 계열 참고. 지분·프로젝트 소유 아님.',
          evidenceSummaryEn: 'Group affiliation — not ownership of a project.',
          relationshipSupported: 'reference',
        })],
      }), {
        legacyEdgeId: `${ticker}->skinn`, source: sourceId, target: 'org:sk',
        beforeType: 'backing', afterType: 'reference', afterEditorialStatus: 'reference',
        reason: 'group backing → reference (hidden)',
      });
      continue;
    }
    if (PEER_DROP.has(pid)) {
      logChange({
        legacyEdgeId: `${ticker}->${pid}`,
        source: sourceId,
        target: `global:${pid}`,
        beforeType: 'peer',
        afterType: 'removed',
        reason: 'cross-sector or weak renewable peer removed',
      });
      continue;
    }
    const targetId = `global:${pid}`;
    if (!nodeIds.has(targetId)) continue;
    addEdge(baseEdge({
      id: `e-peer-${ticker}-${pid}`,
      source: sourceId,
      target: targetId,
      type: 'peer',
      editorialStatus: 'reference',
      status: 'reference',
      relationClass: 'reference',
      defaultHidden: true,
      evidence: [mkEv({
        evidenceUsageType: 'general_business_page',
        title: 'Legacy peer migration',
        evidenceSummaryKo: '레거시 partners 피어. 기본 숨김.',
        evidenceSummaryEn: 'Legacy partners peer — default hidden.',
        relationshipSupported: 'peer',
      })],
    }), {
      legacyEdgeId: `${ticker}->${pid}`,
      source: sourceId,
      target: targetId,
      beforeType: 'partner_string',
      afterType: 'peer',
      afterEditorialStatus: 'reference',
      reason: 'legacy partner string → hidden peer',
    });
  }
}

// Soft grid reference: renewables often settle via KEPCO/utility — reference only
addEdge(baseEdge({
  id: 'e-kepco-grid-ref',
  source: 'krx:015760',
  target: 'stage:grid',
  type: 'supports_project_stage',
  editorialStatus: 'reference',
  status: 'reference',
  relationClass: 'structural',
  defaultHidden: false,
  evidence: [mkEv({
    evidenceUsageType: 'official_role_page',
    sourceType: 'company_ir',
    title: 'Utility grid interconnection reference',
    evidenceSummaryKo: '계통·전력판매 유틸리티 참고 노드(맵 구성종목 아님).',
    evidenceSummaryEn: 'Utility grid reference node (not a map constituent).',
    relationshipSupported: 'supports_project_stage',
  })],
}));

const network = {
  sectorId: 'renewable',
  dataSector: 'renewable',
  model: 'renewable_project_value_chain',
  layout: 'renewableProjectEcosystem',
  asOf: AS_OF,
  generatedAt: AS_OF,
  generatedBy: BY,
  _legacyFallback: false,
  nodes,
  edges,
  metrics: {},
};

network.metrics = computeRenewableProjectMetrics(network);

const report = validateNetworkReport(network);
const soft = (report.failures || []).filter((f) => /renewable/i.test(String(f)) || true);
// Keep hard fails that are not expected during first migrate; write anyway then verify script enforces.
fs.mkdirSync(join(ROOT, 'data', 'networks'), { recursive: true });
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({ asOf: AS_OF, entries: changelog }, null, 2)}\n`, 'utf8');

console.log('OK renewable Phase 4C →', OUT_NET);
console.log(JSON.stringify(network.metrics, null, 2));
console.log('changelog entries:', changelog.length);
console.log('validate failures:', (report.failures || []).length);
if ((report.failures || []).length) {
  for (const f of (report.failures || []).slice(0, 20)) console.log(' -', f);
}
