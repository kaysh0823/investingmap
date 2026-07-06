/**
 * Unit tests for lib/return_live.mjs
 */
import {
  calcLiveChg1dPct,
  calcLiveMcapWon,
  isRecentDdStale,
  kstYmd,
  sectorReturnMcapRatio,
  past1dMcapMapFromSnap,
} from '../lib/return_live.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calcLiveChg1dPct(105000, 100000) === 5, 'chg1d 5%');
assert(calcLiveChg1dPct(95000, 100000) === -5, 'chg1d -5%');
assert(calcLiveChg1dPct(null, 100000) === null, 'chg1d null last');

assert(calcLiveMcapWon(1e12, 110000, 100000) === 1.1e12, 'live mcap scale');

const mon = new Date('2026-07-06T10:00:00+09:00');
assert(isRecentDdStale('20260703', mon) === true, 'stale when recent < today');
assert(isRecentDdStale('20260706', mon) === false, 'fresh when recent = today');
assert(kstYmd(mon) === '20260706', 'kst ymd monday');

const pastMap = past1dMcapMapFromSnap({
  quotes: {
    '005930': { past1dMcap: 400e12, refMcap: 410e12, refClose: 70000 },
    '000660': { past1dMcap: 100e12, refMcap: 105e12, refClose: 200000 },
  },
});
assert(pastMap.get('005930') === 400e12, 'past1d mcap map');

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
