/**
 * verify:telecom — Phase 5H
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { computeTelecomMetrics } from '../lib/relation_network/telecom_metrics.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';
import { FORBIDDEN_GENERIC_TELECOM_IDS } from '../lib/relation_network/telecom_network_canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const netFp = join(ROOT, 'data/networks/telecom.json');
check(fs.existsSync(netFp), 'missing telecom.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
(report.failures || []).forEach((f) => failures.push(`v2: ${f}`));
check((report.warnings || []).length === 0, `warnings must be 0 (got ${(report.warnings || []).length})`);

const profile = NETWORK_PROFILES.telecom;
check(profile?.model === 'telecommunications_network_service_ecosystem', 'profile model');
check(profile?.layout === 'telecomNetworkServiceEcosystem', 'profile layout');
check(profile?.networkPath === '../data/networks/telecom.json', 'profile networkPath');
check(network._legacyFallback === false, 'legacyFallback false');
check(!!network.phase5hCuratedAt, 'phase5h curated');

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));
const companies = extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'telecom/korea_telecom_map.html'), 'utf8'));
check(companies.length === 11, `listed 11 (got ${companies.length})`);
check(fs.readFileSync(join(ROOT, 'telecom/korea_telecom_map.html'), 'utf8').includes('data-sector="telecom"'), 'data-sector');
for (const c of companies) check(byId.has(`krx:${c.ticker}`), `missing ${c.ticker}`);

const invent = edges.filter((e) => ['supplies_equipment_to', 'supplies_component_to', 'deploys_network_for', 'wholesales_network_to', 'roaming_agreement_with'].includes(e.type)
  && ['confirmed', 'reported', 'inferred'].includes(e.status));
check(invent.length === 0, `no invented business (got ${invent.length})`);
const licenses = nodes.filter((n) => n.type === 'license_or_allocation' || n.type === 'spectrum_band');
check(licenses.filter((n) => n.type === 'license_or_allocation').length === 0, 'no license nodes without identifiers');
const spectrumOwns = edges.filter((e) => ['assigned_by', 'licensed_by'].includes(e.type) && ['confirmed', 'reported'].includes(e.status));
check(spectrumOwns.length === 0, 'spectrum not business');
check(!nodes.some((n) => n.lane === 'satellite_network' && n.type === 'group'), 'no empty satellite hub');

const peers = edges.filter((e) => e.type === 'peer');
check(peers.length >= 12, `peers (got ${peers.length})`);
check(peers.every((e) => e.defaultHidden === true), 'peers hidden');
const xref = edges.filter((e) => e.type === 'cross_sector_reference');
check(xref.length >= 4 && xref.every((e) => e.excludesFromOrphanResolution === true), 'xref ok');

const metrics = computeTelecomMetrics(network);
check(metrics.listedCompanyCount === 11, 'metrics listed');
check(metrics.confirmedBusinessEdgeCount === 0, 'no confirmed');
check(metrics.activeLicenseCount === 0, 'no active licenses');
check(metrics.zeroDegreeNodeCount === 0, 'zero degree');
for (const id of FORBIDDEN_GENERIC_TELECOM_IDS) check(!byId.has(id), `forbidden ${id}`);
for (const [k, v] of Object.entries(metrics.claimCoverage || {})) {
  if (k === 'metricNotes' || !v || typeof v !== 'object') continue;
  const err = validateCoverageMetric(v, `telecom.${k}`);
  if (err) failures.push(err);
}
console.log(JSON.stringify({
  listed: metrics.listedCompanyCount, nodes: metrics.nodeCount, edges: metrics.edgeCount,
  confirmed: metrics.confirmedBusinessEdgeCount, peers: metrics.peerEdgeCount,
  services: metrics.telecomServiceCount, equipment: metrics.equipmentNodeCount,
  xref: metrics.crossSectorReferenceCount, orphan: metrics.businessRelationOrphanCount,
}, null, 2));
console.log('warnings:', (report.warnings || []).length);
if (failures.length) { console.error(failures); process.exit(1); }
console.log('OK verify:telecom');
