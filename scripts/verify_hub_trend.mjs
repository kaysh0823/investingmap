import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downsampleTrend,
  downsampleDates,
  rebaseTo100,
  applyLiveDailyTip,
  sanitizeIntradaySnapRows,
  sanitizeIntradayRebasedSeries,
  TREND_INDEX_CODES,
  TREND_MAX_POINTS,
  TREND_CHART_MAX_POINTS,
  returnPctFromRebasedSeries,
} from '../functions/lib/hub_trend.mjs';
import {
  retPctToBase100,
  pctSeriesToBase100,
  buildDailySectorSeriesFromRefs,
} from '../functions/lib/sector_trend_core.mjs';
import { aggregateSectorReturns } from '../functions/lib/returns_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAILY_HORIZONS = ['20d', '50d', '120d', '200d'];

const rebased = rebaseTo100([
  { t: 'a', value: 200 },
  { t: 'b', value: 210 },
]);
assert.deepEqual(rebased, [
  { t: 'a', v: 100 },
  { t: 'b', v: 105 },
]);

const tipped = applyLiveDailyTip(
  [
    { t: '2026-08-19', value: 100 },
    { t: '2026-08-20', value: 110 },
  ],
  '2026-08-20',
  120,
);
assert.deepEqual(tipped.at(-1), { t: '2026-08-20', value: 120 });
const appended = applyLiveDailyTip([{ t: '2026-08-19', value: 100 }], '2026-08-20', 105);
assert.deepEqual(appended, [
  { t: '2026-08-19', value: 100 },
  { t: '2026-08-20', value: 105 },
]);

// Final rebased-series cleanup (value-only) — travel-style trough + overshoot.
{
  const input = [100, 99.2, 76.5, 79.4, 95.3, 110.7, 110, 102, 101.5, 103].map((v, i) => ({
    t: `t${i}`,
    v,
  }));
  const cleaned = sanitizeIntradayRebasedSeries(input);
  assert.equal(cleaned[0].v, 100);
  assert.equal(cleaned[cleaned.length - 1].v, 103);
  const mid = cleaned.slice(1, -1).map((row) => row.v);
  const minReb = Math.min(...cleaned.map((row) => row.v));
  const maxReb = Math.max(...mid);
  assert.ok(minReb >= 95, `rebased sanitize min ${minReb}`);
  assert.ok(maxReb <= 112, `rebased sanitize max mid ${maxReb}`);
  assert.ok(!cleaned.some((row) => row.v === 76.5 || row.v === 79.4 || row.v === 110.7));
}

// Partial-sum V-spike (e.g. 09:14 incomplete members) must be interpolated away.
{
  const base = 1e12;
  const cleaned = sanitizeIntradaySnapRows([
    { ts: '2026-09-07T09:00:00+09:00', value: base },
    { ts: '2026-09-07T09:10:00+09:00', value: base * 0.98 },
    { ts: '2026-09-07T09:14:00+09:00', value: base * 0.76 },
    { ts: '2026-09-07T09:20:00+09:00', value: base * 0.99 },
    { ts: '2026-09-07T15:20:00+09:00', value: base * 1.01 },
  ]);
  assert.ok(cleaned.length >= 4);
  assert.equal(cleaned[0].value, base);
  assert.equal(cleaned[cleaned.length - 1].value, base * 1.01);
  const minReb = Math.min(...cleaned.map((row) => (row.value / base) * 100));
  assert.ok(minReb >= 95, `single-spike min rebased ${minReb}`);
}

// Cluster trough (09:14–09:34) + overshoot rebound (09:54) — travel-style false V.
{
  const base = 1e12;
  const cleaned = sanitizeIntradaySnapRows([
    { ts: '2026-09-07T09:00:00+09:00', value: base },
    { ts: '2026-09-07T09:14:00+09:00', value: base * 0.765 },
    { ts: '2026-09-07T09:24:00+09:00', value: base * 0.794 },
    { ts: '2026-09-07T09:34:00+09:00', value: base * 0.953 },
    { ts: '2026-09-07T09:54:00+09:00', value: base * 1.107 },
    { ts: '2026-09-07T10:14:00+09:00', value: base * 0.995 },
    { ts: '2026-09-07T11:00:00+09:00', value: base * 1.002 },
    { ts: '2026-09-07T15:20:00+09:00', value: base * 1.01 },
  ]);
  assert.equal(cleaned[0].value, base);
  assert.equal(cleaned[cleaned.length - 1].value, base * 1.01);
  const reb = cleaned.map((row) => (row.value / base) * 100);
  const minReb = Math.min(...reb);
  const maxMid = Math.max(...reb.slice(1, -1));
  assert.ok(minReb >= 95, `cluster min rebased ${minReb}`);
  assert.ok(maxMid <= 108, `cluster overshoot cleaned, max mid ${maxMid}`);
}

