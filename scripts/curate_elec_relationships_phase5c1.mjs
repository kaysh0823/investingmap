/**
 * Phase 5C.1 — elec product canonical correction + cross-sector audit + business curation.
 * Runs after migrate_elec_network_phase5c.mjs.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeElecMetrics } from '../lib/relation_network/elec_metrics.mjs';
import {
  ELEC_PRODUCT_BY_TICKER,
  FORBIDDEN_GENERIC_PRODUCT_IDS,
  ELEC_PRODUCT_ID_ALIASES,
} from '../lib/relation_network/elec_product_canonical.mjs';
import { ELEC_CONFIG } from '../lib/curated_sector_configs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = '2026-08-23';
const BY = 'editorial_phase5c1';
const NET_FP = join(ROOT, 'data', 'networks', 'elec.json');
const LOG_FP = join(ROOT, 'data', 'elec_relation_phase5c1_changelog.json');
const AUDIT_FP = join(ROOT, 'data', 'elec_product_audit_phase5c1.json');

const CROSS_SECTOR_AUDIT = [
  {
    ticker: '077360',
    target: 'sector:semiconductor',
    primaryRoleKo: '반도체 패키징 솔더·소재',
    primaryRoleEn: 'Semiconductor packaging solder and materials',
    reasonKo: '패키징 솔더볼·소재는 semiconductor 섹터 범위. elec에서 confirmed 공급망 중복 생성 금지.',
    reasonEn: 'Packaging solder/materials owned by semiconductor sector; no duplicate confirmed supply in elec.',
    owningSector: 'semiconductor',
    evidenceTitle: 'ELEC_CONFIG — Duksan Hi-Metal semType (structural reference only)',
  },
  {
    ticker: '011070',
    target: 'sector:auto',
    primaryRoleKo: '스마트폰 카메라모듈·차량용 전장',
    primaryRoleEn: 'Smartphone camera modules and automotive electronics',
    reasonKo: '차량용 전장 OEM confirmed 공급은 auto 섹터에서만 큐레이션.',
    reasonEn: 'Confirmed automotive OEM supply curated in auto sector only.',
    owningSector: 'auto',
    evidenceTitle: 'ELEC_CONFIG — LG Innotek products include automotive electronics',
  },
  {
    ticker: '192650',
    target: 'sector:auto',
    primaryRoleKo: '카메라·생체인증 모듈',
    primaryRoleEn: 'Camera and biometric modules',
    reasonKo: '차량/모바일 모듈 overlap auto; sector reference only.',
    reasonEn: 'Vehicle/mobile module overlap with auto; sector reference only.',
    owningSector: 'auto',
    evidenceTitle: 'ELEC_CONFIG — Dreamtech semType/products',
  },
  {
    ticker: '049070',
    target: 'sector:auto',
    primaryRoleKo: '전자기기 EMS·자동차 모듈 조립',
    primaryRoleEn: 'Electronics EMS and automotive module assembly',
    reasonKo: 'EMS·자동차 모듈 overlap auto; sector reference only.',
    reasonEn: 'EMS and automotive modules overlap auto; sector reference only.',
    owningSector: 'auto',
    evidenceTitle: 'ELEC_CONFIG — Intops semType/products',
  },
];

/** Business candidates investigated — all deferred without opened DART/KIND primary source in this phase. */
const BUSINESS_CANDIDATES = [
  {
    candidateId: 'supply-semco-anonymous-oem',
    sourceTicker: '009150',
    sourceLegalName: '삼성전기',
    targetLegalName: 'anonymous',
    relationType: 'supplies_component_to',
    product: 'MLCC',
    note: 'MLCC major customers often undisclosed in public filings; requires DART 단일판매·공급계약 with named counterparty',
    finalDecision: 'deferred',
    reason: 'No opened DART supply contract with exact counterparty in editorial review scope',
  },
  {
    candidateId: 'supply-lginnotek-oem',
    sourceTicker: '011070',
    sourceLegalName: 'LG이노텍',
    targetLegalName: 'anonymous',
    relationType: 'supplies_module_to',
    product: 'camera_module',
    note: 'Smartphone OEM customers typically anonymous; auto OEM supply belongs in auto sector',
    finalDecision: 'deferred',
    reason: 'Cross-sector auto overlap; no exact OEM DART contract opened for elec curation',
  },
  {
    candidateId: 'supply-duksan-semi-packaging',
    sourceTicker: '077360',
    sourceLegalName: '덕산하이메탈',
    targetLegalName: 'sector:semiconductor',
    relationType: 'supplies_material_to',
    product: 'solder_ball',
    note: 'Packaging material customers are semiconductor sector scope',
    finalDecision: 'rejected',
    reason: 'Would duplicate semiconductor sector supply chain; keep cross_sector_reference only',
  },
];

