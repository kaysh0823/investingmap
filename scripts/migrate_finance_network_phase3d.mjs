/**
 * Phase 3D — finance → data/networks/finance.json
 * model: financial_group_ecosystem / ownershipTree
 * Never auto-promotes to confirmed. No customer edges.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const OUT_NET = join(ROOT, 'data', 'networks', 'finance.json');
const OUT_LOG = join(ROOT, 'data', 'finance_relation_phase3d_changelog.json');

const html = fs.readFileSync(join(ROOT, 'finance', 'korea_finance_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);

let globals = [];
const gMatch = html.match(/const globalCompanies = (\[[\s\S]*?\n    \]);/);
if (gMatch) {
  try { globals = Function(`return (${gMatch[1]})`)(); } catch { /* ignore */ }
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
  if (!n?.id || nodeIds.has(n.id)) return false;
  nodeIds.add(n.id);
  nodes.push(n);
  return true;
}

function logChange(row) {
  changelog.push(row);
}

function addEdge(e, meta) {
  const key = `${e.source}|${e.target}|${e.type}`;
  if (edgeKeys.has(key) || e.source === e.target) return false;
  if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
  edgeKeys.add(key);
  edges.push(e);
  if (meta) logChange(meta);
  return true;
}

const CHAIN_META = {
  '은행·금융지주': { cat: 'category:bank_holding', lane: 'holding' },
  '증권·자산운용': { cat: 'category:securities_am', lane: 'securities' },
  '보험': { cat: 'category:insurance', lane: 'insurance' },
  '카드·캐피탈': { cat: 'category:card_capital', lane: 'card_capital' },
  '기타금융': { cat: 'category:other_finance', lane: 'independent' },
};

for (const [id, ko, en, lane] of [
  ['category:bank_holding', '은행·금융지주', 'Banks & financial holdings', 'holding'],
  ['category:securities_am', '증권·자산운용', 'Securities & asset management', 'securities'],
  ['category:insurance', '보험', 'Insurance', 'insurance'],
  ['category:card_capital', '카드·캐피탈', 'Card & capital', 'card_capital'],
  ['category:other_finance', '기타금융', 'Other finance', 'independent'],
  ['category:bank', '은행', 'Banks', 'bank'],
  ['category:life_insurance', '생명보험', 'Life insurance', 'insurance'],
  ['category:nonlife_insurance', '손해보험', 'Non-life insurance', 'insurance'],
]) {
  addNode({
    id, type: 'category', nameKo: ko, nameEn: en,
    role: 'category', layer: ko, lane,
  });
}

for (const [id, ko, en] of [
  ['group:samsung', '삼성 기업집단', 'Samsung Group'],
  ['group:hanwha', '한화 기업집단', 'Hanwha Group'],
  ['group:hyundai_motor', '현대자동차 기업집단', 'Hyundai Motor Group'],
  ['group:nonghyup', '농협금융', 'Nonghyup Financial Group'],
  ['group:mirae_asset', '미래에셋', 'Mirae Asset'],
]) {
  addNode({
    id, type: 'corporate_group', nameKo: ko, nameEn: en,
    role: 'corporate_group', layer: '기업집단', lane: 'group',
    noteKo: '동일 기업집단 소속 표시이며 직접 지분관계를 의미하지 않습니다.',
    noteEn: 'Corporate-group membership only; not direct ownership.',
  });
}

