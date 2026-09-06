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
  setTimeout,
  clearTimeout,
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
assert.equal(paneKeys.join(','), 'price,vol,macd,investor,norm,atr', 'pane order');
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
  /panes\[i\]\.setStretchFactor\(paneStretch\(spec\)\)/,
  'pane heights come from the stretch factors',
);
assert.match(
  source,
  /panes\[i\]\.priceScale\('right'\)\.applyOptions\(scaleOptions\)/,
  'each pane keeps its own right price scale',
);
assert.match(source, /rightOffset: RIGHT_OFFSET_BARS/, 'right margin retained');
assert.deepEqual(
  Array.from(indicators.priceMaPeriods('daily')),
  [5, 20, 50, 120],
  'daily price MA periods',
);
assert.deepEqual(
  Array.from(indicators.priceMaPeriods('weekly')),
  [4, 13, 26, 52],
  'weekly price MA periods are 4/13/26/52',
);
assert.equal(indicators.DISP_MA_PERIOD, 50, 'disparity keeps a fixed 50-bar SMA');
assert.equal(indicators.maLabel(13), 'MA13', 'MA labels are period-dynamic');
assert.ok(source.includes('function maLabel(period)'), 'maLabel helper exists');
assert.ok(source.includes('title: maLabel(maPeriods[0])'), 'fast MA series title is dynamic');
assert.ok(source.includes('title: maLabel(maPeriods[1])'), 'second MA series title is dynamic');
assert.ok(source.includes('title: maLabel(maPeriods[2])'), 'third MA series title is dynamic');
assert.ok(source.includes('title: maLabel(maPeriods[3])'), 'slow MA series title is dynamic');
assert.deepEqual(
  Array.from(indicators.PRICE_MA_SPECS.map((s) => s.color)),
  ['#ff7b72', '#3fb950', '#e3b341', '#58a6ff'],
  'price MA color order unchanged',
);
for (const dataKey of ['ma5Line', 'ma20Line', 'ma50Line', 'maLine']) {
  assert.ok(source.includes(`setData(data.${dataKey})`), `${dataKey} receives calculated data`);
}
assert.match(
  source,
  /PRICE_MA_SPECS\[0\]\.color[\s\S]{0,120}lastValueVisible: !PRICE_MA_SPECS\[0\]\.hideLast/,
  'fast MA last-value tag is hidden via hideLast',
);
assert.match(
  source,
  /PRICE_MA_SPECS\[1\]\.color[\s\S]{0,120}lastValueVisible: !PRICE_MA_SPECS\[1\]\.hideLast/,
  'second MA last-value tag is hidden via hideLast',
);
for (const key of ['ma5', 'ma20', 'ma50', 'ma120']) {
  assert.ok(source.includes(`fmtPrice(b.${key})`), `${key} appears in the crosshair header`);
}
assert.ok(source.includes('maLabel(periods[0])'), 'crosshair uses dynamic MA labels');
assert.ok(!/\bma5: 'MA5'/.test(source), 'i18n no longer hardcodes MA5');
assert.ok(!/\bma20: 'MA20'/.test(source), 'i18n no longer hardcodes MA20');
assert.ok(!/\bma50: 'MA50'/.test(source), 'i18n no longer hardcodes MA50');
assert.ok(!/\bma120: 'MA120'/.test(source), 'i18n no longer hardcodes MA120');
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
assert.deepEqual(Array.from(maPanel.maPeriods), [5, 20, 50, 120], 'daily panel exposes MA periods');
assert.equal(maPanel.ma5Line.length, 16, 'MA5 starts on the fifth bar');
assert.equal(maPanel.ma20Line.length, 1, 'MA20 starts on the twentieth bar');
assert.equal(maPanel.byTime['2026-02-20'].ma5, 18, 'MA5 crosshair value');
assert.equal(maPanel.byTime['2026-02-20'].ma20, 10.5, 'MA20 crosshair value');

