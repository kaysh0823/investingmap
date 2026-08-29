/**
 * Phase 3A — migrate data/bigchip_relations.json → data/networks/bigchip.json (dualAnchor).
 * Never auto-promotes to confirmed. Classifies all legacy edges.
 * Run: node scripts/migrate_bigchip_network_phase3a.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-22';
const REVIEWED_AT = '2026-08-22';
const OUT_NET = join(ROOT, 'data', 'networks', 'bigchip.json');
const OUT_LOG = join(ROOT, 'data', 'bigchip_relation_phase3a_changelog.json');

const COUNTRY_REGION = {
  KR: 'kr', US: 'us', TW: 'tw', JP: 'jp', NL: 'eu', DE: 'eu', FR: 'eu', CN: 'cn', GB: 'gb',
};

const EQUIPMENT_IDS = new Set([
  'asml', 'applied_materials', 'lam_research', 'kla', 'tokyo_electron',
  'wonik_ips', 'jusung_engineering', 'psk', 'tes', 'eugene_tech', 'kc_tech',
  'hpsp', 'eo_technics', 'park_systems', 'techwing',
]);
const MATERIAL_IDS = new Set([
  'dongjin_semichem', 'soulbrain', 'sk_specialty', 'hansol_chemical', 'enf_technology',
  'wonik_materials', 'hana_materials', 'tck', 'wonik_qnc', 'comico', 'worldex', 'temc',
  'sns_tech', 'shin_etsu', 'sumco', 'merck_emd', 'dupont', 'qnity', 'air_liquide',
]);
const PACK_TEST_IDS = new Set([
  'hanmi_semiconductor', 'isc', 'daeduck_electronics', 'simmtech', 'haesung_ds', 'tlb',
  'hana_micron', 'sfa_semicon', 'doosan_tesna', 'lb_semicon', 'nepes',
]);

const WEAK_URL = [
  /^https?:\/\/[^/?#]+\/?$/,
  /Supplier%20List/i,
  /\/press\/?$/i,
  /\/news\/?$/i,
  /company\/history/i,
  /wimco\.co\.kr/i,
];

const PRODUCT_DEFS = [
  { id: 'product:dram', nameKo: 'DRAM', nameEn: 'DRAM', anchors: ['005930', '000660'] },
  { id: 'product:nand', nameKo: 'NAND', nameEn: 'NAND', anchors: ['005930', '000660'] },
  { id: 'product:hbm', nameKo: 'HBM', nameEn: 'HBM', anchors: ['005930', '000660'] },
  { id: 'product:foundry', nameKo: '파운드리', nameEn: 'Foundry', anchors: ['005930'] },
  { id: 'product:system_lsi', nameKo: 'System LSI', nameEn: 'System LSI', anchors: ['005930'] },
  { id: 'product:image_sensor', nameKo: '이미지센서', nameEn: 'Image Sensor', anchors: ['005930'] },
  { id: 'product:advanced_packaging', nameKo: '첨단 패키징', nameEn: 'Advanced Packaging', anchors: ['005930', '000660'] },
  { id: 'product:enterprise_ssd', nameKo: '기업용 SSD', nameEn: 'Enterprise SSD', anchors: ['000660'] },
];

const MARKET_DEFS = [
  { id: 'market:ai_accelerator', nameKo: 'AI 가속기', nameEn: 'AI accelerator' },
  { id: 'market:server_datacenter', nameKo: '서버·데이터센터', nameEn: 'Server / data center' },
  { id: 'market:mobile', nameKo: '모바일', nameEn: 'Mobile' },
  { id: 'market:pc', nameKo: 'PC', nameEn: 'PC' },
  { id: 'market:automotive', nameKo: '자동차', nameEn: 'Automotive' },
  { id: 'market:consumer_electronics', nameKo: '가전·컨슈머', nameEn: 'Consumer electronics' },
];

const PRODUCT_SOURCES = {
  '005930': {
    url: 'https://semiconductor.samsung.com/dram/',
    title: 'Samsung Semiconductor — Memory (DRAM)',
  },
  '000660': {
    url: 'https://www.skhynix.com/eng/product/dram/HBM.do',
    title: 'SK hynix — HBM / DRAM products',
  },
};

function isWeakUrl(url) {
  return !url || WEAK_URL.some((re) => re.test(url));
}

function mapStatus(item) {
  const ev = item.evidence || 'reported';
  const url = item.source || '';
  if (ev === 'likely') return 'inferred';
  if (isWeakUrl(url) || /Supplier%20List/i.test(url)) return 'reference';
  if (ev === 'reported') return 'reported';
  // Never auto-promote legacy "confirmed" → schema confirmed
  if (ev === 'confirmed') return 'reported';
  return 'inferred';
}

function mapEdgeType(role, partnerId) {
  if (role === 'peer' || role === 'peers') return 'peer';
  if (role === 'customer' || role === 'customers') return 'supplies_to'; // hub supplies to customer
  if (EQUIPMENT_IDS.has(partnerId)) return 'equipment_for';
  if (MATERIAL_IDS.has(partnerId)) return 'material_for';
  if (PACK_TEST_IDS.has(partnerId)) return 'packages_or_tests_for';
  if (partnerId === 'tsmc' && role === 'supplier') return 'technology_partnership';
  return 'supplies_to'; // partner supplies to hub
}

function partnerNodeId(item) {
  if (item.ticker && /^[0-9A-Z]{6}$/.test(String(item.ticker))) {
    // Never create second copy of anchors
    if (item.ticker === '005930' || item.ticker === '000660') return `krx:${item.ticker}`;
    return `krx:${item.ticker}`;
  }
  return `global:${item.id}`;
}

function mkEvidence(item, status) {
  if (!item.source || !/^https?:\/\//.test(item.source)) return [];
  const sourceType = /dart|kind\.krx|opendart/i.test(item.source) ? 'dart'
    : /news\.(samsung|skhynix)|ir\.|investor\.|press-releases/i.test(item.source) ? 'official'
      : 'press';
  return [{
    sourceType,
    title: item.note || item.name || 'Public disclosure',
    url: item.source,
    publishedAt: null,
    accessedAt: REVIEWED_AT,
    reviewStatus: status === 'reported' ? 'needs_human_review' : 'needs_human_review',
    directEvidence: false,
    evidenceSummaryKo: item.note || '',
    evidenceSummaryEn: item.noteEn || item.note || '',
    relationshipSupported: item.note || item.noteEn || '',
  }];
}

const src = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'bigchip_relations.json'), 'utf8'));
const html = fs.readFileSync(join(ROOT, 'bigchip', 'korea_bigchip_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const byTicker = new Map(companies.map((c) => [c.ticker, c]));
const catalog = new Map((src.expansion?.nodes || []).map((n) => [n.id, n]));

const nodes = [];
const edges = [];
const nodeIds = new Set();
const edgeKeys = new Set();
const changelog = [];

function addNode(n) {
  if (!n.id || nodeIds.has(n.id)) return;
  nodeIds.add(n.id);
  nodes.push(n);
}

function addEdge(e, meta) {
  const key = `${e.source}|${e.target}|${e.type}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push(e);
  if (meta) changelog.push(meta);
}

// --- Anchors (listed companies on bigchip page) ---
for (const ticker of ['005930', '000660']) {
  const c = byTicker.get(ticker);
  addNode({
    id: `krx:${ticker}`,
    type: 'listed_company',
    ticker,
    nameKo: ticker === '005930' ? '삼성전자' : 'SK하이닉스',
    nameEn: ticker === '005930' ? 'Samsung Electronics' : 'SK hynix',
    market: c?.market || 'KOSPI',
    role: 'IDM/종합반도체',
    region: 'kr',
    isListedKorea: true,
    isAnchor: true,
    excludeFromGlobalCount: true,
    mcapWon: c?.mcapWon ?? null,
    aliases: ticker === '005930'
      ? ['anchor:005930', 'global:samsung_d', 'samsung_d', 'samsung_electronics']
      : ['anchor:000660', 'global:skhynix_d', 'skhynix_d', 'sk_hynix'],
  });
}

// Product / market nodes
for (const p of PRODUCT_DEFS) {
  addNode({
    id: p.id,
    type: 'product_category',
    nameKo: p.nameKo,
    nameEn: p.nameEn,
    role: 'product',
    layer: 'product',
  });
  for (const tk of p.anchors) {
    const srcInfo = PRODUCT_SOURCES[tk];
    addEdge({
      id: `produces-${tk}-${p.id.replace(':', '-')}`,
      source: `krx:${tk}`,
      target: p.id,
      type: 'produces',
      direction: 'source_to_target',
      status: 'reported',
      labelKo: `${p.nameKo} 생산`,
      labelEn: `Produces ${p.nameEn}`,
      evidence: [{
        sourceType: 'official',
        title: srcInfo.title,
        url: srcInfo.url,
        accessedAt: REVIEWED_AT,
        reviewStatus: 'needs_human_review',
        directEvidence: false,
        relationshipSupported: `${tk} produces ${p.nameEn}`,
      }],
      confidence: 'medium',
      lastVerifiedAt: REVIEWED_AT,
    }, {
      edgeId: `produces-${tk}-${p.id.replace(':', '-')}`,
      beforeType: '(none)',
      afterType: 'produces',
      beforeStatus: '(none)',
      afterStatus: 'reported',
      reason: '공식 제품 영역 — company→product (거래 관계 아님)',
    });
  }
}

for (const m of MARKET_DEFS) {
  addNode({
    id: m.id,
    type: 'end_market',
    nameKo: m.nameKo,
    nameEn: m.nameEn,
    role: 'end_market',
    layer: 'market',
  });
}

// Product → market (structure, not company trade)
const productMarketLinks = [
  ['product:hbm', 'market:ai_accelerator'],
  ['product:hbm', 'market:server_datacenter'],
  ['product:dram', 'market:server_datacenter'],
  ['product:dram', 'market:mobile'],
  ['product:dram', 'market:pc'],
  ['product:nand', 'market:mobile'],
  ['product:nand', 'market:consumer_electronics'],
  ['product:enterprise_ssd', 'market:server_datacenter'],
  ['product:foundry', 'market:mobile'],
  ['product:foundry', 'market:automotive'],
  ['product:system_lsi', 'market:mobile'],
  ['product:image_sensor', 'market:mobile'],
  ['product:advanced_packaging', 'market:ai_accelerator'],
];
for (const [prod, mkt] of productMarketLinks) {
  addEdge({
    id: `usedin-${prod.replace(':', '-')}-${mkt.replace(':', '-')}`,
    source: prod,
    target: mkt,
    type: 'used_in_market',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '수요 시장 노출(참고)',
    labelEn: 'End-market exposure (reference)',
    evidence: [],
    confidence: 'low',
    lastVerifiedAt: REVIEWED_AT,
    defaultHidden: true,
    noteKo: '제품·시장 연결이며 기업 간 거래를 의미하지 않습니다.',
    noteEn: 'Product–market link; not a company trade relationship.',
  }, {
    edgeId: `usedin-${prod.replace(':', '-')}-${mkt.replace(':', '-')}`,
    beforeType: '(none)',
    afterType: 'used_in_market',
    beforeStatus: '(none)',
    afterStatus: 'reference',
    reason: '제품→수요시장 구조 연결 — 기업 거래 아님',
  });
}

// Anchor exposed_to key markets
for (const tk of ['005930', '000660']) {
  for (const m of ['market:ai_accelerator', 'market:server_datacenter', 'market:mobile']) {
    addEdge({
      id: `exposed-${tk}-${m.replace(':', '-')}`,
      source: `krx:${tk}`,
      target: m,
      type: 'exposed_to',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '수요시장 노출',
      labelEn: 'End-market exposure',
      evidence: [],
      confidence: 'low',
      lastVerifiedAt: REVIEWED_AT,
      noteKo: '산업 구조 참고이며 특정 고객 계약을 의미하지 않습니다.',
      noteEn: 'Industry structure reference; not a named customer relationship.',
    }, {
      edgeId: `exposed-${tk}-${m.replace(':', '-')}`,
      beforeType: '(none)',
      afterType: 'exposed_to',
      beforeStatus: '(none)',
      afterStatus: 'reference',
      reason: '회사→수요시장 노출(특정 고객 아님)',
    });
  }
}

// Solidigm (SK hynix NAND subsidiary) — official acquisition
addNode({
  id: 'global:solidigm',
  type: 'subsidiary',
  nameKo: 'Solidigm',
  nameEn: 'Solidigm',
  role: 'NAND subsidiary',
  region: 'us',
});
addEdge({
  id: 'owns-000660-solidigm',
  source: 'krx:000660',
  target: 'global:solidigm',
  type: 'owns',
  direction: 'source_to_target',
  status: 'reported',
  labelKo: 'Solidigm(구 Intel NAND) 자회사',
  labelEn: 'Owns Solidigm (former Intel NAND)',
  evidence: [{
    sourceType: 'official',
    title: 'SK hynix completes acquisition of Intel NAND / Solidigm',
    url: 'https://news.skhynix.com/en/sk-hynix-completes-first-closing-of-ssd-business-from-intel/',
    publishedAt: '2021-12-29',
    accessedAt: REVIEWED_AT,
    reviewStatus: 'needs_human_review',
    directEvidence: true,
    relationshipSupported: 'SK hynix owns Solidigm (Intel NAND SSD business)',
  }],
  confidence: 'high',
  lastVerifiedAt: REVIEWED_AT,
}, {
  edgeId: 'owns-000660-solidigm',
  beforeType: '(none)',
  afterType: 'owns',
  beforeStatus: '(none)',
  afterStatus: 'reported',
  reason: 'SK하이닉스–Solidigm 공식 인수 보도 — owns (confirmed 게이트 미충족)',
});

function ingestPartner(hubTicker, role, item) {
  // Skip anchor-as-peer of each other (handled as single competes_with)
  if ((item.ticker === '005930' || item.id === 'samsung_electronics' || item.id === 'sk_hynix')
    && (item.ticker === '005930' || item.ticker === '000660'
      || item.id === 'samsung_electronics' || item.id === 'sk_hynix')) {
    return;
  }

  const nid = partnerNodeId(item);
  if (nid === `krx:${hubTicker}`) return;

  const isKr = !!(item.ticker && item.country === 'KR');
  addNode({
    id: nid,
    type: isKr ? 'listed_company' : 'global_company',
    ticker: item.ticker || '',
    nameKo: item.name,
    nameEn: item.nameEn || item.name,
    role: role === 'suppliers' || role === 'supplier' ? 'supplier'
      : role === 'customers' || role === 'customer' ? 'customer' : 'peer',
    region: COUNTRY_REGION[item.country] || 'eu',
    isListedKorea: isKr,
    market: isKr ? (byTicker.get(item.ticker)?.market || '') : '',
    mcapWon: isKr ? (byTicker.get(item.ticker)?.mcapWon ?? null) : null,
    legacyId: item.id,
  });

  const beforeType = role;
  const afterType = mapEdgeType(role, item.id);
  let afterStatus = afterType === 'peer' ? 'peer' : mapStatus(item);

  // Hanmi → SK hynix TC bonder: ended (Phase 2.7)
  if (item.id === 'hanmi_semiconductor' && hubTicker === '000660') {
    afterStatus = 'ended';
  }

  // Customer edges: hub supplies_to customer
  let source;
  let target;
  if (afterType === 'peer') {
    source = `krx:${hubTicker}`;
    target = nid;
  } else if (role === 'customers' || role === 'customer') {
    source = `krx:${hubTicker}`;
    target = nid;
  } else {
    // supplier → hub
    source = nid;
    target = `krx:${hubTicker}`;
  }

  const edgeId = `${afterType}-${hubTicker}-${item.id}`;
  const edge = {
    id: edgeId,
    source,
    target,
    type: afterType,
    direction: afterType === 'peer' ? 'undirected' : 'source_to_target',
    status: afterStatus,
    labelKo: item.note || '',
    labelEn: item.noteEn || item.note || '',
    evidence: afterType === 'peer' || afterStatus === 'peer' ? [] : mkEvidence(item, afterStatus),
    confidence: afterStatus === 'reported' ? 'medium' : 'low',
    lastVerifiedAt: REVIEWED_AT,
    defaultHidden: afterType === 'peer' || afterStatus === 'peer' || afterStatus === 'inferred' || afterStatus === 'reference' || afterStatus === 'ended',
  };

  if (item.id === 'hanmi_semiconductor' && hubTicker === '000660') {
    edge.validTo = '2025-07-01';
    edge.type = 'equipment_for';
    edge.status = 'ended';
    edge.defaultHidden = true;
    edge.labelKo = 'TC 본더 공급 — 계약 종료(2025.07.01)';
    edge.labelEn = 'TC bonder supply — contract ended (2025-07-01)';
    edge.evidence = [{
      sourceType: 'dart',
      title: '한미반도체 단일판매·공급계약체결',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250114800153',
      publishedAt: '2025-01-14',
      accessedAt: REVIEWED_AT,
      reviewStatus: 'reviewed',
      reviewedAt: REVIEWED_AT,
      reviewedBy: 'editorial_manual_review',
      directEvidence: true,
      evidenceSummaryKo: 'DART 공시(2025.01.14): SK하이닉스 TC 본더 공급. 계약기간 ~2025.07.01 종료.',
      evidenceSummaryEn: 'DART filing: TC bonder to SK hynix; term ended 2025-07-01.',
      relationshipSupported: '한미반도체(042700) → SK하이닉스(000660) TC 본더 equipment_for (ended)',
    }];
    edge.reviewStatus = 'reviewed';
    edge.reviewedAt = REVIEWED_AT;
    edge.reviewedBy = 'editorial_manual_review';
    edge.noteKo = '과거 공급계약이며 현재 계속 공급을 의미하지 않습니다.';
    edge.noteEn = 'Past supply contract; does not imply ongoing supply.';
  }

  // Technology partnership for Applied Materials joint R&D notes
  if (/R&D|공동|partnership|협력/i.test(item.note || '') && afterType === 'equipment_for'
    && /applied_materials|lam_research/.test(item.id)) {
    // keep equipment_for; note already captures R&D
  }

  addEdge(edge, {
    edgeId,
    hub: hubTicker,
    partner: item.id,
    beforeType,
    afterType: edge.type,
    beforeStatus: item.evidence || '(none)',
    afterStatus: edge.status,
    reason: edge.status === 'ended'
      ? 'DART TC 본더 계약 종료 — ended'
      : edge.status === 'reference'
        ? '약함·집계 출처 — reference 강등'
        : edge.status === 'inferred'
          ? 'likely/약한 근거 — inferred'
          : edge.type === 'peer'
            ? '비교 peer — 기본 숨김'
            : '레거시 confirmed 자동승격 금지 → reported',
  });
}

// Legacy hubs
for (const hub of src.hubs) {
  for (const role of ['suppliers', 'customers', 'peers']) {
    for (const item of hub[role] || []) {
      ingestPartner(hub.ticker, role, item);
    }
  }
}

// Expansion edges
for (const edge of src.expansion?.edges || []) {
  const node = catalog.get(edge.node);
  if (!node) continue;
  ingestPartner(edge.hub, edge.role === 'supplier' ? 'suppliers'
    : edge.role === 'customer' ? 'customers' : 'peers', {
    ...node,
    note: edge.note,
    noteEn: edge.noteEn,
    evidence: edge.evidence,
    source: edge.source,
  });
}

// Single competes_with between anchors (replace mutual peer)
addEdge({
  id: 'competes-005930-000660',
  source: 'krx:005930',
  target: 'krx:000660',
  type: 'competes_with',
  direction: 'undirected',
  status: 'reference',
  labelKo: 'DRAM·HBM·NAND 경쟁',
  labelEn: 'DRAM, HBM and NAND competitors',
  evidence: [],
  confidence: 'high',
  lastVerifiedAt: REVIEWED_AT,
  defaultHidden: true,
  noteKo: '동종 비교이며 거래를 의미하지 않습니다.',
  noteEn: 'Peer comparison; not a trade relationship.',
}, {
  edgeId: 'competes-005930-000660',
  beforeType: 'peer×2',
  afterType: 'competes_with',
  beforeStatus: 'confirmed',
  afterStatus: 'reference',
  reason: '양방향 peer 중복 제거 → 단일 competes_with (reference, 기본 숨김)',
});

const network = {
  sectorId: 'bigchip',
  model: 'dual_anchor_comparison',
  asOf: AS_OF,
  lastReviewedAt: REVIEWED_AT,
  nodes,
  edges,
};

fs.mkdirSync(join(ROOT, 'data', 'networks'), { recursive: true });
fs.writeFileSync(OUT_NET, JSON.stringify(network, null, 2) + '\n', 'utf8');
fs.writeFileSync(OUT_LOG, JSON.stringify({
  migratedAt: REVIEWED_AT,
  sourceEdgeCount: 109,
  resultNodeCount: nodes.length,
  resultEdgeCount: edges.length,
  statusCounts: edges.reduce((m, e) => { m[e.status] = (m[e.status] || 0) + 1; return m; }, {}),
  typeCounts: edges.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {}),
  changes: changelog,
}, null, 2) + '\n', 'utf8');

const report = validateNetworkReport(network);
console.log('\nbigchip migration Phase 3A');
console.log(JSON.stringify(report.summary, null, 2));
report.failures.slice(0, 15).forEach((f) => console.log(' FAIL', f));
report.warnings.slice(0, 15).forEach((w) => console.log(' WARN', w));
console.log('changelog entries:', changelog.length);
console.log('Wrote', OUT_NET);
console.log('Wrote', OUT_LOG);
process.exit(report.failures.length ? 1 : 0);
