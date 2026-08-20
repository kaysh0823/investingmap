import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  fetchTickerOhlcBars,
  normalizeOhlcRange,
  ohlcFetchLimit,
} from '../functions/lib/ticker_ohlc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'candle_modal.js'), 'utf8');
const context = {
  console,
  URLSearchParams,
  document: {
    documentElement: {
      getAttribute() {
        return null;
      },
      setAttribute() {},
    },
    addEventListener() {},
  },
};
context.globalThis = context;
vm.createContext(context);
new vm.Script(source, { filename: 'candle_modal.js' }).runInContext(context);

const indicators = context.InvestingMapCandleModal?._indicators;
assert.ok(indicators, 'indicator test exports missing');
const ui = context.InvestingMapCandleModal?._ui;
assert.ok(ui, 'candle UI test exports missing');
assert.equal(ui.rangeForInterval('daily'), '1y', 'daily default range');
assert.equal(ui.rangeForInterval('weekly'), '5y', 'weekly default range');
// The five panels are panes of one v5 chart. That is what makes their x axes
// line up, so guard both the version we load and the single-chart structure.
assert.match(source, /lightweight-charts@5[\d.]*\/dist\//, 'must load the v5 standalone build');
for (const removed of [
  'addCandlestickSeries',
  'addLineSeries',
  'addHistogramSeries',
  'subscribeVisibleLogicalRangeChange',
  'scheduleAxisAlignment',
  'minimumWidth',
]) {
  assert.ok(!source.includes(removed), `v4-only API left behind: ${removed}`);
}
assert.equal(source.match(/createChart\(/g)?.length, 1, 'exactly one chart is created');
const paneKeys = ui.panes.map((pane) => pane.key);
assert.equal(paneKeys.join(','), 'price,vol,macd,norm,atr', 'pane order');
paneKeys.forEach((key, index) => {
  assert.equal(ui.paneIndex[key], index, `pane index for ${key}`);
});
assert.ok(
  ui.panes.every((pane) => pane.stretch > 0) && ui.panes[0].stretch > ui.panes[1].stretch,
  'the price pane is the tallest',
);
assert.ok(
  ui.panes.every((pane) => ui.paneMargins[pane.key]),
  'every pane declares its own scale margins',
);
for (const [type, pane] of [
  ['CandlestickSeries', 'PANE_INDEX.price'],
  ['HistogramSeries', 'PANE_INDEX.vol'],
  ['HistogramSeries', 'PANE_INDEX.macd'],
]) {
  assert.ok(
    new RegExp(`LWC\\.${type},[\\s\\S]{0,240}?${pane.replace('.', '\\.')},`).test(source),
    `${type} must be added to ${pane}`,
  );
}
assert.match(
  source,
  /panes\[i\]\.setStretchFactor\(spec\.stretch\)/,
  'pane heights come from the stretch factors',
);
assert.match(
  source,
  /panes\[i\]\.priceScale\('right'\)\.applyOptions\(scaleOptions\)/,
  'each pane keeps its own right price scale',
);
assert.match(source, /rightOffset: RIGHT_OFFSET_BARS/, 'right margin retained');
for (const [name, color, dataKey] of [
  ['MA5', '#ff7b72', 'ma5Line'],
  ['MA20', '#3fb950', 'ma20Line'],
]) {
  assert.ok(source.includes(`title: '${name}'`), `${name} price-pane series exists`);
  assert.ok(source.includes(`color: '${color}'`), `${name} uses the requested color`);
  assert.ok(source.includes(`setData(data.${dataKey})`), `${name} receives calculated data`);
}
const maSeriesOrder = ['MA5', 'MA20', 'MA50', 'MA120'].map((name) =>
  source.indexOf(`title: '${name}'`),
);
assert.ok(
  maSeriesOrder.every((offset, index) => offset >= 0 && (!index || offset > maSeriesOrder[index - 1])),
  'price-pane moving averages are added in 5, 20, 50, 120 order',
);
for (const key of ['ma5', 'ma20']) {
  assert.ok(source.includes(`${key}: '${key.toUpperCase()}'`), `${key} i18n label exists`);
  assert.ok(source.includes(`fmtPrice(b.${key})`), `${key} appears in the crosshair header`);
}
assert.match(
  source,
  /title: 'MA5',[\s\S]{0,80}lastValueVisible: false/,
  'MA5 last-value tag is hidden',
);
assert.match(
  source,
  /title: 'MA20',[\s\S]{0,80}lastValueVisible: false/,
  'MA20 last-value tag is hidden',
);
assert.match(
  source,
  /toUpperCase\(\)\.replace\(\/\[\^0-9A-Z\]\/g, ''\)/,
  'alphanumeric KRX short codes must survive normalization',
);
assert.match(source, /PriceScaleMode\.Logarithmic/, 'price pane stays on a log scale');

const daily = [
  { t: '2025-12-29', o: 10, h: 12, l: 8, c: 10, v: 100 },
  { t: '2025-12-30', o: 10, h: 13, l: 9, c: 12, v: 150 },
  { t: '2026-01-02', o: 12, h: 15, l: 11, c: 14, v: 200 },
  { t: '2026-01-05', o: 14, h: 16, l: 13, c: 15, v: 250 },
];
const weekly = indicators.aggregateWeeklyBars(daily);
assert.equal(weekly.length, 2, 'ISO weekly aggregation count');
assert.deepEqual(
  JSON.parse(JSON.stringify(weekly[0])),
  { t: '2026-01-02', o: 10, h: 15, l: 8, c: 14, v: 450, live: false, closeOnly: false },
  'weekly OHLCV aggregation',
);

const closeOnlyBars = indicators.normalizeBars([
  { t: '2026-07-22', o: null, h: null, l: null, c: 30000, v: null },
  // Suspended sessions arrive as 0 placeholders and must never plunge a candle.
  { t: '2026-07-31', o: 0, h: 0, l: 0, c: 28000, v: 0 },
  { t: '2026-08-07', o: 27000, h: 27500, l: 26000, c: 27250, v: 1200 },
]);
assert.equal(
  closeOnlyBars.map((bar) => bar.closeOnly).join(','),
  'true,true,false',
  'null and zero OHLC bars are both flagged as close-only',
);
assert.equal(
  closeOnlyBars.map((bar) => `${bar.o}/${bar.h}/${bar.l}`).join(' '),
  '30000/30000/30000 28000/28000/28000 27000/27500/26000',
  'zero placeholders fall back to the carried close',
);
const shortPanel = indicators.buildPanelData(closeOnlyBars, '5y', 'daily');
assert.equal(shortPanel.barCount, 3, 'short history keeps every available bar');
assert.equal(shortPanel.candles.length, 1, 'only full-OHLC bars become candles');
assert.equal(shortPanel.closeLine.length, 3, 'close-only history falls back to a line');
assert.equal(shortPanel.ma5Line.length, 0, 'MA5 is skipped while fewer than five bars exist');
assert.equal(shortPanel.ma20Line.length, 0, 'MA20 is skipped while fewer than twenty bars exist');
assert.equal(shortPanel.ma50Line.length, 0, 'indicators are skipped while data is insufficient');

const fullPanel = indicators.buildPanelData(
  indicators.normalizeBars(daily),
  '5y',
  'daily',
);
assert.equal(fullPanel.closeLine.length, 0, 'complete OHLC history renders candles only');
assert.equal(fullPanel.ma5Line.length, 0, 'four bars are insufficient for MA5');

const maPanelBars = [];
for (let i = 0; i < 20; i++) {
  maPanelBars.push({
    t: `2026-02-${String(i + 1).padStart(2, '0')}`,
    o: i + 1,
    h: i + 2,
    l: i,
    c: i + 1,
    v: 100,
  });
}
const maPanel = indicators.buildPanelData(indicators.normalizeBars(maPanelBars), '5y', 'daily');
assert.equal(maPanel.ma5Line.length, 16, 'MA5 starts on the fifth bar');
assert.equal(maPanel.ma20Line.length, 1, 'MA20 starts on the twentieth bar');
assert.equal(maPanel.byTime['2026-02-20'].ma5, 18, 'MA5 crosshair value');
assert.equal(maPanel.byTime['2026-02-20'].ma20, 10.5, 'MA20 crosshair value');

const atrBars = [];
for (let i = 0; i < 11; i++) {
  atrBars.push({
    t: `2026-01-${String(i + 1).padStart(2, '0')}`,
    o: 10 + i,
    h: 12 + i,
    l: 8 + i,
    c: 10 + i,
    v: 100,
  });
}
const atr = indicators.atrPercent(atrBars, 3, 9);
assert.equal(atr.value[0], null, 'ATR warmup bar 1');
assert.equal(atr.value[1], null, 'ATR warmup bar 2');
assert.ok(Math.abs(atr.value[2] - (4 / 12) * 100) < 1e-9, 'ATR3 / close calculation');
assert.equal(atr.signal[9], null, 'ATR EMA9 warmup');
assert.ok(Number.isFinite(atr.signal[10]), 'ATR EMA9 first value');

assert.equal(normalizeOhlcRange('3y'), '3y');
assert.equal(normalizeOhlcRange('5y'), '5y');
assert.equal(ohlcFetchLimit('3y'), 1655, '3Y covers weekly 156+125+50 weeks');
assert.equal(ohlcFetchLimit('5y'), 2175, '5Y covers weekly 260+125+50 weeks');
assert.equal(ohlcFetchLimit('1y'), 1135, '1Y covers weekly 52+125+50 weeks');

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const parsed = new URL(url);
  const offset = Number(parsed.searchParams.get('offset') || 0);
  const limit = Number(parsed.searchParams.get('limit') || 0);
  const available = Math.max(0, 2175 - offset);
  const count = Math.min(limit, available);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const n = 2175 - (offset + i);
    rows.push({
      trade_date: `2020-01-${String((n % 28) + 1).padStart(2, '0')}`,
      open: n,
      high: n + 1,
      low: n - 1,
      close: n,
      volume: n * 10,
    });
  }
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
try {
  const payload = await fetchTickerOhlcBars(
    { url: 'https://example.supabase.co', anonKey: 'test' },
    '005930',
    '5y',
  );
  assert.equal(requests.length, 3, '5Y+warmup PostgREST pagination');
  assert.equal(payload.bars.length, 2175, '5Y returns display+weekly-warmup bars');
  assert.match(requests[0], /limit=1000&offset=0/);
  assert.match(requests[1], /limit=1000&offset=1000/);
  assert.match(requests[2], /limit=175&offset=2000/);
} finally {
  globalThis.fetch = originalFetch;
}

{
  const bars = [{ t: '2026-08-19', o: 1, h: 2, l: 1, c: 1500000, v: 10 }];
  const afterHours = indicators.applyLiveQuoteToBars(
    bars,
    {
      asOf: '2026-08-20T06:30:00.000Z',
      regularSession: false,
      items: { '000660': { last: 1691000, prevClose: 1500000 } },
    },
    '000660',
  );
  assert.equal(afterHours.live, true, 'after-hours append when quotes date is newer');
  assert.equal(afterHours.bars.length, 2);
  assert.equal(afterHours.bars[1].t, '2026-08-20');
  assert.equal(afterHours.bars[1].c, 1691000);
  assert.equal(afterHours.bars[1].closeOnly, true);

  const settledSameDay = indicators.applyLiveQuoteToBars(
    [
      ...bars,
      { t: '2026-08-20', o: 1510, h: 1700, l: 1500, c: 1691000, v: 99 },
    ],
    {
      asOf: '2026-08-20T06:30:00.000Z',
      regularSession: false,
      items: { '000660': { last: 1691000, prevClose: 1500000 } },
    },
    '000660',
  );
  assert.equal(settledSameDay.live, false, 'do not overwrite settled same-day OHLC after close');
  assert.equal(settledSameDay.bars[1].o, 1510);

  const livePatch = indicators.applyLiveQuoteToBars(
    [{ t: '2026-08-20', o: 1500, h: 1600, l: 1490, c: 1550, v: 1 }],
    {
      asOf: '2026-08-20T02:00:00.000Z',
      regularSession: true,
      items: { '000660': { last: 1691000, prevClose: 1500000 } },
    },
    '000660',
  );
  assert.equal(livePatch.live, true);
  assert.equal(livePatch.bars[0].c, 1691000);
  assert.equal(livePatch.bars[0].h, 1691000);
}

console.log('verify:candle OK — weekly OHLCV, ATR%, 3Y/5Y weekly-warmup pagination');