const investorBars = [];
for (let i = 0; i < 30; i++) {
  const base = i >= 20 ? i : null;
  investorBars.push({
    t: `2026-02-${String(i + 1).padStart(2, '0')}`,
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: 1000,
    instOsc_5_20: base != null ? 30 + i : null,
    instOsc_10_20: base != null ? 40 + i : null,
    instOsc_20_20: base != null ? 50 + i : null,
    instOsc_5_50: base != null ? 28 + i : null,
    instOsc_10_50: base != null ? 38 + i : null,
    instOsc_20_50: base != null ? 48 + i : null,
    frgnOsc_5_20: base != null ? 20 + i : null,
    frgnOsc_10_20: base != null ? 30 + i : null,
    frgnOsc_20_20: base != null ? 40 + i : null,
    frgnOsc_5_50: base != null ? 18 + i : null,
    frgnOsc_10_50: base != null ? 28 + i : null,
    frgnOsc_20_50: base != null ? 38 + i : null,
    instOsc5: base != null ? 30 + i : null,
    instOsc10: base != null ? 40 + i : null,
    instOsc20: base != null ? 50 + i : null,
    frgnOsc5: base != null ? 20 + i : null,
    frgnOsc10: base != null ? 30 + i : null,
    frgnOsc20: base != null ? 40 + i : null,
    instOsc: base != null ? 40 + i : null,
    frgnOsc: base != null ? 30 + i : null,
    foreignRatio: base != null ? 45 + (i % 10) : null,
  });
}
const investorPanel10 = indicators.buildPanelData(
  indicators.normalizeBars(investorBars),
  '1y',
  'daily',
  10,
  20,
);
const investorPanel5 = indicators.buildPanelData(
  indicators.normalizeBars(investorBars),
  '1y',
  'daily',
  5,
  20,
);
const investorPanel10p50 = indicators.buildPanelData(
  indicators.normalizeBars(investorBars),
  '1y',
  'daily',
  10,
  50,
);
assert.equal(investorPanel10.instOscLine.length, 10, 'daily investor instOsc10 lines skip null warmup');
assert.equal(investorPanel5.instOscLine.length, 10, 'daily investor instOsc5 lines skip null warmup');
assert.equal(investorPanel10.foreignRatioBars.length, 10, 'daily foreignRatio histogram bars on OSC pane');
assert.equal(
  investorPanel10.byTime['2026-02-21'].foreignRatio,
  45,
  'foreignRatio in crosshair byTime',
);
assert.equal(
  investorPanel10.foreignRatioBars[0].color,
  'rgba(126,231,135,0.28)',
  'foreignRatio bar uses translucent green',
);
assert.notEqual(
  investorPanel5.instOscLine[9].value,
  investorPanel10.instOscLine[9].value,
  '5d vs 10d toggle uses different fields',
);
assert.notEqual(
  investorPanel10.instOscLine[9].value,
  investorPanel10p50.instOscLine[9].value,
  '20 vs 50 period toggle uses different fields',
);
assert.equal(investorPanel10.byTime['2026-02-21'].instOsc_10_20, 60, 'instOsc_10_20 in crosshair byTime');
assert.equal(investorPanel10p50.byTime['2026-02-21'].instOsc_10_50, 58, 'instOsc_10_50 in crosshair byTime');
assert.equal(
  ui.buildInvestorOscLinesFromByTime(investorPanel10.byTime, 20, 20).instOscLine.length,
  10,
  'byTime rebuild for 20d cum / 20 period',
);
assert.match(source, /im-candle-inv-cum/, 'investor cum toggle markup');
assert.match(source, /im-candle-inv-period/, 'investor period toggle markup');
assert.match(source, /im_inv_period/, 'investor period localStorage key');
assert.ok(
  source.includes("wrap.hidden = state.interval === 'weekly'"),
  'investor toggles hidden on weekly',
);
assert.match(
  source,
  /state\.interval = interval;\s*state\.range = rangeForInterval\(interval\);[\s\S]*?syncPaneLabels\(\);/,
  'interval switch syncs pane labels after state.interval is set',
);
assert.equal(ui.paneStretch({ key: 'investor', stretch: 16 }, 'daily'), 16, 'investor pane stretch on daily');
assert.equal(ui.paneStretch({ key: 'investor', stretch: 16 }, 'weekly'), 16, 'investor pane stretch on weekly');
assert.match(source, /WEEKLY_INVESTOR_CUM = 4/, 'weekly fixed cum 4');
assert.match(source, /WEEKLY_INVESTOR_PERIOD = 13/, 'weekly fixed period 13');
assert.match(source, /HistogramSeries/, 'foreignRatio uses histogram series');
assert.match(source, /rgba\(126,231,135,0\.28\)/, 'foreignRatio translucent green');

