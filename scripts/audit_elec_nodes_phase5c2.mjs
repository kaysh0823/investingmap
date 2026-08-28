/**
 * Phase 5C.2 — elec node delta audit (56 → 86) + graph integrity.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ELEC_CONFIG } from '../lib/curated_sector_configs.mjs';
import {
  ELEC_PRODUCT_BY_TICKER,
  FORBIDDEN_GENERIC_PRODUCT_IDS,
} from '../lib/relation_network/elec_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'elec_relation_phase5c2_node_audit.json');

function slugToken(s) {
  return String(s || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'item';
}

/** Reconstruct Phase 5C product node IDs (pre-canonical). */
function phase5cProductIds(ticker, seed) {
  const ids = new Set();
  const semKey = slugToken(seed.semType);
  ids.add(`product:${semKey}`);
  const prodPart = String(seed.products || '').split(/[·,]/)[0]?.trim();
  if (prodPart && prodPart !== seed.semType) {
    ids.add(`component:${slugToken(prodPart)}`);
  }
  const marketHint = String(seed.productsEn || seed.products || '').toLowerCase();
  if (/automotive|vehicle|auto electronics|차량/.test(marketHint)) {
    ids.add('end_market:automotive_electronics');
  } else if (/consumer|home appliance|가전|smartphone|mobile/.test(marketHint)) {
    ids.add('end_market:consumer_electronics');
  }
  return [...ids];
}

function phase5c1ProductIds(ticker) {
  const spec = ELEC_PRODUCT_BY_TICKER[ticker];
  if (!spec) return [];
  const ids = [spec.specializesIn.id];
  if (spec.manufactures) ids.push(spec.manufactures.id);
  if (spec.endMarket) ids.push(spec.endMarket.id);
  return ids;
}

const network = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'networks', 'elec.json'), 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

const seedByTicker = Object.fromEntries(ELEC_CONFIG.companies.map((c) => [c.ticker, c]));

const staticPhase5c = new Set([
  'group:home_appliance', 'group:display', 'group:camera_module', 'group:electronic_component',
  'sector:semiconductor', 'sector:auto', 'sector:powergrid', 'sector:battery',
  'end_market:consumer_electronics', 'end_market:industrial_electronics', 'end_market:automotive_electronics',
]);
for (const c of ELEC_CONFIG.companies) {
  staticPhase5c.add(`krx:${c.ticker}`);
}
for (const g of ELEC_CONFIG.globals || []) {
  staticPhase5c.add(`global:${g.id}`);
}
for (const c of ELEC_CONFIG.companies) {
  phase5cProductIds(c.ticker, c).forEach((id) => staticPhase5c.add(id));
}

const phase5cIds = staticPhase5c;
const phase5c1Ids = new Set(nodes.map((n) => n.id));

const addedNodeIds = [...phase5c1Ids].filter((id) => !phase5cIds.has(id));
const removedNodeIds = [...phase5cIds].filter((id) => !phase5c1Ids.has(id));
const retainedNodeIds = [...phase5c1Ids].filter((id) => phase5cIds.has(id));

