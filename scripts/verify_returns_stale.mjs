/**
 * Refs lag: k counts completed sessions after recentDd.
 * 1D uses the Naver reference (prev_close) and the regular-session price,
 * not stock_price_history.
 */
import assert from 'node:assert/strict';
import {
  extendTradingDates,
  isRefsStale,
  loadReturnSource,
} from '../functions/lib/hub_returns_source.mjs';
import {
  aggregateSectorReturns,
  computeStockReturns,
  roundPct,
  sessionsSince,
} from '../functions/lib/returns_core.mjs';

const refsRecentDd = '20260923';
const liveDd = '20260929';
const tradingDates = extendTradingDates([refsRecentDd], refsRecentDd, ['20260928']);

const k = sessionsSince(refsRecentDd, liveDd, tradingDates);
assert.equal(k, 2, `k=${k}`);
assert.equal(isRefsStale(refsRecentDd, tradingDates), true);

// Press: 005930 prev 270000 / close 272500 → +0.93
const samsung = computeStockReturns({
  numerator: 272500,
  closes: [260000, 272250],
  k,
  prevClose1d: 270000,
});
assert.equal(samsung.chg1dPct, 0.93);

// Press: 036930 prev 209000 / close 222000 → +6.22
const ju = computeStockReturns({
  numerator: 222000,
  closes: [200000, 209000],
  k,
  prevClose1d: 209000,
});
assert.equal(ju.chg1dPct, 6.22);

const sectorSamsung = aggregateSectorReturns([{
  numerator: 272500,
  closes: [260000, 272250],
  k,
  shares: 1000,
  prevClose1d: 270000,
}]);
assert.equal(sectorSamsung.chg1dPct, 0.93);

const sectorJu = aggregateSectorReturns([{
  numerator: 222000,
  closes: [200000, 209000],
  k,
  shares: 1000,
  prevClose1d: 209000,
}]);
assert.equal(sectorJu.chg1dPct, 6.22);

// Official mode (k=0, refs tip = anchor). Contaminated history must not become 1D.
{
  const anchor = '20260929';
  const now = new Date('2026-09-29T18:00:00+09:00');
  const samsungCloses = [100, 110, 120, 130, 140, 272250];
  const source = await loadReturnSource({
    env: {},
    tickers: ['005930', '036930', '000660'],
    refs: {
      recentDd: anchor,
      tradingDates: ['20260928', anchor],
      quotes: {
        '005930': { closes: samsungCloses, shares: 1000 },
        '036930': { closes: [200000, 200000], shares: 1000 },
        '000660': { closes: [100, 150], shares: 1000 },
      },
    },
    quoteRows: [
      {
        ticker: '005930',
        last: 272500,
        prev_close: 270000,
        sessionClose: 270000,
        prevCloseFromMobile: 270000,
        trade_date: '2026-09-29',
        as_of: '2026-09-29T15:30:00+09:00',
      },
      {
        ticker: '036930',
        last: 222000,
        prev_close: 209000,
        trade_date: '20260929',
        as_of: '2026-09-29T15:30:00+09:00',
      },
      {
        ticker: '000660',
        last: 999,
        prev_close: 100,
        trade_date: '2026-09-28',
        as_of: '2026-09-28T15:30:00+09:00',
      },
    ],
    now,
    krxHistory: { extraTradeDates: [] },
  });
  assert.equal(source.meta.numeratorMode, 'official');
  assert.equal(source.meta.k, 0);
  assert.equal(source.meta.anchorDd, anchor);

  const offSamsung = source.byTicker['005930'];
  assert.equal(offSamsung.numerator, 272250);
  assert.equal(offSamsung.numerator1d, 272500);
  assert.equal(offSamsung.prevClose1d, 270000);
  const offSamsungRet = computeStockReturns({
    numerator: offSamsung.numerator,
    closes: offSamsung.closes,
    k: 0,
    prevClose1d: offSamsung.prevClose1d,
    numerator1d: offSamsung.numerator1d,
  });
  assert.equal(offSamsungRet.chg1dPct, 0.93);
  assert.equal(offSamsungRet.ret5dPct, roundPct(272250 / 100 - 1));

  const offJu = source.byTicker['036930'];
  const offJuRet = computeStockReturns({
    numerator: offJu.numerator,
    closes: offJu.closes,
    k: 0,
    prevClose1d: offJu.prevClose1d,
    numerator1d: offJu.numerator1d,
  });
  assert.equal(offJuRet.chg1dPct, 6.22);

  assert.equal(source.byTicker['000660'].numerator1d, null);
  const sector = aggregateSectorReturns(
    ['005930', '036930', '000660'].map((t) => {
      const src = source.byTicker[t];
      return {
        numerator: src.numerator,
        numerator1d: src.numerator1d,
        prevClose1d: src.prevClose1d,
        closes: src.closes,
        k: 0,
        shares: src.shares,
      };
    }),
  );
  assert.equal(sector.chg1dPct, 3.24);
}

console.log('verify:returns-stale OK — k=2 and official 005930 +0.93 036930 +6.22');
