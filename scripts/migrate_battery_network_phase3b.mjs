/**
 * Phase 3B — migrate battery partners → data/networks/battery.json
 * Circular value-chain model. Never auto-promotes to confirmed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const OUT_NET = join(ROOT, 'data', 'networks', 'battery.json');
const OUT_LOG = join(ROOT, 'data', 'battery_relation_phase3b_changelog.json');

/** Map ticker → finer product focus within existing chain labels */
const PRODUCT_FOCUS = {
  '373220': ['product:battery_cell'],
  '006400': ['product:battery_cell'],
  '096770': ['product:battery_cell'], // SK Innovation / SK On ecosystem
  '051910': ['product:cathode', 'product:battery_materials'],
  '003670': ['product:cathode'],
  '247540': ['product:cathode'],
  '086520': ['product:cathode'],
  '450080': ['product:cathode'],
  '066970': ['product:cathode'],
  '093370': ['product:electrolyte'],
  '348370': ['product:electrolyte'],
  '020150': ['product:copper_foil'],
  '278280': ['product:copper_foil'],
  '393890': ['product:copper_foil'],
  '361610': ['product:separator'],
  '011790': ['product:copper_foil'],
  '137400': ['product:battery_equipment'],
  '336260': ['product:ess'],
  '126340': ['product:ess'],
};

const GLOBAL_META = {
  catl: { nameKo: 'CATL', nameEn: 'CATL', country: 'CN', region: 'cn' },
  tesla: { nameKo: 'Tesla', nameEn: 'Tesla', country: 'US', region: 'us' },
  vw_group: { nameKo: '폭스바겐 그룹', nameEn: 'Volkswagen Group', country: 'DE', region: 'eu' },
  bmw: { nameKo: 'BMW', nameEn: 'BMW', country: 'DE', region: 'eu' },
  gm_ev: { nameKo: 'GM', nameEn: 'General Motors', country: 'US', region: 'us' },
};

