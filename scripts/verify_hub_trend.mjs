import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHubTrendPayload,
  downsampleTrend,
  rebaseTo100,
  applyLiveDailyTip,
  TREND_INDEX_CODES,
  TREND_MAX_POINTS,
} from '../functions/lib/hub_trend.mjs';

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

const long = Array.from({ length: 260 }, (_, index) => ({ t: String(index), v: index }));
const sampled = downsampleTrend(long);
assert.equal(sampled.length, TREND_MAX_POINTS);
assert.deepEqual(sampled[0], long[0]);
assert.deepEqual(sampled.at(-1), long.at(-1));

// --- payload fixtures -------------------------------------------------------

function makeTradingDates(count, endDate) {
  const out = [];
  const cursor = new Date(endDate);
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

const FIXTURE_NOW = new Date(Date.UTC(2025, 8, 18));
const DATES = makeTradingDates(260, FIXTURE_NOW);
const LAST_DATE = DATES.at(-1);
const SECTORS = ['semi', 'bio'];
const FIXTURE_TICKERS = {
  semi: ['042700', '007660', '036930'],
  bio: ['207940', '068270', '196170'],
};

function fixtures({ intraday }) {
  const marketIndexDaily = [];
  const stockPriceHistory = [];
  DATES.forEach((date, i) => {
    for (const code of TREND_INDEX_CODES) {
      marketIndexDaily.push({ trade_date: date, index_code: code, close: 2000 + i });
    }
    for (const sector of SECTORS) {
      for (const ticker of FIXTURE_TICKERS[sector]) {
        stockPriceHistory.push({
          ticker,
          trade_date: date,
          mcap_won: 1e12 + i * 1e9,
        });
      }
    }
  });
  const sectorIntradaySnapshots = [0, 1, 2].map((i) => ({
    trade_date: LAST_DATE,
    ts: `${LAST_DATE}T0${i}:00:00+00:00`,
    sector_id: 'semi',
    mcap_sum: 1e12 + i * 1e9,
  }));
  const marketIndexIntraday = intraday
    ? TREND_INDEX_CODES.flatMap((code) =>
        [0, 1].map((i) => ({
          trade_date: LAST_DATE,
          captured_at: `${LAST_DATE}T0${i}:30:00+00:00`,
          index_code: code,
          value: 2500 + i,
          prev_close: 2490,
        })),
      )
    : [];
  const stockQuotesLatest = FIXTURE_TICKERS.semi.map((ticker, i) => ({
    ticker,
    mcap_won: 1e12 + 3 * 1e9 + i * 1e8,
  }));
  return {
    market_index_daily: marketIndexDaily,
    stock_price_history: stockPriceHistory,
    stock_quotes_latest: stockQuotesLatest,
    sector_intraday_snapshots: sectorIntradaySnapshots,
    market_index_intraday: marketIndexIntraday,
  };
}

function applyQuery(rows, params) {
  let out = rows.slice();
  for (const [key, raw] of params.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    if (op === 'eq') out = out.filter((row) => String(row[key]) === value);
    else if (op === 'gte') out = out.filter((row) => String(row[key]) >= value);
    else if (op === 'lte') out = out.filter((row) => String(row[key]) <= value);
    else if (op === 'gt') out = out.filter((row) => Number(row[key]) > Number(value));
    else if (op === 'in') {
      const set = new Set(value.replace(/^\(|\)$/g, '').split(','));
      out = out.filter((row) => set.has(String(row[key])));
    }
  }
  const order = params.get('order');
  if (order) {
    const [field, dir] = order.split('.');
    out.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (dir === 'desc' ? -1 : 1));
  }
  const offset = Number(params.get('offset') || 0);
  const limit = Number(params.get('limit') || 0);
  out = out.slice(offset);
  if (limit > 0) out = out.slice(0, limit);
  return out;
}

