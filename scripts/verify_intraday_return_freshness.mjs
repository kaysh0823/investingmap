import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadReturnSource } from '../functions/lib/hub_returns_source.mjs';
import { computeStockReturns, aggregateSectorReturns } from '../functions/lib/returns_core.mjs';

const tickers = ['005930', '000660'];
const refs = {
  recentDd: '20261012',
  tradingDates: ['20261008', '20261012'],
  quotes: {
    '005930': { closes: [260000, 250500], shares: 1000 },
    '000660': { closes: [1681000, 1605000], shares: 1000 },
  },
};
const quoteRows = [
  { ticker: '005930', last: 234000, trade_date: '2026-10-14', as_of: '2026-10-14T10:00:00+09:00' },
  { ticker: '000660', last: 1426000, trade_date: '2026-10-14', as_of: '2026-10-14T10:00:00+09:00' },
];
const history = {
  extraTradeDates: ['20261013'],
  prevByTicker: new Map([
    ['005930', { tradeDate: '20261013', close: 232000 }],
    ['000660', { tradeDate: '20261013', close: 1443000 }],
  ]),
  adjByTicker: new Map(),
};
async function load(krxHistory = history) {
  return loadReturnSource({ env: {}, refs, tickers, quoteRows, krxHistory, now: new Date('2026-10-14T10:00:00+09:00') });
}
const source = await load();
assert.equal(source.meta.refsStale, true);
const members = tickers.map((t) => ({ ...source.byTicker[t], k: source.meta.k }));
assert.equal(computeStockReturns(members[0]).chg1dPct, 0.86);
assert.equal(computeStockReturns(members[1]).chg1dPct, -1.18);
assert.equal(aggregateSectorReturns(members).chg1dPct, -0.9);
const missing = await load({ ...history, prevByTicker: new Map() });
assert.equal(missing.byTicker['005930'].prevClose1d, null);
const old = await load({ ...history, prevByTicker: new Map([['005930', { tradeDate: '20261012', close: 250500 }]]) });
assert.equal(old.byTicker['005930'].prevClose1d, null);
const split = await load({
  ...history,
  prevByTicker: new Map([['005930', { tradeDate: '20261013', close: 464000 }]]),
  adjByTicker: new Map([['005930', [{ effective_date: '2026-10-14', ratio: 0.5 }]]]),
});
assert.equal(split.byTicker['005930'].prevClose1d, 232000);

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL('../js/live_quotes.js', import.meta.url), 'utf8'), context);
const company = { ticker: '005930', chg1dPct: -7.39, ret5dPct: 12 };
context.InvestingMapLiveQuotes.mergeCompanies([company], { '005930': { chg1dPct: null, ret5dPct: null } });
assert.equal(company.chg1dPct, null);
assert.equal(company.ret5dPct, null);
context.InvestingMapLiveQuotes.mergeCompanies([company], { '005930': { chg1dPct: 0.86 } });
assert.equal(company.chg1dPct, 0.86);
assert.equal(company.ret5dPct, null);
const hubContext = vm.createContext({ console, document: { getElementById: () => null } });
const hubScript = fs.readFileSync(new URL('../js/hub_dashboard.js', import.meta.url), 'utf8')
  .replace('global.InvestingMapHubDashboard = {', 'global.__testHub = { merge: mergeSectorsPayload, data: dashboardData }; global.InvestingMapHubDashboard = {');
vm.runInContext(hubScript, hubContext);
const hub = hubContext.__testHub;
hub.merge({ sectors: { bigchip: { return1dPct: -7, return5dPct: 3 } } });
hub.merge({ sectors: { bigchip: { return1dPct: null } } });
assert.equal(hub.data.sectors.bigchip.return1dPct, null);
assert.equal(hub.data.sectors.bigchip.return5dPct, 3);
hub.merge({ sectors: { bigchip: { return1dPct: 0.86 } } });
assert.equal(hub.data.sectors.bigchip.return1dPct, 0.86);
console.log('intraday freshness: stale refs use prior KRX session; missing returns clear old heatmap values');