for (const [id, ko, en, role, parentTicker] of [
  ['kr:kb_kookmin_bank', 'KB국민은행', 'KB Kookmin Bank', 'bank', '105560'],
  ['kr:shinhan_bank', '신한은행', 'Shinhan Bank', 'bank', '055550'],
  ['kr:hana_bank', '하나은행', 'Hana Bank', 'bank', '086790'],
  ['kr:woori_bank', '우리은행', 'Woori Bank', 'bank', '316140'],
  ['kr:kb_securities', 'KB증권', 'KB Securities', 'securities_company', '105560'],
  ['kr:shinhan_investment', '신한투자증권', 'Shinhan Securities', 'securities_company', '055550'],
  ['kr:hana_securities', '하나증권', 'Hana Securities', 'securities_company', '086790'],
  ['kr:meritz_fire', '메리츠화재', 'Meritz Fire & Marine', 'nonlife_insurer', '138040'],
  ['kr:korea_investment_securities', '한국투자증권', 'Korea Investment & Securities', 'securities_company', '071050'],
]) {
  addNode({
    id,
    type: 'domestic_unlisted_company',
    nameKo: ko,
    nameEn: en,
    role,
    layer: role === 'bank' ? '은행' : (String(role).includes('insur') ? '보험' : '증권·자산운용'),
    lane: role === 'bank' ? 'bank' : (String(role).includes('insur') ? 'insurance' : 'securities'),
    isListedKorea: false,
    parentHoldingTicker: parentTicker,
    noteKo: '비상장 계열사 (그래프 참고 노드)',
    noteEn: 'Unlisted affiliate (graph reference node)',
  });
}

function refineRole(c) {
  const n = `${c.name}${c.nameEn || ''}${c.chain}`;
  if (/기업은행|INDUSTRIALBANK/i.test(n)) return 'bank';
  if (/금융지주|Financial Group|지주/.test(n)) return 'financial_holding_company';
  if (/생명|Life/.test(n)) return 'life_insurer';
  if (c.chain === '보험') return 'nonlife_insurer';
  if (/카드|CARD/i.test(n)) return 'card_company';
  if (/증권|Securities/i.test(n)) return 'securities_company';
  if (/벤처투자|IB투자|기술투자|리얼티|Asset|운용/i.test(n)) return 'asset_manager';
  if (c.chain === '은행·금융지주') return 'financial_holding_company';
  return 'listed_company';
}

function laneFor(role) {
  if (role === 'financial_holding_company') return 'holding';
  if (role === 'bank') return 'bank';
  if (String(role).includes('insur')) return 'insurance';
  if (role === 'card_company') return 'card_capital';
  if (role === 'securities_company' || role === 'asset_manager') return 'securities';
  return 'independent';
}

for (const c of companies) {
  const id = `krx:${c.ticker}`;
  const role = refineRole(c);
  const meta = CHAIN_META[c.chain] || CHAIN_META['기타금융'];
  addNode({
    id,
    type: 'listed_company',
    ticker: c.ticker,
    nameKo: c.name,
    nameEn: c.nameEn || c.name,
    market: c.market || '',
    role,
    financeRole: role,
    group: c.chain,
    layer: c.chain,
    lane: laneFor(role),
    mcapWon: c.mcapWon ?? null,
    isListedKorea: true,
    legacyId: c.id,
  });

  if (addEdge({
    id: `member-${c.ticker}-${meta.cat.replace(':', '-')}`,
    source: id,
    target: meta.cat,
    type: 'member_of',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: `${c.chain} 분류`,
    labelEn: `${c.chain} classification`,
    evidence: [],
    confidence: 'high',
    lastVerifiedAt: AS_OF,
    edgeOrigin: 'structuralGenerated',
    noteKo: '업종 분류이며 지배·거래를 의미하지 않습니다.',
    noteEn: 'Sector classification only; not ownership or trade.',
  }, {
    legacyEdgeId: null, source: id, target: meta.cat,
    beforeType: '(none)', afterType: 'member_of',
    beforeStatus: '(none)', afterStatus: 'reference',
    origin: 'structuralGenerated', reason: 'cp_list chain → member_of',
  })) structuralGenerated += 1;

  if (role === 'life_insurer' && addEdge({
    id: `member-${c.ticker}-life`,
    source: id, target: 'category:life_insurance', type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: '생명보험', labelEn: 'Life insurance',
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    edgeOrigin: 'structuralGenerated',
  })) structuralGenerated += 1;

  if (role === 'nonlife_insurer' && addEdge({
    id: `member-${c.ticker}-nonlife`,
    source: id, target: 'category:nonlife_insurance', type: 'member_of',
    direction: 'source_to_target', status: 'reference',
    labelKo: '손해보험', labelEn: 'Non-life insurance',
    evidence: [], confidence: 'high', lastVerifiedAt: AS_OF,
    edgeOrigin: 'structuralGenerated',
  })) structuralGenerated += 1;
}

