/**
 * verify:renewable — Phase 4C / 4C.1
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { computeRenewableProjectMetrics } from '../lib/relation_network/renewable_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'renewable.json');
check(fs.existsSync(netFp), 'missing data/networks/renewable.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));

const profile = NETWORK_PROFILES.renewable;
check(profile?.model === 'renewable_project_value_chain', 'profile model');
check(profile?.layout === 'renewableProjectEcosystem', 'profile layout');
check(network.model === 'renewable_project_value_chain', 'network model');
check(network.layout === 'renewableProjectEcosystem', 'network layout');
check(network._legacyFallback === false, 'legacyFallback false');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'renewable', 'korea_renewable_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 10, `listed count must stay 10 (got ${companies.length})`);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

check(!byId.has('public:kepco'), 'public:kepco must not exist');
check(byId.has('krx:015760'), 'need KEPCO listed reference');
{
  const k = byId.get('krx:015760');
  check(k?.isMapConstituent === false || k?.excludeFromMapCompanyCount === true, 'KEPCO excluded from map count');
  check(k?.entityRole === 'listed_reference_company', 'KEPCO listed_reference_company');
  check(!companies.some((c) => c.ticker === '015760'), '015760 not in renewable cp_list');
}

check(byId.has('technology:solar'), 'solar technology node');
check(byId.has('technology:offshore_wind'), 'offshore wind technology');
check(byId.has('technology:hydrogen'), 'hydrogen technology');
check(byId.has('ecosystem:renewable-value-chain'), 'structural ecosystem');

// —— Phase 4C.1 qualification ——
check(byId.has('renewable-project:sinan-wi-offshore'), 'Sinan Wi project');
check(byId.has('spv:sinan-wi-offshore'), 'Sinan Wi SPV');
check(byId.get('renewable-project:sinan-wi-offshore')?.projectStatus === 'under_construction', 'Sinan Wi under_construction');
check(byId.get('renewable-project:haenam-kosepo-solar')?.projectStatus === 'preferred_bidder', 'Haenam preferred_bidder');
check(byId.get('renewable-project:uiseong-hwanghaksan-wind')?.projectStatus === 'operating', 'Uiseong operating');
check(byId.has('project-portfolio:atlas-energy-park'), 'Atlas reclassified to project_portfolio');
check(!byId.has('renewable-project:atlas-energy-park'), 'legacy Atlas project id removed');
check(byId.get('project-portfolio:atlas-energy-park')?.capacityType === 'contracted_supply_volume', 'Atlas capacityType supply volume');
check(byId.has('renewable-project:atlas-v-vi'), 'Atlas V/VI actual project');
check(byId.get('renewable-project:atlas-v-vi')?.capacityType === 'project_total', 'Atlas V/VI project_total');
check(byId.has('product:nexo'), 'NEXO product node');
check(!byId.has('renewable-project:hyundai-nexo-h2-tank-supply'), 'legacy NEXO project removed');
check(byId.has('development-pipeline:skgas-hydrogen'), 'SK Gas development_pipeline');
check(!byId.has('renewable-project:skgas-hydrogen-pipeline'), 'legacy SK Gas project removed');
check(byId.get('contract:cswind-vestas-tower-2025')?.type === 'supply_contract'
  || byId.has('contract:cswind-vestas-tower-2025') === false
  || byId.get('contract:cswind-vestas-tower-2025')?.type === 'supply_contract',
'CS Wind supply_contract when present');
{
  const csw = [...byId.values()].find((n) => n.id.includes('cswind-vestas'));
  if (csw) check(csw.type === 'supply_contract', 'CS Wind node type supply_contract');
}

check(edges.some((e) => e.type === 'owns_stake_in' && e.source === 'krx:475150'
  && e.target === 'spv:sinan-wi-offshore'), 'SK ethrenix owns_stake_in SPV');
check(edges.some((e) => e.type === 'project_owner' && e.source === 'spv:sinan-wi-offshore'), 'SPV project_owner');
check(edges.some((e) => e.type === 'epc_for' && e.source === 'krx:009830'), 'Hanwha epc_for');
check(edges.some((e) => e.type === 'supplies_structure_to' && e.source === 'krx:112610'), 'CS Wind structure supply');
check(edges.some((e) => e.type === 'power_purchase_agreement' && e.id === 'e-atlas-sce-ppa'), 'SCE PPA for Atlas V/VI');
check(edges.filter((e) => e.type === 'power_purchase_agreement').length <= 3, 'PPA edges <= 3');
check(!edges.some((e) => e.type === 'project_owner' && e.source === 'krx:009830'
  && (e.target === 'renewable-project:haenam-kosepo-solar'
    || e.target === 'renewable-project:atlas-v-vi'
    || e.target === 'project-portfolio:atlas-energy-park')), 'Hanwha not project_owner of Haenam/Atlas');
check(!edges.some((e) =>
  (e.editorialStatus === 'confirmed' || e.status === 'confirmed')
  && /renewable-project:|spv:|project-portfolio:|product:|development-pipeline:/.test(`${e.source}${e.target}`)),
'no auto-confirmed project roles');

const metrics = computeRenewableProjectMetrics(network);
check(metrics.uniqueActualProjectCount === 4, `actual projects ==4 (got ${metrics.uniqueActualProjectCount})`);
check(metrics.projectPortfolioCount >= 1, 'portfolio nodes');
check(metrics.productNodeCount >= 1, 'product nodes');
check(metrics.developmentPipelineCount >= 1, 'pipeline nodes');
check(metrics.structuralEcosystemNodeCount >= 1, 'ecosystem nodes');
check(metrics.offshoreWindProjectCount >= 1, 'offshore wind projects');
check(metrics.solarProjectCount >= 2, 'solar actual projects (Haenam + Atlas V/VI)');
check(metrics.underConstructionProjectCount === 2, `UC ==2 Sinan+AtlasV/VI (got ${metrics.underConstructionProjectCount})`);
check(metrics.operatingProjectCount === 1, `operating ==1 Uiseong (got ${metrics.operatingProjectCount})`);
check(metrics.preferredBidderProjectCount === 1, 'preferred bidder Haenam');
check(metrics.confirmedProjectRoleEdgeCount === 0, 'no auto-confirmed roles');
check(metrics.ppaEdgeCount >= 1 && metrics.ppaEdgeCount <= 3, 'PPA count 1–3');
check(metrics.listedCompanyCount === 10, `map listed 10 (got ${metrics.listedCompanyCount})`);
check(metrics.listedReferenceCompanyCount >= 1, 'listed reference');
check(!Object.values(metrics.actualProjectCapacityByTechnology || {}).some((v) => v >= 2800),
  'Atlas 2.8GW must not inflate actualProjectCapacityByTechnology');
check((metrics.equityCapacityByCompany?.['krx:475150'] || 0) === 39
  || (metrics.equityCapacityByCompany?.['krx:475150'] || 0) === 39,
  'SK Ethernix equity 39MW from Sinan stake edge');

const orphan = computeListedRelationOrphanMetrics(network);
check(orphan.listedCompanyCount === 10, `orphan listed count 10 (got ${orphan.listedCompanyCount})`);

check(fs.existsSync(join(ROOT, 'data', 'renewable_relation_phase4c_changelog.json')), '4C changelog');
check(fs.existsSync(join(ROOT, 'data', 'renewable_relation_phase4c1_changelog.json')), '4C.1 changelog');

console.log('\nrenewable 4C.1 metrics:', JSON.stringify(metrics, null, 2));
console.log('orphan listedCompanyCount:', orphan.listedCompanyCount);
console.log('warnings:', (report.warnings || []).length);

if (failures.length) {
  console.error('\nFAILURES:');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('\nOK verify:renewable');
