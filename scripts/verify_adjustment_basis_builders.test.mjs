import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdjustmentEvents, cumulativeAdjustmentRatio, applyPriceAdjustmentsToBars } from '../functions/lib/price_adjustments.mjs';
import { buildAdjustedCloseRefRow } from '../functions/lib/krx_rs_from_history.mjs';
import { reconcileReturnRefs, adjustmentStateFromRows } from '../functions/lib/return_adjustment_basis.mjs';
import { buildOfficialSectorReturnsFromRefs } from '../functions/lib/hub_returns_source.mjs';
import { buildReturnRefQuote } from './build_hub_return_refs.mjs';
import { applyTickerOhlcAdjustments, fetchOhlcQuoteBasis } from '../functions/lib/ticker_ohlc.mjs';
import { rebaseMemberPoints } from '../functions/lib/sector_perf_calendar.mjs';

// Importing the CLI above must remain inert. No test calls a network-backed builder.
globalThis.fetch = () => { throw new Error('Network forbidden in offline basis tests'); };
const event = { effective_date: '2026-04-02', ratio: 2 };
const dates = ['2026-04-01', '2026-04-02', '2026-04-03'];
const points = [{ t: dates[0], c: 100, m: 1000 }, { t: dates[1], c: 50, m: 1000 }, { t: dates[2], c: 55, m: 1100 }];

test('explicit anchor excludes future events, including same-day boundary', () => {
  assert.equal(cumulativeAdjustmentRatio(dates[0], [event], dates[0]), 1);
  assert.equal(cumulativeAdjustmentRatio(dates[0], [event], dates[1]), 2);
  assert.equal(cumulativeAdjustmentRatio(dates[1], [event], dates[1]), 1);
  assert.equal(cumulativeAdjustmentRatio(dates[0], [event]), 2, 'legacy unbounded call remains compatible');
  const bars = [{ t: dates[0], o: 90, h: 110, l: 80, c: 100, v: 10 }];
  applyPriceAdjustmentsToBars(bars, [event], dates[0]);
  assert.equal(bars[0].c, 100);
  applyPriceAdjustmentsToBars(bars, [event, { ...event, ratio: '2' }], dates[1]);
  assert.deepEqual(bars[0], { t: dates[0], o: 45, h: 55, l: 40, c: 50, v: 20 });
});

test('conflicts and invalid ratios fail before any mutation; future conflicts do not apply', () => {
  const conflict = [event, { ...event, ratio: 3 }];
  const bars = [{ t: dates[0], c: 100 }];
  assert.throws(() => applyPriceAdjustmentsToBars(bars, conflict, dates[1]), /Conflicting/);
  assert.equal(bars[0].c, 100);
  assert.deepEqual(normalizeAdjustmentEvents(conflict, dates[0]), []);
  for (const ratio of [0, -1, NaN, Infinity]) {
    assert.throws(() => normalizeAdjustmentEvents([{ ...event, ratio }], dates[1]), /Invalid/);
  }
  assert.throws(() => normalizeAdjustmentEvents([], '2026-02-30'), /Invalid/);
});

test('new close refs record bounded deduplicated events and same-date raw share inputs', () => {
  const future = { effective_date: '2026-04-04', ratio: 5 };
  const row = buildAdjustedCloseRefRow(points, [event, event, future], dates, 3);
  assert.deepEqual(row.closes, [50, 50, 55]);
  assert.deepEqual(row.adjustmentBasis, { version: 1, throughDate: dates[2], events: [event] });
  assert.equal(row.rawClose, 55);
  assert.equal(row.sharesBasisDate, dates[2]);
  assert.equal(buildReturnRefQuote(row, null, dates[2]).shares, 20);
  const pre = buildAdjustedCloseRefRow(points, [event], [dates[0]], 1);
  assert.deepEqual(pre.closes, [100]);
  assert.deepEqual(pre.adjustmentBasis.events, []);
});

