/**
 * Unit tests: Naver trade-marker parsing + holiday-aware session decision.
 * Run: node scripts/verify_naver_session.mjs
 */
import {
  parseNaverTradeMeta,
  parseNaverSiseHtml,
  resolveNaverSession,
} from '../functions/lib/naver_sise_quotes.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

// ── Sample HTML fragments (mirroring finance.naver.com/item/sise.naver) ──
const CLOSED_HTML = `
  <span id="time">
    <em class="date">2026.07.16 <span>기준(KRX 장마감)</span></em>
  </span>
  <em class="realtime"><span class="blind">실시간</span></em>
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

// parseNaverSiseHtml surfaces the same markers
const parsed = parseNaverSiseHtml(CLOSED_HTML);
assert(parsed.tradeDate === '2026-07-16', 'sise tradeDate');
assert(parsed.marketClosed === true, 'sise marketClosed');

// ── resolveNaverSession decision matrix ──
// Holiday: wall clock says session, but Naver marker says 장마감 → not regular.
const holiday = resolveNaverSession({
  clockRegular: true, tradeDate: '2026-07-16', marketClosed: true, todayYmdDash: '2026-07-17',
});
assert(holiday.regularSession === false, 'holiday regularSession false');
assert(holiday.marketClosed === true, 'holiday marketClosed true');
assert(holiday.tradeDate === '2026-07-16', 'holiday tradeDate carried');

// Holiday detected purely by stale trade date (marker missing).
const staleDate = resolveNaverSession({
  clockRegular: true, tradeDate: '2026-07-16', marketClosed: null, todayYmdDash: '2026-07-17',
});
assert(staleDate.regularSession === false, 'stale date → not regular');

// Live trading day: clock in session + fresh trade date + open marker.
const trading = resolveNaverSession({
  clockRegular: true, tradeDate: '2026-07-17', marketClosed: false, todayYmdDash: '2026-07-17',
});
assert(trading.regularSession === true, 'trading regularSession true');
assert(trading.marketClosed === false, 'trading marketClosed false');

// After hours on a real trading day: clock closed → not regular.
const afterHours = resolveNaverSession({
  clockRegular: false, tradeDate: '2026-07-17', marketClosed: true, todayYmdDash: '2026-07-17',
});
assert(afterHours.regularSession === false, 'after-hours regularSession false');

// No marker at all, clock in session → trust the clock.
const noMarker = resolveNaverSession({
  clockRegular: true, tradeDate: null, marketClosed: null, todayYmdDash: '2026-07-17',
});
assert(noMarker.regularSession === true, 'no marker → trust clock (regular)');

console.log('All Naver session checks passed.');