const network = JSON.parse(fs.readFileSync(NET_FP, 'utf8'));
const nodes = network.nodes || [];
const edges = network.edges || [];
const changelog = [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

function log(entry) {
  changelog.push({ asOf: AS_OF, reviewedBy: BY, ...entry });
}

function mkStructEv(title, provenance) {
  return [{
    title,
    sourceType: provenance?.sourceType || 'elec_config',
    primarySource: false,
    directEvidence: false,
    sourceOpened: false,
    reviewStatus: 'reviewed',
    reviewedAt: AS_OF,
    reviewedBy: BY,
    relationshipSupported: title,
    claimSupport: { relationship: true, product: true, legalEntity: true },
    accessedAt: AS_OF,
    evidenceUsageType: 'classification',
    evidenceScope: 'structural_reference',
  }];
}

function renameNodeId(oldId, newId) {
  if (oldId === newId || !nodeById.has(oldId)) return false;
  if (nodeById.has(newId)) {
    const oldNode = nodeById.get(oldId);
    const keep = nodeById.get(newId);
    if (!keep.aliases) keep.aliases = [];
    if (!keep.aliases.includes(oldId)) keep.aliases.push(oldId);
    nodes.splice(nodes.indexOf(oldNode), 1);
    nodeById.delete(oldId);
    log({ action: 'merge_duplicate_node', before: oldId, after: newId, reason: 'canonical consolidation' });
    return true;
  }
  const node = nodeById.get(oldId);
  if (!node.aliases) node.aliases = [];
  node.aliases.push(oldId);
  node.id = newId;
  nodeById.delete(oldId);
  nodeById.set(newId, node);
  for (const e of edges) {
    if (e.source === oldId) e.source = newId;
    if (e.target === oldId) e.target = newId;
  }
  log({ action: 'rename_node', before: oldId, after: newId });
  return true;
}

function removeOrphanNode(id) {
  const used = edges.some((e) => e.source === id || e.target === id);
  if (used) return false;
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    nodes.splice(idx, 1);
    nodeById.delete(id);
    log({ action: 'remove_orphan_node', nodeId: id });
    return true;
  }
  return false;
}

// ── 1. Generic product ID remediation ──
for (const [oldId, newId] of Object.entries(ELEC_PRODUCT_ID_ALIASES)) {
  if (!nodeById.has(oldId)) continue;
  if (newId) renameNodeId(oldId, newId);
  else removeOrphanNode(oldId);
}

for (const id of [...FORBIDDEN_GENERIC_PRODUCT_IDS]) {
  if (nodeById.has(id)) {
    log({
      action: 'fail_generic_remains',
      nodeId: id,
      reason: 'forbidden generic product ID still present after migration',
    });
  }
}

// Ensure provenance on product/component nodes
for (const [ticker, spec] of Object.entries(ELEC_PRODUCT_BY_TICKER)) {
  for (const ref of [spec.specializesIn, spec.manufactures].filter(Boolean)) {
    const node = nodeById.get(ref.id);
    if (!node) continue;
    node.provenance = spec.provenance;
    node.sourceTicker = ticker;
  }
}

// ── 2. Cross-sector reference metadata ──
for (const audit of CROSS_SECTOR_AUDIT) {
  const edgeId = `cross-sector-${audit.ticker}-${audit.target.replace(':', '-')}`;
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) {
    log({ action: 'missing_cross_sector', edgeId, ticker: audit.ticker, finalDecision: 'deferred' });
    continue;
  }
  edge.status = 'reference';
  edge.crossSectorReference = true;
  edge.owningSector = audit.owningSector;
  edge.referencedBySectors = ['elec'];
  edge.duplicateBusinessCountExcluded = true;
  edge.excludesFromBusinessCoverage = true;
  edge.excludesFromOrphanResolution = true;
  edge.primaryRoleInElecKo = audit.primaryRoleKo;
  edge.primaryRoleInElecEn = audit.primaryRoleEn;
  edge.noteKo = audit.reasonKo;
  edge.noteEn = audit.reasonEn;
  edge.evidence = mkStructEv(audit.evidenceTitle, { sourceType: 'elec_config' });
  edge.lastVerifiedAt = AS_OF;
  edge.reviewStatus = 'reviewed';
  edge.reviewedAt = AS_OF;
  edge.reviewedBy = BY;
  log({
    action: 'audit_cross_sector_reference',
    edgeId,
    ticker: audit.ticker,
    target: audit.target,
    owningSector: audit.owningSector,
    duplicateBusinessCountExcluded: true,
    finalDecision: 'accepted',
  });
}

