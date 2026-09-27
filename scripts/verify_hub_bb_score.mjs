/**
 * Bollinger score snapshot: candle-modal norm parity, %b vs volatility snapshot, top20 identity.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { bbScore, trailingMinMaxNorm } from '../lib/bollinger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const candleSrc = fs.readFileSync(path.join(ROOT, 'js', 'candle_modal.js'), 'utf8');
const start = candleSrc.indexOf('function trailingMinMaxNorm');
const end = candleSrc.indexOf('function bandwidthPercentile');
assert.ok(start > 0 && end > start, 'candle trailingMinMaxNorm source');
const candleNorm = vm.runInNewContext(`${candleSrc.slice(start, end)}\ntrailingMinMaxNorm;`, {});

function assertSameNorm(values, window) {
  const a = trailingMinMaxNorm(values, window);
  const b = candleNorm(values, window);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] == null || b[i] == null) {
      assert.equal(a[i], b[i], `norm null mismatch at ${i}`);
    } else {
      assert.ok(Math.abs(a[i] - b[i]) < 1e-12, `norm diff at ${i}: ${a[i]} vs ${b[i]}`);
    }
  }
}

const rising = Array.from({ length: 180 }, (_, i) => i + 1);
const withGaps = rising.map((v, i) => (i % 17 === 0 ? null : v));
const flat = Array.from({ length: 160 }, () => 7);
assertSameNorm(rising, 125);
assertSameNorm(withGaps, 125);
assertSameNorm(flat, 125);

const bb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_bb_score.json'), 'utf8'));
const vol = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_volatility_snapshot.json'), 'utf8'));
assert.equal(bb.source, 'hub_return_refs');
assert.equal(bb.definition.period, 20);
assert.equal(bb.definition.mult, 2);
assert.equal(bb.definition.normWindow, 125);
assert.equal(bb.recentDd, '20260923');

let compared = 0;
for (const [ticker, row] of Object.entries(bb.quotes)) {
  const snap = vol.quotes && vol.quotes[ticker];
  if (!snap || snap.pctB == null) continue;
  compared += 1;
  assert.ok(
    Math.abs(row.pctB - snap.pctB) < 1e-4,
    `${ticker} pctB ${row.pctB} vs snapshot ${snap.pctB}`,
  );
  const again = bbScore(row.pctB, row.bbwNorm);
  assert.ok(Math.abs(row.score - again) < 1e-4, `${ticker} score identity`);
}
assert.ok(compared > 100, `pctB overlap ${compared}`);

assert.equal(bb.top20.length, 20);
for (let i = 1; i < bb.top20.length; i++) {
  const prev = bb.top20[i - 1];
  const cur = bb.top20[i];
  assert.ok(prev.score > cur.score || (prev.score === cur.score && prev.pctB >= cur.pctB), 'top20 order');
  assert.equal(cur.rank, i + 1);
}
assert.equal(bb.top20[0].rank, 1);
assert.equal(bb.top20[0].ticker, '357780');
assert.equal(bb.top20[0].name, '솔브레인');
assert.ok(Math.abs(bb.top20[0].score - 2.198) < 0.001, `top score ${bb.top20[0].score}`);

console.log(
  `verify:hub-bb-score OK — norm parity, pctB overlap ${compared}, top1 ${bb.top20[0].ticker} ${bb.top20[0].score}`,
);
