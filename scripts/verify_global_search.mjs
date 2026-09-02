/**
 * Verify global stock search index, script injection, and sector map alignment.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTOR_META } from '../lib/sector_meta.mjs';
import {
  GLOBAL_SEARCH_V,
  MAP_FILES,
  ROOT_PAGES,
} from './patch_global_search.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH_INDEX = path.join(ROOT, 'data', 'search_index.json');
const GLOBAL_SEARCH_JS = path.join(ROOT, 'js', 'global_search.js');
const DIST_SEARCH_INDEX = path.join(ROOT, 'dist', 'data', 'search_index.json');
const DIST_GLOBAL_SEARCH_JS = path.join(ROOT, 'dist', 'js', 'global_search.js');

function extractSectorMapFromJs() {
  const src = fs.readFileSync(GLOBAL_SEARCH_JS, 'utf8');
  const match = src.match(/var SECTOR_MAP = (\{[\s\S]*?\n  \});/);
  assert.ok(match, 'global_search.js: SECTOR_MAP block missing');
  return Function(`return (${match[1]});`)();
}

const metaMaps = Object.fromEntries(
  Object.entries(SECTOR_META).map(([sid, meta]) => [sid, meta.map]),
);
const jsMaps = extractSectorMapFromJs();

assert.equal(
  Object.keys(metaMaps).length,
  24,
  'sector_meta must define 24 sectors',
);
assert.equal(
  Object.keys(jsMaps).length,
  24,
  'global_search SECTOR_MAP must define 24 sectors',
);

for (const [sid, mapPath] of Object.entries(metaMaps)) {
  assert.equal(
    jsMaps[sid],
    mapPath,
    `SECTOR_MAP[${sid}] must match sector_meta (${mapPath})`,
  );
}

assert.ok(fs.existsSync(SEARCH_INDEX), 'data/search_index.json must exist');
const index = JSON.parse(fs.readFileSync(SEARCH_INDEX, 'utf8'));
assert.ok(Array.isArray(index), 'search_index.json must be an array');
assert.ok(index.length > 0, 'search_index.json must not be empty');

for (const entry of index) {
  assert.ok(entry.t, 'search entry missing ticker');
  assert.ok(entry.s, 'search entry missing sector id');
  assert.ok(
    jsMaps[entry.s],
    `search entry sector ${entry.s} (${entry.t}) not in SECTOR_MAP`,
  );
}

const expectedTag = `global_search.js?v=${GLOBAL_SEARCH_V}`;
for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  assert.ok(fs.existsSync(fp), `missing map page ${rel}`);
  const html = fs.readFileSync(fp, 'utf8');
  assert.ok(
    html.includes(`../js/${expectedTag}`),
    `${rel}: missing global_search.js script`,
  );
}
for (const rel of ROOT_PAGES) {
  const fp = path.join(ROOT, rel);
  assert.ok(fs.existsSync(fp), `missing root page ${rel}`);
  const html = fs.readFileSync(fp, 'utf8');
  assert.ok(
    html.includes(`js/${expectedTag}`),
    `${rel}: missing global_search.js script`,
  );
}

const heatmapSrc = fs.readFileSync(path.join(ROOT, 'js', 'map_heatmap.js'), 'utf8');
assert.ok(heatmapSrc.includes('applyTickerFocus'), 'map_heatmap must highlight ?ticker');
assert.ok(heatmapSrc.includes('im-hm-focus'), 'map_heatmap must define focus class');

const momentumSrc = fs.readFileSync(path.join(ROOT, 'js', 'map_momentum.js'), 'utf8');
assert.ok(momentumSrc.includes("attr('data-ticker'"), 'map_momentum must set data-ticker');
assert.ok(momentumSrc.includes('applyTickerFocus'), 'map_momentum must highlight ?ticker');

const searchSrc = fs.readFileSync(GLOBAL_SEARCH_JS, 'utf8');
assert.ok(searchSrc.includes("tab: 'volatility'"), 'global_search modal must offer volatility');
assert.ok(searchSrc.includes("volatility: '변동성 분포'"), 'global_search ko volatility label');
assert.ok(searchSrc.includes("volatility: 'Volatility'"), 'global_search en volatility label');

const volSrc = fs.readFileSync(path.join(ROOT, 'js', 'map_volatility.js'), 'utf8');
assert.ok(volSrc.includes('applyTickerFocus'), 'map_volatility must highlight ?ticker');
assert.ok(volSrc.includes('im-vol-focus'), 'map_volatility must define focus class');

if (fs.existsSync(path.join(ROOT, 'dist'))) {
  assert.ok(fs.existsSync(DIST_GLOBAL_SEARCH_JS), 'dist/js/global_search.js must exist');
  assert.ok(fs.existsSync(DIST_SEARCH_INDEX), 'dist/data/search_index.json must exist');
}

console.log(
  `verify:global-search OK — ${index.length} entries, ${MAP_FILES.length + ROOT_PAGES.length} pages patched`,
);
