import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'map_momentum.js'), 'utf8');
const context = {};
context.globalThis = context;
vm.createContext(context);
new vm.Script(source, { filename: 'map_momentum.js' }).runInContext(context);

const momentum = context.InvestingMapMomentum;
assert.ok(momentum, 'momentum module export missing');
assert.equal(
  momentum.pricePosition({ quoteLast: 75, quoteHi52: 100, quoteLo52: 50 }),
  50,
  '52-week price position',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 120, quoteHi52: 100, quoteLo52: 50 }),
  100,
  'price position clamps high',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 20, quoteHi52: 100, quoteLo52: 50 }),
  0,
  'price position clamps low',
);
assert.equal(
  momentum.pricePosition({ quoteLast: 50, quoteHi52: 50, quoteLo52: 50 }),
  null,
  'flat 52-week range is excluded',
);

const complete = momentum.datum({
  ticker: '005930',
  rs: 67.5,
  quoteLast: 75,
  quoteHi52: 100,
  quoteLo52: 50,
  turnoverWon: 123_000_000_000,
  chg1dPct: 1.25,
});
assert.equal(complete.rs, 67.5);
assert.equal(complete.position, 50);
assert.equal(complete.turnover, 123_000_000_000);
for (const missing of [
  { rs: null, quoteLast: 75, quoteHi52: 100, quoteLo52: 50, turnoverWon: 1 },
  { rs: 50, quoteLast: null, quoteHi52: 100, quoteLo52: 50, turnoverWon: 1 },
  { rs: 50, quoteLast: 75, quoteHi52: 100, quoteLo52: 50, turnoverWon: null },
]) {
  assert.equal(momentum.datum(missing), null, 'incomplete bubble is skipped');
}

for (const marker of [
  'd3.scaleSqrt()',
  'domain([0, 100])',
  "x(50)",
  "y(50)",
  'InvestingMapHeatmap.colorForChange',
  'ResizeObserver',
  "min-height:420px",
]) {
  assert.ok(source.includes(marker), `momentum renderer marker missing: ${marker}`);
}

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
    '../js/map_momentum.js?v=1',
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
const tabState = fs.readFileSync(path.join(ROOT, 'js', 'map_tab_state.js'), 'utf8');
assert.ok(/momentum:\s*1/.test(tabState), 'momentum tab state must persist');

console.log(
  `verify:momentum OK — renderer math and ${mapFiles.length} sector pages`,
);
