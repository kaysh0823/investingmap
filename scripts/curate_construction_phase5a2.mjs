/**
 * Phase 5A.2 — Construction DART/KIND primary evidence + legal-party final audit.
 * Runs after curate_construction_phase5a1.mjs.
 * No new projects/companies/edges. No orphan padding. Never auto-promotes confirmed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeConstructionProjectMetrics } from '../lib/relation_network/construction_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_manual_review_phase5a2';
const NET_FP = join(ROOT, 'data', 'networks', 'construction.json');
const LOG_FP = join(ROOT, 'data', 'construction_relation_phase5a2_changelog.json');

/** Disclosed contract total = 2BL total + 3BL total; company share = 2BL 100% + 3BL 70%. */
const WIRYE_CONTRACT_TOTAL = 3039406100000;
const WIRYE_COMPANY_SHARE = 2696131000000 + Math.round(343275100000 * 0.7); // 2,936,423,570,000

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
}

function findNode(id) {
  return nodes.find((n) => n.id === id);
}

function findEdge(id) {
  return edges.find((e) => e.id === id);
}

function summarizeEntity(x) {
  return {
    id: x.id,
    type: x.type,
    source: x.source ?? null,
    target: x.target ?? null,
    projectStatus: x.projectStatus ?? null,
    contractSigned: x.contractSigned ?? null,
    contractStatus: x.contractStatus ?? null,
    counterpartyDisclosure: x.counterpartyDisclosure ?? x.counterpartyStatus ?? null,
    legalContractingEntity: x.legalContractingEntity ?? null,
    legalNameKo: x.legalNameKo ?? null,
    legalNameEn: x.legalNameEn ?? null,
    constructionContractValue: x.constructionContractValue ?? null,
    companyContractValue: x.companyContractValue ?? null,
    companyShareValue: x.companyShareValue ?? null,
    contractValue: x.contractValue ?? null,
    contractValueOriginal: x.contractValueOriginal ?? x.originalContractValue ?? null,
    contractCurrency: x.contractCurrency ?? x.originalCurrency ?? null,
    disclosedValueKRW: x.disclosedValueKRW ?? null,
    convertedValueKRW: x.convertedValueKRW ?? null,
    conversionRate: x.conversionRate ?? null,
    conversionAsOf: x.conversionAsOf ?? null,
    conversionMethod: x.conversionMethod ?? null,
    equityStakePct: x.equityStakePct ?? x.ownershipPct ?? null,
    editorialStatus: x.editorialStatus ?? x.status ?? null,
    reviewStatus: x.reviewStatus ?? x.evidence?.[0]?.reviewStatus ?? null,
    directEvidence: x.directEvidence ?? x.evidence?.[0]?.directEvidence ?? null,
    primarySource: x.evidence?.[0]?.primarySource ?? null,
    sourceType: x.evidence?.[0]?.sourceType ?? null,
    evidenceUrl: x.evidence?.[0]?.url ?? null,
    rcpNo: x.evidence?.[0]?.rcpNo ?? null,
    defaultHidden: x.defaultHidden ?? null,
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
    publisher: p.publisher || null,
    publishedAt: p.publishedAt || null,
    evidenceIdentifier: p.evidenceIdentifier || null,
    evidenceSummaryKo: p.evidenceSummaryKo || '',
    evidenceSummaryEn: p.evidenceSummaryEn || '',
    relationshipSupported: p.relationshipSupported || '',
    amountSupported: p.amountSupported ?? null,
    statusSupported: p.statusSupported ?? null,
    rcpNo: p.rcpNo || null,
    kindAcptNo: p.kindAcptNo || null,
    dcmNo: p.dcmNo || null,
    supersedes: p.supersedes || null,
    supersededBy: p.supersededBy || null,
    correctionChain: p.correctionChain || null,
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

function patchNode(id, after, reason, category, meta = {}) {
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
    primaryEvidenceUrl: meta.url || n.evidence?.[0]?.url || null,
    rcpNo: meta.rcpNo || n.evidence?.[0]?.rcpNo || null,
    correctionChain: meta.correctionChain || n.evidence?.[0]?.correctionChain || null,
    legalEntityCorrection: meta.legalEntityCorrection || null,
    counterpartyCorrection: meta.counterpartyCorrection || null,
    lifecycleCorrection: meta.lifecycleCorrection || null,
    amountCorrection: meta.amountCorrection || null,
    statusCorrection: meta.statusCorrection || null,
    reviewedAt: AS_OF,
    reviewedBy: BY,
  });
}