test('share fallback uses raw close, never adjusted or forward-filled close', () => {
  const row = { closes: [10], mcap: 1000, rawClose: 100, sharesBasisDate: dates[0], adjustmentBasis: { version: 1, throughDate: dates[0], events: [] } };
  assert.equal(buildReturnRefQuote(row, null, dates[0]).shares, 10);
  assert.equal(buildReturnRefQuote(row, { mcap_won: 9000 }, dates[0]).shares, 10, 'no cross-source mcap/close mixing');
  const gap = buildAdjustedCloseRefRow(points.slice(0, 1), [event], dates, 3);
  assert.deepEqual(gap.closes, [50, 50, 50]);
  assert.equal(gap.rawClose, null);
  assert.equal(buildReturnRefQuote(gap, null, dates[2]).shares, 20, 'matched prior raw pair rolls to anchor basis');
  const fromOhlc = buildReturnRefQuote(gap, { list_shrs: 20 }, dates[2]);
  assert.equal(fromOhlc.shares, 20);
  assert.equal(fromOhlc.sharesBasisDate, dates[2]);
});

test('sector calendar ignores events beyond final valuation date, preventing rounding distortion', () => {
  const closes = [{ t: '2025-12-31', c: 11 }, { t: '2026-01-02', c: 12 }];
  assert.deepEqual(rebaseMemberPoints(closes, [{ effective_date: '2026-02-01', ratio: 10 }], '2026-01-01', '2026-12-31'),
    rebaseMemberPoints(closes, [], '2026-01-01', '2026-12-31'));
});


test('OHLC uses live/afterClose session basis but stored official basis before open', () => {
  const events = [
    { effective_date: '2026-11-04', ratio: 0.2 },
    { effective_date: '2026-11-05', ratio: 2 },
  ];
  const stored = [{ t: '2026-11-02', c: 100 }, { t: '2026-11-03', c: 110 }];
  for (const time of ['09:00', '12:00', '15:30', '18:00']) {
    const bars = structuredClone(stored);
    const basis = applyTickerOhlcAdjustments(bars, events, new Date(`2026-11-04T${time}:00+09:00`));
    assert.deepEqual(bars.map((bar) => bar.c), [500, 550], time);
    assert.equal(basis.throughDate, '2026-11-04');
    assert.deepEqual(basis.events, [events[0]], 'tomorrow excluded');
  }
  const preOpen = structuredClone(stored);
  const basis = applyTickerOhlcAdjustments(preOpen, events, new Date('2026-11-04T08:59:00+09:00'));
  assert.deepEqual(preOpen, stored);
  assert.equal(basis.throughDate, '2026-11-03');
  assert.deepEqual(basis.events, []);
});

test('OHLC official anchor ignores future stored dates on weekends', () => {
  const bars = [{ t: '2026-11-06', c: 100 }, { t: '2026-11-09', c: 20 }];
  const basis = applyTickerOhlcAdjustments(bars, [{ effective_date: '2026-11-09', ratio: 5 }],
    new Date('2026-11-07T12:00:00+09:00'));
  assert.equal(basis.throughDate, '2026-11-06');
  assert.equal(bars[0].c, 100);
  assert.deepEqual(basis.events, []);
});


test('OHLC official phase follows a verified newer closing pair before open and on weekends', () => {
  const events = [{ effective_date: '2026-11-04', ratio: 0.2 }];
  const quote = { last: 550, prevClose: 500, asOf: '2026-11-04T15:30:00+09:00', regularSession: true };
  for (const now of ['2026-11-05T08:00:00+09:00', '2026-11-07T12:00:00+09:00']) {
    const bars = [{ t: '2026-11-03', c: 100 }];
    const basis = applyTickerOhlcAdjustments(bars, events, new Date(now), quote);
    assert.equal(basis.throughDate, '2026-11-04');
    assert.equal(bars[0].c, 500);
  }
});

test('OHLC rejects future, afterhour, intraday, non-pair, and subsecond closing quotes', () => {
  const quote = { last: 550, prevClose: 500, asOf: '2026-11-04T15:30:00+09:00', regularSession: true };
  const invalid = [
    { ...quote, asOf: '2026-11-05T15:30:00+09:00' },
    { ...quote, asOf: '2026-11-04T16:00:00+09:00' },
    { ...quote, asOf: '2026-11-04T15:29:00+09:00' },
    { ...quote, asOf: '2026-11-04T15:30:00.001+09:00' },
    { ...quote, prevClose: null },
    { ...quote, regularSession: false },
    { ...quote, tradeDd: '20261103' },
  ];
  for (const row of invalid) {
    const bars = [{ t: '2026-11-03', c: 100 }];
    const basis = applyTickerOhlcAdjustments(bars, [{ effective_date: '2026-11-04', ratio: 0.2 }],
      new Date('2026-11-05T08:00:00+09:00'), row);
    assert.equal(basis.throughDate, '2026-11-03', JSON.stringify(row));
    assert.equal(bars[0].c, 100);
  }
});


