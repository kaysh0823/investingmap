/**
 * verify:battery — Phase 3B circular value-chain network.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'battery.json');
check(fs.existsSync(netFp), 'missing data/networks/battery.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
report.failures.forEach((f) => failures.push(`v2: ${f}`));

const profile = NETWORK_PROFILES.battery;
check(profile?.model === 'battery_circular_value_chain', 'profile model');
check(profile?.layout === 'layeredSupplyChain', 'profile layout');
check(profile?.networkPath === 'data/networks/battery.json', 'profile networkPath');
check(network.model === 'battery_circular_value_chain', 'network model');
check(!network._legacyFallback, 'legacyFallback false');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'battery', 'korea_battery_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
  const n = byId.get(`krx:${c.ticker}`);
  if (n) check(n.type === 'listed_company', `${c.ticker} must be listed_company`);
}

check(byId.has('jv:ultium_cells'), 'Ultium JV node');
check(byId.has('kr:sk_on'), 'SK On unlisted node');
check(edges.some((e) => e.isRecyclingLoop), 'recycling loop edges');

const structural = edges.filter((e) => e.edgeOrigin === 'structuralGenerated').length;
const legacy = edges.filter((e) => e.edgeOrigin === 'legacyMigrated').length;
const manual = edges.filter((e) => e.edgeOrigin === 'manuallyCurated').length;
check(structural > 0 && legacy > 0, 'need structural + legacy edges');

for (const e of edges.filter((x) => x.status === 'ended')) {
  check(e.defaultHidden !== false, `ended ${e.id} defaultHidden`);
}

const supplies = edges.filter((e) => String(e.type).startsWith('supplies_'));
for (const e of supplies) {
  const rev = edges.find((x) => x.source === e.target && x.target === e.source && String(x.type).includes('customer'));
  check(!rev, `reverse supply/customer near ${e.id}`);
}

check(html.includes('relation_network.js'), 'battery page relation_network.js');
check(html.includes('RelationNetwork v2') || html.includes('rn-detail-panel'), 'v2 UI');
check(html.includes('data-sector="battery"'), 'data-sector');

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try { new vm.Script(match[2]); } catch (error) {
    failures.push(`inline script: ${error.message}`);
  }
}

const m = network.metrics || {};
console.log('Battery relationship network verification (Phase 3B)');
console.log('===================================================');
console.log('nodes/edges:', nodes.length, edges.length);
console.log('origin:', { structural, legacy, manual, metrics: m });
console.log('statusCounts:', report.summary.statusCounts);
console.log('typeCounts:', report.summary.typeCounts);
console.log('evidence/direct/primary:',
  report.summary.evidenceFieldCoverage + '%',
  report.summary.directEvidenceCoverage + '%',
  report.summary.primarySourceCoverage + '%');
console.log('orphanListed:', report.summary.orphanListedCompanyCount);
console.log('orphanSplit:', {
  structuralOrphanCount: report.summary.structuralOrphanCount,
  businessRelationOrphanCount: report.summary.businessRelationOrphanCount,
  directRelationshipOrphanCount: report.summary.directRelationshipOrphanCount,
  classificationOnlyCompanyCount: report.summary.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: report.summary.weakRelationOnlyCompanyCount,
});
const metricsFp = join(ROOT, 'data', 'battery_relation_phase3b_metrics.json');
check(fs.existsSync(metricsFp), 'missing data/battery_relation_phase3b_metrics.json');
if (fs.existsSync(metricsFp)) {
  const bm = JSON.parse(fs.readFileSync(metricsFp, 'utf8'));
  check(typeof bm.businessRelationOrphanCount === 'number', 'metrics businessRelationOrphanCount');
  check(bm.structuralOrphanCount === 0, 'battery structural orphans unexpected');
}
console.log('validate warnings:', report.warnings.length);
report.warnings.slice(0, 10).forEach((w) => console.log('  WARN', w));
console.log('failures:', failures.length);
failures.forEach((f) => console.log('  -', f));
process.exit(failures.length ? 1 : 0);
