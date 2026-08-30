/**
 * verify:kconsume — Phase 5F consumer brand / distribution network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeKconsumeMetrics } from '../lib/relation_network/kconsume_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_KCONSUME_IDS } from '../lib/relation_network/kconsume_brand_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'kconsume.json');
check(fs.existsSync(netFp), 'missing data/networks/kconsume.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `kconsume warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.kconsume;
check(profile?.model === 'consumer_brand_distribution_ecosystem', 'profile model');
check(profile?.layout === 'consumerBrandDistributionEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/kconsume.json', 'profile networkPath');
check(network.model === 'consumer_brand_distribution_ecosystem', 'network model');
check(network.layout === 'consumerBrandDistributionEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5fCuratedAt, 'phase5f curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'kconsume', 'korea_kconsume_map.html'), 'utf8');
check(html.includes('data-sector="kconsume"'), 'html data-sector kconsume');
const companies = extractCompaniesFromHtml(html);
const listedExpected = companies.length;
check(listedExpected > 0, 'cp_list/html listed empty');
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const business = edges.filter((e) =>
  ['manufactures_for', 'distributes_for', 'exclusive_distributor_for', 'owns', 'owns_stake_in', 'acquired']
    .includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(business.length === 0, `Phase 5F must not invent consumer contracts without primary evidence (got ${business.length})`);

const marketAsBusiness = edges.filter((e) => ['exposed_to_market', 'sold_through_channel'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(marketAsBusiness.length === 0, 'market exposure must not be confirmed/reported business');

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length >= 1, 'legacy peers demoted');
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const crossRef = edges.filter((e) => e.type === 'cross_sector_reference');
check(crossRef.length >= 2, `cross_sector_reference (got ${crossRef.length})`);
check(crossRef.every((e) => e.status === 'reference'), 'cross_sector_reference is reference only');
check(crossRef.every((e) => e.excludesFromBusinessCoverage === true), 'cross_sector excludes business coverage');

const brandNodes = nodes.filter((n) => n.type === 'brand');
check(brandNodes.length > 0, 'brand nodes exist');
check(brandNodes.every((n) => !String(n.id).startsWith('krx:')), 'brands separate from listed companies');

const metrics = computeKconsumeMetrics(network);
check(metrics.listedCompanyCount === listedExpected, `metrics listed ${listedExpected} (got ${metrics.listedCompanyCount})`);
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed business');
check(metrics.operatedBrandRelationshipCount > 0, 'operated brand structural edges');

for (const id of FORBIDDEN_GENERIC_KCONSUME_IDS) {
  check(!byId.has(id), `forbidden generic node ${id}`);
}

const degree = new Map();
for (const e of edges) {
  degree.set(e.source, (degree.get(e.source) || 0) + 1);
  degree.set(e.target, (degree.get(e.target) || 0) + 1);
}
for (const n of nodes) {
  if ((degree.get(n.id) || 0) === 0) {
    const ok = n.entityRole === 'boundary_placeholder'
      || (n.type === 'cross_sector_anchor' && n.isMapConstituent === false);
    check(ok, `unexpected zero-degree node ${n.id}`);
  }
}

const cc = metrics.claimCoverage || {};
for (const key of Object.keys(cc)) {
  if (key === 'metricNotes') continue;
  const err = validateCoverageMetric(cc[key], `kconsume.${key}`);
  if (err) failures.push(err);
}

console.log('kconsume 5F metrics:', JSON.stringify(metrics, null, 2));
console.log('warnings:', (report.warnings || []).length);
if (failures.length) {
  console.error('failures:', failures.length);
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('OK verify:kconsume');
