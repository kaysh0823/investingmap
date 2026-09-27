/**
 * Hub 5-day range × market-cap scatter.
 * dist/index.html must load hub_range_scatter.js once and drop the six Top20 sections.
 * Pure helpers: percentile, clampX + overflow list, classifyGroup both → 'both'.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');

const scriptHits = distIndex.match(/js\/hub_range_scatter\.js/g) || [];
assert.equal(scriptHits.length, 1, `hub_range_scatter.js count ${scriptHits.length}`);

for (const id of [
  'hub-top-mcap',
  'hub-top-rs',
  'hub-top-turnover',
  'hub-top-turnover5d',
  'hub-top-gain1d',
  'hub-top-gain5d',
]) {
  const n = distIndex.split(`id="${id}"`).length - 1;
  assert.equal(n, 0, `${id} still in dist/index.html (${n})`);
}

assert.ok(distIndex.includes('id="hub-range-scatter"'), 'scatter root missing');
assert.ok(distIndex.includes('InvestingMapHubRangeScatter.setLang'), 'setLang hook missing');

const code = fs.readFileSync(path.join(ROOT, 'js', 'hub_range_scatter.js'), 'utf8');
const sandbox = { window: {}, document: undefined, console };
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'hub_range_scatter.js' });
const api = sandbox.window.InvestingMapHubRangeScatter;
assert.ok(api && api._test, 'InvestingMapHubRangeScatter._test missing');

const p50 = api._test.percentile([10, 20, 30, 40], 0.5);
assert.equal(p50, 25);
assert.equal(api._test.percentile([1, 2, 3, 4], 0), 1);
assert.equal(api._test.percentile([1, 2, 3, 4], 1), 4);
assert.equal(api._test.percentile([], 0.5), null);

const clamped = api._test.clampX(0.62);
assert.equal(clamped.x, 0.5);
assert.equal(clamped.overflow, true);
const inside = api._test.clampX(0.2);
assert.equal(inside.x, 0.2);
assert.equal(inside.overflow, false);

const both = api._test.classifyGroup('005930', new Set(['005930']), new Set(['005930']));
assert.equal(both, 'both');
assert.equal(api._test.classifyGroup('000660', new Set(['000660']), new Set()), 'turnover');
assert.equal(api._test.classifyGroup('035420', new Set(), new Set(['035420'])), 'gain');
assert.equal(api._test.classifyGroup('068270', new Set(), new Set()), 'other');

const model = api._test.buildModel(
  {
    sectors: {
      semi: {
        meta: { ko: '반도체', en: 'Semiconductors' },
        companies: [
          { ticker: '000001', name: '오버플로', nameEn: 'Overflow' },
          { ticker: '000002', name: '보통', nameEn: 'Normal' },
          { ticker: '000003', name: '스냅샷없음', nameEn: 'Missing' },
        ],
      },
    },
  },
  {
    recentDd: '20260923',
    quotes: {
      '000001': { rangeVol5: 0.621, mcap: 1e12 },
      '000002': { rangeVol5: 0.1, mcap: 2e12 },
    },
  },
  [{ ticker: '000001', turnoverWon: 1e11 }],
  [{ ticker: '000001', ret5dPct: 12.3 }],
);

assert.equal(model.total, 3);
assert.equal(model.shown, 2);
assert.equal(model.recentDd, '2026-09-23');
const over = model.points.filter((row) => row.overflow);
assert.equal(over.length, 1);
assert.equal(over[0].x, 0.5);
assert.equal(over[0].name, '오버플로');
assert.equal(over[0].group, 'both');
assert.ok(Math.abs(over[0].rangeVol5 - 0.621) < 1e-9);

console.log('verify:hub-range-scatter OK — dist markup, percentile, clampX overflow, group both');
