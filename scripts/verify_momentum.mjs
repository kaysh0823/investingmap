import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { computeMomentumBounds } from './lib/momentum_bounds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'map_momentum.js'), 'utf8');
const context = {};
context.globalThis = context;
context.window = context;
context.localStorage = {
  _data: {},
  getItem(k) {
    return this._data[k] ?? null;
  },
  setItem(k, v) {
    this._data[k] = String(v);
  },
};
vm.createContext(context);
new vm.Script(source, { filename: 'map_momentum.js' }).runInContext(context);

const momentum = context.InvestingMapMomentum;
assert.ok(momentum, 'momentum module export missing');
assert.ok(source.includes("attr('data-ticker'"), 'momentum nodes must expose data-ticker');
assert.ok(source.includes('applyTickerFocus'), 'momentum must highlight ?ticker focus');
assert.ok(source.includes('var CHG_CLIP = 15'), 'momentum CHG_CLIP must be 15');
assert.equal(momentum.getYMode(), '20d', '20D BOX is the default y-axis mode');
assert.equal(
  momentum.pricePosition({ quoteLast: 75, high50d: 100, low50d: 50 }, '50d'),
  50,
  '50-day price position',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 120, high50d: 100, low50d: 50 }, '50d'),
  100,
  '50-day price position clamps high',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 20, high50d: 100, low50d: 50 }, '50d'),
  0,
  'price position clamps low',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 50, high50d: 50, low50d: 50 }, '50d'),
  null,
  'flat rolling range is excluded',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 75, high20d: 90, low20d: 60 }, '20d'),
  50,
  '20-day price position',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 75, high120d: 110, low120d: 40 }, '120d'),
  50,
  '120-day price position',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 75, high50d: 100, low50d: 50 }, 'bb'),
  50,
  'legacy bb mode falls back to 50d',
);

const complete = momentum.datum({
  ticker: '005930',
  rs: 67.5,
  quoteLast: 75,
  high50d: 100,
  low50d: 50,
  turnoverWon: 123_000_000_000,
  chg1dPct: 1.25,
}, '50d');
assert.equal(complete.rs, 67.5);
assert.equal(complete.position, 50);
assert.equal(complete.turnover, 123_000_000_000);
for (const missing of [
  { rs: null, quoteLast: 75, high50d: 100, low50d: 50, turnoverWon: 1 },
  { rs: 50, quoteLast: null, high50d: 100, low50d: 50, turnoverWon: 1 },
  { rs: 50, quoteLast: 75, high50d: 100, low50d: 50, turnoverWon: null },
]) {
  assert.equal(momentum.datum(missing, '50d'), null, 'incomplete bubble is skipped');
}

const history = Array.from({ length: 120 }, (_, i) => ({
  high: i + 11,
  low: i + 1,
  close: i + 6,
}));
const bounds = computeMomentumBounds(history);
assert.equal(bounds.high_120d, 130);
assert.equal(bounds.low_120d, 1);
assert.equal(bounds.high_50d, 130);
assert.equal(bounds.low_50d, 71);
assert.equal(bounds.high_20d, 130);
assert.equal(bounds.low_20d, 101);
assert.ok(bounds.bb_upper > bounds.bb_lower, 'Bollinger boundaries');
assert.equal(computeMomentumBounds(history.slice(-49)).high_50d, null);
assert.equal(computeMomentumBounds(history.slice(-19)).high_20d, null);
assert.equal(computeMomentumBounds(history.slice(-49)).bb_upper, null);

for (const marker of [
  'd3.scaleSqrt()',
  'domain([0, 100])',
  "x(50)",
  "y(50)",
  'InvestingMapHeatmap.colorForChange',
  "selectedYMode = '20d'",
  "mode20d: '20D BOX'",
  "mode50d: '50D BOX'",
  "mode120d: '120D BOX'",
  "YMODES = ['20d', '50d', '120d']",
  "YMODE_STORAGE = 'im_mm_ymode'",
  "id: '20d'",
  "id: '50d'",
  "id: '120d'",
  'data-mm-mode',
  'rawPosition',
  'bubbleLabelText',
  'radius >= 14',
  'mobile ? 30 : 42',
  '* 0.3)',
  'range([7, maxRadius])',
  "paint-order', 'stroke'",
  'ResizeObserver',
  "min-height:420px",
]) {
  assert.ok(source.includes(marker), `momentum renderer marker missing: ${marker}`);
}
assert.ok(!source.includes("id: 'bb'"), '50D %b mode tab must be removed');
assert.ok(!source.includes('modeBb'), '50D %b mode labels must be removed');
assert.ok(!source.includes("mode === 'bb'"), 'bb branch must be removed from normalizeYMode');

