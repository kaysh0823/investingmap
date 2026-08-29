/**
 * verify:robot — Phase 5I
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeRobotMetrics } from '../lib/relation_network/robot_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_ROBOT_IDS } from '../lib/relation_network/robot_product_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const netFp = join(ROOT, 'data/networks/robot.json');
check(fs.existsSync(netFp), 'missing robot.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `warnings must be 0 (got ${(report.warnings || []).length})`);

const profile = NETWORK_PROFILES.robot;
check(profile?.model === 'robotics_component_system_application_ecosystem', 'profile model');
check(profile?.layout === 'roboticsValueChainEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/robot.json', 'profile networkPath');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5iCuratedAt, 'phase5i curated');
check(network.sectorId === 'robot', 'sectorId robot');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));
const html = fs.readFileSync(join(ROOT, 'robot/korea_robot_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
check(companies.length === 17, `listed 17 (got ${companies.length})`);
check(html.includes('data-sector="robot"'), 'data-sector');
check(!html.includes('<body data-sector="semi">'), 'no semi body sector');
for (const c of companies) check(byId.has(`krx:${c.ticker}`), `missing ${c.ticker}`);

const invent = edges.filter((e) => [
  'supplies_component_to', 'supplies_robot_to', 'deployed_at', 'pilot_at',
  'develops_with', 'invests_in', 'awarded_contract', 'owns', 'owns_stake_in',
].includes(e.type) && ['confirmed', 'reported', 'inferred'].includes(e.status));
check(invent.length === 0, `no invented business (got ${invent.length})`);
const peers = edges.filter((e) => e.type === 'peer');
check(peers.length >= 15, `peers demoted (got ${peers.length})`);
check(peers.every((e) => e.defaultHidden === true), 'peers hidden');
const xref = edges.filter((e) => e.type === 'cross_sector_reference');
check(xref.length >= 5 && xref.every((e) => e.excludesFromOrphanResolution === true), 'xref ok');
check(!nodes.some((n) => n.lane === 'medical_robot' || n.lane === 'defense_robot'), 'no empty medical/defense lanes');

const metrics = computeRobotMetrics(network);
check(metrics.listedCompanyCount === 17, 'metrics listed');
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed');
check(metrics.zeroDegreeNodeCount === 0, 'zero degree');
check(metrics.duplicateSemanticNodeCount === 0, 'no duplicate semantic');
for (const id of FORBIDDEN_GENERIC_ROBOT_IDS) check(!byId.has(id), `forbidden ${id}`);
for (const [k, v] of Object.entries(metrics.claimCoverage || {})) {
  if (k === 'metricNotes' || !v || typeof v !== 'object') continue;
  const err = validateCoverageMetric(v, `robot.${k}`);
  if (err) failures.push(err);
}

const profilesJs = fs.readFileSync(join(ROOT, 'js/network_profiles.js'), 'utf8');
check(profilesJs.includes('"robot"'), 'profiles js has robot');
check(profilesJs.includes('roboticsValueChainEcosystem'), 'profiles js layout');
check(!profilesJs.match(/"robot"[\s\S]{0,200}"networkPath": null/), 'robot networkPath not null in emitted profiles');

console.log(JSON.stringify({
  listed: metrics.listedCompanyCount, nodes: metrics.nodeCount, edges: metrics.edgeCount,
  confirmed: metrics.confirmedBusinessEdgeCount, peers: metrics.peerEdgeCount,
  products: metrics.robotProductCount, categories: metrics.robotCategoryCount,
  components: metrics.componentNodeCount + metrics.reducerNodeCount + metrics.actuatorNodeCount,
  xref: metrics.crossSectorReferenceCount, orphan: metrics.businessRelationOrphanCount,
}, null, 2));
console.log('warnings:', (report.warnings || []).length);
if (failures.length) { console.error(failures); process.exit(1); }
console.log('OK verify:robot');
