/**
 * Phase 4C.1 — Renewable project qualification, capacity semantics, disclosure curation.
 * Does not change cp_list (10). No orphan-padding edges. No new UI features.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeRenewableProjectMetrics } from '../lib/relation_network/renewable_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase4c1';
const NET_FP = join(ROOT, 'data', 'networks', 'renewable.json');
const LOG_FP = join(ROOT, 'data', 'renewable_relation_phase4c1_changelog.json');

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
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

function upsertNode(partial) {
  const i = nodes.findIndex((n) => n.id === partial.id);
  if (i >= 0) {
    const prev = nodes[i];
    nodes[i] = { ...prev, ...partial };
    nodeById.set(partial.id, nodes[i]);
    return nodes[i];
  }
  nodes.push(partial);
  nodeById.set(partial.id, partial);
  return partial;
}

function remapId(oldId, newId) {
  for (const e of edges) {
    if (e.source === oldId) e.source = newId;
    if (e.target === oldId) e.target = newId;
  }
  const i = nodes.findIndex((n) => n.id === oldId);
  if (i >= 0) {
    const prev = nodes[i];
    nodes[i] = { ...prev, id: newId, aliases: [...new Set([...(prev.aliases || []), oldId])] };
    nodeById.delete(oldId);
    nodeById.set(newId, nodes[i]);
  }
}

function findEdge(id) {
  return edges.find((e) => e.id === id);
}

function upsertEdge(partial) {
  const i = edges.findIndex((e) => e.id === partial.id);
  if (i >= 0) {
    edges[i] = { ...edges[i], ...partial };
    return edges[i];
  }
  edges.push(partial);
  return partial;
}

function removeNode(id) {
  const i = nodes.findIndex((n) => n.id === id);
  if (i >= 0) nodes.splice(i, 1);
  nodeById.delete(id);
}

function removeEdgesTouching(id) {
  for (let i = edges.length - 1; i >= 0; i--) {
    if (edges[i].source === id || edges[i].target === id) edges.splice(i, 1);
  }
}

// ——— 1) Atlas Energy Park: multi-project portfolio / EPC+module supply scope ———
{
  const old = nodeById.get('renewable-project:atlas-energy-park');
  if (old) {
    remapId('renewable-project:atlas-energy-park', 'project-portfolio:atlas-energy-park');
    const n = nodeById.get('project-portfolio:atlas-energy-park');
    const prevType = old.type;
    const prevCapType = old.capacityType;
    const prevCap = old.capacityValue;
    Object.assign(n, {
      type: 'project_portfolio',
      nameKo: '아틀라스 에너지 파크(미국·다단계 단지)',
      nameEn: 'Atlas Energy Park (US multi-phase complex)',
      role: 'project_portfolio',
      technology: 'solar',
      lane: 'solar',
      projectStatus: null,
      portfolioStatus: 'under_construction',
      capacityValue: 2800,
      capacityUnit: 'MW',
      capacityType: 'contracted_supply_volume',
      projectTotalCapacity: null,
      equityCapacity: null,
      operatingCapacity: null,
      underConstructionCapacity: null,
      epcScopeCapacity: 2800,
      contractedSupplyVolume: 2800,
      phaseCount: 14,
      targetCommercialOperationDate: '2028',
      noteKo: '애리조나 라파즈 14개 태양광·ESS 합산 단지(2028년까지 태양광 2.8GW·ESS 5.7GWh). 한화큐셀은 EPC·모듈 공급. 2.8GW는 단지 합산·계약 공급규모이며 한화 보유 발전용량이 아님.',
      noteEn: '14-project solar+storage complex in La Paz, AZ (2.8GW solar / 5.7GWh ESS by 2028). Qcells provides EPC and modules. 2.8GW is park aggregate / EPC-module scope — not Hanwha-owned generation capacity.',
      capacityDisplayKo: '모듈/EPC 계약 공급규모(단지 합산) — 기업 보유 발전용량 아님',
      capacityDisplayEn: 'Module/EPC contracted supply volume (park aggregate) — not owned generation capacity',
      evidence: [mkEv({
        directEvidence: true,
        sourceType: 'company_ir',
        evidenceUsageType: 'exact_project_document',
        title: 'Qcells Atlas Energy Park — multi-phase 2.8GW solar by 2028',
        url: 'https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/',
        publishedAt: '2026-07-09',
        evidenceSummaryKo: '공식: 다단계 단지, 2028년까지 태양광 2.8GW. Atlas V/VI는 개발 후 매각·EPC·모듈 공급.',
        evidenceSummaryEn: 'Official: multi-phase park; 2.8GW solar by 2028. Atlas V/VI developed then sold; Qcells EPC/modules.',
        relationshipSupported: 'epc_for',
      })],
    });
    log({
      nodeOrEdgeId: 'project-portfolio:atlas-energy-park',
      previousNodeType: prevType,
      nextNodeType: 'project_portfolio',
      previousEditorialStatus: null,
      nextEditorialStatus: null,
      previousProjectStatus: 'under_construction',
      nextProjectStatus: null,
      previousCapacityType: prevCapType,
      nextCapacityType: 'contracted_supply_volume',
      previousCapacityValue: prevCap,
      nextCapacityValue: 2800,
      reason: 'Atlas 2.8GW is multi-phase park aggregate / EPC-module scope — not a single owned renewable_project',
      evidenceUrls: ['https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/'],
    });
  }
  for (const id of ['e-atlas-hanwha-epc', 'e-atlas-hanwha-module']) {
    const e = findEdge(id);
    if (!e) continue;
    e.target = 'project-portfolio:atlas-energy-park';
    e.projectStatus = null;
    e.portfolioStatus = 'under_construction';
    // Park-level 2.8GW stays on the portfolio node only — avoid double-counting with Atlas V/VI edges.
    e.capacityType = id.includes('epc') ? 'epc_scope' : 'contracted_supply_volume';
    e.capacityValue = null;
    e.capacityUnit = null;
    e.noteKo = '단지 합산 2.8GW는 포트폴리오 노드에만 표기. 지표는 식별 가능한 V/VI(372MWdc) 엣지 사용.';
    e.noteEn = 'Park aggregate 2.8GW on portfolio node only; metrics use identifiable V/VI (372 MWdc) edges.';
    e.editorialStatus = 'reported';
    e.evidence = [mkEv({
      directEvidence: true,
      sourceType: 'company_ir',
      evidenceUsageType: 'exact_project_document',
      title: id.includes('epc') ? 'Qcells EPC for Atlas Energy Park phases' : 'Qcells module supply for Atlas Energy Park',
      url: 'https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/',
      publishedAt: '2026-07-09',
      evidenceSummaryKo: '한화큐셀 EPC·모듈 공급. 보유용량 아님.',
      evidenceSummaryEn: 'Qcells EPC/module supply — not owned MW.',
      relationshipSupported: e.type,
    })];
  }
}

// Atlas V/VI — specific phases with SCE PPA (exact); still not Hanwha equity
upsertNode({
  id: 'renewable-project:atlas-v-vi',
  type: 'renewable_project',
  nameKo: '아틀라스 V·VI 태양광(애리조나)',
  nameEn: 'Atlas V & VI solar (Arizona)',
  role: 'renewable_project',
  technology: 'solar',
  lane: 'solar',
  region: 'La Paz County, Arizona',
  countryCode: 'US',
  projectStatus: 'under_construction',
  capacityValue: 372,
  capacityUnit: 'MWdc',
  capacityType: 'project_total',
  projectTotalCapacity: 372,
  equityCapacity: null,
  underConstructionCapacity: 372,
  targetCommercialOperationDate: null,
  parentPortfolioId: 'project-portfolio:atlas-energy-park',
  noteKo: 'Atlas V(237MWdc)+VI(135MWdc). Qcells 개발 후 매각·EPC·모듈. SCE와 장기 PPA. 한화 보유용량 아님.',
  noteEn: 'Atlas V (237 MWdc) + VI (135 MWdc). Developed then sold; Qcells EPC/modules. Long-term PPAs with SCE. Not Hanwha-owned capacity.',
  capacityDisplayKo: '프로젝트 총용량(MWdc) — EPC/모듈 수행, 기업 귀속용량 아님',
  capacityDisplayEn: 'Project total (MWdc) — EPC/module scope, not equity-attributable',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Qcells Atlas V (237 MWdc) & VI (135 MWdc) — SCE PPAs',
    url: 'https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/',
    publishedAt: '2026-07-09',
    evidenceSummaryKo: '공식: V·VI 합 372MWdc, SCE 장기 PPA, 개발 후 매각·EPC 수행.',
    evidenceSummaryEn: 'Official: V+VI total 372 MWdc; long-term PPAs with SCE; developed then sold; Qcells EPC.',
    relationshipSupported: 'epc_for',
  })],
  asOf: AS_OF,
});
log({
  nodeOrEdgeId: 'renewable-project:atlas-v-vi',
  previousNodeType: null,
  nextNodeType: 'renewable_project',
  previousProjectStatus: null,
  nextProjectStatus: 'under_construction',
  previousCapacityType: null,
  nextCapacityType: 'project_total',
  previousCapacityValue: null,
  nextCapacityValue: 372,
  reason: 'Split identifiable Atlas V/VI phases from 2.8GW portfolio; exact Qcells documentation',
  evidenceUrls: ['https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/'],
});

upsertNode({
  id: 'offtaker:sce',
  type: 'offtaker',
  nameKo: '서던캘리포니아 에디슨(SCE)',
  nameEn: 'Southern California Edison (SCE)',
  role: 'power_offtaker',
  lane: 'solar',
  isListedKorea: false,
});

upsertEdge({
  id: 'e-atlas-hanwha-epc-vvi',
  source: 'krx:009830',
  target: 'renewable-project:atlas-v-vi',
  type: 'epc_for',
  editorialStatus: 'reported',
  status: 'reported',
  relationClass: 'business',
  projectStatus: 'under_construction',
  capacityType: 'epc_scope',
  capacityValue: 372,
  capacityUnit: 'MWdc',
  directEvidence: true,
  reviewStatus: 'needs_human_review',
  lastVerifiedAt: AS_OF,
  asOf: AS_OF,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Qcells self-perform EPC for Atlas V/VI',
    url: 'https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/',
    publishedAt: '2026-07-09',
    relationshipSupported: 'epc_for',
    evidenceSummaryKo: 'V/VI EPC 수행. 소유 아님.',
    evidenceSummaryEn: 'EPC for V/VI — not ownership.',
  })],
});

upsertEdge({
  id: 'e-atlas-hanwha-module-vvi',
  source: 'krx:009830',
  target: 'renewable-project:atlas-v-vi',
  type: 'supplies_module_to',
  editorialStatus: 'reported',
  status: 'reported',
  relationClass: 'business',
  projectStatus: 'under_construction',
  capacityType: 'contracted_supply_volume',
  capacityValue: 372,
  capacityUnit: 'MWdc',
  directEvidence: true,
  reviewStatus: 'needs_human_review',
  lastVerifiedAt: AS_OF,
  asOf: AS_OF,
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Qcells modules for Atlas V/VI',
    url: 'https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/',
    publishedAt: '2026-07-09',
    relationshipSupported: 'supplies_module_to',
    evidenceSummaryKo: '모듈 공급.',
    evidenceSummaryEn: 'Module supply.',
  })],
});

upsertEdge({
  id: 'e-atlas-sce-ppa',
  source: 'offtaker:sce',
  target: 'renewable-project:atlas-v-vi',
  type: 'power_purchase_agreement',
  editorialStatus: 'reported',
  status: 'reported',
  relationClass: 'business',
  projectStatus: 'under_construction',
  agreementType: 'utility_ppa',
  counterpartyStatus: 'exact',
  seller: 'project_owner_after_sale',
  buyer: 'offtaker:sce',
  pricingDisclosure: 'undisclosed',
  directEvidence: true,
  reviewStatus: 'needs_human_review',
  lastVerifiedAt: AS_OF,
  asOf: AS_OF,
  noteKo: 'Qcells 공식: Atlas V·VI가 SCE와 장기 PPA. 한화=EPC/모듈이며 PPA 매도인으로 표시하지 않음.',
  noteEn: 'Qcells: Atlas V/VI under long-term PPAs with SCE. Hanwha is EPC/module — not shown as PPA seller.',
  evidence: [mkEv({
    directEvidence: true,
    sourceType: 'company_ir',
    evidenceUsageType: 'exact_project_document',
    title: 'Atlas V/VI long-term PPAs with Southern California Edison',
    url: 'https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/',
    publishedAt: '2026-07-09',
    relationshipSupported: 'power_purchase_agreement',
    evidenceSummaryKo: '공식 문구: Atlas projects contracted under long-term PPAs with SCE.',
    evidenceSummaryEn: 'Official wording: Atlas projects contracted under long-term PPAs with SCE.',
  })],
});
log({
  nodeOrEdgeId: 'e-atlas-sce-ppa',
  previousNodeType: null,
  nextNodeType: 'power_purchase_agreement',
  previousEditorialStatus: null,
  nextEditorialStatus: 'reported',
  reason: 'Exact Qcells disclosure of SCE utility PPA for Atlas V/VI — not portfolio-wide invented PPA',
  evidenceUrls: ['https://us.qcells.com/blog/qcells-shares-atlas-project-largest-solar-and-storage-project/'],
});

// ——— 2) NEXO H2 → product / hydrogen mobility market ———
{
  const oldId = 'renewable-project:hyundai-nexo-h2-tank-supply';
  const old = nodeById.get(oldId);
  if (old) {
    remapId(oldId, 'product:nexo');
    const n = nodeById.get('product:nexo');
    Object.assign(n, {
      type: 'product',
      nameKo: '현대차 넥쏘(NEXO) 수소전기차',
      nameEn: 'Hyundai NEXO FCEV',
      role: 'product',
      technology: 'hydrogen',
      lane: 'hydrogen',
      projectStatus: null,
      capacityValue: null,
      capacityUnit: null,
      capacityType: null,
      equityCapacity: null,
      operatingCapacity: null,
      noteKo: '자동차 제품·모빌리티 수요. 실제 재생에너지 발전 프로젝트가 아닙니다.',
      noteEn: 'Vehicle product / mobility demand — not a renewable generation project.',
      capacityDisplayKo: '발전용량 없음(제품)',
      capacityDisplayEn: 'No generation capacity (product)',
      evidence: [mkEv({
        directEvidence: true,
        sourceType: 'press',
        evidenceUsageType: 'exact_project_document',
        title: 'Iljin Hysolus NEXO hydrogen tank supply (product)',
        url: 'https://www.ddaily.co.kr/page/view/2021081311374665760',
        evidenceSummaryKo: '넥쏘 수소탱크 공급 — 제품/모빌리티.',
        evidenceSummaryEn: 'NEXO tank supply — product/mobility.',
        relationshipSupported: 'manufactures',
      })],
    });
    log({
      nodeOrEdgeId: 'product:nexo',
      previousNodeType: 'renewable_project',
      nextNodeType: 'product',
      previousProjectStatus: 'operating',
      nextProjectStatus: null,
      previousCapacityType: 'operating',
      nextCapacityType: null,
      reason: 'NEXO is an FCEV product/market exposure, not a renewable power project',
      evidenceUrls: ['https://www.ddaily.co.kr/page/view/2021081311374665760'],
    });
  }
  const e = findEdge('e-iljin-hyundai-h2');
  if (e) {
    e.target = 'product:nexo';
    e.type = 'manufactures';
    e.projectStatus = null;
    e.editorialStatus = 'reported';
    e.relationClass = 'structural';
    e.evidence = [mkEv({
      directEvidence: true,
      sourceType: 'press',
      evidenceUsageType: 'exact_project_document',
      title: 'Iljin manufactures NEXO H2 tanks',
      url: 'https://www.ddaily.co.kr/page/view/2021081311374665760',
      relationshipSupported: 'manufactures',
      evidenceSummaryKo: '제품 부품 공급. 발전 프로젝트 아님.',
      evidenceSummaryEn: 'Product component supply — not a generation project.',
    })];
    log({
      nodeOrEdgeId: 'e-iljin-hyundai-h2',
      previousNodeType: 'supplies_hydrogen_equipment_to',
      nextNodeType: 'manufactures',
      previousEditorialStatus: 'reported',
      nextEditorialStatus: 'reported',
      reason: 'Retarget to product:nexo; structural product role',
      evidenceUrls: ['https://www.ddaily.co.kr/page/view/2021081311374665760'],
    });
  }
  upsertNode({
    id: 'market:hydrogen_mobility',
    type: 'end_market',
    nameKo: '수소 모빌리티',
    nameEn: 'Hydrogen mobility',
    role: 'end_market',
    lane: 'hydrogen',
  });
  upsertEdge({
    id: 'e-nexo-h2-market',
    source: 'product:nexo',
    target: 'market:hydrogen_mobility',
    type: 'exposed_to',
    editorialStatus: 'reference',
    status: 'reference',
    relationClass: 'structural',
    defaultHidden: false,
    directEvidence: false,
    reviewStatus: 'needs_human_review',
    asOf: AS_OF,
    evidence: [mkEv({
      evidenceUsageType: 'official_role_page',
      title: 'NEXO exposes hydrogen mobility market',
      relationshipSupported: 'exposed_to',
      evidenceSummaryKo: '제품→모빌리티 시장 노출.',
      evidenceSummaryEn: 'Product → mobility market exposure.',
    })],
  });
}

// ——— 3) SK Gas H2 → development_pipeline ———
{
  const oldId = 'renewable-project:skgas-hydrogen-pipeline';
  if (nodeById.has(oldId)) {
    remapId(oldId, 'development-pipeline:skgas-hydrogen');
    const n = nodeById.get('development-pipeline:skgas-hydrogen');
    Object.assign(n, {
      type: 'development_pipeline',
      nameKo: 'SK가스 수소 사업 파이프라인',
      nameEn: 'SK Gas hydrogen business pipeline',
      role: 'development_pipeline',
      technology: 'hydrogen',
      lane: 'hydrogen',
      projectStatus: null,
      pipelineStatus: 'development',
      capacityValue: null,
      defaultHidden: true,
      noteKo: '특정 시설·위치·생산량이 확인되지 않은 사업 파이프라인. 재생발전 프로젝트가 아닙니다.',
      noteEn: 'Business pipeline without verified facility/location/production — not a renewable generation project.',
      capacityDisplayKo: '개발 파이프라인(용량 미확인)',
      capacityDisplayEn: 'Development pipeline (capacity unknown)',
      evidence: [mkEv({
        directEvidence: false,
        sourceType: 'company_ir',
        evidenceUsageType: 'general_business_page',
        title: 'SK Gas hydrogen business page',
        url: 'https://www.skgas.co.kr/',
        evidenceSummaryKo: '일반 사업 소개. 개별 프로젝트 자격 미달.',
        evidenceSummaryEn: 'General IR — fails actual-project gate.',
        relationshipSupported: 'exposed_to',
      })],
    });
    log({
      nodeOrEdgeId: 'development-pipeline:skgas-hydrogen',
      previousNodeType: 'renewable_project',
      nextNodeType: 'development_pipeline',
      previousProjectStatus: 'development',
      nextProjectStatus: null,
      reason: 'No named facility/location/production — demote to development_pipeline; exclude from actual project count',
      evidenceUrls: ['https://www.skgas.co.kr/'],
    });
  }
  const e = findEdge('e-skgas-h2-dev');
  if (e) {
    e.target = 'development-pipeline:skgas-hydrogen';
    e.type = 'exposed_to';
    e.editorialStatus = 'reference';
    e.status = 'reference';
    e.relationClass = 'structural';
    e.projectStatus = null;
    e.defaultHidden = true;
    e.directEvidence = false;
  }
}

// ——— 4) Sinan Wi — keep UC; strengthen gov evidence; SPV name note; stake remains reported ———
{
  const p = nodeById.get('renewable-project:sinan-wi-offshore');
  if (p) {
    Object.assign(p, {
      projectStatus: 'under_construction',
      capacityType: 'project_total',
      projectTotalCapacity: 390,
      capacityValue: 390,
      capacityUnit: 'MW',
      underConstructionCapacity: 390,
      equityCapacity: 39,
      targetCommercialOperationDate: '2029-01',
      constructionStartDate: '2026-07-16',
      noteKo: '기후에너지환경부 착공식(2026-07-16). 390MW. SK이터닉스 지분 약 10%(보도·업계 합치) → 귀속용량 39MW. SPV 정식 법인명은 공시 재확인.',
      noteEn: 'MCEE groundbreaking 2026-07-16. 390MW. SK Ethernix ~10% stake (press-consistent) → 39MW equity. SPV legal name needs disclosure confirmation.',
      capacityDisplayKo: '프로젝트 총용량 390MW / 기업 귀속용량(보고 지분 10%) 39MW',
      capacityDisplayEn: 'Project total 390MW / equity-attributable (reported 10%) 39MW',
      evidence: [mkEv({
        directEvidence: true,
        sourceType: 'government',
        evidenceUsageType: 'exact_project_document',
        title: 'MCEE: Sinan Wi offshore wind groundbreaking',
        url: 'https://www.mcee.go.kr/home/web/board/read.do?boardCategoryId=&boardId=1877860&boardMasterId=939&decorator=&maxIndexPages=10&maxPageItems=10&menuId=10598&orgCd=&pagerOffset=0',
        publishedAt: '2026-07-16',
        evidenceSummaryKo: '정부 공식 착공 발표. 390MW, 2029-01 상업운전 목표. SK이터닉스 참여 명시.',
        evidenceSummaryEn: 'Official groundbreaking. 390MW; COD target 2029-01; SK Ethernix named participant.',
        relationshipSupported: 'under_construction',
      }), mkEv({
        directEvidence: true,
        sourceType: 'press',
        evidenceUsageType: 'exact_project_document',
        title: 'Stake mix reporting (SK Ethernix 10%)',
        url: 'https://www.ajunews.com/view/20260716091800318',
        publishedAt: '2026-07-16',
        evidenceSummaryKo: '지분: 미래에너지펀드 40%, 한화오션 26%, 중부발전 19%, SK이터닉스 10%, 현대건설 5%.',
        evidenceSummaryEn: 'Stake mix: Future Energy Fund 40%, Hanwha Ocean 26%, KOWEPO 19%, SK Ethernix 10%, Hyundai E&C 5%.',
        relationshipSupported: 'owns_stake_in',
      })],
    });
    log({
      nodeOrEdgeId: p.id,
      previousProjectStatus: 'under_construction',
      nextProjectStatus: 'under_construction',
      previousCapacityType: 'under_construction',
      nextCapacityType: 'project_total',
      reason: 'Confirmed UC via MCEE press; capacityType=project_total; equity remains reported (10%)',
      evidenceUrls: [
        'https://www.mcee.go.kr/home/web/board/read.do?boardCategoryId=&boardId=1877860&boardMasterId=939&decorator=&maxIndexPages=10&maxPageItems=10&menuId=10598&orgCd=&pagerOffset=0',
        'https://www.ajunews.com/view/20260716091800318',
      ],
    });
  }
  const spv = nodeById.get('spv:sinan-wi-offshore');
  if (spv) {
    Object.assign(spv, {
      nameKo: '신안우이 해상풍력 SPV(법인명 공시 확인 중)',
      nameEn: 'Sinan Wi Offshore Wind SPV (legal name pending disclosure)',
      noteKo: '컨소시엄 SPV. 정식 상호는 DART/법인등기 재확인.',
      noteEn: 'Consortium SPV — legal name pending DART/registry confirmation.',
    });
  }
  for (const id of ['e-sinan-sk-stake', 'e-sinan-spv-owner', 'e-sinan-sk-developer']) {
    const e = findEdge(id);
    if (!e) continue;
    e.projectStatus = 'under_construction';
    e.editorialStatus = 'reported';
    e.reviewStatus = 'needs_human_review';
    if (id === 'e-sinan-sk-stake') {
      e.ownershipPct = 10;
      e.ownershipPctAsOf = '2026-07-16';
      e.capacityType = 'equity_attributable';
      e.capacityValue = 39;
      e.capacityUnit = 'MW';
      e.directOrIndirect = 'reported_direct_or_consortium';
      e.evidence = [mkEv({
        directEvidence: true,
        sourceType: 'press',
        evidenceUsageType: 'exact_project_document',
        title: 'SK Ethernix 10% consortium stake (reported)',
        url: 'https://www.ajunews.com/view/20260716091800318',
        publishedAt: '2026-07-16',
        relationshipSupported: 'owns_stake_in',
        evidenceSummaryKo: '다수 보도 일치 10%. 공시·법인등기 재확인 전 confirmed 미승격.',
        evidenceSummaryEn: 'Consistent press 10%. Not promoted to confirmed pending disclosure/registry.',
      })];
    }
    if (id === 'e-sinan-sk-developer' || id === 'e-sinan-spv-owner') {
      e.evidence = [mkEv({
        directEvidence: true,
        sourceType: 'government',
        evidenceUsageType: 'exact_project_document',
        title: 'MCEE Sinan Wi groundbreaking — participants',
        url: 'https://www.mcee.go.kr/home/web/board/read.do?boardCategoryId=&boardId=1877860&boardMasterId=939&decorator=&maxIndexPages=10&maxPageItems=10&menuId=10598&orgCd=&pagerOffset=0',
        publishedAt: '2026-07-16',
        relationshipSupported: e.type,
        evidenceSummaryKo: '정부 착공 발표 및 참여사 명시.',
        evidenceSummaryEn: 'Government groundbreaking names participants.',
      })];
    }
  }
}

// ——— 5) Uiseong Hwanghaksan — operating (Aug 2026); SPV; developer not auto-owner ———
{
  const p = nodeById.get('renewable-project:uiseong-hwanghaksan-wind');
  if (p) {
    Object.assign(p, {
      projectStatus: 'operating',
      capacityType: 'project_total',
      projectTotalCapacity: 99,
      capacityValue: 99,
      capacityUnit: 'MW',
      operatingCapacity: 99,
      underConstructionCapacity: null,
      equityCapacity: null,
      commercialOperationDate: '2026-08-06',
      region: '경북 의성군 옥산면',
      noteKo: '전력시장 진입·상업운전(2026-08-06 보도). 99MW. 시행 SPC: 의성황학산풍력발전. SK이터닉스는 개발·EP 역할. 지분율 미확인 → equityCapacity null.',
      noteEn: 'Entered power market / COD reported 2026-08-06. 99MW. SPC: Uiseong Hwanghaksan Wind Power. SK Ethernix developer/EP. Stake unverified → equityCapacity null.',
      capacityDisplayKo: '프로젝트 총용량·운영용량 99MW (기업 귀속용량 미확인)',
      capacityDisplayEn: 'Project total & operating 99MW (equity-attributable unknown)',
      evidence: [mkEv({
        directEvidence: true,
        sourceType: 'press',
        evidenceUsageType: 'exact_project_document',
        title: 'Uiseong Hwanghaksan commercial operation',
        url: 'https://www.ekn.kr/web/view.php?key=20260806021560183',
        publishedAt: '2026-08-06',
        evidenceSummaryKo: '의성황학산 99MW 상업운전 개시. SK이터닉스 단지.',
        evidenceSummaryEn: '99MW Uiseong Hwanghaksan entered commercial operation; SK Ethernix project.',
        relationshipSupported: 'operates',
      })],
    });
    log({
      nodeOrEdgeId: p.id,
      previousProjectStatus: 'under_construction',
      nextProjectStatus: 'operating',
      previousCapacityType: 'under_construction',
      nextCapacityType: 'project_total',
      previousCapacityValue: 99,
      nextCapacityValue: 99,
      reason: 'Commercial operation reported 2026-08-06 — not under_construction',
      evidenceUrls: ['https://www.ekn.kr/web/view.php?key=20260806021560183'],
    });
  }
  upsertNode({
    id: 'spv:uiseong-hwanghaksan-wind',
    type: 'project_spv',
    nameKo: '의성황학산풍력발전',
    nameEn: 'Uiseong Hwanghaksan Wind Power SPC',
    role: 'project_spv',
    lane: 'onshore_wind',
    isListedKorea: false,
    asOf: AS_OF,
  });
  upsertEdge({
    id: 'e-uiseong-spv-owner',
    source: 'spv:uiseong-hwanghaksan-wind',
    target: 'renewable-project:uiseong-hwanghaksan-wind',
    type: 'project_owner',
    editorialStatus: 'reported',
    status: 'reported',
    relationClass: 'business',
    projectStatus: 'operating',
    directEvidence: true,
    reviewStatus: 'needs_human_review',
    lastVerifiedAt: AS_OF,
    asOf: AS_OF,
    evidence: [mkEv({
      directEvidence: true,
      sourceType: 'press',
      evidenceUsageType: 'exact_project_document',
      title: 'SPC Uiseong Hwanghaksan Wind Power',
      url: 'https://www.todayenergy.kr/news/articleView.html?idxno=297873',
      relationshipSupported: 'project_owner',
      evidenceSummaryKo: '시행사 SPC: 의성황학산풍력발전 주식회사.',
      evidenceSummaryEn: 'Project SPC: Uiseong Hwanghaksan Wind Power Co.',
    })],
  });
  const dev = findEdge('e-uiseong-sk-dev');
  if (dev) {
    Object.assign(dev, {
      projectStatus: 'operating',
      editorialStatus: 'reported',
      evidence: [mkEv({
        directEvidence: true,
        sourceType: 'press',
        evidenceUsageType: 'exact_project_document',
        title: 'SK Ethernix developer / EP for Uiseong Hwanghaksan',
        url: 'https://www.ekn.kr/web/view.php?key=20260806021560183',
        publishedAt: '2026-08-06',
        relationshipSupported: 'project_developer',
        evidenceSummaryKo: '개발·운영 단지. 지분율 미확인으로 owns_stake_in 미생성.',
        evidenceSummaryEn: 'Developer/operator of site. No owns_stake_in without verified stake %.',
      })],
    });
  }
  upsertEdge({
    id: 'e-uiseong-sk-operates',
    source: 'krx:475150',
    target: 'renewable-project:uiseong-hwanghaksan-wind',
    type: 'operates',
    editorialStatus: 'reported',
    status: 'reported',
    relationClass: 'business',
    projectStatus: 'operating',
    directEvidence: true,
    reviewStatus: 'needs_human_review',
    lastVerifiedAt: AS_OF,
    asOf: AS_OF,
    evidence: [mkEv({
      directEvidence: true,
      sourceType: 'press',
      evidenceUsageType: 'exact_project_document',
      title: 'SK Ethernix operating onshore wind fleet includes Uiseong',
      url: 'https://www.ekn.kr/web/view.php?key=20260806021560183',
      publishedAt: '2026-08-06',
      relationshipSupported: 'operates',
      evidenceSummaryKo: '운영 중 육상풍력 포트폴리오에 의성황학산 포함.',
      evidenceSummaryEn: 'Included in SK Ethernix operating onshore wind fleet.',
    })],
  });
}

// ——— 6) Haenam — keep preferred_bidder; clarify no signed EPC ———
{
  const p = nodeById.get('renewable-project:haenam-kosepo-solar');
  if (p) {
    Object.assign(p, {
      projectStatus: 'preferred_bidder',
      capacityType: 'announced',
      projectTotalCapacity: 400,
      capacityValue: 400,
      capacityUnit: 'MW',
      pipelineCapacity: 400,
      equityCapacity: null,
      noteKo: '남동발전 발주 400MW. 한화큐셀 EPC 우선협상·모듈 공급 발표. 본계약·착공 공시 미확인 → preferred_bidder 유지.',
      noteEn: 'KOEN 400MW. Qcells preferred EPC / module supply announced. No verified signed EPC or groundbreaking — keep preferred_bidder.',
      capacityDisplayKo: '발표 프로젝트 용량 400MW (EPC 우선협상 — 보유용량 아님)',
      capacityDisplayEn: 'Announced project 400MW (preferred EPC — not owned capacity)',
    });
    log({
      nodeOrEdgeId: p.id,
      previousProjectStatus: 'preferred_bidder',
      nextProjectStatus: 'preferred_bidder',
      reason: 'No signed EPC/NTP found after preferred negotiation — status unchanged',
      evidenceUrls: ['https://www.solartodaymag.com/news/articleView.html?idxno=20724'],
    });
  }
  for (const id of ['e-haenam-hanwha-epc', 'e-haenam-hanwha-module']) {
    const e = findEdge(id);
    if (!e) continue;
    e.capacityType = id.includes('epc') ? 'preferred_epc_scope' : 'preferred_supply_volume';
    e.capacityValue = null;
    e.capacityUnit = null;
    e.noteKo = '우선협상 단계 — 본계약 전. 용량은 프로젝트 노드 발표치만 사용.';
    e.noteEn = 'Preferred negotiation — pre-contract. Capacity stays on project node announcement only.';
  }
}

// ——— 7) CS Wind contract → supply_contract type ———
{
  const c = nodeById.get('contract:cswind-vestas-tower-2025');
  if (c) {
    const prev = c.type;
    c.type = 'supply_contract';
    c.capacityType = 'contracted_supply_volume';
    c.projectTotalCapacity = null;
    c.capacityDisplayKo = '기자재 공급계약 — 발전 프로젝트 용량 아님';
    c.capacityDisplayEn = 'Equipment supply contract — not generation project capacity';
    log({
      nodeOrEdgeId: c.id,
      previousNodeType: prev,
      nextNodeType: 'supply_contract',
      reason: 'Explicit supply_contract node type; exclude from uniqueActualProjectCount',
      evidenceUrls: ['https://www.digitaltoday.co.kr/news/articleView.html?idxno=607377'],
    });
  }
}

// No additional orphan-padding edges. No PPA inventions beyond SCE.
// Confirmed promotions: none — stake/PPA/EPC remain reported without reviewedBy gate.

network.nodes = nodes;
network.edges = edges;
network.phase4c1CuratedAt = AS_OF;
network.metrics = computeRenewableProjectMetrics(network);

const report = validateNetworkReport(network);
fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({ asOf: AS_OF, curatedBy: BY, entries: changelog }, null, 2)}\n`, 'utf8');

console.log('OK renewable Phase 4C.1 →', NET_FP);
console.log(JSON.stringify(network.metrics, null, 2));
console.log('changelog entries:', changelog.length);
console.log('validate failures:', (report.failures || []).length);
if ((report.failures || []).length) {
  for (const f of (report.failures || []).slice(0, 25)) console.log(' -', f);
}
