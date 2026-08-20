/**
 * Assert every sector map (and dist copies) has no Samsung/Hynix heatmap
 * exclude chips. Catches page-variant strip failures that bigchip-only
 * checks would miss.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripHeatmapExcludeFilters } from './patch_heatmap_tab.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BANNED = [
  'hm-ex-samsung',
  'hm-ex-hynix',
  'heatmap-filters',
  'hmExcludeSamsung',
  'hmExcludeHynix',
  'bindHeatmapFilters',
  'heatmapCompanies()',
];

/** Core sector maps that must exist and stay chip-free (matches patch_heatmap_chg). */
const REQUIRED_SECTORS = [
  'bigchip',
  'semiconductor',
  'bio',
  'ship',
  'defense',
  'robot',
  'auto',
  'medtech',
  'battery',
  'renewable',
  'nuclear',
  'powergrid',
  'finance',
  'construction',
  'kconsume',
  'cosmetics',
  'kcontent',
  'software',
  'holdings',
  'telecom',
  'elec',
  'metal',
];

function discoverMapHtml(base) {
  const out = [];
  if (!fs.existsSync(base)) return out;
  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name === 'dist' || ent.name.startsWith('.')) continue;
    const dir = path.join(base, ent.name);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (/^korea_.+_map\.html$/i.test(name)) out.push(path.join(ent.name, name));
    }
  }
  return out.sort();
}

function assertClean(rel, content) {
  for (const marker of BANNED) {
    assert.ok(
      !content.includes(marker),
      `${rel} still contains banned heatmap exclude marker: ${marker}`,
    );
  }
}

const maps = discoverMapHtml(ROOT);
assert.ok(maps.length >= REQUIRED_SECTORS.length, `found only ${maps.length} maps`);
for (const sector of REQUIRED_SECTORS) {
  assert.ok(
    maps.some((rel) => rel.replace(/\\/g, '/').startsWith(`${sector}/`)),
    `missing required sector map for ${sector}`,
  );
}

for (const rel of maps) {
  assertClean(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const distMaps = discoverMapHtml(path.join(ROOT, 'dist'));
for (const rel of distMaps) {
  assertClean(`dist/${rel}`, fs.readFileSync(path.join(ROOT, 'dist', rel), 'utf8'));
}

// Fixture: production-like markup with attribute-order variants must strip clean.
const fixture = `
    .heatmap-filters { display:flex }
    .heatmap-filter-chip { padding:6px }
    .heatmap-filter-chip:hover { color:red }
    .heatmap-filter-chip.active { color:blue }
    <div id="heatmap-filters" class="heatmap-filters" role="group" aria-label="히트맵 제외 필터">
      <button type="button" class="heatmap-filter-chip" id="hm-ex-samsung" data-ticker="005930">삼성전자 제외</button>
      <button type="button" class="heatmap-filter-chip" id="hm-ex-hynix" data-ticker="000660">SK하이닉스 제외</button>
    </div>
    <div class="heatmap-filters" id="heatmap-filters" role="group">
      <button id="hm-ex-samsung" type="button">x</button>
    </div>
    var hmExcludeTickers = { '005930': false, '000660': false };
    function heatmapExcludeList() { return []; }
    function heatmapCompanies() { return koreanCompanies; }
    function syncHeatmapFilterLabels() {}
    function bindHeatmapFilters() {}
    function renderHeatmap() {
      InvestingMapHeatmap.render({ companies: heatmapCompanies() });
    }
    bindHeatmapFilters();
    syncHeatmapFilterLabels();
    hmExcludeSamsung: '삼성전자 제외',
    hmExcludeHynix: 'SK하이닉스 제외',
`;
const stripped = stripHeatmapExcludeFilters(fixture);
assertClean('fixture', stripped);
assert.ok(stripped.includes('companies: koreanCompanies'), 'fixture must rewrite heatmapCompanies()');

console.log(
  `verify:heatmap-exclude-chips OK — ${maps.length} source maps` +
    (distMaps.length ? ` + ${distMaps.length} dist maps` : '') +
    ' clean, strip fixture passes',
);
