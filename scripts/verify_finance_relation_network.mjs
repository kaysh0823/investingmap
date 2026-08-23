/**
 * verify:finance — Phase 3D ownershipTree network.
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

const netFp = join(ROOT, 'data', 'networks', 'finance.json');
check(fs.existsSync(netFp), 'missing data/networks/finance.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
report.failures.forEach((f) => failures.push(`v2: ${f}`));

const profile = NETWORK_PROFILES.finance;
check(profile?.model === 'financial_group_ecosystem', 'profile model');
check(profile?.layout === 'ownershipTree', 'profile layout');
check(profile?.networkPath === 'data/networks/finance.json', 'profile networkPath');
check(network.model === 'financial_group_ecosystem', 'network model');
check(!network._legacyFallback, 'legacyFallback false');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'finance', 'korea_finance_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
  const n = byId.get(`krx:${c.ticker}`);
  if (n) {
    check(n.type === 'listed_company', `${c.ticker} must be listed_company`);
    check(n.isListedKorea === true, `${c.ticker} isListedKorea`);
  }
}

check(nodes.some((n) => n.type === 'corporate_group'), 'need corporate_group nodes');
check(nodes.some((n) => n.type === 'domestic_unlisted_company'), 'need unlisted affiliate nodes');
check(edges.some((e) => e.type === 'owns'), 'need owns edges');
check(edges.some((e) => e.type === 'group_member'), 'need group_member edges');
check(edges.some((e) => e.type === 'member_of'), 'need member_of edges');

for (const e of edges.filter((x) => x.type === 'owns')) {
  check(e.stakePct == null || (e.stakePct >= 0 && e.stakePct <= 100), `owns stakePct range ${e.id}`);
  const rev = edges.find((x) => x.source === e.target && x.target === e.source && x.type === 'subsidiary_of');
  check(!rev, `owns/subsidiary_of reverse near ${e.id}`);
}

for (const n of nodes.filter((x) => x.type === 'domestic_unlisted_company')) {
  check(!n.ticker, `unlisted ${n.id} must not have ticker`);
  check(n.mcapWon == null, `unlisted ${n.id} must not have mcap`);
}
for (const n of nodes.filter((x) => x.type === 'category' || x.type === 'corporate_group')) {
  check(n.mcapWon == null, `non-company ${n.id} must not have mcap`);
}

const structural = edges.filter((e) => e.edgeOrigin === 'structuralGenerated').length;
const legacy = edges.filter((e) => e.edgeOrigin === 'legacyMigrated').length;
const manual = edges.filter((e) => e.edgeOrigin === 'manuallyCurated').length;
check(structural > 0 && legacy > 0 && manual > 0, 'need structural + legacy + manual');

check(html.includes('relation_network.js'), 'finance page relation_network.js');
check(html.includes('RelationNetwork v2') || html.includes('rn-detail-panel'), 'v2 UI');
check(html.includes('data-sector="finance"'), 'data-sector');

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try { new vm.Script(match[2]); } catch (error) {
    failures.push(`inline script: ${error.message}`);
  }
}

const orphan = computeListedRelationOrphanMetrics(network);
const m = network.metrics || {};
console.log('Finance relationship network verification (Phase 3D)');
console.log('===================================================');
console.log('nodes/edges:', nodes.length, edges.length);
console.log('origin:', { structural, legacy, manual, metrics: m });
console.log('statusCounts:', report.summary.statusCounts);
console.log('typeCounts:', report.summary.typeCounts);
console.log('evidence/direct/primary:',
  report.summary.evidenceFieldCoverage + '%',
  report.summary.directEvidenceCoverage + '%',
  report.summary.primarySourceCoverage + '%');
console.log('ownership:', {
  ownershipEdgeCount: m.ownershipEdgeCount,
  confirmedOwnershipEdgeCount: m.confirmedOwnershipEdgeCount,
  reportedOwnershipEdgeCount: m.reportedOwnershipEdgeCount,
  ownershipWithStakePctCount: m.ownershipWithStakePctCount,
  ownershipWithAsOfCount: m.ownershipWithAsOfCount,
  ownershipDirectEvidenceCoverage: m.ownershipDirectEvidenceCoverage,
  ownershipPrimarySourceCoverage: m.ownershipPrimarySourceCoverage,
  groupMembershipEdgeCount: m.groupMembershipEdgeCount,
  reportedGroupMembershipCount: m.reportedGroupMembershipCount,
  groupMembershipPrimarySourceCoverage: m.groupMembershipPrimarySourceCoverage,
});

const owns = edges.filter((e) => e.type === 'owns');
for (const e of owns) {
  if ((e.status === 'reference' || e.status === 'inferred') && !e.defaultHidden) {
    failures.push(`weak owns ${e.id} must be defaultHidden`);
  }
  if (e.status === 'confirmed' || e.status === 'reported') {
    check((e.evidence || []).length > 0, `${e.id} needs evidence`);
    check(e.asOf || e.sourceDocumentDate, `${e.id} needs asOf`);
  }
}
for (const e of edges.filter((x) => x.type === 'group_member')) {
  check(e.stakePct == null, `group_member ${e.id} must not have stakePct`);
}
console.log('orphan split:', {
  structuralOrphanCount: orphan.structuralOrphanCount,
  businessRelationOrphanCount: orphan.businessRelationOrphanCount,
  listedCompanyOwnershipOrphanCount: m.listedCompanyOwnershipOrphanCount,
  classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
});
console.log('validate warnings:', report.warnings.length);
report.warnings.slice(0, 12).forEach((w) => console.log('  WARN', w));
console.log('failures:', failures.length);
failures.forEach((f) => console.log('  -', f));
process.exit(failures.length ? 1 : 0);
