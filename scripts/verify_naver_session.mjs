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
import {
  detectNaverStale,
  stockReturnFieldsFromRefs,
  toSupabaseRow,
  resolveRegularSessionClose,
  applySessionCloseLock,
  closeConflictChainAction,
} from './sync_quotes_to_supabase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeStockReturns, roundPct } from '../functions/lib/returns_core.mjs';
import { kstDateParts } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
assert(basic.open == null && basic.high == null && basic.low == null, 'basic without OHLV stays null');

const basicOhlv = parseNaverBasicQuote({
  closePrice: '255,000',
  openPrice: '250,000',
  highPrice: '260,000',
  lowPrice: '248,500',
  accumulatedTradingVolume: '1,234,567',
  compareToPreviousClosePrice: '1,500',
  compareToPreviousPrice: { code: '2', name: 'RISING' },
  localTradedAt: '2026-09-17T11:00:00+09:00',
  marketStatus: 'OPEN',
});
assert(basicOhlv.open === 250000, `basic open: ${basicOhlv.open}`);
assert(basicOhlv.high === 260000, `basic high: ${basicOhlv.high}`);
assert(basicOhlv.low === 248500, `basic low: ${basicOhlv.low}`);
assert(basicOhlv.volume === 1234567, `basic volume: ${basicOhlv.volume}`);

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

// sessionClose must never become _sessionClose (NXT / mobile integrated close)
{
  const row = toSupabaseRow(
    '005930',
    { close: null, sessionClose: 253500, last: 250000 },
    null,
    new Date().toISOString(),
    false,
    true,
  );
  assert(row._sessionClose === null, `_sessionClose must be null, got ${row._sessionClose}`);
  assert(row.session_open === undefined, 'B-path must omit session_open');
  assert(row.session_high === undefined, 'B-path must omit session_high');
  assert(row.session_low === undefined, 'B-path must omit session_low');
  assert(row.session_volume === undefined, 'B-path must omit session_volume');
}

{
  const liveRow = toSupabaseRow(
    '005930',
    { last: 255000, open: 250000, high: 260000, low: 248500, volume: 1234567.8, close: null },
    null,
    new Date().toISOString(),
    true,
    false,
  );
  assert(liveRow.session_open === 250000, `A-path session_open: ${liveRow.session_open}`);
  assert(liveRow.session_high === 260000, `A-path session_high: ${liveRow.session_high}`);
  assert(liveRow.session_low === 248500, `A-path session_low: ${liveRow.session_low}`);
  assert(liveRow.session_volume === 1234568, `A-path session_volume rounded: ${liveRow.session_volume}`);
  assert(liveRow._sessionOpen === 250000, 'A-path keeps _sessionOpen for history helpers');
}

// resolveRegularSessionClose never uses last / marketClosed marker
{
  assert(
    resolveRegularSessionClose({ _sessionClose: null, last: 253500, _naverMarketClosed: true }) === null,
    '장마감 last must not become regular close',
  );
  assert(
    resolveRegularSessionClose({ _sessionClose: 252500, last: 253500 }) === 252500,
    '_sessionClose preferred',
  );
}

// Session-close lock: existing mdcstat close wins; volume may refresh
{
  const existing = new Map([
    [
      '005930',
      {
        ticker: '005930',
        open: 270000,
        high: 275000,
        low: 269000,
        close: 274000,
        volume: 10_000_000,
        source: 'mdcstat',
      },
    ],
  ]);
  const locked = applySessionCloseLock(
    [
      {
        ticker: '005930',
        trade_date: '2026-03-20',
        open: 271000,
        high: 276000,
        low: 270000,
        close: 274500,
        volume: 12_500_000,
        source: 'mdcstat',
      },
    ],
    existing,
  );
  assert(locked.conflicts === 1, `close conflict count: ${locked.conflicts}`);
  assert(locked.rows.length === 1, 'one merged row');
  assert(locked.rows[0].close === 274000, `locked close: ${locked.rows[0].close}`);
  assert(locked.rows[0].open === 270000, `locked open: ${locked.rows[0].open}`);
  assert(locked.rows[0].high === 275000, `locked high: ${locked.rows[0].high}`);
  assert(locked.rows[0].low === 269000, `locked low: ${locked.rows[0].low}`);
  assert(locked.rows[0].volume === 12_500_000, `volume refresh: ${locked.rows[0].volume}`);
  assert(locked.rows[0].source === 'mdcstat', 'source stays locked');

  // conflict ≥1% of hub → warning only, never exit 3 (chain continues)
  const action = closeConflictChainAction(3, 100); // 3%
  assert(action.warn === true, '≥1% should warn');
  assert(action.exitCode === 0, `CLOSE_CONFLICT must exitCode 0, got ${action.exitCode}`);
  const low = closeConflictChainAction(0, 100);
  assert(low.warn === false && low.exitCode === 0, 'no conflict → exit 0, no warn gate');
}

