/**
 * Phase 4B.1 — Nuclear project status, canonical entity, and role corrections.
 * Does not change cp_list (7 listed). No new mass projects. No UI features.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeNuclearProjectMetrics } from '../lib/relation_network/nuclear_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase4b1';
const NET_FP = join(ROOT, 'data', 'networks', 'nuclear.json');
const LOG_FP = join(ROOT, 'data', 'nuclear_relation_phase4b1_changelog.json');

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
}

function remapsourceTarget(oldId, newId) {
  for (const e of edges) {
    if (e.source === oldId) e.source = newId;
    if (e.target === oldId) e.target = newId;
  }
  for (const n of nodes) {
    if (Array.isArray(n.memberIds)) {
      n.memberIds = n.memberIds.map((id) => (id === oldId ? newId : id));
    }
    if (n.roleByMember && n.roleByMember[oldId]) {
      n.roleByMember[newId] = n.roleByMember[oldId];
      delete n.roleByMember[oldId];
    }
    if (n.leadEntity === oldId) n.leadEntity = newId;
    if (n.ownerOrgId === oldId) n.ownerOrgId = newId;
    if (n.operatorId === oldId) n.operatorId = newId;
    if (n.projectId === oldId) n.projectId = newId;
    if (n.reactorTechnologyId === oldId) n.reactorTechnologyId = newId;
  }
}

function replaceNodeId(oldId, newNode) {
  const idx = nodes.findIndex((n) => n.id === oldId);
  if (idx < 0) return false;
  const prev = nodes[idx];
  remapsourceTarget(oldId, newNode.id);
  nodes[idx] = { ...prev, ...newNode, aliases: [...new Set([...(prev.aliases || []), oldId, ...(newNode.aliases || [])])] };
  nodeById.delete(oldId);
  nodeById.set(newNode.id, nodes[idx]);
  log({
    nodeOrEdgeId: newNode.id,
    previousEntityId: oldId,
    nextEntityId: newNode.id,
    previousType: prev.type,
    nextType: newNode.type,
    previousEditorialStatus: null,
    nextEditorialStatus: null,
    previousProjectStatus: prev.projectStatus || null,
    nextProjectStatus: newNode.projectStatus || null,
    previousContractStatus: prev.contractStatus || null,
    nextContractStatus: newNode.contractStatus || null,
    previousRole: prev.role || null,
    nextRole: newNode.role || null,
    reason: `canonical remap ${oldId} → ${newNode.id}`,
    evidenceUrls: [],
  });
  return true;
}

function upsertNode(n) {
  const i = nodes.findIndex((x) => x.id === n.id);
  if (i >= 0) nodes[i] = { ...nodes[i], ...n };
  else nodes.push(n);
  nodeById.set(n.id, nodes[i >= 0 ? i : nodes.length - 1]);
}

function findEdge(id) {
  return edges.find((e) => e.id === id);
}

function setEdge(id, patch, reason, evidenceUrls = []) {
  const e = findEdge(id);
  if (!e) return;
  const prev = { ...e };
  Object.assign(e, patch);
  log({
    nodeOrEdgeId: id,
    previousEntityId: prev.source,
    nextEntityId: e.source,
    previousType: prev.type,
    nextType: e.type,
    previousEditorialStatus: prev.editorialStatus || prev.status,
    nextEditorialStatus: e.editorialStatus || e.status,
    previousProjectStatus: prev.projectStatus || null,
    nextProjectStatus: e.projectStatus || null,
    previousContractStatus: prev.contractStatus || null,
    nextContractStatus: e.contractStatus || null,
    previousRole: prev.type,
    nextRole: e.type,
    reason,
    evidenceUrls,
  });
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
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt || null,
    evidenceSummaryKo: p.evidenceSummaryKo || '',
    evidenceSummaryEn: p.evidenceSummaryEn || '',
    quotedFactKo: p.quotedFactKo || '',
    relationshipSupported: p.relationshipSupported || '',
  };
}

const MPO_DUKOVANY = 'https://mpo.gov.cz/cz/rozcestnik/pro-media/tiskove-zpravy/rok-od-podpisu-smlouvy-na-nove-bloky-v-dukovanech-priprava-vystavby-bezi-naplno-a-podle-planu--293557/';
const KPS_NUCLEAR = 'https://www.kps.co.kr/eng/business/techservice/nuclear.do';
const KPS_OVERSEAS = 'https://www.kps.co.kr/eng/business/overseas.do';
const NAWAH = 'https://www.nawah.ae/';
const ENEC_BARAKAH = 'https://www.enec.gov.ae/barakah-plant/';

// —— 5. KEPCO canonical: public:kepco → krx:015760 ——
replaceNodeId('public:kepco', {
  id: 'krx:015760',
  type: 'listed_company',
  ticker: '015760',
  nameKo: '한국전력공사',
  nameEn: 'Korea Electric Power Corporation (KEPCO)',
  market: 'KOSPI',
  isListedKorea: true,
  isMapConstituent: false,
  entityRole: 'listed_reference_company',
  excludeFromMapCompanyCount: true,
  excludeFromDefaultMcapScale: true,
  graphOnly: true,
  role: 'export_lead',
  lane: 'export_epc_design',
  noteKo: '상장 참고기업(015760). nuclear cp_list·기업 수·히트맵에 포함하지 않음.',
  noteEn: 'Listed reference company (015760). Not in nuclear cp_list, map count, or heatmap.',
  panelNoteKo: '상장 참고기업 · 이 섹터 구성종목 아님',
  panelNoteEn: 'Listed reference — not a map constituent of this sector',
  aliases: ['public:kepco', 'kepco'],
});

// —— 6. KHNP: operator:khnp → kr:khnp ——
replaceNodeId('operator:khnp', {
  id: 'kr:khnp',
  type: 'operator',
  nameKo: '한국수력원자력',
  nameEn: 'Korea Hydro & Nuclear Power (KHNP)',
  isListedKorea: false,
  isMapConstituent: false,
  entityKind: 'domestic_unlisted_company',
  role: 'operator',
  lane: 'owner_operator',
  aliases: ['operator:khnp', 'khnp'],
  noteKo: '비상장 공기업·원전 운영사. KEPCO(015760)와 별도 법인.',
  noteEn: 'Unlisted public nuclear operator — distinct from KEPCO (015760).',
});

// Optional soft affiliation (reference only — no verified stakePct in this pass)
if (!edges.some((e) => e.source === 'krx:015760' && e.target === 'kr:khnp' && e.type === 'reference')) {
  edges.push({
    id: 'e-kepco-khnp-affiliation',
    source: 'krx:015760',
    target: 'kr:khnp',
    type: 'reference',
    status: 'reference',
    editorialStatus: 'reference',
    relationClass: 'reference',
    confidence: 'medium',
    asOf: AS_OF,
    defaultHidden: true,
    reviewStatus: 'needs_human_review',
    directEvidence: false,
    noteKo: '모회사·자회사 계열 참고. 지분율·기준일 미검증으로 owns 미사용.',
    noteEn: 'Group affiliation reference only — owns not asserted without verified stakePct/asOf.',
    evidence: [mkEv({
      title: 'KEPCO–KHNP corporate relationship (affiliation reference)',
      url: 'https://home.kepco.co.kr/',
      sourceType: 'company_ir',
      evidenceUsageType: 'general_business_page',
      evidenceSummaryKo: '한전·한수원 계열 관계는 참고로만 표시. 지분율 미검증.',
      evidenceSummaryEn: 'KEPCO–KHNP affiliation shown as reference only; stake not verified here.',
      relationshipSupported: 'group_affiliation',
    })],
  });
  log({
    nodeOrEdgeId: 'e-kepco-khnp-affiliation',
    previousEntityId: null,
    nextEntityId: 'krx:015760→kr:khnp',
    previousType: null,
    nextType: 'reference',
    previousEditorialStatus: null,
    nextEditorialStatus: 'reference',
    previousProjectStatus: null,
    nextProjectStatus: null,
    previousContractStatus: null,
    nextContractStatus: null,
    previousRole: null,
    nextRole: 'reference',
    reason: 'affiliation reference without confirmed owns stake',
    evidenceUrls: ['https://home.kepco.co.kr/'],
  });
}

// —— APR1000 reactor tech for Dukovany ——
upsertNode({
  id: 'reactor:apr1000',
  type: 'reactor_technology',
  nameKo: 'APR1000',
  nameEn: 'APR1000',
  role: 'reactor_technology',
  lane: 'nsss_reactor',
  reactorFamily: 'APR1000',
});

upsertNode({
  id: 'government:cz',
  type: 'government',
  nameKo: '체코 정부',
  nameEn: 'Government of Czechia',
  role: 'government',
  lane: 'overseas_project',
  isListedKorea: false,
});

upsertNode({
  id: 'org:edu_ii',
  type: 'organization',
  nameKo: 'Elektrárna Dukovany II (EDU II)',
  nameEn: 'Elektrárna Dukovany II (EDU II)',
  role: 'project_owner',
  lane: 'overseas_project',
  isListedKorea: false,
  noteKo: '체코 국영 발주사. ČEZ와 별도 법인으로 취급.',
  noteEn: 'Czech state project company — distinct from ČEZ as contracting owner.',
});

upsertNode({
  id: 'org:nawah',
  type: 'organization',
  nameKo: 'Nawah Energy Company',
  nameEn: 'Nawah Energy Company',
  role: 'operator',
  lane: 'overseas_project',
  isListedKorea: false,
  noteKo: '바라카 운영 라이선스 보유 운영사(ENEC·KEPCO JV).',
  noteEn: 'Barakah operating-license holder (ENEC–KEPCO JV).',
});

// —— 10. Domestic APR1400: project → ecosystem ——
replaceNodeId('nuclear-project:domestic-apr1400-ecosystem', {
  id: 'ecosystem:apr1400-domestic',
  type: 'ecosystem',
  nameKo: '국내 APR1400 생태계(구조)',
  nameEn: 'Domestic APR1400 ecosystem (structural)',
  role: 'ecosystem',
  lane: 'owner_operator',
  countryCode: 'KR',
  reactorTechnologyId: 'reactor:apr1400',
  scope: 'domestic',
  isStructuralBundle: true,
  projectStatus: null,
  contractStatus: null,
  noteKo: '특정 호기 수주가 아닌 국내 APR1400 공급·운영 구조 노드. uniqueActualProjectCount 제외.',
  noteEn: 'Structural ecosystem — not a unit award; excluded from uniqueActualProjectCount.',
  asOf: AS_OF,
});

replaceNodeId('nuclear-project:khnp-domestic-om', {
  id: 'ecosystem:khnp-domestic-om',
  type: 'ecosystem',
  nameKo: '한수원 국내 원전 운영·정비(구조)',
  nameEn: 'KHNP domestic fleet O&M (structural)',
  role: 'ecosystem',
  lane: 'fuel_maintenance',
  countryCode: 'KR',
  operatorId: 'kr:khnp',
  scope: 'om',
  isStructuralBundle: true,
  projectStatus: null,
  contractStatus: null,
  noteKo: '가동 원전 O&M 구조. 신규 수주·개별 호기 계약이 아님.',
  noteEn: 'Operating-fleet O&M structure — not a newbuild award.',
  asOf: AS_OF,
});

// Downgrade ecosystem-linked “project role” edges to structural reference where needed
for (const e of edges) {
  if (e.target === 'ecosystem:apr1400-domestic' || e.source === 'ecosystem:apr1400-domestic'
    || e.target === 'ecosystem:khnp-domestic-om' || e.source === 'ecosystem:khnp-domestic-om') {
    const prevPs = e.projectStatus;
    e.relationClass = 'structural';
    e.editorialStatus = e.editorialStatus === 'reported' && /operates|maintains/.test(e.type) ? 'reported' : 'reference';
    e.status = e.editorialStatus;
    e.projectStatus = undefined;
    e.evidenceUsageType = 'official_role_page';
    if ((e.evidence || [])[0]) e.evidence[0].evidenceUsageType = 'official_role_page';
    log({
      nodeOrEdgeId: e.id,
      previousEntityId: e.source,
      nextEntityId: e.target,
      previousType: e.type,
      nextType: e.type,
      previousEditorialStatus: 'reported',
      nextEditorialStatus: e.editorialStatus,
      previousProjectStatus: prevPs || null,
      nextProjectStatus: null,
      previousContractStatus: null,
      nextContractStatus: null,
      previousRole: e.type,
      nextRole: e.type,
      reason: 'ecosystem structural — not counted as project award',
      evidenceUrls: (e.evidence || []).map((ev) => ev.url),
    });
  }
}

// KPS domestic O&M evidence → official nuclear maintenance page
setEdge('e-om-051600', {
  status: 'reported',
  editorialStatus: 'reported',
  relationClass: 'structural',
  projectStatus: undefined,
  directEvidence: true,
  evidenceUsageType: 'official_role_page',
  lastVerifiedAt: AS_OF,
  evidence: [mkEv({
    title: 'KEPCO KPS Nuclear Power Maintenance Engineering Center',
    url: KPS_NUCLEAR,
    sourceType: 'company_ir',
    evidenceUsageType: 'official_role_page',
    directEvidence: true,
    publishedAt: '2026-08-23',
    evidenceSummaryKo: '한전KPS 원자력정비기술센터: 검사·진단·계획예방정비·시운전 정비 역량(구조 역할). 특정 호기 신규 수주 아님.',
    evidenceSummaryEn: 'KEPCO KPS Nuclear Maintenance Engineering Center: inspection/diagnosis/outage/commissioning maintenance capability (structural role).',
    relationshipSupported: 'maintains',
  })],
}, 'KPS structural maintenance role via official nuclear tech page', [KPS_NUCLEAR]);

setEdge('e-dom-apr-051600-maintains', {
  status: 'reference',
  editorialStatus: 'reference',
  relationClass: 'structural',
  projectStatus: undefined,
  evidenceUsageType: 'official_role_page',
  evidence: [mkEv({
    title: 'KEPCO KPS nuclear maintenance capability',
    url: KPS_NUCLEAR,
    sourceType: 'company_ir',
    evidenceUsageType: 'official_role_page',
    evidenceSummaryKo: '국내 APR1400 생태계 내 정비 역할(구조).',
    evidenceSummaryEn: 'Maintenance role within domestic APR1400 ecosystem (structural).',
    relationshipSupported: 'maintains',
  })],
}, 'APR1400 ecosystem maintenance uses official_role_page', [KPS_NUCLEAR]);

// —— 2–4. Dukovany correction ——
replaceNodeId('nuclear-project:czechia-dukovany5', {
  id: 'nuclear-project:dukovany-new-build',
  type: 'nuclear_project',
  nameKo: '체코 두코바니 신규 원전(5·6호기)',
  nameEn: 'Czech Dukovany new build (Units 5 & 6)',
  role: 'nuclear_project',
  lane: 'overseas_project',
  countryCode: 'CZ',
  ownerOrgId: 'org:edu_ii',
  operatorId: null,
  reactorTechnologyId: 'reactor:apr1000',
  unitCount: 2,
  projectStatus: 'design',
  contractStatus: 'effective',
  contractSigned: true,
  scope: 'overseas',
  constructionStartExpected: '2029',
  valueType: 'undisclosed',
  asOf: AS_OF,
  noteKo: 'EDU II–KHNP 본계약 체결 후 약 4년 준비단계(설계·인허가·인프라). 2029년 착공 예정. selected_bidder 아님.',
  noteEn: 'After EDU II–KHNP contract signing: ~4-year prep (design/licensing/infra). Construction expected 2029 — not selected_bidder.',
});

// Update consortium projectId
const consort = nodeById.get('consortium:czechia-dukovany');
if (consort) {
  consort.projectId = 'nuclear-project:dukovany-new-build';
  consort.leadEntity = 'kr:khnp';
  consort.memberIds = ['kr:khnp', 'krx:034020', 'krx:052690', 'krx:015760'];
  consort.roleByMember = {
    'kr:khnp': 'epc',
    'krx:034020': 'planned_supplier',
    'krx:052690': 'planned_design_partner',
    'krx:015760': 'export_support',
  };
  consort.asOf = AS_OF;
  consort.noteKo = 'KHNP가 EPC 계약 당사자. 두산·한전기술·한전은 Team Korea/예정 공급·지원으로 개별 본계약 자동 승격 금지.';
  consort.noteEn = 'KHNP is EPC counterparty; Doosan/KEPCO E&C/KEPCO remain planned/support — not auto-confirmed suppliers.';
}

// government oversees
if (!edges.some((e) => e.id === 'e-cz-gov-oversees')) {
  edges.push({
    id: 'e-cz-gov-oversees',
    source: 'government:cz',
    target: 'nuclear-project:dukovany-new-build',
    type: 'reference',
    status: 'reported',
    editorialStatus: 'reported',
    relationClass: 'business',
    projectStatus: 'design',
    contractStatus: 'effective',
    asOf: AS_OF,
    defaultHidden: false,
    reviewStatus: 'needs_human_review',
    directEvidence: true,
    lastVerifiedAt: AS_OF,
    evidence: [mkEv({
      title: 'MPO: one year after Dukovany contract signing',
      url: MPO_DUKOVANY,
      sourceType: 'government',
      evidenceUsageType: 'exact_project_document',
      directEvidence: true,
      publishedAt: '2026-06-17',
      evidenceSummaryKo: '체코 산업통상부가 EDU II–KHNP 계약 1년 성과·준비단계 진행을 공식 발표.',
      evidenceSummaryEn: 'Czech MPO officially reports progress one year after EDU II–KHNP contract signing.',
      relationshipSupported: 'government_oversight',
    })],
  });
}

setEdge('e-cz-cez-owner', {
  // demote ČEZ as contracting owner; keep as reference affiliation to project context
  type: 'reference',
  status: 'reference',
  editorialStatus: 'reference',
  relationClass: 'reference',
  projectStatus: 'design',
  contractStatus: 'effective',
  defaultHidden: true,
  noteKo: 'ČEZ 그룹 맥락 참고. 본계약 발주사는 EDU II.',
  noteEn: 'ČEZ group context only — contracting owner is EDU II.',
  evidence: [mkEv({
    title: 'EDU II is contracting owner (MPO)',
    url: MPO_DUKOVANY,
    sourceType: 'government',
    evidenceUsageType: 'exact_project_document',
    evidenceSummaryKo: '공식 계약 당사 발주사는 EDU II. ČEZ를 project_owner로 유지하지 않음.',
    evidenceSummaryEn: 'Contracting owner is EDU II; ČEZ not kept as project_owner.',
    relationshipSupported: 'reference',
  })],
}, 'ČEZ demoted; EDU II is project owner', [MPO_DUKOVANY]);

if (!edges.some((e) => e.id === 'e-cz-edu-owner')) {
  edges.push({
    id: 'e-cz-edu-owner',
    source: 'org:edu_ii',
    target: 'nuclear-project:dukovany-new-build',
    type: 'project_owner',
    status: 'reported',
    editorialStatus: 'reported',
    relationClass: 'business',
    projectStatus: 'design',
    contractStatus: 'effective',
    asOf: AS_OF,
    defaultHidden: false,
    reviewStatus: 'needs_human_review',
    directEvidence: true,
    lastVerifiedAt: AS_OF,
    evidence: [mkEv({
      title: 'EDU II–KHNP Dukovany contract (MPO)',
      url: MPO_DUKOVANY,
      sourceType: 'government',
      evidenceUsageType: 'exact_project_document',
      directEvidence: true,
      publishedAt: '2026-06-17',
      evidenceSummaryKo: 'Elektrárna Dukovany II가 두 개 신규 원전 블록 계약 발주사.',
      evidenceSummaryEn: 'Elektrárna Dukovany II is the contracting project owner for two new units.',
      relationshipSupported: 'project_owner',
    })],
  });
  log({
    nodeOrEdgeId: 'e-cz-edu-owner',
    previousEntityId: 'org:cez',
    nextEntityId: 'org:edu_ii',
    previousType: 'project_owner',
    nextType: 'project_owner',
    previousEditorialStatus: 'reported',
    nextEditorialStatus: 'reported',
    previousProjectStatus: 'selected_bidder',
    nextProjectStatus: 'design',
    previousContractStatus: null,
    nextContractStatus: 'effective',
    previousRole: 'project_owner',
    nextRole: 'project_owner',
    reason: 'EDU II is official contracting owner per MPO',
    evidenceUrls: [MPO_DUKOVANY],
  });
}

// KHNP: selected_for → epc_for
setEdge('e-cz-khnp-selected', {
  id: 'e-cz-khnp-epc',
  type: 'epc_for',
  status: 'reported',
  editorialStatus: 'reported',
  relationClass: 'business',
  projectStatus: 'design',
  contractStatus: 'effective',
  directEvidence: true,
  lastVerifiedAt: AS_OF,
  noteKo: 'KHNP는 EPC/공급 계약 상대. 미래 발전소 운영사(project_operator)가 아님.',
  noteEn: 'KHNP is EPC/supplier counterparty — not future plant operator.',
  evidence: [mkEv({
    title: 'EDU II–KHNP contract — preparatory design/licensing phase',
    url: MPO_DUKOVANY,
    sourceType: 'government',
    evidenceUsageType: 'exact_contract_document',
    directEvidence: true,
    publishedAt: '2026-06-17',
    evidenceSummaryKo: 'EDU II와 KHNP 계약 체결 후 1년: 설계·인허가·인프라 준비 단계. 착공 전(2029 예정).',
    evidenceSummaryEn: 'One year after EDU II–KHNP signing: design/licensing/infra prep; construction expected 2029.',
    relationshipSupported: 'epc_for',
  })],
}, 'Dukovany KHNP selected_bidder → epc_for with effective contract', [MPO_DUKOVANY]);
// fix id rename on edge object
{
  const e = findEdge('e-cz-khnp-selected') || findEdge('e-cz-khnp-epc');
  if (e && e.id === 'e-cz-khnp-selected') e.id = 'e-cz-khnp-epc';
}

// Remove preferred_bidder edges (contract signed — not final individual supply contracts)
for (const id of ['e-cz-doosan-pref', 'e-cz-enc-pref']) {
  const e = findEdge(id);
  if (!e) continue;
  e.type = 'reference';
  e.status = 'reference';
  e.editorialStatus = 'reference';
  e.relationClass = 'reference';
  e.projectStatus = 'design';
  e.contractStatus = 'effective';
  e.defaultHidden = true;
  e.noteKo = '본계약 체결 이후에도 개별 기자재 본계약으로 승격하지 않음. 예정 공급·협력 참고.';
  e.noteEn = 'After EPC signing, not promoted to individual supply contracts — planned/partner reference only.';
  e.evidence = [mkEv({
    title: 'Do not auto-promote Team Korea members to confirmed suppliers',
    url: MPO_DUKOVANY,
    sourceType: 'government',
    evidenceUsageType: 'exact_project_document',
    evidenceSummaryKo: 'MPO는 KHNP 계약과 체코 현지 공급 진행을 설명. 두산·한전기술 개별 본계약 자동 확인 아님.',
    evidenceSummaryEn: 'MPO documents KHNP EPC contract; Doosan/KEPCO E&C individual awards not auto-confirmed.',
    relationshipSupported: 'planned_partner_reference',
  })];
  log({
    nodeOrEdgeId: id,
    previousEntityId: e.source,
    nextEntityId: e.target,
    previousType: 'preferred_bidder_for',
    nextType: 'reference',
    previousEditorialStatus: 'reported',
    nextEditorialStatus: 'reference',
    previousProjectStatus: 'selected_bidder',
    nextProjectStatus: 'design',
    previousContractStatus: null,
    nextContractStatus: 'effective',
    previousRole: 'preferred_bidder_for',
    nextRole: 'reference',
    reason: 'contract signed at EPC level — demote preferred_bidder; no auto supplier confirm',
    evidenceUrls: [MPO_DUKOVANY],
  });
}

// Consortium members: keep reported; update projectStatus; do not confirm
for (const e of edges.filter((x) => x.type === 'consortium_member' && x.target === 'consortium:czechia-dukovany')) {
  e.projectStatus = 'design';
  e.contractStatus = 'effective';
  e.status = 'reported';
  e.editorialStatus = 'reported';
  e.defaultHidden = e.source === 'krx:015760';
  e.lastVerifiedAt = AS_OF;
  e.evidence = [mkEv({
    title: 'Team Korea / Dukovany partnership context (MPO)',
    url: MPO_DUKOVANY,
    sourceType: 'government',
    evidenceUsageType: 'exact_project_document',
    directEvidence: true,
    publishedAt: '2026-06-17',
    evidenceSummaryKo: '컨소시엄·Team Korea 맥락. 개별 공급계약 confirmed 승격 금지. KHNP만 EPC 당사자.',
    evidenceSummaryEn: 'Consortium/Team Korea context — no auto-confirm of individual supply awards; KHNP is EPC party.',
    relationshipSupported: 'consortium_member',
  })];
}

// APR1000 used in Dukovany
if (!edges.some((e) => e.id === 'e-apr1000-dukovany')) {
  edges.push({
    id: 'e-apr1000-dukovany',
    source: 'reactor:apr1000',
    target: 'nuclear-project:dukovany-new-build',
    type: 'used_in_reactor',
    status: 'reported',
    editorialStatus: 'reported',
    relationClass: 'structural',
    projectStatus: 'design',
    asOf: AS_OF,
    defaultHidden: false,
    directEvidence: true,
    lastVerifiedAt: AS_OF,
    evidence: [mkEv({
      title: 'APR1000 technology for Dukovany (MPO)',
      url: MPO_DUKOVANY,
      sourceType: 'government',
      evidenceUsageType: 'exact_project_document',
      directEvidence: true,
      publishedAt: '2026-06-17',
      evidenceSummaryKo: '체코 신규 원전에 APR1000 기술 적용이 공식 언급됨.',
      evidenceSummaryEn: 'MPO materials describe APR1000 technology for the Dukovany new build.',
      relationshipSupported: 'reactor_technology',
    })],
  });
}

// —— 8. Barakah ——
{
  const barakah = nodeById.get('nuclear-project:uae-barakah');
  if (barakah) {
    barakah.operatorId = 'org:nawah';
    barakah.ownerOrgId = 'org:enec';
    barakah.projectStatus = 'operating';
    barakah.contractStatus = 'completed'; // historical EPC construction complete; plant operating
    barakah.unitCount = 4;
    barakah.noteKo = '운영 중(Units 1–4). 과거 EPC/수출 계약과 현재 운영·정비를 분리.';
    barakah.noteEn = 'Operating (Units 1–4). Separate historical EPC/export from current O&M.';
    barakah.asOf = AS_OF;
  }
}

if (!edges.some((e) => e.id === 'e-barakah-nawah-operates')) {
  edges.push({
    id: 'e-barakah-nawah-operates',
    source: 'org:nawah',
    target: 'nuclear-project:uae-barakah',
    type: 'operates',
    status: 'reported',
    editorialStatus: 'reported',
    relationClass: 'business',
    projectStatus: 'operating',
    asOf: AS_OF,
    defaultHidden: false,
    reviewStatus: 'needs_human_review',
    directEvidence: true,
    lastVerifiedAt: AS_OF,
    evidence: [mkEv({
      title: 'Nawah operates Barakah Units 1–4',
      url: NAWAH,
      sourceType: 'operator',
      evidenceUsageType: 'exact_project_document',
      directEvidence: true,
      evidenceSummaryKo: 'Nawah가 바라카 1–4호기 운영·정비 라이선스 보유 운영사.',
      evidenceSummaryEn: 'Nawah holds operating licenses and operates/maintains Barakah Units 1–4.',
      relationshipSupported: 'operates',
    })],
  });
}

setEdge('e-barakah-kepco-export', {
  source: 'krx:015760',
  type: 'export_lead',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'operating',
  contractStatus: 'completed',
  relationClass: 'business',
  noteKo: '과거 수출·주계약 주관 사실. 현재 운영사는 Nawah.',
  noteEn: 'Historical export/prime-contractor lead — current operator is Nawah.',
  lastVerifiedAt: AS_OF,
}, 'KEPCO export lead uses krx:015760; historical EPC vs operating status separated', [
  'https://home.kepco.co.kr/kepco/EN/B/htmlView/ENBBHP001.do?menuCd=EN020204',
]);

setEdge('e-barakah-kps-om', {
  type: 'maintains',
  status: 'reported',
  editorialStatus: 'reported',
  projectStatus: 'operating',
  relationClass: 'business',
  directEvidence: true,
  lastVerifiedAt: AS_OF,
  noteKo: '시운전 정비(2013~) 및 계획예방정비 참여. 운영사 아님.',
  noteEn: 'Commissioning maintenance since 2013 and planned-outage services — not the operator.',
  evidence: [mkEv({
    title: 'KEPCO KPS Barakah commissioning & planned outage services',
    url: KPS_OVERSEAS,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    directEvidence: true,
    publishedAt: '2026-08-23',
    evidenceSummaryKo: '한전KPS 해외사업: 바라카 시운전 정비(2013~) 및 계획예방정비 참여를 직접 명시.',
    evidenceSummaryEn: 'KEPCO KPS overseas page explicitly states BNPP commissioning maintenance since 2013 and planned outage services.',
    relationshipSupported: 'maintains',
  })],
}, 'Barakah KPS role uses exact overseas project page', [KPS_OVERSEAS]);

// Doosan/ENC Barakah: keep reported but mark homepage evidence as general_business_page (needs stronger docs)
for (const id of ['e-barakah-doosan-nsss', 'e-barakah-kepcoec-ae']) {
  const e = findEdge(id);
  if (!e) continue;
  e.evidenceUsageType = 'general_business_page';
  e.status = 'reported';
  e.editorialStatus = 'reported';
  e.projectStatus = 'operating';
  e.contractStatus = 'completed';
  e.noteKo = (e.noteKo || '') + ' 홈페이지 근거는 일반 사업페이지 — exact document 추가 검토 필요.';
  if (e.evidence?.[0]) e.evidence[0].evidenceUsageType = 'general_business_page';
  log({
    nodeOrEdgeId: id,
    previousEntityId: e.source,
    nextEntityId: e.target,
    previousType: e.type,
    nextType: e.type,
    previousEditorialStatus: 'reported',
    nextEditorialStatus: 'reported',
    previousProjectStatus: 'operating',
    nextProjectStatus: 'operating',
    previousContractStatus: null,
    nextContractStatus: 'completed',
    previousRole: e.type,
    nextRole: e.type,
    reason: 'homepage evidence marked general_business_page; remains reported pending exact docs',
    evidenceUrls: (e.evidence || []).map((ev) => ev.url),
  });
}

// —— 11. Poland: keep memorandum, default hide ——
{
  const pl = nodeById.get('nuclear-project:poland-nuclear-mou');
  if (pl) {
    pl.projectStatus = 'memorandum';
    pl.contractSigned = false;
    pl.defaultHidden = true;
    pl.noteKo = 'MOU 단계. 본계약 없음. 활성 해외 수주에 포함하지 않음.';
    pl.noteEn = 'MOU stage — no signed contract; not an active overseas order.';
  }
}
for (const id of ['e-pl-khnp-mou', 'e-pl-gov-mou']) {
  setEdge(id, {
    projectStatus: 'memorandum',
    defaultHidden: true,
    evidenceUsageType: 'general_business_page',
    noteKo: '오래된/일반 MOU — 기본 숨김.',
    noteEn: 'MOU — default hidden; not an active order.',
  }, 'Poland MOU defaultHidden; not active contract', []);
}

// —— 12. SMR ——
setEdge('e-smr-doosan-nuscale', {
  projectStatus: 'suspended',
  defaultHidden: true,
  status: 'reported',
  editorialStatus: 'reported',
  noteKo: 'NuScale 협력 이력. 건설 수주 아님. 기본 숨김.',
  noteEn: 'Historical NuScale cooperation — not a construction award; default hidden.',
}, 'NuScale remains suspended/hidden', ['https://www.nuscalepower.com/']);

// i-SMR stays technology edges (already on smr:korea-ismr), ensure not counted as project
for (const id of ['e-smr-doosan-ismr', 'e-smr-enc-ismr']) {
  const e = findEdge(id);
  if (!e) continue;
  e.relationClass = e.relationClass || 'business';
  e.projectStatus = 'design';
  e.noteKo = 'i-SMR 기술개발 — 실증·건설 프로젝트 아님.';
  e.noteEn = 'i-SMR technology development — not a construction/demo project node.';
}

// Ensure no confirmed auto-promotions
for (const e of edges) {
  if (e.status === 'confirmed') {
    e.status = 'reported';
    e.editorialStatus = 'reported';
  }
}

// Refresh metrics
const metrics = computeNuclearProjectMetrics({ nodes, edges });
network.nodes = nodes;
network.edges = edges;
network.asOf = AS_OF;
network.generatedAt = `${AS_OF}T12:00:00.000Z`;
network.generatedBy = 'curate_nuclear_phase4b1.mjs';
network._legacyFallback = false;
network.phase4b1CuratedAt = AS_OF;
network.metrics = {
  ...network.metrics,
  ...metrics,
  listedCompanyCount: 7,
  listedReferenceCompanyCount: nodes.filter((n) => n.entityRole === 'listed_reference_company').length,
  phase4b1CuratedAt: AS_OF,
};

const report = validateNetworkReport(network);
if (report.failures.length) {
  console.error('Validation failures:');
  report.failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}

fs.writeFileSync(NET_FP, JSON.stringify(network, null, 2));
fs.writeFileSync(LOG_FP, JSON.stringify({
  asOf: AS_OF,
  reviewedBy: BY,
  phase: '4B.1',
  summary: {
    changelogEntries: changelog.length,
    metrics: network.metrics,
  },
  entries: changelog,
}, null, 2));

console.log('OK nuclear Phase 4B.1 →', NET_FP);
console.log(JSON.stringify(network.metrics, null, 2));
console.log('changelog entries:', changelog.length);
console.log('warnings:', report.warnings.length);