function patchEdge(id, after, reason, category, meta = {}) {
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
    primaryEvidenceUrl: meta.url || e.evidence?.[0]?.url || null,
    rcpNo: meta.rcpNo || e.evidence?.[0]?.rcpNo || null,
    correctionChain: meta.correctionChain || e.evidence?.[0]?.correctionChain || null,
    legalEntityCorrection: meta.legalEntityCorrection || null,
    counterpartyCorrection: meta.counterpartyCorrection || null,
    lifecycleCorrection: meta.lifecycleCorrection || null,
    amountCorrection: meta.amountCorrection || null,
    statusCorrection: meta.statusCorrection || null,
    reviewedAt: AS_OF,
    reviewedBy: BY,
  });
}

function dartUrl(rcpNo) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcpNo}`;
}

function kindUrl(acpt) {
  return `https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=${acpt}`;
}

// ——— 1) Qatar Dukhan Solar EPIC (028260) ———
// Signed DART rcpNo not resolved after KIND/Awake scan; LOA DART known; latest effective terms from 2026-08-19 correction republication.
{
  const loaRcp = '20250825800525';
  const signedFilingDate = '2025-12-12';
  const correctionDate = '2026-08-19';
  const correctionChain = {
    originalFilingDate: signedFilingDate,
    originalTitle: '단일판매ㆍ공급계약체결 (Dukhan Solar EPIC)',
    latestCorrectionDate: correctionDate,
    latestCorrectionTitle: '(정정)단일판매ㆍ공급계약체결',
    correctionReason: '계약기간 변경 (종료일 2030-02-28 → 2030-06-30)',
    originalSignedRcpNo: null,
    latestCorrectionRcpNo: null,
    loaRcpNo: loaRcp,
    note: '본계약·정정 DART rcpNo는 KIND/Awake 스캔으로 미확정. LOA rcpNo만 DART ID 확정. 최신 유효 조건은 정정공시 재전송표(종료일 2030-06-30) 기준.',
  };
  const dartLoa = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceOpened: true,
    sourceType: 'dart',
    evidenceUsageType: 'exact_project_document',
    title: '삼성물산 — Dukhan Solar LOA (DART 투자판단관련주요경영사항)',
    url: dartUrl(loaRcp),
    publisher: 'DART / 삼성물산',
    publishedAt: '2025-08-25',
    rcpNo: loaRcp,
    evidenceIdentifier: `DART rcpNo=${loaRcp} LOA; superseded by signed contract 2025-12-11 / filed ${signedFilingDate}`,
    relationshipSupported: 'epc_for|krx:028260|epc-project:qatar-dukhan-solar|org:qatar-energy',
    amountSupported: false,
    statusSupported: 'letter_of_award_pre_contract',
    supersededBy: { filingDate: signedFilingDate, title: '단일판매ㆍ공급계약체결' },
    correctionChain,
    evidenceSummaryKo: 'DART 원문 타이틀·AwakePlus 요지 확인: LOA 수령. 본계약·금액은 후속 단일판매공시.',
    evidenceSummaryEn: 'DART LOA filing confirmed. Amounts/signed terms come from later supply-contract filing.',
  });
  const latestRepub = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: false,
    sourceOpened: true,
    sourceType: 'disclosure_republication',
    evidenceUsageType: 'exact_project_document',
    title: '삼성물산 (정정)단일판매ㆍ공급계약체결 — Dukhan EPIC (KOSCOM/Sedaily·Thinkpool)',
    url: 'https://www.sedaily.com/market/domesticStock/stockNotice/841904',
    publisher: 'KOSCOM via Sedaily / Thinkpool',
    publishedAt: correctionDate,
    evidenceIdentifier: `Latest correction republication ${correctionDate}; original filed ${signedFilingDate}; USD 1,047,382,760.80 × 1,470.40 = KRW 1,540,071,611,480 disclosed; QatarEnergy; EPIC; end 2030-06-30`,
    relationshipSupported: 'epc_for|krx:028260|epc-project:qatar-dukhan-solar|org:qatar-energy',
    amountSupported: true,
    statusSupported: 'contract_signed',
    supersedes: { filingDate: signedFilingDate, endDateBefore: '2030-02-28' },
    correctionChain,
    evidenceSummaryKo: '최신 유효 정정(2026-08-19): 종료일 2030-06-30. 계약금액은 공시 원화환산액(disclosedValueKRW). DART rcp 미확정→primarySource=false.',
    evidenceSummaryEn: 'Latest correction end date 2030-06-30. KRW is disclosed FX conversion. Signed DART rcp unresolved→primarySource=false.',
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
    contractCurrency: 'USD',
    contractValueOriginal: 1047382760.80,
    originalCurrency: 'USD',
    originalContractValue: 1047382760.80,
    disclosedValueKRW: 1540071611480,
    convertedValueKRW: 1540071611480,
    conversionRate: 1470.40,
    conversionAsOf: '2025-12-11',
    conversionMethod: 'disclosure_stated_first_trading_base_rate',
    constructionContractValue: 1540071611480,
    companyContractValue: 1540071611480,
    companyShareValue: 1540071611480,
    contractValue: 1540071611480,
    projectTotalValue: null,
    totalProjectValue: null,
    companyParticipationPct: 100,
    equityStakePct: null,
    currency: 'KRW',
    valueType: 'company_contract_share',
    validFrom: '2025-12-11',
    validTo: null,
    contractStartDate: '2025-09-01',
    targetCommercialOperationDate: '2030-06-30',
    correctionChain,
    primarySourcePending: 'signed_and_correction_dart_rcp',
    noteKo: 'EPIC 본계약. 1.54조=공시 원화환산(disclosedValueKRW). LOA DART rcp=20250825800525. 본계약/정정 DART rcp는 human review. 현지법인 경유 여부 공시 미기재.',
    noteEn: 'EPIC signed. KRW 1.54tn is disclosure FX. LOA DART known; signed/correction DART rcp pending human review.',
    evidence: [latestRepub, dartLoa],
  }, 'Dukhan: LOA DART primary + latest correction republication; FX fields split; remove unverified CO2 rcp usage', 'evidence', {
    url: latestRepub.url,
    rcpNo: loaRcp,
    correctionChain,
    amountCorrection: 'disclosedValueKRW=1,540,071,611,480; contractValueOriginal=USD 1,047,382,760.80',
    lifecycleCorrection: 'endDate latest=2030-06-30 via 2026-08-19 correction',
    counterpartyCorrection: 'QatarEnergy exact from disclosure table',
  });

  const ownerEv = mkEv({
    ...latestRepub,
    relationshipSupported: 'project_owner|org:qatar-energy|epc-project:qatar-dukhan-solar',
    title: 'QatarEnergy as disclosed contract counterparty (latest correction table)',
  });
  patchEdge('e-dukhan-owner', {
    ...reviewedEdgeFields(ownerEv),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [ownerEv, dartLoa],
  }, 'Owner from latest effective disclosure table; LOA DART supporting', 'counterparty', {
    url: ownerEv.url, rcpNo: loaRcp, correctionChain,
    counterpartyCorrection: 'QatarEnergy',
  });

  const epcEv = mkEv({
    ...latestRepub,
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
    contractCurrency: 'USD',
    contractValueOriginal: 1047382760.80,
    originalCurrency: 'USD',
    originalContractValue: 1047382760.80,
    disclosedValueKRW: 1540071611480,
    convertedValueKRW: 1540071611480,
    conversionAsOf: '2025-12-11',
    conversionRate: 1470.40,
    conversionMethod: 'disclosure_stated_first_trading_base_rate',
    companyParticipationPct: 100,
    valueType: 'company_contract_share',
    validFrom: '2025-12-11',
    evidence: [epcEv, dartLoa],
  }, 'Samsung EPIC: keep reported; amount semantics + LOA DART chain', 'amount_semantics', {
    url: epcEv.url, rcpNo: loaRcp, correctionChain,
    amountCorrection: 'disclosed KRW vs USD original separated',
  });
}

// ——— 2) Wirye Bokjeong 2BL·3BL (000720) ———
{
  const rcpNo = '20260608800044';
  const kindAcptNo = '20260608000044';
  const dcmNo = '11421460';
  const url = dartUrl(rcpNo);
  const supportUrl = 'https://economyreports.com/filings/20260608-hyundai-engineering-andamp-construction-coltd-major-contract-20260608800044';
  const identifier = `DART rcpNo=${rcpNo} / KIND ${kindAcptNo} / dcmNo=${dcmNo}; 송파비즈클러스터피에프브이 주식회사; 계약금액 3,039,406,100,000; 2BL 2,696,131,000,000(100%) + 3BL 343,275,100,000(70%→당사분 240,292,570,000)`;

  const primary = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceOpened: true,
    sourceType: 'dart',
    evidenceUsageType: 'exact_project_document',
    title: '현대건설 — 위례 복정 2BL·3BL 단일판매ㆍ공급계약체결 (DART)',
    url,
    publisher: 'DART / 현대건설',
    publishedAt: '2026-06-08',
    rcpNo,
    kindAcptNo,
    dcmNo,
    evidenceIdentifier: identifier,
    relationshipSupported: 'main_contractor|krx:000720|construction-project:wirye-bokjeong-mixed|pfv:songpa-biz-cluster',
    amountSupported: true,
    statusSupported: 'contract_signed',
    evidenceSummaryKo: 'DART 원문(rcp/dcm) 개봉: PFV 정식명·2BL/3BL 금액·당사분 70%/100%. 지분율% 없음. 계약총액≠회사 귀속액.',
    evidenceSummaryEn: 'Opened DART body: PFV legal name; block totals; company shares 100%/70%. Stake % absent.',
  });
  const support = mkEv({
    ...primary,
    primarySource: false,
    sourceType: 'disclosure_republication',
    url: supportUrl,
    publisher: 'EconomyReports FILINGS extract',
    title: 'Wirye filing extract (supporting)',
  });

  patchNode('construction-project:wirye-bokjeong-mixed', {
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: '송파비즈클러스터피에프브이 주식회사',
    constructionContractValue: WIRYE_CONTRACT_TOTAL,
    contractValue: WIRYE_CONTRACT_TOTAL,
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
    aggregationReview: 'needs_review',
    aggregationReviewNote: '단일 공시·단일 프로젝트 노드 유지. 블록별 기간/상태가 달라지면 분리 검토.',
    validFrom: '2026-06-05',
    validTo: null,
    contractStartDate: '2026-06-15',
    targetCommercialOperationDate: '2031-01-14',
    noteKo: 'DART 원문 기준. 계약총액 3.039조=블록 총액 합. 회사 귀속=2BL 100%+3BL 70%=2.936조. PFV 지분율 null.',
    noteEn: 'DART primary. Contract total 3.039tn; company share 2.936tn. PFV stake% null.',
    evidence: [primary, support],
  }, 'Wirye: promote DART primary; keep company-share arithmetic; aggregationReview flag', 'evidence', {
    url, rcpNo,
    amountCorrection: `companyShare=${WIRYE_COMPANY_SHARE} (2BL100%+3BL70%); contractTotal=${WIRYE_CONTRACT_TOTAL}`,
    legalEntityCorrection: '송파비즈클러스터피에프브이 주식회사',
  });

  patchNode('pfv:songpa-biz-cluster', {
    nameKo: '송파비즈클러스터피에프브이 주식회사',
    nameEn: 'Songpa Biz Cluster PFV Co., Ltd.',
    legalNameKo: '송파비즈클러스터피에프브이 주식회사',
    noteKo: 'DART 계약상대·현대건설 최대주주. 지분율% 원문 미기재→null. 최대주주≠자동 developer.',
    noteEn: 'DART counterparty; Hyundai largest shareholder. Stake% null. Largest shareholder ≠ auto developer.',
  }, 'PFV legal name from DART', 'legal_entity', { url, rcpNo });

  patchEdge('e-wirye-pfv-owner', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [mkEv({ ...primary, relationshipSupported: 'project_owner|pfv:songpa-biz-cluster|construction-project:wirye-bokjeong-mixed' })],
  }, 'PFV owner from DART counterparty', 'counterparty', { url, rcpNo });

  patchEdge('e-wirye-hyundai-pfv-stake', {
    ...reviewedEdgeFields(primary),
    ownershipPct: null,
    equityStakePct: null,
    ownershipKind: 'largest_shareholder_disclosed',
    evidence: [mkEv({
      ...primary,
      relationshipSupported: 'pfv_shareholder|krx:000720|pfv:songpa-biz-cluster',
      amountSupported: false,
      evidenceSummaryKo: 'DART: 최대주주 문구만. 지분율% 없음→null.',
      evidenceSummaryEn: 'DART largest-shareholder wording only; % null.',
    })],
  }, 'Stake % remains null under DART', 'counterparty', { url, rcpNo });

  patchEdge('e-wirye-hyundai-mc', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'contract_signed',
    contractSigned: true,
    companyContractValue: WIRYE_COMPANY_SHARE,
    companyShareValue: WIRYE_COMPANY_SHARE,
    contractValue: WIRYE_CONTRACT_TOTAL,
    currency: 'KRW',
    valueType: 'company_contract_share',
    evidence: [mkEv({ ...primary, relationshipSupported: 'main_contractor|krx:000720|construction-project:wirye-bokjeong-mixed' })],
  }, 'MC amounts from DART block shares', 'amount_semantics', {
    url, rcpNo,
    amountCorrection: `companyShare=${WIRYE_COMPANY_SHARE}`,
  });

  const devEv = mkEv({
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    directEvidence: false,
    primarySource: true,
    sourceOpened: true,
    sourceType: 'dart',
    evidenceUsageType: 'supporting_context',
    title: 'Developer role not named in DART — inferred only',
    url,
    publisher: 'DART / 현대건설',
    publishedAt: '2026-06-08',
    rcpNo,
    kindAcptNo,
    dcmNo,
    evidenceIdentifier: identifier,
    relationshipSupported: 'project_developer|krx:000720|construction-project:wirye-bokjeong-mixed',
    amountSupported: false,
    statusSupported: null,
    evidenceSummaryKo: 'DART가 project_developer를 직접 명명하지 않음. 최대주주+시공 추론만 → inferred/hidden.',
    evidenceSummaryEn: 'DART does not name developer. Inferred from largest shareholder + MC → hidden.',
  });
  patchEdge('e-wirye-hyundai-developer', {
    editorialStatus: 'inferred',
    status: 'inferred',
    defaultHidden: true,
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    directEvidence: false,
    projectStatus: 'contract_signed',
    evidence: [devEv],
  }, 'Developer stays inferred + defaultHidden (not DART-named)', 'entity_role', { url, rcpNo });
}

// ——— 3) Busan Sajik3 (006360) ———
{
  const rcpNo = '20260807800114';
  const kindAcptNo = '20260807000114';
  const url = dartUrl(rcpNo);
  const supportUrl = 'https://www.thinkpool.com/item/006360/disclosures/all/569243';
  const identifier = `DART rcpNo=${rcpNo} / KIND ${kindAcptNo}; 사직3구역 재개발정비사업조합; 408,232,163,334 VAT별도; 수주 2026-08-06; 실착공일부터 42개월`;

  const primary = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceOpened: true,
    sourceType: 'dart',
    evidenceUsageType: 'exact_project_document',
    title: 'GS건설 — 사직3구역 재개발 단일판매ㆍ공급계약체결 (DART)',
    url,
    publisher: 'DART / GS건설',
    publishedAt: '2026-08-07',
    rcpNo,
    kindAcptNo,
    evidenceIdentifier: identifier,
    relationshipSupported: 'main_contractor|krx:006360|construction-project:busan-sajik3-redev|org:sajik3-redev-union',
    amountSupported: true,
    statusSupported: 'contract_signed',
    evidenceSummaryKo: 'DART/KIND ID·AwakePlus·Thinkpool 표 대조: 조합 발주, GS 도급, 공동도급 미기재→단독, 착공 전.',
    evidenceSummaryEn: 'DART/KIND + table cross-check: union award, GS solo MC, pre-groundbreaking.',
  });
  const support = mkEv({
    ...primary,
    primarySource: false,
    sourceType: 'disclosure_republication',
    url: supportUrl,
    publisher: 'Thinkpool',
    title: 'Sajik3 Thinkpool disclosure table (supporting)',
  });

  patchNode('org:sajik3-redev-union', {
    nameKo: '사직3구역 재개발정비사업조합',
    nameEn: 'Sajik Zone 3 Redevelopment Association',
    legalNameKo: '사직3구역 재개발정비사업조합',
    role: 'project_owner',
  }, 'Union legal name from DART counterparty field', 'legal_entity', { url, rcpNo });

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
    noteKo: 'DART 원문 ID 확정. 조합=발주/소유, GS=시공. 도급액≠총사업비. 관리처분·착공 상태와 계약체결 상태 분리(현재 contract_signed).',
    noteEn: 'DART ID confirmed. Union owner; GS MC. Contract≠total cost. Presale/groundbreaking separate from contract_signed.',
    evidence: [primary, support],
  }, 'Sajik3: DART primary; union/legal party; signed≠under_construction', 'evidence', {
    url, rcpNo,
    legalEntityCorrection: '사직3구역 재개발정비사업조합',
    amountCorrection: '408,232,163,334 company=contract (solo)',
  });

  patchEdge('e-sajik-owner', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [mkEv({ ...primary, relationshipSupported: 'project_owner|org:sajik3-redev-union|construction-project:busan-sajik3-redev' })],
  }, 'Union owner from DART', 'counterparty', { url, rcpNo });

  patchEdge('e-sajik-gs-mc', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'contract_signed',
    contractSigned: true,
    companyContractValue: 408232163334,
    companyShareValue: 408232163334,
    contractValue: 408232163334,
    currency: 'KRW',
    valueType: 'company_contract_share',
    evidence: [mkEv({ ...primary, relationshipSupported: 'main_contractor|krx:006360|construction-project:busan-sajik3-redev' })],
  }, 'GS MC from DART', 'amount_semantics', { url, rcpNo });
}

// ——— 4) Yongsan Jeongbichang Z1 (294870) ———
{
  const rcpNo = '20260205800384';
  const kindAcptNo = '20260205000384';
  const url = dartUrl(rcpNo);
  const supportUrl = 'https://www.digitaltoday.co.kr/news/articleView.html?idxno=627464';
  const identifier = `DART rcpNo=${rcpNo} (filer IPARK현대산업개발) / KIND ${kindAcptNo}; 정비창전면제1구역재개발정비사업조합; 924,430,915,470; 2026-02-05`;

  const primary = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceOpened: true,
    sourceType: 'dart',
    evidenceUsageType: 'exact_project_document',
    title: 'IPARK현대산업개발 — 정비창전면 제1구역 단일판매ㆍ공급계약체결 (DART)',
    url,
    publisher: 'DART / IPARK현대산업개발(HDC 294870)',
    publishedAt: '2026-02-05',
    rcpNo,
    kindAcptNo,
    evidenceIdentifier: identifier,
    relationshipSupported: 'main_contractor|krx:294870|construction-project:yongsan-jeongbichang-zone1|org:yongsan-jeongbichang-zone1-union',
    amountSupported: true,
    statusSupported: 'contract_signed',
    evidenceSummaryKo: 'DART 제출법인=IPARK현대산업개발(상장 294870). 계약상대=정비창전면제1구역재개발정비사업조합. IPARK 브랜드≠당사자.',
    evidenceSummaryEn: 'DART filer IPARK현대산업개발 (ticker 294870). Counterparty=union. Brand IPARK is not a party.',
  });
  const support = mkEv({
    ...primary,
    primarySource: false,
    sourceType: 'press',
    url: supportUrl,
    publisher: 'DigitalToday',
    title: 'Yongsan press with embedded table (supporting)',
  });

  patchNode('org:yongsan-jeongbichang-zone1-union', {
    nameKo: '정비창전면제1구역재개발정비사업조합',
    nameEn: 'Yongsan Rail Yard Front Zone 1 Redevelopment Association',
    legalNameKo: '정비창전면제1구역재개발정비사업조합',
  }, 'Union legal name from DART/AwakePlus', 'legal_entity', { url, rcpNo });

  patchNode('construction-project:yongsan-jeongbichang-zone1', {
    projectStatus: 'contract_signed',
    contractSigned: true,
    contractStatus: 'effective',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: '정비창전면제1구역재개발정비사업조합',
    legalContractingEntity: 'IPARK현대산업개발',
    legalContractingEntityEn: 'IPARK HDC Hyundai Development Co. (ticker 294870)',
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
    noteKo: 'DART 원문. 시공 당사자=IPARK현대산업개발(294870). brand:ipark는 operates_brand만. 공동도급 미기재.',
    noteEn: 'DART primary. Contractor=IPARK현대산업개발 (294870). brand:ipark display-only via operates_brand.',
    evidence: [primary, support],
  }, 'Yongsan: DART primary; brand≠party; filer legal name', 'legal_entity', {
    url, rcpNo,
    legalEntityCorrection: 'filer IPARK현대산업개발; counterparty union',
    counterpartyCorrection: '정비창전면제1구역재개발정비사업조합',
  });

  patchEdge('e-yongsan-owner', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'contract_signed',
    contractSigned: true,
    evidence: [mkEv({ ...primary, relationshipSupported: 'project_owner|org:yongsan-jeongbichang-zone1-union|construction-project:yongsan-jeongbichang-zone1' })],
  }, 'Union owner from DART', 'counterparty', { url, rcpNo });

  patchEdge('e-yongsan-hdc-mc', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'contract_signed',
    contractSigned: true,
    companyContractValue: 924430915470,
    companyShareValue: 924430915470,
    contractValue: 924430915470,
    currency: 'KRW',
    valueType: 'company_contract_share',
    evidence: [mkEv({ ...primary, relationshipSupported: 'main_contractor|krx:294870|construction-project:yongsan-jeongbichang-zone1' })],
  }, 'HDC/IPARK MC from DART — brand not party', 'evidence', { url, rcpNo });
}

// ——— 5) Mozambique Rovuma LNG (047040) ———
{
  const rcpNo = '20260807800011';
  const kindAcptNo = '20260807000011';
  const dcmNo = '11513354';
  const url = dartUrl(rcpNo);
  const supportUrl = 'https://www.yna.co.kr/view/AKR20260807039200003';
  const identifier = `DART rcpNo=${rcpNo} / KIND ${kindAcptNo} / dcmNo=${dcmNo}; LOI from ExxonMobil Mozambique Limitada; pre-EPC early works; JV share TBD; not final contract`;

  const primary = mkEv({
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    directEvidence: true,
    primarySource: true,
    sourceOpened: true,
    sourceType: 'dart',
    evidenceUsageType: 'exact_project_document',
    title: '대우건설 — Rovuma LNG LOI 수령 (DART 기타경영사항)',
    url,
    publisher: 'DART / 대우건설',
    publishedAt: '2026-08-07',
    rcpNo,
    kindAcptNo,
    dcmNo,
    evidenceIdentifier: identifier,
    relationshipSupported: 'preferred_bidder_for|krx:047040|epc-project:mozambique-rovuma-lng-phase1|org:exxonmobil-mozambique',
    amountSupported: false,
    statusSupported: 'preferred_bidder_pre_contract',
    evidenceSummaryKo: 'DART: 당사(대우건설)가 ExxonMobil Mozambique Limitada로부터 LOI 수령. 본계약 전 사전설계·구매·시공성검토. 합작법인 지분 미확정. SMDC/SNDC 명칭 없음. 금액 없음.',
    evidenceSummaryEn: 'DART: Daewoo received LOI from ExxonMobil Mozambique Limitada. Pre-EPC early works. JV share TBD. No SMDC/SNDC name. No amount.',
  });
  const support = mkEv({
    ...primary,
    primarySource: false,
    sourceType: 'press',
    url: supportUrl,
    publisher: 'Yonhap',
    title: 'Rovuma LOI press (supporting; SMDC naming press-only)',
    relationshipSupported: 'preferred_bidder_for|krx:047040|epc-project:mozambique-rovuma-lng-phase1',
    evidenceSummaryKo: '언론 SMDC/SNDC 표기는 DART 미기재→보조만.',
    evidenceSummaryEn: 'Press SMDC/SNDC acronym not in DART — supporting only.',
  });

  patchNode('org:exxonmobil-mozambique', {
    nameKo: '엑손모빌 모잠비크 리미타다',
    nameEn: 'ExxonMobil Mozambique Limitada',
    legalNameEn: 'ExxonMobil Mozambique Limitada',
    legalNameKo: 'ExxonMobil Mozambique Limitada',
    role: 'project_sponsor_operator',
    noteKo: 'DART상 LOI 발행·사업주 대표사. 전체 자원개발 컨소시엄 소유구조와 별개로 LOI 상대방으로 기록.',
    noteEn: 'DART LOI issuer / project-sponsor representative. Distinct from full upstream ownership stack.',
  }, 'Legal name ExxonMobil Mozambique Limitada from DART', 'legal_entity', {
    url, rcpNo,
    legalEntityCorrection: 'ExxonMobil Mozambique Limitada',
    counterpartyCorrection: 'LOI counterparty exact',
  });

  patchNode('consortium:smdc-jv', {
    nameKo: 'SMDC/SNDC JV(언론 약칭·미확정)',
    nameEn: 'SMDC/SNDC JV (press acronym; unverified in DART)',
    consortiumName: 'SMDC/SNDC (press-only)',
    defaultHidden: true,
    noteKo: 'DART 원문에 SMDC/SNDC 공식 명칭 없음. 언론 약칭만. 법적 합작법인 미설립·지분 미확정.',
    noteEn: 'DART does not name SMDC/SNDC. Press acronym only. JV entity/shares not finalized.',
  }, 'Demote SMDC/SNDC — not in DART body', 'legal_entity', {
    url, rcpNo,
    legalEntityCorrection: 'SMDC/SNDC press-only; DART silent',
  });

  patchNode('epc-project:mozambique-rovuma-lng-phase1', {
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    contractStatus: 'pre_contract',
    counterpartyDisclosure: 'exact',
    counterpartyStatus: 'exact',
    counterpartyLegalName: 'ExxonMobil Mozambique Limitada',
    loiCounterpartyLegalName: 'ExxonMobil Mozambique Limitada',
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
    validFrom: '2026-08-05',
    validTo: null,
    statusReviewNeeded: true,
    statusReview: 'needs_review',
    defaultHidden: false,
    noteKo: 'DART LOI만. FID/NTP/본계약 없음. 금액 null. SMDC는 언론 약칭. CAPEX≠수주액.',
    noteEn: 'DART LOI only. No FID/NTP/signed EPC. Amounts null. SMDC press-only. CAPEX≠award.',
    evidence: [primary, support],
  }, 'Rovuma: DART LOI primary; keep pre_contract; amounts null', 'lifecycle', {
    url, rcpNo,
    lifecycleCorrection: 'preferred_bidder + pre_contract + contractSigned=false',
    amountCorrection: 'all amounts null',
    counterpartyCorrection: 'ExxonMobil Mozambique Limitada (LOI issuer)',
    statusCorrection: 'statusReview=needs_review (currency of LOI)',
  });

  // Preferred bidder attributed to Daewoo (당사) per DART — retarget existing edge source (no new edge).
  patchEdge('e-rovuma-preferred', {
    source: 'krx:047040',
    target: 'epc-project:mozambique-rovuma-lng-phase1',
    type: 'preferred_bidder_for',
    ...reviewedEdgeFields(primary),
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    contractStatus: 'pre_contract',
    companyContractValue: null,
    companyShareValue: null,
    contractValue: null,
    noteKo: 'DART: 대우건설 당사 LOI. 본계약 전. 컨소시엄 약칭은 당사자 아님.',
    noteEn: 'DART: Daewoo LOI recipient. Pre-contract. Consortium acronym is not the contracting party.',
    evidence: [primary, support],
  }, 'Retarget preferred_bidder_for to krx:047040 per DART 당사', 'lifecycle', {
    url, rcpNo,
    legalEntityCorrection: 'source consortium:smdc-jv → krx:047040',
    counterpartyCorrection: 'LOI issuer ExxonMobil Mozambique Limitada',
    lifecycleCorrection: 'pre_contract unchanged',
  });

  patchEdge('e-rovuma-owner', {
    ...reviewedEdgeFields(primary),
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    contractStatus: 'pre_contract',
    noteKo: '사업주 대표사(LOI 발행). 전체 upstream owner 스택과 동일시하지 않음.',
    noteEn: 'Sponsor representative / LOI issuer — not equated to full upstream owners.',
    evidence: [mkEv({
      ...primary,
      relationshipSupported: 'project_owner|org:exxonmobil-mozambique|epc-project:mozambique-rovuma-lng-phase1',
      title: 'ExxonMobil Mozambique Limitada as LOI issuer / 사업주 대표사',
    })],
  }, 'Owner/sponsor from DART LOI issuer wording', 'counterparty', {
    url, rcpNo,
    legalEntityCorrection: 'ExxonMobil Mozambique Limitada',
  });

  patchEdge('e-rovuma-consortium', {
    editorialStatus: 'inferred',
    status: 'inferred',
    defaultHidden: true,
    reviewStatus: 'needs_human_review',
    reviewedAt: null,
    reviewedBy: null,
    directEvidence: false,
    projectStatus: 'preferred_bidder',
    contractSigned: false,
    participationPct: null,
    companyShareValue: null,
    companyContractValue: null,
    evidence: [mkEv({
      reviewStatus: 'needs_human_review',
      reviewedAt: null,
      reviewedBy: null,
      directEvidence: false,
      primarySource: true,
      sourceOpened: true,
      sourceType: 'dart',
      evidenceUsageType: 'supporting_context',
      title: 'JV membership inferred — DART says JV share TBD, no SMDC name',
      url,
      publisher: 'DART / 대우건설',
      publishedAt: '2026-08-07',
      rcpNo,
      kindAcptNo,
      dcmNo,
      evidenceIdentifier: identifier,
      relationshipSupported: 'consortium_member|krx:047040|consortium:smdc-jv',
      amountSupported: false,
      evidenceSummaryKo: 'DART는 합작법인 설립 시 지분 확정 예정만 언급. SMDC 명칭·멤버 구성 원문 없음→inferred/hidden.',
      evidenceSummaryEn: 'DART only says JV share TBD. No SMDC name/members→inferred/hidden.',
    })],
  }, 'Consortium membership demoted — not named in DART', 'entity_role', {
    url, rcpNo,
    legalEntityCorrection: 'SMDC press-only; edge inferred+hidden',
  });
}

// Orphan freeze note
log({
  entityKind: 'metrics',
  edgeOrProjectId: 'orphan_metrics',
  before: { businessRelationOrphanCount: 5 },
  after: { businessRelationOrphanCount: 5, note: 'Phase 5A.2 adds no edges; orphan must remain 5' },
  reason: 'Freeze orphan metrics; no padding',
  correctionCategory: 'orphan_metric',
  primaryEvidenceUrl: null,
  rcpNo: null,
  reviewedAt: AS_OF,
  reviewedBy: BY,
});

network.nodes = nodes;
network.edges = edges;
network.phase5a2CuratedAt = AS_OF;
network.metrics = computeConstructionProjectMetrics(network);
network.metrics.phase5a2CuratedAt = AS_OF;

const report = validateNetworkReport(network);
fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({
  asOf: AS_OF,
  curatedBy: BY,
  purpose: 'Phase 5A.2 construction DART/KIND primary evidence and legal-party final audit',
  constraints: {
    noNewProjects: true,
    noNewCompanies: true,
    noNewEdges: true,
    noOrphanPadding: true,
    noConfirmedAutoPromote: true,
    constructionOnly: true,
  },
  entries: changelog,
  metricsSnapshot: network.metrics,
  validate: { failures: report.failures || [], warnings: report.warnings || [] },
}, null, 2)}\n`, 'utf8');

console.log('OK construction Phase 5A.2 →', NET_FP);
console.log('changelog entries', changelog.length);
console.log('projectEvidenceFieldCoverage', network.metrics.projectEvidenceFieldCoverage);
console.log('projectDirectEvidenceCoverage', network.metrics.projectDirectEvidenceCoverage,
  'denom', network.metrics.evidenceDenominators.projects);
console.log('projectPrimarySourceCoverage', network.metrics.projectPrimarySourceCoverage,
  'primaryCount', network.metrics.evidenceDenominators.projectsPrimarySource);
console.log('orphan business/direct/class/weak/confirmedReported',
  network.metrics.businessRelationOrphanCount,
  network.metrics.directRelationshipOrphanCount,
  network.metrics.classificationOnlyCompanyCount,
  network.metrics.weakRelationOnlyCompanyCount,
  network.metrics.confirmedReportedBusinessOrphanCount);
console.log('validate failures', (report.failures || []).length, 'warnings', (report.warnings || []).length);
if ((report.failures || []).length) {
  for (const f of (report.failures || []).slice(0, 40)) console.log(' -', f);
}
