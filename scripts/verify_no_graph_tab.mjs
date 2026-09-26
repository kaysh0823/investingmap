/**
 * Assert WIP relation-network GRAPH tab is gone from all 26 sector pages.
 * Also unit-tests map_tab_state graph→netmap remap.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MAP_SECTOR } from './patch_netmap_tab.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = [
  'tab-btn-graph',
  'id="tab-graph"',
  "id='tab-graph'",
  'relation_network.js',
  'relation_network_legacy.js',
  'network_profiles.js',
];

const mapFiles = Object.keys(MAP_SECTOR);
assert.equal(mapFiles.length, 26, `expected 26 sector maps, got ${mapFiles.length}`);

for (const rel of mapFiles) {
  const candidates = [path.join(ROOT, 'dist', rel), path.join(ROOT, rel)];
  const fp = candidates.find((p) => fs.existsSync(p));
  assert.ok(fp, `missing map ${rel}`);
  const html = fs.readFileSync(fp, 'utf8');
  for (const needle of FORBIDDEN) {
    assert.equal(html.includes(needle), false, `${rel}: must not contain ${needle}`);
  }
  assert.ok(html.includes('tab-btn-netmap'), `${rel}: missing tab-btn-netmap`);
}

// --- map_tab_state unit: ?tab=graph → netmap when netmap button exists ---
{
  const src = fs.readFileSync(path.join(ROOT, 'js', 'map_tab_state.js'), 'utf8');
  const store = {};
  const els = {
    'tab-btn-netmap': { id: 'tab-btn-netmap' },
  };
  const context = {
    console,
    localStorage: {
      getItem(k) {
        return store[k] ?? null;
      },
      setItem(k, v) {
        store[k] = String(v);
      },
    },
    document: {
      readyState: 'complete',
      getElementById(id) {
        return els[id] || null;
      },
      addEventListener() {},
      createElement() {
        return { id: '', textContent: '', setAttribute() {}, style: {} };
      },
      head: { appendChild() {} },
    },
    window: {
      location: {
        href: 'https://example.test/semiconductor/korea_semiconductor_map.html?tab=graph',
        pathname: '/semiconductor/korea_semiconductor_map.html',
        search: '?tab=graph',
      },
      matchMedia() {
        return { matches: false };
      },
    },
    history: { replaceState() {} },
    URL,
    URLSearchParams,
  };
  context.globalThis = context;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  context.window.history = context.history;
  context.window.URL = URL;
  context.window.URLSearchParams = URLSearchParams;
  vm.createContext(context);
  new vm.Script(src, { filename: 'map_tab_state.js' }).runInContext(context);
  const Tab = context.window.InvestingMapTabState;
  assert.ok(Tab && typeof Tab.getTab === 'function', 'InvestingMapTabState.getTab');
  assert.equal(Tab.getTab(), 'netmap', `?tab=graph → netmap (got ${Tab.getTab()})`);
  assert.equal(Tab.graphFallback(), 'netmap');
  assert.equal(Tab.publicTab('graph'), 'netmap');

  // Without netmap button → heatmap
  delete els['tab-btn-netmap'];
  assert.equal(Tab.graphFallback(), 'heatmap');
  assert.equal(Tab.publicTab('graph'), 'heatmap');
}

console.log('verify:no-graph-tab OK — 26 maps clean; getTab(?tab=graph)→netmap');
