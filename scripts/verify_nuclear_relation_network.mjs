/**
 * verify:nuclear — Phase 4B + 4B.1
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { computeNuclearProjectMetrics } from '../lib/relation_network/nuclear_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'nuclear.json');
check(fs.existsSync(netFp), 'missing data/networks/nuclear.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));

const profile = NETWORK_PROFILES.nuclear;
check(profile?.model === 'nuclear_project_lifecycle_ecosystem', 'profile model');
check(profile?.layout === 'nuclearProjectEcosystem', 'profile layout');
check(network.model === 'nuclear_project_lifecycle_ecosystem', 'network model');
check(network._legacyFallback === false, 'legacyFallback false');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'nuclear', 'korea_nuclear_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 7, `listed count must stay 7 (got ${companies.length})`);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

check(!byId.has('public:kepco'), 'public:kepco must be migrated away');
check(byId.has('krx:015760'), 'need krx:015760 KEPCO reference');
{
  const k = byId.get('krx:015760');
  check(k?.isMapConstituent === false || k?.excludeFromMapCompanyCount === true, 'KEPCO excluded from map count');
  check(k?.entityRole === 'listed_reference_company', 'KEPCO listed_reference_company');
  check(!companies.some((c) => c.ticker === '015760'), '015760 not in nuclear cp_list');
}
check(byId.has('kr:khnp'), 'need kr:khnp');
check(!byId.get('kr:khnp')?.ticker, 'KHNP must not have ticker');
check(byId.has('org:edu_ii'), 'need EDU II');
check(byId.has('org:nawah'), 'need Nawah operator');
check(byId.has('ecosystem:apr1400-domestic'), 'APR1400 must be ecosystem');
check(!byId.has('nuclear-project:domestic-apr1400-ecosystem'), 'old APR1400 project id removed');
check(byId.has('ecosystem:khnp-domestic-om'), 'domestic O&M ecosystem');

const duk = byId.get('nuclear-project:dukovany-new-build');
check(!!duk, 'Dukovany new-build project');
check(duk?.projectStatus === 'design', `Dukovany projectStatus design (got ${duk?.projectStatus})`);
check(duk?.contractStatus === 'effective', 'Dukovany contractStatus effective');
check(duk?.contractSigned === true, 'Dukovany contractSigned');
check(duk?.unitCount === 2, 'Dukovany 2 units');
check(duk?.ownerOrgId === 'org:edu_ii', 'Dukovany owner EDU II');
check(duk?.projectStatus !== 'selected_bidder', 'Dukovany not selected_bidder');
check(duk?.projectStatus !== 'under_construction', 'Dukovany not under_construction');

check(edges.some((e) => e.type === 'epc_for' && e.source === 'kr:khnp'
  && e.target === 'nuclear-project:dukovany-new-build'), 'KHNP epc_for Dukovany');
check(!edges.some((e) => e.type === 'preferred_bidder_for'
  && e.target === 'nuclear-project:dukovany-new-build'), 'no preferred_bidder on Dukovany');
check(!edges.some((e) => e.type === 'selected_for'
  && e.target === 'nuclear-project:dukovany-new-build'), 'no selected_for on Dukovany');
check(!edges.some((e) => e.type === 'project_operator' && e.source === 'kr:khnp'
  && String(e.target).includes('dukovany')), 'KHNP not Dukovany operator');

const barakah = byId.get('nuclear-project:uae-barakah');
check(barakah?.projectStatus === 'operating', 'Barakah operating');
check(barakah?.operatorId === 'org:nawah', 'Barakah operator Nawah');
check(edges.some((e) => e.type === 'operates' && e.source === 'org:nawah'), 'Nawah operates edge');
check(edges.some((e) => e.id === 'e-barakah-kps-om' && e.type === 'maintains'
  && (e.evidence || []).some((ev) => /overseas\.do/.test(ev.url || ''))), 'KPS Barakah uses overseas page');

const poland = byId.get('nuclear-project:poland-nuclear-mou');
check(poland?.projectStatus === 'memorandum', 'Poland memorandum');
check(poland?.defaultHidden === true || edges.filter((e) => e.target === poland?.id).every((e) => e.defaultHidden),
  'Poland MOU default hidden');

const metrics = computeNuclearProjectMetrics(network);
check(metrics.uniqueActualProjectCount === 3, `uniqueActualProjectCount=3 (got ${metrics.uniqueActualProjectCount})`);
check(metrics.structuralEcosystemNodeCount >= 2, 'ecosystem nodes');
check(metrics.selectedBidderProjectCount === 0, 'no selected_bidder projects');
check(metrics.designLicensingProjectCount >= 1, 'design/licensing projects');
check(metrics.memorandumProjectCount >= 1, 'memorandum');
check(metrics.operatingProjectCount >= 1, 'operating');
check(metrics.listedReferenceCompanyCount >= 1, 'listed reference');
check(metrics.publicListedTypeConflictCount === 0, 'no public/listed conflict');
check(metrics.confirmedProjectRoleEdgeCount === 0, 'no auto-confirmed roles');

const orphan = computeListedRelationOrphanMetrics(network);
check(orphan.listedCompanyCount === 7, `orphan listed count 7 (got ${orphan.listedCompanyCount})`);

check(fs.existsSync(join(ROOT, 'data', 'nuclear_relation_phase4b1_changelog.json')), '4B.1 changelog');

console.log('\nnuclear 4B.1 metrics:', JSON.stringify(metrics, null, 2));
console.log('orphan listedCompanyCount:', orphan.listedCompanyCount);
console.log('warnings:', (report.warnings || []).length);

if (failures.length) {
  console.error('\nFAILURES:');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('\nOK verify:nuclear');
