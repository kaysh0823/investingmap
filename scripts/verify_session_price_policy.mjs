/**
 * Clock-injected session price policy.
 * Live uses the Naver regular price. After the close, NXT closePrice is ignored.
 */
import assert from 'node:assert/strict';
import { roundPct } from '../functions/lib/returns_core.mjs';
import {
  pricePhase,
  resolveSessionQuote,
  trustedRegularLast,
} from '../functions/lib/session_price_policy.mjs';
import { parseNaverBasicQuote } from '../functions/lib/naver_sise_quotes.mjs';
import { loadReturnSource } from '../functions/lib/hub_returns_source.mjs';
import {
  RETURNS_LOGIC_VERSION,
  maybeNotModified,
  returnsResponseHeaders,
} from '../functions/lib/returns_cache_headers.mjs';

function at(dash, hh, mm) {
  return new Date(
    `${dash}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`,
  );
}

const cowayPrev = 99300;
const cowayKrx = 101600;
const cowayNxt = 102400;
const semcoPrev = 1561000;
const semcoKrx = 1581000;
const semcoNxt = 1577000;

assert.equal(pricePhase(at('2026-10-02', 10, 0)), 'live');
assert.equal(pricePhase(at('2026-10-02', 15, 29)), 'live');
assert.equal(pricePhase(at('2026-10-02', 15, 30)), 'afterClose');
assert.equal(pricePhase(at('2026-10-02', 15, 35)), 'afterClose');
assert.equal(pricePhase(at('2026-10-02', 8, 30)), 'official');
assert.equal(pricePhase(at('2026-10-03', 10, 0)), 'official');
assert.equal(pricePhase(at('2026-10-04', 12, 0)), 'official');

// Trading day 10:00 → Naver current / KRX previous close.
{
  const q = resolveSessionQuote({
    phase: pricePhase(at('2026-10-02', 10, 0)),
    refsTipClose: cowayPrev,
    refsPrevClose: 99400,
    naverKrxLast: 100000,
    lastRegularLast: 99000,
    krxClose: null,
  });
  assert.equal(q.numeratorMode, 'live');
  assert.equal(q.provisional, false);
  assert.equal(q.displayLast, 100000);
  assert.equal(q.numerator1d, 100000);
  assert.equal(q.prevClose1d, cowayPrev);
  assert.equal(roundPct(q.numerator1d / q.prevClose1d - 1), roundPct(100000 / cowayPrev - 1));
}

// 15:35, no KRX row → last pre-15:30 price, provisional, not NXT.
{
  const today = '20261002';
  const row = {
    last: cowayNxt,
    tradeDd: today,
    asOf: '2026-10-02T15:35:00+09:00',
    regularSession: false,
  };
  assert.equal(trustedRegularLast(row, today), null);
  const kept = trustedRegularLast({
    last: 101200,
    tradeDd: today,
    asOf: '2026-10-02T15:29:00+09:00',
  }, today);
  assert.equal(kept, 101200);
  const q = resolveSessionQuote({
    phase: 'afterClose',
    refsTipClose: cowayPrev,
    naverKrxLast: cowayNxt,
    lastRegularLast: kept,
    krxClose: null,
  });
  assert.equal(q.provisional, true);
  assert.equal(q.displayLast, 101200);
  assert.notEqual(q.displayLast, cowayNxt);
  assert.equal(q.prevClose1d, cowayPrev);
}

// 16:00 with mdcstat row → KRX close, NXT ignored.
{
  const q = resolveSessionQuote({
    phase: 'afterClose',
    krxClose: semcoKrx,
    refsTipClose: semcoPrev,
    naverKrxLast: semcoNxt,
    lastRegularLast: 1570000,
  });
  assert.equal(q.provisional, false);
  assert.equal(q.displayLast, semcoKrx);
  assert.equal(q.numerator1d, semcoKrx);
  assert.equal(q.prevClose1d, semcoPrev);
  assert.equal(roundPct(q.numerator1d / q.prevClose1d - 1), 1.28);
}

// 19:00 Naver basic.last is the aftermarket print.
{
  const parsed = parseNaverBasicQuote({
    closePrice: '1,577,000',
    compareToPreviousClosePrice: '16,000',
    compareToPreviousPrice: { code: '2', name: 'RISING' },
    fluctuationsRatio: '1.02',
    marketStatus: 'CLOSE',
    marketSessionType: 'afterMarket',
    localTradedAt: '2026-10-02T20:20:24+09:00',
    overMarketPriceInfo: { tradingSessionType: 'AFTER_MARKET', overPrice: '1,577,000' },
  });
  assert.equal(parsed.overMarket, true);
  assert.equal(parsed.last, null);
  assert.equal(parsed.nxtLast, 1577000);
  const q = resolveSessionQuote({
    phase: pricePhase(at('2026-10-02', 19, 0)),
    krxClose: semcoKrx,
    refsTipClose: semcoPrev,
    naverKrxLast: parsed.krxLast,
  });
  assert.equal(q.displayLast, semcoKrx);
  assert.notEqual(q.displayLast, semcoNxt);
}

