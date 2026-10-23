import assert from 'node:assert/strict';
import { parseRegularClose, regularCloseRow, fetchRegularClose } from '../functions/lib/naver_regular_close.mjs';
import { storedRegularCloseDate } from '../functions/lib/session_price_policy.mjs';
import { loadReturnSource, buildDataVersion } from '../functions/lib/hub_returns_source.mjs';
import { computeStockReturns } from '../functions/lib/returns_core.mjs';
import { toSupabaseRow } from './sync_quotes_to_supabase.mjs';

const fixture = { stockExchangeType: 'KRX', tradeBaseAt: '20261014', lastTradeBaseAt: '20261013', lastClosePrice: 232000, openPrice: 233500,
  priceInfos: [
    {localDateTime:'20261014090000',currentPrice:234000,highPrice:234000,lowPrice:233000,accumulatedTradingVolume:451684},
    {localDateTime:'20261014151900',currentPrice:234000,highPrice:234000,lowPrice:233500,accumulatedTradingVolume:14277772},
    {localDateTime:'20261014153000',currentPrice:232000,highPrice:232000,lowPrice:232000,accumulatedTradingVolume:16861143},
    {localDateTime:'20261014195900',currentPrice:234500,highPrice:234500,lowPrice:233500,accumulatedTradingVolume:17382089},
  ] };
const bar = parseRegularClose(fixture, '20261014');
assert.equal(bar.close, 232000, '15:30 auction, not 15:19 or 19:59');
assert.equal(bar.prevClose, 232000, 'regular previous close, not previous daily after-hours close');
assert.equal(bar.volume, 16861143, 'regular volume excludes after-hours');
assert.equal(parseRegularClose({...fixture, stockExchangeType: 'NXT'}, '20261014'), null);
assert.equal(parseRegularClose({...fixture, priceInfos: fixture.priceInfos.filter((p) => !p.localDateTime.endsWith('153000'))}, '20261014'), null, 'no closing auction: do not substitute intraday or after-hours');
const hynix = parseRegularClose({...fixture, lastClosePrice:1443000, priceInfos:[{localDateTime:'20261014153000',currentPrice:1419000,highPrice:1419000,lowPrice:1419000,accumulatedTradingVolume:3445627},{localDateTime:'20261014195900',currentPrice:1425000,highPrice:1425000,lowPrice:1423000,accumulatedTradingVolume:3562353}]}, '20261014');
assert.equal(Math.round((hynix.close / hynix.prevClose - 1) * 10000) / 100, -1.66);
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
  assert.equal(source.byTicker['005930'].last, 232000, when);
  assert.equal(source.byTicker['005930'].prevClose1d, 232000, 'paired regular previous close');
  assert.equal(computeStockReturns({ ...source.byTicker['005930'], k: source.meta.k }).chg1dPct, 0);
}
const metadataOnly = toSupabaseRow('005930', { overMarket: true, last: 999999, prevClose: 1 }, {}, '2026-10-14T15:30:00+09:00', false, true);
// Same-day refs must not supersede a frozen auction quote with an after-hours tip.
const sameDayRefs = { recentDd: '20261014', tradingDates: ['20261013', '20261014'],
  quotes: { '005930': { closes: [232000, 234500], shares: 1000 } } };
const sameDaySource = await loadReturnSource({ env: {}, tickers: ['005930'], refs: sameDayRefs,
  quoteRows: [row], now: new Date('2026-10-14T21:00:00+09:00'), krxHistory });
assert.equal(sameDaySource.byTicker['005930'].last, 232000, 'same-day refs cannot replace closing auction');
assert.equal(sameDaySource.byTicker['005930'].numerator1d, 232000);
assert.equal(sameDaySource.byTicker['005930'].prevClose1d, 232000);
assert.equal(computeStockReturns({ ...sameDaySource.byTicker['005930'], k: 0 }).chg1dPct, 0);
assert.notEqual(
  buildDataVersion({ ...sameDayRefs, builtAt: '2026-10-14', asOf: '2026-10-14T11:00:00Z' }, row.as_of),
  buildDataVersion({ ...sameDayRefs, builtAt: '2026-10-14', asOf: '2026-10-14T11:30:00Z' }, row.as_of),
  'same-day refs repair must invalidate cached returns despite an unchanged auction timestamp');
const workflow = (await import('node:fs')).readFileSync(new URL('../.github/workflows/sync-quotes.yml', import.meta.url), 'utf8');
assert.ok(workflow.indexOf('Finalize regular closing candles after daily feeds') > workflow.indexOf('name: Sync hub quotes to Supabase'));
assert.ok(workflow.indexOf('Finalize regular closing candles after daily feeds') < workflow.indexOf('node scripts/build_hub_return_refs.mjs'));
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
  assert.equal(source.byTicker['005930'].numerator1d, 232000);
} finally { globalThis.fetch = originalFetch; }
console.log('regular-close snapshot: final price and paired 1D survive close, next pre-open, weekend and metadata-only sync');
