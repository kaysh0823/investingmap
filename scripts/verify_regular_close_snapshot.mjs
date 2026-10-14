import assert from 'node:assert/strict';
import { parseRegularClose, regularCloseRow, fetchRegularClose } from '../functions/lib/naver_regular_close.mjs';
import { storedRegularCloseDate } from '../functions/lib/session_price_policy.mjs';
import { loadReturnSource } from '../functions/lib/hub_returns_source.mjs';
import { computeStockReturns } from '../functions/lib/returns_core.mjs';
import { toSupabaseRow } from './sync_quotes_to_supabase.mjs';

const fixture = `[['날짜', '시가', '고가', '저가', '종가', '거래량'],
 ["20261013",241500,244000,228000,234000,26790913],
 ["20261014",233500,241500,230000,234500,17382089]]`;
const bar = parseRegularClose(fixture, '20261014');
assert.equal(bar.close, 234500);
assert.equal(bar.prevClose, 234000);
assert.equal(parseRegularClose(fixture, '20261015'), null);
assert.equal(parseRegularClose('["20261014",1,1,1,1,1]', '20261014'), null);
assert.equal(await fetchRegularClose('005930', new Date('2026-10-14T10:00:00+09:00'), () => { throw new Error('must not fetch an incomplete candle'); }), null);
const row = regularCloseRow('005930', bar);
const normalized = { last: row.last, prevClose: row.prev_close, asOf: row.as_of, regularSession: true, tradeDd: '20261014' };
assert.equal(storedRegularCloseDate(normalized), '20261014');
assert.equal(storedRegularCloseDate({ ...normalized, regularSession: false }), null);
assert.equal(storedRegularCloseDate({ ...normalized, asOf: '2026-10-14T16:00:00+09:00' }), null);
const refs = { recentDd: '20261012', tradingDates: ['20261008', '20261012'], quotes: { '005930': { closes: [260000, 250500], shares: 1000 } } };
const krxHistory = { extraTradeDates: ['20261013'], prevByTicker: new Map([['005930', { tradeDate: '20261013', close: 232000 }]]), adjByTicker: new Map(), closeByTicker: new Map() };
for (const when of ['2026-10-14T20:00:00+09:00', '2026-10-15T08:00:00+09:00', '2026-10-17T12:00:00+09:00']) {
  const source = await loadReturnSource({ env: {}, tickers: ['005930'], refs, quoteRows: [row], now: new Date(when), krxHistory });
  assert.equal(source.meta.anchorDd, '20261014', when);
  assert.equal(source.meta.provisional, false, when);
  assert.equal(source.byTicker['005930'].last, 234500, when);
  assert.equal(source.byTicker['005930'].prevClose1d, 234000, 'paired previous candle, not stale refs/history');
  assert.equal(computeStockReturns({ ...source.byTicker['005930'], k: source.meta.k }).chg1dPct, 0.21);
}
const metadataOnly = toSupabaseRow('005930', { overMarket: true, last: 999999, prevClose: 1 }, {}, '2026-10-14T15:30:00+09:00', false, true);
for (const key of ['last', 'prev_close', 'as_of', 'regular_session']) assert.equal(Object.hasOwn(metadataOnly, key), false, `preserve stored ${key}`);

const originalFetch = globalThis.fetch;
let fallbackSelectedSession = false;
try {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('select=ticker,last,prev_close,as_of,trade_date')) return new Response('{}', { status: 400 });
    if (requestUrl.includes('select=ticker,last,prev_close,as_of,regular_session')) fallbackSelectedSession = true;
    return Response.json([row]);
  };
  const source = await loadReturnSource({ env: { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test' }, refs, tickers: ['005930'], now: new Date('2026-10-14T20:00:00+09:00'), krxHistory });
  assert.equal(fallbackSelectedSession, true, 'legacy schema keeps regular-session provenance');
  assert.equal(source.byTicker['005930'].numerator1d, 234500);
} finally { globalThis.fetch = originalFetch; }
console.log('regular-close snapshot: final price and paired 1D survive close, next pre-open, weekend and metadata-only sync');
