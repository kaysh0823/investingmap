/**
 * verify:bigchip — Phase 3A dualAnchor v2 network + page wiring.
 * Legacy hub/expansion audit preserved as secondary checks on bigchip_relations.json.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const netFp = join(ROOT, 'data', 'networks', 'bigchip.json');
check(fs.existsSync(netFp), 'missing data/networks/bigchip.json');
const network = fs.existsSync(netFp) ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : { nodes: [], edges: [] };
const report = validateNetworkReport(network);
report.failures.forEach((f) => failures.push(`v2: ${f}`));

const nodes = network.nodes || [];
const edges = network.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));

check(byId.has('krx:005930'), 'krx:005930 missing');
check(byId.has('krx:000660'), 'krx:000660 missing');
check(!byId.has('anchor:005930'), 'must not use anchor:005930 on bigchip');
check(!byId.has('anchor:000660'), 'must not use anchor:000660 on bigchip');
check(!byId.has('global:samsung_d'), 'must not use global:samsung_d');
check(!byId.has('global:skhynix_d'), 'must not use global:skhynix_d');
check(byId.get('krx:005930')?.type === 'listed_company', '005930 must be listed_company');
check(byId.get('krx:000660')?.type === 'listed_company', '000660 must be listed_company');
check(byId.get('krx:005930')?.excludeFromGlobalCount === true, '005930 excludeFromGlobalCount');
check(byId.get('krx:000660')?.excludeFromGlobalCount === true, '000660 excludeFromGlobalCount');
check(network.model === 'dual_anchor_comparison', 'model dual_anchor_comparison');
check(!network._legacyFallback, 'legacyFallback must be false');

const profile = NETWORK_PROFILES.bigchip;
check(profile?.layout === 'dualAnchor', 'profile layout dualAnchor');
check(profile?.networkPath === 'data/networks/bigchip.json', 'profile networkPath');
check(profile?.model === 'dual_anchor_comparison', 'profile model');

const ended = edges.filter((e) => e.status === 'ended');
ended.forEach((e) => {
  check(e.defaultHidden !== false, `ended ${e.id} should be defaultHidden`);
});

const hanmi = edges.find((e) => e.id.includes('hanmi') || (e.source === 'krx:042700' && e.target === 'krx:000660'));
check(!!hanmi || edges.some((e) => e.status === 'ended' && e.type === 'equipment_for'), 'hanmi ended equipment edge expected');

const supplies = edges.filter((e) => e.type === 'supplies_to');
for (const e of supplies) {
  const rev = edges.find((x) => x.type === 'customer_of' && x.source === e.target && x.target === e.source);
  check(!rev, `reverse supplies_to/customer_of near ${e.id}`);
}

for (const n of nodes) {
  if (n.type === 'product_category' || n.type === 'end_market') {
    check(n.mcapWon == null, `${n.id} must not have mcap`);
  }
}

const html = fs.readFileSync(join(ROOT, 'bigchip', 'korea_bigchip_map.html'), 'utf8');
check(html.includes('RelationNetwork v2') || html.includes('relation_network.js'), 'v2 relation_network wiring');
check(html.includes('rn-detail-panel'), 'detail panel');
check(html.includes('data-sector="bigchip"'), 'data-sector bigchip');
check(!html.includes('bigchip-zones'), 'legacy three-zone removed');
check(html.includes("'IDM/종합반도체'"), 'IDM chain color retained');
check(html.includes('../js/map_heatmap.js'), 'heatmap script');
check(html.includes('../js/map_i18n.js'), 'i18n script');

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try {
    new vm.Script(match[2]);
  } catch (error) {
    failures.push(`inline script syntax error: ${error.message}`);
  }
}

// Legacy source still present for changelog audit
const relations = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'bigchip_relations.json'), 'utf8'));
const legacyCount = relations.hubs.reduce((n, h) =>
  n + (h.suppliers?.length || 0) + (h.customers?.length || 0) + (h.peers?.length || 0), 0)
  + (relations.expansion?.edges?.length || 0);
check(legacyCount >= 100, `legacy source should still have ~109 edges, got ${legacyCount}`);

console.log('Bigchip relationship network verification (Phase 3A v2)');
console.log('========================================');
console.log('v2 nodes/edges:', nodes.length, edges.length);
console.log('statusCounts:', report.summary.statusCounts);
console.log('typeCounts:', report.summary.typeCounts);
console.log('evidenceField/direct/primary:',
  report.summary.evidenceFieldCoverage + '%',
  report.summary.directEvidenceCoverage + '%',
  report.summary.primarySourceCoverage + '%');
console.log('validate warnings:', report.warnings.length);
report.warnings.slice(0, 8).forEach((w) => console.log('  WARN', w));
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