const longDates = Array.from({ length: 201 }, (_, i) => `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
const sampledDates = downsampleDates(longDates);
assert.ok(sampledDates.length <= TREND_CHART_MAX_POINTS, 'downsampleDates caps chart fetch');
assert.equal(sampledDates[0], longDates[0], 'downsampleDates keeps window start');
assert.equal(sampledDates.at(-1), longDates.at(-1), 'downsampleDates keeps window end');

const long = Array.from({ length: 260 }, (_, index) => ({ t: String(index), v: index }));
const sampled = downsampleTrend(long);
assert.equal(sampled.length, TREND_MAX_POINTS);
assert.deepEqual(sampled[0], long[0]);
assert.deepEqual(sampled.at(-1), long.at(-1));

// --- stock-aggregate helpers ------------------------------------------------

assert.equal(retPctToBase100(12.34), 112.34);
assert.equal(retPctToBase100(-5), 95);
assert.deepEqual(
  pctSeriesToBase100([{ t: 'a', v: 0 }, { t: 'b', v: 10, synthesized: true }]),
  [{ t: 'a', v: 100 }, { t: 'b', v: 110, synthesized: true }],
);

{
  // 21 sessions so pastSessionDd(anchor, 20) lands on first date.
  const tradingDates = [];
  const cursor = new Date(Date.UTC(2025, 0, 2));
  while (tradingDates.length < 25) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      tradingDates.push(cursor.toISOString().slice(0, 10).replace(/-/g, ''));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const recentDd = tradingDates[tradingDates.length - 1];
  const closesA = tradingDates.map((_, i) => 10000 + i * 10);
  const closesB = tradingDates.map((_, i) => 20000 + i * 20);
  const refs = {
    recentDd,
    tradingDates,
    quotes: {
      '042700': { closes: closesA, shares: 100 },
      '007660': { closes: closesB, shares: 50 },
    },
  };
  const hubIndex = {
    sectors: {
      semi: {
        meta: { ko: '반도체' },
        companies: [{ ticker: '042700' }, { ticker: '007660' }],
      },
    },
  };
  const source = {
    meta: {
      sessionOpen: false,
      anchorDd: recentDd,
      refsRecentDd: recentDd,
      k: 0,
      numeratorMode: 'official',
    },
    byTicker: {
      '042700': {
        numerator: closesA[closesA.length - 1],
        closes: closesA,
        shares: 100,
      },
      '007660': {
        numerator: closesB[closesB.length - 1],
        closes: closesB,
        shares: 50,
      },
    },
  };
  const { sectors } = buildDailySectorSeriesFromRefs(hubIndex, refs, source, 20);
  const semi = sectors.find((s) => s.sector === 'semi');
  assert.ok(semi?.series?.length >= 2, 'semi daily series');
  assert.equal(semi.series[0].v, 100, 'window start rebased to 100');
  const tipPct = returnPctFromRebasedSeries(semi.series);
  const agg = aggregateSectorReturns([
    { numerator: closesA.at(-1), closes: closesA, k: 0, shares: 100 },
    { numerator: closesB.at(-1), closes: closesB, k: 0, shares: 50 },
  ]);
  assert.equal(tipPct, agg.ret20dPct, 'daily tip − 100 == aggregateSectorReturns.ret20dPct');
}

// --- source markers ---------------------------------------------------------

const api = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_trend.js'), 'utf8');
for (const marker of [
  "CACHE_VERSION = '/api/hub_trend/cache/v21'",
  'anchoredCachePath',
  'buildHubTrendPayload',
  'X-Hub-Anchor',
  'regularMax: 300',
]) {
  assert.ok(api.includes(marker), `hub trend API marker missing: ${marker}`);
}

const core = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'hub_trend.mjs'), 'utf8');
for (const marker of [
  'buildAggregateHubTrendPayload',
  'sector_trend_core.mjs',
  'returnPctFromRebasedSeries',
  'buildSectorReturnRowsFromTrend',
  'applyLiveDailyTip',
  'sanitizeIntradaySnapRows',
  'TREND_CHART_MAX_POINTS',
]) {
  assert.ok(core.includes(marker), `hub trend lib marker missing: ${marker}`);
}

const aggCore = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'sector_trend_core.mjs'), 'utf8');
for (const marker of [
  'buildIntraday1dSeries',
  'buildDailySectorSeriesFromRefs',
  'buildAggregateHubTrendPayload',
  'sector_intraday_returns?',
  'pctSeriesToBase100',
  'computeLiveSectorAggregates',
  'market_index_daily?',
  'market_index_intraday?',
  "source: 'stock_aggregate'",
  'synthesized',
]) {
  assert.ok(aggCore.includes(marker), `sector_trend_core marker missing: ${marker}`);
}

const syncSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'sync_quotes_to_supabase.mjs'), 'utf8');
assert.ok(syncSrc.includes('[legacy] sector intraday snapshots'), 'legacy snapshot log');
assert.ok(syncSrc.includes('[legacy] Building sector_returns from hub_trend mcap series'), 'legacy sector_returns log');

// --- optional live check: node scripts/verify_hub_trend.mjs --live=<origin> ---

const originalFetch = globalThis.fetch;
const liveArg = process.argv.slice(2).find((value) => value.startsWith('--live'));
if (liveArg) {
  const origin = liveArg.includes('=') ? liveArg.split('=')[1] : 'https://www.investingmap.kr';
  function assertIndices(payload, horizon) {
    assert.ok(Array.isArray(payload.indices), `${horizon}: indices array missing`);
    const codes = payload.indices.map((entry) => entry.code);
    for (const code of TREND_INDEX_CODES) {
      assert.ok(codes.includes(code), `${horizon}: ${code} missing from indices`);
    }
    assert.equal(payload.base, 100, `${horizon}: base`);
    assert.ok(payload.anchorDd, `${horizon}: anchorDd`);
  }
  for (const horizon of ['1d', ...DAILY_HORIZONS]) {
    const response = await originalFetch(`${origin}/api/hub_trend?horizon=${horizon}&nocache=1`);
    assert.ok(response.ok, `live ${horizon}: HTTP ${response.status}`);
    assertIndices(await response.json(), `live ${horizon}`);
  }
  console.log(`verify:hub-trend live OK — ${origin}`);
}

console.log(
  'verify:hub-trend OK — stock-aggregate helpers, tip lock, markers, legacy sync tags',
);
