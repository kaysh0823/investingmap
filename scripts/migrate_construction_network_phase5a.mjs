/**
 * Phase 5A — Migrate construction partners → data/networks/construction.json
 * Model: construction_development_project_ecosystem / constructionProjectEcosystem
 * Does not change cp_list / company count. Never auto-promotes to confirmed.
 * Max ~12 actual projects; PF only when disclosure-backed and representative.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeConstructionProjectMetrics } from '../lib/relation_network/construction_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase5a';
const HTML = join(ROOT, 'construction', 'korea_construction_map.html');
const OUT_NET = join(ROOT, 'data', 'networks', 'construction.json');
const OUT_LOG = join(ROOT, 'data', 'construction_relation_phase5a_changelog.json');

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

function log(row) {
  changelog.push({
    asOf: AS_OF,
    curatedBy: BY,
    ...row,
  });
}

const CHAIN_LANE = {
  '종합건설': 'general_contractor',
  '주택·디벨로퍼': 'developer_housing',
  '건설기계': 'machinery',
  '지주·기타': 'finance_trust',
};

const ROLE_BY_TICKER = {
  '028260': { role: 'epc_contractor', lane: 'overseas_epc', also: 'general_contractor' },
  '000720': { role: 'developer_contractor', lane: 'developer_housing', also: 'general_contractor' },
  '047040': { role: 'epc_contractor', lane: 'overseas_epc', also: 'general_contractor' },
  '375500': { role: 'main_contractor', lane: 'general_contractor' },
  '006360': { role: 'main_contractor', lane: 'general_contractor' },
  '294870': { role: 'project_developer', lane: 'developer_housing' },
  '035890': { role: 'main_contractor', lane: 'developer_housing' },
  '009410': { role: 'main_contractor', lane: 'general_contractor' },
  '034830': { role: 'reit_manager', lane: 'finance_trust' },
  '267270': { role: 'machinery_supplier', lane: 'machinery' },
};

// —— Structural nodes ——
addNode({
  id: 'ecosystem:construction-value-chain',
  type: 'ecosystem',
  nameKo: '건설·개발 가치사슬',
  nameEn: 'Construction & development value chain',
  role: 'ecosystem',
  lane: 'general_contractor',
  isStructuralBundle: true,
});

const BUILDING_TYPES = [
  ['building-type:housing', '주택·공동주택', 'Housing', 'developer_housing'],
  ['building-type:mixed_use', '복합개발', 'Mixed-use', 'developer_housing'],
  ['building-type:plant', '플랜트', 'Plant', 'plant_infra'],
  ['infrastructure:urban_infra', '도시인프라', 'Urban infrastructure', 'plant_infra'],
];
for (const [id, ko, en, lane] of BUILDING_TYPES) {
  addNode({
    id,
    type: id.startsWith('infrastructure') ? 'infrastructure_type' : 'building_type',
    nameKo: ko,
    nameEn: en,
    role: 'building_type',
    lane,
  });
}

const EQUIPMENT = [
  ['equipment:excavator', '굴착기', 'Excavator'],
  ['equipment:wheel_loader', '휠로더', 'Wheel loader'],
  ['equipment:crane', '크레인', 'Crane'],
  ['equipment:mining_equipment', '광산장비', 'Mining equipment'],
];
for (const [id, ko, en] of EQUIPMENT) {
  addNode({
    id, type: 'equipment_category', nameKo: ko, nameEn: en, role: 'equipment', lane: 'machinery',
  });
}

addNode({
  id: 'market:construction_sites',
  type: 'end_market',
  nameKo: '건설·토목 현장',
  nameEn: 'Construction & civil sites',
  role: 'end_market',
  lane: 'machinery',
});

addNode({
  id: 'brand:ipark',
  type: 'apartment_brand',
  nameKo: '아이파크(IPARK)',
  nameEn: 'IPARK',
  role: 'apartment_brand',
  lane: 'developer_housing',
  noteKo: '아파트 브랜드 — 시공계약 당사자가 아님',
  noteEn: 'Apartment brand — not a contracting party',
});

// —— Listed companies ——
for (const c of companies) {
  const meta = ROLE_BY_TICKER[c.ticker] || {};
  const lane = meta.lane || CHAIN_LANE[c.chain] || 'general_contractor';
  addNode({
    id: `krx:${c.ticker}`,
    type: 'listed_company',
    nameKo: c.name,
    nameEn: c.nameEn || c.name,
    ticker: c.ticker,
    market: c.market,
    chain: c.chain,
    semType: c.semType,
    role: meta.role || 'main_contractor',
    lane,
    mcapWon: c.mcapWon,
    isListedKorea: true,
    isMapConstituent: true,
  });
  addEdge(baseEdge({
    id: `e-struct-${c.ticker}-ecosystem`,
    source: `krx:${c.ticker}`,
    target: 'ecosystem:construction-value-chain',
    type: 'member_of',
    editorialStatus: 'reference',
    status: 'reference',
    relationClass: 'structural',
    defaultHidden: false,
    directEvidence: false,
  }), {
    afterType: 'member_of',
    origin: 'phase5a_structural',
    reason: 'Structural ecosystem membership',
  });
}

// —— Role specialization (structural, not project awards) ——
const SPECIALIZE = [
  ['028260', 'building-type:plant', 'specializes_in'],
  ['028260', 'building-type:mixed_use', 'specializes_in'],
  ['000720', 'building-type:housing', 'specializes_in'],
  ['000720', 'building-type:plant', 'specializes_in'],
  ['047040', 'building-type:plant', 'specializes_in'],
  ['375500', 'building-type:plant', 'specializes_in'],
  ['375500', 'infrastructure:urban_infra', 'specializes_in'],
  ['006360', 'building-type:housing', 'specializes_in'],
  ['294870', 'building-type:housing', 'specializes_in'],
  ['035890', 'building-type:housing', 'specializes_in'],
  ['009410', 'infrastructure:urban_infra', 'specializes_in'],
  ['034830', 'building-type:housing', 'specializes_in'],
];
for (const [ticker, target, type] of SPECIALIZE) {
  if (!nodeIds.has(`krx:${ticker}`)) continue;
  addEdge(baseEdge({
    id: `e-spec-${ticker}-${target.replace(/[:/]/g, '-')}`,
    source: `krx:${ticker}`,
    target,
    type,
    editorialStatus: 'reference',
    status: 'reference',
    relationClass: 'structural',
    evidence: [mkEv({
      evidenceUsageType: 'official_role_page',
      title: 'Business segment classification from map chain/semType',
      evidenceSummaryKo: '지도 chain/semType 기반 사업영역 분류. 특정 수주를 의미하지 않음.',
      evidenceSummaryEn: 'Map chain/semType classification — not a specific award.',
      relationshipSupported: type,
    })],
  }));
}

addEdge(baseEdge({
  id: 'e-hdc-ipark-brand',
  source: 'krx:294870',
  target: 'brand:ipark',
  type: 'operates_brand',
  editorialStatus: 'reference',
  status: 'reference',
  relationClass: 'structural',
  evidence: [mkEv({
    evidenceUsageType: 'official_role_page',
    title: 'HDC IPARK apartment brand',
    evidenceSummaryKo: '브랜드 운영. 브랜드≠도급계약 당사자.',
    evidenceSummaryEn: 'Brand operation — brand is not the contracting party.',
    relationshipSupported: 'operates_brand',
  })],
}));

// HD Construction Equipment — products/markets only
for (const eq of ['equipment:excavator', 'equipment:wheel_loader', 'equipment:mining_equipment']) {
  addEdge(baseEdge({
    id: `e-hdce-mfg-${eq.split(':')[1]}`,
    source: 'krx:267270',
    target: eq,
    type: 'manufactures',
    editorialStatus: 'reference',
    status: 'reference',
    relationClass: 'structural',
    evidence: [mkEv({
      evidenceUsageType: 'official_role_page',
      title: 'HD CE product categories',
      url: 'https://www.hd-constructionequipment.com/',
      evidenceSummaryKo: '건설기계 제조. 시공사 아님.',
      evidenceSummaryEn: 'Equipment manufacturing — not a main contractor.',
      relationshipSupported: 'manufactures',
    })],
  }));
}
addEdge(baseEdge({
  id: 'e-hdce-market',
  source: 'krx:267270',
  target: 'market:construction_sites',
  type: 'exposed_to',
  editorialStatus: 'reference',
  status: 'reference',
  relationClass: 'structural',
  evidence: [mkEv({
    evidenceUsageType: 'official_role_page',
    title: 'Construction equipment end market',
    evidenceSummaryKo: '현장 수요시장 노출. 특정 건설사 고객관계가 아님.',
    evidenceSummaryEn: 'End-market exposure — not a named contractor customer link.',
    relationshipSupported: 'exposed_to',
  })],
}));

// —— Global peers (hidden) ——
for (const g of globals) {
  const isEquip = ['caterpillar', 'komatsu', 'volvo_ce'].includes(g.id);
  addNode({
    id: `global:${g.id}`,
    type: 'global_company',
    nameKo: g.name,
    nameEn: g.nameEn || g.name,
    country: g.country,
    region: g.region,
    role: isEquip ? 'machinery_peer' : 'global_contractor_peer',
    lane: isEquip ? 'machinery' : 'overseas_epc',
    defaultHidden: true,
  });
}

const PEER_MAP = {
  bechtel: ['028260', '000720', '006360'],
  fluor: ['028260', '000720', '047040', '375500'],
  vinci: ['028260', '000720', '375500'],
  acs: ['047040', '009410'],
  skanska: ['006360', '294870'],
  hochtief: ['294870', '035890', '034830'],
  caterpillar: ['267270'],
  komatsu: ['267270'],
  volvo_ce: ['267270'],
};

for (const [gid, tickers] of Object.entries(PEER_MAP)) {
  if (!nodeIds.has(`global:${gid}`)) continue;
  for (const t of tickers) {
    if (!nodeIds.has(`krx:${t}`)) continue;
    addEdge(baseEdge({
      id: `e-peer-${t}-${gid}`,
      source: `krx:${t}`,
      target: `global:${gid}`,
      type: 'peer',
      editorialStatus: 'peer',
      status: 'peer',
      relationClass: 'reference',
      defaultHidden: true,
      direction: 'undirected',
      evidence: [mkEv({
        evidenceUsageType: 'general_business_page',
        title: 'Legacy global peer reference',
        evidenceSummaryKo: '레거시 글로벌 peer 참고. 실제 거래 아님.',
        evidenceSummaryEn: 'Legacy global peer — not a verified trade.',
        relationshipSupported: 'peer',
      })],
    }), {
      beforeType: 'partners_array',
      afterType: 'peer',
      afterEditorialStatus: 'peer',
      origin: 'phase5a_migrate_legacy_peer',
      reason: 'Demote legacy partners[] to hidden peer — no project award evidence',
    });
  }
}

log({
  origin: 'phase5a_migrate',
  reason: 'All legacy partners[] classified as global peer (defaultHidden); no automatic main_contractor from chain label',
  removedUnsupported: 0,
  legacyPartnerEdges: Object.values(PEER_MAP).reduce((a, b) => a + b.length, 0),
});

// ========== Curated projects (≤12) ==========

function projectEvidence(dartUrl, title, publishedAt, ko, en, rel) {
  return [mkEv({
    directEvidence: true,
    sourceType: 'disclosure',
    evidenceUsageType: 'exact_project_document',
    title,
    url: dartUrl,
    publishedAt,
    evidenceSummaryKo: ko,
    evidenceSummaryEn: en,
    relationshipSupported: rel,
  })];
}

// 1) Samsung C&T — Qatar Dukhan Solar EPIC (overseas)
addNode({
  id: 'org:qatar-energy',
  type: 'public_corporation',
  nameKo: '카타르에너지(QatarEnergy)',
  nameEn: 'QatarEnergy',
  role: 'project_owner',
  lane: 'overseas_epc',
  countryCode: 'QA',
});
addNode({
  id: 'epc-project:qatar-dukhan-solar',
  type: 'overseas_epc_project',
  nameKo: '카타르 두칸 태양광 발전소(EPIC)',
  nameEn: 'Qatar Dukhan Solar Power Plant (EPIC)',
  role: 'overseas_epc_project',
  lane: 'overseas_epc',
  scope: 'overseas',
  projectCategory: 'plant',
  region: 'Dukhan, Qatar',
  countryCode: 'QA',
  projectStatus: 'contract_signed',
  capacityNote: '2,000MW solar (plant scope — not Samsung-owned generation)',
  constructionContractValue: 1540071611480,
  companyContractValue: 1540071611480,
  companyParticipationPct: 100,
  currency: 'KRW',
  valueType: 'company_contract_share',
  counterpartyStatus: 'exact',
  targetCommercialOperationDate: '2030-06-30',
  contractStartDate: '2025-09-01',
  noteKo: 'DART 단일판매공급: EPIC. 계약금액은 회사 도급분. 발전 보유용량 아님.',
  noteEn: 'DART disclosure: EPIC contract. Company contract value — not owned generation MW.',
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20251223800010',
    'Samsung C&T — Dukhan Solar EPIC contract (DART)',
    '2025-12-23',
    '카타르에너지 상대, EPIC 본계약. 계약금액 약 1.54조원(VAT 별도 공시 기준).',
    'Counterparty QatarEnergy; EPIC contract; ~KRW 1.54tn company contract value.',
    'epc_for',
  ),
});
addEdge(baseEdge({
  id: 'e-dukhan-owner',
  source: 'org:qatar-energy',
  target: 'epc-project:qatar-dukhan-solar',
  type: 'project_owner',
  projectStatus: 'contract_signed',
  directEvidence: true,
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20251223800010',
    'QatarEnergy as contract counterparty',
    '2025-12-23',
    '공시 계약상대: QatarEnergy.',
    'Disclosed counterparty: QatarEnergy.',
    'project_owner',
  ),
}));
addEdge(baseEdge({
  id: 'e-dukhan-samsung-epc',
  source: 'krx:028260',
  target: 'epc-project:qatar-dukhan-solar',
  type: 'epc_for',
  projectStatus: 'contract_signed',
  companyContractValue: 1540071611480,
  currency: 'KRW',
  valueType: 'company_contract_share',
  companyParticipationPct: 100,
  directEvidence: true,
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20251223800010',
    'Samsung C&T EPIC award Dukhan',
    '2025-12-23',
    '삼성물산 EPIC 수주. 총사업비와 별도 회사 계약금액.',
    'Samsung C&T EPIC award — company contract value, not total project CAPEX as revenue.',
    'epc_for',
  ),
}));
log({
  nodeOrEdgeId: 'epc-project:qatar-dukhan-solar',
  afterType: 'overseas_epc_project',
  afterProjectStatus: 'contract_signed',
  reason: 'Exact DART EPIC disclosure — Samsung C&T overseas plant',
});

// 2) Hyundai E&C — Wirye Bokjeong mixed-use + PFV
addNode({
  id: 'pfv:songpa-biz-cluster',
  type: 'pfv',
  nameKo: '송파비즈클러스터피에프브이',
  nameEn: 'Songpa Biz Cluster PFV',
  role: 'pfv',
  lane: 'developer_housing',
  noteKo: '현대건설이 최대주주로 공시. 지분율 %는 추가 공시 확인 전 null.',
  noteEn: 'Hyundai E&C disclosed as largest shareholder; stake % pending finer disclosure.',
});
addNode({
  id: 'construction-project:wirye-bokjeong-mixed',
  type: 'construction_project',
  nameKo: '위례신도시 복정역세권 복합개발(2BL·3BL)',
  nameEn: 'Wirye Bokjeong transit mixed-use (2BL·3BL)',
  role: 'construction_project',
  lane: 'developer_housing',
  scope: 'domestic',
  projectCategory: 'housing',
  buildingType: 'mixed_use',
  region: '서울 송파구 장지동',
  projectStatus: 'contract_signed',
  constructionContractValue: 3039406100000,
  companyContractValue: 2936423570000,
  companyParticipationPct: null,
  currency: 'KRW',
  valueType: 'company_contract_share',
  counterpartyStatus: 'exact',
  contractStartDate: '2026-06-15',
  targetCommercialOperationDate: '2031-01-14',
  noteKo: '2BL 당사분 100%, 3BL 당사분 70% → 기업 계약지분 합산. 총사업비≠회사 매출 전액.',
  noteEn: '2BL 100% + 3BL 70% company shares. Total construction contract ≠ full company revenue recognition.',
  consortiumNote: 'Participation disclosed by block; not full 3.04tn applied as 100% to one firm without share split.',
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260608800044',
    'Hyundai E&C — Wirye Bokjeong contract (DART)',
    '2026-06-08',
    '상대: 송파비즈클러스터PFV. 계약총액 약 3.04조. 2BL 100%/3BL 70% 당사분.',
    'Counterparty Songpa Biz Cluster PFV; ~KRW 3.04tn total; company shares 100%/70% by block.',
    'main_contractor',
  ),
});
addEdge(baseEdge({
  id: 'e-wirye-pfv-owner',
  source: 'pfv:songpa-biz-cluster',
  target: 'construction-project:wirye-bokjeong-mixed',
  type: 'project_owner',
  projectStatus: 'contract_signed',
  directEvidence: true,
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260608800044',
    'PFV as contract counterparty / owner vehicle',
    '2026-06-08',
    '공사 발주·계약 상대 PFV.',
    'PFV is disclosed contract counterparty.',
    'project_owner',
  ),
}));
addEdge(baseEdge({
  id: 'e-wirye-hyundai-pfv-stake',
  source: 'krx:000720',
  target: 'pfv:songpa-biz-cluster',
  type: 'pfv_shareholder',
  ownershipPct: null,
  ownershipKind: 'largest_shareholder_disclosed',
  directOrIndirect: 'direct',
  asOf: '2026-06-08',
  directEvidence: true,
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260608800044',
    'Hyundai E&C largest shareholder of Songpa Biz Cluster PFV',
    '2026-06-08',
    '공시: 당사는 해당 PFV의 최대주주. 정확한 %는 추가 확인.',
    'Disclosed largest shareholder of PFV; exact % needs follow-up filing.',
    'pfv_shareholder',
  ),
}));
addEdge(baseEdge({
  id: 'e-wirye-hyundai-mc',
  source: 'krx:000720',
  target: 'construction-project:wirye-bokjeong-mixed',
  type: 'main_contractor',
  projectStatus: 'contract_signed',
  companyContractValue: 2936423570000,
  currency: 'KRW',
  valueType: 'company_contract_share',
  directEvidence: true,
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260608800044',
    'Hyundai E&C main contractor Wirye',
    '2026-06-08',
    '시공 도급. 블록별 지분 반영한 회사 계약금액.',
    'Main contractor; company contract value uses disclosed block shares.',
    'main_contractor',
  ),
}));
addEdge(baseEdge({
  id: 'e-wirye-hyundai-developer',
  source: 'krx:000720',
  target: 'construction-project:wirye-bokjeong-mixed',
  type: 'project_developer',
  projectStatus: 'contract_signed',
  editorialStatus: 'reported',
  directEvidence: false,
  evidence: projectEvidence(
    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260608800044',
    'Developer-contractor via PFV ownership',
    '2026-06-08',
    'PFV 최대주주+시공 — 단순 도급과 구분되는 디벨로퍼·시공 겸영.',
    'Largest PFV shareholder + contractor — developer-contractor, not pure bid-only.',
    'project_developer',
  ),
}));

// 3) GS E&C — Busan Sajik3 redevelopment
addNode({
  id: 'org:sajik3-redev-union',
  type: 'domestic_unlisted_company',
  nameKo: '사직3구역 재개발정비사업조합',
  nameEn: 'Sajik Zone 3 Redevelopment Union',
  role: 'project_owner',
  lane: 'developer_housing',
});
addNode({
  id: 'construction-project:busan-sajik3-redev',
  type: 'construction_project',
  nameKo: '부산 사직3구역 재개발',
  nameEn: 'Busan Sajik Zone 3 redevelopment',
  role: 'construction_project',
  lane: 'developer_housing',
  scope: 'domestic',
  projectCategory: 'housing',
  region: '부산 동래구 사직동',
  projectStatus: 'contract_signed',
  constructionContractValue: 408232163334,
  companyContractValue: 408232163334,
  companyParticipationPct: 100,
  currency: 'KRW',
  valueType: 'company_contract_share',
  counterpartyStatus: 'exact',
  noteKo: 'VAT 별도 도급. 실착공일부터 42개월.',
  noteEn: 'VAT-excluded contract; 42 months from groundbreaking.',
  evidence: projectEvidence(
    'https://www.thinkpool.com/item/006360/disclosures/all/569243',
    'GS E&C — Sajik3 redevelopment disclosure table',
    '2026-08-07',
    '계약상대 조합, 도급 408,232,163,334원(VAT 별도). 본계약 체결.',
    'Union counterparty; KRW 408,232,163,334 VAT-excl. Signed contract.',
    'main_contractor',
  ),
});
addEdge(baseEdge({
  id: 'e-sajik-owner',
  source: 'org:sajik3-redev-union',
  target: 'construction-project:busan-sajik3-redev',
  type: 'project_owner',
  projectStatus: 'contract_signed',
  directEvidence: true,
  evidence: projectEvidence(
    'https://www.thinkpool.com/item/006360/disclosures/all/569243',
    'Redevelopment union owner',
    '2026-08-07',
    '사업조합=발주·시행 측.',
    'Union is owner/awarding party.',
    'project_owner',
  ),
}));
addEdge(baseEdge({
  id: 'e-sajik-gs-mc',
  source: 'krx:006360',
  target: 'construction-project:busan-sajik3-redev',
  type: 'main_contractor',
  projectStatus: 'contract_signed',
  companyContractValue: 408232163334,
  currency: 'KRW',
  valueType: 'company_contract_share',
  directEvidence: true,
  evidence: projectEvidence(
    'https://www.thinkpool.com/item/006360/disclosures/all/569243',
    'GS E&C main contractor Sajik3',
    '2026-08-07',
    'GS건설 시공 도급.',
    'GS E&C main contractor.',
    'main_contractor',
  ),
}));

// 4) HDC IPARK — Yongsan Jeongbichang Zone 1
addNode({
  id: 'org:yongsan-jeongbichang-zone1-union',
  type: 'domestic_unlisted_company',
  nameKo: '정비창전면제1구역재개발정비사업조합',
  nameEn: 'Yongsan Rail Yard Front Zone 1 Redevelopment Union',
  role: 'project_owner',
  lane: 'developer_housing',
});
addNode({
  id: 'construction-project:yongsan-jeongbichang-zone1',
  type: 'construction_project',
  nameKo: '용산 정비창전면 제1구역 재개발',
  nameEn: 'Yongsan rail-yard front Zone 1 redevelopment',
  role: 'construction_project',
  lane: 'developer_housing',
  scope: 'domestic',
  projectCategory: 'housing',
  region: '서울 용산구 한강로3가',
  projectStatus: 'contract_signed',
  constructionContractValue: 924430915470,
  companyContractValue: 924430915470,
  companyParticipationPct: 100,
  currency: 'KRW',
  valueType: 'company_contract_share',
  counterpartyStatus: 'exact',
  noteKo: '시공 도급. IPARK 브랜드는 마케팅 브랜드이며 계약 당사자 아님.',
  noteEn: 'Construction contract. IPARK brand is marketing — not the contracting party.',
  evidence: projectEvidence(
    'https://www.digitaltoday.co.kr/news/articleView.html?idxno=627464',
    'HDC Hyundai Development — Yongsan Zone1 contract disclosure report',
    '2026-02-05',
    '도급 924,430,915,470원, 조합 상대, 실착공 후 42개월.',
    'KRW 924,430,915,470 vs union; 42 months from groundbreaking.',
    'main_contractor',
  ),
});
addEdge(baseEdge({
  id: 'e-yongsan-owner',
  source: 'org:yongsan-jeongbichang-zone1-union',
  target: 'construction-project:yongsan-jeongbichang-zone1',
  type: 'project_owner',
  projectStatus: 'contract_signed',
  directEvidence: true,
  evidence: projectEvidence(
    'https://www.digitaltoday.co.kr/news/articleView.html?idxno=627464',
    'Union project owner',
    '2026-02-05',
    '조합 발주.',
    'Union awarding party.',
    'project_owner',
  ),
}));
addEdge(baseEdge({
  id: 'e-yongsan-hdc-mc',
  source: 'krx:294870',
  target: 'construction-project:yongsan-jeongbichang-zone1',
  type: 'main_contractor',
  projectStatus: 'contract_signed',
  companyContractValue: 924430915470,
  currency: 'KRW',
  valueType: 'company_contract_share',
  directEvidence: true,
  evidence: projectEvidence(
    'https://www.digitaltoday.co.kr/news/articleView.html?idxno=627464',
    'HDC main contractor Yongsan Zone1',
    '2026-02-05',
    'HDC현대산업개발 시공. 브랜드≠법인.',
    'HDC Hyundai Development contractor. Brand ≠ legal party.',
    'main_contractor',
  ),
}));

// 5) Daewoo — Mozambique Rovuma LNG (preferred / LOI — NOT signed EPC)
addNode({
  id: 'consortium:smdc-jv',
  type: 'consortium',
  nameKo: 'SMDC JV(사이펨·맥더못·대우·CPECC)',
  nameEn: 'SMDC JV (Saipem, McDermott, Daewoo, CPECC)',
  role: 'consortium',
  lane: 'overseas_epc',
  consortiumName: 'SMDC JV',
  leadCompany: null,
  memberIds: ['krx:047040', 'global:saipem', 'global:mcdermott', 'global:cpecc'],
  participationPctByMember: null,
  noteKo: '참여사 지분율 미공시 → null. 전체 사업비를 대우 단독 수주로 표시하지 않음.',
  noteEn: 'Member shares undisclosed → null. Do not assign full multi-trillion CAPEX to Daewoo alone.',
});
addNode({
  id: 'global:saipem',
  type: 'global_company',
  nameKo: '사이펨',
  nameEn: 'Saipem',
  role: 'epc_peer',
  lane: 'overseas_epc',
  defaultHidden: true,
});
addNode({
  id: 'global:mcdermott',
  type: 'global_company',
  nameKo: '맥더못',
  nameEn: 'McDermott',
  role: 'epc_peer',
  lane: 'overseas_epc',
  defaultHidden: true,
});
addNode({
  id: 'global:cpecc',
  type: 'global_company',
  nameKo: 'CPECC',
  nameEn: 'CPECC',
  role: 'epc_peer',
  lane: 'overseas_epc',
  defaultHidden: true,
});
addNode({
  id: 'org:exxonmobil-mozambique',
  type: 'global_company',
  nameKo: '엑손모빌 모잠비크',
  nameEn: 'ExxonMobil Mozambique',
  role: 'project_owner',
  lane: 'overseas_epc',
  countryCode: 'MZ',
});
addNode({
  id: 'epc-project:mozambique-rovuma-lng-phase1',
  type: 'overseas_epc_project',
  nameKo: '모잠비크 로부마 LNG 1단계(미드스트림)',
  nameEn: 'Mozambique Rovuma LNG Phase 1 (midstream)',
  role: 'overseas_epc_project',
  lane: 'overseas_epc',
  scope: 'overseas',
  projectCategory: 'plant',
  region: 'Mozambique',
  countryCode: 'MZ',
  projectStatus: 'preferred_bidder',
  totalProjectValue: null,
  companyContractValue: null,
  valueType: 'undisclosed',
  counterpartyStatus: 'exact',
  noteKo: 'LOI/EPC 선정 단계. FID·본계약 전. 수십조 추정 총사업비를 회사 수주액으로 표시하지 않음.',
  noteEn: 'LOI/EPC selection — pre-FID/signed contract. Multi-trillion estimate is NOT company contract value.',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Daewoo — Rovuma LNG LOI / EPC selection (Yonhap)',
    url: 'https://www.yna.co.kr/view/AKR20260807039200003',
    publishedAt: '2026-08-07',
    evidenceSummaryKo: 'SMDC JV EPC 선정·LOI. 본계약·금액 미확정.',
    evidenceSummaryEn: 'SMDC JV selected for EPC with LOI; signed value not fixed.',
    relationshipSupported: 'preferred_bidder_for',
  })],
});
addEdge(baseEdge({
  id: 'e-rovuma-owner',
  source: 'org:exxonmobil-mozambique',
  target: 'epc-project:mozambique-rovuma-lng-phase1',
  type: 'project_owner',
  projectStatus: 'preferred_bidder',
  editorialStatus: 'reported',
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'ExxonMobil Mozambique as project lead owner',
    url: 'https://www.yna.co.kr/view/AKR20260807039200003',
    publishedAt: '2026-08-07',
    relationshipSupported: 'project_owner',
    evidenceSummaryKo: '사업주 대표 엑손모빌 모잠비크.',
    evidenceSummaryEn: 'Project lead owner ExxonMobil Mozambique.',
  })],
}));
addEdge(baseEdge({
  id: 'e-rovuma-consortium',
  source: 'krx:047040',
  target: 'consortium:smdc-jv',
  type: 'consortium_member',
  projectStatus: 'preferred_bidder',
  participationPct: null,
  directEvidence: true,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'Daewoo member of SMDC JV',
    url: 'https://www.yna.co.kr/view/AKR20260807039200003',
    publishedAt: '2026-08-07',
    relationshipSupported: 'consortium_member',
    evidenceSummaryKo: 'SMDC JV 원청 참여. 지분율 미공개.',
    evidenceSummaryEn: 'SMDC JV prime participant; share % undisclosed.',
  })],
}));
addEdge(baseEdge({
  id: 'e-rovuma-preferred',
  source: 'consortium:smdc-jv',
  target: 'epc-project:mozambique-rovuma-lng-phase1',
  type: 'preferred_bidder_for',
  projectStatus: 'preferred_bidder',
  directEvidence: true,
  noteKo: '우선협상·LOI 단계이며 본계약과 다를 수 있습니다.',
  noteEn: 'Preferred/LOI stage — may differ from a signed EPC.',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'SMDC JV preferred/LOI for Rovuma midstream EPC',
    url: 'https://www.yna.co.kr/view/AKR20260807039200003',
    publishedAt: '2026-08-07',
    relationshipSupported: 'preferred_bidder_for',
    evidenceSummaryKo: 'EPC 선정·LOI. contract_signed 아님.',
    evidenceSummaryEn: 'EPC selection/LOI — not contract_signed.',
  })],
}));

// 6) DL — exact DART rcp for Yeongdong Lot1 deferred; structural specializes_in only.
log({
  origin: 'phase5a_skip',
  reason: 'DL Yeongdong Lot1 deferred until exact DART rcp verified; structural specializes_in retained',
  ticker: '375500',
});

const network = {
  sectorId: 'construction',
  dataSector: 'construction',
  model: 'construction_development_project_ecosystem',
  layout: 'constructionProjectEcosystem',
  asOf: AS_OF,
  _legacyFallback: false,
  nodes,
  edges,
  phase5aCuratedAt: AS_OF,
};
network.metrics = computeConstructionProjectMetrics(network);

const report = validateNetworkReport(network);
fs.writeFileSync(OUT_NET, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_LOG, `${JSON.stringify({ asOf: AS_OF, curatedBy: BY, entries: changelog }, null, 2)}\n`, 'utf8');

console.log('OK construction Phase 5A →', OUT_NET);
console.log(JSON.stringify(network.metrics, null, 2));
console.log('nodes/edges', nodes.length, edges.length);
console.log('listed', companies.length);
console.log('changelog', changelog.length);
console.log('validate failures', (report.failures || []).length);
if ((report.failures || []).length) {
  for (const f of (report.failures || []).slice(0, 30)) console.log(' -', f);
}
if (companies.length !== 10) {
  console.warn('WARN listed count expected 10, got', companies.length);
}