test('persisted OHLC quote basis lookup reads once and maps only a verified closing pair', async () => {
  const blockedFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(new URL(url).hostname, 'offline.invalid');
    assert.match(url, /stock_quotes_latest\?ticker=eq.005930/);
    assert.match(url, /select=last,prev_close,as_of,regular_session/);
    assert.equal(options.method, undefined, 'GET only');
    return new Response(JSON.stringify([{ last: 550, prev_close: 500,
      as_of: '2026-11-04T15:30:00+09:00', regular_session: true }]));
  };
  try {
    const quote = await fetchOhlcQuoteBasis({ url: 'https://offline.invalid', anonKey: 'offline' }, '005930',
      new Date('2026-11-05T08:00:00+09:00'));
    assert.equal(calls, 1);
    assert.equal(quote.quoteDate, '2026-11-04');
    assert.equal(quote.prevClose, 500);
    assert.equal(quote.regularSession, true);
  } finally {
    globalThis.fetch = blockedFetch;
  }
});


test('Unison missing anchor mcap retains matched prior raw shares on current basis exactly once', async () => {
  const dates = ['2026-11-03', '2026-11-04'];
  const events = [{ effective_date: '2026-11-04', ratio: 0.2 }];
  const row = buildAdjustedCloseRefRow([
    { t: dates[0], c: 1044, m: 304756208388 },
    { t: dates[1], c: 5000, m: null },
    { t: '2026-11-05', c: 1, m: 999999 },
  ], events, dates, 2);
  assert.equal(row.rawClose, 5000);
  assert.equal(row.mcap, null, 'anchor mcap remains missing');
  assert.deepEqual(row.rawShareObservation, { date: dates[0], close: 1044, mcap: 304756208388 });
  const quote = buildReturnRefQuote(row, null, dates[1]);
  assert.equal(quote.shares, 58382415);
  assert.equal(quote.sharesBasisDate, dates[1]);
  assert.deepEqual(quote.closes, [5220, 5000]);
  const refs = { recentDd: '20261104', tradingDates: ['20261103', '20261104'], quotes: { '018000': quote } };
  const state = adjustmentStateFromRows(events.map((e) => ({ ticker: '018000', ...e })), dates[1]);
  const normalized = await reconcileReturnRefs(refs, ['018000'], dates[1], state);
  assert.equal(normalized.quotes['018000'].shares, 58382415, 'same event never applied twice');
  const sectors = buildOfficialSectorReturnsFromRefs({ sectors: { powergrid: { companies: [{ ticker: '018000' }] } } }, refs);
  assert.equal(sectors.missingShares, 0);
  assert.ok(sectors.sectors.powergrid, 'static sector builder consumes populated shares');
  assert.equal(buildReturnRefQuote(row, { list_shrs: 77 }, dates[1]).shares, 77, 'current KRX shares preferred unchanged');
  assert.equal(buildReturnRefQuote(row, { mcap_won: 500000, close: 5000 }, dates[1]).shares, 100, 'current KRX pair preferred unchanged');
});


test('prior raw share fallback applies only strictly later events through the anchor', () => {
  const dates = ['2026-11-03', '2026-11-04'];
  const row = buildAdjustedCloseRefRow([{ t: dates[0], c: 100, m: 1000 }, { t: dates[1], c: 110, m: null }], [
    { effective_date: '2026-11-03', ratio: 2 },
    { effective_date: '2026-11-05', ratio: 5 },
  ], dates, 2);
  const quote = buildReturnRefQuote(row, null, dates[1]);
  assert.equal(quote.shares, 10, 'observation already reflects same-day event and future event excluded');
  assert.equal(quote.sharesBasisDate, dates[1]);
  const missing = buildAdjustedCloseRefRow([{ t: dates[0], c: 100, m: null }, { t: dates[1], c: 110, m: null }], [], dates, 2);
  assert.equal(buildReturnRefQuote(missing, null, dates[1]).shares, null, 'no matched raw pair does not invent shares');
});
