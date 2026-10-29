/** Guard the approved 51-stock migration in the actual deployment output. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { HOLDINGS_DESTINATIONS } from '../lib/holdings_migration.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = rel => fs.readFileSync(path.join(DIST, rel), 'utf8');
const hub = JSON.parse(read('data/hub_index.json'));
const migration = JSON.parse(read('data/holdings_migration.json'));
assert.equal(Object.keys(hub.sectors).length, 25, '25 active sectors after holdings retirement');
assert.ok(!hub.sectors.holdings && !SECTOR_META.holdings, 'holdings must not return as an aggregate sector');
assert.equal(migration.rows.length, 51);
assert.equal(Object.keys(HOLDINGS_DESTINATIONS).length, 51);
assert.ok(!fs.existsSync(path.join(DIST, 'holdings')), 'retired map must not be deployed');
assert.match(read('_redirects'), /\/holdings\/korea_holdings_map(?:\.html)?\s+\/index.html\s+301/);
const all = Object.entries(hub.sectors).flatMap(([sector, group]) => group.companies.map(c => ({ ...c, sector })));
assert.equal(all.length, new Set(all.map(c => c.ticker)).size, 'no duplicate stock aggregation');
assert.equal(all.length, hub.meta.totalCompanies, 'hub total matches unique stock inventory');
const search = JSON.parse(read('data/search_index.json'));
for (const row of migration.rows) {
  const hits = all.filter(c => c.ticker === row.ticker);
  assert.equal(hits.length, 1, `${row.ticker}: exactly one home`);
  assert.equal(hits[0].sector, row.sector, `${row.ticker}: approved sector`);
  const meta = SECTOR_META[row.sector];
  const runtime = row.sector === 'bio' ? read('bio/korea_bio_map.inline.js') : read(meta.map);
  const c = extractCompaniesFromHtml(runtime).find(c => c.ticker === row.ticker);
  assert.ok(c, `${row.ticker}: missing in deployed page`);
  assert.equal(c.id, row.company.id, `${row.ticker}: preserve existing company identity`);
  assert.equal(c.chain, '지주회사', `${row.ticker}: holding-company value chain`);
  assert.match(runtime, /"지주회사"\s*:\s*"Holding companies"/, `${row.sector}: English chain label`);
  const color = runtime.match(/const CHAIN_COLORS\s*=\s*(\{[^;]+\});/);
  assert.ok(color && Function('return (' + color[1] + ')')()['지주회사'], `${row.sector}: visible chain color`);
  const result = search.filter(c => c.t === row.ticker);
  assert.equal(result.length, 1, `${row.ticker}: one search entry`);
  assert.equal(result[0].s, row.sector, `${row.ticker}: search destination`);
}
for (const file of ['js/sector_nav.js', 'js/global_bottom_nav.js', 'js/desktop_sidebar_nav.js']) {
  assert.ok(!/id:\s*['"]holdings['"]/.test(read(file)), `${file}: retired navigation`);
}
assert.ok(!read('index.html').includes('id="hub-link-holdings"'), 'retired hub card');
assert.ok(!read('sitemap.xml').includes('/holdings/'), 'retired sitemap URL');
for (const rel of ['data/hub_rs_snapshot.json', 'data/hub_sector_returns.json']) {
  const snapshot = JSON.parse(read(rel));
  assert.deepEqual(Object.keys(snapshot.sectors).sort(), Object.keys(hub.sectors).sort(), `${rel}: aggregate sectors must match the migrated universe`);
  for (const [sector, group] of Object.entries(hub.sectors)) {
    const count = rel.includes('rs_snapshot') ? snapshot.sectors[sector].members : snapshot.sectors[sector].listingCount;
    assert.equal(count, group.companies.length, `${rel}: ${sector} must use the current member list`);
  }
}
for (const [id, meta] of Object.entries(SECTOR_META)) {
  assert.ok(!/<a\b[^>]*href=["'][^"']*holdings\/korea_holdings_map/.test(read(meta.map)), `${id}: retired navigation link`);
}
console.log('verify:holdings-migration OK — 51 stocks, 17 destination sectors, 25 active sectors, stable identities, unique aggregation, chain UI, search and redirects');
