/**
 * verify:kcontent — Phase 5F content IP / distribution network
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeKcontentMetrics } from '../lib/relation_network/kcontent_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_KCONTENT_IDS } from '../lib/relation_network/kcontent_ip_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'kcontent.json');
check(fs.existsSync(netFp), 'missing data/networks/kcontent.json');
const network = fs.existsSync(netFp)
  ? JSON.parse(fs.readFileSync(netFp, 'utf8'))
  : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `kcontent warnings must be 0 (got ${(report.warnings || []).length}: ${(report.warnings || []).slice(0, 5).join('; ')})`);

const profile = NETWORK_PROFILES.kcontent;
check(profile?.model === 'content_ip_production_distribution_ecosystem', 'profile model');
check(profile?.layout === 'contentIpDistributionEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/kcontent.json', 'profile networkPath');
check(network.model === 'content_ip_production_distribution_ecosystem', 'network model');
check(network.layout === 'contentIpDistributionEcosystem', 'layout');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5fCuratedAt, 'phase5f curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const html = fs.readFileSync(join(ROOT, 'kcontent', 'korea_kcontent_map.html'), 'utf8');
check(html.includes('data-sector="kcontent"'), 'html data-sector kcontent');
const companies = extractCompaniesFromHtml(html);
const listedExpected = companies.length;
check(listedExpected > 0, 'cp_list/html listed empty');
for (const c of companies) {
  check(byId.has(`krx:${c.ticker}`), `missing listed ${c.ticker}`);
}

const business = edges.filter((e) =>
  ['produces_for', 'co_produces_with', 'distributes_to', 'licenses_ip_to', 'streams_on',
    'owns', 'owns_stake_in', 'owns_ip'].includes(e.type)
  && ['confirmed', 'reported'].includes(e.status));
check(business.length === 0, `Phase 5F must not invent content contracts without primary evidence (got ${business.length})`);

const exclusiveStreams = edges.filter((e) =>
  ['streams_on', 'broadcasts_on'].includes(e.type) && e.exclusivity === true
  && ['confirmed', 'reported'].includes(e.status));
check(exclusiveStreams.length === 0, 'no invented exclusive platform contracts');

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length >= 1, 'legacy peers demoted');
check(peers.every((e) => e.defaultHidden === true), 'all peers defaultHidden');

const crossRef = edges.filter((e) => e.type === 'cross_sector_reference');
check(crossRef.length >= 3, `cross_sector_reference (got ${crossRef.length})`);
check(crossRef.every((e) => e.excludesFromBusinessCoverage === true), 'cross_sector excludes business');

const artists = nodes.filter((n) => n.type === 'artist_or_group');
check(artists.length > 0, 'artist nodes exist');
check(artists.every((n) => !String(n.id).startsWith('krx:')), 'artists separate from listed companies');
check(artists.length <= 12, `artist nodes capped (got ${artists.length})`);

const metrics = computeKcontentMetrics(network);
check(metrics.listedCompanyCount === listedExpected, `metrics listed ${listedExpected} (got ${metrics.listedCompanyCount})`);
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed business');
check(metrics.artistManagementRelationshipCount > 0, 'artist structural edges');

for (const id of FORBIDDEN_GENERIC_KCONTENT_IDS) {
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
  const err = validateCoverageMetric(cc[key], `kcontent.${key}`);
  if (err) failures.push(err);
}

console.log('kcontent 5F metrics:', JSON.stringify(metrics, null, 2));
console.log('warnings:', (report.warnings || []).length);
if (failures.length) {
  console.error('failures:', failures.length);
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('OK verify:kcontent');
