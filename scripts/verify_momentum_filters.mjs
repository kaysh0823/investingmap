/** Offline deployment gate: every built sector page must retain both axis filters. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { SECTOR_META } from '../lib/sector_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(ROOT, process.argv[2] || 'dist');
const read = rel => fs.readFileSync(path.join(target, rel), 'utf8');
const groups = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hub_index.json'), 'utf8')).sectors;
const pages = [...new Set(Object.values(groups).map(group => group.meta.map))];
assert.equal(pages.length, Object.keys(SECTOR_META).length, 'all active sectors must be tested');
assert.ok(pages.length >= 25, 'active sector inventory must not shrink below 25');
assert.ok(!groups.holdings, 'retired holdings sector must not return');
const source = read('js/map_momentum.js');
const searchSource = read('js/map_tab_search.js');
const ranks = ['rs5', 'rs10', 'rs20', 'rs50'];
const modes = ['5d', '10d', '20d'];

// Exercise the real private builders without adding test hooks to shipped JS.
assert.equal(source.split('_test: {').length, 2, 'momentum test export anchor missing');
const instrumented = source.replace('_test: {', `_test: {
  buildFilters: ensureModeTabs, injectFilterStyles: injectStyles,
  currentX: function () { return selectedXMode; },
`);
assert.match(source, /ensureModeTabs\(container,\s*opts\)/, 'render must mount the axis controls');
assert.match(source, /datum\(company,\s*selectedYMode,\s*selectedXMode\)/, 'render must use both selected axes');

function mount(html, url, saved = new Map()) {
  const { document, Event } = parseHTML(html);
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
  };
  const ctx = { document, location: { pathname: '/' + url }, localStorage: storage, setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(searchSource, ctx, { filename: 'map_tab_search.js' });
  vm.runInContext(instrumented, ctx, { filename: 'map_momentum.js' });
  const api = ctx.InvestingMapMomentum;
  const container = document.getElementById('momentum-root');
  const refresh = lang => {
    api._test.injectFilterStyles();
    api._test.buildFilters(container, { lang });
  };
  return { document, Event, api, container, refresh, saved };
}

function assertLayout(document, container, label) {
  const x = document.getElementById('mm-rs-tabs');
  const y = document.getElementById('mm-mode-tabs');
  const layout = container.parentNode;
  assert.ok(layout.classList.contains('mm-chart-layout'), `${label}: chart layout missing`);
  assert.ok(y.classList.contains('mm-y-tabs'), `${label}: BOX filters must use the side rail`);
  assert.equal(y.parentNode, layout, `${label}: BOX filters must sit beside the chart`);
  assert.equal(y.nextElementSibling, container, `${label}: BOX filters must precede the vertical axis`);
  const row = x.closest('.mm-tab-search-row');
  assert.ok(row, `${label}: RS controls must share the top search row`);
  assert.equal(row.nextElementSibling, layout, `${label}: RS controls must stay above the chart`);
  assert.deepEqual([...x.querySelectorAll('button')].map(b => b.dataset.mmRs), ranks, `${label}: four RS options`);
  assert.deepEqual([...y.querySelectorAll('button')].map(b => b.dataset.mmMode), modes, `${label}: three BOX options`);
  for (const id of ['mm-rs-tabs', 'mm-mode-tabs']) {
    assert.equal(document.querySelectorAll('#' + id).length, 1, `${label}: duplicate ${id}`);
    assert.equal(document.querySelectorAll(`#${id} [aria-selected="true"]`).length, 1, `${label}: selected state`);
  }
  const css = document.getElementById('im-momentum-css').textContent;
  const railRule = css.match(/\.mm-y-tabs\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(railRule, /flex-direction\s*:\s*column/, `${label}: BOX filters must stack vertically`);
  assert.match(css, /\.mm-chart-layout\s*\{[^}]*display\s*:\s*flex/, `${label}: side-by-side layout`);
  assert.match(css, /@media[^}]*\.mm-y-tabs/, `${label}: mobile side-rail sizing missing`);
}

const fixture = {
  rs: 99, rs5: 12, rs10: 34, rs20: 56, rs50: 78,
  quoteLast: 75, high5d: 100, low5d: 50,
  high10d: 125, low10d: 0, high20d: 150, low20d: 50, turnoverWon: 1e9,
};
const expectedPosition = { '5d': 50, '10d': 60, '20d': 25 };
let combinations = 0;
for (const rel of pages) {
  const html = read(rel);
  const { document: page } = parseHTML(html);
  assert.equal(page.querySelectorAll('#tab-btn-momentum').length, 1, `${rel}: momentum entry missing/duplicated`);
  assert.equal(page.querySelectorAll('#momentum-root').length, 1, `${rel}: chart missing/duplicated`);
  // Check deployed asset bytes, not just the source HTML references.
  for (const name of ['map_momentum.js', 'map_tab_search.js', 'live_quotes.js']) {
    const tags = [...page.querySelectorAll('script[src]')].filter(s => new URL(s.src, 'https://test/' + rel).pathname === '/js/' + name);
    assert.equal(tags.length, 1, `${rel}: ${name} must load exactly once`);
    const hash = createHash('sha1').update(read('js/' + name)).digest('hex').slice(0, 8);
    assert.equal(new URL(tags[0].src, 'https://test/' + rel).searchParams.get('v'), hash, `${rel}: stale ${name} cache hash`);
  }
  const inlineFile = path.join(target, path.dirname(rel), 'korea_bio_map.inline.js');
  const runtime = html + (rel.startsWith('bio/') && fs.existsSync(inlineFile) ? fs.readFileSync(inlineFile, 'utf8') : '');
  assert.match(runtime, /InvestingMapMomentum\.render\(/, `${rel}: renderer disconnected`);
  assert.match(runtime, /onQuotesReady/, `${rel}: quote refresh disconnected`);
  for (const lang of ['ko', 'en']) {
    const h = mount(html, rel);
    h.refresh(lang);
    assertLayout(h.document, h.container, `${rel}/${lang}`);
    for (const mode of modes) {
      h.document.querySelector(`[data-mm-mode="${mode}"]`).dispatchEvent(new h.Event('click', { bubbles: true }));
      h.refresh(lang);
      for (const rank of ranks) {
        h.document.querySelector(`[data-mm-rs="${rank}"]`).dispatchEvent(new h.Event('click', { bubbles: true }));
        h.refresh(lang);
        assert.equal(h.saved.get('im_mm_ymode') ?? '5d', mode, `${rel}: BOX click/persistence`);
        assert.equal(h.saved.get('im_mm_xmode'), rank, `${rel}: RS click/persistence`);
        assert.equal(h.document.querySelector('#mm-mode-tabs [aria-selected="true"]').dataset.mmMode, mode);
        assert.equal(h.document.querySelector('#mm-rs-tabs [aria-selected="true"]').dataset.mmRs, rank);
        const datum = h.api.datum(fixture, h.api.getYMode(), h.api._test.currentX());
        assert.equal(datum.rs, fixture[rank], `${rel}: selected RS must drive x`);
        assert.equal(datum.position, expectedPosition[mode], `${rel}: selected BOX must drive y`);
        assert.equal(h.api.datum({ ...fixture, [rank]: null }, mode, rank), null, `${rel}: no composite RS fallback`);
        combinations++;
      }
    }
    assertLayout(h.document, h.container, `${rel}/${lang}/after switching`);
    const reloaded = mount(html, rel, h.saved);
    reloaded.refresh(lang);
    assert.equal(reloaded.document.querySelector('#mm-rs-tabs [aria-selected="true"]').dataset.mmRs, 'rs50');
    assert.equal(reloaded.document.querySelector('#mm-mode-tabs [aria-selected="true"]').dataset.mmMode, '20d');
  }
}

// A daily snapshot built by outdated RS code must also fail the deployment gate.
const snapshot = JSON.parse(read('data/hub_rs_snapshot.json'));
for (const [id, group] of Object.entries(groups)) {
  for (const rank of ranks) {
    assert.ok(group.companies.some(c => Number.isFinite(snapshot.quotes?.[c.ticker]?.[rank])), `${id}: snapshot has no ${rank} data`);
  }
}
console.log(`verify:momentum-filters OK — ${pages.length} sector pages, ${combinations} axis combinations (ko/en), layout, events, persistence, asset hashes and RS data (${path.relative(ROOT, target)})`);
