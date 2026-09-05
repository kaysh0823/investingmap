/**
 * Unit checks for price_adjustments detection + OHLC overlay.
 */
import {
  applyPriceAdjustmentsToBars,
  cumulativeAdjustmentRatio,
  detectAdjustmentEvent,
  detectEventsFromHistoryRows,
  detectMissingSharesCloseJumps,
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

// LS ELECTRIC 010120 2026-04-13 5:1 — ex-date +13.7% so C×R≈1.137 (was outside 0.12)
const lsPrev = { trade_date: '2026-04-10', close: 788_000, mcap_won: 788_000 * 30_000_000 };
const lsCurr = { trade_date: '2026-04-13', close: 179_200, mcap_won: 179_200 * 150_000_000 };
const lsCloseRatio = lsCurr.close / lsPrev.close;
assert(passesInversePriceGapSanity(5, lsCloseRatio), '010120 C×R sanity (13.7% ex-date)');
const lsEv = detectAdjustmentEvent(lsPrev, lsCurr, '010120', 'test');
assert(lsEv, '010120 5:1 must be detected');
assert(lsEv.effective_date === '2026-04-13', `010120 date ${lsEv.effective_date}`);
assert(Number(lsEv.ratio) === 5, `010120 ratio ${lsEv.ratio}`);

const lsHist = [
  { trade_date: '2026-04-08', close: 788_000, mcap_won: 788_000 * 30_000_000 },
  { trade_date: '2026-04-09', close: 788_000, mcap_won: 788_000 * 30_000_000 },
  lsPrev,
  lsCurr,
  { trade_date: '2026-04-14', close: 185_600, mcap_won: 185_600 * 150_000_000 },
  { trade_date: '2026-04-15', close: 186_800, mcap_won: 186_800 * 150_000_000 },
  { trade_date: '2026-04-16', close: 188_600, mcap_won: 188_600 * 150_000_000 },
];
assert(
  detectEventsFromHistoryRows('010120', lsHist, 'test').some(
    (e) => e.effective_date === '2026-04-13' && Number(e.ratio) === 5,
  ),
  '010120 history scan with persistence',
);

const lsAdjBars = applyPriceAdjustmentsToBars(
  [
    { t: '2026-04-10', o: 790_000, h: 800_000, l: 780_000, c: 788_000, v: 10_000 },
    { t: '2026-04-13', o: 175_000, h: 185_000, l: 170_000, c: 179_200, v: 50_000 },
  ],
  [lsEv],
);
assert(lsAdjBars[0].c === 157_600, `010120 pre-split adjusted ${lsAdjBars[0].c}`);
assert(lsAdjBars[1].c === 179_200, `010120 post-split unchanged ${lsAdjBars[1].c}`);

const missRows = [
  { trade_date: '2026-04-10', close: 788_000, mcap_won: null },
  { trade_date: '2026-04-13', close: 179_200, mcap_won: null },
];
const missHits = detectMissingSharesCloseJumps('010120', missRows);
assert(missHits.length === 1, 'missing-shares close jump is review-only candidate');
assert(missHits[0].reason === 'missing-shares-close-jump', 'review reason');

const bothShares = [
  { trade_date: '2026-04-10', close: 788_000, mcap_won: 788_000 * 30_000_000 },
  { trade_date: '2026-04-13', close: 179_200, mcap_won: 179_200 * 150_000_000 },
];
assert(
  detectMissingSharesCloseJumps('010120', bothShares).length === 0,
  'known-shares close jump is not a missing-shares review',
);

// 1. Samsung Electronics (005930) 50:1 split
const samsungPrev = { trade_date: '2018-05-03', close: 2_650_000, mcap_won: 2_650_000 * 128_386_494 };
const samsungCurr = { trade_date: '2018-05-04', close: 51_900, mcap_won: 51_900 * 6_419_324_700 };
const samsungEv = detectAdjustmentEvent(samsungPrev, samsungCurr, '005930', 'test');
assert(samsungEv, '005930 50:1 split must be detected');
assert(Number(samsungEv.ratio) === 50, '005930 ratio 50');

// 2. Koh Young (098460) 5:1 split with 16.5% ex-date surge (C*R = 1.1646)
const kyPrev = { trade_date: '2021-04-12', close: 121_500, mcap_won: 121_500 * 13_730_951 };
const kyCurr = { trade_date: '2021-04-13', close: 28_300, mcap_won: 28_300 * 68_654_755 };
const kyEv = detectAdjustmentEvent(kyPrev, kyCurr, '098460', 'test');
assert(kyEv, '098460 5:1 split with 16.5% surge must be detected');
assert(Number(kyEv.ratio) === 5, '098460 ratio 5');

// 3. Ananti (025980) 5:1 split with 24.6% ex-date surge (C*R = 1.2466)
const anantiPrev = { trade_date: '2018-05-16', close: 37_700, mcap_won: 37_700 * 16_464_183 };
const anantiCurr = { trade_date: '2018-05-17', close: 9_400, mcap_won: 9_400 * 82_320_915 };
const anantiEv = detectAdjustmentEvent(anantiPrev, anantiCurr, '025980', 'test');
assert(anantiEv, '025980 5:1 split with 24.6% surge must be detected');
assert(Number(anantiEv.ratio) === 5, '025980 ratio 5');

// 4. Inhwa Precision (101930) 5:1 split with 30% limit-up surge (C*R = 1.3000)
const inhwaPrev = { trade_date: '2026-04-29', close: 52_000, mcap_won: 52_000 * 9_232_882 };
const inhwaCurr = { trade_date: '2026-04-30', close: 13_520, mcap_won: 13_520 * 46_164_410 };
const inhwaEv = detectAdjustmentEvent(inhwaPrev, inhwaCurr, '101930', 'test');
assert(inhwaEv, '101930 5:1 split with 30% surge must be detected');
assert(Number(inhwaEv.ratio) === 5, '101930 ratio 5');

// 5. Lagged bonus issue detection (e.g. Cafe24 042000 1:1 bonus issue)
const cafe24Hist = [
  { trade_date: '2021-01-26', close: 80_000, mcap_won: 80_000 * 9_430_597 },
  { trade_date: '2021-01-27', close: 75_900, mcap_won: 75_900 * 9_430_597 },
  { trade_date: '2021-01-28', close: 37_700, mcap_won: 37_700 * 9_430_597 }, // ex-date, price halved, shares unchanged
  { trade_date: '2021-01-29', close: 35_050, mcap_won: 35_050 * 9_430_597 },
  { trade_date: '2021-02-19', close: 35_150, mcap_won: 35_150 * 9_430_597 },
  { trade_date: '2021-02-22', close: 35_150, mcap_won: 35_150 * 18_834_733 }, // new shares listed
  { trade_date: '2021-02-23', close: 35_000, mcap_won: 35_000 * 18_834_733 },
  { trade_date: '2021-02-24', close: 35_200, mcap_won: 35_200 * 18_834_733 },
  { trade_date: '2021-02-25', close: 35_100, mcap_won: 35_100 * 18_834_733 },
];
const cafeEvents = detectEventsFromHistoryRows('042000', cafe24Hist, 'test');
assert(
  cafeEvents.some((e) => e.effective_date === '2021-01-28' && Number(e.ratio) === 2 && e.type === 'bonus'),
  '042000 lagged bonus issue detected on ex-date with ratio 2',
);

console.log('verify_price_adjustments_logic OK');
console.log('  APR 278470 2024-10-31 ratio=5 detected');
console.log('  Samsung 005930 2018-05-04 ratio=50 detected');
console.log('  Koh Young 098460 2021-04-13 ratio=5 detected');
console.log('  Ananti 025980 2018-05-17 ratio=5 detected');
console.log('  Inhwa 101930 2026-04-30 ratio=5 detected');
console.log('  Cafe24 042000 2021-01-28 ratio=2 bonus detected');
console.log('  overlay continuity:', pre.c, '→', post.c);
