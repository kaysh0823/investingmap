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
const priorClose = closes[L - 2];
assert.ok(Number.isFinite(officialClose) && officialClose > 0, '005930 recent close');
assert.ok(Number.isFinite(priorClose) && priorClose > 0, '005930 prior close');
assert.match(String(refs.recentDd || ''), /^\d{8}$/);

const session = krxSessionInfo();
const sessionOpenNow = !!session.regular;

function nextCompactYmd(ymd) {
  const y = Number(String(ymd).slice(0, 4));
  const m = Number(String(ymd).slice(4, 6));
  const d = Number(String(ymd).slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}${mm}${dd}`;
}

// --- official: anchorDd = refsRecentDd → k=0 → ref1 = closes[L-2]
{
  const sessionOpen = false;
  const anchorDd = refs.recentDd;
  const k = sessionsSince(refs.recentDd, anchorDd, refs.tradingDates);
  assert.equal(anchorDd, refs.recentDd);
  assert.equal(k, 0);
  assert.equal(refCloseAt(closes, 0, 1), priorClose);

  const numerator = resolveNumerator({
    liveLast: officialClose,
    sessionOpen,
    officialClose,
  });
  assert.equal(numerator, officialClose);
  const off = computeStockReturns({ numerator, closes, k });
  assert.equal(off.chg1dPct, roundPct(officialClose / priorClose - 1));
}

// --- live: next calendar day after the refs tip → k=1 → ref1 = closes[L-1]
{
  const sessionOpen = true;
  const liveTradeDd = nextCompactYmd(refs.recentDd);
  const anchorDd = sessionOpen ? liveTradeDd : refs.recentDd;
  const k = sessionsSince(refs.recentDd, anchorDd, refs.tradingDates);
  assert.equal(anchorDd, liveTradeDd);
  assert.equal(k, 1);
  assert.equal(refCloseAt(closes, 1, 1), officialClose);

  const liveLast = officialClose;
  const numerator = resolveNumerator({ liveLast, sessionOpen, officialClose });
  assert.equal(numerator, liveLast);
  const live = computeStockReturns({ numerator, closes, k });
  assert.equal(live.chg1dPct, roundPct(liveLast / officialClose - 1));
  assert.equal(live.ret20dPct, roundPct(liveLast / refCloseAt(closes, 1, 20) - 1));
}

const quotesSrc = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'quotes.js'), 'utf8');
assert.ok(quotesSrc.includes('computeStockReturns'), 'quotes wires returns_core');
assert.ok(quotesSrc.includes('numeratorMode'), 'quotes exposes numeratorMode');
const returnsSrc = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'hub_returns_source.mjs'), 'utf8');
assert.ok(
  /sessionsSince\(\s*refsRecentDd\s*,\s*anchorDd/.test(returnsSrc),
  'k must use anchorDd not liveTradeDd',
);

const liveSrc = fs.readFileSync(path.join(ROOT, 'js', 'live_quotes.js'), 'utf8');
assert.ok(liveSrc.includes('getReturnMeta'), 'client exposes getReturnMeta');
assert.ok(liveSrc.includes('syncReturnMetaBadges'), 'client paints return meta badges');
assert.ok(!/calcLiveChg1dPct/.test(liveSrc), 'client no longer recalculates 1D');

console.log(
  'verify:quotes-returns OK — official/live identities vs refs tip %s sessionOpenNow=%s',
  refs.recentDd,
  sessionOpenNow,
);