for (const g of globals) {
  if (!g?.id) continue;
  addNode({
    id: `global:${g.id}`,
    type: 'global_company',
    nameKo: g.name || g.id,
    nameEn: g.nameEn || g.name || g.id,
    role: g.sector || 'global_finance',
    region: g.region || '',
    lane: 'peer',
    legacyId: g.id,
  });
}

for (const [parent, child, ko, en] of [
  ['105560', 'kr:kb_kookmin_bank', 'KB국민은행', 'KB Kookmin Bank'],
  ['105560', 'kr:kb_securities', 'KB증권', 'KB Securities'],
  ['055550', 'kr:shinhan_bank', '신한은행', 'Shinhan Bank'],
  ['055550', 'kr:shinhan_investment', '신한투자증권', 'Shinhan Securities'],
  ['086790', 'kr:hana_bank', '하나은행', 'Hana Bank'],
  ['086790', 'kr:hana_securities', '하나증권', 'Hana Securities'],
  ['316140', 'kr:woori_bank', '우리은행', 'Woori Bank'],
  ['138040', 'kr:meritz_fire', '메리츠화재', 'Meritz Fire & Marine'],
  ['071050', 'kr:korea_investment_securities', '한국투자증권', 'Korea Investment & Securities'],
]) {
  if (addEdge({
    id: `owns-${parent}-${child.replace(/:/g, '-')}`,
    source: `krx:${parent}`,
    target: child,
    type: 'owns',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: `핵심 자회사 (${ko})`,
    labelEn: `Core subsidiary (${en})`,
    stakePct: null,
    ownershipKind: 'direct',
    asOf: null,
    evidence: [],
    confidence: 'medium',
    lastVerifiedAt: AS_OF,
    edgeOrigin: 'manuallyCurated',
    noteKo: '금융지주 핵심 자회사 구조 참고. 지분율·개별 출자공시 URL 미첨부 → reference.',
    noteEn: 'Core holding→sub structure. stakePct null / no filing URL → reference only.',
  }, {
    legacyEdgeId: null, source: `krx:${parent}`, target: child,
    beforeType: '(none)', afterType: 'owns',
    beforeStatus: '(none)', afterStatus: 'reference',
    origin: 'manuallyCurated',
    reason: 'holding → core unlisted sub as reference owns',
  })) manuallyCurated += 1;
}

for (const [ticker, gid] of [
  ['032830', 'group:samsung'],
  ['000810', 'group:samsung'],
  ['029780', 'group:samsung'],
  ['016360', 'group:samsung'],
  ['088350', 'group:hanwha'],
  ['000370', 'group:hanwha'],
  ['003530', 'group:hanwha'],
  ['001500', 'group:hyundai_motor'],
  ['005940', 'group:nonghyup'],
  ['006800', 'group:mirae_asset'],
  ['100790', 'group:mirae_asset'],
  ['094800', 'group:mirae_asset'],
]) {
  if (!nodeIds.has(`krx:${ticker}`) || !nodeIds.has(gid)) continue;
  if (addEdge({
    id: `groupmember-${ticker}-${gid.replace(/:/g, '-')}`,
    source: `krx:${ticker}`,
    target: gid,
    type: 'group_member',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '기업집단 소속',
    labelEn: 'Corporate group membership',
    evidence: [],
    confidence: 'medium',
    lastVerifiedAt: AS_OF,
    edgeOrigin: 'manuallyCurated',
    noteKo: '동일 기업집단 소속이며 직접 지분·지배관계를 의미하지 않습니다.',
    noteEn: 'Same corporate group; not direct ownership/control.',
  }, {
    legacyEdgeId: null, source: `krx:${ticker}`, target: gid,
    beforeType: '(none)', afterType: 'group_member',
    beforeStatus: '(none)', afterStatus: 'reference',
    origin: 'manuallyCurated',
    reason: 'corporate group membership (not owns)',
  })) manuallyCurated += 1;
}

