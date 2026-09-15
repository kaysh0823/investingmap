/**
 * Verify /api/quotes-style return math for 005930 matches returns_core + hub_return_refs.
 * k is keyed off anchorDd (not liveTradeDd): official→refsRecentDd→k=0, live→today→k=1.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  computeStockReturns,
  resolveNumerator,
  sessionsSince,
  refCloseAt,
  roundPct,
} from '../functions/lib/returns_core.mjs';
import { krxSessionInfo } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_return_refs.json'), 'utf8'));
const row = refs.quotes['005930'];
assert.ok(row && Array.isArray(row.closes) && row.closes.length >= 201, '005930 closes');

const closes = row.closes;
const L = closes.length;
const officialClose = closes[L - 1];
assert.equal(officialClose, 249000, '005930 recentDd close');
assert.equal(refs.recentDd, '20260914');

const session = krxSessionInfo();
const sessionOpenNow = !!(session.regular || session.aftermarket);

// --- official: anchorDd = refsRecentDd → k=0 → ref1 = closes[L-2]
{
  const sessionOpen = false;
  const liveTradeDd = '20260915'; // clock may be today, but official anchors on refs tip
  const anchorDd = sessionOpen ? liveTradeDd : refs.recentDd;
  const k = sessionsSince(refs.recentDd, anchorDd, refs.tradingDates);
  assert.equal(anchorDd, refs.recentDd);
  assert.equal(k, 0);
  assert.equal(refCloseAt(closes, 0, 1), closes[L - 2]);
  assert.equal(closes[L - 2], 259500, 'prior session close for 1D');

  const numerator = resolveNumerator({
    liveLast: 248500,
    sessionOpen,
    officialClose,
  });
  assert.equal(numerator, officialClose);
  const off = computeStockReturns({ numerator, closes, k });
  assert.equal(off.chg1dPct, roundPct(249000 / 259500 - 1));
  assert.equal(off.chg1dPct, -4.05);
}

// --- live: anchorDd = liveTradeDd → k=1 → ref1 = closes[L-1]
{
  const sessionOpen = true;
  const liveTradeDd = '20260915';
  const anchorDd = sessionOpen ? liveTradeDd : refs.recentDd;
  const k = sessionsSince(refs.recentDd, anchorDd, refs.tradingDates);
  assert.equal(anchorDd, '20260915');
  assert.equal(k, 1);
  assert.equal(refCloseAt(closes, 1, 1), officialClose);

  const liveLast = 248500;
  const numerator = resolveNumerator({ liveLast, sessionOpen, officialClose });
  assert.equal(numerator, liveLast);
  const live = computeStockReturns({ numerator, closes, k });
  assert.equal(live.chg1dPct, roundPct(248500 / 249000 - 1));
  assert.equal(live.chg1dPct, -0.2);
  assert.equal(live.ret20dPct, roundPct(248500 / refCloseAt(closes, 1, 20) - 1));
}

const quotesSrc = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'quotes.js'), 'utf8');
assert.ok(quotesSrc.includes('computeStockReturns'), 'quotes wires returns_core');
assert.ok(quotesSrc.includes('numeratorMode'), 'quotes exposes numeratorMode');
assert.ok(
  /sessionsSince\(\s*recentDd\s*,\s*anchorDd/.test(quotesSrc)
    || quotesSrc.includes('sessionsSince(recentDd, anchorDd'),
  'k must use anchorDd not liveTradeDd',
);

const liveSrc = fs.readFileSync(path.join(ROOT, 'js', 'live_quotes.js'), 'utf8');
assert.ok(liveSrc.includes('getReturnMeta'), 'client exposes getReturnMeta');
assert.ok(liveSrc.includes('syncReturnMetaBadges'), 'client paints return meta badges');
assert.ok(!/calcLiveChg1dPct/.test(liveSrc), 'client no longer recalculates 1D');

console.log(
  'verify:quotes-returns OK — official chg1d=-4.05 live chg1d=-0.20 sessionOpenNow=%s',
  sessionOpenNow,
);
