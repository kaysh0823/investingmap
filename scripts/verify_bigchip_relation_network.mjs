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
check(html.includes('../js/map_i18n.js?v=6'), 'map_i18n cache-bust version missing');
check(html.includes('../js/map_heatmap.js?v=12'), 'map_heatmap cache-bust version missing');
check(html.includes('"sbKorean": "밸류체인"'), 'ko sidebar label should be 밸류체인');
check(html.includes('"sbKorean": "Value chain"'), 'en sidebar label should be Value chain');
check(html.includes('id="sb-korean">밸류체인</div>'), 'sidebar title markup should say 밸류체인');
check(html.includes('BIGCHIP_CHAIN_ORDER'), 'value-chain order constant missing');
check(html.includes('BIGCHIP_NEUTRAL_COLOR'), 'neutral chain color constant missing');
check(html.includes('bigchipPresentChains'), 'present-chain legend helper missing');
check(html.includes("c.chain !== 'IDM/종합반도체'"), 'IDM chip must be excluded from present-chain legend');
check(html.includes('bigchipNodeFill'), 'node fill helper missing');
check(html.includes('bigchipIsDomesticPartner'), 'domestic partner detector missing');
check(html.includes('isHub: true'), 'hub nodes should keep hub styling');
check(
  html.includes('Every node keeps a name label') || html.includes('node.append(\'text\')') || /node\.append\('text'\)/.test(html),
  '전 노드 이름 라벨 존재: text labels must not be gated on radius',
);
check(!/node\.filter\(\(item\) => item\.r >= 9/.test(html), 'radius-gated labels must be removed');
check(html.includes("'IDM/종합반도체'"), 'IDM/종합반도체 chain color retained for hubs');
check(html.includes("'전공정 장비'"), '전공정 장비 chain color missing');
check(html.includes("'후공정 장비'"), '후공정 장비 chain color missing');
check(html.includes("'패키징/테스트'"), '패키징/테스트 chain color missing');
check(html.includes("'부품/기판'"), '부품/기판 chain color missing');
check(html.includes("'팹리스'"), '팹리스 chain color missing');
check(html.includes("'소재'"), '소재 chain color missing');
check(!html.includes("'종합반도체':"), 'legacy 종합반도체 chain key should be removed');
check(!html.includes("'HBM·메모리'"), 'legacy HBM·메모리 chain key should be removed');
check(
  /chain: '[^']+'/.test(html) && html.includes("ticker: '014680'") && html.includes("chain: '소재'"),
  'domestic expansion ticker should carry semi chain (e.g. 한솔케미칼=소재)',
);
for (const node of relations.expansion?.nodes || []) {
  check(!!node.name, `expansion node ${node.id} missing name`);
  check(html.includes(`name: '${node.name.replace(/'/g, "\\'")}'`) || html.includes(`name: "${node.name}"`) || html.includes(node.name),
    `generated HTML missing relations name for ${node.id}`);
}
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
