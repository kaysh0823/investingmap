/**
 * Unit tests: Naver trade-marker parsing + holiday-aware session decision.
 * Run: node scripts/verify_naver_session.mjs
 */
import {
  parseNaverTradeMeta,
  parseNaverSiseHtml,
  parseNaverMobileIntegration,
  parseNaverBasicQuote,
  mergeNaverIntoQuote,
  emptyQuote,
  resolveNaverSession,
} from '../functions/lib/naver_sise_quotes.mjs';
import { detectNaverStale } from './sync_quotes_to_supabase.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

function makeTickers(n) {
  return Array.from({ length: n }, (_, i) => String(100000 + i).padStart(6, '0'));
}

function makeUnchangedQuotes(tickers, sameRatio = 0.95) {
  const prev = new Map();
  const quotes = {};
  const sameCount = Math.floor(tickers.length * sameRatio);
  tickers.forEach((t, i) => {
    const last = 10000 + i;
    prev.set(t, last);
    quotes[t] = { last: i < sameCount ? last : last + 1 };
  });
  return { tickers, prevLastByTicker: prev, naverQuotes: quotes };
}

/** Fixed KST wall times via UTC offset (+09:00). */
function kstAt(ymd, hh, mm) {
  return new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
}

// ── Sample HTML fragments (mirroring finance.naver.com/item/sise.naver) ──
const CLOSED_HTML = `
  <span id="time">
    <em class="date">2026.07.16 <span>기준(KRX 장마감)</span></em>
  </span>
  <em class="realtime"><span class="blind">실시간</span></em>
  <dd>전일가 247,500</dd>
  <dd>시가 257,000</dd>
  <dd>고가 273,000</dd>
  <dd>상한가 321,500</dd>
  <dd>저가 252,500</dd>
  <dd>하한가 173,500</dd>
  <dd>거래량 26,093,355</dd>
`;

const LIVE_HTML = `
  <span id="time">
    <em class="date">2026.07.17 <span>실시간</span></em>
  </span>
`;

const NO_MARKER_HTML = `<div>no date here</div>`;

// ── parseNaverTradeMeta ──
const closed = parseNaverTradeMeta(CLOSED_HTML);
assert(closed.tradeDate === '2026-07-16', `closed tradeDate: ${closed.tradeDate}`);
assert(closed.marketClosed === true, `closed marketClosed: ${closed.marketClosed}`);

const live = parseNaverTradeMeta(LIVE_HTML);
assert(live.tradeDate === '2026-07-17', `live tradeDate: ${live.tradeDate}`);
assert(live.marketClosed === false, `live marketClosed: ${live.marketClosed}`);

const none = parseNaverTradeMeta(NO_MARKER_HTML);
assert(none.tradeDate === null, `no-marker tradeDate: ${none.tradeDate}`);
assert(none.marketClosed === null, `no-marker marketClosed: ${none.marketClosed}`);

// parseNaverSiseHtml surfaces the same markers + session OHLCV
const parsed = parseNaverSiseHtml(CLOSED_HTML);
assert(parsed.tradeDate === '2026-07-16', 'sise tradeDate');
assert(parsed.marketClosed === true, 'sise marketClosed');
assert(parsed.open === 257000, `sise open: ${parsed.open}`);
assert(parsed.high === 273000, `sise high: ${parsed.high}`);
assert(parsed.low === 252500, `sise low: ${parsed.low}`);
assert(parsed.volume === 26093355, `sise volume: ${parsed.volume}`);

// When 장마감 and last is present, close falls back to last (regular close).
const closedWithLast = parseNaverSiseHtml(
  CLOSED_HTML + '<span id="_nowVal">273,000</span>',
);
assert(closedWithLast.close === 273000, `장마감 close=last: ${closedWithLast.close}`);
assert(closedWithLast.marketClosed === true, 'sise marketClosed');

const mobile = parseNaverMobileIntegration({
  totalInfos: [
    { code: 'openPrice', value: '1,598,000' },
    { code: 'highPrice', value: '1,721,000' },
    { code: 'lowPrice', value: '1,576,000' },
    { code: 'accumulatedTradingVolume', value: '9,397,942' },
    { code: 'lastClosePrice', value: '1,500,000' },
  ],
  dealTrendInfos: [{ closePrice: '1,691,000', accumulatedTradingVolume: '5,452,849' }],
});
assert(mobile.open === 1598000, `mobile open: ${mobile.open}`);
assert(mobile.high === 1721000, `mobile high: ${mobile.high}`);
assert(mobile.low === 1576000, `mobile low: ${mobile.low}`);
assert(mobile.volume === 9397942, `mobile volume: ${mobile.volume}`);
assert(mobile.last == null, `mobile last must not use dealTrend: ${mobile.last}`);
assert(mobile.sessionClose === 1691000, `mobile sessionClose: ${mobile.sessionClose}`);
assert(mobile.prevClose === 1500000, `mobile prevClose: ${mobile.prevClose}`);

