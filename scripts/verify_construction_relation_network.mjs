/**
 * verify:construction — Phase 5A + 5A.1 + 5A.2 + 5A.3
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { computeConstructionProjectMetrics } from '../lib/relation_network/construction_project_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'construction.json');
check(fs.existsSync(netFp), 'missing data/networks/construction.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `construction warnings must be 0 (got ${(report.warnings || []).length})`);

const profile = NETWORK_PROFILES.construction;
check(profile?.model === 'construction_development_project_ecosystem', 'profile model');
check(profile?.layout === 'constructionProjectEcosystem', 'profile layout');
check(network.model === 'construction_development_project_ecosystem', 'network model');
check(network.layout === 'constructionProjectEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5a1CuratedAt, 'phase5a1 curated');
check(!!network.phase5a2CuratedAt, 'phase5a2 curated');
check(!!network.phase5a3CuratedAt, 'phase5a3 curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'construction', 'korea_construction_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 10, `listed count must stay 10 (got ${companies.length})`);
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

check(byId.has('epc-project:qatar-dukhan-solar'), 'Dukhan project');
check(byId.has('construction-project:wirye-bokjeong-mixed'), 'Wirye project');
check(byId.has('construction-project:busan-sajik3-redev'), 'Sajik3');
check(byId.has('construction-project:yongsan-jeongbichang-zone1'), 'Yongsan');
check(byId.has('epc-project:mozambique-rovuma-lng-phase1'), 'Rovuma');

const dukhan = byId.get('epc-project:qatar-dukhan-solar');
check(dukhan?.relationshipEvidenceId === 'ev:dukhan-loa-dart', 'Dukhan relationshipEvidenceId=LOA');
check(dukhan?.contractValueEvidenceId === 'ev:dukhan-signed-repub', 'Dukhan contractValue from signed repub');
check(dukhan?.evidence?.[0]?.claimSupport?.relationship === true, 'Dukhan LOA supports relationship');
check(dukhan?.evidence?.[0]?.claimSupport?.contractSigned === false, 'Dukhan LOA does not support contractSigned');
check(dukhan?.evidence?.[1]?.primarySource === false, 'Dukhan signed repub not primary');

const wirye = byId.get('construction-project:wirye-bokjeong-mixed');
check(wirye?.totalContractValue === 3039406100000, 'Wirye totalContractValue');
check(wirye?.companyShareValue === 2936423570000, 'Wirye companyShareValue');
check(wirye?.aggregationType === 'multi_block_contract', 'Wirye aggregationType');
check(Array.isArray(wirye?.aggregatedComponents) && wirye.aggregatedComponents.length === 2, 'Wirye components');

const sajik = byId.get('construction-project:busan-sajik3-redev');
check(sajik?.contractValue === 408232163334, 'Sajik contractValue');
check(sajik?.companyShareValue == null, 'Sajik companyShareValue null');
check(sajik?.companyShareDisclosureStatus === 'unknown', 'Sajik share unknown');

const yongsan = byId.get('construction-project:yongsan-jeongbichang-zone1');
check(yongsan?.legalContractingEntity === '아이파크현대산업개발', 'Yongsan legal filer');
check(yongsan?.companyShareValue == null, 'Yongsan companyShareValue null');

const rovuma = byId.get('epc-project:mozambique-rovuma-lng-phase1');
check(rovuma?.counterpartyScope === 'letter_of_intent', 'Rovuma LOI scope');
check(rovuma?.valueDisclosureStatus === 'not_disclosed', 'Rovuma not_disclosed');
check(rovuma?.contractValue == null, 'Rovuma amount null');

const jv = byId.get('consortium:smdc-jv');
check(jv?.type === 'provisional_consortium', 'JV provisional type');
check(jv?.entityStatus === 'provisional', 'JV provisional status');
check(jv?.defaultHidden === true, 'JV hidden');
check(!/SMDC|SNDC/.test(jv?.nameKo || ''), 'JV no SMDC in nameKo');

check(edges.filter((e) => e.type === 'peer').every((e) => e.defaultHidden !== false), 'peers hidden');
check(!edges.some((e) => e.source === 'brand:ipark' && ['main_contractor', 'project_owner', 'epc_for'].includes(e.type)),
  'brand not contracting party');

const metrics = computeConstructionProjectMetrics(network);
check(metrics.listedCompanyCount === 10, `listed 10 (got ${metrics.listedCompanyCount})`);
check(metrics.evidenceDenominators?.projects === 5, 'evidence denom projects=5');
check(metrics.projectEvidenceFieldCoverage === 1, 'evidence field coverage 1');
check(metrics.claimCoverage?.relationshipDirectEvidenceCoverage?.denominator === 5, 'relationship denom 5');
check(metrics.claimCoverage?.contractValueDirectEvidenceCoverage?.denominator === 4,
  `contractValue denom 4 (excl Rovuma) got ${metrics.claimCoverage?.contractValueDirectEvidenceCoverage?.denominator}`);
check(metrics.claimCoverage?.companyShareValueDirectEvidenceCoverage?.denominator === 2,
  `companyShare denom 2 (Dukhan+Wirye) got ${metrics.claimCoverage?.companyShareValueDirectEvidenceCoverage?.denominator}`);
check(metrics.claimCoverage?.contractValuePrimarySourceCoverage?.numerator === 3,
  `contractValue primary numerator 3 (Wirye+Sajik+Yongsan DART only) got ${metrics.claimCoverage?.contractValuePrimarySourceCoverage?.numerator}`);

const orphan = computeListedRelationOrphanMetrics(network);
check(orphan.businessRelationOrphanCount === 5, `business orphan 5 (got ${orphan.businessRelationOrphanCount})`);
check(orphan.directRelationshipOrphanCount === 5, `direct orphan 5 (got ${orphan.directRelationshipOrphanCount})`);
check(orphan.structuralOrphanCount === 0, 'structural orphan 0');

check(fs.existsSync(join(ROOT, 'data', 'construction_relation_phase5a3_changelog.json')), '5A.3 changelog');

console.log('\nconstruction 5A.3 claimCoverage:', JSON.stringify(metrics.claimCoverage, null, 2));
console.log('warnings:', (report.warnings || []).length);

if (failures.length) {
  console.error('\nFAILURES:');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('\nOK verify:construction');
