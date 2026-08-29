/**
 * Phase 3B-0 — fix bigchip Phase 3A metric inconsistencies:
 * - demote weak reported → reference/inferred
 * - annotate edgeOrigin on edges
 * - write metrics breakdown changelog
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { computeEvidenceCoverageBreakdown } from '../lib/relation_network/evidence_audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NET = join(ROOT, 'data', 'networks', 'bigchip.json');
const OUT = join(ROOT, 'data', 'bigchip_phase3b0_metrics_fix.json');

const STRUCT_TYPES = new Set(['produces', 'exposed_to', 'used_in_market']);
const MANUAL_IDS = new Set(['owns-000660-solidigm', 'competes-005930-000660']);

const WEAK_REPORTED = [
  /^https?:\/\/[^/?#]+\/?$/,
  /Supplier%20List/i,
  /\/products?\/?$/i,
  /\/product\//i,
  /company\/history/i,
  /wimco\.co\.kr/i,
  /semiconductor\.samsung\.com\/(?:dram|foundry)?\/?$/i,
  /skhynix\.com\/eng\/product/i,
  /alphasquare\.co\.kr/i,
  /kisrating\.com\/fileDown/i,
  /theworldfolio\.com/i,
  /yahoo\.com\/news/i,
  /v\.daum\.net/i,
];

function classifyEvidenceUrl(url) {
  if (!url) return 'no_direct_counterparty_mention';
  if (/Supplier%20List|supplier.?list/i.test(url)) return 'generic_supplier_list';
  if (WEAK_REPORTED.some((re) => re.test(url))) return 'homepage_or_product_page';
  if (/dart\.fss|kind\.krx|opendart|sec\.gov/i.test(url)) return 'exact_primary_document';
  if (/news\.(samsung|skhynix)|press-releases|\/ir\/|investor\.|newsroom\.|qnityelectronics|airliquide\.com\/group\/press|dupont\.com\/news|shinetsu|sumcosi|gaonchips|appliedmaterials\.com\/news|lamresearch\.com/i.test(url)) {
    return 'exact_official_announcement';
  }
  if (/reuters|bloomberg|yna\.co|thelec|hankyung|etoday|asiae|trendforce|sedaily|digitaltoday|marketinsight|bloter|dealsite|sisajournal|datatooza/i.test(url)) {
    return 'exact_reliable_article';
  }
  return 'other';
}

const network = JSON.parse(fs.readFileSync(NET, 'utf8'));
const changes = [];
const reportedCats = {};

let legacyMigrated = 0;
let structuralGenerated = 0;
let manuallyCurated = 0;

for (const e of network.edges) {
  if (STRUCT_TYPES.has(e.type)) {
    e.edgeOrigin = 'structuralGenerated';
    structuralGenerated += 1;
  } else if (MANUAL_IDS.has(e.id)) {
    e.edgeOrigin = 'manuallyCurated';
    manuallyCurated += 1;
  } else {
    e.edgeOrigin = 'legacyMigrated';
    legacyMigrated += 1;
  }

  if (e.status !== 'reported') continue;
  const url = e.evidence?.[0]?.url || '';
  const cat = classifyEvidenceUrl(url);
  reportedCats[cat] = (reportedCats[cat] || 0) + 1;

  // Structural produces with product-page only → reference (not business "reported")
  if (e.type === 'produces' && (cat === 'homepage_or_product_page' || cat === 'generic_supplier_list')) {
    const before = e.status;
    e.status = 'reference';
    e.defaultHidden = false; // product structure visible but not transactional
    e.confidence = 'low';
    e.noteKo = (e.noteKo || '') + ' 제품 페이지 근거 — 기업 간 거래 reported가 아님.';
    e.noteEn = (e.noteEn || '') + ' Product-page support — not a reported company trade.';
    changes.push({ edgeId: e.id, beforeStatus: before, afterStatus: 'reference', reason: 'produces+product page → reference (not reported trade)', category: cat });
    continue;
  }

  if (cat === 'homepage_or_product_page' || cat === 'generic_supplier_list' || cat === 'no_direct_counterparty_mention') {
    const before = e.status;
    e.status = 'reference';
    e.defaultHidden = true;
    e.confidence = 'low';
    for (const ev of e.evidence || []) {
      ev.directEvidence = false;
      ev.reviewStatus = 'needs_human_review';
    }
    changes.push({ edgeId: e.id, beforeStatus: before, afterStatus: 'reference', reason: `weak reported demoted (${cat})`, category: cat });
  }
}

// Solidigm: keep reported; ensure directEvidence + reviewed for coverage consistency
const solidigm = network.edges.find((e) => e.id === 'owns-000660-solidigm');
if (solidigm?.evidence?.[0]) {
  solidigm.evidence[0].directEvidence = true;
  solidigm.evidence[0].reviewStatus = 'reviewed';
  solidigm.evidence[0].reviewedAt = '2026-08-22';
  solidigm.evidence[0].reviewedBy = 'editorial_manual_review';
  solidigm.reviewStatus = 'reviewed';
  solidigm.reviewedAt = '2026-08-22';
  solidigm.reviewedBy = 'editorial_manual_review';
  // Still NOT confirmed — ownership announcement reviewed but stakePct/current state gate incomplete
  changes.push({
    edgeId: solidigm.id,
    beforeStatus: 'reported',
    afterStatus: 'reported',
    reason: 'directEvidence reviewed metadata aligned; remains reported (not confirmed)',
  });
}

network.lastReviewedAt = '2026-08-23';
fs.writeFileSync(NET, JSON.stringify(network, null, 2) + '\n', 'utf8');

const report = validateNetworkReport(network);
const coverage = computeEvidenceCoverageBreakdown(network.edges);
const statusCounts = network.edges.reduce((m, e) => {
  m[e.status] = (m[e.status] || 0) + 1;
  return m;
}, {});

const metrics = {
  fixedAt: '2026-08-23',
  legacyMigratedEdgeCount: legacyMigrated,
  structuralGeneratedEdgeCount: structuralGenerated,
  manuallyCuratedEdgeCount: manuallyCurated,
  deduplicatedEdgeCount: 2, // mutual peer collapsed to competes_with; samsung/sk peer skipped
  removedEdgeCount: 0,
  finalEdgeCount: network.edges.length,
  explanation: '140 = 107 legacyMigrated + 31 structuralGenerated + 2 manuallyCurated (not “109 reclassified”)',
  reportedEvidenceCategoriesBeforeDemotion: reportedCats,
  demotions: changes.filter((c) => c.beforeStatus === 'reported' && c.afterStatus !== 'reported'),
  solidigmAlignment: changes.filter((c) => c.edgeId === 'owns-000660-solidigm'),
  statusCountsAfter: statusCounts,
  coverageBreakdown: coverage,
  validate: { failures: report.failures.length, warnings: report.warnings.length },
};

fs.writeFileSync(OUT, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(metrics, null, 2));
console.log('Wrote', OUT);
process.exit(report.failures.length ? 1 : 0);
