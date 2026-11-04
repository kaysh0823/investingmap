import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { onRequest as quotesApi } from '../functions/api/quotes.js';
import { onRequest as sectorsApi } from '../functions/api/hub_sectors.js';
import { buildSectorReturnCaptureRows } from '../functions/lib/sector_return_captures.mjs';
import { parseNaverBasicQuote, mergeNaverIntoQuote, fetchNaverQuote } from '../functions/lib/naver_sise_quotes.mjs';
import { regularQuotePair, naverRegularQuotePair } from '../functions/lib/regular_quote_pair.mjs';
import { loadReturnSource, adjustedKrxClose, buildDataVersion } from '../functions/lib/hub_returns_source.mjs';
import { computeStockReturns, aggregateSectorReturns } from '../functions/lib/returns_core.mjs';
import { stockReturnFieldsFromRefs, toSupabaseRow } from './sync_quotes_to_supabase.mjs';

// This suite never contacts a provider, database, or production endpoint.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Unexpected network access in offline fixture suite'); };
test.after(() => { globalThis.fetch = originalFetch; });
const now = new Date('2026-11-04T14:36:00+09:00');
const ticker = '012345'; // Synthetic identifier: production logic has no symbol exception.
function rawBasic(overrides = {}) {
  return { closePrice: '4,930', compareToPreviousClosePrice: '290',
    compareToPreviousPrice: { code: '5', name: 'FALLING' }, fluctuationsRatio: '-5.56',
    marketStatus: 'OPEN', marketSessionType: 'regularMarket',
    localTradedAt: '2026-11-04T14:35:00+09:00', ...overrides };
}
function basic(overrides = {}) { return parseNaverBasicQuote(rawBasic(overrides)); }
const closes = Array.from({ length: 220 }, (_, i) => 800 + i);
closes[closes.length - 1] = 1044;
const refs = { recentDd: '20261103', tradingDates: ['20261102', '20261103'],
  quotes: { [ticker]: { closes, shares: 100 } } };
const history = { extraTradeDates: [], prevByTicker: new Map(), adjByTicker: new Map(), closeByTicker: new Map() };
const row = () => toSupabaseRow(ticker, basic(), {}, now.toISOString(), true, false, null, 1044);
const source = (rows = [row()], options = {}) => loadReturnSource({ env: {}, refs, tickers: [ticker],
  quoteRows: rows, now, krxHistory: history, ...options });
const returns = (s) => computeStockReturns({ ...s.byTicker[ticker], k: s.meta.k });

test('daily base is reconstructed from signed amount, not rounded percentage', () => {
  const q = basic();
  assert.equal(q.prevClose, 5220);
  assert.equal(q.regularQuote.prevClose, 5220);
  assert.equal(naverRegularQuotePair(q, '20261104', now).last, 4930);
  assert.equal(basic({ closePrice: '110', compareToPreviousClosePrice: '10',
    compareToPreviousPrice: { code: '2', name: 'RISING' }, fluctuationsRatio: '10.00' }).prevClose, 100);
  assert.equal(basic({ closePrice: '100', compareToPreviousClosePrice: '0',
    compareToPreviousPrice: { code: '3', name: 'UNCHANGED' }, fluctuationsRatio: '0.00' }).prevClose, 100);
});

test('current refs: API, sync and persistence use 4930 / 5220 = -5.56', async () => {
  assert.equal(Math.round((4930 / 1044 - 1) * 10000) / 100, 372.22);
  const rf = stockReturnFieldsFromRefs(ticker, basic(), refs, true, null, now);
  const persisted = toSupabaseRow(ticker, basic(), {}, now.toISOString(), true, false, rf, 1044);
  assert.equal(persisted.prev_close, 5220);
  assert.equal(persisted.as_of, '2026-11-04T05:35:00.000Z');
  assert.equal(persisted.chg_1d_pct, -5.56);
  assert.equal(rf.chg_1d_pct, -5.56);
  const s = await source([persisted]);
  assert.equal(s.byTicker[ticker].prevClose1d, 5220);
  assert.equal(returns(s).chg1dPct, -5.56);
  const members = [{ ...s.byTicker[ticker], k: s.meta.k }];
  assert.equal(aggregateSectorReturns(members).chg1dPct, -5.56);
  assert.equal(aggregateSectorReturns(members, 'equal').chg1dPct, -5.56);
});

