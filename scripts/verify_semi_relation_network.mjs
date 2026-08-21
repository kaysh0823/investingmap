import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const relations = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'semi_relations.json'), 'utf8'));
const html = fs.readFileSync(join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const EXPECTED_CHAINS = [
  '전공정 장비',
  '후공정 장비',
  '소재',
  '파운드리',
  '팹리스',
  '디자인하우스',
  '부품/기판',
  '패키징/테스트',
  '반도체 유통',
];
const EXPECTED_HUB_IDS = [
  'front_equip',
  'back_equip',
  'materials',
  'foundry',
  'fabless',
  'design_house',
  'substrate',
  'osat',
  'distribution',
];
const MIN_MEMBERS = {
  '전공정 장비': 10,
  '후공정 장비': 5,
  소재: 10,
  파운드리: 1,
  팹리스: 7,
  디자인하우스: 2,
  '부품/기판': 8,
  '패키징/테스트': 8,
  '반도체 유통': 1,
};

check(relations.hubs.length === 9, `expected 9 hubs, got ${relations.hubs.length}`);
for (const chain of EXPECTED_CHAINS) {
  check(relations.hubs.some((h) => h.chain === chain), `missing hub chain ${chain}`);
}
for (const id of EXPECTED_HUB_IDS) {
  check(relations.hubs.some((h) => h.id === id), `missing hub id ${id}`);
  check(
    html.includes(`id: 'hub_${id}'`) || html.includes(`hub_${id}`),
    `generated HTML missing hub_${id}`,
  );
}

for (const hub of relations.hubs) {
  check(hub.id && hub.label?.ko && hub.label?.en, `hub ${hub.chain} missing id/label`);
  const minMembers = MIN_MEMBERS[hub.chain] ?? 1;
  check(
    Array.isArray(hub.members) && hub.members.length >= minMembers,
    `hub ${hub.chain} needs members (>=${minMembers}), got ${hub.members?.length ?? 0}`,
  );
  for (const role of ['suppliers', 'customers', 'peers']) {
    check(Array.isArray(hub[role]) && hub[role].length >= 1, `hub ${hub.chain} missing ${role}`);
    for (const edge of hub[role]) {
      check(!!edge.id && !!edge.name && !!edge.nameEn, `${hub.chain}/${role} missing name fields`);
      check(!!edge.country && !!edge.note && !!edge.noteEn, `${hub.chain}/${role} missing country/note`);
      check(!!edge.source && /^https?:\/\//.test(edge.source), `${hub.chain}/${role} bad source URL`);
      check(edge.evidence === 'confirmed' || edge.evidence === 'reported', `${hub.chain}/${role} bad evidence`);
    }
  }
  for (const m of hub.members) {
    check(!!m.ticker && !!m.name, `hub ${hub.chain} member incomplete`);
    check(html.includes(`ticker: '${m.ticker}'`), `semi map missing member ${m.ticker}`);
  }
}

check(html.includes("CURATED_RELATION_MODE = 'chainGroup'"), 'chainGroup mode missing');
check(html.includes('CURATED_RELATION_HUBS'), 'CURATED_RELATION_HUBS missing');
check(!html.includes("ticker: '171090'"), '171090 must not remain on semi map HTML');
const designHub = relations.hubs.find((h) => h.id === 'design_house');
check(designHub, 'design_house hub missing');
check(
  !designHub.customers.some((c) => c.id === 'samsung_d' || c.id === 'skhynix_d'),
  'design_house customers must not include Samsung Electronics / SK hynix',
);
check(
  designHub.customers.some((c) => c.id === 'fabless_sys_customers'),
  'design_house customers must include fabless/system-IC customers node',
);
check(html.includes('CURATED_HUB_ANGLE'), 'CURATED_HUB_ANGLE missing');
check(html.includes("kind: 'member'"), 'member edges missing');
check(html.includes("kind: 'supplier'"), 'supplier edges missing');
check(html.includes("kind: 'customer'"), 'customer edges missing');
check(html.includes("kind: 'peer'"), 'peer edges missing');
check(html.includes('bigchipFilterState'), 'interactive filter state missing');
check(html.includes("chains: new Set(), regions: new Set(), roles: new Set()"), '3 filter groups missing');
check(html.includes('bigchip-relation-tags'), 'compact relation tags missing');
check(html.includes("supplier: '#58a6ff'"), 'supplier edge color missing');
check(html.includes("customer: '#f0a44b'"), 'customer edge color missing');
check(html.includes("peer: '#8b949e'"), 'peer edge color missing');
check(html.includes('"sbKorean": "밸류체인"') || html.includes("sbKorean: '밸류체인'"), 'ko sidebar 밸류체인');
check(html.includes("sbKorean: 'Value chain'"), 'en sidebar Value chain');
check(html.includes('id="sb-korean">밸류체인</div>'), 'sidebar title markup');
check(html.includes('../js/map_i18n.js?v=8'), 'map_i18n cache-bust v=8');
check(html.includes('../js/map_heatmap.js?v=14'), 'map_heatmap cache-bust v=14');
check(
  html.includes('Every node keeps a name label') || /node\.append\('text'\)/.test(html),
  'all-node name labels required',
);
check(!/node\.filter\(\(item\) => item\.r >= 9/.test(html), 'radius-gated labels must be removed');
check(html.includes('hubKind === \'group\'') || html.includes('hubKind: \'group\''), 'group hub styling');

for (const id of [
  'globalfoundries', 'umc', 'smic', 'arm', 'synopsys', 'cadence', 'broadcom', 'guc', 'alchip', 'faraday',
  'ibiden', 'shinko', 'unimicron', 'ats', 'jcet', 'pti', 'wpg', 'arrow', 'avnet', 'henkel', 'infineon',
]) {
  check(html.includes(`id: '${id}'`), `generated HTML missing relation node ${id}`);
}

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/.test(attrs) || !match[2].trim()) continue;
  try {
    new vm.Script(match[2]);
  } catch (error) {
    failures.push(`inline script syntax error: ${error.message}`);
  }
}

const edgeCount = relations.hubs.reduce(
  (n, h) => n + (h.suppliers?.length || 0) + (h.customers?.length || 0) + (h.peers?.length || 0),
  0,
);
const memberCount = relations.hubs.reduce((n, h) => n + (h.members?.length || 0), 0);

console.log('Semi relationship network verification (B1+B2a+B2b)');
console.log('===================================================');
console.log('hubs:', relations.hubs.map((h) => `${h.chain}(${h.members?.length || 0})`));
console.log('members:', memberCount, 'edges:', edgeCount);
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
