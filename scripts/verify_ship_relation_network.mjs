/**
 * verify:ship — Phase 3C project-ecosystem network.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'ship.json');
check(fs.existsSync(netFp), 'missing data/networks/ship.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
report.failures.forEach((f) => failures.push(`v2: ${f}`));

const profile = NETWORK_PROFILES.ship;
check(profile?.model === 'shipbuilding_project_ecosystem', 'profile model');
check(profile?.layout === 'projectEcosystem', 'profile layout');
check(profile?.networkPath === 'data/networks/ship.json', 'profile networkPath');
check(network.model === 'shipbuilding_project_ecosystem', 'network model');
check(!network._legacyFallback, 'legacyFallback false');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'ship', 'korea_ship_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
  const n = byId.get(`krx:${c.ticker}`);
  if (n) check(n.type === 'listed_company', `${c.ticker} must be listed_company`);
}

check(nodes.some((n) => n.type === 'order_contract'), 'need order_contract nodes');
check(nodes.some((n) => n.type === 'vessel_type'), 'need vessel_type nodes');
check(nodes.some((n) => n.isAnonymousCounterparty), 'need anonymous counterparty node');
check(edges.some((e) => e.type === 'ordered'), 'need ordered edges');
check(edges.some((e) => e.type === 'awarded_to'), 'need awarded_to edges');

const structural = edges.filter((e) => e.edgeOrigin === 'structuralGenerated').length;
const legacy = edges.filter((e) => e.edgeOrigin === 'legacyMigrated').length;
const manual = edges.filter((e) => e.edgeOrigin === 'manuallyCurated').length;
check(structural > 0 && legacy > 0 && manual > 0, 'need structural + legacy + manual edges');

for (const e of edges.filter((x) => x.status === 'ended')) {
  check(e.defaultHidden !== false, `ended ${e.id} defaultHidden`);
}

check(html.includes('relation_network.js'), 'ship page relation_network.js');
check(html.includes('RelationNetwork v2') || html.includes('rn-detail-panel'), 'v2 UI');
check(html.includes('data-sector="ship"'), 'data-sector');

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try { new vm.Script(match[2]); } catch (error) {
    failures.push(`inline script: ${error.message}`);
  }
}

const orphan = computeListedRelationOrphanMetrics(network);
const m = network.metrics || {};
console.log('Ship relationship network verification (Phase 3C)');
console.log('================================================');
console.log('nodes/edges:', nodes.length, edges.length);
console.log('origin:', { structural, legacy, manual, metrics: m });
console.log('statusCounts:', report.summary.statusCounts);
console.log('typeCounts:', report.summary.typeCounts);
console.log('evidence/direct/primary:',
  report.summary.evidenceFieldCoverage + '%',
  report.summary.directEvidenceCoverage + '%',
  report.summary.primarySourceCoverage + '%');
console.log('orphan split:', {
  structuralOrphanCount: orphan.structuralOrphanCount,
  businessRelationOrphanCount: orphan.businessRelationOrphanCount,
  directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
  classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
});
console.log('validate warnings:', report.warnings.length);
report.warnings.slice(0, 12).forEach((w) => console.log('  WARN', w));
console.log('failures:', failures.length);
failures.forEach((f) => console.log('  -', f));
process.exit(failures.length ? 1 : 0);
