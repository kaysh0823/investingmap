/**
 * Phase 4A.1 — Powergrid contract / award source curation.
 * Loads data/networks/powergrid.json (from Phase 4A migrate) and applies
 * contract schema enrichment, edge reclassification, and limited new contracts.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { computePowergridContractMetrics, dartUrl } from '../lib/relation_network/powergrid_contract_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review';
const NET = join(ROOT, 'data', 'networks', 'powergrid.json');
const CHANGELOG = join(ROOT, 'data', 'powergrid_relation_phase4a1_changelog.json');

const network = JSON.parse(fs.readFileSync(NET, 'utf8'));
const changelog = [];
const nodes = network.nodes;
const edges = network.edges;
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const edgeById = new Map(edges.map((e) => [e.id, e]));

function logChange(entry) {
  changelog.push({ ...entry, phase: '4A.1', asOf: AS_OF });
}

function upsertNode(n) {
  const prev = nodeById.get(n.id);
  if (prev) Object.assign(prev, n);
  else {
    nodes.push(n);
    nodeById.set(n.id, n);
  }
}

function removeEdge(id, reason) {
  const idx = edges.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const e = edges[idx];
  logChange({
    edgeId: id,
    beforeStatus: e.status,
    afterStatus: 'removed',
    beforeType: e.type,
    afterType: 'removed',
    directEvidence: !!(e.evidence || [])[0]?.directEvidence,
    reviewStatus: (e.evidence || [])[0]?.reviewStatus || null,
    reason,
    evidenceUrl: (e.evidence || [])[0]?.url || null,
  });
  edges.splice(idx, 1);
  edgeById.delete(id);
}

function patchEdge(id, patch, reason) {
  const e = edgeById.get(id);
  if (!e) return;
  logChange({
    edgeId: id,
    beforeStatus: e.status,
    afterStatus: patch.status ?? e.status,
    beforeType: e.type,
    afterType: patch.type ?? e.type,
    directEvidence: !!(patch.evidence || e.evidence || [])[0]?.directEvidence,
    reviewStatus: (patch.evidence || e.evidence || [])[0]?.reviewStatus || (e.evidence || [])[0]?.reviewStatus,
    reason,
    evidenceUrl: (patch.evidence || e.evidence || [])[0]?.url || (e.evidence || [])[0]?.url,
  });
  Object.assign(e, patch);
}

function addEdge(e, reason) {
  if (edgeById.has(e.id)) return;
  edges.push(e);
  edgeById.set(e.id, e);
  logChange({
    edgeId: e.id,
    beforeStatus: null,
    afterStatus: e.status,
    beforeType: null,
    afterType: e.type,
    directEvidence: !!(e.evidence || [])[0]?.directEvidence,
    reviewStatus: (e.evidence || [])[0]?.reviewStatus,
    reason,
    evidenceUrl: (e.evidence || [])[0]?.url,
  });
}

function mkEv(p) {
  return {
    reviewStatus: p.reviewStatus || 'reviewed',
    reviewedAt: p.reviewedAt || AS_OF,
    reviewedBy: p.reviewedBy || BY,
    accessedAt: AS_OF,
    directEvidence: p.directEvidence !== false,
    sourceType: p.sourceType || 'dart',
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt || null,
    evidenceSummaryKo: p.evidenceSummaryKo || '',
    evidenceSummaryEn: p.evidenceSummaryEn || '',
    quotedFactKo: p.quotedFactKo || '',
    relationshipSupported: p.relationshipSupported || '',
    originalReceiptNo: p.originalReceiptNo || null,
    latestReceiptNo: p.latestReceiptNo || null,
    correctionReceiptNos: p.correctionReceiptNos || [],
  };
}

// ——— Entity nodes ———
upsertNode({
  id: 'kr:ls_electric_america',
  type: 'domestic_unlisted_company',
  nameKo: 'LS ELECTRIC AMERICA Inc.',
  nameEn: 'LS ELECTRIC AMERICA Inc.',
  role: 'subsidiary_legal_counterparty',
  lane: 'demand_overseas',
  isListedKorea: false,
  noteKo: '공시상 법적 계약 상대(자회사). 최종 발주처와 구분.',
  noteEn: 'Disclosed legal counterparty (subsidiary) — not the end utility.',
});

upsertNode({
  id: 'kr:hico_america',
  type: 'domestic_unlisted_company',
  nameKo: 'HICO America Sales & Tech, Inc.',
  nameEn: 'HICO America Sales & Tech, Inc.',
  role: 'subsidiary_legal_counterparty',
  lane: 'demand_overseas',
  isListedKorea: false,
  noteKo: '효성중공업 미국 판매법인. 법적 계약 상대.',
  noteEn: 'Hyosung Heavy U.S. sales entity — legal counterparty.',
});

upsertNode({
  id: 'utility:spgroup',
  type: 'utility',
  nameKo: '싱가포르 전력청(SP Group)',
  nameEn: 'SP Group (Singapore Power)',
  role: 'utility',
  lane: 'demand_overseas',
  isListedKorea: false,
});

upsertNode({
  id: 'organization:bloom_energy',
  type: 'organization',
  nameKo: 'Bloom Energy',
  nameEn: 'Bloom Energy',
  role: 'named_counterparty',
  lane: 'demand_overseas',
  isListedKorea: false,
  noteKo: '공시에 명시된 발주/계약 상대. 상장 종목 아님.',
  noteEn: 'Named counterparty in disclosure — not a listed KR stock.',
});

upsertNode({
  id: 'counterparty:undisclosed_europe_grid',
  type: 'organization',
  nameKo: '유럽 전력망 발주처(비공개)',
  nameEn: 'Undisclosed European grid counterparty',
  role: 'anonymous_counterparty',
  lane: 'demand_overseas',
  isAnonymousCounterparty: true,
  noteKo: '공시상 계약 상대 미기재(경영상 비밀). 실제 회사로 표시하지 않음.',
  noteEn: 'Counterparty not named in disclosure — not shown as a real company.',
});

upsertNode({
  id: 'region:europe',
  type: 'region',
  nameKo: '유럽',
  nameEn: 'Europe',
  role: 'region',
  lane: 'demand_overseas',
  layer: '유럽',
});

upsertNode({
  id: 'region:southeast_asia',
  type: 'region',
  nameKo: '동남아',
  nameEn: 'Southeast Asia',
  role: 'region',
  lane: 'demand_overseas',
  layer: '동남아',
});

upsertNode({
  id: 'kr:hd_hyundai_electric_us',
  type: 'domestic_unlisted_company',
  nameKo: 'HD현대일렉트릭 미국 자회사(공시)',
  nameEn: 'HD Hyundai Electric U.S. subsidiary (per disclosure)',
  role: 'subsidiary_legal_counterparty',
  lane: 'demand_overseas',
  isListedKorea: false,
  noteKo: '공시상 미국 자회사 경유 공급. 법적 계약 상대는 별도 확인 필요.',
  noteEn: 'Disclosure cites supply via U.S. subsidiary — legal path only.',
});

// ——— HD Hyundai Electric U.S. transformer contract ———
upsertNode({
  id: 'contract:hde-20260507-us-transformer',
  type: 'contract',
  contractId: 'contract:hde-20260507-us-transformer',
  contractNameKo: 'HD현대일렉트릭 美 765kV 변압기·리액터 공급계약',
  contractNameEn: 'HD Hyundai Electric U.S. 765kV transformer/reactor supply',
  nameKo: 'HD현대일렉트릭 美 765kV 변압기·리액터 공급계약',
  nameEn: 'HD Hyundai Electric U.S. 765kV transformer/reactor supply',
  role: 'contract',
  lane: 'demand_overseas',
  filer: 'krx:267260',
  legalCounterparty: 'kr:hd_hyundai_electric_us',
  endCustomer: 'counterparty:undisclosed_us_utility',
  counterpartyDisclosure: 'undisclosed',
  equipmentType: 'equipment:power_transformer',
  voltageClass: '765kV',
  projectRegion: 'region:north_america',
  announcementDate: '2026-05-07',
  contractDate: '2026-05-06',
  effectiveFrom: '2026-05-06',
  validTo: '2029-08-31',
  contractValue: 173000000000,
  currency: 'KRW',
  contractStatus: 'effective',
  originalReceiptNo: '20260507800238',
  latestReceiptNo: '20260507800238',
  correctionReceiptNos: [],
  originalAnnouncementDate: '2026-05-07',
  latestUpdateDate: '2026-05-07',
  correctionReviewStatus: 'reviewed',
  productScope: '765kV transformer, reactor',
  status: 'effective',
  lastVerifiedAt: AS_OF,
  noteKo: '최종 미국 유틸리티명은 공시 미공개. 법적 경로는 미국 자회사 경유.',
  noteEn: 'End U.S. utility not named; disclosure cites U.S. subsidiary path.',
});

// ——— Taihan KAHRAMAA — rename canonical id, upgrade to effective formal contract ———
const taihanOldId = 'contract:taihan-20250825-kahramaa-loa';
const taihanNewId = 'contract:taihan-gtc-1217a-2024-kahramaa';
const taihanNode = nodeById.get(taihanOldId);
if (taihanNode) {
  taihanNode.id = taihanNewId;
  nodeById.delete(taihanOldId);
  nodeById.set(taihanNewId, taihanNode);
  for (const e of edges) {
    if (e.source === taihanOldId) e.source = taihanNewId;
    if (e.target === taihanOldId) e.target = taihanNewId;
  }
}

upsertNode({
  id: taihanNewId,
  type: 'contract',
  contractId: taihanNewId,
  contractNameKo: '카타르 GTC/1217A/2024 EHV 케이블 Full-Turnkey',
  contractNameEn: 'Qatar GTC/1217A/2024 EHV cable full turnkey',
  nameKo: '카타르 GTC/1217A/2024 EHV 케이블 Full-Turnkey',
  nameEn: 'Qatar GTC/1217A/2024 EHV cable full turnkey',
  role: 'contract',
  lane: 'demand_overseas',
  filer: 'krx:001440',
  legalCounterparty: 'utility:kahramaa',
  endCustomer: 'utility:kahramaa',
  counterpartyDisclosure: 'named',
  equipmentType: 'equipment:cable',
  voltageClass: '400kV/220kV',
  projectRegion: 'region:middle_east',
  announcementDate: '2025-08-25',
  contractDate: '2025-11-19',
  effectiveFrom: '2025-09-11',
  validTo: '2029-04-30',
  contractValue: 183912326053,
  currency: 'KRW',
  contractStatus: 'effective',
  originalReceiptNo: '20250825800543',
  latestReceiptNo: '20251120800410',
  correctionReceiptNos: ['20250924800002'],
  originalAnnouncementDate: '2025-08-25',
  latestUpdateDate: '2025-11-20',
  correctionReviewStatus: 'reviewed',
  loaReceivedAt: '2025-08-25',
  productScope: '400kV/220kV EHV cable full turnkey',
  status: 'effective',
  lastVerifiedAt: AS_OF,
  noteKo: '2025.8.25 LOA → 2025.9.24 Final LOA 금액정정(20250924800002) → 2025.11.20 정식 공급계약. (잘못된 20250924800543 거부건 제외)',
  noteEn: 'LOA 2025-08-25 → Final LOA correction 20250924800002 → formal supply 2025-11-20. (rejected 20250924800543 excluded)',
});

upsertNode({
  id: 'project:qatar-gtc-1217a-2024',
  type: 'project',
  projectId: 'project:qatar-gtc-1217a-2024',
  nameKo: '카타르 송전계통 확장 EHV 케이블 (GTC/1217A/2024)',
  nameEn: 'Qatar Power Transmission Expansion EHV cables (GTC/1217A/2024)',
  role: 'project',
  lane: 'demand_overseas',
  status: 'in_delivery',
  lastVerifiedAt: AS_OF,
});

// ——— New contracts (5) ———
const NEW_CONTRACTS = [
  {
    id: 'contract:ls-20251107-bigtech-dc-p2',
    company: 'krx:010120',
    nameKo: 'LS ELECTRIC Big Tech Data Center PJT(2차)',
    nameEn: 'LS ELECTRIC Big Tech Data Center PJT (phase 2)',
    legalCounterparty: 'kr:ls_electric_america',
    endCustomer: 'counterparty:undisclosed_us_utility',
    counterpartyDisclosure: 'undisclosed',
    equipmentType: 'equipment:switchgear',
    region: 'region:north_america',
    value: 132910198720,
    effectiveFrom: '2025-11-07',
    validTo: '2026-04-01',
    contractDate: '2025-11-07',
    announcementDate: '2025-11-10',
    rcp: '20251110800106',
    contractStatus: 'completed',
    status: 'completed',
    summaryKo: '자회사 LS ELECTRIC AMERICA에 전력기기·배전시스템 공급. 최종 빅테크 고객명 비공개.',
    summaryEn: 'Supply to subsidiary LS ELECTRIC AMERICA; end Big Tech customer undisclosed.',
    quotedKo: 'Big Tech Data Center PJT(2차)',
  },
  {
    id: 'contract:hyosung-20260209-hico-765kv',
    company: 'krx:298040',
    nameKo: '효성중공업 765kV 변압기·리액터 (HICO 재발주)',
    nameEn: 'Hyosung 765kV transformer/reactor (HICO reorder)',
    legalCounterparty: 'kr:hico_america',
    endCustomer: 'counterparty:undisclosed_us_utility',
    counterpartyDisclosure: 'undisclosed',
    equipmentType: 'equipment:power_transformer',
    region: 'region:north_america',
    value: 787063743500,
    effectiveFrom: '2026-02-09',
    validTo: '2031-01-31',
    contractDate: '2026-02-09',
    announcementDate: '2026-02-10',
    rcp: '20260210800044',
    summaryKo: 'HICO America가 미국 대형 유틸리티 수주 후 재발주. 최종 유틸리티명 비공개.',
    summaryEn: 'HICO America reorder after undisclosed U.S. utility award.',
    quotedKo: '765kV Transformer and Reactor Purchase Agreement',
  },
  {
    id: 'contract:iljin-20260511-spgroup-cables',
    company: 'krx:103590',
    nameKo: '일진전기 SP Group 230kV 케이블 (NDC418)',
    nameEn: 'Iljin Electric SP Group 230kV cables (NDC418)',
    legalCounterparty: 'utility:spgroup',
    endCustomer: 'utility:spgroup',
    counterpartyDisclosure: 'named',
    equipmentType: 'equipment:cable',
    region: 'region:southeast_asia',
    value: 108700000000,
    effectiveFrom: '2026-05-11',
    validTo: '2028-12-31',
    contractDate: '2026-05-11',
    announcementDate: '2026-05-12',
    rcp: '20260512800198',
    summaryKo: '싱가포르 전력청(SP Group) 230kV 케이블 공급·설치.',
    summaryEn: '230kV cable supply/installation to SP Group Singapore.',
    quotedKo: 'SUPPLY AND INSTALLATION OF 230KV POWER CABLES',
  },
  {
    id: 'contract:sanil-20260430-bloom-dc',
    company: 'krx:062040',
    nameKo: '산일전기 Bloom Energy 데이터센터 변압기',
    nameEn: 'Sanil Electric Bloom Energy data center transformers',
    legalCounterparty: 'organization:bloom_energy',
    endCustomer: 'organization:bloom_energy',
    counterpartyDisclosure: 'named',
    equipmentType: 'equipment:distribution_transformer',
    region: 'region:north_america',
    value: 50277275000,
    effectiveFrom: '2026-04-24',
    validTo: '2027-03-29',
    contractDate: '2026-04-30',
    announcementDate: '2026-04-30',
    rcp: '20260430800407',
    summaryKo: 'Bloom Energy 발주 미국 데이터센터용 변압기 공급.',
    summaryEn: 'U.S. data center transformers for Bloom Energy.',
    quotedKo: '미국 Data Center용 변압기 공급',
  },
  {
    id: 'contract:sanil-20260619-eu-bess',
    company: 'krx:062040',
    nameKo: '산일전기 유럽 BESS·신재생용 변압기',
    nameEn: 'Sanil Electric Europe BESS/renewable transformers',
    legalCounterparty: 'counterparty:undisclosed_europe_grid',
    endCustomer: 'counterparty:undisclosed_europe_grid',
    counterpartyDisclosure: 'undisclosed',
    equipmentType: 'equipment:distribution_transformer',
    region: 'region:europe',
    value: 42600000000,
    effectiveFrom: '2026-06-19',
    validTo: '2031-12-07',
    contractDate: '2026-06-19',
    announcementDate: '2026-06-22',
    rcp: '20260622800670',
    summaryKo: '유럽 BESS·신재생용 변압기. 계약 상대 미공개.',
    summaryEn: 'Europe BESS/renewable transformers; counterparty undisclosed.',
    quotedKo: 'BESS, 신재생용 변압기 공급',
  },
];

for (const c of NEW_CONTRACTS) {
  const contractStatus = c.contractStatus || 'effective';
  const nodeStatus = c.status || contractStatus;
  upsertNode({
    id: c.id,
    type: 'contract',
    contractId: c.id,
    contractNameKo: c.nameKo,
    contractNameEn: c.nameEn,
    nameKo: c.nameKo,
    nameEn: c.nameEn,
    role: 'contract',
    lane: 'demand_overseas',
    filer: c.company,
    legalCounterparty: c.legalCounterparty,
    endCustomer: c.endCustomer,
    counterpartyDisclosure: c.counterpartyDisclosure,
    equipmentType: c.equipmentType,
    projectRegion: c.region,
    announcementDate: c.announcementDate,
    contractDate: c.contractDate,
    effectiveFrom: c.effectiveFrom,
    validTo: c.validTo,
    contractValue: c.value,
    currency: 'KRW',
    contractStatus,
    originalReceiptNo: c.rcp,
    latestReceiptNo: c.rcp,
    correctionReceiptNos: [],
    originalAnnouncementDate: c.announcementDate,
    latestUpdateDate: c.announcementDate,
    correctionReviewStatus: 'reviewed',
    status: nodeStatus,
    lastVerifiedAt: AS_OF,
  });

  addEdge({
    id: `award-${c.id.replace('contract:', '')}`,
    source: c.company,
    target: c.id,
    type: 'awarded_contract',
    direction: 'source_to_target',
    status: 'reported',
    labelKo: contractStatus === 'completed' ? '단일판매·공급계약(완료)' : '단일판매·공급계약',
    labelEn: contractStatus === 'completed' ? 'Supply contract (completed)' : 'Major supply contract disclosed',
    defaultHidden: contractStatus === 'completed',
    confidence: 'high',
    asOf: c.announcementDate,
    edgeOrigin: 'manuallyCurated',
    lastVerifiedAt: AS_OF,
    countAsContractBusiness: true,
    evidence: [mkEv({
      title: `${c.nameKo} (rcpNo=${c.rcp})`,
      url: dartUrl(c.rcp),
      publishedAt: c.announcementDate,
      evidenceSummaryKo: c.summaryKo,
      evidenceSummaryEn: c.summaryEn,
      quotedFactKo: c.quotedKo,
      relationshipSupported: `${c.company} awarded_contract ${c.id}`,
      originalReceiptNo: c.rcp,
      latestReceiptNo: c.rcp,
    })],
  }, `Phase 4A.1 new contract ${c.id}`);

  addEdge({
    id: `legal-${c.id.replace('contract:', '')}`,
    source: c.id,
    target: c.legalCounterparty,
    type: c.equipmentType.includes('cable') ? 'supplies_cable_to' : 'supplies_equipment_to',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '법적 계약 상대',
    labelEn: 'Legal counterparty',
    defaultHidden: false,
    edgeOrigin: 'manuallyCurated',
    lastVerifiedAt: AS_OF,
    countAsContractBusiness: false,
    evidence: [mkEv({
      title: `Legal counterparty — ${c.nameKo}`,
      url: dartUrl(c.rcp),
      publishedAt: c.announcementDate,
      evidenceSummaryKo: '공시 계약상대(법적).',
      evidenceSummaryEn: 'Disclosed legal counterparty.',
      relationshipSupported: `${c.id} legal counterparty ${c.legalCounterparty}`,
      originalReceiptNo: c.rcp,
      latestReceiptNo: c.rcp,
    })],
  }, 'contract legal counterparty link');

  addEdge({
    id: `region-${c.id.replace('contract:', '')}`,
    source: c.id,
    target: c.region,
    type: 'located_in',
    direction: 'source_to_target',
    status: 'reference',
    defaultHidden: false,
    edgeOrigin: 'manuallyCurated',
    lastVerifiedAt: AS_OF,
    countAsContractBusiness: false,
    evidence: [mkEv({
      title: `Supply region — ${c.nameKo}`,
      url: dartUrl(c.rcp),
      publishedAt: c.announcementDate,
      evidenceSummaryKo: '공시 공급지역.',
      evidenceSummaryEn: 'Disclosed supply region.',
      relationshipSupported: `${c.id} located_in ${c.region}`,
      originalReceiptNo: c.rcp,
      latestReceiptNo: c.rcp,
    })],
  }, 'contract region');
}

// ——— Reclassify / remove legacy Phase 4A edges ———
removeEdge('cable-001440-kahramaa', 'duplicate direct supply; use contract→utility path');
removeEdge('supplier-001440-qatar', 'duplicate project_supplier; canonical path is awarded_contract→contract');

patchEdge('award-001440-kahramaa-loa', {
  id: 'award-001440-gtc-1217a',
  target: taihanNewId,
  status: 'reported',
  labelKo: '카타르 EHV 케이블 공급계약',
  labelEn: 'Qatar EHV cable supply contract',
  asOf: '2025-11-20',
  evidence: [mkEv({
    title: '대한전선 GTC/1217A/2024 정식 공급계약 (rcpNo=20251120800410)',
    url: dartUrl('20251120800410'),
    publishedAt: '2025-11-20',
    evidenceSummaryKo: '2025.8.25 LOA 후 2025.11.20 KAHRAMAA와 정식 단일판매·공급계약 체결.',
    evidenceSummaryEn: 'LOA 2025-08-25; formal supply contract with KAHRAMAA on 2025-11-20.',
    quotedFactKo: 'GTC/1217A/2024 … Full-Turnkey',
    relationshipSupported: `krx:001440 awarded_contract ${taihanNewId}`,
    originalReceiptNo: '20250825800543',
    latestReceiptNo: '20251120800410',
    correctionReceiptNos: ['20250924800002'],
  })],
}, 'Taihan LOA→formal contract chain updated');

patchEdge('award-267260-hde-20260507', {
  status: 'reported',
  evidence: [mkEv({
    title: 'HD현대일렉트릭 단일판매·공급계약 (rcpNo=20260507800238)',
    url: dartUrl('20260507800238'),
    publishedAt: '2026-05-07',
    evidenceSummaryKo: '765kV 변압기·리액터 ~1,730억원. 미국 자회사 경유, 최종 유틸리티 비공개.',
    evidenceSummaryEn: '~KRW 173bn 765kV transformer/reactor via U.S. sub; end utility undisclosed.',
    quotedFactKo: '765KV 초고압 변압기 및 리액터',
    relationshipSupported: 'krx:267260 awarded_contract contract:hde-20260507-us-transformer',
    originalReceiptNo: '20260507800238',
    latestReceiptNo: '20260507800238',
  })],
}, 'HDHE contract evidence enriched');

for (const id of ['supply-hde-undisclosed-us', 'located-hde-na', 'owner-kahramaa-qatar', 'located-qatar-me']) {
  patchEdge(id, {
    status: 'reference',
    countAsContractBusiness: false,
    defaultHidden: false,
  }, 'demote auxiliary contract link to structural reference');
}

addEdge({
  id: 'legal-hde-us-sub',
  source: 'contract:hde-20260507-us-transformer',
  target: 'kr:hd_hyundai_electric_us',
  type: 'supplies_equipment_to',
  direction: 'source_to_target',
  status: 'reference',
  labelKo: '법적 계약 경로(미국 자회사)',
  labelEn: 'Legal contract path (U.S. subsidiary)',
  defaultHidden: false,
  edgeOrigin: 'manuallyCurated',
  lastVerifiedAt: AS_OF,
  countAsContractBusiness: false,
  evidence: [mkEv({
    title: 'HD현대일렉트릭 — 미국 자회사 경유',
    url: dartUrl('20260507800238'),
    publishedAt: '2026-05-07',
    evidenceSummaryKo: '공시: 미국 자회사 경유 공급. 최종 유틸리티명 미공개.',
    evidenceSummaryEn: 'Disclosure: via U.S. subsidiary; end utility not named.',
    relationshipSupported: 'contract:hde-20260507-us-transformer legal kr:hd_hyundai_electric_us',
    originalReceiptNo: '20260507800238',
    latestReceiptNo: '20260507800238',
  })],
}, 'HDHE legal subsidiary path');

addEdge({
  id: 'end-hde-undisclosed-utility',
  source: 'contract:hde-20260507-us-transformer',
  target: 'counterparty:undisclosed_us_utility',
  type: 'supplies_transformer_to',
  direction: 'source_to_target',
  status: 'reference',
  labelKo: '최종 수요(비공개 유틸리티)',
  labelEn: 'End demand (undisclosed utility)',
  defaultHidden: false,
  edgeOrigin: 'manuallyCurated',
  lastVerifiedAt: AS_OF,
  countAsContractBusiness: false,
  evidence: [mkEv({
    title: 'HD현대일렉트릭 — 최종 발주처 비공개',
    url: dartUrl('20260507800238'),
    publishedAt: '2026-05-07',
    evidenceSummaryKo: '공급지역 미국. 최종 유틸리티 상호 미기재.',
    evidenceSummaryEn: 'U.S. region; end utility legal name not disclosed.',
    relationshipSupported: 'contract:hde-20260507-us-transformer end counterparty:undisclosed_us_utility',
    originalReceiptNo: '20260507800238',
    latestReceiptNo: '20260507800238',
  })],
}, 'HDHE anonymous end utility (not duplicate business edge)');

removeEdge('supply-hde-undisclosed-us', 'replaced by end-hde-undisclosed-utility reference edge');

addEdge({
  id: 'legal-taihan-kahramaa',
  source: taihanNewId,
  target: 'utility:kahramaa',
  type: 'supplies_cable_to',
  direction: 'source_to_target',
  status: 'reference',
  labelKo: '발주처 KAHRAMAA',
  labelEn: 'Counterparty KAHRAMAA',
  defaultHidden: false,
  edgeOrigin: 'manuallyCurated',
  lastVerifiedAt: AS_OF,
  countAsContractBusiness: false,
  evidence: [mkEv({
    title: '대한전선 — KAHRAMAA 정식 계약',
    url: dartUrl('20251120800410'),
    publishedAt: '2025-11-20',
    evidenceSummaryKo: '정식 계약 상대: Qatar General Electricity & Water Corporation.',
    evidenceSummaryEn: 'Formal counterparty: KAHRAMAA.',
    relationshipSupported: `${taihanNewId} legal utility:kahramaa`,
    originalReceiptNo: '20250825800543',
    latestReceiptNo: '20251120800410',
    correctionReceiptNos: ['20250924800002'],
  })],
}, 'Taihan legal counterparty KAHRAMAA');

addEdge({
  id: 'contract-taihan-project',
  source: taihanNewId,
  target: 'project:qatar-gtc-1217a-2024',
  type: 'participates_in',
  direction: 'source_to_target',
  status: 'reference',
  defaultHidden: false,
  edgeOrigin: 'manuallyCurated',
  lastVerifiedAt: AS_OF,
  countAsContractBusiness: false,
  evidence: [mkEv({
    title: 'GTC/1217A/2024 project link',
    url: dartUrl('20251120800410'),
    publishedAt: '2025-11-20',
    evidenceSummaryKo: 'GTC/1217A/2024 프로젝트.',
    evidenceSummaryEn: 'GTC/1217A/2024 project.',
    relationshipSupported: `${taihanNewId} participates_in project:qatar-gtc-1217a-2024`,
    originalReceiptNo: '20250825800543',
    latestReceiptNo: '20251120800410',
    correctionReceiptNos: ['20250924800002'],
  })],
}, 'Taihan contract→project');

// Mark all awarded_contract edges
for (const e of edges) {
  if (e.type === 'awarded_contract') {
    e.countAsContractBusiness = true;
    if (e.status === 'reported' || e.status === 'confirmed') {
      e.edgeOrigin = e.edgeOrigin || 'manuallyCurated';
    }
  }
}

// KEPCO policy: listed as krx:015760 only — no duplicate utility node
if (nodeById.get('utility:kepco')) {
  const idx = nodes.findIndex((n) => n.id === 'utility:kepco');
  if (idx >= 0) nodes.splice(idx, 1);
  logChange({
    edgeId: null,
    beforeStatus: 'exists',
    afterStatus: 'removed',
    beforeType: 'utility:kepco',
    afterType: 'removed',
    reason: 'cp_list listed KEPCO uses krx:015760 — no duplicate utility node',
  });
}

const contractMetrics = computePowergridContractMetrics({ nodes, edges });
const orphan = computeListedRelationOrphanMetrics({ nodes, edges });

const BUSINESS = new Set([
  'supplies_transformer_to', 'supplies_cable_to', 'supplies_switchgear_to', 'supplies_equipment_to',
  'awarded_contract', 'project_supplier', 'epc_for', 'consortium_member',
  'project_owner', 'project_operator', 'participates_in',
]);

network.metrics = {
  ...network.metrics,
  ...contractMetrics,
  businessRelationOrphanCount: orphan.businessRelationOrphanCount,
  directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
  classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
  confirmedBusinessEdgeCount: edges.filter((e) => BUSINESS.has(e.type) && e.status === 'confirmed').length,
  reportedBusinessEdgeCount: edges.filter((e) => e.type === 'awarded_contract' && e.status === 'reported').length,
  phase4a1CuratedAt: AS_OF,
};

network.lastReviewedAt = AS_OF;

const report = validateNetworkReport(network, { sectorKey: 'powergrid' });
fs.writeFileSync(NET, JSON.stringify(network, null, 2), 'utf8');
fs.writeFileSync(CHANGELOG, JSON.stringify({
  asOf: AS_OF,
  phase: '4A.1',
  changelog,
  contractMetrics,
  orphan,
  validate: { failures: report.failures, warnings: report.warnings },
}, null, 2), 'utf8');

console.log(JSON.stringify({
  nodes: nodes.length,
  edges: edges.length,
  contractMetrics,
  orphan,
  failures: report.failures,
  warnings: report.warnings,
}, null, 2));

if (report.failures.length) process.exit(1);
