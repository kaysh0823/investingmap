import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const relations = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'bigchip_relations.json'), 'utf8'));
const html = fs.readFileSync(join(ROOT, 'bigchip', 'korea_bigchip_map.html'), 'utf8');
const semi = fs.readFileSync(join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');
const heatmap = fs.readFileSync(join(ROOT, 'js', 'map_heatmap.js'), 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const roles = ['suppliers', 'customers', 'peers'];
const legacyEdges = roles.flatMap((role) =>
  relations.hubs.flatMap((hub) => (hub[role] || []).map((item) => ({ hub: hub.ticker, role, ...item }))),
);
const catalog = new Map((relations.expansion?.nodes || []).map((node) => [node.id, node]));
const expansionEdges = (relations.expansion?.edges || []).map((edge) => ({
  ...catalog.get(edge.node),
  ...edge,
  role: `${edge.role}s`,
}));
const edges = [...legacyEdges, ...expansionEdges];
const domestic = [...new Set(edges.map((edge) => edge.ticker).filter((ticker) =>
  ticker && !['005930', '000660'].includes(ticker),
))];

check(relations.hubs.length === 2, `expected 2 hubs, got ${relations.hubs.length}`);
for (const ticker of ['005930', '000660']) {
  check(relations.hubs.some((hub) => hub.ticker === ticker), `missing relation hub ${ticker}`);
}
for (const role of ['supplier', 'peer', 'customer']) {
  check(html.includes(`kind: '${role}'`), `generated HTML missing ${role} edges`);
  check(html.includes(`relation${role.charAt(0).toUpperCase()}${role.slice(1)}`), `translation missing ${role}`);
}
for (const country of ['KR', 'US', 'TW', 'JP', 'NL', 'CN', 'DE', 'FR']) {
  check(html.includes(`countryCode: '${country}'`), `generated HTML missing country ${country}`);
}
for (const ticker of domestic) {
  check(semi.includes(`ticker: '${ticker}'`), `semi map missing domestic relation ticker ${ticker}`);
  check(html.includes(`ticker=${ticker}`), `bigchip deep link missing ${ticker}`);
}
check(html.includes('#heatmap-root {'), 'heatmap container CSS missing (treemap would collapse to 0 height)');
check(html.includes('REGION_COLORS[d.region]'), 'standard sector graph renderer missing');
check(!html.includes('bigchip-zones'), 'legacy three-zone graph renderer still present');
check(html.includes('bigchip-relation-tags'), 'compact relation tags missing');
check(html.includes('bigchipFilterState'), 'interactive filter state missing');
check(html.includes("chains: new Set(), regions: new Set(), roles: new Set()"), 'multi-select filter groups missing');
check(html.includes('toggleBigchipFilter'), 'filter toggle handler missing');
check(html.includes('resetBigchipFilters'), 'filter reset handler missing');
check(html.includes('applyBigchipGraphFilters'), 'graph filter renderer missing');
check(html.includes("supplier: '#58a6ff'"), 'supplier blue edge color missing');
check(html.includes("customer: '#f0a44b'"), 'customer orange edge color missing');
check(html.includes("peer: '#8b949e'"), 'peer gray edge color missing');
check(html.includes("bigchipLinkRole(link) === 'peer' ? '4 4'"), 'peer dashed edge style missing');
check(html.includes('../js/map_i18n.js?v=4'), 'map_i18n cache-bust version missing');
check(html.includes('../js/map_heatmap.js?v=10'), 'map_heatmap cache-bust version missing');
check(heatmap.includes('renderSmallCards'), 'small-sector heatmap fallback missing');
check(heatmap.includes("min-height:420px;height:min(62vh,640px)"), 'heatmap self-sizing fallback missing');
check(edges.length >= 100, `expected at least 100 relation edges, got ${edges.length}`);
check(
  (html.match(/"peerNetworkDesc": "[^"]+"/g) || []).length === 2,
  'peerNetworkDesc translation missing for ko/en (legend would render undefined)',
);
check(!html.includes('undefined</div>'), 'rendered undefined legend value remains');
for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try {
    new vm.Script(match[2]);
  } catch (error) {
    failures.push(`inline script syntax error: ${error.message}`);
  }
}

console.log('Bigchip relationship network verification');
console.log('========================================');
console.log('edges:', {
  suppliers: edges.filter((x) => x.role === 'suppliers').length,
  customers: edges.filter((x) => x.role === 'customers').length,
  peers: edges.filter((x) => x.role === 'peers').length,
});
console.log('domestic ticker links:', domestic);
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
