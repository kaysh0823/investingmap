import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const context = { localStorage: { getItem: () => null } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../js/map_volatility_candles.js', import.meta.url), 'utf8'), context);
const aggregate = context.InvestingMapVolatilityCandles._test.volatilityBar;
const candleRows = context.InvestingMapVolatilityCandles._test.candleRows;
const companies = Array.from({ length: 89 }, (_, i) => ({ ticker: String(i), chain: String(Math.floor(i / 8)) }));
for (const width of [240, 375, 960, 1600]) {
  assert.equal(candleRows(companies, width, 'overview').length, 1);
  const bands = candleRows(companies, width, 'readable');
  assert.deepEqual(Array.from(bands.flat(), c => c.ticker), companies.map(c => c.ticker));
  const chainRows = new Map();
  bands.forEach((band, index) => band.forEach(c => {
    if (chainRows.has(c.chain)) assert.equal(chainRows.get(c.chain), index, 'a chain must never span multiple rows');
    chainRows.set(c.chain, index);
  }));
  assert.ok(bands.every(band => band.length <= Math.max(1, Math.floor((width - 58) / 48)) || new Set(band.map(c => c.chain)).size === 1));
}
assert.equal(candleRows([], 375, 'overview').length, 0);
const fixture = ['A', 'A', 'A', 'B', 'B', 'C', 'C', 'C', 'C', 'C', 'C', 'D'].map((chain, i) => ({ company: { chain, ticker: String(i) } }));
const grouped = candleRows(fixture, 298, 'readable'); // capacity = 5
assert.deepEqual(Array.from(grouped, band => band.map(r => r.company.chain).join('')), ['AAABB', 'CCCCCC', 'D']);
assert.equal(candleRows(fixture, 100, 'readable').length, 4, 'oversized chains remain intact even on narrow screens');
const bars = Array.from({ length: 21 }, (_, i) => ({
  t: '2026-10-' + String(i + 1).padStart(2, '0'), o: 100 + i, h: 110 + i, l: 90 + i, c: 105 + i,
}));
for (const days of [1, 3, 5, 10, 20]) {
  const result = aggregate(bars.slice().reverse(), days);
  const base = bars[20 - days].c;
  const expected = { o: bars[21 - days].o, h: 130, l: bars[21 - days].l, c: 125 };
  for (const key of Object.keys(expected)) assert.ok(Math.abs(result[key] - (expected[key] / base - 1) * 100) < 1e-9);
  assert.equal(result.start, bars[21 - days].t);
  assert.equal(result.end, bars[20].t);
}
assert.equal(aggregate(bars.slice(0, 20), 20), null);
assert.equal(aggregate([{ ...bars[0], c: 0 }, bars[1]], 1), null);
assert.equal(aggregate([bars[0], { ...bars[1], h: null }], 1), null);
assert.equal(aggregate([bars[0], { ...bars[1], h: 1 }], 1), null);
console.log('Volatility candles: all five periods, preceding-close normalization, sorting and missing/invalid OHLC passed.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ? path.resolve(root, process.argv[2]) : root;
const groups = JSON.parse(fs.readFileSync(path.join(target, 'data/hub_index.json'), 'utf8')).sectors;
for (const map of new Set(Object.values(groups).map(g => g.meta.map))) {
  const html = fs.readFileSync(path.join(target, map), 'utf8');
  const { document } = parseHTML(html);
  const button = document.getElementById('tab-btn-volatility-candles');
  assert.ok(button, map);
  assert.equal(document.getElementById('tab-btn-momentum').nextElementSibling, button, map + ': tab order');
  assert.ok(document.querySelector('#tab-volatility-candles #mm-volatility'), map + ': standalone panel');
  assert.equal(document.querySelector('#tab-momentum #mm-volatility'), null);
  assert.equal(document.querySelectorAll('script[src*="map_volatility_candles.js"]').length, 1);
  const runtime = html + (map.startsWith('bio/') ? fs.readFileSync(path.join(target, 'bio/korea_bio_map.inline.js'), 'utf8') : '');
  assert.match(runtime, /if \(tab === 'volatility-candles'\) setTimeout\(renderVolatilityCandles, 40\)/);
}
const { document } = parseHTML('<html><head></head><body><button id="tab-btn-volatility-candles"></button></body></html>');
const values = new Map();
const sandbox = { document, URL, URLSearchParams,
  location: { search: '?tab=volatility-candles', pathname: '/semiconductor/korea_semiconductor_map.html', href: 'https://test/semiconductor/korea_semiconductor_map.html?tab=volatility-candles' },
  localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(target, 'js/map_tab_state.js'), 'utf8'), sandbox);
assert.equal(sandbox.InvestingMapTabState.getTab(), 'volatility-candles');
let selected;
sandbox.InvestingMapTabState.applyInitialTab((tab, button) => { selected = tab; assert.equal(button.id, 'tab-btn-volatility-candles'); });
assert.equal(selected, 'volatility-candles');
sandbox.InvestingMapTabState.onTabChange('volatility-candles');
sandbox.location.search = '';
assert.equal(sandbox.InvestingMapTabState.getTab(), 'volatility-candles');
assert.equal(values.get('im_map_tab'), 'volatility-candles');
console.log('Standalone tab: 24 sector layouts, tab order, routing, initial selection and persistence passed.');
