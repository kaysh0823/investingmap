import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { candleCodes, loadVolatilityCandles } from '../functions/lib/volatility_candles.mjs';

assert.deepEqual(candleCodes('005930,0015g0,005930,bad,x)&secret=yes'), ['0015G0', '005930']);
assert.throws(() => candleCodes(Array.from({ length: 41 }, (_, i) => String(i).padStart(6, '0')).join(',')));
const dates = Array.from({ length: 21 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
const codes = Array.from({ length: 40 }, (_, i) => String(i).padStart(6, '0'));
const queries = [];
const data = await loadVolatilityCandles({}, codes, async (_, query) => {
  queries.push(query);
  if (query.includes('ticker=eq.005930')) return dates.slice().reverse().map(trade_date => ({ trade_date }));
  if (query.startsWith('price_adjustments')) return [{ ticker: codes[0], effective_date: dates[20], ratio: 2 }];
  return codes.flatMap((ticker, index) => index === 39 ? [] : dates.filter((_, i) => !(index === 1 && i === 19)).map(trade_date => ({
    ticker, trade_date, open: 100, high: 120, low: 90, close: 110, volume: 100,
  })));
});
assert.equal(queries.length, 3, 'one calendar + bulk history + bulk adjustments only');
assert.ok(!queries.some(q => /investor|credit|foreign/.test(q)));
assert.equal(Object.keys(data.tickers).length, 40);
assert.equal(data.tickers[codes[0]].bars.length, 21);
assert.equal(data.tickers[codes[0]].bars[0].c, 55, 'preserve split-adjusted comparison');
assert.equal(data.tickers[codes[0]].bars[20].c, 110);
assert.equal(data.tickers[codes[1]].bars[19].c, null, 'missing session must not shift the horizon');
assert.equal(data.tickers[codes[39]].status, 'no_history');
assert.equal(data.tickers[codes[39]].bars.every(bar => bar.c === null), true);
await assert.rejects(loadVolatilityCandles({}, ['005930'], async () => { throw new Error('offline'); }));

const source = fs.readFileSync(new URL('../js/map_volatility_candles.js', import.meta.url), 'utf8').replace('_test: {', '_test: { enqueue: function(codes) { volatilityQueue.push.apply(volatilityQueue, codes); pumpVolatility(); }, cache: function() { return volatilityCache; }, active: function() { return volatilityActive; }, restore: restoreCandleCache,');
function client(fetcher, stored = {}) {
  const saved = new Map(Object.entries(stored));
  const sandbox = { AbortController, console,
    setTimeout: (fn, delay) => setTimeout(fn, delay >= 20000 ? delay : 0), clearTimeout,
    fetch: fetcher,
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { api: sandbox.InvestingMapVolatilityCandles._test, saved };
}
async function idle(api) {
  for (let i = 0; i < 300 && api.active(); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(api.active(), 0);
}
let calls = 0, active = 0, maxActive = 0;
const batch = client(async url => {
  calls++; active++; maxActive = Math.max(maxActive, active);
  await new Promise(resolve => setTimeout(resolve, 2)); active--;
  const requested = new URL(url, 'https://test').searchParams.get('codes').split(',');
  return { ok: true, json: async () => ({ tickers: Object.fromEntries(requested.map(code => [code, { bars: [{ t: dates[20], o: 100, h: 120, l: 90, c: 110 }], status: 'ok' }])) }) };
});
batch.api.enqueue(Array.from({ length: 89 }, (_, i) => String(i).padStart(6, '0')));
await idle(batch.api);
assert.equal(calls, 3, '89 companies should need three batch requests, not 89 full-history requests');
assert.equal(maxActive, 3);
assert.equal(Object.keys(batch.api.cache()).length, 89);
assert.ok(batch.saved.has('im_volatility_bars_v1'));
let attempts = 0;
const retry = client(async () => ({ ok: ++attempts > 1, json: async () => ({ tickers: { '005930': { bars: [], status: 'no_history' } } }) }));
retry.api.enqueue(['005930']); await idle(retry.api); assert.equal(attempts, 2);
const savedBars = [{ t: dates[20], o: 100, h: 120, l: 90, c: 110 }];
const failed = client(async () => { throw new Error('network'); }, { im_volatility_bars_v1: JSON.stringify({ '005930': { bars: savedBars, time: Date.now() - 400000, status: 'ok' } }) });
failed.api.restore(); failed.api.enqueue(['005930']); await idle(failed.api);
assert.equal(failed.api.cache()['005930'].failed, true);
assert.equal(failed.api.cache()['005930'].bars[0].c, 110, 'network failure must preserve saved candles');
console.log('Volatility batch API/client: bounded bulk queries, adjustments, missing sessions, three requests for 89 stocks, retries and saved-data preservation passed.');
