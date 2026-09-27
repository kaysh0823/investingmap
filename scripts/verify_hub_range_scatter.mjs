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

const filtersOn = { turnover5d: true, gain5d: true, rs: true, other: true };
const rsGain = ['gain5d', 'rs'];
assert.equal(api._test.displayKind(rsGain, filtersOn), 'multi');
assert.equal(api._test.displayKind(rsGain, { turnover5d: true, gain5d: true, rs: false, other: true }), 'gain5d');
assert.equal(api._test.displayKind(rsGain, { turnover5d: true, gain5d: false, rs: false, other: true }), 'other');
assert.equal(api._test.displayKind(['turnover5d'], filtersOn), 'turnover5d');
assert.equal(api._test.displayKind([], filtersOn), 'other');
const rsBb = ['rs', 'bb'];
const withBb = { turnover5d: true, gain5d: true, rs: true, bb: true, other: true };
assert.equal(api._test.displayKind(rsBb, withBb), 'multi');
assert.equal(api._test.displayKind(rsBb, { turnover5d: true, gain5d: true, rs: true, bb: false, other: true }), 'rs');
assert.equal(api._test.displayKind(['bb'], withBb), 'bb');
assert.equal(api._test.displayKind(['bb'], { turnover5d: true, gain5d: true, rs: true, bb: false, other: true }), 'other');

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
assert.equal(over[0].groups.join(','), 'turnover5d,gain5d');
assert.equal(api._test.displayKind(over[0].groups, filtersOn), 'multi');
assert.ok(Math.abs(over[0].rangeVol5 - 0.621) < 1e-9);

const mixed = api._test.buildModel(
  {
    sectors: {
      elec: {
        meta: { ko: '전기·전자', en: 'Electrical' },
        companies: [{ ticker: '000500', name: '가온전선', nameEn: 'Gaon Cable' }],
      },
    },
  },
  { recentDd: '20260923', quotes: { '000500': { rangeVol5: 0.08, mcap: 5e11 } } },
  [],
  [{ ticker: '000500', ret5dPct: 4.2 }],
  [{ ticker: '000500', rs: 96.2, rank: 1 }],
);
assert.equal(mixed.shown, 1);
assert.equal(mixed.points[0].groups.join(','), 'gain5d,rs');
assert.equal(mixed.points[0].rs, 96.2);
assert.equal(mixed.points[0].rsRank, 1);
assert.equal(api._test.displayKind(mixed.points[0].groups, filtersOn), 'multi');
assert.equal(
  api._test.displayKind(mixed.points[0].groups, { turnover5d: true, gain5d: true, rs: false, other: true }),
  'gain5d',
);
assert.equal(
  api._test.displayKind(mixed.points[0].groups, { turnover5d: true, gain5d: false, rs: false, other: true }),
  'other',
);

assert.doesNotThrow(() => {
  api.setRs({ rsTop20: [{ ticker: '000500', rs: 96.2, rank: 1 }] });
  api.setMovers({ turnover5dTop10: [], gainers5dTop10: [{ ticker: '000500', ret5dPct: 4.2 }] });
});
assert.equal(api._test.inputs().rsTop20.length, 1);
assert.equal(api._test.inputs().gainers5d.length, 1);
assert.doesNotThrow(() => {
  api.setMovers({ turnover5dTop10: [{ ticker: '005930' }], gainers5dTop10: [] });
  api.setRs({ rsTop20: [{ ticker: '000660', rs: 80, rank: 2 }] });
});
assert.equal(api._test.inputs().turnover5d[0].ticker, '005930');
assert.equal(api._test.inputs().rsTop20[0].ticker, '000660');
assert.equal(api._test.inputs().gainers5d.length, 0);

const bbModel = api._test.buildModel(
  {
    sectors: {
      chemical: {
        meta: { ko: '화학', en: 'Chemicals' },
        companies: [{ ticker: '357780', name: '솔브레인', nameEn: 'Soulbrain' }],
      },
    },
  },
  { recentDd: '20260923', quotes: { '357780': { rangeVol5: 0.05, mcap: 3e12 } } },
  [],
  [],
  [],
  [{ ticker: '357780', name: '솔브레인', score: 2.198, pctB: 1.31, bbw: 0.128, bbwNorm: 11, rank: 1 }],
);
assert.equal(bbModel.points[0].groups.join(','), 'bb');
assert.equal(api._test.displayKind(bbModel.points[0].groups, withBb), 'bb');
assert.equal(bbModel.points[0].bbScore, 2.198);
assert.equal(bbModel.points[0].bbRank, 1);

const staggered = api._test.staggerPercentileLabels([
  { px: 10, label: 'P25' },
  { px: 20, label: 'P50' },
  { px: 30, label: 'P75' },
]);
assert.equal(staggered.map((row) => row.dy).join(','), '0,12,24');

console.log('verify:hub-range-scatter OK — dist markup, percentile, clampX, RS/multi groups, setRs/setMovers');
