import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'https://investing-map.pages.dev';
const sectors = JSON.parse(fs.readFileSync(new URL('../data/hub_index.json', import.meta.url), 'utf8')).sectors;
const selected = process.argv[3] === 'all' ? Object.values(sectors).flatMap(s => s.companies) : sectors.semi.companies;
const companies = [...new Map(selected.map(c => [c.ticker, c])).values()];
const sandbox = { localStorage: { getItem: () => null } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../js/map_volatility_candles.js', import.meta.url), 'utf8'), sandbox);
const aggregate = sandbox.InvestingMapVolatilityCandles._test.volatilityBar;
const groups = [];
for (let i = 0; i < companies.length; i += 30) groups.push(companies.slice(i, i + 30));
const started = performance.now();
const responses = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(3, groups.length) }, async () => {
  while (next < groups.length) {
    const group = groups[next++], at = performance.now();
    const response = await fetch(base + '/api/volatility_candles?codes=' + group.map(c => c.ticker).sort().join(','));
    assert.equal(response.status, 200, 'batch endpoint must succeed');
    const text = await response.text(), data = JSON.parse(text);
    assert.equal(Object.keys(data.tickers).length, group.length);
    assert.ok(Object.values(data.tickers).every(entry => entry.bars.length <= 21));
    responses.push({ ms: Math.round(performance.now() - at), bytes: Buffer.byteLength(text), data });
  }
}));
const tickers = Object.assign({}, ...responses.map(r => r.data.tickers));
const coverage = Object.fromEntries([1, 3, 5, 10, 20].map(days => [days, companies.filter(c => aggregate(tickers[c.ticker].bars, days)).length]));
const missing = companies.filter(c => !aggregate(tickers[c.ticker].bars, 1)).map(c => ({ ticker: c.ticker, name: c.name, status: tickers[c.ticker].status, last: tickers[c.ticker].bars.at(-1) }));
console.log(JSON.stringify({ base, companies: companies.length, requests: groups.length, elapsedMs: Math.round(performance.now() - started), batchMs: responses.map(r => r.ms), bytes: responses.reduce((n, r) => n + r.bytes, 0), coverage, missing }, null, 2));
