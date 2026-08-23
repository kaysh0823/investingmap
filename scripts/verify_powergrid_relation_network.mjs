/**
 * verify:powergrid — Phase 4A grid infrastructure ecosystem.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { computePowergridContractMetrics } from '../lib/relation_network/powergrid_contract_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'powergrid.json');
check(fs.existsSync(netFp), 'missing data/networks/powergrid.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
report.failures.forEach((f) => failures.push(`v2: ${f}`));

const profile = NETWORK_PROFILES.powergrid;
check(profile?.model === 'grid_infrastructure_ecosystem', 'profile model');
check(profile?.layout === 'gridInfrastructureEcosystem', 'profile layout');
check(profile?.networkPath === 'data/networks/powergrid.json', 'profile networkPath');
check(network.model === 'grid_infrastructure_ecosystem', 'network model');
check(!network._legacyFallback, 'legacyFallback false');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'powergrid', 'korea_powergrid_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
  const n = byId.get(`krx:${c.ticker}`);
  if (n) {
    check(n.type === 'listed_company', `${c.ticker} must be listed_company`);
    check(n.isListedKorea === true, `${c.ticker} isListedKorea`);
  }
}

check(nodes.some((n) => n.type === 'grid_stage'), 'need grid_stage nodes');
check(nodes.some((n) => n.type === 'equipment_category'), 'need equipment_category nodes');
check(nodes.some((n) => n.type === 'end_market'), 'need end_market nodes');
check(nodes.some((n) => n.type === 'contract' || n.type === 'project'), 'need contract/project nodes');
check(nodes.some((n) => n.isAnonymousCounterparty), 'need anonymous counterparty');
check(edges.some((e) => e.type === 'manufactures'), 'need manufactures');
check(edges.some((e) => e.type === 'used_in_grid_stage'), 'need used_in_grid_stage');
check(edges.some((e) => e.type === 'exposed_to'), 'need exposed_to');
check(edges.some((e) => e.type === 'awarded_contract'), 'need awarded_contract');

for (const n of nodes) {
  if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
    failures.push(`KR ticker on global_company ${n.id}`);
  }
  if (n.type === 'end_market' && /customer|client/i.test(n.role || '')) {
    failures.push(`end_market ${n.id} must not be treated as customer role`);
  }
  if (n.type === 'equipment_category' && n.mcapWon != null) {
    failures.push(`equipment ${n.id} must not have mcap`);
  }
}

for (const e of edges) {
  if (e.type === 'manufactures') {
    const t = byId.get(e.target);
    check(t && (t.type === 'equipment_category' || t.type === 'technology'), `manufactures ${e.id} target must be equipment`);
  }
  if (e.type === 'used_in_grid_stage') {
    const t = byId.get(e.target);
    const s = byId.get(e.source);
    const ok = (t && t.type === 'grid_stage') || (s && s.type === 'grid_stage');
    check(ok, `used_in_grid_stage ${e.id} must touch grid_stage`);
  }
  if (e.type === 'exposed_to') {
    const t = byId.get(e.target);
    check(t && t.type === 'end_market', `exposed_to ${e.id} target must be end_market`);
  }
  if ((e.type === 'peer' || e.status === 'inferred' || e.status === 'ended') && e.defaultHidden === false) {
    failures.push(`weak edge ${e.id} must be defaultHidden`);
  }
  if ((e.status === 'confirmed' || e.status === 'reported') && /supplies_|awarded_|project_/.test(e.type || '')) {
    const ev = (e.evidence || [])[0];
    check(!!ev?.url, `${e.id} needs evidence URL`);
    if (ev?.url && /^https?:\/\/[^/]+\/?$/.test(ev.url)) {
      failures.push(`${e.id} homepage URL cannot prove award/supply`);
    }
  }
  if (e.target === 'market:data_center' && /supplies_|awarded_/.test(e.type || '')) {
    failures.push(`data_center market must not be supply/award target (${e.id})`);
  }
}

const structural = edges.filter((e) => e.edgeOrigin === 'structuralGenerated').length;
const legacy = edges.filter((e) => e.edgeOrigin === 'legacyMigrated').length;
const manual = edges.filter((e) => e.edgeOrigin === 'manuallyCurated').length;
check(structural > 0 && legacy > 0 && manual > 0, 'need structural + legacy + manual');

check(html.includes('relation_network.js'), 'powergrid page relation_network.js');
check(html.includes('data-sector="powergrid"'), 'data-sector');

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try { new vm.Script(match[2]); } catch (error) {
    failures.push(`inline script: ${error.message}`);
  }
}

const orphan = computeListedRelationOrphanMetrics(network);
const contractMetrics = computePowergridContractMetrics(network);
const m = network.metrics || {};
console.log('Powergrid relationship network verification (Phase 4A.2)');
console.log('======================================================');
console.log('nodes/edges:', nodes.length, edges.length);
console.log('origin:', { structural, legacy, manual, metrics: m });
console.log('contractMetrics:', contractMetrics);
console.log('statusCounts:', report.summary.statusCounts);
console.log('typeCounts:', report.summary.typeCounts);
console.log('orphan:', orphan);
check(contractMetrics.uniqueContractCount === contractMetrics.contractNodeCount, 'uniqueContractCount = contractNodeCount');
check(contractMetrics.contractBusinessEdgeCount >= contractMetrics.uniqueReportedContractCount, 'contract edges >= unique reported contracts');
check(contractMetrics.reportedNonContractBusinessEdgeCount === 0, 'no reported non-canonical business edges');
check(contractMetrics.letterOfAwardCount === 0 || nodes.some((n) => n.contractStatus === 'letter_of_award'), 'LOA contracts flagged');
check(nodes.filter((n) => n.type === 'contract').length >= 2, 'at least 2 curated contracts');

// Phase 4A.2 semantics
check(contractMetrics.uniqueContractCount === 7, 'exactly 7 contracts (no new contracts)');
check(contractMetrics.confirmedContractEdgeCount === 7, '7 confirmed award edges');
check(
  contractMetrics.completedContractCount + contractMetrics.cancelledContractCount + contractMetrics.terminatedContractCount
    === contractMetrics.historicalContractCount,
  'historical = completed+cancelled+terminated (no double count)',
);
check(contractMetrics.endedContractCount === contractMetrics.historicalContractCount, 'ended alias equals historical');
check(contractMetrics.activeContractDirectEvidenceCoverage === 100, 'active direct evidence 100% after opened-body review');
check(contractMetrics.exactCounterpartyContractCount === 3, 'exact counterparties: Taihan/Iljin/Sanil-Bloom');
check(contractMetrics.intermediaryDisclosedCounterpartyContractCount === 3, 'intermediary: HDE/LS/Hyosung');
check(contractMetrics.anonymousCounterpartyContractCount === 1, 'anonymous: Sanil EU');
check(!nodes.some((n) => (n.correctionReceiptNos || []).includes('20250924800543')), 'rejected Taihan correction removed');
check(nodes.some((n) => n.id.includes('taihan') && (n.correctionReceiptNos || []).includes('20250924800002')), 'Taihan Final LOA correction recorded');
const ls = nodes.find((n) => n.id === 'contract:ls-20251107-bigtech-dc-p2');
check(ls && ls.contractStatus === 'completed' && ls.statusReview === 'needs_review', 'LS completed with statusReview needs_review');
const lsAward = edges.find((e) => e.target === 'contract:ls-20251107-bigtech-dc-p2' && e.type === 'awarded_contract');
check(lsAward && lsAward.defaultHidden === true, 'LS completed award defaultHidden');
check(edges.filter((e) => e.type === 'awarded_contract' && e.status === 'confirmed').every((e) => {
  const ev = (e.evidence || [])[0] || {};
  return e.reviewStatus === 'reviewed' && ev.directEvidence === true && ev.sourceAccessStatus === 'opened';
}), 'confirmed awards have edge+evidence review and opened access');

console.log('validate warnings:', report.warnings.length);
report.warnings.forEach((w) => console.log('  WARN', w));
console.log('failures:', failures.length);
failures.forEach((f) => console.log('  FAIL', f));
if (failures.length) process.exit(1);
