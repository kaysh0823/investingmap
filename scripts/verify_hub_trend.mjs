import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downsampleTrend,
  rebaseTo100,
  TREND_MAX_POINTS,
} from '../functions/lib/hub_trend.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const rebased = rebaseTo100([
  { t: 'a', value: 200 },
  { t: 'b', value: 210 },
]);
assert.deepEqual(rebased, [
  { t: 'a', v: 100 },
  { t: 'b', v: 105 },
]);

const long = Array.from({ length: 260 }, (_, index) => ({ t: String(index), v: index }));
const sampled = downsampleTrend(long);
assert.equal(sampled.length, TREND_MAX_POINTS);
assert.deepEqual(sampled[0], long[0]);
assert.deepEqual(sampled.at(-1), long.at(-1));

const api = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'hub_trend.js'), 'utf8');
for (const marker of [
  "CACHE_VERSION = '/api/hub_trend/cache/v1'",
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
  'sector_mcap_daily?',
  'sector_intraday_snapshots?',
  'base: 100',
]) {
  assert.ok(core.includes(marker), `hub trend core marker missing: ${marker}`);
}

console.log('verify:hub-trend OK — base-100 normalization, endpoint sampling, and sources');
