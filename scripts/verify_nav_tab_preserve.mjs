/**
 * Verify sector nav preserves current map tab (no hardcoded heatmap).
 * Run: node scripts/verify_nav_tab_preserve.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadNav(file, globalName) {
  const source = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
  assert.ok(!/set\(['"]tab['"],\s*['"]heatmap['"]\)/.test(source), `${file} still hardcodes heatmap`);
  assert.ok(!/tab=heatmap/.test(source), `${file} still embeds tab=heatmap`);
  const store = { im_map_tab: 'momentum' };
  const context = {
    console,
    localStorage: {
      getItem(k) {
        return store[k] || null;
      },
      setItem(k, v) {
        store[k] = String(v);
      },
    },
    document: {
      documentElement: { getAttribute() { return 'ko'; } },
      body: {
        classList: { add() {} },
        appendChild() {},
        insertBefore() {},
        firstChild: null,
      },
      getElementById() { return null; },
      createElement() {
        return {
          id: '',
          className: '',
          textContent: '',
          setAttribute() {},
          getAttribute() { return null; },
          addEventListener() {},
          style: {},
        };
      },
      head: { appendChild() {} },
      readyState: 'complete',
      addEventListener() {},
    },
    window: {
      location: {
        href: 'https://example.test/semiconductor/korea_semiconductor_map.html?lang=ko&tab=momentum',
        pathname: '/semiconductor/korea_semiconductor_map.html',
        search: '?lang=ko&tab=momentum',
      },
      matchMedia() {
        return { matches: false };
      },
    },
    URL,
    URLSearchParams,
  };
  context.globalThis = context;
  context.window.InvestingMapTabState = {
    getTab() {
      return store.im_map_tab || 'table';
    },
  };
  vm.createContext(context);
  new vm.Script(source, { filename: file }).runInContext(context);
  return { context, store, api: context.window[globalName] || context[globalName] };
}

const side = loadNav('desktop_sidebar_nav.js', 'InvestingMapDesktopSidebar');
assert.ok(side.api, 'desktop sidebar export');
const bottom = loadNav('global_bottom_nav.js', 'InvestingMapGlobalBottomNav');
assert.ok(bottom.api, 'bottom nav export');
const sector = loadNav('sector_nav.js', 'InvestingMapSectorNav');
assert.ok(sector.api, 'sector nav export');

// Render sector nav and inspect generated hrefs for current momentum tab.
const navEl = {
  attrs: {},
  innerHTML: '',
  setAttribute(k, v) {
    this.attrs[k] = v;
  },
  getAttribute(k) {
    return this.attrs[k] || null;
  },
  addEventListener() {},
  contains() {
    return true;
  },
};
sector.context.document.getElementById = function (id) {
  if (id === 'sector-nav') return navEl;
  return null;
};
sector.store.im_map_tab = 'momentum';
sector.api.render('semi', 'ko', false);
assert.match(navEl.innerHTML, /tab=momentum/, 'sector nav carries momentum');
assert.doesNotMatch(navEl.innerHTML, /ticker=/, 'sector nav omits ticker');

sector.store.im_map_tab = 'table';
sector.api.render('semi', 'ko', false);
assert.doesNotMatch(navEl.innerHTML, /[?&]tab=/, 'table omits tab param');

sector.store.im_map_tab = 'graph';
sector.api.render('semi', 'ko', false);
assert.match(navEl.innerHTML, /tab=graph/, 'sector nav carries graph');

console.log('verify:nav-tab-preserve OK');
