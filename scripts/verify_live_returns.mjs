/**
 * Unit tests for lib/return_live.mjs + KRX holiday session gates
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
  refMcapMapFromSnap,
  pastMcapMapFromSnapRet,
} from '../lib/return_live.mjs';
import {
  isKrxHoliday,
  isKrxRegularSession,
  isKrxTradingDay,
  krxSessionInfo,
} from '../functions/lib/krx_session.mjs';

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
assert(shouldUseLive1dReturns('20260703', tueAfter) === true, '1D Naver off-hours after 15:31 on trading day');

const tuePre = new Date('2026-07-07T08:59:00+09:00');
assert(isKrxRegularSession(tuePre) === false, 'before 09:00 off session');
assert(shouldUseLive1dReturns('20260703', tuePre) === true, '1D Naver before 09:00 on trading day');

const sun = new Date('2026-07-05T12:00:00+09:00');
assert(kstAnchorYmd(sun) === '20260703', 'anchor Sun → Fri 7/3');
assert(isKrxTradingDay(sun) === false, 'Sun not trading day');
assert(shouldUseLive1dReturns('20260703', sun) === false, 'no live 1D overlay on weekend');

const holiday = new Date('2026-07-17T10:00:00+09:00');
assert(isKrxHoliday(holiday) === true, '2026-07-17 is KRX holiday');
assert(isKrxTradingDay(holiday) === false, 'holiday not trading day');
assert(isKrxRegularSession(holiday) === false, 'holiday not regular session');
assert(krxSessionInfo(holiday).regular === false, 'session info regular=false on holiday');
assert(krxSessionInfo(holiday).holiday === true, 'session info holiday=true');
assert(kstAnchorYmd(holiday) === '20260716', 'holiday anchor → prior trading day Thu 7/16');
assert(shouldUseLive1dReturns('20260716', holiday) === false, 'no live 1D overlay on holiday');

assert(calcLiveRetFromSnapPct(110000, 100000, 5) === 15.5, '20d live from snap 5% ref');
assert(pastMcapFromSnapRet(100e12, 10) === 100e12 / 1.1, 'past mcap from snap ret');

const pastMap = past1dMcapMapFromSnap({
  quotes: {
    '005930': { past1dMcap: 400e12, refMcap: 410e12, refClose: 70000 },
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
const refPastMap = refMcapMapFromSnap({
  quotes: {
    '005930': { past1dMcap: 400e12, refMcap: 410e12, refClose: 70000 },
    '000660': { past1dMcap: 100e12, refMcap: 105e12, refClose: 200000 },
  },
});
assert(refPastMap.get('005930') === 410e12, 'ref mcap map');

const ret = sectorReturnMcapRatio(companies, function (key) {
  const row = snapQuotes[key];
  const q = liveItems[key];
  if (!row || !q) return null;
  return calcLiveMcapWon(row.refMcap, q.last, row.refClose);
}, refPastMap);

assert(ret != null && isFinite(ret), 'sector live 1d computed');
assert(Math.abs(ret - 5) < 0.01, 'sector live 1d vs ref mcap = 5%');

const past20Map = pastMcapMapFromSnapRet({
  quotes: {
    '005930': { refMcap: 410e12, ret20dPct: 0 },
    '000660': { refMcap: 105e12, ret20dPct: 0 },
  },
}, 'ret20dPct');
const ret20 = sectorReturnMcapRatio(companies, function (key) {
  const row = snapQuotes[key];
  const q = liveItems[key];
  if (!row || !q) return null;
  return calcLiveMcapWon(row.refMcap, q.last, row.refClose);
}, past20Map);
assert(ret20 != null && Math.abs(ret20 - 5) < 0.01, 'sector live 20d vs snap ret past = 5%');

console.log('All live return checks passed (1d=' + ret.toFixed(4) + '%, 20d=' + ret20.toFixed(4) + '%).');
