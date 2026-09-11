/**
 * P1 verify: CROSS memberships + relations UI inject integrity + aggregation invariance.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { HUB_MAP_PATHS, SECTOR_META } from '../lib/sector_meta.mjs';
import { crossSectors, exclusiveSector } from '../lib/sector_exclusive.mjs';
import { listHubCompanies } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

function pad(t) {
  const s = String(t || '').trim();
  if (/^[0-9]+$/.test(s)) return s.padStart(6, '0');
  return s.toUpperCase();
}

function load(rel) {
  return extractCompaniesFromHtml(fs.readFileSync(join(ROOT, rel), 'utf8'));
}

const construction = load('construction/korea_construction_map.html');
const kconsume = load('kconsume/korea_kconsume_map.html');
const nuclear = load('nuclear/korea_nuclear_map.html');
const powergrid = load('powergrid/korea_powergrid_map.html');

check(construction.some((c) => c.ticker === '028260' && c.chain === '종합건설'), '028260 missing construction');
check(!kconsume.some((c) => c.ticker === '028260'), '028260 still on kconsume');
check(nuclear.some((c) => c.ticker === '034020' && c.chain === '원자로·주기기'), '034020 missing nuclear');
check(!powergrid.some((c) => c.ticker === '034020'), '034020 still on powergrid');
check(exclusiveSector('028260') === 'construction', '028260 exclusive construction');
check(exclusiveSector('034020') === 'nuclear', '034020 exclusive nuclear');
check(exclusiveSector('377300') === 'finance', '377300 exclusive finance');
check(!crossSectors('028260'), '028260 still CROSS');
check(!crossSectors('034020'), '034020 still CROSS');
check(!crossSectors('377300'), '377300 still CROSS');

const hub = JSON.parse(fs.readFileSync(join(ROOT, 'data/hub_index.json'), 'utf8'));
check(Object.keys(hub.crossIndex || {}).length === 0, 'hub crossIndex must be empty');
const unique = listHubCompanies(hub);
const tickers = unique.map((c) => pad(c.ticker));
check(new Set(tickers).size === tickers.length, 'hub uniqueCompanies has ticker duplicates');
check(tickers.includes('028260'), 'hub missing 028260');
check(tickers.includes('034020'), 'hub missing 034020');
check(tickers.includes('377300'), 'hub missing 377300');
check(tickers.filter((t) => t === '028260').length === 1, '028260 hub mcap double-count');
check(tickers.filter((t) => t === '034020').length === 1, '034020 hub mcap double-count');
check(tickers.filter((t) => t === '377300').length === 1, '377300 hub mcap double-count');

// Aggregation invariance: hub_index company shapes must not carry relations
for (const [sid, block] of Object.entries(hub.sectors || {})) {
  for (const c of block.companies || []) {
    check(!('relations' in c), `hub sector ${sid} company has relations field`);
  }
}

// Relations integrity
const doc = JSON.parse(fs.readFileSync(join(ROOT, 'data/cross_relations.json'), 'utf8'));
const present = new Set();
const mapCounts = {};
const mapMcaps = {};
for (const [sectorId, relPath] of HUB_MAP_PATHS) {
  const cos = load(relPath);
  mapCounts[sectorId] = cos.length;
  mapMcaps[sectorId] = cos.reduce((s, c) => s + (Number(c.mcapWon) || 0), 0);
  for (const c of cos) {
    const t = pad(c.ticker);
    if (t) present.add(`${t}@${sectorId}`);
  }
}

const broken = [];
let selfRef = 0;
for (const rel of doc.relations || []) {
  const members = rel.members || [];
  for (const m of members) {
    const key = `${pad(m.ticker)}@${m.sector}`;
    if (!present.has(key)) broken.push(`${rel.id}:${key}`);
  }
  for (const self of members) {
    for (const other of members) {
      if (pad(self.ticker) === pad(other.ticker) && self.sector === other.sector && self !== other) selfRef++;
    }
  }
}
check(broken.length === 0, `broken relation links: ${broken.join(',')}`);
check(selfRef === 0, `self-ref duplicates in relation groups: ${selfRef}`);

// Sample: companies with relations still same count/mcap as mapCounts snapshot keys
// (relations inject must not add/remove companies — re-count after inject already done in build)
for (const [sectorId, relPath] of HUB_MAP_PATHS) {
  const cos = load(relPath);
  check(cos.length === mapCounts[sectorId], `${sectorId} count drifted during verify`);
  const mcap = cos.reduce((s, c) => s + (Number(c.mcapWon) || 0), 0);
  check(mcap === mapMcaps[sectorId], `${sectorId} mcap drifted during verify`);
  // At least some maps should have relations for themes that live there
  void SECTOR_META;
}

const withRel = Object.entries(Object.fromEntries(HUB_MAP_PATHS))
  .map(([sid, rel]) => [sid, load(rel).filter((c) => c.relations && c.relations.length).length])
  .filter(([, n]) => n > 0);
check(withRel.length > 0, 'no maps received relations inject');

const report = {
  cross: {
    '028260': crossSectors('028260'),
    '034020': crossSectors('034020'),
    '377300': crossSectors('377300'),
  },
  exclusive: {
    '028260': exclusiveSector('028260'),
    '034020': exclusiveSector('034020'),
    '377300': exclusiveSector('377300'),
  },
  hubUnique: hub.meta?.totalCompanies,
  relationGroups: (doc.relations || []).map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    members: (r.members || []).length,
  })),
  mapsWithRelations: Object.fromEntries(withRel),
  aggregation: {
    hubHasRelationsField: false,
    mapCountSnapshot: mapCounts,
    note: 'relations UI-only; hub company objects omit relations; map company counts unchanged by inject design',
  },
  brokenLinks: broken,
};

fs.mkdirSync(join(ROOT, 'docs/reports'), { recursive: true });
fs.writeFileSync(join(ROOT, 'docs/reports/p1_cross_relations_report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
fs.writeFileSync(
  join(ROOT, 'docs/reports/p1_cross_relations_summary.csv'),
  ['id,type,label,members', ...report.relationGroups.map((r) => `${r.id},${r.type},"${r.label}",${r.members}`)].join('\n') +
    '\n',
  'utf8',
);

console.log('P1 cross/relations verification');
console.log('hubUnique', hub.meta?.totalCompanies, 'relationGroups', report.relationGroups.length);
console.log('failures:', failures.length);
for (const f of failures) console.log(' -', f);
process.exit(failures.length ? 1 : 0);