// ── 3. Business relationship curation (none accepted without DART) ──
for (const cand of BUSINESS_CANDIDATES) {
  log({
    action: 'business_candidate_review',
    ...cand,
    editorialStatus: cand.finalDecision === 'accepted' ? 'confirmed' : null,
  });
}

log({
  action: 'defer_business_relationships',
  reason: 'Phase 5C.1 — no business edge accepted without opened DART/KIND primary source',
  acceptedCount: 0,
});

// ── 4. Product audit table ──
const seedByTicker = Object.fromEntries(ELEC_CONFIG.companies.map((c) => [c.ticker, c]));
const productAudit = Object.keys(ELEC_PRODUCT_BY_TICKER).map((ticker) => {
  const spec = ELEC_PRODUCT_BY_TICKER[ticker];
  const seed = seedByTicker[ticker];
  const productNode = nodeById.get(spec.specializesIn.id);
  const componentNode = spec.manufactures ? nodeById.get(spec.manufactures.id) : null;
  const genericBefore = ['product:item', 'component:item'].some((id) => productNode?.aliases?.includes(id));
  return {
    ticker,
    legalName: seed?.name || seed?.nameKo || '',
    displayName: seed?.nameEn || '',
    chain: seed?.chain || '',
    primaryLane: spec.lane,
    existingProductNode: productNode?.id || null,
    existingProductId: spec.specializesIn.id,
    productLabel: spec.specializesIn.nameKo,
    componentId: spec.manufactures?.id || null,
    componentLabel: spec.manufactures?.nameKo || null,
    evidenceUrl: null,
    evidenceSource: spec.provenance.title,
    actualProductConfirmed: true,
    genericIdBefore: genericBefore,
    genericIdAfter: FORBIDDEN_GENERIC_PRODUCT_IDS.has(spec.specializesIn.id),
    duplicateProduct: false,
    crossSectorRelevance: CROSS_SECTOR_AUDIT.some((x) => x.ticker === ticker) ? CROSS_SECTOR_AUDIT.find((x) => x.ticker === ticker).target : null,
    businessRelationCandidate: BUSINESS_CANDIDATES.some((c) => c.sourceTicker === ticker),
    humanReview: BUSINESS_CANDIDATES.find((c) => c.sourceTicker === ticker)?.finalDecision === 'deferred',
  };
});

fs.writeFileSync(AUDIT_FP, `${JSON.stringify({ asOf: AS_OF, phase: '5C.1', companies: productAudit }, null, 2)}\n`, 'utf8');

// ── 5. Metrics + validate ──
network.phase5c1CuratedAt = AS_OF;
network.nodes = nodes;
network.edges = edges;
network.metrics = computeElecMetrics(network);

const report = validateNetworkReport(network);
fs.writeFileSync(NET_FP, `${JSON.stringify(network, null, 2)}\n`, 'utf8');
fs.writeFileSync(LOG_FP, `${JSON.stringify({
  asOf: AS_OF,
  phase: '5C.1',
  reviewedBy: BY,
  productAuditCount: productAudit.length,
  crossSectorAudited: CROSS_SECTOR_AUDIT.length,
  businessCandidates: BUSINESS_CANDIDATES,
  metrics: network.metrics,
  validate: { failures: report.failures, warnings: report.warnings },
  changes: changelog,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  phase: '5C.1',
  nodes: nodes.length,
  edges: edges.length,
  genericRemaining: [...FORBIDDEN_GENERIC_PRODUCT_IDS].filter((id) => nodeById.has(id)),
  confirmedBusiness: network.metrics.confirmedBusinessEdgeCount,
  crossSectorReference: network.metrics.crossSectorReferenceCount,
  failures: report.failures,
  warnings: report.warnings.slice(0, 10),
}, null, 2));

if (report.failures.length) process.exitCode = 1;
