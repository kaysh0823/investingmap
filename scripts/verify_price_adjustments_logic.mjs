/**
 * Unit checks for price_adjustments detection + OHLC overlay.
 */
import {
  applyPriceAdjustmentsToBars,
  cumulativeAdjustmentRatio,
  detectAdjustmentEvent,
  detectEventsFromHistoryRows,
  matchCleanShareRatio,
  passesInversePriceGapSanity,
} from '../functions/lib/price_adjustments.mjs';

const APR = '278470';
const SHARES_PRE = 7_622_678;
const SHARES_POST = 38_113_390;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// APR actual history pattern (2024-10-31): shares×5, close÷~5.3 → C×R≈0.94
const prevApr = {
  trade_date: '2024-10-30',
  close: 266_500,
  mcap_won: 266_500 * SHARES_PRE,
};
const currApr = {
  trade_date: '2024-10-31',
  close: 50_100,
  mcap_won: 50_100 * SHARES_POST,
};
const closeRatioApr = currApr.close / prevApr.close;
assert(passesInversePriceGapSanity(5, closeRatioApr), 'APR C×R sanity');
const ev = detectAdjustmentEvent(prevApr, currApr, APR, 'test');
assert(ev, 'APR split event must be detected');
assert(ev.effective_date === '2024-10-31', `effective_date ${ev.effective_date}`);
assert(Number(ev.ratio) === 5, `ratio ${ev.ratio}`);

// same-direction gap must NOT pass (removed up-branch)
const resumptionCurr = {
  trade_date: '2024-10-31',
  close: 700_000,
  mcap_won: 700_000 * SHARES_POST,
};
assert(
  !detectAdjustmentEvent(prevApr, resumptionCurr, APR, 'test'),
  'same-direction split rejected',
);

// 080580-like paid-in capital increase: C≈1.04, R=2 → C×R≈2.08
assert(
  !detectAdjustmentEvent(
    { trade_date: '2021-01-28', close: 20_700, mcap_won: 20_700 * 8_839_649 },
    { trade_date: '2021-01-29', close: 21_500, mcap_won: 21_500 * 17_679_298 },
    '080580',
    'test',
  ),
  '080580 same-direction rejected',
);

// 5:1 with inverse gap slightly outside old ±5% band still passes C×R gate
assert(
  detectAdjustmentEvent(
    { trade_date: '2021-04-14', close: 558_000, mcap_won: 558_000 * 88_761_861 },
    { trade_date: '2021-04-15', close: 120_500, mcap_won: 120_500 * 443_809_305 },
    '035720',
    'test',
  ),
  '035720 5:1 inverse gap',
);

// 3-day shares persistence required for history scan
const histRows = [
  { trade_date: '2024-10-28', close: 260_000, mcap_won: 260_000 * SHARES_PRE },
  { trade_date: '2024-10-29', close: 265_000, mcap_won: 265_000 * SHARES_PRE },
  prevApr,
  currApr,
  { trade_date: '2024-11-01', close: 49_800, mcap_won: 49_800 * SHARES_POST },
  { trade_date: '2024-11-04', close: 51_200, mcap_won: 51_200 * SHARES_POST },
  { trade_date: '2024-11-05', close: 50_500, mcap_won: 50_500 * SHARES_POST },
];
const histEvents = detectEventsFromHistoryRows(APR, histRows, 'test');
assert(
  histEvents.some((e) => e.effective_date === '2024-10-31' && Number(e.ratio) === 5),
  'history scan with persistence',
);

const rawBars = [
  { t: '2024-10-30', o: 265_000, h: 268_000, l: 264_000, c: 266_500, v: 10_000 },
  { t: '2024-10-31', o: 52_000, h: 53_000, l: 49_000, c: 50_100, v: 50_000 },
];
const adjusted = applyPriceAdjustmentsToBars(JSON.parse(JSON.stringify(rawBars)), [ev]);
const pre = adjusted.find((b) => b.t === '2024-10-30');
const post = adjusted.find((b) => b.t === '2024-10-31');
assert(pre.c === 53_300, `pre-split adjusted ${pre.c}`);
assert(post.c === 50_100, `post-split unchanged ${post.c}`);
assert(Math.abs(pre.c / post.c - 1) < 0.1, `continuity ${pre.c}/${post.c}`);

assert(cumulativeAdjustmentRatio('2024-10-30', [ev]) === 5, 'cum ratio before ex-date');
assert(matchCleanShareRatio(5) === 5, 'match 5');
assert(matchCleanShareRatio(1.07) == null, 'reject 1.07');

console.log('verify_price_adjustments_logic OK');
console.log('  APR 278470 2024-10-31 ratio=5 detected');
console.log('  overlay continuity:', pre.c, '→', post.c);