const basic = parseNaverBasicQuote({
  closePrice: '255,000',
  fluctuationsRatio: '0.59',
  compareToPreviousClosePrice: '1,500',
  compareToPreviousPrice: { code: '2', name: 'RISING' },
  localTradedAt: '2026-09-17T11:00:00+09:00',
  marketStatus: 'OPEN',
});
assert(basic.last === 255000, `basic last: ${basic.last}`);
assert(basic.prevClose === 253500, `basic prevClose: ${basic.prevClose}`);
assert(basic.chg1dPct === 0.59, `basic chg: ${basic.chg1dPct}`);
assert(basic.tradeDate === '2026-09-17', `basic tradeDate: ${basic.tradeDate}`);
assert(basic.marketClosed === false, `basic marketClosed: ${basic.marketClosed}`);

// ── resolveNaverSession decision matrix ──
const holiday = resolveNaverSession({
  clockRegular: true, tradeDate: '2026-07-16', marketClosed: true, todayYmdDash: '2026-07-17',
});
assert(holiday.regularSession === false, 'holiday regularSession false');
assert(holiday.marketClosed === true, 'holiday marketClosed true');
assert(holiday.tradeDate === '2026-07-16', 'holiday tradeDate carried');

const staleDate = resolveNaverSession({
  clockRegular: true, tradeDate: '2026-07-16', marketClosed: null, todayYmdDash: '2026-07-17',
});
assert(staleDate.regularSession === false, 'stale date → not regular');

const trading = resolveNaverSession({
  clockRegular: true, tradeDate: '2026-07-17', marketClosed: false, todayYmdDash: '2026-07-17',
});
assert(trading.regularSession === true, 'trading regularSession true');
assert(trading.marketClosed === false, 'trading marketClosed false');

const afterHours = resolveNaverSession({
  clockRegular: false, tradeDate: '2026-07-17', marketClosed: true, todayYmdDash: '2026-07-17',
});
assert(afterHours.regularSession === false, 'after-hours regularSession false');

const noMarker = resolveNaverSession({
  clockRegular: true, tradeDate: null, marketClosed: null, todayYmdDash: '2026-07-17',
});
assert(noMarker.regularSession === true, 'no marker → trust clock (regular)');

// ── detectNaverStale ──
{
  const { tickers, prevLastByTicker, naverQuotes } = makeUnchangedQuotes(makeTickers(40), 0.95);
  const aftermarket = detectNaverStale({
    tickers,
    naverQuotes,
    prevLastByTicker,
    consensusTradeDate: '2026-09-17',
    todayYmdDash: '2026-09-17',
    regularSession: false,
    now: kstAt('2026-09-17', 17, 0),
  });
  assert(aftermarket.stale === false, 'aftermarket 17:00 95% unchanged → stale=false');
  assert(aftermarket.nonTradingDay === false, 'aftermarket not nonTradingDay');

  const regularStale = detectNaverStale({
    tickers,
    naverQuotes,
    prevLastByTicker,
    consensusTradeDate: '2026-09-17',
    todayYmdDash: '2026-09-17',
    regularSession: true,
    now: kstAt('2026-09-17', 11, 0),
  });
  assert(regularStale.stale === true, 'regular 11:00 95% unchanged → stale=true');
  assert(regularStale.nonTradingDay === false, 'regular stale is not nonTradingDay');

  const nonTrading = detectNaverStale({
    tickers,
    naverQuotes,
    prevLastByTicker,
    consensusTradeDate: '2026-09-16',
    todayYmdDash: '2026-09-17',
    regularSession: true,
    now: kstAt('2026-09-17', 11, 0),
  });
  assert(nonTrading.stale === false, 'tradeDate=yesterday → stale=false');
  assert(nonTrading.nonTradingDay === true, 'tradeDate=yesterday → nonTradingDay=true');
}

// mobile sessionClose must not fill merged.close while market is open
{
  let merged = emptyQuote();
  merged = mergeNaverIntoQuote(
    merged,
    { sessionClose: 253500, last: null, marketClosed: false },
    { preferNaverLast: true },
  );
  merged = mergeNaverIntoQuote(
    merged,
    { close: null, last: null, marketClosed: false },
    { preferNaverLast: true },
  );
  assert(merged.sessionClose === 253500, `merged.sessionClose: ${merged.sessionClose}`);
  assert(merged.close == null, `merged.close must stay null: ${merged.close}`);
}

console.log('All Naver session checks passed.');