// ── stockReturnFieldsFromRefs A/B/C edge cases ──
{
  const refsFile = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'hub_return_refs.json'), 'utf8'),
  );
  const closes = refsFile.quotes['005930'].closes;
  const L = closes.length;
  const official1d = roundPct(closes[L - 1] / closes[L - 2] - 1);
  const prevDd = String(refsFile.recentDd || '').replace(/-/g, '');
  assert(/^\d{8}$/.test(prevDd), 'refs.recentDd');

  function dash(ymd) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }
  function nextYmd(ymd) {
    const d = new Date(`${dash(ymd)}T12:00:00+09:00`);
    d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
    const p = kstDateParts(d);
    return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
  }
  let simToday = nextYmd(prevDd);
  for (let i = 0; i < 5; i++) {
    const probe = kstAt(dash(simToday), 12, 0);
    const wp = kstDateParts(probe);
    if (wp.weekday >= 1 && wp.weekday <= 5) break;
    simToday = nextYmd(simToday);
  }
  const refs = { ...refsFile, recentDd: prevDd };
  const naverPrev = { tradeDate: prevDd, last: closes[L - 1], sessionClose: closes[L - 1] + 999 };
  const naverToday = { tradeDate: simToday, last: closes[L - 1] + 5000, sessionClose: closes[L - 1] + 999 };

  // 08:30 pre-open → official k=0, refs tip 1D
  {
    const now = kstAt(dash(simToday), 8, 30);
    const fields = stockReturnFieldsFromRefs('005930', naverPrev, refs, false, null, now);
    assert(fields.chg_1d_pct != null, '08:30 chg_1d_pct');
    assert(
      Math.abs(fields.chg_1d_pct - official1d) <= 0.01,
      `08:30 chg=${fields.chg_1d_pct} vs official=${official1d}`,
    );
    if (official1d !== 0) {
      assert(fields.chg_1d_pct !== 0, '08:30 must not force 0%');
    }
  }

  // Holiday afternoon: tradeDate still prev → official (not B)
  {
    const now = kstAt(dash(simToday), 16, 0);
    const fields = stockReturnFieldsFromRefs('005930', naverPrev, refs, false, null, now);
    assert(
      Math.abs(fields.chg_1d_pct - official1d) <= 0.01,
      `holiday chg=${fields.chg_1d_pct} vs official=${official1d}`,
    );
  }

  // 15:45 B without overrideLast → numerator null (chg null); with override → close return
  {
    const now = kstAt(dash(simToday), 15, 45);
    const missing = stockReturnFieldsFromRefs('005930', naverToday, refs, false, null, now);
    assert(missing.chg_1d_pct == null, `B missing override must be null, got ${missing.chg_1d_pct}`);
    const override = closes[L - 1] + 1000;
    const ok = stockReturnFieldsFromRefs('005930', naverToday, refs, false, override, now);
    const expected = computeStockReturns({
      numerator: override,
      closes,
      k: 1,
    });
    assert(ok.chg_1d_pct != null, 'B with overrideLast');
    assert(
      Math.abs(ok.chg_1d_pct - expected.chg1dPct) <= 0.01,
      `B override chg=${ok.chg_1d_pct} vs ${expected.chg1dPct}`,
    );
  }
}

console.log('All Naver session checks passed.');