function installFetch(tables) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.replace(/^.*\/rest\/v1\//, '');
    const rows = applyQuery(tables[table] || [], url.searchParams);
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

const ENV = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'fixture-key' };
const HUB_INDEX = {
  sectors: {
    semi: {
      meta: { ko: '반도체' },
      companies: FIXTURE_TICKERS.semi.map((ticker) => ({ ticker })),
    },
    bio: {
      meta: { ko: '바이오' },
      companies: FIXTURE_TICKERS.bio.map((ticker) => ({ ticker })),
    },
  },
};

function assertIndices(payload, horizon, { expectPoints = true } = {}) {
  assert.ok(Array.isArray(payload.indices), `${horizon}: indices array missing`);
  const codes = payload.indices.map((entry) => entry.code);
  for (const code of TREND_INDEX_CODES) {
    assert.ok(codes.includes(code), `${horizon}: ${code} missing from indices`);
  }
  if (!expectPoints) return;
  for (const entry of payload.indices) {
    assert.ok(entry.series.length > 0, `${horizon}: ${entry.code} series is empty`);
    assert.equal(entry.series[0].v, 100, `${horizon}: ${entry.code} first point is not 100`);
  }
}

const originalFetch = globalThis.fetch;
try {
  installFetch(fixtures({ intraday: true }));
  for (const horizon of DAILY_HORIZONS) {
    const payload = await buildHubTrendPayload(HUB_INDEX, ENV, horizon, FIXTURE_NOW);
    assert.equal(payload.horizon, horizon);
    assert.equal(payload.base, 100);
    assert.ok(payload.sectors.length > 0, `${horizon}: sectors missing`);
    const semi = payload.sectors.find((s) => s.sector === 'semi');
    assert.ok(semi?.series?.length >= 2, `${horizon}: semi fixed-member series missing`);
    assert.equal(semi.series[0].v, 100, `${horizon}: semi base is 100`);
    assertIndices(payload, horizon);
  }

  const intraday = await buildHubTrendPayload(HUB_INDEX, ENV, '1d', FIXTURE_NOW);
  assertIndices(intraday, '1d');

  // No intraday captures yet: indices keep their shape and fall back to daily closes.
  installFetch(fixtures({ intraday: false }));
  const fallback = await buildHubTrendPayload(HUB_INDEX, ENV, '1d', FIXTURE_NOW);
  assertIndices(fallback, '1d (daily fallback)');
} finally {
  globalThis.fetch = originalFetch;
}

// --- source markers ---------------------------------------------------------

const api = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_trend.js'), 'utf8');
for (const marker of [
  "CACHE_VERSION = '/api/hub_trend/cache/v4'",
  'anchoredCachePath',
  'buildHubTrendPayload',
  'X-Hub-Anchor',
]) {
  assert.ok(api.includes(marker), `hub trend API marker missing: ${marker}`);
}

const core = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'hub_trend.mjs'), 'utf8');
for (const marker of [
  "const INDEX_CODES = ['KOSPI', 'KOSDAQ']",
  'market_index_daily?',
  'market_index_intraday?',
  'stock_price_history?',
  'sector_intraday_snapshots?',
  'stock_quotes_latest?',
  'fixedMembers',
  'loadMcapGridForDates',
  'buildSectorReturnAtHorizon',
  'MIN_FIXED_MEMBERS',
  'applyLiveDailyTip',
  'base: 100',
  'logIndexSeries',
]) {
  assert.ok(core.includes(marker), `hub trend core marker missing: ${marker}`);
}

// --- optional live check: node scripts/verify_hub_trend.mjs --live=<origin> ---

const liveArg = process.argv.slice(2).find((value) => value.startsWith('--live'));
if (liveArg) {
  const origin = liveArg.includes('=') ? liveArg.split('=')[1] : 'https://www.investingmap.kr';
  for (const horizon of DAILY_HORIZONS) {
    const response = await originalFetch(`${origin}/api/hub_trend?horizon=${horizon}&nocache=1`);
    assert.ok(response.ok, `live ${horizon}: HTTP ${response.status}`);
    assertIndices(await response.json(), `live ${horizon}`);
  }
  console.log(`verify:hub-trend live OK — ${origin}`);
}

console.log(
  'verify:hub-trend OK — fixed-member intersection, endpoint sampling, sources, KOSPI/KOSDAQ indices',
);