// 08:30 premarket, Saturday, and 2026-10-03 holiday → previous KRX close.
for (const stamp of ['2026-10-02T08:30', '2026-10-03T11:00', '2026-10-04T11:00']) {
  const [d, hm] = stamp.split('T');
  const [hh, mm] = hm.split(':').map(Number);
  const q = resolveSessionQuote({
    phase: pricePhase(at(d, hh, mm)),
    refsTipClose: cowayKrx,
    refsPrevClose: cowayPrev,
    naverKrxLast: cowayNxt,
    krxClose: null,
  });
  assert.equal(q.numeratorMode, 'official', stamp);
  assert.equal(q.displayLast, cowayKrx, stamp);
  assert.equal(q.numerator1d, cowayKrx, stamp);
  assert.equal(q.prevClose1d, cowayPrev, stamp);
  assert.equal(roundPct(q.numerator1d / q.prevClose1d - 1), 2.32, stamp);
}

// 10/02 close regression through loadReturnSource (weekend clock, refs tip = that close).
{
  const now = at('2026-10-04', 14, 0);
  const source = await loadReturnSource({
    env: {},
    tickers: ['021240', '009150'],
    now,
    refs: {
      recentDd: '20261002',
      tradingDates: ['20261001', '20261002'],
      quotes: {
        '021240': { closes: [99400, cowayPrev, cowayKrx], shares: 100 },
        '009150': { closes: [1513000, semcoPrev, semcoKrx], shares: 100 },
      },
    },
    quoteRows: [
      {
        ticker: '021240',
        last: cowayNxt,
        prev_close: cowayPrev,
        trade_date: '2026-10-02',
        as_of: '2026-10-02T20:20:00+09:00',
      },
      {
        ticker: '009150',
        last: semcoNxt,
        prev_close: semcoPrev,
        trade_date: '2026-10-02',
        as_of: '2026-10-02T20:20:00+09:00',
      },
    ],
    krxHistory: { extraTradeDates: [] },
  });
  assert.equal(source.meta.numeratorMode, 'official');
  assert.equal(source.meta.provisional, false);
  assert.equal(source.byTicker['021240'].last, cowayKrx);
  assert.equal(source.byTicker['021240'].numerator1d, cowayKrx);
  assert.equal(source.byTicker['021240'].prevClose1d, cowayPrev);
  assert.equal(
    roundPct(source.byTicker['021240'].numerator1d / source.byTicker['021240'].prevClose1d - 1),
    2.32,
  );
  assert.equal(source.byTicker['009150'].last, semcoKrx);
  assert.equal(source.byTicker['009150'].numerator1d, semcoKrx);
  assert.equal(source.byTicker['009150'].prevClose1d, semcoPrev);
  assert.equal(
    roundPct(source.byTicker['009150'].numerator1d / source.byTicker['009150'].prevClose1d - 1),
    1.28,
  );
}

// 15:35 pending: provisional regular print, NXT quote ignored.
{
  const now = at('2026-10-06', 15, 35);
  const source = await loadReturnSource({
    env: {},
    tickers: ['009150'],
    now,
    refs: {
      recentDd: '20261002',
      tradingDates: ['20261001', '20261002'],
      quotes: {
        '009150': { closes: [semcoPrev, semcoKrx], shares: 10 },
      },
    },
    quoteRows: [{
      ticker: '009150',
      last: 1575000,
      trade_date: '2026-10-06',
      as_of: '2026-10-06T15:29:00+09:00',
      regular_session: false,
    }],
    krxHistory: { extraTradeDates: [], closeByTicker: new Map() },
  });
  assert.equal(source.meta.numeratorMode, 'close');
  assert.equal(source.meta.provisional, true);
  assert.equal(source.byTicker['009150'].last, 1575000);
  assert.notEqual(source.byTicker['009150'].last, semcoNxt);
  assert.equal(source.byTicker['009150'].prevClose1d, semcoKrx);
}

// 16:00 mdcstat row replaces an aftermarket last.
{
  const now = at('2026-10-06', 16, 0);
  const source = await loadReturnSource({
    env: {},
    tickers: ['009150'],
    now,
    refs: {
      recentDd: '20261002',
      tradingDates: ['20261002'],
      quotes: { '009150': { closes: [semcoPrev, semcoKrx], shares: 10 } },
    },
    quoteRows: [{
      ticker: '009150',
      last: semcoNxt,
      trade_date: '2026-10-06',
      as_of: '2026-10-06T19:00:00+09:00',
    }],
    krxHistory: {
      extraTradeDates: ['20261006'],
      closeByTicker: new Map([['009150', { tradeDate: '20261006', close: 1600000 }]]),
    },
  });
  assert.equal(source.meta.provisional, false);
  assert.equal(source.byTicker['009150'].last, 1600000);
  assert.equal(source.byTicker['009150'].numerator1d, 1600000);
  assert.equal(source.byTicker['009150'].prevClose1d, semcoKrx);
}

// A browser holding a body from the pre-policy logic (same dataVersion) must not get 304.
{
  const dataVersion = '20261002-1790922600-2026-10-02';
  const headers = returnsResponseHeaders({ dataVersion, horizon: '1d' });
  assert.ok(headers.ETag.includes(RETURNS_LOGIC_VERSION), 'ETag carries the logic version');
  const ifNoneMatch = (etag) => new Request('https://example.test/', { headers: { 'If-None-Match': etag } });
  assert.equal(maybeNotModified(ifNoneMatch(`W/"${dataVersion}:1d"`), headers), null);
  assert.equal(maybeNotModified(ifNoneMatch(headers.ETag), headers)?.status, 304);
}

console.log('verify:session-price-policy OK');