const html = fs.readFileSync(join(ROOT, 'battery', 'korea_battery_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const byTicker = new Map(companies.map((c) => [c.ticker, c]));
const byLegacyId = new Map(companies.map((c) => [c.id, c]));

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
  if (!n?.id || nodeIds.has(n.id)) return;
  nodeIds.add(n.id);
  nodes.push(n);
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

function mkEv(fields) {
  return [{
    reviewStatus: 'needs_human_review',
    accessedAt: AS_OF,
    directEvidence: false,
    ...fields,
  }];
}

// --- Group stage hubs (member_of classification) ---
const STAGE_HUBS = [
  { id: 'group:battery_materials', chain: '소재', nameKo: '배터리 소재', nameEn: 'Battery materials' },
  { id: 'group:battery_parts', chain: '부품', nameKo: '배터리 부품', nameEn: 'Battery components' },
  { id: 'group:battery_equipment', chain: '장비', nameKo: '배터리 장비', nameEn: 'Battery equipment' },
  { id: 'group:battery_cell', chain: '셀', nameKo: '배터리 셀', nameEn: 'Battery cells' },
  { id: 'group:battery_ess', chain: 'ESS', nameKo: 'ESS·팩', nameEn: 'ESS / pack' },
];
for (const h of STAGE_HUBS) {
  addNode({
    id: h.id,
    type: 'group',
    nameKo: h.nameKo,
    nameEn: h.nameEn,
    role: h.chain,
    group: h.chain,
    layer: h.chain,
  });
}

// Listed companies
for (const c of companies) {
  const id = `krx:${c.ticker}`;
  addNode({
    id,
    type: 'listed_company',
    ticker: c.ticker,
    nameKo: c.name,
    nameEn: c.nameEn || c.name,
    market: c.market || '',
    role: c.chain || '',
    group: c.chain || '',
    layer: c.chain || '',
    mcapWon: c.mcapWon ?? null,
    isListedKorea: true,
    legacyId: c.id,
  });
  const hub = STAGE_HUBS.find((h) => h.chain === c.chain);
  if (hub) {
    addEdge({
      id: `member-${c.ticker}-${hub.id.replace(':', '-')}`,
      source: id,
      target: hub.id,
      type: 'member_of',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: `${c.chain} 밸류체인 분류`,
      labelEn: `${c.chain} value-chain category`,
      evidence: [],
      confidence: 'high',
      lastVerifiedAt: AS_OF,
      noteKo: '동일 밸류체인 분류이며 기업 간 거래를 의미하지 않습니다.',
      noteEn: 'Value-chain category only; not a trade relationship.',
      edgeOrigin: 'structuralGenerated',
    }, {
      legacyEdgeId: null,
      source: id,
      target: hub.id,
      beforeType: '(none)',
      afterType: 'member_of',
      beforeStatus: '(none)',
      afterStatus: 'reference',
      origin: 'structuralGenerated',
      reason: 'cp_list chain → member_of group',
    });
    structuralGenerated += 1;
  }
}

// Structural products / markets / processes
const PRODUCTS = [
  ['product:cathode', '양극재', 'Cathode materials', 'material_category'],
  ['product:anode', '음극재', 'Anode materials', 'material_category'],
  ['product:separator', '분리막', 'Separator', 'component_category'],
  ['product:electrolyte', '전해액·전해질', 'Electrolyte', 'material_category'],
  ['product:copper_foil', '동박', 'Copper foil', 'component_category'],
  ['product:battery_materials', '배터리 소재', 'Battery materials', 'material_category'],
  ['product:battery_cell', '배터리 셀', 'Battery cell', 'battery_cell'],
  ['product:battery_equipment', '배터리 제조장비', 'Battery equipment', 'equipment_category'],
  ['product:ess', 'ESS', 'ESS', 'battery_platform'],
];
for (const [id, ko, en, type] of PRODUCTS) {
  addNode({ id, type, nameKo: ko, nameEn: en, role: 'product', layer: type.includes('equipment') ? '장비' : (id.includes('cell') || id.includes('ess') ? (id.includes('ess') ? 'ESS' : '셀') : '소재') });
}

const MARKETS = [
  ['market:ev', '전기차(EV)', 'EV'],
  ['market:ess_demand', '에너지저장(ESS)', 'ESS demand'],
  ['market:global_cell_manufacturers', '글로벌 셀 제조사', 'Global cell manufacturers'],
  ['market:global_ev_oem', '글로벌 완성차 OEM', 'Global EV OEMs'],
];
for (const [id, ko, en] of MARKETS) {
  addNode({ id, type: 'end_market', nameKo: ko, nameEn: en, role: 'end_market', layer: '수요시장' });
}

const PROCESSES = [
  ['process:collection', '사용후 배터리 회수', 'End-of-life collection'],
  ['process:black_mass', '블랙매스', 'Black mass'],
  ['process:metal_recovery', '금속 회수', 'Metal recovery'],
];
for (const [id, ko, en] of PROCESSES) {
  addNode({ id, type: 'recycling_process', nameKo: ko, nameEn: en, role: 'recycling', layer: '재활용' });
}

// Recycling structural loop (process → process / product)
const loop = [
  ['process:collection', 'process:black_mass', 'used_in_process'],
  ['process:black_mass', 'process:metal_recovery', 'used_in_process'],
  ['process:metal_recovery', 'product:cathode', 'used_in_process'],
  ['product:battery_cell', 'process:collection', 'exposed_to'],
];
for (const [s, t, type] of loop) {
  addEdge({
    id: `loop-${s.replace(':', '-')}-${t.replace(':', '-')}`,
    source: s,
    target: t,
    type,
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '재활용 순환 구조(참고)',
    labelEn: 'Recycling loop (reference)',
    evidence: [],
    confidence: 'low',
    lastVerifiedAt: AS_OF,
    defaultHidden: false,
    noteKo: '산업 순환 구조 설명이며 특정 기업 거래를 의미하지 않습니다.',
    noteEn: 'Industry loop structure; not a company trade.',
    edgeOrigin: 'structuralGenerated',
    isRecyclingLoop: true,
  }, {
    legacyEdgeId: null, source: s, target: t, beforeType: '(none)', afterType: type,
    beforeStatus: '(none)', afterStatus: 'reference', origin: 'structuralGenerated',
    reason: 'recycling loop structure',
  });
  structuralGenerated += 1;
}

// Product → market
for (const [prod, mkt] of [
  ['product:battery_cell', 'market:ev'],
  ['product:battery_cell', 'market:ess_demand'],
  ['product:ess', 'market:ess_demand'],
  ['product:cathode', 'market:global_cell_manufacturers'],
]) {
  addEdge({
    id: `usedin-${prod.replace(':', '-')}-${mkt.replace(':', '-')}`,
    source: prod,
    target: mkt,
    type: 'exposed_to',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: '수요 노출(참고)',
    labelEn: 'Demand exposure (reference)',
    evidence: [],
    confidence: 'low',
    lastVerifiedAt: AS_OF,
    defaultHidden: true,
    noteKo: '제품·시장 연결이며 기업 간 거래가 아닙니다.',
    noteEn: 'Product–market link; not a company trade.',
    edgeOrigin: 'structuralGenerated',
  }, {
    legacyEdgeId: null, source: prod, target: mkt, beforeType: '(none)', afterType: 'exposed_to',
    beforeStatus: '(none)', afterStatus: 'reference', origin: 'structuralGenerated', reason: 'product→market',
  });
  structuralGenerated += 1;
}

// Company → product (produces) from focus map
for (const [ticker, prods] of Object.entries(PRODUCT_FOCUS)) {
  if (!byTicker.has(ticker)) continue;
  for (const prod of prods) {
    addEdge({
      id: `produces-${ticker}-${prod.replace(':', '-')}`,
      source: `krx:${ticker}`,
      target: prod,
      type: 'produces',
      direction: 'source_to_target',
      status: 'reference',
      labelKo: '제품·공정 위치',
      labelEn: 'Product / process position',
      evidence: [],
      confidence: 'medium',
      lastVerifiedAt: AS_OF,
      noteKo: '사업 영역 분류이며 특정 고객 납품을 의미하지 않습니다.',
      noteEn: 'Business-line classification; not a named customer supply.',
      edgeOrigin: 'structuralGenerated',
    }, {
      legacyEdgeId: null, source: `krx:${ticker}`, target: prod,
      beforeType: '(none)', afterType: 'produces', beforeStatus: '(none)', afterStatus: 'reference',
      origin: 'structuralGenerated', reason: 'chain/product focus → produces (not customer supply)',
    });
    structuralGenerated += 1;
  }
}

// Cell makers exposed_to EV market (structure, not OEM contract)
for (const tk of ['373220', '006400', '096770']) {
  if (!byTicker.has(tk)) continue;
  addEdge({
    id: `exposed-${tk}-market-ev`,
    source: `krx:${tk}`,
    target: 'market:ev',
    type: 'exposed_to',
    direction: 'source_to_target',
    status: 'reference',
    labelKo: 'EV 수요 노출',
    labelEn: 'EV demand exposure',
    evidence: [],
    confidence: 'medium',
    lastVerifiedAt: AS_OF,
    edgeOrigin: 'structuralGenerated',
  }, {
    legacyEdgeId: null, source: `krx:${tk}`, target: 'market:ev',
    beforeType: '(none)', afterType: 'exposed_to', beforeStatus: '(none)', afterStatus: 'reference',
    origin: 'structuralGenerated', reason: 'cell maker → EV market exposure',
  });
  structuralGenerated += 1;
}

// SK On unlisted subsidiary + Ultium JV (manually curated, reported)
addNode({
  id: 'kr:sk_on',
  type: 'domestic_unlisted_company',
  nameKo: 'SK온',
  nameEn: 'SK On',
  role: '셀',
  group: '셀',
  layer: '셀',
  isListedKorea: false,
});
addEdge({
  id: 'owns-096770-sk-on',
  source: 'krx:096770',
  target: 'kr:sk_on',
  type: 'owns',
  direction: 'source_to_target',
  status: 'reported',
  labelKo: 'SK온 자회사',
  labelEn: 'Owns SK On',
  evidence: mkEv({
    sourceType: 'official',
    title: 'SK Innovation — SK On battery business',
    url: 'https://www.skinnovation.com/en/company/affiliate',
    publishedAt: '2024-01-01',
    relationshipSupported: 'SK Innovation owns/controls SK On battery affiliate',
    evidenceSummaryKo: 'SK이노베이션 계열 SK온(배터리) 자회사 관계',
    evidenceSummaryEn: 'SK On is SK Innovation battery affiliate',
  }),
  confidence: 'medium',
  lastVerifiedAt: AS_OF,
  edgeOrigin: 'manuallyCurated',
}, {
  legacyEdgeId: null, source: 'krx:096770', target: 'kr:sk_on',
  beforeType: '(none)', afterType: 'owns', beforeStatus: '(none)', afterStatus: 'reported',
  origin: 'manuallyCurated', reason: 'SK Innovation–SK On affiliate (reported, not confirmed stakePct)',
});
manuallyCurated += 1;

addNode({
  id: 'jv:ultium_cells',
  type: 'joint_venture',
  nameKo: 'Ultium Cells',
  nameEn: 'Ultium Cells LLC',
  role: '셀 JV',
  layer: '셀',
  region: 'us',
});
addNode({
  id: 'global:gm_ev',
  type: 'global_company',
  nameKo: 'GM',
  nameEn: 'General Motors',
  role: 'OEM',
  region: 'us',
  legacyId: 'gm_ev',
});
for (const [src, labelKo, labelEn] of [
  ['krx:373220', 'Ultium Cells 참여', 'Participates in Ultium Cells'],
  ['global:gm_ev', 'Ultium Cells 참여', 'Participates in Ultium Cells'],
]) {
  addEdge({
    id: `participates-${src.replace(':', '-')}-ultium`,
    source: src,
    target: 'jv:ultium_cells',
    type: 'participates_in',
    direction: 'source_to_target',
    status: 'reported',
    labelKo,
    labelEn,
    evidence: mkEv({
      sourceType: 'official',
      title: 'GM and LG Energy Solution Ultium Cells joint venture',
      url: 'https://news.lgensol.com/company-news/',
      publishedAt: '2023-01-01',
      relationshipSupported: 'LGES and GM participate in Ultium Cells JV',
      evidenceSummaryKo: 'LG에너지솔루션·GM Ultium Cells JV 참여(공식 보도 계열)',
      evidenceSummaryEn: 'LGES–GM Ultium Cells JV participation',
      directEvidence: false,
    }),
    confidence: 'medium',
    lastVerifiedAt: AS_OF,
    edgeOrigin: 'manuallyCurated',
  }, {
    legacyEdgeId: null, source: src, target: 'jv:ultium_cells',
    beforeType: '(none)', afterType: 'participates_in', beforeStatus: '(none)', afterStatus: 'reported',
    origin: 'manuallyCurated', reason: 'Ultium Cells JV — reported via company news ecosystem; exact stake doc pending',
  });
  manuallyCurated += 1;
}
addEdge({
  id: 'manufactures-ultium-cell',
  source: 'jv:ultium_cells',
  target: 'product:battery_cell',
  type: 'manufactures',
  direction: 'source_to_target',
  status: 'reference',
  labelKo: '배터리 셀 제조(참고)',
  labelEn: 'Manufactures battery cells (reference)',
  evidence: mkEv({
    sourceType: 'official',
    title: 'Ultium Cells — company overview',
    url: 'https://www.ultiumcell.com/about',
    relationshipSupported: 'Ultium Cells describes cell manufacturing (homepage-level)',
  }),
  confidence: 'low',
  lastVerifiedAt: AS_OF,
  defaultHidden: false,
  edgeOrigin: 'manuallyCurated',
}, {
  legacyEdgeId: null, source: 'jv:ultium_cells', target: 'product:battery_cell',
  beforeType: '(none)', afterType: 'manufactures', beforeStatus: '(none)', afterStatus: 'reference',
  origin: 'manuallyCurated', reason: 'JV manufactures cells — product/about page → reference not reported',
});
manuallyCurated += 1;

// Migrate legacy partners
function ensureGlobal(id) {
  const meta = GLOBAL_META[id];
  if (!meta) return null;
  const nid = `global:${id}`;
  addNode({
    id: nid,
    type: 'global_company',
    nameKo: meta.nameKo,
    nameEn: meta.nameEn,
    role: 'global',
    region: meta.region,
    legacyId: id,
  });
  return nid;
}

for (const c of companies) {
  const sourceId = `krx:${c.ticker}`;
  for (const raw of c.partners || []) {
    const p = typeof raw === 'string' ? { id: raw, kind: 'peer' } : raw;
    const legacyId = `legacy-${c.ticker}-${p.id}-${p.kind || 'peer'}`;
    const kind = p.kind || 'peer';
    const label = p.edgeLabel || '';
    const labelEn = p.edgeLabelEn || label;

    // Domestic listed partner by legacy company id
    const domestic = byLegacyId.get(p.id);
    if (domestic) {
      const targetId = `krx:${domestic.ticker}`;
      if (kind === 'backing' || /계열|그룹|지주/.test(label)) {
        // Without filing URL, do not mark reported owns — use reference group_member-like owns demoted
        const ok = addEdge({
          id: `legacy-${c.ticker}-${domestic.ticker}-group`,
          source: sourceId,
          target: targetId,
          type: 'reference',
          direction: 'source_to_target',
          status: 'reference',
          labelKo: label || '계열·그룹 참고',
          labelEn: labelEn || 'Group reference',
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          defaultHidden: true,
          noteKo: '레거시 backing — 지분·지배 공시 미확인. 참고만.',
          noteEn: 'Legacy backing without ownership filing — reference only.',
          edgeOrigin: 'legacyMigrated',
        }, {
          legacyEdgeId: legacyId, source: sourceId, target: targetId,
          beforeType: kind, afterType: 'reference', beforeStatus: 'legacy', afterStatus: 'reference',
          origin: 'legacyMigrated',
          reason: 'backing without DART/IR → reference (not reported owns)',
        });
        if (ok) legacyMigrated += 1;
      } else if (kind === 'theme' || /peer|협력|연계/.test(label)) {
        const ok = addEdge({
          id: `legacy-${c.ticker}-${domestic.ticker}-peer`,
          source: sourceId,
          target: targetId,
          type: 'peer',
          direction: 'undirected',
          status: 'peer',
          labelKo: label || '동종 비교',
          labelEn: labelEn || 'Peer',
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          defaultHidden: true,
          edgeOrigin: 'legacyMigrated',
        }, {
          legacyEdgeId: legacyId, source: sourceId, target: targetId,
          beforeType: kind, afterType: 'peer', beforeStatus: 'legacy', afterStatus: 'peer',
          origin: 'legacyMigrated', reason: 'theme/peer domestic → peer hidden',
        });
        if (ok) legacyMigrated += 1;
      } else if (/납품|공급|재료|동박|양극/.test(label)) {
        const ok = addEdge({
          id: `legacy-${c.ticker}-${domestic.ticker}-supply`,
          source: sourceId,
          target: targetId,
          type: 'supplies_material_to',
          direction: 'source_to_target',
          status: 'inferred',
          labelKo: label,
          labelEn: labelEn,
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          defaultHidden: true,
          noteKo: '레거시 라벨만 존재 — 공식 URL 없어 inferred.',
          noteEn: 'Legacy label only — inferred without official URL.',
          edgeOrigin: 'legacyMigrated',
        }, {
          legacyEdgeId: legacyId, source: sourceId, target: targetId,
          beforeType: kind || 'unknown', afterType: 'supplies_material_to',
          beforeStatus: 'legacy', afterStatus: 'inferred',
          origin: 'legacyMigrated', reason: 'supply label without URL → inferred',
        });
        if (ok) legacyMigrated += 1;
      } else {
        removedUnsupported += 1;
        logChange({
          legacyEdgeId: legacyId, source: sourceId, target: targetId,
          beforeType: kind, afterType: '(removed)', beforeStatus: 'legacy', afterStatus: '(removed)',
          origin: 'legacyMigrated', reason: 'unsupported domestic partner shape',
        });
      }
      continue;
    }

    // Global OEM / peer
    if (GLOBAL_META[p.id]) {
      const gid = ensureGlobal(p.id);
      // Named OEM without contract proof → peer OR exposed_to market — never supplies_cells_to
      if (['tesla', 'bmw', 'vw_group', 'gm_ev'].includes(p.id)) {
        addEdge({
          id: `exposed-${c.ticker}-${p.id}-oem`,
          source: sourceId,
          target: 'market:global_ev_oem',
          type: 'exposed_to',
          direction: 'source_to_target',
          status: 'reference',
          labelKo: '글로벌 EV OEM 수요 노출(익명·비교 수준)',
          labelEn: 'Global EV OEM exposure (not a named contract)',
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          defaultHidden: true,
          noteKo: '특정 공급계약을 입증하지 않습니다.',
          noteEn: 'Does not prove a named supply contract.',
          edgeOrigin: 'legacyMigrated',
        }, {
          legacyEdgeId: legacyId, source: sourceId, target: 'market:global_ev_oem',
          beforeType: kind, afterType: 'exposed_to', beforeStatus: 'legacy', afterStatus: 'reference',
          origin: 'legacyMigrated', reason: 'OEM name without contract URL → market exposure, not supplies_cells_to',
        });
        // Also keep peer to named OEM hidden
        addEdge({
          id: `peer-${c.ticker}-${p.id}`,
          source: sourceId,
          target: gid,
          type: 'peer',
          direction: 'undirected',
          status: 'peer',
          labelKo: label || '글로벌 참고',
          labelEn: labelEn || 'Global reference',
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          defaultHidden: true,
          edgeOrigin: 'legacyMigrated',
        }, {
          legacyEdgeId: legacyId, source: sourceId, target: gid,
          beforeType: kind, afterType: 'peer', beforeStatus: 'legacy', afterStatus: 'peer',
          origin: 'legacyMigrated', reason: 'OEM string partner → peer hidden',
        });
        legacyMigrated += 2;
      } else if (p.id === 'catl') {
        addEdge({
          id: `peer-${c.ticker}-catl`,
          source: sourceId,
          target: gid,
          type: 'peer',
          direction: 'undirected',
          status: 'peer',
          labelKo: '글로벌 셀 peer',
          labelEn: 'Global cell peer',
          evidence: [],
          confidence: 'low',
          lastVerifiedAt: AS_OF,
          defaultHidden: true,
          edgeOrigin: 'legacyMigrated',
        }, {
          legacyEdgeId: legacyId, source: sourceId, target: gid,
          beforeType: kind, afterType: 'peer', beforeStatus: 'legacy', afterStatus: 'peer',
          origin: 'legacyMigrated', reason: 'CATL string → peer comparison only',
        });
        legacyMigrated += 1;
      }
      continue;
    }

    // Drop renewable/unrelated globals silently
    removedUnsupported += 1;
    logChange({
      legacyEdgeId: legacyId, source: sourceId, target: p.id,
      beforeType: kind, afterType: '(removed)', beforeStatus: 'legacy', afterStatus: '(removed)',
      origin: 'legacyMigrated', reason: 'unsupported/out-of-sector global partner dropped',
    });
  }
}

// LG Chem → LGES owns (spin-off major shareholder) — curated reported
if (nodeIds.has('krx:051910') && nodeIds.has('krx:373220')) {
  addEdge({
    id: 'owns-051910-373220',
    source: 'krx:051910',
    target: 'krx:373220',
    type: 'owns',
    direction: 'source_to_target',
    status: 'reported',
    labelKo: 'LG에너지솔루션 지분 보유',
    labelEn: 'Equity stake in LG Energy Solution',
    stakePct: null,
    evidence: mkEv({
      sourceType: 'official',
      title: 'LG Chem ownership of LG Energy Solution',
      url: 'https://www.lgchem.com/company/company-information/affiliated-companies',
      relationshipSupported: 'LG Chem holds stake in LG Energy Solution (affiliate)',
      evidenceSummaryKo: 'LG화학–LG에너지솔루션 계열·지분 관계(공식 계열사 소개)',
    }),
    confidence: 'medium',
    lastVerifiedAt: AS_OF,
    edgeOrigin: 'manuallyCurated',
  }, {
    legacyEdgeId: 'backing-lgchem-lges', source: 'krx:051910', target: 'krx:373220',
    beforeType: 'backing', afterType: 'owns', beforeStatus: 'legacy', afterStatus: 'reported',
    origin: 'manuallyCurated', reason: 'LG Chem–LGES affiliate ownership reported; stakePct null pending DART',
  });
  manuallyCurated += 1;
}

const network = {
  sectorId: 'battery',
  model: 'battery_circular_value_chain',
  asOf: AS_OF,
  lastReviewedAt: AS_OF,
  layers: ['소재', '부품', '장비', '셀', 'ESS', '수요시장', '재활용'],
  metrics: {
    legacyMigratedEdgeCount: legacyMigrated,
    structuralGeneratedEdgeCount: structuralGenerated,
    manuallyCuratedEdgeCount: manuallyCurated,
    removedEdgeCount: removedUnsupported,
    finalEdgeCount: edges.length,
  },
  nodes,
  edges,
};

fs.mkdirSync(join(ROOT, 'data', 'networks'), { recursive: true });
fs.writeFileSync(OUT_NET, JSON.stringify(network, null, 2) + '\n', 'utf8');
fs.writeFileSync(OUT_LOG, JSON.stringify({
  migratedAt: AS_OF,
  ...network.metrics,
  statusCounts: edges.reduce((m, e) => { m[e.status] = (m[e.status] || 0) + 1; return m; }, {}),
  typeCounts: edges.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {}),
  changes: changelog,
}, null, 2) + '\n', 'utf8');

const report = validateNetworkReport(network);
console.log('\nbattery Phase 3B migration');
console.log(JSON.stringify({ ...network.metrics, statusCounts: report.summary.statusCounts, typeCounts: report.summary.typeCounts, coverage: {
  evidence: report.summary.evidenceFieldCoverage,
  direct: report.summary.directEvidenceCoverage,
  primary: report.summary.primarySourceCoverage,
}, failures: report.failures.length, warnings: report.warnings.length }, null, 2));
report.failures.slice(0, 20).forEach((f) => console.log(' FAIL', f));
report.warnings.slice(0, 15).forEach((w) => console.log(' WARN', w));
process.exit(report.failures.length ? 1 : 0);
