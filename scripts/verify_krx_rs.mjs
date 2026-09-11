import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { percentileRanks, RS_WEIGHTS } from '../functions/lib/krx_rs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function weightedRs(rs20, rs50, rs120) {
  return Math.round(
    (rs20 * RS_WEIGHTS.rs20 + rs50 * RS_WEIGHTS.rs50 + rs120 * RS_WEIGHTS.rs120) * 10,
  ) / 10;
}

assert.deepEqual(RS_WEIGHTS, { rs20: 0.5, rs50: 0.3, rs120: 0.2 });
assert.equal(
  RS_WEIGHTS.rs20 + RS_WEIGHTS.rs50 + RS_WEIGHTS.rs120,
  1,
  'RS weights must sum to 1',
);

assert.equal(weightedRs(100, 100, 100), 100);
assert.equal(weightedRs(0, 0, 0), 0);
assert.equal(weightedRs(80, 60, 40), 66);

const ranks = percentileRanks([
  { code: 'A', ret: -5 },
  { code: 'B', ret: 0 },
  { code: 'C', ret: 10 },
  { code: 'D', ret: 10 },
]);
assert.equal(ranks.get('A'), 0);
assert.ok(Math.abs(ranks.get('B') - 100 / 3) < 1e-9, 'percentileRanks mid rank');
assert.ok(Math.abs(ranks.get('C') - 250 / 3) < 1e-9, 'percentileRanks tied top');
assert.equal(ranks.get('C'), ranks.get('D'), 'percentileRanks tie average');

const src = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'krx_rs.mjs'), 'utf8');
assert.ok(src.includes('RS_WEIGHTS'), 'krx_rs must define RS_WEIGHTS');
assert.ok(
  src.includes('weighted mean (20d 0.5 / 50d 0.3 / 120d 0.2)'),
  'krx_rs header must document weighted mean',
);
assert.ok(
  src.includes('rs20 * RS_WEIGHTS.rs20 + rs50 * RS_WEIGHTS.rs50 + rs120 * RS_WEIGHTS.rs120'),
  'krx_rs must use weighted RS formula',
);
assert.ok(!src.includes('(rs20 + rs50 + rs120) / 3'), 'krx_rs must not use arithmetic mean');

assert.ok(
  src.includes('fetchMarketIndexCloses') && src.includes('INDEX_RS_CODES'),
  'krx_rs must fetch KOSPI/KOSDAQ closes for index RS',
);
assert.ok(src.includes('indices'), 'krx_rs snapshot must expose indices field');
assert.ok(
  src.includes("INDEX_RS_CODES") && src.includes("'__KOSPI'") && src.includes("'__KOSDAQ'"),
  'index synthetic codes must be __KOSPI/__KOSDAQ',
);
assert.ok(
  src.includes('fetchNaverMarketIndexHistory'),
  'krx_rs must fall back to Naver index history when KRX index API is unauthorized',
);

console.log('verify:krx-rs OK — weighted RS (0.5/0.3/0.2), percentileRanks unchanged, index RS guide fields');