test('stale refs and stale history do not override the same-session base', async () => {
  const s = await source(undefined, { refs: { ...refs, recentDd: '20261102', tradingDates: ['20261102'] },
    krxHistory: { ...history, extraTradeDates: ['20261103'],
      prevByTicker: new Map([[ticker, { tradeDate: '20261103', close: 1044 }]]) } });
  assert.equal(s.meta.refsStale, true);
  assert.equal(returns(s).chg1dPct, -5.56);
});

test('1D choice leaves all 5D through 200D math and history untouched', async () => {
  const before = JSON.stringify(refs);
  const s = await source();
  const actual = returns(s);
  const expected = computeStockReturns({ numerator: 4930, closes, k: 1 });
  for (const n of [5, 20, 50, 120, 200]) assert.equal(actual[`ret${n}dPct`], expected[`ret${n}dPct`]);
  assert.equal(JSON.stringify(refs), before);
});

test('missing baseline is null 1D, not raw pre-consolidation history', async () => {
  const s = await source([{ ...row(), prev_close: null }]);
  assert.equal(returns(s).chg1dPct, null);
  assert.notEqual(returns(s).ret5dPct, null);
  const noBase = basic({ compareToPreviousClosePrice: undefined });
  assert.equal(noBase.regularQuote, null);
  const merged = mergeNaverIntoQuote({ last: 1044, prevClose: 1044 }, noBase, { preferNaverLast: true });
  assert.equal(merged.prevClose, 1044, 'untrusted metadata may remain for display');
  assert.equal(naverRegularQuotePair(merged, '20261104', now), null, 'must not form a mixed-source pair');
  assert.equal(stockReturnFieldsFromRefs(ticker, merged, refs, true, null, now).chg_1d_pct, null);
  const skipped = toSupabaseRow(ticker, merged, {}, now.toISOString(), true, false, null, 1044);
  for (const key of ['last', 'prev_close', 'as_of', 'regular_session']) assert.equal(Object.hasOwn(skipped, key), false);
});

test('stale, future, wrong-session and malformed persisted pairs fail closed', async () => {
  const cases = [
    { as_of: '2026-11-03T14:35:00+09:00' },
    { as_of: '2026-11-04T14:20:00+09:00' },
    { as_of: '2026-11-04T14:37:00+09:00' },
    { as_of: '2026-11-04T08:59:00+09:00' },
    { as_of: '2026-11-04T14:35:00' },
    { as_of: 'invalid' }, { regular_session: false }, { regular_session: null },
    { trade_date: '2026-11-03' }, { prev_close: 0 }, { prev_close: -1 },
    { prev_close: Infinity }, { prev_close: NaN }, { last: 0 },
  ];
  for (const change of cases) assert.equal(returns(await source([{ ...row(), ...change }])).chg1dPct, null, JSON.stringify(change));
});

test('NXT, pre/after-market, unknown direction and inconsistent basic responses cannot supply base', () => {
  for (const changes of [
    { marketStatus: 'CLOSE', marketSessionType: 'afterMarket' },
    { marketStatus: 'CLOSE', marketSessionType: 'preMarket' },
    { marketStatus: undefined },
    { localTradedAt: undefined }, { localTradedAt: '2026-11-04T08:55:00+09:00' },
    { localTradedAt: '2026-11-04T16:00:00+09:00' },
    { compareToPreviousPrice: {} }, { fluctuationsRatio: '12.34' },
    { closePrice: '0' }, { compareToPreviousClosePrice: undefined },
  ]) assert.equal(basic(changes).regularQuote, null, JSON.stringify(changes));
  assert.equal(naverRegularQuotePair(basic({ localTradedAt: '2026-11-04T14:37:00+09:00' }), '20261104', now), null);
});

test('cache merge keeps an atomic pair, and replacing price invalidates it', () => {
  const q = basic();
  const cached = mergeNaverIntoQuote({}, JSON.parse(JSON.stringify(q)), { preferNaverLast: true });
  assert.equal(naverRegularQuotePair(cached, '20261104', now).prevClose, 5220);
  const replaced = mergeNaverIntoQuote(cached, { last: 5000, prevClose: 1044 }, { preferNaverLast: true });
  assert.equal(replaced.regularQuote, null);
});

