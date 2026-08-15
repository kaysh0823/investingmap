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
assert.match(source, /scale\.width\(\)/, 'price-scale width measurement missing');
assert.match(
  source,
  /function scheduleAxisAlignment\(\)/,
  'axis re-alignment scheduler missing',
);
assert.match(
  source,
  /AXIS_ALIGN_DELAYS_MS = \[0, 150, 400\]/,
  'delayed axis re-measure passes missing',
);
for (const caller of ['createCharts', 'resizeCharts']) {
  assert.ok(
    new RegExp(`function ${caller}\\([\\s\\S]*?scheduleAxisAlignment\\(\\)`).test(source),
    `${caller} must re-align the price scales`,
  );
}
const appliedWidths = [];
const mockCharts = [84, 117, 96].map((width) => ({
  priceScale() {
    return {
      width() {
        return width;
      },
      applyOptions(options) {
        appliedWidths.push(options.minimumWidth);
      },
    };
  },
}));
ui.alignPriceScaleWidths(mockCharts);
assert.deepEqual(appliedWidths, [117, 117, 117], 'all panels use the widest price scale');

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
assert.equal(shortPanel.ma50Line.length, 0, 'indicators are skipped while data is insufficient');

const fullPanel = indicators.buildPanelData(
  indicators.normalizeBars(daily),
  '5y',
  'daily',
);
assert.equal(fullPanel.closeLine.length, 0, 'complete OHLC history renders candles only');

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
assert.equal(ohlcFetchLimit('3y'), 990);
assert.equal(ohlcFetchLimit('5y'), 1490);

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const parsed = new URL(url);
  const offset = Number(parsed.searchParams.get('offset') || 0);
  const limit = Number(parsed.searchParams.get('limit') || 0);
  const available = Math.max(0, 1250 - offset);
  const count = Math.min(limit, available);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const n = 1250 - (offset + i);
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
  assert.equal(requests.length, 2, '5Y PostgREST pagination');
  assert.equal(payload.bars.length, 1250, '5Y returns all available bars');
  assert.match(requests[0], /limit=1000&offset=0/);
  assert.match(requests[1], /limit=490&offset=1000/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('verify:candle OK — weekly OHLCV, ATR%, 3Y/5Y pagination');
