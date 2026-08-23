/**
 * Phase 5A.1 — Construction evidence / amount semantics / orphan metric curation.
 * Runs after migrate_construction_network_phase5a.mjs.
 * No new projects, peers, or orphan-padding edges. Never auto-promotes confirmed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeConstructionProjectMetrics } from '../lib/relation_network/construction_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase5a1';
const NET_FP = join(ROOT, 'data', 'networks', 'construction.json');
const LOG_FP = join(ROOT, 'data', 'construction_relation_phase5a1_changelog.json');

const WIRYE_COMPANY_SHARE = 2696131000000 + Math.round(343275100000 * 0.7); // 2,936,423,570,000

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
}

function findNode(id) {
  return nodes.find((n) => n.id === id);
}

function findEdge(id) {
  return edges.find((e) => e.id === id);
}

function patchNode(id, after, reason, category, evidenceMeta = {}) {
  const n = findNode(id);
  if (!n) return;
  const before = JSON.parse(JSON.stringify(n));
  Object.assign(n, after);
  log({
    entityKind: 'node',
    edgeOrProjectId: id,
    before: summarizeEntity(before),
    after: summarizeEntity(n),
    reason,
    correctionCategory: category,
    evidenceUrl: evidenceMeta.url || (n.evidence?.[0]?.url ?? null),
    evidenceIdentifier: evidenceMeta.identifier || null,
    reviewed: after.evidence?.[0]?.reviewStatus === 'reviewed'
      || n.evidence?.some((e) => e.reviewStatus === 'reviewed') || false,
  });
}

function patchEdge(id, after, reason, category, evidenceMeta = {}) {
  const e = findEdge(id);
  if (!e) return;
  const before = JSON.parse(JSON.stringify(e));
  Object.assign(e, after);
  if (after.evidence) e.evidence = after.evidence;
  log({
    entityKind: 'edge',
    edgeOrProjectId: id,
    before: summarizeEntity(before),
    after: summarizeEntity(e),
    reason,
    correctionCategory: category,
    evidenceUrl: evidenceMeta.url || e.evidence?.[0]?.url || null,
    evidenceIdentifier: evidenceMeta.identifier || null,
    reviewed: e.reviewStatus === 'reviewed' || e.evidence?.some((x) => x.reviewStatus === 'reviewed') || false,
  });
}

function summarizeEntity(x) {
  return {
    id: x.id,
    type: x.type,
    projectStatus: x.projectStatus ?? null,
    contractSigned: x.contractSigned ?? null,
    contractStatus: x.contractStatus ?? null,
    counterpartyDisclosure: x.counterpartyDisclosure ?? x.counterpartyStatus ?? null,
    constructionContractValue: x.constructionContractValue ?? null,
    companyContractValue: x.companyContractValue ?? null,
    companyShareValue: x.companyShareValue ?? null,
    contractValue: x.contractValue ?? null,
    projectTotalValue: x.projectTotalValue ?? x.totalProjectValue ?? null,
    currency: x.currency ?? null,
    originalCurrency: x.originalCurrency ?? null,
    originalContractValue: x.originalContractValue ?? null,
    convertedValueKRW: x.convertedValueKRW ?? null,
    conversionAsOf: x.conversionAsOf ?? null,
    equityStakePct: x.equityStakePct ?? x.ownershipPct ?? null,
    companyParticipationPct: x.companyParticipationPct ?? null,
    reviewStatus: x.reviewStatus ?? x.evidence?.[0]?.reviewStatus ?? null,
    directEvidence: x.directEvidence ?? x.evidence?.[0]?.directEvidence ?? null,
    reviewedAt: x.reviewedAt ?? x.evidence?.[0]?.reviewedAt ?? null,
    reviewedBy: x.reviewedBy ?? x.evidence?.[0]?.reviewedBy ?? null,
    editorialStatus: x.editorialStatus ?? x.status ?? null,
    evidenceUrl: x.evidence?.[0]?.url ?? null,
    sourceType: x.evidence?.[0]?.sourceType ?? null,
    primarySource: x.evidence?.[0]?.primarySource ?? null,
  };
}

function mkEv(p) {
  return {
    reviewStatus: p.reviewStatus || 'needs_human_review',
    reviewedAt: p.reviewedAt || null,
    reviewedBy: p.reviewedBy || null,
    accessedAt: AS_OF,
    directEvidence: !!p.directEvidence,
    primarySource: !!p.primarySource,
    sourceOpened: p.sourceOpened !== false,
    sourceType: p.sourceType || 'other',
    evidenceUsageType: p.evidenceUsageType || 'general_business_page',
    title: p.title || '',
    url: p.url || '',
    publishedAt: p.publishedAt || null,
    evidenceIdentifier: p.evidenceIdentifier || null,
    evidenceSummaryKo: p.evidenceSummaryKo || '',
    evidenceSummaryEn: p.evidenceSummaryEn || '',
    relationshipSupported: p.relationshipSupported || '',
  };
}

function reviewedEdgeFields(ev) {
  return {
    reviewStatus: ev.reviewStatus,
    reviewedAt: ev.reviewedAt,
    reviewedBy: ev.reviewedBy,
    directEvidence: ev.directEvidence,
    lastVerifiedAt: AS_OF,
  };
}

// ——— 1) Qatar Dukhan Solar EPIC (028260) ———
// Opened: Sedaily KOSCOM republication of 단일판매ㆍ공급계약체결 (2026-08-19 정정 포함)
{
  const url = 'https://www.sedaily.com/market/domesticStock/stockNotice/841904';
  const identifier = 'KOSCOM/Sedaily republication of Samsung C&T Dukhan EPIC supply contract; USD 1,047,382,760.80 @ 1,470.40 KRW/USD on 2025-12-11 → KRW 1,540,071,611,480; counterparty QatarEnergy; contract date 2025-12-11; period 2025-09-01~2030-06-30';
  const ev = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'disclosure_republication',
    evidenceUsageType: 'exact_project_document',
    title: 'Samsung C&T — Dukhan Solar EPIC (KOSCOM table via Sedaily)',
    url,
    publishedAt: '2026-08-19',
    evidenceIdentifier: identifier,
    relationshipSupported: 'epc_for|krx:028260|epc-project:qatar-dukhan-solar|org:qatar-energy',
    evidenceSummaryKo: '원문 개봉: 삼성물산 본사 공시 형태. 계약상대 QatarEnergy. EPIC. 계약금액은 USD 원화를 2025-12-11 매매기준율로 환산한 회사 도급액(1.54조). 해외법인 경유 여부는 공시상 미기재.',
    evidenceSummaryEn: 'Opened: Samsung C&T parent disclosure form. Counterparty QatarEnergy. EPIC. Amount is USD converted to KRW on 2025-12-11 — company contract value.',
  });
  patchNode('epc-project:qatar-dukhan-solar', {
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    legalContractingEntity: '삼성물산(주)',
    legalContractingEntityEn: 'Samsung C&T Corporation',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: 'QatarEnergy',
    constructionContractValue: 1540071611480,
    companyContractValue: 1540071611480,
    companyShareValue: 1540071611480,
    contractValue: 1540071611480,
    projectTotalValue: null,
    totalProjectValue: null,
    companyParticipationPct: 100,
    equityStakePct: null,
    currency: 'KRW',
    originalCurrency: 'USD',
    originalContractValue: 1047382760.80,
    convertedValueKRW: 1540071611480,
    conversionAsOf: '2025-12-11',
    conversionRate: 1470.40,
    conversionNote: 'KRW figure = USD contract × first trading base rate on contract date (disclosure)',
    valueType: 'company_contract_share',
    validFrom: '2025-12-11',
    validTo: null,
    contractStartDate: '2025-09-01',
    targetCommercialOperationDate: '2030-06-30',
    noteKo: 'EPIC 본계약. 1.54조는 USD 도급액의 KRW 환산(회사 귀속). 총사업비·발전 보유용량 아님. DART rcp 직접 개봉은 후속.',
    noteEn: 'EPIC signed contract. KRW 1.54tn is FX conversion of USD company contract — not total CAPEX / owned MW.',
    evidence: [ev],
  }, 'Re-audit Dukhan: opened Sedaily/KOSCOM table; separate USD+FX; demote unverified DART rcp as primary', 'evidence', { url, identifier });

  const ownerEv = mkEv({
    ...ev,
    relationshipSupported: 'project_owner|org:qatar-energy|epc-project:qatar-dukhan-solar',
    title: 'QatarEnergy as disclosed contract counterparty',
    evidenceSummaryKo: '공시 계약상대 QatarEnergy → project_owner.',
    evidenceSummaryEn: 'Disclosed counterparty QatarEnergy → project_owner.',
  });
  patchEdge('e-dukhan-owner', {
    ...reviewedEdgeFields(ownerEv),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [ownerEv],
  }, 'QatarEnergy owner from opened disclosure table', 'evidence', { url, identifier });

  const epcEv = mkEv({
    ...ev,
    relationshipSupported: 'epc_for|krx:028260|epc-project:qatar-dukhan-solar',
  });
  patchEdge('e-dukhan-samsung-epc', {
    ...reviewedEdgeFields(epcEv),
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    companyContractValue: 1540071611480,
    companyShareValue: 1540071611480,
    contractValue: 1540071611480,
    currency: 'KRW',
    originalCurrency: 'USD',
    originalContractValue: 1047382760.80,
    convertedValueKRW: 1540071611480,
    conversionAsOf: '2025-12-11',
    conversionRate: 1470.40,
    companyParticipationPct: 100,
    valueType: 'company_contract_share',
    validFrom: '2025-12-11',
    evidence: [epcEv],
  }, 'Samsung EPIC edge: amount semantics + reviewed gate', 'amount_semantics', { url, identifier });
}

// ——— 2) Wirye Bokjeong 2BL·3BL (000720) ———
{
  const url = 'https://economyreports.com/filings/20260608-hyundai-engineering-andamp-construction-coltd-major-contract-20260608800044';
  const identifier = 'EconomyReports FILINGS/현대건설/20260608800044 — 단일판매ㆍ공급계약체결 extraction; PFV 송파비즈클러스터피에프브이; 2BL 2,696,131,000,000 (100%) + 3BL 343,275,100,000 (70%)';
  const evMc = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'disclosure_republication',
    evidenceUsageType: 'exact_project_document',
    title: 'Hyundai E&C — Wirye Bokjeong 2BL·3BL contract (filing extract)',
    url,
    publishedAt: '2026-06-08',
    evidenceIdentifier: identifier,
    relationshipSupported: 'main_contractor|krx:000720|construction-project:wirye-bokjeong-mixed',
    evidenceSummaryKo: '원문 개봉: 2BL·3BL 단일 공사수주 공시. 계약총액 3.039조(VAT별도). 당사분 2BL 100%+3BL 70%. 착공예정 2026-06-15. 최대주주 언급은 있으나 지분율 % 없음.',
    evidenceSummaryEn: 'Opened: single disclosure covering 2BL+3BL. Total contract 3.039tn VAT-excl. Company shares 100%/70%. Stake % not disclosed.',
  });
  patchNode('construction-project:wirye-bokjeong-mixed', {
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: '송파비즈클러스터피에프브이 주식회사',
    constructionContractValue: 3039406100000,
    contractValue: 3039406100000,
    companyContractValue: WIRYE_COMPANY_SHARE,
    companyShareValue: WIRYE_COMPANY_SHARE,
    projectTotalValue: null,
    totalProjectValue: null,
    companyParticipationPct: null,
    equityStakePct: null,
    currency: 'KRW',
    valueType: 'company_contract_share',
    blockShares: {
      '2BL': { total: 2696131000000, companyPct: 100, companyShare: 2696131000000 },
      '3BL': { total: 343275100000, companyPct: 70, companyShare: 240292570000 },
    },
    validFrom: '2026-06-05',
    validTo: null,
    contractStartDate: '2026-06-15',
    targetCommercialOperationDate: '2031-01-14',
    noteKo: '2BL+3BL은 하나의 공사수주 공시. 기업 귀속=블록별 당사분 합산. PFV 지분율·총사업비·PF대출은 미확인→null. 착공 전(contract_signed).',
    noteEn: '2BL+3BL one disclosure. Company share = block shares. PFV stake%/total CAPEX/PF loan undisclosed→null. Pre-groundbreaking.',
    evidence: [evMc],
  }, 'Wirye: fix company share arithmetic; keep stake% null; one disclosure for 2BL+3BL', 'amount_semantics', { url, identifier });

  patchNode('pfv:songpa-biz-cluster', {
    nameKo: '송파비즈클러스터피에프브이 주식회사',
    nameEn: 'Songpa Biz Cluster PFV Co., Ltd.',
    legalNameKo: '송파비즈클러스터피에프브이 주식회사',
    noteKo: '공시 계약상대·현대건설 최대주주. 지분율 %는 원문 미기재→null.',
    noteEn: 'Disclosed counterparty; Hyundai E&C largest shareholder. Stake % not in opened extract→null.',
  }, 'PFV formal name from filing extract', 'entity_role', { url, identifier });

  const ownerEv = mkEv({
    ...evMc,
    relationshipSupported: 'project_owner|pfv:songpa-biz-cluster|construction-project:wirye-bokjeong-mixed',
    title: 'Songpa Biz Cluster PFV as contract counterparty',
  });
  patchEdge('e-wirye-pfv-owner', {
    ...reviewedEdgeFields(ownerEv),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [ownerEv],
  }, 'PFV owner from opened filing', 'evidence', { url, identifier });

  const stakeEv = mkEv({
    ...evMc,
    relationshipSupported: 'pfv_shareholder|krx:000720|pfv:songpa-biz-cluster',
    title: 'Hyundai E&C largest shareholder of Songpa Biz Cluster PFV',
    evidenceSummaryKo: '공시: 당사는 해당 PFV의 최대주주. 정확한 지분율 % 없음 → ownershipPct null.',
    evidenceSummaryEn: 'Largest shareholder disclosed; exact % absent → ownershipPct null.',
  });
  patchEdge('e-wirye-hyundai-pfv-stake', {
    ...reviewedEdgeFields(stakeEv),
    ownershipPct: null,
    equityStakePct: null,
    ownershipKind: 'largest_shareholder_disclosed',
    evidence: [stakeEv],
  }, 'Keep stake % null; reviewed largest-shareholder claim', 'counterparty', { url, identifier });

  const mcEv = mkEv({
    ...evMc,
    relationshipSupported: 'main_contractor|krx:000720|construction-project:wirye-bokjeong-mixed',
  });
  patchEdge('e-wirye-hyundai-mc', {
    ...reviewedEdgeFields(mcEv),
    projectStatus: 'contract_signed',
    contractSigned: true,
    companyContractValue: WIRYE_COMPANY_SHARE,
    companyShareValue: WIRYE_COMPANY_SHARE,
    contractValue: 3039406100000,
    currency: 'KRW',
    valueType: 'company_contract_share',
    evidence: [mcEv],
  }, 'Main contractor company share corrected', 'amount_semantics', { url, identifier });

  // developer role is interpretive (largest shareholder + MC) — not directEvidence
  const devEv = mkEv({
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    directEvidence: false,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'disclosure_republication',
    evidenceUsageType: 'supporting_context',
    title: 'Developer-contractor inference from PFV largest shareholder + MC',
    url,
    publishedAt: '2026-06-08',
    evidenceIdentifier: identifier,
    relationshipSupported: 'project_developer|krx:000720|construction-project:wirye-bokjeong-mixed',
    evidenceSummaryKo: '최대주주+시공으로 디벨로퍼 역할은 추론. 원문이 project_developer를 직접 명명하지 않음 → directEvidence=false.',
    evidenceSummaryEn: 'Developer role inferred from largest shareholder + MC; not named as developer in disclosure → directEvidence=false.',
  });
  patchEdge('e-wirye-hyundai-developer', {
    editorialStatus: 'reported',
    status: 'reported',
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    directEvidence: false,
    projectStatus: 'contract_signed',
    evidence: [devEv],
  }, 'Demote project_developer directEvidence — interpretive vs disclosure wording', 'entity_role', { url, identifier });
}

// ——— 3) Busan Sajik3 (006360) ———
{
  const url = 'https://www.thinkpool.com/item/006360/disclosures/all/569243';
  const identifier = 'Thinkpool disclosure table 569243 — GS건설 사직3구역 재개발정비사업; 계약금액 408,232,163,334 VAT별도; 상대 사직3구역 재개발정비사업조합; 수주일 2026-08-06';
  const ev = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'disclosure_republication',
    evidenceUsageType: 'exact_project_document',
    title: 'GS E&C — Sajik3 redevelopment (Thinkpool disclosure table)',
    url,
    publishedAt: '2026-08-07',
    evidenceIdentifier: identifier,
    relationshipSupported: 'main_contractor|krx:006360|construction-project:busan-sajik3-redev|org:sajik3-redev-union',
    evidenceSummaryKo: '원문 개봉: 발주=조합. GS건설 시공 도급(공동도급 미기재→단독 시공으로 유지). 도급액=회사 계약액. 실착공 전.',
    evidenceSummaryEn: 'Opened: awarding party=union. GS main contractor (no JV disclosed). Contract value=company share. Pre-groundbreaking.',
  });
  patchNode('construction-project:busan-sajik3-redev', {
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: '사직3구역 재개발정비사업조합',
    constructionContractValue: 408232163334,
    companyContractValue: 408232163334,
    companyShareValue: 408232163334,
    contractValue: 408232163334,
    projectTotalValue: null,
    totalProjectValue: null,
    companyParticipationPct: 100,
    equityStakePct: null,
    currency: 'KRW',
    valueType: 'company_contract_share',
    validFrom: '2026-08-06',
    validTo: null,
    noteKo: '조합 발주·GS 시공. 도급액≠총사업비. 실착공일부터 42개월(착공 전).',
    noteEn: 'Union award / GS contractor. Contract≠total project cost. 42 months from groundbreaking (not started).',
    evidence: [ev],
  }, 'Sajik3: opened Thinkpool table; union owner; signed not under_construction', 'evidence', { url, identifier });

  patchEdge('e-sajik-owner', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [mkEv({ ...ev, relationshipSupported: 'project_owner|org:sajik3-redev-union|construction-project:busan-sajik3-redev' })],
  }, 'Union owner from opened table', 'counterparty', { url, identifier });

  patchEdge('e-sajik-gs-mc', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'contract_signed',
    contractSigned: true,
    companyContractValue: 408232163334,
    companyShareValue: 408232163334,
    contractValue: 408232163334,
    currency: 'KRW',
    valueType: 'company_contract_share',
    evidence: [mkEv({ ...ev, relationshipSupported: 'main_contractor|krx:006360|construction-project:busan-sajik3-redev' })],
  }, 'GS MC amount semantics', 'amount_semantics', { url, identifier });
}

// ——— 4) Yongsan Jeongbichang Z1 (294870) ———
{
  const url = 'https://www.digitaltoday.co.kr/news/articleView.html?idxno=627464';
  const identifier = 'DigitalToday article with embedded 단일판매ㆍ공급계약체결 table — HDC 정비창전면 제1구역; 924,430,915,470; 조합 상대; 2026-02-05';
  const ev = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'press',
    evidenceUsageType: 'exact_project_document',
    title: 'HDC — Yongsan Zone1 contract (press with embedded disclosure table)',
    url,
    publishedAt: '2026-02-05',
    evidenceIdentifier: identifier,
    relationshipSupported: 'main_contractor|krx:294870|construction-project:yongsan-jeongbichang-zone1|org:yongsan-jeongbichang-zone1-union',
    evidenceSummaryKo: '원문 개봉: 법적 당사자=HDC현대산업개발↔조합. IPARK 브랜드는 당사자 아님. 본계약 체결·실착공 전.',
    evidenceSummaryEn: 'Opened: legal parties HDC↔union. IPARK brand is not a party. Signed; pre-groundbreaking.',
  });
  patchNode('construction-project:yongsan-jeongbichang-zone1', {
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: '정비창전면제1구역재개발정비사업조합',
    constructionContractValue: 924430915470,
    companyContractValue: 924430915470,
    companyShareValue: 924430915470,
    contractValue: 924430915470,
    projectTotalValue: null,
    totalProjectValue: null,
    companyParticipationPct: 100,
    equityStakePct: null,
    currency: 'KRW',
    valueType: 'company_contract_share',
    validFrom: '2026-02-05',
    validTo: null,
    noteKo: '시공 도급. IPARK=마케팅 브랜드(계약 당사자·발주처 아님).',
    noteEn: 'Construction contract. IPARK is brand only — not owner/contractor legal party.',
    evidence: [ev],
  }, 'Yongsan: brand≠party; opened embedded disclosure table', 'entity_role', { url, identifier });

  patchEdge('e-yongsan-owner', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [mkEv({ ...ev, relationshipSupported: 'project_owner|org:yongsan-jeongbichang-zone1-union|construction-project:yongsan-jeongbichang-zone1' })],
  }, 'Union owner', 'counterparty', { url, identifier });

  patchEdge('e-yongsan-hdc-mc', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'contract_signed',
    contractSigned: true,
    companyContractValue: 924430915470,
    companyShareValue: 924430915470,
    contractValue: 924430915470,
    currency: 'KRW',
    valueType: 'company_contract_share',
    evidence: [mkEv({ ...ev, relationshipSupported: 'main_contractor|krx:294870|construction-project:yongsan-jeongbichang-zone1' })],
  }, 'HDC MC reviewed', 'evidence', { url, identifier });
}

// ——— 5) Mozambique Rovuma LNG (047040) ———
{
  const url = 'https://www.yna.co.kr/view/AKR20260807039200003';
  const identifier = 'Yonhap AKR20260807039200003 — Daewoo SMDC JV LOI / EPC selection; FID pending; amount undisclosed';
  const ev = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'press',
    evidenceUsageType: 'company_announcement_via_press',
    title: 'Daewoo — Rovuma LNG LOI / EPC selection (Yonhap)',
    url,
    publishedAt: '2026-08-07',
    evidenceIdentifier: identifier,
    relationshipSupported: 'preferred_bidder_for|consortium:smdc-jv|epc-project:mozambique-rovuma-lng-phase1',
    evidenceSummaryKo: '원문 개봉: SMDC JV LOI·EPC 선정. FID·본계약·NTP·금액 미확정. 총 CAPEX를 대우 수주액으로 표시하지 않음.',
    evidenceSummaryEn: 'Opened: SMDC JV LOI/EPC selection. FID/signed/NTP/amount not fixed. Do not show CAPEX as Daewoo award.',
  });
  patchNode('epc-project:mozambique-rovuma-lng-phase1', {
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    contractStatus: 'pre_contract',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: 'ExxonMobil Mozambique Limitada',
    constructionContractValue: null,
    companyContractValue: null,
    companyShareValue: null,
    contractValue: null,
    projectTotalValue: null,
    totalProjectValue: null,
    financingAmount: null,
    guaranteeAmount: null,
    companyParticipationPct: null,
    equityStakePct: null,
    currency: null,
    valueType: 'undisclosed',
    validFrom: '2026-08-07',
    validTo: null,
    statusReviewNeeded: true,
    defaultHidden: false,
    noteKo: '우선협상·LOI. FID/본계약 전. 금액 null. 기사에 SNDC/SMDC 혼용→SMDC JV로 유지. 현재성 재확인 권고.',
    noteEn: 'Preferred/LOI only. Pre-FID/signed. Amounts null. Keep SMDC JV label. Re-verify currency of status.',
    evidence: [ev],
  }, 'Rovuma: keep preferred_bidder; amounts null; reviewed press LOI', 'lifecycle', { url, identifier });

  patchEdge('e-rovuma-owner', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    evidence: [mkEv({
      ...ev,
      relationshipSupported: 'project_owner|org:exxonmobil-mozambique|epc-project:mozambique-rovuma-lng-phase1',
      title: 'ExxonMobil Mozambique as project lead (press)',
    })],
  }, 'Owner from opened press', 'evidence', { url, identifier });

  patchEdge('e-rovuma-consortium', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    participationPct: null,
    companyShareValue: null,
    companyContractValue: null,
    evidence: [mkEv({
      ...ev,
      relationshipSupported: 'consortium_member|krx:047040|consortium:smdc-jv',
      title: 'Daewoo member of SMDC JV',
    })],
  }, 'Consortium membership; no share %', 'entity_role', { url, identifier });

  patchEdge('e-rovuma-preferred', {
    ...reviewedEdgeFields(ev),
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    contractStatus: 'pre_contract',
    companyContractValue: null,
    companyShareValue: null,
    noteKo: '우선협상·LOI 단계이며 본계약과 다를 수 있습니다.',
    noteEn: 'Preferred/LOI stage — may differ from a signed EPC.',
    evidence: [ev],
  }, 'preferred_bidder_for stays unsigned', 'lifecycle', { url, identifier });
}

// ——— Orphan metric note ———
log({
  entityKind: 'metrics',
  edgeOrProjectId: 'orphan_metrics',
  before: {
    note: 'Phase5A construction_project_metrics.businessRelationOrphan=5 vs orphan_metrics=9',
  },
  after: {
    note: 'Shared orphan_metrics: construction_project/pfv/main_contractor etc. included; specializes_in/operates_brand structural',
  },
  reason: 'Unify orphan denominators — 5 vs 9 was missing construction node/edge types in common helper',
  correctionCategory: 'orphan_metric',
  evidenceUrl: null,
  evidenceIdentifier: null,
  reviewed: true,
});

// ——— Strip transactional evidence from legacy peer edges (validator warning) ———
for (const e of edges) {
  if (e.type !== 'peer') continue;
  if (!(e.evidence || []).length) continue;
  const beforeLen = e.evidence.length;
  e.evidence = [];
  log({
    entityKind: 'edge',
    edgeOrProjectId: e.id,
    before: { evidenceCount: beforeLen },
    after: { evidenceCount: 0 },
    reason: 'Legacy peer must not carry transactional evidence blocks',
    correctionCategory: 'evidence',
    evidenceUrl: null,
    evidenceIdentifier: null,
    reviewed: true,
  });
}

network.nodes = nodes;
network.edges = edges;
network.phase5a1CuratedAt = AS_OF;
network.metrics = computeConstructionProjectMetrics(network);

const report = validateNetworkReport(network);
fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({
  asOf: AS_OF,
  curatedBy: BY,
  purpose: 'Phase 5A.1 construction evidence/amount/orphan quality audit',
  entries: changelog,
  metricsSnapshot: network.metrics,
  validate: { failures: report.failures || [], warnings: report.warnings || [] },
}, null, 2)}\n`, 'utf8');

console.log('OK construction Phase 5A.1 →', NET_FP);
console.log('changelog entries', changelog.length);
console.log('projectDirectEvidenceCoverage', network.metrics.projectDirectEvidenceCoverage,
  'denom', network.metrics.evidenceDenominators.projects);
console.log('projectPrimarySourceCoverage', network.metrics.projectPrimarySourceCoverage);
console.log('orphan business/direct/class/weak',
  network.metrics.businessRelationOrphanCount,
  network.metrics.directRelationshipOrphanCount,
  network.metrics.classificationOnlyCompanyCount,
  network.metrics.weakRelationOnlyCompanyCount);
console.log('validate failures', (report.failures || []).length, 'warnings', (report.warnings || []).length);
if ((report.failures || []).length) {
  for (const f of (report.failures || []).slice(0, 40)) console.log(' -', f);
}