const weeklyInvestorBars = [];
for (let i = 0; i < 30; i++) {
  const base = i >= 13 ? i : null;
  weeklyInvestorBars.push({
    t: `2026-02-${String(i + 1).padStart(2, '0')}`,
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: 1000,
    instOsc_4_13: base != null ? 55 + i : null,
    frgnOsc_4_13: base != null ? 45 + i : null,
    instOsc: base != null ? 55 + i : null,
    frgnOsc: base != null ? 45 + i : null,
    foreignRatio: base != null ? 48 + (i % 5) : null,
  });
}
const weeklyInvestorPanel = indicators.buildPanelData(
  indicators.normalizeBars(weeklyInvestorBars),
  '5y',
  'weekly',
  10,
  20,
);
assert.equal(
  weeklyInvestorPanel.instOscLine.length,
  17,
  'weekly investor OSC uses fixed 4/13 (ignores daily toggle args)',
);
assert.equal(
  weeklyInvestorPanel.foreignRatioBars.length,
  17,
  'weekly foreignRatio histogram bars',
);
assert.equal(
  weeklyInvestorPanel.byTime['2026-02-21'].instOsc_4_13,
  75,
  'weekly crosshair keeps instOsc_4_13',
);
assert.equal(
  weeklyInvestorPanel.byTime['2026-02-21'].instOsc,
  75,
  'weekly instOsc aliases 4/13',
);
assert.equal(
  weeklyInvestorPanel.byTime['2026-02-21'].foreignRatio,
  48,
  'weekly foreignRatio in crosshair',
);
assert.match(source, /paneInvestorUnitWeek/, 'weekly investor unit label');
assert.ok(
  source.includes('WEEKLY_INVESTOR_CUM') && source.includes('paneInvestorUnitWeek'),
  'weekly pane label uses week unit and fixed 4/13',
);

