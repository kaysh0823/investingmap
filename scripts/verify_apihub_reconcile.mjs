/**
 * Synthetic apihub reconcile: mdcstat 272250 vs apihub 272500 fixes one row;
 * an empty apihub day is skipped without throwing.
 * Run: node scripts/verify_apihub_reconcile.mjs
 */
import {
  planApihubOverwrites,
  reconcileRecentHistoryWithApihub,
} from './history_apihub_reconcile.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

const krxRow = {
  TDD_OPNPRC: '270,000',
  TDD_HGPRC: '273,000',
  TDD_LWPRC: '269,500',
  TDD_CLSPRC: '272,500',
  ACC_TRDVOL: '1000',
};

const db = new Map([
  ['005930', {
    ticker: '005930',
    open: 270000,
    high: 273000,
    low: 269500,
    close: 272250,
    source: 'mdcstat',
  }],
]);
const market = new Map([['005930', krxRow]]);
const plan = planApihubOverwrites(['005930'], db, market, '2026-09-29', { includeSource: true });
assert(plan.checked === 1, `checked ${plan.checked}`);
assert(plan.fixes.length === 1, `fixes ${plan.fixes.length}`);
assert(plan.fixes[0].payload.close === 272500, `close ${plan.fixes[0].payload.close}`);
assert(plan.fixes[0].payload.source === 'apihub', `source ${plan.fixes[0].payload.source}`);
assert(
  plan.fixes[0].fields.some((field) => field.field === 'close' && field.from === 272250 && field.to === 272500),
  'close sample 272250→272500',
);
const sameOhlc = new Map([
  ['000660', { ticker: '000660', open: 1, high: 1, low: 1, close: 100, source: 'mdcstat' }],
]);
const sameMarket = new Map([['000660', { TDD_OPNPRC: '1', TDD_HGPRC: '1', TDD_LWPRC: '1', TDD_CLSPRC: '100' }]]);
const sourceOnly = planApihubOverwrites(['000660'], sameOhlc, sameMarket, '2026-09-28', { includeSource: true });
assert(sourceOnly.fixes.length === 1 && sourceOnly.fixes[0].payload.source === 'apihub', 'source-only row is rewritten');

const written = [];
const result = await reconcileRecentHistoryWithApihub({
  tickers: ['005930'],
  todayDash: '2026-09-30',
  dates: ['2026-09-29', '2026-09-26'],
  writeSummary: false,
  fetchMarket: async (_authKey, basDd) => (basDd === '20260929' ? market : new Map()),
  fetchDb: async (_url, _key, date) => (date === '2026-09-29' ? db : new Map()),
  upsert: async (_url, _key, rows) => {
    written.push(...rows);
    return rows.length;
  },
});

assert(result.fixedTotal === 1, `fixedTotal ${result.fixedTotal}`);
assert(written.length === 1, `upserted ${written.length}`);
assert(written[0].close === 272500 && written[0].source === 'apihub', 'upsert payload');
assert(written[0].trade_date === '2026-09-29', `trade_date ${written[0].trade_date}`);
const ready = result.dates.find((row) => row.date === '2026-09-29');
const skipped = result.dates.find((row) => row.date === '2026-09-26');
assert(ready && ready.checked === 1 && ready.fixed === 1 && ready.skipped === false, '9/29 fixed 1');
assert(skipped && skipped.skipped === true && skipped.fixed === 0, 'empty apihub skipped');
assert(!written.some((row) => row.trade_date === '2026-09-26'), 'empty day wrote nothing');

const excluded = await reconcileRecentHistoryWithApihub({
  tickers: ['005930'],
  todayDash: '2026-09-29',
  dates: ['2026-09-29'],
  writeSummary: false,
  fetchMarket: async () => {
    throw new Error('today must not be fetched');
  },
  fetchDb: async () => db,
  upsert: async () => {
    throw new Error('today must not be written');
  },
});
assert(excluded.dates.length === 0 && excluded.fixedTotal === 0, 'today is excluded');

console.log('verify:apihub-reconcile OK — 272250→272500 fixed 1, empty day skipped');