for (const c of companies) {
  const src = `krx:${c.ticker}`;
  for (const p of c.partners || []) {
    const legacyEdgeId = `legacy-${c.id}-${typeof p === 'string' ? p : p.id}`;
    if (typeof p !== 'string') {
      removedUnsupported += 1;
      logChange({
        legacyEdgeId, source: src, target: String(p.id || '?'),
        beforeType: 'partner', afterType: '(removed)',
        beforeStatus: 'legacy', afterStatus: '(removed)',
        origin: 'legacyMigrated', reason: 'unsupported partner object',
      });
      continue;
    }
    const gid = `global:${p}`;
    if (!nodeIds.has(gid)) {
      addNode({
        id: gid, type: 'global_company', nameKo: p, nameEn: p,
        role: 'global_peer', lane: 'peer', legacyId: p,
      });
    }
    if (addEdge({
      id: `peer-${c.ticker}-${p}`,
      source: src,
      target: gid,
      type: 'peer',
      direction: 'undirected',
      status: 'peer',
      labelKo: '글로벌 동종 비교',
      labelEn: 'Global peer comparison',
      evidence: [],
      confidence: 'low',
      lastVerifiedAt: AS_OF,
      edgeOrigin: 'legacyMigrated',
      defaultHidden: true,
      noteKo: '업종 비교용 peer이며 거래·지분관계가 아닙니다.',
      noteEn: 'Sector peer only; not trade or ownership.',
    }, {
      legacyEdgeId, source: src, target: gid,
      beforeType: 'partner', afterType: 'peer',
      beforeStatus: 'legacy', afterStatus: 'peer',
      origin: 'legacyMigrated',
      reason: 'string partner → peer defaultHidden',
    })) legacyMigrated += 1;
  }
}

const ownershipEdges = edges.filter((e) => ['owns', 'controls', 'equity_investment'].includes(e.type));
const orphan = computeListedRelationOrphanMetrics({ nodes, edges });
const listedIds = nodes.filter((n) => n.type === 'listed_company' || n.isListedKorea).map((n) => n.id);
const ownershipTouched = new Set();
for (const e of ownershipEdges) {
  if (listedIds.includes(e.source)) ownershipTouched.add(e.source);
  if (listedIds.includes(e.target)) ownershipTouched.add(e.target);
}
const listedCompanyOwnershipOrphanCount = listedIds.filter((id) => !ownershipTouched.has(id)).length;

const network = {
  sectorId: 'finance',
  model: 'financial_group_ecosystem',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  layers: Object.keys(CHAIN_META),
  lanes: ['holding', 'bank', 'securities', 'insurance', 'card_capital', 'group', 'independent', 'peer'],
  _legacyFallback: false,
  metrics: {
    legacyMigratedEdgeCount: legacyMigrated,
    structuralGeneratedEdgeCount: structuralGenerated,
    manuallyCuratedEdgeCount: manuallyCurated,
    removedEdgeCount: removedUnsupported,
    finalEdgeCount: edges.length,
    ownershipEdgeCount: ownershipEdges.length,
    ownershipWithStakePctCount: ownershipEdges.filter((e) => e.stakePct != null).length,
    ownershipPrimarySourceCoverage: 0,
    groupMembershipEdgeCount: edges.filter((e) => e.type === 'group_member').length,
    classificationEdgeCount: edges.filter((e) => e.type === 'member_of' || e.type === 'operates_in').length,
    businessPartnershipEdgeCount: 0,
    listedCompanyOwnershipOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
    weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
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
  orphan,
  validateFailures: report.failures,
  validateWarnings: report.warnings,
  changes: changelog,
}, null, 2));

console.log(JSON.stringify({
  nodes: nodes.length,
  edges: edges.length,
  metrics: network.metrics,
  statusCounts: report.summary.statusCounts,
  typeCounts: report.summary.typeCounts,
  orphan: {
    structuralOrphanCount: orphan.structuralOrphanCount,
    businessRelationOrphanCount: orphan.businessRelationOrphanCount,
    classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  },
  failures: report.failures,
  warnings: report.warnings.slice(0, 15),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