test('stale refresh never relabels stale source as fresh; good refresh keeps provider time and new version', async () => {
  const staleRow = { ...row(), as_of: '2026-11-04T13:00:00+09:00' };
  for (const q of [basic({ localTradedAt: '2026-11-03T14:35:00+09:00' }),
    basic({ localTradedAt: '2026-11-04T13:00:00+09:00' }), { last: 4930, prevClose: 5220, tradeDate: '2026-11-04' }]) {
    const s = await source([staleRow], { staleRefresh: async () => ({ items: { [ticker]: q } }) });
    assert.equal(returns(s).chg1dPct, null);
    assert.equal(s.meta.asOf, staleRow.as_of);
  }
  const s = await source([staleRow], { staleRefresh: async () => ({ items: { [ticker]: basic() } }) });
  assert.equal(returns(s).chg1dPct, -5.56);
  assert.equal(s.meta.asOf, basic().regularQuote.asOf);
  assert.notEqual(s.meta.dataVersion, buildDataVersion(refs, staleRow.as_of, now));
});

test('share ratios divide prices; effective-date bound prevents future adjustment', () => {
  const reverse = { effective_date: '2026-11-04', ratio: 0.2 };
  assert.equal(adjustedKrxClose(1044, '20261103', [reverse], '20261104'), 5220);
  assert.equal(adjustedKrxClose(1044, '20261103', [{ ...reverse, ratio: 2 }], '20261104'), 522);
  assert.equal(adjustedKrxClose(1044, '20261103', [reverse], '20261103'), 1044);
  assert.equal(adjustedKrxClose(1044, '20261104', [reverse], '20261104'), 1044);
  assert.equal(adjustedKrxClose(1044, '20261103', [{ ...reverse, ratio: 0 }], '20261104'), null);
});

test('closing auction and next pre-open retain the paired regular daily base', async () => {
  const closed = { ...row(), last: 4930, as_of: '2026-11-04T15:30:00+09:00' };
  for (const at of ['2026-11-04T18:00:00+09:00', '2026-11-05T08:00:00+09:00', '2026-11-07T12:00:00+09:00']) {
    const s = await source([closed], { now: new Date(at) });
    assert.equal(returns(s).chg1dPct, -5.56, at);
    assert.equal(s.byTicker[ticker].last, 4930);
  }
});

test('runtime and server body caches invalidate old logic without changing workflows', () => {
  const root = new URL('../', import.meta.url);
  assert.match(fs.readFileSync(new URL('functions/lib/returns_cache_headers.mjs', root), 'utf8'), /L10-historical-adjustment-basis/);
  for (const [file, version] of [['hub_sectors.js', 'v30'], ['hub_trend.js', 'v26'], ['hub_sector_trend.js', 'v13']])
    assert.ok(fs.readFileSync(new URL(`functions/api/${file}`, root), 'utf8').includes(`/cache/${version}`));
});

test('upper/lower-limit direction codes preserve signed amount and daily base', () => {
  for (const [code, name, last, pct] of [['1', 'UPPER_LIMIT', 130, 30], ['4', 'LOWER_LIMIT', 70, -30]]) {
    const q = basic({ closePrice: String(last), compareToPreviousClosePrice: '30',
      compareToPreviousPrice: { code, name }, fluctuationsRatio: String(pct) });
    assert.equal(q.regularQuote?.prevClose, 100);
  }
});

test('official history arriving before auction snapshot still uses the paired base', async () => {
  const s = await source([{ ...row(), as_of: '2026-11-04T15:29:00+09:00' }], {
    now: new Date('2026-11-04T16:00:00+09:00'),
    krxHistory: { ...history, closeByTicker: new Map([[ticker, { tradeDate: '20261104', close: 4930 }]]) },
  });
  assert.equal(returns(s).chg1dPct, -5.56);
  assert.equal(s.byTicker[ticker].prevClose1d, 5220);
});

test('freshness boundary changes shared data version without falsifying provider asOf', async () => {
  const before = await source(undefined, { now: new Date('2026-11-04T14:49:00+09:00') });
  const after = await source(undefined, { now: new Date('2026-11-04T14:51:00+09:00') });
  assert.equal(returns(before).chg1dPct, -5.56);
  assert.equal(returns(after).chg1dPct, null);
  assert.notEqual(before.meta.dataVersion, after.meta.dataVersion);
  assert.equal(before.meta.asOf, after.meta.asOf);
});

