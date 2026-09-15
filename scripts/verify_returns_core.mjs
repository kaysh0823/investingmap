/**
 * Unit checks for functions/lib/returns_core.mjs (k / refN / 20D index).
 */
import assert from 'node:assert/strict';
import {
  resolveNumerator,
  sessionsSince,
  refCloseAt,
  computeStockReturns,
  aggregateSectorReturns,
  roundPct,
} from '../functions/lib/returns_core.mjs';

assert.equal(roundPct(0.01234), 1.23);
assert.equal(roundPct(-0.01234), -1.23);

assert.equal(resolveNumerator({ sessionOpen: true, liveLast: 100, officialClose: 90 }), 100);
assert.equal(resolveNumerator({ sessionOpen: false, liveLast: 100, officialClose: 90 }), 90);
assert.equal(resolveNumerator({ sessionOpen: true, liveLast: null, officialClose: 90 }), 90);
assert.equal(resolveNumerator({ sessionOpen: false, liveLast: null, officialClose: null }), null);

const cal = ['20260910', '20260911', '20260912', '20260915'];
assert.equal(sessionsSince('20260912', '20260912', cal), 0);
assert.equal(sessionsSince('20260912', '20260915', cal), 1);
assert.equal(sessionsSince('20260911', '20260915', cal), 2);
assert.equal(sessionsSince('20260915', '20260916', cal), 1, 'live ahead of tip → 1');

// closes oldest→newest; last = recentDd close. L=201 → index 200 is last.
const closes = Array.from({ length: 201 }, (_, i) => 1000 + i);
const L = closes.length;
assert.equal(closes[L - 1], 1200);

// k=1 → ref1 = closes[L-1]; k=0 → ref1 = closes[L-2]
assert.equal(refCloseAt(closes, 1, 1), closes[L - 1], 'k=1 ref1 = last close');
assert.equal(refCloseAt(closes, 0, 1), closes[L - 2], 'k=0 ref1 = prior close');

// 20D index: k=1 → L-20; k=0 → L-21
assert.equal(refCloseAt(closes, 1, 20), closes[L - 20], 'k=1 ref20');
assert.equal(refCloseAt(closes, 0, 20), closes[L - 21], 'k=0 ref20');
assert.equal(refCloseAt(closes, 1, 20), closes[181]);
assert.equal(refCloseAt(closes, 0, 20), closes[180]);

const r1 = computeStockReturns({ numerator: 1212, closes, k: 1 });
assert.equal(r1.chg1dPct, roundPct(1212 / 1200 - 1));
assert.equal(r1.ret20dPct, roundPct(1212 / closes[L - 20] - 1));

const r0 = computeStockReturns({ numerator: 1212, closes, k: 0 });
assert.equal(r0.chg1dPct, roundPct(1212 / closes[L - 2] - 1));
assert.equal(r0.ret20dPct, roundPct(1212 / closes[L - 21] - 1));

const sector = aggregateSectorReturns([
  { numerator: 110, closes: [100, 105, 108], k: 1, shares: 2 },
  { numerator: 220, closes: [200, 210, 215], k: 1, shares: 1 },
]);
// k=1 ref1 = last close → (110*2 + 220*1) / (108*2 + 215*1) - 1
assert.equal(
  sector.chg1dPct,
  roundPct((110 * 2 + 220 * 1) / (108 * 2 + 215 * 1) - 1),
);

// Drop member with null ref (short history for N=20)
const dropped = aggregateSectorReturns([
  { numerator: 110, closes: [100, 105], k: 0, shares: 10 },
  { numerator: 220, closes: Array.from({ length: 30 }, (_, i) => 200 + i), k: 0, shares: 1 },
]);
assert.equal(dropped.ret20dPct != null, true);
assert.equal(
  dropped.chg1dPct,
  roundPct((110 * 10 + 220 * 1) / (100 * 10 + 228 * 1) - 1),
);

console.log('verify:returns-core OK — k/refN/20D/aggregate');
