/**
 * Refs lag: k counts completed sessions after recentDd, and 1D uses the KRX
 * previous close (stock_price_history trade_date < live), not Naver prevClose.
 */
import assert from 'node:assert/strict';
import {
  extendTradingDates,
  isRefsStale,
  latestCloseBefore,
} from '../functions/lib/hub_returns_source.mjs';
import {
  aggregateSectorReturns,
  computeStockReturns,
  sessionsSince,
} from '../functions/lib/returns_core.mjs';

const refsRecentDd = '20260923';
const liveDd = '20260929';
const history = [{ tradeDate: '20260928', close: 272250 }];
const tradingDates = extendTradingDates([refsRecentDd], refsRecentDd, ['20260928']);

const k = sessionsSince(refsRecentDd, liveDd, tradingDates);
assert.equal(k, 2, `k=${k}`);
assert.equal(isRefsStale(refsRecentDd, tradingDates), true);

const prev = latestCloseBefore(history, liveDd);
assert.equal(prev?.tradeDate, '20260928');
assert.equal(prev?.close, 272250);

const last = 272250;
const stock = computeStockReturns({
  numerator: last,
  closes: [260000, 272250],
  k,
  prevClose1d: prev.close,
});
assert.equal(stock.chg1dPct, 0);

const sector = aggregateSectorReturns([{
  numerator: last,
  closes: [260000, 272250],
  k,
  shares: 1000,
  prevClose1d: prev.close,
}]);
assert.equal(sector.chg1dPct, 0);

console.log('verify:returns-stale OK — k=2 005930 prev=272250 chg1d=0.00');
