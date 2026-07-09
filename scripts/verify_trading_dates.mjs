/**
 * KST trading-date helpers — smoke tests for timezone / session edge cases.
 */
import { kstYmd, kstWeekday, kstAnchorYmd } from '../functions/lib/krx_session.mjs';
import { tradingDates, recentDateCandidates } from '../functions/lib/krx_yoy.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function kst(iso) {
  return new Date(iso);
}

function isRecentDdStale(recentDd, now) {
  return recentDd < kstAnchorYmd(now);
}

const cases = [
  {
    name: 'Mon 7/6 10:00 KST — skip today before close',
    now: kst('2026-07-06T10:00:00+09:00'),
    check(dates, recent) {
      assert(kstWeekday(this.now) === 1, 'weekday Mon');
      assert(kstYmd(this.now) === '20260706', 'today ymd');
      assert(dates[0] === '20260706', 'dates[0] is Mon');
      assert(recent[0] !== '20260706', 'recent candidates skip Mon before close');
      assert(recent[0] === '20260703', 'recent first is Fri 7/3');
    },
  },
  {
    name: 'Mon 7/6 22:00 KST — include today after close',
    now: kst('2026-07-06T22:00:00+09:00'),
    check(dates, recent) {
      assert(dates[0] === '20260706', 'dates[0] is Mon');
      assert(recent[0] === '20260706', 'recent candidates include Mon after close');
    },
  },
  {
    name: 'Sun 7/5 12:00 KST — latest weekday is Fri 7/3',
    now: kst('2026-07-05T12:00:00+09:00'),
    check(dates, recent) {
      assert(kstWeekday(this.now) === 0, 'weekday Sun');
      assert(dates[0] === '20260703', 'dates[0] is Fri (Sun skipped)');
      assert(recent[0] === '20260703', 'recent same as dates[0]');
      assert(kstAnchorYmd(this.now) === '20260703', 'anchor Fri on weekend');
    },
  },
  {
    name: 'Mon 7/6 01:00 KST (= UTC Sun) — KST Monday not UTC Sunday',
    now: kst('2026-07-06T01:00:00+09:00'),
    check(dates) {
      assert(kstWeekday(this.now) === 1, 'KST weekday is Mon not UTC Sun');
      assert(dates[0] === '20260706', 'dates[0] is Mon in KST');
    },
  },
  {
    name: 'Tue 7/7 10:00 KST — anchor is today, Jul3 KRX stale',
    now: kst('2026-07-07T10:00:00+09:00'),
    check() {
      assert(kstWeekday(this.now) === 2, 'weekday Tue');
      assert(kstAnchorYmd(this.now) === '20260707', 'anchor Tue 7/7');
      assert(isRecentDdStale('20260703', this.now) === true, 'Jul3 stale vs Jul7');
    },
  },
  {
    name: 'Fri 7/10 00:30 KST — recent candidate is Thu 7/9 (skip Fri before close)',
    now: kst('2026-07-10T00:30:00+09:00'),
    check(dates, recent) {
      assert(kstYmd(this.now) === '20260710', 'today Fri 7/10');
      assert(recent[0] === '20260709', 'recent first is Thu 7/9');
      assert(recent[1] === '20260708', 'fallback Thu→Wed');
    },
  },
];

let failed = 0;
for (const c of cases) {
  try {
    const dates = tradingDates(10, c.now);
    const recent = recentDateCandidates(dates, c.now);
    c.check(dates, recent);
    console.log(`OK  ${c.name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${c.name}: ${e.message}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log(`All ${cases.length} trading-date checks passed.`);
