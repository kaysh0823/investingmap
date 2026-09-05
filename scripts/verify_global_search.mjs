/**
 * Verify global stock search index, script injection, and sector map alignment.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
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
assert.ok(searchSrc.includes("coverageHint: '시총 2천억원 이상 종목만 커버하고 있습니다.'"), 'global_search ko coverageHint');
assert.ok(searchSrc.includes("coverageHint: 'Only names with market cap ≥ KRW 200B are covered.'"), 'global_search en coverageHint');
assert.ok(searchSrc.includes('.im-gs-hint'), 'global_search css must include .im-gs-hint');
assert.ok(searchSrc.includes("hint.className = 'im-gs-hint'"), 'global_search must render .im-gs-hint element');

// Test dropdown rendering logic for no-result hint (ko / en)
{
  class MockElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.className = '';
      this.classes = new Set();
      this.classList = {
        add: (c) => this.classes.add(c),
        remove: (c) => this.classes.delete(c),
        toggle: (c, force) => (force ? this.classes.add(c) : this.classes.delete(c)),
        contains: (c) => this.classes.has(c),
      };
      this.attributes = {};
      this.textContent = '';
      this._innerHTML = '';
      this.parentNode = null;
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] || null; }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    insertBefore(child, ref) {
      const idx = ref ? this.children.indexOf(ref) : -1;
      if (idx >= 0) this.children.splice(idx, 0, child);
      else this.children.push(child);
      child.parentNode = this;
      return child;
    }
    get firstChild() { return this.children[0] || null; }
    addEventListener(event, fn) {
      this.listeners = this.listeners || {};
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    }
    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const list = (this.listeners && this.listeners[type]) || [];
      for (const fn of list) fn({ target: this, preventDefault() {} });
    }
    querySelector(sel) {
      for (const c of this.children) {
        if (('.' + c.className).includes(sel) || c.id === sel.replace('#', '')) return c;
        const found = c.querySelector(sel);
        if (found) return found;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      for (const c of this.children) {
        if (('.' + c.className).includes(sel) || c.id === sel.replace('#', '')) out.push(c);
        out.push(...c.querySelectorAll(sel));
      }
      return out;
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(v) {
      this._innerHTML = v;
      if (v === '') this.children = [];
    }
  }

  const mockDoc = {
    readyState: 'complete',
    documentElement: new MockElement('html'),
    head: new MockElement('head'),
    body: new MockElement('body'),
    createElement(tag) { return new MockElement(tag); },
    getElementById(id) {
      return mockDoc.body.querySelector('#' + id);
    },
    querySelector(sel) {
      return mockDoc.body.querySelector(sel);
    },
    addEventListener() {},
  };
  mockDoc.documentElement.setAttribute('lang', 'ko');

  const mockIndex = [{ t: '005930', k: '삼성전자', e: 'Samsung Electronics', s: 'semi', m: 500000 }];
  const mockWindow = {
    location: { pathname: '/ship/korea_ship_map.html', search: '', href: 'https://example.com/ship/' },
    localStorage: { getItem() { return null; } },
    document: mockDoc,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(mockIndex) }),
  };

  const ctx = {
    window: mockWindow,
    document: mockDoc,
    URLSearchParams: globalThis.URLSearchParams,
    URL: globalThis.URL,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(mockIndex) }),
    console: console,
  };
  vm.createContext(ctx);
  vm.runInContext(searchSrc, ctx);

  // Wait for loadIndex promise resolution
  await new Promise((r) => setTimeout(r, 100));

  const inputEl = mockDoc.body.querySelector('#im-global-search');
  const listEl = mockDoc.body.querySelector('#im-global-search-list');
  assert.ok(inputEl, 'input element must exist');
  assert.ok(listEl, 'list element must exist');

  // Test ko empty results
  mockDoc.documentElement.setAttribute('lang', 'ko');
  inputEl.value = '없는종목검색';
  inputEl.dispatchEvent('input');
  assert.equal(listEl.children.length, 2, 'ko empty must produce 2 items (empty + hint)');
  const emptyKo = listEl.children[0];
  const hintKo = listEl.children[1];
  assert.equal(emptyKo.className, 'im-gs-empty');
  assert.equal(emptyKo.textContent, '검색 결과 없음');
  assert.equal(hintKo.className, 'im-gs-hint');
  assert.equal(hintKo.textContent, '시총 2천억원 이상 종목만 커버하고 있습니다.');

  // Test en empty results
  mockDoc.documentElement.setAttribute('lang', 'en');
  inputEl.value = 'unknownstock';
  inputEl.dispatchEvent('input');
  assert.equal(listEl.children.length, 2, 'en empty must produce 2 items (empty + hint)');
  const emptyEn = listEl.children[0];
  const hintEn = listEl.children[1];
  assert.equal(emptyEn.className, 'im-gs-empty');
  assert.equal(emptyEn.textContent, 'No matches');
  assert.equal(hintEn.className, 'im-gs-hint');
  assert.equal(hintEn.textContent, 'Only names with market cap ≥ KRW 200B are covered.');

  // Test with results: hint and empty must not exist
  inputEl.value = '삼성';
  inputEl.dispatchEvent('input');
  assert.ok(listEl.children.length > 0, 'results must be rendered');
  assert.equal(listEl.children[0].className, 'im-gs-item');
  assert.ok(
    !listEl.children.some((c) => c.className === 'im-gs-hint' || c.className === 'im-gs-empty'),
    'hint and empty must not be in list when results exist',
  );
}

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
