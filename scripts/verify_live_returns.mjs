/**
 * Unit tests for lib/return_live.mjs
 */
import {
  calcLiveChg1dPct,
  calcLiveMcapWon,
  calcLiveRetFromSnapPct,
  isRecentDdStale,
  shouldUseLive1dReturns,
  kstYmd,
  kstAnchorYmd,
  pastMcapFromSnapRet,
  sectorReturnMcapRatio,
  past1dMcapMapFromSnap,
  pastMcapMapFromSnapRet,
} from '../lib/return_live.mjs';
import { isKrxRegularSession } from '../functions/lib/krx_session.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calcLiveChg1dPct(105000, 100000) === 5, 'chg1d 5%');
assert(calcLiveChg1dPct(95000, 100000) === -5, 'chg1d -5%');
assert(calcLiveChg1dPct(null, 100000) === null, 'chg1d null last');

assert(calcLiveMcapWon(1e12, 110000, 100000) === 1.1e12, 'live mcap scale');

const mon = new Date('2026-07-06T10:00:00+09:00');
assert(isRecentDdStale('20260703', mon) === true, 'stale when recent < anchor');
assert(isRecentDdStale('20260706', mon) === false, 'fresh when recent = anchor');
assert(kstYmd(mon) === '20260706', 'kst ymd monday');
assert(kstAnchorYmd(mon) === '20260706', 'anchor weekday = today');

const tue = new Date('2026-07-07T10:00:00+09:00');
assert(kstAnchorYmd(tue) === '20260707', 'anchor Tue 7/7');
assert(isRecentDdStale('20260703', tue) === true, 'stale Jul3 vs Jul7 anchor');
assert(isKrxRegularSession(tue) === true, 'Tue 10:00 in session');
assert(shouldUseLive1dReturns('20260703', tue) === true, '1D Naver during session');

const tueClose = new Date('2026-07-07T15:30:00+09:00');
assert(isKrxRegularSession(tueClose) === true, '15:30 still in session');
assert(shouldUseLive1dReturns('20260703', tueClose) === true, '1D Naver at 15:30');

const tueAfter = new Date('2026-07-07T15:31:00+09:00');
assert(isKrxRegularSession(tueAfter) === false, '15:31 off session');
assert(shouldUseLive1dReturns('20260703', tueAfter) === true, '1D Naver off-hours after 15:31');

const tuePre = new Date('2026-07-07T08:59:00+09:00');
assert(isKrxRegularSession(tuePre) === false, 'before 09:00 off session');
assert(shouldUseLive1dReturns('20260703', tuePre) === true, '1D Naver before 09:00');

const sun = new Date('2026-07-05T12:00:00+09:00');
assert(kstAnchorYmd(sun) === '20260703', 'anchor Sun → Fri 7/3');

assert(calcLiveRetFromSnapPct(110000, 100000, 5) === 15.5, '20d live from snap 5% ref');
assert(pastMcapFromSnapRet(100e12, 10) === 100e12 / 1.1, 'past mcap from snap ret');

const pastMap = past1dMcapMapFromSnap({
  quotes: {
    '005930': { past1dMcap: 400e12, refMcap: 410e12, refClose: 70000 },
    '000660': { past1dMcap: 100e12, refMcap: 105e12, refClose: 200000 },
  },
});
assert(pastMap.get('005930') === 400e12, 'past1d mcap map');

const ret20Map = pastMcapMapFromSnapRet({
  quotes: {
    '005930': { refMcap: 410e12, ret20dPct: 5 },
  },
}, 'ret20dPct');
assert(Math.abs(ret20Map.get('005930') - 410e12 / 1.05) < 1, 'past20 mcap map');

const companies = [
  { ticker: '005930' },
  { ticker: '000660' },
];
const liveItems = {
  '005930': { last: 73500 },
  '000660': { last: 210000 },
};
const snapQuotes = {
  '005930': { refMcap: 410e12, refClose: 70000 },
  '000660': { refMcap: 105e12, refClose: 200000 },
};

const ret = sectorReturnMcapRatio(companies, function (key) {
  const row = snapQuotes[key];
  const q = liveItems[key];
  if (!row || !q) return null;
  return calcLiveMcapWon(row.refMcap, q.last, row.refClose);
}, pastMap);

assert(ret != null && isFinite(ret), 'sector live 1d computed');
assert(Math.abs(ret - (((410e12 * 1.05 + 105e12 * 1.05) / (400e12 + 100e12)) - 1) * 100) < 0.01, 'sector ratio math');

console.log('All live return checks passed (ret=' + ret.toFixed(4) + '%).');