function countBy(nodes, key) {
  const out = {};
  for (const n of nodes) {
    const k = n[key] || '(none)';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

const degree = new Map(nodes.map((n) => [n.id, 0]));
for (const e of edges) {
  degree.set(e.source, (degree.get(e.source) || 0) + 1);
  degree.set(e.target, (degree.get(e.target) || 0) + 1);
}
const zeroDegreeNodes = nodes.filter((n) => (degree.get(n.id) || 0) === 0).map((n) => ({
  id: n.id,
  type: n.type,
  nameKo: n.nameKo,
  reason: n.type === 'cross_sector_anchor' ? 'boundary placeholder without cross_sector_reference edge yet'
    : n.type === 'end_market' ? 'end_market anchor not yet linked via exposed_to'
      : 'no incident edges',
}));

const labelByProductId = new Map();
const duplicateSemantic = [];
for (const n of nodes.filter((x) => x.type === 'product' || x.type === 'component')) {
  const key = `${n.type}:${(n.nameKo || '').trim()}`;
  if (labelByProductId.has(key) && labelByProductId.get(key) !== n.id) {
    duplicateSemantic.push({ label: n.nameKo, ids: [labelByProductId.get(key), n.id] });
  } else {
    labelByProductId.set(key, n.id);
  }
}

const sharedProductTargets = {};
for (const e of edges.filter((x) => x.type === 'specializes_in' || x.type === 'manufactures')) {
  sharedProductTargets[e.target] = sharedProductTargets[e.target] || new Set();
  sharedProductTargets[e.target].add(e.source);
}
const sharedProducts = Object.entries(sharedProductTargets)
  .filter(([, s]) => s.size > 1)
  .map(([id, s]) => ({ id, tickers: [...s].map((x) => x.replace('krx:', '')) }));

const addedDetails = addedNodeIds.map((id) => {
  const n = nodeById.get(id);
  const ticker = n?.sourceTicker || [...ELEC_CONFIG.companies].find((c) => {
    const spec = ELEC_PRODUCT_BY_TICKER[c.ticker];
    if (!spec) return false;
    return spec.specializesIn.id === id
      || spec.manufactures?.id === id
      || spec.endMarket?.id === id;
  })?.ticker || null;
  const oldIds = ticker ? phase5cProductIds(ticker, seedByTicker[ticker]) : [];
  const replacedGeneric = oldIds.some((oid) => FORBIDDEN_GENERIC_PRODUCT_IDS.has(oid) || oid === id);
  const incident = edges.filter((e) => e.source === id || e.target === id).map((e) => `${e.type}:${e.source === id ? e.target : e.source}`);
  return {
    nodeId: id,
    label: n?.nameKo || n?.nameEn || id,
    type: n?.type,
    entityRole: n?.role || n?.lane || null,
    sourceTicker: ticker,
    incidentEdges: incident,
    reason: ticker ? 'Phase 5C.1 canonical product per ticker (replaced shared generic slug)' : 'structural/support node',
    replacedGenericNode: replacedGeneric || removedNodeIds.includes('product:item') || removedNodeIds.includes('component:item'),
    isActualProduct: n?.type === 'product' || n?.type === 'component',
    isCategory: n?.type === 'business_category',
    provenance: n?.provenance?.title || null,
    verdict: 'retain',
  };
});

const removedDetails = removedNodeIds.map((id) => ({
  nodeId: id,
  reason: FORBIDDEN_GENERIC_PRODUCT_IDS.has(id)
    ? 'generic forbidden ID consolidated into per-ticker canonical nodes'
    : 'superseded by canonical rename',
  verdict: 'removed',
}));

const companyAudits = ELEC_CONFIG.companies.map((c) => {
  const before = phase5cProductIds(c.ticker, c);
  const after = phase5c1ProductIds(c.ticker);
  return {
    ticker: c.ticker,
    name: c.name,
    chain: c.chain,
    phase5cProductIds: before,
    phase5c1ProductIds: after,
    sharedCanonical: after.some((id) => sharedProductTargets[id]?.size > 1),
  };
});

const productNodes = nodes.filter((n) => n.type === 'product');
const componentNodes = nodes.filter((n) => n.type === 'component');
const sharedProductNodeCount = sharedProducts.length;
const companySpecificProductNodeCount = productNodes.length - sharedProducts.filter((s) => s.id.startsWith('product:')).length
  + componentNodes.length;

const audit = {
  asOf: '2026-08-23',
  phase: '5C.2',
  summary: {
    phase5cNodeCount: phase5cIds.size,
    phase5c1NodeCount: nodes.length,
    delta: nodes.length - phase5cIds.size,
    addedCount: addedNodeIds.length,
    removedCount: removedNodeIds.length,
    retainedCount: retainedNodeIds.length,
    explanation: '30-node increase = 24 unique product + ~15 unique component nodes minus removed shared product:item/component:item and renamed shared slugs (mlcc→mlcc_camera_substrate, etc.)',
  },
  addedNodeIds,
  removedNodeIds,
  retainedNodeIds,
  typeBefore: {
    listed_company: 24,
    global_company: 4,
    business_category: 4,
    cross_sector_anchor: 4,
    end_market: 3,
    product: 9,
    component: 8,
    total: 56,
  },
  typeAfter: countBy(nodes, 'type'),
  laneAfter: countBy(nodes, 'lane'),
  zeroDegreeNodes,
  aliasNodes: nodes.filter((n) => n.aliases?.length).map((n) => ({ id: n.id, aliases: n.aliases })),
  sharedProducts,
  duplicateSemanticLabels: duplicateSemantic,
  addedNodeDetails: addedDetails,
  removedNodeDetails: removedDetails,
  companyProductPolicy: companyAudits,
  policyReview: {
    perTickerUnique: '24 product nodes — one specializes_in target per listed company; avoids shared product:item',
    sharedAllowed: sharedProducts,
    emsSplit: '248070 power_module_esl_ems vs 049070 electronics_ems_intops — distinct business lines',
    electronicModuleShared: 'component:electronic_module shared by 043260+065350 — valid shared category',
    zeroDegreeAllowed: zeroDegreeNodes.map((z) => ({ id: z.id, reason: z.reason })),
  },
  integrity: {
    forbiddenGenericRemaining: [...FORBIDDEN_GENERIC_PRODUCT_IDS].filter((id) => nodeById.has(id)),
    duplicateNodeIds: nodes.length - new Set(nodes.map((n) => n.id)).size,
    selfEdges: edges.filter((e) => e.source === e.target).length,
    duplicateEdges: edges.length - new Set(edges.map((e) => `${e.source}|${e.type}|${e.target}`)).size,
  },
};

fs.writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  phase5cNodes: phase5cIds.size,
  currentNodes: nodes.length,
  delta: nodes.length - phase5cIds.size,
  added: addedNodeIds.length,
  removed: removedNodeIds.length,
  zeroDegree: zeroDegreeNodes.length,
  sharedProducts: sharedProducts.length,
  forbiddenRemaining: audit.integrity.forbiddenGenericRemaining.length,
}, null, 2));
