/**
 * Verify /api/quotes-style return math for 005930 matches returns_core + hub_return_refs.
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
} from '../functions/lib/returns_core.mjs';
import { krxSessionInfo } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_return_refs.json'), 'utf8'));
const row = refs.quotes['005930'];
assert.ok(row && Array.isArray(row.closes) && row.closes.length >= 201, '005930 closes');

const closes = row.closes;
const officialClose = closes[closes.length - 1];
assert.equal(officialClose, closes.at(-1));

const session = krxSessionInfo();
const sessionOpen = !!(session.regular || session.aftermarket);

// Simulate closed-hours official path (k=0 when liveTradeDd === recentDd)
const k0 = sessionsSince(refs.recentDd, refs.recentDd, refs.tradingDates);
assert.equal(k0, 0);
const numOfficial = resolveNumerator({
  liveLast: officialClose + 1000,
  sessionOpen: false,
  officialClose,
});
assert.equal(numOfficial, officialClose);
const off = computeStockReturns({ numerator: numOfficial, closes, k: k0 });
assert.equal(off.chg1dPct, Math.round((officialClose / refCloseAt(closes, 0, 1) - 1) * 10000) / 100);
assert.equal(off.ret20dPct, Math.round((officialClose / refCloseAt(closes, 0, 20) - 1) * 10000) / 100);

// Live path: never pass refsRecentDd as liveTradeDd
const k1 = sessionsSince(refs.recentDd, '20991231', refs.tradingDates);
assert.equal(k1, 1);
const liveLast = 248500;
const numLive = resolveNumerator({ liveLast, sessionOpen: true, officialClose });
assert.equal(numLive, liveLast);
const live = computeStockReturns({ numerator: numLive, closes, k: k1 });
assert.equal(live.chg1dPct, Math.round((liveLast / refCloseAt(closes, 1, 1) - 1) * 10000) / 100);
assert.equal(refCloseAt(closes, 1, 1), officialClose, 'k=1 ref1 is recentDd close');
assert.equal(live.ret20dPct, Math.round((liveLast / refCloseAt(closes, 1, 20) - 1) * 10000) / 100);
assert.notEqual(
  sessionsSince(refs.recentDd, refs.recentDd, refs.tradingDates),
  sessionsSince(refs.recentDd, '20260915', refs.tradingDates),
  'must not collapse live day to refsRecentDd',
);

const quotesSrc = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'quotes.js'), 'utf8');
assert.ok(quotesSrc.includes('computeStockReturns'), 'quotes wires returns_core');
assert.ok(quotesSrc.includes('numeratorMode'), 'quotes exposes numeratorMode');

const liveSrc = fs.readFileSync(path.join(ROOT, 'js', 'live_quotes.js'), 'utf8');
assert.ok(liveSrc.includes('getReturnMeta'), 'client exposes getReturnMeta');
assert.ok(liveSrc.includes('syncReturnMetaBadges'), 'client paints return meta badges');
assert.ok(!/calcLiveChg1dPct/.test(liveSrc), 'client no longer recalculates 1D');

console.log(
  'verify:quotes-returns OK — 005930 officialClose=%s sessionOpen=%s chg1d(off)=%s ret20(off)=%s',
  officialClose,
  sessionOpen,
  off.chg1dPct,
  off.ret20dPct,
);