const mapFiles = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const dir = path.join(ROOT, entry.name);
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((file) => file.isFile() && /^korea_.+_map\.html$/i.test(file.name))
      .map((file) => path.join(dir, file.name))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('tab-btn-heatmap'));
  });

assert.ok(mapFiles.length >= 20, 'expected sector map pages');
for (const file of mapFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const runtime =
    rel.replace(/\\/g, '/') === 'bio/korea_bio_map.html'
      ? html + fs.readFileSync(path.join(ROOT, 'bio', 'korea_bio_map.inline.js'), 'utf8')
      : html;
  for (const marker of [
    'id="tab-btn-momentum"',
    'id="tab-momentum"',
    'id="momentum-root"',
    '../js/map_momentum.js?v=10',
    '../js/live_quotes.js?v=16',
    'function renderMomentum()',
    "if (tab === 'momentum') setTimeout(renderMomentum, 40);",
    "InvestingMapCandleModal.open({",
  ]) {
    assert.ok(runtime.includes(marker), `${rel}: missing ${marker}`);
  }
  assert.ok(/["']?tabMomentum["']?\s*:/.test(runtime), `${rel}: missing tabMomentum i18n`);
  assert.equal(
    (html.match(/id="tab-btn-momentum"/g) || []).length,
    1,
    `${rel}: duplicate momentum button`,
  );
  assert.equal(
    (html.match(/id="tab-momentum"/g) || []).length,
    1,
    `${rel}: duplicate momentum content`,
  );
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1]) || /application\/ld\+json/i.test(match[1])) continue;
    if (!match[2].trim()) continue;
    assert.doesNotThrow(
      () => new vm.Script(match[2], { filename: rel }),
      `${rel}: inline script syntax`,
    );
  }
}

const liveQuotes = fs.readFileSync(path.join(ROOT, 'js', 'live_quotes.js'), 'utf8');
assert.ok(
  liveQuotes.includes('c.turnoverWon =') && liveQuotes.includes('q.turnoverWon'),
  'quotes turnover must be copied to company objects',
);
for (const field of [
  'high120d',
  'low120d',
  'high50d',
  'low50d',
  'high20d',
  'low20d',
  'bbUpper',
  'bbLower',
]) {
  assert.ok(liveQuotes.includes(`c.${field} =`), `live quote field missing: ${field}`);
}
assert.ok(liveQuotes.includes("QUOTES_API_VERSION = '5'"), 'quotes API cache key version');
assert.ok(liveQuotes.includes('c.high20d ='), 'live quote high20d mapping required');
const quotesApi = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'quotes.js'), 'utf8');
for (const field of [
  'high120d',
  'low120d',
  'high50d',
  'low50d',
  'high20d',
  'low20d',
  'bbUpper',
  'bbLower',
]) {
  assert.ok(quotesApi.includes(`${field}: numOrNull(`), `quotes API field missing: ${field}`);
}
assert.ok(quotesApi.includes("QUOTES_CACHE_VERSION = 'v5'"), 'quotes response cache version');
assert.ok(quotesApi.includes("'supabase+naver-live'"), 'hybrid quotes source');
assert.ok(quotesApi.includes('stale-while-revalidate=120'), 'quotes SWR cache header');
const migration12 = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '0012_stock_quotes_momentum_bounds.sql'),
  'utf8',
);
for (const column of ['high_120d', 'low_120d', 'high_50d', 'low_50d', 'bb_upper', 'bb_lower']) {
  assert.ok(migration12.includes(column), `migration column missing: ${column}`);
}
const migration16 = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '0016_stock_quotes_high_20d.sql'),
  'utf8',
);
for (const column of ['high_20d', 'low_20d']) {
  assert.ok(migration16.includes(column), `migration 0016 column missing: ${column}`);
}
const syncSource = fs.readFileSync(
  path.join(ROOT, 'scripts', 'sync_quotes_to_supabase.mjs'),
  'utf8',
);
assert.ok(syncSource.includes('computeMomentumBounds'), 'sync momentum calculation missing');
assert.ok(syncSource.includes('high_20d'), 'sync high_20d upsert missing');
assert.ok(syncSource.includes('verifyMomentumSchema'), 'sync schema guard missing');
const tabState = fs.readFileSync(path.join(ROOT, 'js', 'map_tab_state.js'), 'utf8');
assert.ok(/momentum:\s*1/.test(tabState), 'momentum tab state must persist');

console.log(
  `verify:momentum OK — renderer math and ${mapFiles.length} sector pages`,
);