test('actual quote/sector APIs and capture rows agree; refreshed public prevClose is corrected too', async () => {
  const realFetch = globalThis.fetch;
  const RealDate = globalThis.Date;
  const index = { sectors: { renewable: { companies: [{ ticker, mcapWon: 493000 }] } } };
  let stored = row();
  let providerCalls = 0;
  const env = { SUPABASE_URL: 'https://db.invalid', SUPABASE_ANON_KEY: 'fixture',
    ASSETS: { fetch: async (req) => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('hub_return_refs.json')) return Response.json(refs);
      if (path.endsWith('hub_index.json')) return Response.json(index);
      if (path.endsWith('hub_rs_snapshot.json')) return Response.json({ quotes: {} });
      throw new Error(`Unexpected asset ${path}`);
    } } };
  try {
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now.toISOString()])); }
      static now() { return now.getTime(); }
    };
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url || String(input));
      if (url.hostname === 'db.invalid') {
        if (url.pathname.endsWith('stock_quotes_latest')) return Response.json([stored]);
        if (url.pathname.endsWith('stock_price_history') || url.pathname.endsWith('market_index_daily') || url.pathname.endsWith('price_adjustments')) return Response.json([]);
      }
      if (url.hostname === 'm.stock.naver.com' && url.pathname.endsWith(`/${ticker}/basic`)) {
        providerCalls += 1;
        return Response.json(rawBasic());
      }
      if (url.hostname === 'm.stock.naver.com' && url.pathname.endsWith(`/${ticker}/integration`)) return Response.json({ totalInfos: [{ code: 'lastClosePrice', value: '1044' }] });
      if (url.hostname === 'finance.naver.com' && url.pathname === '/item/sise.naver') return new Response('<strong id="_nowVal">4,930</strong><th>전일가</th><td>1,044</td>');
      throw new Error(`Unexpected network target ${url}`);
    };
    const q = await quotesApi({ env, request: new Request(`https://site.invalid/api/quotes?codes=${ticker}`) });
    assert.equal(q.status, 200);
    const qb = await q.json();
    assert.equal(qb.items[ticker].chg1dPct, -5.56);
    assert.equal(qb.items[ticker].prevClose, 5220);
    const card = await sectorsApi({ env, request: new Request('https://site.invalid/api/hub_sectors?horizon=1d&nocache=1'), waitUntil() {} });
    assert.equal(card.status, 200);
    assert.equal((await card.json()).sectors.renewable.return1dPct, -5.56);
    const s = await source();
    assert.deepEqual(buildSectorReturnCaptureRows(index, s, now.toISOString(), '2026-11-04').map((x) => x.ret_1d_pct), [-5.56, -5.56]);
    assert.equal(providerCalls, 0, 'happy path adds no provider request');
    stored = { ...stored, prev_close: 1044, as_of: '2026-11-04T13:00:00+09:00' };
    const refreshed = await quotesApi({ env, request: new Request(`https://site.invalid/api/quotes?codes=${ticker}`) });
    assert.equal(refreshed.status, 200);
    const rb = await refreshed.json();
    assert.equal(rb.items[ticker].chg1dPct, -5.56);
    assert.equal(rb.items[ticker].prevClose, 5220);
    assert.equal(rb.items[ticker].last, 4930);
    assert.equal(providerCalls, 1);
  } finally { globalThis.fetch = realFetch; globalThis.Date = RealDate; }
});

test('same-day refs advancement keeps verified daily base without replacing the official price', async () => {
  const sameDay = { recentDd: '20261104', tradingDates: ['20261103', '20261104'],
    quotes: { [ticker]: { closes: [1044, 4900], shares: 100 } } };
  const at = new Date('2026-11-04T18:00:00+09:00');
  const s = await source([row()], { refs: sameDay, now: at });
  assert.equal(s.byTicker[ticker].numerator1d, 4900);
  assert.equal(s.byTicker[ticker].prevClose1d, 5220);
  assert.equal(returns(s).chg1dPct, -6.13);
  assert.equal(stockReturnFieldsFromRefs(ticker, basic(), sameDay, false, null, at).chg_1d_pct, -6.13);
});
