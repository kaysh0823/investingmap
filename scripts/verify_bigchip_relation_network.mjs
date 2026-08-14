import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const relations = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'bigchip_relations.json'), 'utf8'));
const html = fs.readFileSync(join(ROOT, 'bigchip', 'korea_bigchip_map.html'), 'utf8');
const semi = fs.readFileSync(join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const roles = ['suppliers', 'customers', 'peers'];
const edges = roles.flatMap((role) =>
  relations.hubs.flatMap((hub) => (hub[role] || []).map((item) => ({ hub: hub.ticker, role, ...item }))),
);
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
for (const country of ['KR', 'US', 'TW', 'JP', 'NL']) {
  check(html.includes(`countryCode: '${country}'`), `generated HTML missing country ${country}`);
}
for (const ticker of domestic) {
  check(semi.includes(`ticker: '${ticker}'`), `semi map missing domestic relation ticker ${ticker}`);
  check(html.includes(`ticker=${ticker}`), `bigchip deep link missing ${ticker}`);
}
check(html.includes('bigchip-zones'), 'three-zone graph renderer missing');
check(html.includes('setBigchipCountry'), 'country filter missing');
check(html.includes('../js/map_i18n.js?v=2'), 'map_i18n cache-bust version missing');
check(!html.includes('>${t.peerNetworkDesc}</div>'), 'legacy undefined-prone legend template remains');
check(!html.includes('undefined</div>'), 'rendered undefined legend value remains');

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