const weeklyMaBars = [];
for (let i = 0; i < 52; i++) {
  const d = new Date(Date.UTC(2025, 0, 3 + i * 7));
  weeklyMaBars.push({
    t: d.toISOString().slice(0, 10),
    o: i + 1,
    h: i + 2,
    l: i,
    c: i + 1,
    v: 100,
  });
}
const weeklyMaPanel = indicators.buildPanelData(
  indicators.normalizeBars(weeklyMaBars),
  '5y',
  'weekly',
);
assert.deepEqual(
  Array.from(weeklyMaPanel.maPeriods),
  [4, 13, 26, 52],
  '주봉 전환 시 MA 4/13/26/52',
);
assert.equal(weeklyMaPanel.ma5Line.length, 49, 'weekly MA4 starts on the 4th bar');
assert.equal(weeklyMaPanel.ma20Line.length, 40, 'weekly MA13 starts on the 13th bar');
assert.equal(weeklyMaPanel.ma50Line.length, 27, 'weekly MA26 starts on the 26th bar');
assert.equal(weeklyMaPanel.maLine.length, 1, 'weekly MA52 starts on the 52nd bar');
assert.equal(
  weeklyMaPanel.byTime[weeklyMaBars[51].t].ma5,
  (49 + 50 + 51 + 52) / 4,
  'weekly MA4 crosshair uses 4-bar SMA',
);

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
  if (!String(url).includes('stock_price_history')) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
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
  const historyRequests = requests.filter((u) => u.includes('stock_price_history'));
  assert.equal(historyRequests.length, 3, '5Y+warmup PostgREST pagination');
  assert.equal(payload.bars.length, 2175, '5Y returns display+weekly-warmup bars');
  assert.equal(payload.interval, 'daily', 'default interval is daily');
  assert.ok('instOsc10' in payload.bars[0], 'daily bars include instOsc10');
  assert.ok('frgnOsc10' in payload.bars[0], 'daily bars include frgnOsc10');
  assert.ok('instOsc_10_20' in payload.bars[0], 'daily bars include instOsc_10_20');
  assert.ok('instOsc_10_50' in payload.bars[0], 'daily bars include instOsc_10_50');
  assert.ok('foreignRatio' in payload.bars[0], 'daily bars include foreignRatio');
  assert.match(historyRequests[0], /limit=1000&offset=0/);
  assert.match(historyRequests[1], /limit=1000&offset=1000/);
  assert.match(historyRequests[2], /limit=175&offset=2000/);

  requests.length = 0;
  const weeklyPayload = await fetchTickerOhlcBars(
    { url: 'https://example.supabase.co', anonKey: 'test' },
    '005930',
    '5y',
    { interval: 'weekly' },
  );
  assert.equal(weeklyPayload.interval, 'weekly', 'weekly interval flag');
  assert.ok(weeklyPayload.bars.length > 0, 'weekly bars returned');
  assert.ok(weeklyPayload.bars.length < 2175, 'weekly aggregates below daily count');
  assert.ok('instOsc_4_13' in weeklyPayload.bars[0], 'weekly bars include investor OSC 4/13');
  assert.ok('foreignRatio' in weeklyPayload.bars[0], 'weekly bars include foreignRatio');
  assert.equal(weeklyPayload.bars[0].instOsc_10_20, null, 'weekly does not keep daily 10/20 grid');
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
  assert.equal(afterHours.live, false, 'after-hours close-only is not live session');
  assert.equal(afterHours.bars.length, 2);
  assert.equal(afterHours.bars[1].t, '2026-08-20');
  assert.equal(afterHours.bars[1].c, 1691000);
  assert.equal(afterHours.bars[1].closeOnly, true);
  assert.equal(afterHours.liveTime, null);

  const afterHoursOhlcv = indicators.applyLiveQuoteToBars(
    bars,
    {
      asOf: '2026-08-20T06:30:00.000Z',
      regularSession: false,
      items: {
        '000660': {
          last: 1691000,
          prevClose: 1500000,
          open: 1598000,
          high: 1721000,
          low: 1576000,
          volume: 9397942,
        },
      },
    },
    '000660',
  );
  assert.equal(afterHoursOhlcv.live, false, 'after-hours OHLCV append is not live session');
  assert.equal(afterHoursOhlcv.bars[1].o, 1598000);
  assert.equal(afterHoursOhlcv.bars[1].h, 1721000);
  assert.equal(afterHoursOhlcv.bars[1].l, 1576000);
  assert.equal(afterHoursOhlcv.bars[1].v, 9397942);
  assert.equal(afterHoursOhlcv.bars[1].closeOnly, undefined);

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

// Modal expand / collapse assertions
assert.ok(source.includes('.im-candle-dialog.im-candle-expanded'), 'must have .im-candle-expanded dialog CSS');
assert.ok(source.includes('id="im-candle-expand"'), 'must have #im-candle-expand button in modal header');
assert.ok(source.includes("expand: '확대'"), 'ko expand translation');
assert.ok(source.includes("collapse: '축소'"), 'ko collapse translation');
assert.ok(source.includes("expand: 'Expand'"), 'en expand translation');
assert.ok(source.includes("collapse: 'Restore'"), 'en collapse translation');
assert.ok(typeof ui.setExpanded === 'function', 'setExpanded must be exposed in _ui');
assert.ok(typeof ui.isExpanded === 'function', 'isExpanded must be exposed in _ui');
assert.equal(ui.isExpanded(), false, 'isExpanded starts false');
ui.setExpanded(true);
assert.equal(ui.isExpanded(), true, 'isExpanded becomes true after setExpanded(true)');
ui.setExpanded(false);
assert.equal(ui.isExpanded(), false, 'isExpanded reverts to false');

// Verify map files have bumped to v=32
const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];
for (const rel of MAP_FILES) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.ok(html.includes('candle_modal.js?v=32'), `${rel} must reference candle_modal.js?v=32`);
}

assert.ok(source.includes("priceScaleId: 'fr'"), 'foreignRatio uses overlay scale fr');
assert.ok(source.includes('im-candle-hovertip'), 'floating hover tip element');
assert.ok(source.includes('updateHoverTip'), 'updateHoverTip helper');

console.log('verify:candle OK — weekly OHLCV, ATR%, 3Y/5Y weekly-warmup pagination, modal expand/collapse, fr auto-scale + hover tip (v=32)');
