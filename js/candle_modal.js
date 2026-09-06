/**
 * Map company candle modal: lightweight-charts v5 + /api/ticker_ohlc.
 * One chart, six native panes (price / volume / MACD / investor OSC / BBW%·DISP% / ATR%).
 * The panes share a single time scale, so their x axes align by construction.
 */
(function (global) {
  'use strict';

  /** lightweight-charts is not on cdnjs; jsDelivr serves the npm standalone build. */
  var LWC_SRC =
    'https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js';

  var RANGES = ['3m', '6m', '1y', '3y', '5y'];
  var INTERVALS = ['daily', 'weekly'];
  var DEFAULT_RANGE_BY_INTERVAL = { daily: '1y', weekly: '5y' };
  var DISPLAY_BARS = {
    daily: { '3m': 50, '6m': 120, '1y': 200, '3y': 750, '5y': 1250 },
    weekly: { '3m': 13, '6m': 26, '1y': 52, '3y': 156, '5y': 260 },
  };
  var RIGHT_OFFSET_BARS = 7;
  var AXIS_FONT_SIZE = 11;
  var PANE_MARGINS = {
    price: { top: 0.06, bottom: 0.1 },
    vol: { top: 0.12, bottom: 0.08 },
    macd: { top: 0.12, bottom: 0.12 },
    investor: { top: 0.12, bottom: 0.12 },
    norm: { top: 0.12, bottom: 0.12 },
    atr: { top: 0.12, bottom: 0.12 },
  };
  /** Pane order and relative heights; index doubles as the v5 pane index. */
  var PANES = [
    { key: 'price', stretch: 40 },
    { key: 'vol', stretch: 13 },
    { key: 'macd', stretch: 16 },
    { key: 'investor', stretch: 16 },
    { key: 'norm', stretch: 16 },
    { key: 'atr', stretch: 15 },
  ];
  /** lightweight-charts draws a 1px separator between panes. */
  var PANE_SEPARATOR_PX = 1;
  /**
   * Price-pane SMA set: daily 5/20/50/120, weekly 4/13/26/52 (same color order).
   * Slot ids keep crosshair/byTime keys stable (ma5…ma120 name the slot, not the period).
   */
  var PRICE_MA_SPECS = [
    { daily: 5, weekly: 4, color: '#ff7b72', slot: 'ma5', hideLast: true },
    { daily: 20, weekly: 13, color: '#3fb950', slot: 'ma20', hideLast: true },
    { daily: 50, weekly: 26, color: '#e3b341', slot: 'ma50', hideLast: false },
    { daily: 120, weekly: 52, color: '#58a6ff', slot: 'ma120', hideLast: false },
  ];
  /** Disparity% stays on a fixed 50-bar SMA of the active series (not the weekly MA26 slot). */
  var DISP_MA_PERIOD = 50;
  var MA_VOL = 20;
  var BB_PERIOD = 20;
  var BB_MULT = 2;
  /** Trailing min/max window for BBW% and DISP% normalization (not MA periods). */
  var NORM_WINDOW = 125;
  var MACD_FAST = 12;
  var MACD_SLOW = 26;
  var MACD_SIGNAL = 9;
  var ATR_PERIOD = 3;
  var ATR_SIGNAL = 9;
  var INVESTOR_OSC_LEVELS = [20, 50, 80];
  var INVESTOR_CUM_OPTIONS = [5, 10, 20];
  var INVESTOR_PERIOD_OPTIONS = [20, 50];
  var INVESTOR_CUM_STORAGE = 'im_inv_cum';
  var INVESTOR_PERIOD_STORAGE = 'im_inv_period';
  var DEFAULT_INVESTOR_CUM = 10;
  var DEFAULT_INVESTOR_PERIOD = 20;
  /** Weekly investor OSC is fixed (no cum/period toggle). */
  var WEEKLY_INVESTOR_CUM = 4;
  var WEEKLY_INVESTOR_PERIOD = 13;

  function paneIndexMap() {
    var map = Object.create(null);
    for (var i = 0; i < PANES.length; i++) map[PANES[i].key] = i;
    return map;
  }

  var PANE_INDEX = paneIndexMap();

  /** Investor OSC pane stays visible on weekly (fixed 4w/13w). */
  function paneStretch(spec, interval) {
    return spec.stretch;
  }

  function priceMaPeriods(interval) {
    var weekly = interval === 'weekly';
    return PRICE_MA_SPECS.map(function (spec) {
      return weekly ? spec.weekly : spec.daily;
    });
  }

  function maLabel(period) {
    return 'MA' + period;
  }

  var I18N = {
    ko: {
      close: '닫기',
      expand: '확대',
      collapse: '축소',
      loading: '차트 불러오는 중…',
      empty: '표시할 일봉 데이터가 없습니다.',
      error: '차트를 불러오지 못했습니다.',
      range3m: '3M',
      range6m: '6M',
      range1y: '1Y',
      range3y: '3Y',
      range5y: '5Y',
      daily: '일봉',
      weekly: '주봉',
      open: '시가',
      high: '고가',
      low: '저가',
      closePx: '종가',
      volume: '거래량',
      vma20: 'VMA20',
      bbw: 'BBW%',
      disp: '이격도%',
      macd: 'MACD',
      macdSignal: 'Signal',
      macdHist: 'Hist',
      instOsc: '기관',
      frgnOsc: '외국인',
      foreignRatio: '외국인 보유비율(%)',
      atr: 'ATR(3)/종가%',
      atrSignal: 'ATR EMA9',
      chartLabel: '일봉 차트',
      weeklyChartLabel: '주봉 차트',
      panePrice: '가격',
      paneVol: '거래량',
      paneMacd: 'MACD',
      paneInvestorTpl: '투자자 OSC · 기관·외국인·보유비율 · 누적 {CUM}{UNIT} / 기준 {PER}{UNIT} (0~100)',
      paneInvestorUnitDay: '일',
      paneInvestorUnitWeek: '주',
      paneNorm: 'BBW% · 이격도% (125일)',
      paneAtr: 'ATR(3)/종가% · EMA9',
      liveSession: '장중(현재가)',
    },
    en: {
      close: 'Close',
      expand: 'Expand',
      collapse: 'Restore',
      loading: 'Loading chart…',
      empty: 'No daily candle data available.',
      error: 'Failed to load chart.',
      range3m: '3M',
      range6m: '6M',
      range1y: '1Y',
      range3y: '3Y',
      range5y: '5Y',
      daily: 'Daily',
      weekly: 'Weekly',
      open: 'Open',
      high: 'High',
      low: 'Low',
      closePx: 'Close',
      volume: 'Volume',
      vma20: 'VMA20',
      bbw: 'BBW%',
      disp: 'DISP%',
      macd: 'MACD',
      macdSignal: 'Signal',
      macdHist: 'Hist',
      instOsc: 'Inst',
      frgnOsc: 'Frgn',
      foreignRatio: 'Foreign hold %',
      atr: 'ATR(3)/Close%',
      atrSignal: 'ATR EMA9',
      chartLabel: 'Daily chart',
      weeklyChartLabel: 'Weekly chart',
      panePrice: 'Price',
      paneVol: 'Volume',
      paneMacd: 'MACD',
      paneInvestorTpl: 'Investor OSC · Inst·Frgn·Hold% · cum {CUM}{UNIT} / base {PER}{UNIT} (0-100)',
      paneInvestorUnitDay: 'd',
      paneInvestorUnitWeek: 'w',
      paneNorm: 'BBW% · DISP% (125d)',
      paneAtr: 'ATR(3)/Close% · EMA9',
      liveSession: 'Live (last)',
    },
  };

  var state = {
    open: false,
    expanded: false,
    ticker: null,
    name: '',
    range: DEFAULT_RANGE_BY_INTERVAL.daily,
    interval: 'daily',
    investorCum: DEFAULT_INVESTOR_CUM,
    investorPeriod: DEFAULT_INVESTOR_PERIOD,
    crosshairTime: null,
    rangeByInterval: {
      daily: DEFAULT_RANGE_BY_INTERVAL.daily,
      weekly: DEFAULT_RANGE_BY_INTERVAL.weekly,
    },
    chart: null,
    seriesRefs: null,
    barsByTime: null,
    fetchToken: 0,
    lwcPromise: null,
    lastFocus: null,
    resizeObs: null,
    liveOverlay: false,
    liveBarTime: null,
    panelData: null,
  };

  /* ---------- indicator utils ---------- */

  function sma(values, period) {
    var out = new Array(values.length);
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      out[i] = null;
      if (v == null || !isFinite(v)) {
        sum = 0;
        continue;
      }
      sum += v;
      if (i >= period) {
        var drop = values[i - period];
        if (drop != null && isFinite(drop)) sum -= drop;
        else {
          sum = 0;
          for (var j = i - period + 1; j <= i; j++) {
            if (values[j] != null && isFinite(values[j])) sum += values[j];
          }
        }
      }
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  /** Population standard deviation over trailing `period` (Bollinger convention). */
  function stddev(values, period, means) {
    var out = new Array(values.length);
    for (var i = 0; i < values.length; i++) {
      out[i] = null;
      var mean = means[i];
      if (mean == null || !isFinite(mean) || i < period - 1) continue;
      var sumSq = 0;
      var ok = true;
      for (var j = i - period + 1; j <= i; j++) {
        var v = values[j];
        if (v == null || !isFinite(v)) {
          ok = false;
          break;
        }
        var d = v - mean;
        sumSq += d * d;
      }
      if (ok) out[i] = Math.sqrt(sumSq / period);
    }
    return out;
  }

  function bollinger(closes, period, mult) {
    var middle = sma(closes, period);
    var sd = stddev(closes, period, middle);
    var upper = new Array(closes.length);
    var lower = new Array(closes.length);
    var width = new Array(closes.length);
    for (var i = 0; i < closes.length; i++) {
      upper[i] = null;
      lower[i] = null;
      width[i] = null;
      if (middle[i] == null || sd[i] == null || !(middle[i] > 0)) continue;
      upper[i] = middle[i] + mult * sd[i];
      lower[i] = middle[i] - mult * sd[i];
      width[i] = (upper[i] - lower[i]) / middle[i];
    }
    return { middle: middle, upper: upper, lower: lower, width: width };
  }

  /**
   * Normalize a series to 0..100 with a PAST-only trailing window (shared by BBW% / DISP%).
   * At each i: use values[i-window+1 .. i] (never future bars).
   * pct_i = (values_i - min) / (max - min) * 100. Requires `window` finite values in range.
   */
  function trailingMinMaxNorm(values, window) {
    var out = new Array(values.length);
    var wLen = window | 0;
    if (wLen < 2) {
      for (var z = 0; z < values.length; z++) out[z] = null;
      return out;
    }
    for (var i = 0; i < values.length; i++) {
      out[i] = null;
      var cur = values[i];
      if (cur == null || !isFinite(cur)) continue;
      var from = i - wLen + 1;
      if (from < 0) continue;
      var minV = Infinity;
      var maxV = -Infinity;
      var n = 0;
      for (var j = from; j <= i; j++) {
        var v = values[j];
        if (v == null || !isFinite(v)) continue;
        n += 1;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      if (n !== wLen) continue;
      if (!(maxV > minV)) {
        out[i] = 50;
        continue;
      }
      out[i] = ((cur - minV) / (maxV - minV)) * 100;
    }
    return out;
  }

  /** @deprecated alias — prefer trailingMinMaxNorm */
  function bandwidthPercentile(widths, window) {
    return trailingMinMaxNorm(widths, window);
  }

  /** Close / MA50 × 100 (null until MA50 is ready). */
  function disparityFromMa(closes, ma) {
    var out = new Array(closes.length);
    for (var i = 0; i < closes.length; i++) {
      out[i] = null;
      var c = closes[i];
      var m = ma[i];
      if (c == null || !isFinite(c) || m == null || !isFinite(m) || !(m > 0)) continue;
      out[i] = (c / m) * 100;
    }
    return out;
  }

  /**
   * Trailing EMA (SMA-seeded). Gaps reset the seed; warmup left as null.
   */
  function ema(values, period) {
    var out = new Array(values.length);
    var k = 2 / (period + 1);
    var seedSum = 0;
    var seedCount = 0;
    var prev = null;
    for (var i = 0; i < values.length; i++) {
      out[i] = null;
      var v = values[i];
      if (v == null || !isFinite(v)) {
        seedSum = 0;
        seedCount = 0;
        prev = null;
        continue;
      }
      if (prev == null) {
        seedSum += v;
        seedCount += 1;
        if (seedCount === period) {
          prev = seedSum / period;
          out[i] = prev;
        }
      } else {
        prev = (v - prev) * k + prev;
        out[i] = prev;
      }
    }
    return out;
  }

  /** MACD = EMA12−EMA26, Signal = EMA9(MACD), Hist = MACD−Signal. */
  function macd(closes, fastPeriod, slowPeriod, signalPeriod) {
    var emaFast = ema(closes, fastPeriod);
    var emaSlow = ema(closes, slowPeriod);
    var line = new Array(closes.length);
    for (var i = 0; i < closes.length; i++) {
      line[i] = null;
      if (emaFast[i] == null || emaSlow[i] == null) continue;
      line[i] = emaFast[i] - emaSlow[i];
    }
    var signal = ema(line, signalPeriod);
    var hist = new Array(closes.length);
    for (var j = 0; j < closes.length; j++) {
      hist[j] = null;
      if (line[j] == null || signal[j] == null) continue;
      hist[j] = line[j] - signal[j];
    }
    return { line: line, signal: signal, hist: hist };
  }

  /** ATR(period) / close × 100 with a trailing SMA of True Range and EMA signal. */
  function atrPercent(bars, period, signalPeriod) {
    var tr = new Array(bars.length);
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var prevClose = i > 0 ? bars[i - 1].c : null;
      var range = bar.h - bar.l;
      if (prevClose != null && isFinite(prevClose)) {
        range = Math.max(range, Math.abs(bar.h - prevClose), Math.abs(bar.l - prevClose));
      }
      tr[i] = isFinite(range) ? range : null;
    }
    var atr = sma(tr, period);
    var pct = new Array(bars.length);
    for (var j = 0; j < bars.length; j++) {
      pct[j] =
        atr[j] != null && isFinite(atr[j]) && bars[j].c > 0
          ? (atr[j] / bars[j].c) * 100
          : null;
    }
    return { value: pct, signal: ema(pct, signalPeriod), tr: tr };
  }

  function isoWeekKey(isoDate) {
    var parts = String(isoDate || '').split('-');
    if (parts.length !== 3) return String(isoDate || '');
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (!isFinite(date.getTime())) return String(isoDate || '');
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  /** Aggregate normalized daily bars into ISO weeks, timestamped by each week's last session. */
  function aggregateWeeklyBars(dailyBars) {
    var out = [];
    var current = null;
    for (var i = 0; i < dailyBars.length; i++) {
      var bar = dailyBars[i];
      var key = isoWeekKey(bar.t);
      if (!current || current.key !== key) {
        if (current) {
          delete current.key;
          out.push(current);
        }
        current = {
          key: key,
          t: bar.t,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: Number(bar.v) || 0,
          live: !!bar.live,
          closeOnly: !!bar.closeOnly,
        };
      } else {
        current.t = bar.t;
        current.h = Math.max(current.h, bar.h);
        current.l = Math.min(current.l, bar.l);
        current.c = bar.c;
        current.v += Number(bar.v) || 0;
        current.live = current.live || !!bar.live;
        current.closeOnly = current.closeOnly && !!bar.closeOnly;
      }
    }
    if (current) {
      delete current.key;
      out.push(current);
    }
    return out;
  }

  /* ---------- i18n / misc ---------- */

  function t() {
    var lang = currentLang();
    return I18N[lang] || I18N.ko;
  }

  function currentLang() {
    try {
      var q = new URLSearchParams(global.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var stored = global.localStorage && localStorage.getItem('im_lang');
      if (stored === 'en' || stored === 'ko') return stored;
    } catch (e) {}
    return document.documentElement.lang === 'en' ? 'en' : 'ko';
  }

  function fmtPrice(n) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ko-KR');
  }

  function fmtVol(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ko-KR');
  }

  function fmtNum(n, digits) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ko-KR', {
      maximumFractionDigits: digits == null ? 2 : digits,
      minimumFractionDigits: 0,
    });
  }

  function rangeForInterval(interval) {
    var key = INTERVALS.indexOf(interval) >= 0 ? interval : 'daily';
    return state.rangeByInterval[key] || DEFAULT_RANGE_BY_INTERVAL[key];
  }

  function ohlcApiUrl(code, range, interval) {
    var origin =
      global.location && global.location.protocol && global.location.protocol.indexOf('http') === 0
        ? global.location.origin
        : '';
    var url =
      origin +
      '/api/ticker_ohlc?code=' +
      encodeURIComponent(code) +
      '&range=' +
      encodeURIComponent(range);
    if (interval === 'weekly') url += '&interval=weekly';
    return url;
  }

  function quotesApiUrl(code) {
    var origin =
      global.location && global.location.protocol && global.location.protocol.indexOf('http') === 0
        ? global.location.origin
        : '';
    return origin + '/api/quotes?codes=' + encodeURIComponent(code);
  }

  /** ISO / timestamp → Asia/Seoul YYYY-MM-DD (quotes asOf → trade date). */
  function asOfToTradeDate(asOf) {
    if (!asOf) return '';
    var d = new Date(asOf);
    if (!isFinite(d.getTime())) {
      var s = String(asOf).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    }
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      var y = '';
      var m = '';
      var day = '';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'year') y = parts[i].value;
        if (parts[i].type === 'month') m = parts[i].value;
        if (parts[i].type === 'day') day = parts[i].value;
      }
      if (y && m && day) return y + '-' + m + '-' + day;
    } catch (e) {}
    return '';
  }

  /**
   * Overlay /api/quotes last onto OHLC bars.
   * - Same trade day + regular session → patch c/h/l (live intraday).
   * - Quotes trade date newer than last history bar → append (session or after hours).
     After close this keeps today's bar until stock_price_history catches up.
   */
  function applyLiveQuoteToBars(bars, quotesJson, code) {
    if (!bars || !bars.length || !quotesJson) {
      return { bars: bars, live: false, liveTime: null };
    }

    // Newer KRX codes contain letters (0009K0), so keep alphanumerics, not digits only.
    var tick = String(code || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .padStart(6, '0')
      .slice(-6);
    var items = quotesJson.items || {};
    var item = items[tick] || items[code] || null;
    if (!item) return { bars: bars, live: false, liveTime: null };

    var last = typeof item.last === 'number' ? item.last : Number(item.last);
    if (!isFinite(last) || last <= 0) return { bars: bars, live: false, liveTime: null };

    var qDate = asOfToTradeDate(quotesJson.asOf);
    if (!qDate) return { bars: bars, live: false, liveTime: null };

    var inSession = quotesJson.regularSession === true;
    var out = bars.slice();
    var lastBar = out[out.length - 1];
    var lastT = lastBar.t;

    if (qDate === lastT) {
      // Do not overwrite settled history OHLC after the session ends.
      if (!inSession) return { bars: bars, live: false, liveTime: null };
      var high = lastBar.h != null && isFinite(lastBar.h) ? Math.max(lastBar.h, last) : last;
      var low = lastBar.l != null && isFinite(lastBar.l) ? Math.min(lastBar.l, last) : last;
      var patched = {
        t: lastBar.t,
        o: lastBar.o,
        h: high,
        l: low,
        c: last,
        v: lastBar.v,
        live: true,
        closeOnly: !!lastBar.closeOnly,
      };
      copyInvestorOscFields(lastBar, patched);
      out[out.length - 1] = patched;
      return { bars: out, live: true, liveTime: lastT };
    }

    if (qDate > lastT) {
      // Quotes-only bar until history appends the day.
      // Prefer session OHLCV from quotes when present; otherwise close-only
      // (line/marker — never a flat O=H=L=C candle after hours).
      var qOpen =
        item.open != null && isFinite(Number(item.open)) && Number(item.open) > 0
          ? Number(item.open)
          : null;
      var qHigh =
        item.high != null && isFinite(Number(item.high)) && Number(item.high) > 0
          ? Number(item.high)
          : null;
      var qLow =
        item.low != null && isFinite(Number(item.low)) && Number(item.low) > 0
          ? Number(item.low)
          : null;
      var qVol =
        item.volume != null && isFinite(Number(item.volume)) && Number(item.volume) >= 0
          ? Number(item.volume)
          : null;
      if (qOpen != null && qHigh != null && qLow != null) {
        out.push({
          t: qDate,
          o: qOpen,
          h: Math.max(qHigh, last),
          l: Math.min(qLow, last),
          c: last,
          v: qVol != null ? qVol : 0,
          live: inSession,
        });
        return {
          bars: out,
          live: inSession,
          liveTime: inSession ? qDate : null,
        };
      }
      if (inSession) {
        var prev =
          item.prevClose != null && isFinite(Number(item.prevClose)) && Number(item.prevClose) > 0
            ? Number(item.prevClose)
            : last;
        out.push({
          t: qDate,
          o: prev,
          h: Math.max(prev, last),
          l: Math.min(prev, last),
          c: last,
          v: qVol != null ? qVol : 0,
          live: true,
        });
        return { bars: out, live: true, liveTime: qDate };
      }
      // After hours, quotes last only: close line — do not claim "live session".
      out.push({
        t: qDate,
        o: last,
        h: last,
        l: last,
        c: last,
        v: qVol != null ? qVol : 0,
        live: false,
        closeOnly: true,
      });
      return { bars: out, live: false, liveTime: null };
    }

    return { bars: bars, live: false, liveTime: null };
  }

  /**
   * Live overlay for server-aggregated weekly bars.
   * Same ISO week as last bar → patch OHLC (keep OSC); newer week → append without OSC.
   */
  function applyLiveQuoteToWeeklyBars(bars, quotesJson, code) {
    if (!bars || !bars.length || !quotesJson) {
      return { bars: bars, live: false, liveTime: null };
    }
    var tick = String(code || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .padStart(6, '0')
      .slice(-6);
    var items = quotesJson.items || {};
    var item = items[tick] || items[code] || null;
    if (!item) return { bars: bars, live: false, liveTime: null };

    var last = typeof item.last === 'number' ? item.last : Number(item.last);
    if (!isFinite(last) || last <= 0) return { bars: bars, live: false, liveTime: null };

    var qDate = asOfToTradeDate(quotesJson.asOf);
    if (!qDate) return { bars: bars, live: false, liveTime: null };

    var inSession = quotesJson.regularSession === true;
    var out = bars.slice();
    var lastBar = out[out.length - 1];
    var lastT = lastBar.t;
    var sameWeek = isoWeekKey(qDate) === isoWeekKey(lastT);

    if (sameWeek && qDate >= lastT) {
      if (!inSession && qDate === lastT) return { bars: bars, live: false, liveTime: null };
      if (!inSession && qDate > lastT) {
        // After hours: advance week stamp to quote date, keep OSC from last week bar.
        var settled = {
          t: qDate,
          o: lastBar.o,
          h: lastBar.h != null && isFinite(lastBar.h) ? Math.max(lastBar.h, last) : last,
          l: lastBar.l != null && isFinite(lastBar.l) ? Math.min(lastBar.l, last) : last,
          c: last,
          v: lastBar.v,
          live: false,
          closeOnly: !!lastBar.closeOnly,
        };
        copyInvestorOscFields(lastBar, settled);
        out[out.length - 1] = settled;
        return { bars: out, live: false, liveTime: null };
      }
      var highW = lastBar.h != null && isFinite(lastBar.h) ? Math.max(lastBar.h, last) : last;
      var lowW = lastBar.l != null && isFinite(lastBar.l) ? Math.min(lastBar.l, last) : last;
      var patchedW = {
        t: qDate > lastT ? qDate : lastT,
        o: lastBar.o,
        h: highW,
        l: lowW,
        c: last,
        v: lastBar.v,
        live: true,
        closeOnly: !!lastBar.closeOnly,
      };
      copyInvestorOscFields(lastBar, patchedW);
      out[out.length - 1] = patchedW;
      return { bars: out, live: true, liveTime: patchedW.t };
    }

    if (qDate > lastT && !sameWeek) {
      var qOpen =
        item.open != null && isFinite(Number(item.open)) && Number(item.open) > 0
          ? Number(item.open)
          : null;
      var qHigh =
        item.high != null && isFinite(Number(item.high)) && Number(item.high) > 0
          ? Number(item.high)
          : null;
      var qLow =
        item.low != null && isFinite(Number(item.low)) && Number(item.low) > 0
          ? Number(item.low)
          : null;
      var qVol =
        item.volume != null && isFinite(Number(item.volume)) && Number(item.volume) >= 0
          ? Number(item.volume)
          : null;
      if (qOpen != null && qHigh != null && qLow != null) {
        out.push({
          t: qDate,
          o: qOpen,
          h: Math.max(qHigh, last),
          l: Math.min(qLow, last),
          c: last,
          v: qVol != null ? qVol : 0,
          live: inSession,
        });
        return { bars: out, live: inSession, liveTime: inSession ? qDate : null };
      }
      if (inSession) {
        var prev =
          item.prevClose != null && isFinite(Number(item.prevClose)) && Number(item.prevClose) > 0
            ? Number(item.prevClose)
            : last;
        out.push({
          t: qDate,
          o: prev,
          h: Math.max(prev, last),
          l: Math.min(prev, last),
          c: last,
          v: qVol != null ? qVol : 0,
          live: true,
        });
        return { bars: out, live: true, liveTime: qDate };
      }
      out.push({
        t: qDate,
        o: last,
        h: last,
        l: last,
        c: last,
        v: qVol != null ? qVol : 0,
        live: false,
        closeOnly: true,
      });
      return { bars: out, live: false, liveTime: null };
    }

    return { bars: bars, live: false, liveTime: null };
  }

  function updateSubtitle() {
    var labels = t();
    var sub = document.getElementById('im-candle-sub');
    if (!sub || !state.ticker) return;
    var text =
      state.ticker +
      ' · ' +
      (state.interval === 'weekly' ? labels.weeklyChartLabel : labels.chartLabel);
    if (state.liveOverlay) text += ' · ' + labels.liveSession;
    sub.textContent = text;
  }

  function loadLwc() {
    if (global.LightweightCharts) return Promise.resolve(global.LightweightCharts);
    if (state.lwcPromise) return state.lwcPromise;
    state.lwcPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LWC_SRC;
      s.async = true;
      s.onload = function () {
        if (global.LightweightCharts) resolve(global.LightweightCharts);
        else reject(new Error('LightweightCharts missing'));
      };
      s.onerror = function () {
        state.lwcPromise = null;
        reject(new Error('CDN load failed'));
      };
      document.head.appendChild(s);
    });
    return state.lwcPromise;
  }

  function themeColors() {
    var cs = getComputedStyle(document.documentElement);
    return {
      bg: cs.getPropertyValue('--surface').trim() || '#161b22',
      text: cs.getPropertyValue('--text').trim() || '#e6edf3',
      muted: cs.getPropertyValue('--text-muted').trim() || '#8b949e',
      border: cs.getPropertyValue('--border').trim() || '#30363d',
    };
  }

  /* ---------- DOM ---------- */

  var EXPAND_ICON =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/>' +
    '</svg>';

  var COLLAPSE_ICON =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 2v3H2M11 2v3h3M5 14v-3H2M11 14v-3h3"/>' +
    '</svg>';

  function injectCss() {
    var css =
      '#main-table tbody tr[data-ticker]{cursor:pointer}' +
      '#main-table tbody tr[data-ticker] .company-name,' +
      '#main-table tbody tr[data-ticker] .spark-cell{cursor:pointer}' +
      '#table-cards .im-row-name,#table-cards .im-card-spark{cursor:pointer}' +
      '.im-candle-root{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
      '.im-candle-root.is-open{display:flex}' +
      '.im-candle-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}' +
      '.im-candle-dialog{position:relative;z-index:1;box-sizing:border-box;' +
      'width:min(1000px,92vw);height:min(760px,88vh);max-width:92vw;max-height:88vh;' +
      'display:flex;flex-direction:column;background:var(--surface,#161b22);color:var(--text,#e6edf3);' +
      'border:1px solid var(--border,#30363d);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.45);overflow:hidden}' +
      '.im-candle-dialog.im-candle-expanded{width:min(1680px,calc(100vw - 32px));height:calc(100vh - 32px);max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);border-radius:12px}' +
      '.im-candle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px 8px;border-bottom:1px solid var(--border,#30363d);flex:0 0 auto}' +
      '.im-candle-titles{min-width:0;flex:1}' +
      '.im-candle-title{margin:0;font-size:17px;font-weight:700;line-height:1.3;word-break:keep-all}' +
      '.im-candle-sub{margin:4px 0 0;font-size:12px;color:var(--text-muted,#8b949e);font-family:ui-monospace,monospace}' +
      '.im-candle-head-actions{display:flex;align-items:center;gap:4px;flex-shrink:0}' +
      '.im-candle-expand{flex-shrink:0;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--text,#e6edf3);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}' +
      '.im-candle-expand:hover,.im-candle-expand:focus-visible{background:var(--surface2,#21262d);outline:2px solid var(--accent,#58a6ff);outline-offset:0}' +
      '.im-candle-close{flex-shrink:0;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--text,#e6edf3);font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}' +
      '.im-candle-close:hover,.im-candle-close:focus-visible{background:var(--surface2,#21262d);outline:2px solid var(--accent,#58a6ff);outline-offset:0}' +
      '.im-candle-toolbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border,#30363d);flex:0 0 auto}' +
      '.im-candle-ranges,.im-candle-intervals,.im-candle-inv-cum,.im-candle-inv-period{display:inline-flex;gap:4px;padding:2px;border-radius:8px;background:var(--surface2,#21262d)}' +
      '.im-candle-range{border:0;background:transparent;color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer}' +
      '.im-candle-range[aria-pressed="true"]{background:var(--surface,#161b22);color:var(--text,#e6edf3);box-shadow:0 0 0 1px var(--border,#30363d)}' +
      '.im-candle-tip{flex:1;min-width:140px;max-height:3.6em;overflow:hidden;font-size:11px;color:var(--text-muted,#8b949e);font-variant-numeric:tabular-nums;line-height:1.35}' +
      '.im-candle-body{position:relative;flex:1 1 auto;min-height:0;padding:6px 8px 8px;display:flex;flex-direction:column;overflow:hidden}' +
      '.im-candle-stack{position:relative;flex:1 1 auto;min-height:0;height:100%;width:100%;overflow:hidden}' +
      '.im-candle-chart{position:relative;width:100%;height:100%;min-height:0}' +
      '.im-candle-hovertip{position:absolute;display:none;pointer-events:none;z-index:6;' +
      'max-width:min(280px,70%);padding:8px 10px;border-radius:8px;' +
      'background:rgba(13,17,23,.92);border:1px solid rgba(48,54,61,.9);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);color:#e6edf3;font-size:11px;line-height:1.45;' +
      'font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.im-candle-hovertip .im-ht-date{font-weight:700;margin-bottom:4px;color:#c9d1d9}' +
      '.im-candle-hovertip .im-ht-row{display:flex;justify-content:space-between;gap:12px}' +
      '.im-candle-hovertip .im-ht-k{color:#8b949e}' +
      '.im-candle-hovertip .im-ht-v{color:#e6edf3;font-weight:600}' +
      '.im-candle-pane-labels{position:absolute;inset:0;z-index:2;pointer-events:none}' +
      '.im-candle-pane-label{position:absolute;left:8px;font-size:10px;font-weight:700;letter-spacing:.02em;color:var(--text-muted,#8b949e);white-space:nowrap}' +
      '.im-candle-status{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:14px;color:var(--text-muted,#8b949e);background:rgba(22,27,34,.72);z-index:3}' +
      '.im-candle-status.is-on{display:flex}' +
      'body.im-candle-open{overflow:hidden}' +
      '@media (max-width:768px){' +
      '.im-candle-root{padding:0;align-items:stretch}' +
      '.im-candle-dialog,.im-candle-dialog.im-candle-expanded{width:100%;height:100dvh;max-width:100%;max-height:100dvh;border-radius:0;border:0}' +
      '.im-candle-tip{font-size:10px;max-height:4em}' +
      '.im-candle-hovertip{display:none!important}' +
      '}';
    var el = document.getElementById('im-candle-modal-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'im-candle-modal-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function afterLayout(cb) {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          cb();
        });
      });
    } else if (typeof setTimeout !== 'undefined') {
      setTimeout(cb, 0);
    } else {
      cb();
    }
  }

  function ensureDom() {
    injectCss();
    var root = document.getElementById('im-candle-root');
    if (
      root &&
      (!document.getElementById('im-candle-stack') ||
        !document.getElementById('im-candle-chart') ||
        !document.getElementById('im-candle-pane-labels') ||
        !document.getElementById('im-candle-intervals') ||
        !document.getElementById('im-candle-inv-cum') ||
        !document.getElementById('im-candle-inv-period') ||
        !document.getElementById('im-candle-expand') ||
        !document.getElementById('im-candle-hovertip') ||
        document.getElementById('im-candle-price'))
    ) {
      root.parentNode && root.parentNode.removeChild(root);
      root = null;
    }
    if (root) return root;
    root = document.createElement('div');
    root.id = 'im-candle-root';
    root.className = 'im-candle-root';
    root.setAttribute('hidden', '');
    root.innerHTML =
      '<div class="im-candle-backdrop" data-im-candle-dismiss="1"></div>' +
      '<div class="im-candle-dialog" role="dialog" aria-modal="true" aria-labelledby="im-candle-title" tabindex="-1">' +
      '<div class="im-candle-head">' +
      '<div class="im-candle-titles">' +
      '<h2 class="im-candle-title" id="im-candle-title"></h2>' +
      '<p class="im-candle-sub" id="im-candle-sub"></p>' +
      '</div>' +
      '<div class="im-candle-head-actions">' +
      '<button type="button" class="im-candle-expand" id="im-candle-expand" aria-label="" title="" aria-pressed="false"></button>' +
      '<button type="button" class="im-candle-close" id="im-candle-close" aria-label="">×</button>' +
      '</div>' +
      '</div>' +
      '<div class="im-candle-toolbar">' +
      '<div class="im-candle-ranges" role="group" id="im-candle-ranges"></div>' +
      '<div class="im-candle-intervals" role="group" id="im-candle-intervals"></div>' +
      '<div class="im-candle-inv-cum" role="group" id="im-candle-inv-cum" hidden></div>' +
      '<div class="im-candle-inv-period" role="group" id="im-candle-inv-period" hidden></div>' +
      '<div class="im-candle-tip" id="im-candle-tip" aria-live="polite"></div>' +
      '</div>' +
      '<div class="im-candle-body">' +
      '<div class="im-candle-stack" id="im-candle-stack" role="img">' +
      '<div class="im-candle-chart" id="im-candle-chart"></div>' +
      '<div class="im-candle-hovertip" id="im-candle-hovertip" aria-hidden="true"></div>' +
      '<div class="im-candle-pane-labels" id="im-candle-pane-labels">' +
      PANES.map(function (pane) {
        return '<span class="im-candle-pane-label" data-pane="' + pane.key + '"></span>';
      }).join('') +
      '</div>' +
      '</div>' +
      '<div class="im-candle-status" id="im-candle-status"></div>' +
      '</div></div>';
    document.body.appendChild(root);

    root.querySelector('.im-candle-backdrop').addEventListener('click', close);
    root.querySelector('#im-candle-close').addEventListener('click', close);
    root.querySelector('#im-candle-expand').addEventListener('click', function () {
      setExpanded(!state.expanded);
    });
    root.querySelector('#im-candle-ranges').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-range]');
      if (!btn) return;
      var range = btn.getAttribute('data-range');
      if (!range || range === state.range) return;
      state.range = range;
      state.rangeByInterval[state.interval] = range;
      syncRangeButtons();
      if (state.ticker) loadAndRender(state.ticker, state.range);
    });
    root.querySelector('#im-candle-intervals').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-interval]');
      if (!btn) return;
      var interval = btn.getAttribute('data-interval');
      if (INTERVALS.indexOf(interval) < 0 || interval === state.interval) return;
      state.interval = interval;
      state.range = rangeForInterval(interval);
      syncRangeButtons();
      syncIntervalButtons();
      syncInvestorCumVisibility();
      syncInvestorPeriodVisibility();
      syncPaneLabels();
      updateSubtitle();
      document
        .getElementById('im-candle-stack')
        .setAttribute(
          'aria-label',
          interval === 'weekly' ? t().weeklyChartLabel : t().chartLabel,
        );
      if (state.ticker) loadAndRender(state.ticker, state.range);
    });
    root.querySelector('#im-candle-inv-cum').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-inv-cum]');
      if (!btn) return;
      var cum = parseInt(btn.getAttribute('data-inv-cum'), 10);
      setInvestorCum(cum);
    });
    root.querySelector('#im-candle-inv-period').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-inv-period]');
      if (!btn) return;
      var period = parseInt(btn.getAttribute('data-inv-period'), 10);
      setInvestorPeriod(period);
    });
    return root;
  }

  function readStoredInvestorCum() {
    try {
      var v = parseInt(localStorage.getItem(INVESTOR_CUM_STORAGE), 10);
      if (INVESTOR_CUM_OPTIONS.indexOf(v) >= 0) return v;
    } catch (e) {}
    return DEFAULT_INVESTOR_CUM;
  }

  function saveInvestorCum(v) {
    try {
      localStorage.setItem(INVESTOR_CUM_STORAGE, String(v));
    } catch (e2) {}
  }

  function readStoredInvestorPeriod() {
    try {
      var v = parseInt(localStorage.getItem(INVESTOR_PERIOD_STORAGE), 10);
      if (INVESTOR_PERIOD_OPTIONS.indexOf(v) >= 0) return v;
    } catch (e) {}
    return DEFAULT_INVESTOR_PERIOD;
  }

  function saveInvestorPeriod(v) {
    try {
      localStorage.setItem(INVESTOR_PERIOD_STORAGE, String(v));
    } catch (e2) {}
  }

  function paneInvestorLabel(cum, period) {
    var labels = t();
    var weekly = state.interval === 'weekly';
    var c = weekly ? WEEKLY_INVESTOR_CUM : cum != null ? cum : state.investorCum;
    var p = weekly ? WEEKLY_INVESTOR_PERIOD : period != null ? period : state.investorPeriod;
    var unit = weekly ? labels.paneInvestorUnitWeek : labels.paneInvestorUnitDay;
    return labels.paneInvestorTpl
      .replace('{CUM}', String(c))
      .replace('{PER}', String(p))
      .replace(/\{UNIT\}/g, unit);
  }

  function activeInvestorCumPeriod() {
    if (state.interval === 'weekly') {
      return { cum: WEEKLY_INVESTOR_CUM, period: WEEKLY_INVESTOR_PERIOD };
    }
    return { cum: state.investorCum, period: state.investorPeriod };
  }

  function investorOscField(prefix, cum, period) {
    var c = cum != null ? cum : state.investorCum;
    var p = period != null ? period : state.investorPeriod;
    return prefix + '_' + c + '_' + p;
  }

  function oscNum(v) {
    return v != null && isFinite(Number(v)) ? Number(v) : null;
  }

  function copyInvestorOscFields(src, dest) {
    for (var wi = 0; wi < INVESTOR_CUM_OPTIONS.length; wi++) {
      var w = INVESTOR_CUM_OPTIONS[wi];
      for (var pi = 0; pi < INVESTOR_PERIOD_OPTIONS.length; pi++) {
        var p = INVESTOR_PERIOD_OPTIONS[pi];
        var ik = investorOscField('instOsc', w, p);
        var fk = investorOscField('frgnOsc', w, p);
        if (ik in src) dest[ik] = oscNum(src[ik]);
        if (fk in src) dest[fk] = oscNum(src[fk]);
      }
      var lk = 'instOsc' + w;
      var lf = 'frgnOsc' + w;
      if (lk in src) dest[lk] = oscNum(src[lk]);
      if (lf in src) dest[lf] = oscNum(src[lf]);
    }
    if ('instOsc' in src) dest.instOsc = oscNum(src.instOsc);
    if ('frgnOsc' in src) dest.frgnOsc = oscNum(src.frgnOsc);
    if ('foreignRatio' in src) dest.foreignRatio = oscNum(src.foreignRatio);
    var wik = investorOscField('instOsc', WEEKLY_INVESTOR_CUM, WEEKLY_INVESTOR_PERIOD);
    var wfk = investorOscField('frgnOsc', WEEKLY_INVESTOR_CUM, WEEKLY_INVESTOR_PERIOD);
    if (wik in src) dest[wik] = oscNum(src[wik]);
    if (wfk in src) dest[wfk] = oscNum(src[wfk]);
  }

  function buildInvestorOscLinesFromByTime(byTime, cum, period) {
    var instOscLine = [];
    var frgnOscLine = [];
    var ik = investorOscField('instOsc', cum, period);
    var fk = investorOscField('frgnOsc', cum, period);
    var times = Object.keys(byTime).sort();
    for (var i = 0; i < times.length; i++) {
      var time = times[i];
      var row = byTime[time];
      var iv = row[ik];
      var fv = row[fk];
      if (iv != null && isFinite(iv)) instOscLine.push({ time: time, value: iv });
      if (fv != null && isFinite(fv)) frgnOscLine.push({ time: time, value: fv });
    }
    return { instOscLine: instOscLine, frgnOscLine: frgnOscLine };
  }

  function refreshInvestorOscSeries() {
    var refs = state.seriesRefs;
    if (!refs || !refs.instOsc || !refs.frgnOsc || !state.barsByTime) return;
    if (state.interval === 'weekly') return;
    var lines = buildInvestorOscLinesFromByTime(
      state.barsByTime,
      state.investorCum,
      state.investorPeriod,
    );
    refs.instOsc.setData(lines.instOscLine);
    refs.frgnOsc.setData(lines.frgnOscLine);
    syncPaneLabels();
    updateTip(state.crosshairTime);
  }

  function setInvestorCum(cum) {
    if (INVESTOR_CUM_OPTIONS.indexOf(cum) < 0 || cum === state.investorCum) return;
    state.investorCum = cum;
    saveInvestorCum(cum);
    syncInvestorCumButtons();
    refreshInvestorOscSeries();
  }

  function setInvestorPeriod(period) {
    if (INVESTOR_PERIOD_OPTIONS.indexOf(period) < 0 || period === state.investorPeriod) return;
    state.investorPeriod = period;
    saveInvestorPeriod(period);
    syncInvestorPeriodButtons();
    refreshInvestorOscSeries();
  }

  function syncInvestorCumButtons() {
    var wrap = document.getElementById('im-candle-inv-cum');
    if (!wrap) return;
    var html = '';
    for (var i = 0; i < INVESTOR_CUM_OPTIONS.length; i++) {
      var cum = INVESTOR_CUM_OPTIONS[i];
      html +=
        '<button type="button" class="im-candle-range" data-inv-cum="' +
        cum +
        '" aria-pressed="' +
        (cum === state.investorCum ? 'true' : 'false') +
        '">' +
        cum +
        '</button>';
    }
    wrap.innerHTML = html;
  }

  function syncInvestorPeriodButtons() {
    var wrap = document.getElementById('im-candle-inv-period');
    if (!wrap) return;
    var html = '';
    for (var i = 0; i < INVESTOR_PERIOD_OPTIONS.length; i++) {
      var period = INVESTOR_PERIOD_OPTIONS[i];
      html +=
        '<button type="button" class="im-candle-range" data-inv-period="' +
        period +
        '" aria-pressed="' +
        (period === state.investorPeriod ? 'true' : 'false') +
        '">' +
        period +
        '</button>';
    }
    wrap.innerHTML = html;
  }

  function syncInvestorCumVisibility() {
    var wrap = document.getElementById('im-candle-inv-cum');
    if (!wrap) return;
    wrap.hidden = state.interval === 'weekly';
  }

  function syncInvestorPeriodVisibility() {
    var wrap = document.getElementById('im-candle-inv-period');
    if (!wrap) return;
    wrap.hidden = state.interval === 'weekly';
  }

  function syncPaneLabels() {
    var labels = t();
    var root = document.getElementById('im-candle-stack');
    if (!root) return;
    var map = {
      price: labels.panePrice,
      vol: labels.paneVol,
      macd: labels.paneMacd,
      investor: paneInvestorLabel(state.investorCum, state.investorPeriod),
      norm: labels.paneNorm,
      atr: labels.paneAtr,
    };
    var nodes = root.querySelectorAll('[data-pane]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-pane');
      nodes[i].textContent = map[key] || '';
    }
  }

  function syncRangeButtons() {
    var wrap = document.getElementById('im-candle-ranges');
    if (!wrap) return;
    var labels = t();
    var html = '';
    for (var i = 0; i < RANGES.length; i++) {
      var r = RANGES[i];
      var pressed = r === state.range ? 'true' : 'false';
      var lab =
        r === '3m'
          ? labels.range3m
          : r === '6m'
            ? labels.range6m
            : r === '3y'
              ? labels.range3y
              : r === '5y'
                ? labels.range5y
                : labels.range1y;
      html +=
        '<button type="button" class="im-candle-range" data-range="' +
        r +
        '" aria-pressed="' +
        pressed +
        '">' +
        lab +
        '</button>';
    }
    wrap.innerHTML = html;
  }

  function syncIntervalButtons() {
    var wrap = document.getElementById('im-candle-intervals');
    if (!wrap) return;
    var labels = t();
    var html = '';
    for (var i = 0; i < INTERVALS.length; i++) {
      var interval = INTERVALS[i];
      html +=
        '<button type="button" class="im-candle-range" data-interval="' +
        interval +
        '" aria-pressed="' +
        (interval === state.interval ? 'true' : 'false') +
        '">' +
        (interval === 'weekly' ? labels.weekly : labels.daily) +
        '</button>';
    }
    wrap.innerHTML = html;
  }

  function syncExpandButton() {
    var btn = typeof document !== 'undefined' && document.getElementById ? document.getElementById('im-candle-expand') : null;
    if (!btn) return;
    var labels = t();
    var label = state.expanded ? labels.collapse : labels.expand;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', state.expanded ? 'true' : 'false');
    btn.innerHTML = state.expanded ? COLLAPSE_ICON : EXPAND_ICON;
  }

  function setExpanded(expanded) {
    state.expanded = !!expanded;
    var root = typeof document !== 'undefined' && document.getElementById ? document.getElementById('im-candle-root') : null;
    if (root) {
      var dialog = root.querySelector('.im-candle-dialog');
      if (dialog) {
        dialog.classList.toggle('im-candle-expanded', state.expanded);
      }
    }
    syncExpandButton();
    resizeCharts();
    afterLayout(function () {
      resizeCharts();
      afterLayout(resizeCharts);
    });
  }

  function setStatus(msg, on) {
    var el = document.getElementById('im-candle-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!on);
  }

  /* ---------- series build ---------- */

  function isTradedPrice(value) {
    if (value == null) return false;
    var n = Number(value);
    return isFinite(n) && n > 0;
  }

  function normalizeBars(rawBars) {
    var bars = [];
    for (var i = 0; i < rawBars.length; i++) {
      var b = rawBars[i];
      if (!b || !b.t) continue;
      var c = typeof b.c === 'number' ? b.c : Number(b.c);
      if (!isFinite(c) || c <= 0) continue;
      // Suspended sessions arrive as null or as 0 placeholders; both mean "no trade".
      var hasOpen = isTradedPrice(b.o);
      var hasHigh = isTradedPrice(b.h);
      var hasLow = isTradedPrice(b.l);
      var o = hasOpen ? Number(b.o) : c;
      var h = hasHigh ? Number(b.h) : Math.max(o, c);
      var l = hasLow ? Number(b.l) : Math.min(o, c);
      var v = b.v != null && isFinite(Number(b.v)) ? Number(b.v) : 0;
      if (h < Math.max(o, c)) h = Math.max(o, c);
      if (l > Math.min(o, c)) l = Math.min(o, c);
      // Newly listed names can arrive with close only; those render as a line.
      var closeOnly = !hasOpen && !hasHigh && !hasLow;
      var bar = { t: b.t, o: o, h: h, l: l, c: c, v: v, closeOnly: closeOnly };
      copyInvestorOscFields(b, bar);
      bars.push(bar);
    }
    return bars;
  }

  function buildPanelData(fullBars, range, interval, investorCum, investorPeriod) {
    var weekly = interval === 'weekly';
    var cum = weekly
      ? WEEKLY_INVESTOR_CUM
      : investorCum != null && INVESTOR_CUM_OPTIONS.indexOf(investorCum) >= 0
        ? investorCum
        : state.investorCum;
    var period = weekly
      ? WEEKLY_INVESTOR_PERIOD
      : investorPeriod != null && INVESTOR_PERIOD_OPTIONS.indexOf(investorPeriod) >= 0
        ? investorPeriod
        : state.investorPeriod;
    var closes = fullBars.map(function (b) {
      return b.c;
    });
    var vols = fullBars.map(function (b) {
      return b.v;
    });
    var periods = priceMaPeriods(interval);
    var ma5 = sma(closes, periods[0]);
    var ma20 = sma(closes, periods[1]);
    var ma50 = sma(closes, periods[2]);
    var ma120 = sma(closes, periods[3]);
    var vma20 = sma(vols, MA_VOL);
    var bb = bollinger(closes, BB_PERIOD, BB_MULT);
    var bbwPct = trailingMinMaxNorm(bb.width, NORM_WINDOW);
    var disparityMa = sma(closes, DISP_MA_PERIOD);
    var disparity = disparityFromMa(closes, disparityMa);
    var dispPct = trailingMinMaxNorm(disparity, NORM_WINDOW);
    var macdPack = macd(closes, MACD_FAST, MACD_SLOW, MACD_SIGNAL);
    var atrPack = atrPercent(fullBars, ATR_PERIOD, ATR_SIGNAL);

    var displayMap = DISPLAY_BARS[interval] || DISPLAY_BARS.daily;
    var displayN = displayMap[range] || displayMap['1y'];
    var start = Math.max(0, fullBars.length - displayN);

    var candles = [];
    var closeLine = [];
    var closeOnlyCount = 0;
    var ma5Line = [];
    var ma20Line = [];
    var ma50Line = [];
    var maLine = [];
    var volumes = [];
    var vmaLine = [];
    var macdLine = [];
    var macdSignalLine = [];
    var macdHist = [];
    var instOscLine = [];
    var frgnOscLine = [];
    var foreignRatioBars = [];
    var bbwLine = [];
    var dispLine = [];
    var atrLine = [];
    var atrSignalLine = [];
    var byTime = Object.create(null);

    for (var i = start; i < fullBars.length; i++) {
      var b = fullBars[i];
      closeLine.push({ time: b.t, value: b.c });
      if (b.closeOnly) closeOnlyCount += 1;
      else candles.push({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c });
      volumes.push({
        time: b.t,
        value: b.v,
        color: b.c >= b.o ? 'rgba(63,185,80,0.55)' : 'rgba(248,81,73,0.55)',
      });
      if (ma5[i] != null && isFinite(ma5[i])) ma5Line.push({ time: b.t, value: ma5[i] });
      if (ma20[i] != null && isFinite(ma20[i])) ma20Line.push({ time: b.t, value: ma20[i] });
      if (ma50[i] != null && isFinite(ma50[i])) ma50Line.push({ time: b.t, value: ma50[i] });
      if (ma120[i] != null && isFinite(ma120[i])) maLine.push({ time: b.t, value: ma120[i] });
      if (vma20[i] != null && isFinite(vma20[i])) vmaLine.push({ time: b.t, value: vma20[i] });
      if (macdPack.hist[i] != null && isFinite(macdPack.hist[i])) {
        macdHist.push({
          time: b.t,
          value: macdPack.hist[i],
          color: macdPack.hist[i] >= 0 ? 'rgba(63,185,80,0.65)' : 'rgba(248,81,73,0.65)',
        });
      }
      if (macdPack.line[i] != null && isFinite(macdPack.line[i])) {
        macdLine.push({ time: b.t, value: macdPack.line[i] });
      }
      if (macdPack.signal[i] != null && isFinite(macdPack.signal[i])) {
        macdSignalLine.push({ time: b.t, value: macdPack.signal[i] });
      }
      var iv = oscNum(b[investorOscField('instOsc', cum, period)]);
      var fv = oscNum(b[investorOscField('frgnOsc', cum, period)]);
      var fr = oscNum(b.foreignRatio);
      if (iv != null) instOscLine.push({ time: b.t, value: iv });
      if (fv != null) frgnOscLine.push({ time: b.t, value: fv });
      if (fr != null) {
        foreignRatioBars.push({
          time: b.t,
          value: fr,
          color: 'rgba(126,231,135,0.28)',
        });
      }
      if (bbwPct[i] != null && isFinite(bbwPct[i])) bbwLine.push({ time: b.t, value: bbwPct[i] });
      if (dispPct[i] != null && isFinite(dispPct[i])) dispLine.push({ time: b.t, value: dispPct[i] });
      if (atrPack.value[i] != null && isFinite(atrPack.value[i])) {
        atrLine.push({ time: b.t, value: atrPack.value[i] });
      }
      if (atrPack.signal[i] != null && isFinite(atrPack.signal[i])) {
        atrSignalLine.push({ time: b.t, value: atrPack.signal[i] });
      }
      var row = {
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
        ma5: ma5[i],
        ma20: ma20[i],
        ma50: ma50[i],
        ma120: ma120[i],
        vma20: vma20[i],
        macd: macdPack.line[i],
        macdSignal: macdPack.signal[i],
        macdHist: macdPack.hist[i],
        bbw: bbwPct[i],
        disp: dispPct[i],
        atr: atrPack.value[i],
        atrSignal: atrPack.signal[i],
        live: !!b.live,
        foreignRatio: fr,
      };
      if (weekly) {
        row[investorOscField('instOsc', WEEKLY_INVESTOR_CUM, WEEKLY_INVESTOR_PERIOD)] = iv;
        row[investorOscField('frgnOsc', WEEKLY_INVESTOR_CUM, WEEKLY_INVESTOR_PERIOD)] = fv;
        row.instOsc = iv;
        row.frgnOsc = fv;
      } else {
        for (var wi = 0; wi < INVESTOR_CUM_OPTIONS.length; wi++) {
          var w = INVESTOR_CUM_OPTIONS[wi];
          for (var pi = 0; pi < INVESTOR_PERIOD_OPTIONS.length; pi++) {
            var p = INVESTOR_PERIOD_OPTIONS[pi];
            row[investorOscField('instOsc', w, p)] = oscNum(b[investorOscField('instOsc', w, p)]);
            row[investorOscField('frgnOsc', w, p)] = oscNum(b[investorOscField('frgnOsc', w, p)]);
          }
          row['instOsc' + w] = oscNum(b['instOsc' + w]);
          row['frgnOsc' + w] = oscNum(b['frgnOsc' + w]);
        }
        row.instOsc = row[investorOscField('instOsc', cum, period)];
        row.frgnOsc = row[investorOscField('frgnOsc', cum, period)];
      }
      byTime[b.t] = row;
    }

    return {
      candles: candles,
      // Drawn whenever any bar lacks OHLC so the price pane still shows a series.
      closeLine: closeOnlyCount ? closeLine : [],
      barCount: closeLine.length,
      maPeriods: periods,
      ma5Line: ma5Line,
      ma20Line: ma20Line,
      ma50Line: ma50Line,
      maLine: maLine,
      volumes: volumes,
      vmaLine: vmaLine,
      macdLine: macdLine,
      macdSignalLine: macdSignalLine,
      macdHist: macdHist,
      instOscLine: instOscLine,
      frgnOscLine: frgnOscLine,
      foreignRatioBars: foreignRatioBars,
      bbwLine: bbwLine,
      dispLine: dispLine,
      atrLine: atrLine,
      atrSignalLine: atrSignalLine,
      byTime: byTime,
    };
  }

  function hideHoverTip() {
    var tip = document.getElementById('im-candle-hovertip');
    if (!tip) return;
    tip.style.display = 'none';
    tip.innerHTML = '';
    tip.setAttribute('aria-hidden', 'true');
  }

  function preferFloatingHoverTip() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia
      ? !window.matchMedia('(max-width: 768px)').matches
      : (window.innerWidth || 0) > 768;
  }

  function hoverTipRow(label, value) {
    if (value == null || value === '' || value === '—') return '';
    return (
      '<div class="im-ht-row"><span class="im-ht-k">' +
      label +
      '</span><span class="im-ht-v">' +
      value +
      '</span></div>'
    );
  }

  function updateHoverTip(param) {
    var tip = document.getElementById('im-candle-hovertip');
    if (!tip) return;
    if (!preferFloatingHoverTip() || !param || !param.point || param.time == null) {
      hideHoverTip();
      return;
    }
    var time = String(param.time);
    if (!state.barsByTime || !state.barsByTime[time]) {
      hideHoverTip();
      return;
    }
    var b = state.barsByTime[time];
    var labels = t();
    var html = '<div class="im-ht-date">' + time + '</div>';
    html += hoverTipRow(labels.closePx, fmtPrice(b.c));
    html += hoverTipRow(labels.volume, fmtVol(b.v));
    if (b.macd != null || b.macdSignal != null) {
      html += hoverTipRow(
        labels.macd + '/' + labels.macdSignal,
        fmtNum(b.macd, 2) + ' / ' + fmtNum(b.macdSignal, 2),
      );
    }
    if (state.interval === 'daily' || state.interval === 'weekly') {
      var ap = activeInvestorCumPeriod();
      var ik = investorOscField('instOsc', ap.cum, ap.period);
      var fk = investorOscField('frgnOsc', ap.cum, ap.period);
      var instVal = b[ik] != null ? b[ik] : b.instOsc;
      var frgnVal = b[fk] != null ? b[fk] : b.frgnOsc;
      html += hoverTipRow(labels.instOsc, fmtNum(instVal, 1));
      html += hoverTipRow(labels.frgnOsc, fmtNum(frgnVal, 1));
      html += hoverTipRow(labels.foreignRatio, fmtNum(b.foreignRatio, 2));
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.setAttribute('aria-hidden', 'false');

    var stack = document.getElementById('im-candle-stack') || tip.parentElement;
    var pad = 12;
    var tw = tip.offsetWidth || 160;
    var th = tip.offsetHeight || 80;
    var cw = (stack && stack.clientWidth) || 0;
    var ch = (stack && stack.clientHeight) || 0;
    var x = param.point.x + pad;
    var y = param.point.y + pad;
    if (cw && x + tw + pad > cw) x = param.point.x - tw - pad;
    if (ch && y + th + pad > ch) y = param.point.y - th - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(y) + 'px';
  }

  function updateTip(time) {
    state.crosshairTime = time;
    var tip = document.getElementById('im-candle-tip');
    if (!tip) return;
    var labels = t();
    if (!time || !state.barsByTime || !state.barsByTime[time]) {
      tip.textContent = '';
      return;
    }
    var b = state.barsByTime[time];
    var periods =
      (state.panelData && state.panelData.maPeriods) || priceMaPeriods(state.interval);
    var text =
      time +
      ' · ' +
      labels.open +
      ' ' +
      fmtPrice(b.o) +
      ' ' +
      labels.high +
      ' ' +
      fmtPrice(b.h) +
      ' ' +
      labels.low +
      ' ' +
      fmtPrice(b.l) +
      ' ' +
      labels.closePx +
      ' ' +
      fmtPrice(b.c) +
      ' · ' +
      labels.volume +
      ' ' +
      fmtVol(b.v) +
      ' · ' +
      maLabel(periods[0]) +
      ' ' +
      fmtPrice(b.ma5) +
      ' · ' +
      maLabel(periods[1]) +
      ' ' +
      fmtPrice(b.ma20) +
      ' · ' +
      maLabel(periods[2]) +
      ' ' +
      fmtPrice(b.ma50) +
      ' · ' +
      maLabel(periods[3]) +
      ' ' +
      fmtPrice(b.ma120) +
      ' · ' +
      labels.vma20 +
      ' ' +
      fmtVol(b.vma20) +
      ' · ' +
      labels.macd +
      ' ' +
      fmtNum(b.macd, 2) +
      ' ' +
      labels.macdSignal +
      ' ' +
      fmtNum(b.macdSignal, 2) +
      ' ' +
      labels.macdHist +
      ' ' +
      fmtNum(b.macdHist, 2);
    if (state.interval === 'daily' || state.interval === 'weekly') {
      var ap = activeInvestorCumPeriod();
      var ik = investorOscField('instOsc', ap.cum, ap.period);
      var fk = investorOscField('frgnOsc', ap.cum, ap.period);
      text +=
        ' · ' +
        labels.instOsc +
        ' ' +
        fmtNum(b[ik] != null ? b[ik] : b.instOsc, 1) +
        ' · ' +
        labels.frgnOsc +
        ' ' +
        fmtNum(b[fk] != null ? b[fk] : b.frgnOsc, 1) +
        ' · ' +
        labels.foreignRatio +
        ' ' +
        fmtNum(b.foreignRatio, 2);
    }
    text +=
      ' · ' +
      labels.bbw +
      ' ' +
      fmtNum(b.bbw, 1) +
      ' · ' +
      labels.disp +
      ' ' +
      fmtNum(b.disp, 1) +
      ' · ' +
      labels.atr +
      ' ' +
      fmtNum(b.atr, 2) +
      ' ' +
      labels.atrSignal +
      ' ' +
      fmtNum(b.atrSignal, 2);
    if (b.live) text += ' · ' + labels.liveSession;
    tip.textContent = text;
  }

  function destroyCharts() {
    if (state.resizeObs) {
      try {
        state.resizeObs.disconnect();
      } catch (e) {}
      state.resizeObs = null;
    }
    if (state.chart) {
      try {
        state.chart.remove();
      } catch (e2) {}
    }
    state.chart = null;
    state.seriesRefs = null;
    state.barsByTime = null;
    state.panelData = null;
    hideHoverTip();
  }

  function makeChart(LWC, container, colors) {
    return LWC.createChart(container, {
      width: Math.max(container.clientWidth || 0, 120),
      height: Math.max(container.clientHeight || 0, 240),
      autoSize: true,
      layout: {
        background: { type: 'solid', color: colors.bg },
        textColor: colors.muted,
        fontSize: AXIS_FONT_SIZE,
        attributionLogo: false,
        // Panes are sized from the data, not dragged, so the handles only add noise.
        panes: { enableResize: false, separatorColor: colors.border },
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 1 },
      rightPriceScale: {
        visible: true,
        borderColor: colors.border,
        alignLabels: true,
      },
      timeScale: {
        borderColor: colors.border,
        rightOffset: RIGHT_OFFSET_BARS,
        timeVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });
  }

  /**
   * Pane labels live in an overlay because a v5 pane is a table row we should not
   * inject into. Pane heights come from the chart, so the overlay tracks whatever
   * stretch factors and resizes the chart settles on.
   */
  function syncPaneLabelPositions() {
    var layer = document.getElementById('im-candle-pane-labels');
    if (!layer || !state.chart) return;
    var nodes = layer.querySelectorAll('[data-pane]');
    var offset = 0;
    for (var i = 0; i < nodes.length; i++) {
      var height = 0;
      try {
        height = (state.chart.paneSize(i) || {}).height || 0;
      } catch (e) {
        height = 0;
      }
      nodes[i].style.top = offset + 4 + 'px';
      nodes[i].style.display = height > 26 ? 'block' : 'none';
      offset += height + PANE_SEPARATOR_PX;
    }
  }

  function createCharts(LWC, data) {
    destroyCharts();
    var host = document.getElementById('im-candle-chart');
    if (!host) return;
    host.innerHTML = '';

    state.panelData = data;
    var colors = themeColors();
    var chart = makeChart(LWC, host, colors);

    function addLine(paneKey, options) {
      return chart.addSeries(
        LWC.LineSeries,
        Object.assign({ lineWidth: 2, priceLineVisible: false, lastValueVisible: true }, options),
        PANE_INDEX[paneKey],
      );
    }

    function addInvestorOscLine(paneKey, options) {
      return chart.addSeries(
        LWC.LineSeries,
        Object.assign(
          {
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            autoscaleInfoProvider: function () {
              return {
                priceRange: {
                  minValue: 0,
                  maxValue: 100,
                },
              };
            },
          },
          options,
        ),
        PANE_INDEX[paneKey],
      );
    }

    var candle = chart.addSeries(
      LWC.CandlestickSeries,
      {
        upColor: '#3fb950',
        downColor: '#f85149',
        borderVisible: false,
        wickUpColor: '#3fb950',
        wickDownColor: '#f85149',
      },
      PANE_INDEX.price,
    );
    candle.setData(data.candles);

    var closeSeries = null;
    if (data.closeLine && data.closeLine.length) {
      closeSeries = addLine('price', { color: '#58a6ff', title: t().closePx });
      closeSeries.setData(data.closeLine);
    }

    var maPeriods = data.maPeriods || priceMaPeriods(state.interval);
    var ma5Series = addLine('price', {
      color: PRICE_MA_SPECS[0].color,
      title: maLabel(maPeriods[0]),
      lastValueVisible: !PRICE_MA_SPECS[0].hideLast,
    });
    ma5Series.setData(data.ma5Line);

    var ma20Series = addLine('price', {
      color: PRICE_MA_SPECS[1].color,
      title: maLabel(maPeriods[1]),
      lastValueVisible: !PRICE_MA_SPECS[1].hideLast,
    });
    ma20Series.setData(data.ma20Line);

    var ma50Series = addLine('price', {
      color: PRICE_MA_SPECS[2].color,
      title: maLabel(maPeriods[2]),
    });
    ma50Series.setData(data.ma50Line);

    var maSeries = addLine('price', {
      color: PRICE_MA_SPECS[3].color,
      title: maLabel(maPeriods[3]),
    });
    maSeries.setData(data.maLine);

    var volSeries = chart.addSeries(
      LWC.HistogramSeries,
      { priceFormat: { type: 'volume' }, color: 'rgba(63,185,80,0.55)' },
      PANE_INDEX.vol,
    );
    volSeries.setData(data.volumes);

    var vmaSeries = addLine('vol', { color: '#d2a8ff', title: 'VMA20' });
    vmaSeries.setData(data.vmaLine);

    var macdHistSeries = chart.addSeries(
      LWC.HistogramSeries,
      { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } },
      PANE_INDEX.macd,
    );
    macdHistSeries.setData(data.macdHist);

    var macdLineSeries = addLine('macd', { color: '#58a6ff', title: 'MACD' });
    macdLineSeries.setData(data.macdLine);

    var macdSignalSeries = addLine('macd', { color: '#f778ba', title: 'Signal' });
    macdSignalSeries.setData(data.macdSignalLine);

    // Foreign ratio histogram behind OSC lines — own overlay scale so range zooms to data.
    var foreignRatioSeries = chart.addSeries(
      LWC.HistogramSeries,
      {
        color: 'rgba(126,231,135,0.28)',
        priceScaleId: 'fr',
        priceLineVisible: false,
        lastValueVisible: true,
        base: 0,
        title: t().foreignRatio,
        autoscaleInfoProvider: function () {
          var vals = (data.foreignRatioBars || [])
            .map(function (b) {
              return b.value;
            })
            .filter(function (v) {
              return typeof v === 'number' && isFinite(v);
            });
          if (!vals.length) return null;
          var mn = Math.min.apply(null, vals);
          var mx = Math.max.apply(null, vals);
          var pad = Math.max((mx - mn) * 0.15, 0.5);
          return {
            priceRange: {
              minValue: Math.max(0, mn - pad),
              maxValue: mx + pad,
            },
          };
        },
      },
      PANE_INDEX.investor,
    );
    foreignRatioSeries.setData(data.foreignRatioBars || []);

    var instOscSeries = addInvestorOscLine('investor', { color: '#e3b341', title: t().instOsc });
    instOscSeries.setData(data.instOscLine || []);
    for (var li = 0; li < INVESTOR_OSC_LEVELS.length; li++) {
      instOscSeries.createPriceLine({
        price: INVESTOR_OSC_LEVELS[li],
        color: 'rgba(139,148,158,0.35)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '',
      });
    }

    var frgnOscSeries = addInvestorOscLine('investor', { color: '#58a6ff', title: t().frgnOsc });
    frgnOscSeries.setData(data.frgnOscLine || []);

    var bbwSeries = addLine('norm', { color: '#f0883e', title: 'BBW%' });
    bbwSeries.setData(data.bbwLine);

    var dispSeries = addLine('norm', { color: '#39c5cf', title: 'DISP%' });
    dispSeries.setData(data.dispLine);

    var atrSeries = addLine('atr', {
      color: '#a371f7',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: 'ATR(3)/Close%',
    });
    atrSeries.setData(data.atrLine);

    var atrSignalSeries = addLine('atr', {
      color: '#e3b341',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: 'EMA9',
    });
    atrSignalSeries.setData(data.atrSignalLine);

    applyPaneLayout(LWC, chart);

    chart.subscribeCrosshairMove(function (param) {
      updateTip(param && param.time != null ? String(param.time) : null);
      updateHoverTip(param);
    });
    chart.timeScale().fitContent();

    state.chart = chart;
    state.seriesRefs = {
      candle: candle,
      close: closeSeries,
      ma5: ma5Series,
      ma20: ma20Series,
      ma50: ma50Series,
      ma: maSeries,
      vol: volSeries,
      vma: vmaSeries,
      macdHist: macdHistSeries,
      macd: macdLineSeries,
      macdSignal: macdSignalSeries,
      instOsc: instOscSeries,
      frgnOsc: frgnOscSeries,
      foreignRatio: foreignRatioSeries,
      bbw: bbwSeries,
      disp: dispSeries,
      atr: atrSeries,
      atrSignal: atrSignalSeries,
    };
    state.barsByTime = data.byTime;

    observeResize();
    resizeCharts();
    afterLayout(resizeCharts);
  }

  /** Give each pane its share of the height and its own right-scale margins. */
  function applyPaneLayout(LWC, chart) {
    var panes = [];
    try {
      panes = chart.panes() || [];
    } catch (e) {}
    for (var i = 0; i < PANES.length && i < panes.length; i++) {
      var spec = PANES[i];
      try {
        panes[i].setStretchFactor(paneStretch(spec));
      } catch (eStretch) {}
      var scaleOptions = { scaleMargins: PANE_MARGINS[spec.key] };
      if (spec.key === 'investor') {
        scaleOptions.autoScale = false;
      }
      if (spec.key === 'price' && LWC.PriceScaleMode) {
        scaleOptions.mode = LWC.PriceScaleMode.Logarithmic;
      }
      try {
        panes[i].priceScale('right').applyOptions(scaleOptions);
      } catch (eScale) {}
      if (spec.key === 'investor') {
        try {
          panes[i].priceScale('fr').applyOptions({
            scaleMargins: { top: 0.12, bottom: 0.06 },
            borderVisible: false,
          });
        } catch (eFr) {}
      }
    }
  }

  function observeResize() {
    var stack = document.getElementById('im-candle-stack');
    if (state.resizeObs) {
      try {
        state.resizeObs.disconnect();
      } catch (e) {}
      state.resizeObs = null;
    }
    if (!stack || typeof ResizeObserver === 'undefined') return;
    // Deferred, because repositioning the labels inside the callback would dirty
    // layout again and trip the "ResizeObserver loop" warning.
    state.resizeObs = new ResizeObserver(function () {
      requestAnimationFrame(resizeCharts);
    });
    state.resizeObs.observe(stack);
    var body = document.querySelector('.im-candle-body');
    if (body) state.resizeObs.observe(body);
  }

  function resizeCharts() {
    var chart = state.chart;
    if (!chart) return;
    var host = document.getElementById('im-candle-chart');
    if (host && !chart.autoSizeActive()) {
      var w = Math.max(host.clientWidth || 0, 120);
      var h = Math.max(host.clientHeight || 0, 200);
      try {
        chart.resize(w, h);
      } catch (e) {
        try {
          chart.applyOptions({ width: w, height: h });
        } catch (e2) {}
      }
    }
    syncPaneLabelPositions();
  }

  function loadAndRender(code, range) {
    var labels = t();
    var token = ++state.fetchToken;
    setStatus(labels.loading, true);
    updateTip(null);
    destroyCharts();
    state.liveOverlay = false;
    state.liveBarTime = null;
    updateSubtitle();

    return loadLwc()
      .then(function (LWC) {
        // Weekly MA120 and 125-bar normalization need substantially more than one year
        // of daily source bars, regardless of the selected display range.
        var requestRange = state.interval === 'weekly' ? '5y' : range;
        var ohlcP = fetch(ohlcApiUrl(code, requestRange, state.interval), {
          credentials: 'omit',
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
        var quotesP = fetch(quotesApiUrl(code), { credentials: 'omit' })
          .then(function (res) {
            if (!res.ok) return null;
            return res.json();
          })
          .catch(function () {
            return null;
          });
        return Promise.all([ohlcP, quotesP]).then(function (pair) {
          return { LWC: LWC, json: pair[0], quotes: pair[1] };
        });
      })
      .then(function (pack) {
        if (token !== state.fetchToken || !state.open) return;
        var fullBars = normalizeBars((pack.json && pack.json.bars) || []);
        if (!fullBars.length) {
          destroyCharts();
          setStatus(labels.empty, true);
          return;
        }
        var serverWeekly = state.interval === 'weekly' && pack.json && pack.json.interval === 'weekly';
        var overlaid = serverWeekly
          ? applyLiveQuoteToWeeklyBars(fullBars, pack.quotes, code)
          : applyLiveQuoteToBars(fullBars, pack.quotes, code);
        fullBars = overlaid.bars;
        state.liveOverlay = !!overlaid.live;
        state.liveBarTime = overlaid.liveTime || null;
        updateSubtitle();

        if (state.interval === 'weekly' && !serverWeekly) {
          fullBars = aggregateWeeklyBars(fullBars);
        }
        var data = buildPanelData(
          fullBars,
          range,
          state.interval,
          state.investorCum,
          state.investorPeriod,
        );
        if (!data.barCount) {
          destroyCharts();
          setStatus(labels.empty, true);
          return;
        }
        setStatus('', false);
        // Wait until modal flex layout assigns real pane pixel heights.
        afterLayout(function () {
          if (token !== state.fetchToken || !state.open) return;
          createCharts(pack.LWC, data);
          syncPaneLabels();
          afterLayout(function () {
            if (token !== state.fetchToken || !state.open) return;
            resizeCharts();
          });
        });
      })
      .catch(function () {
        if (token !== state.fetchToken || !state.open) return;
        destroyCharts();
        setStatus(labels.error, true);
      });
  }

  function resolveName(ticker, hint) {
    if (hint) return hint;
    var row = document.querySelector('#table-body tr[data-ticker="' + ticker + '"]');
    if (row) {
      var n = row.querySelector('.company-name');
      if (n && n.textContent) return n.textContent.trim();
    }
    var card = document.querySelector('#table-cards .im-stock-card[data-ticker="' + ticker + '"]');
    if (card) {
      var cn = card.querySelector('.company-name');
      if (cn && cn.textContent) return cn.textContent.trim();
    }
    return ticker;
  }

  function open(opts) {
    // Some KRX short codes carry letters (0009K0, 0126Z0), so digits-only
    // stripping would silently request a different company.
    var ticker = opts && opts.ticker ? String(opts.ticker).toUpperCase().replace(/[^0-9A-Z]/g, '') : '';
    if (!ticker || ticker.length < 5) return;
    ensureDom();
    var labels = t();
    state.lastFocus = document.activeElement;
    state.open = true;
    state.ticker = ticker;
    state.name = resolveName(ticker, opts && opts.name);
    state.investorCum = readStoredInvestorCum();
    state.investorPeriod = readStoredInvestorPeriod();
    if (opts && opts.investorCum && INVESTOR_CUM_OPTIONS.indexOf(opts.investorCum) >= 0) {
      state.investorCum = opts.investorCum;
    }
    if (opts && opts.investorPeriod && INVESTOR_PERIOD_OPTIONS.indexOf(opts.investorPeriod) >= 0) {
      state.investorPeriod = opts.investorPeriod;
    }
    state.interval =
      opts && opts.interval && INTERVALS.indexOf(opts.interval) >= 0 ? opts.interval : 'daily';
    if (opts && opts.range && RANGES.indexOf(opts.range) >= 0) {
      state.rangeByInterval[state.interval] = opts.range;
    }
    state.range = rangeForInterval(state.interval);

    var root = document.getElementById('im-candle-root');
    root.removeAttribute('hidden');
    root.classList.add('is-open');
    document.body.classList.add('im-candle-open');

    state.expanded = false;
    var dialog = root.querySelector('.im-candle-dialog');
    if (dialog) dialog.classList.remove('im-candle-expanded');
    syncExpandButton();

    document.getElementById('im-candle-title').textContent = state.name || ticker;
    state.liveOverlay = false;
    state.liveBarTime = null;
    updateSubtitle();
    document.getElementById('im-candle-close').setAttribute('aria-label', labels.close);
    syncRangeButtons();
    syncIntervalButtons();
    syncInvestorCumButtons();
    syncInvestorPeriodButtons();
    syncInvestorCumVisibility();
    syncInvestorPeriodVisibility();
    syncPaneLabels();
    document
      .getElementById('im-candle-stack')
      .setAttribute(
        'aria-label',
        state.interval === 'weekly' ? labels.weeklyChartLabel : labels.chartLabel,
      );

    loadAndRender(ticker, state.range);
    setTimeout(function () {
      var dialog = root.querySelector('.im-candle-dialog');
      if (dialog) dialog.focus();
      afterLayout(resizeCharts);
    }, 0);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    state.fetchToken += 1;
    setExpanded(false);
    destroyCharts();
    var root = document.getElementById('im-candle-root');
    if (root) {
      root.classList.remove('is-open');
      root.setAttribute('hidden', '');
    }
    document.body.classList.remove('im-candle-open');
    setStatus('', false);
    updateTip(null);
    state.liveOverlay = false;
    state.liveBarTime = null;
    if (state.lastFocus && state.lastFocus.focus) {
      try {
        state.lastFocus.focus();
      } catch (e) {}
    }
    state.ticker = null;
  }

  function isNavigationalLink(el) {
    if (!el || !el.closest) return false;
    var a = el.closest('a[href]');
    if (!a) return false;
    if (a.classList.contains('im-cross-sector-badge')) return true;
    if (
      a.closest(
        '.im-seo-related, .im-seo-body-p, .global-bottom-nav, .desktop-sidebar, .filter-bar, .tabs, header, footer, nav',
      )
    ) {
      return true;
    }
    if (a.closest('#table-body tr[data-ticker], #table-cards .im-stock-card[data-ticker]')) {
      return false;
    }
    return true;
  }

  function shouldIgnoreTarget(el) {
    if (!el || !el.closest) return true;
    if (el.closest('.im-card-chevron, thead, .filter-bar, .tabs, #im-candle-root')) return true;
    if (el.closest('button, input, select, textarea, label')) {
      if (!el.closest('#table-body tr[data-ticker], #table-cards .im-stock-card[data-ticker]')) return true;
      return true;
    }
    if (isNavigationalLink(el)) return true;
    return false;
  }

  function tickerFromEvent(e) {
    if (shouldIgnoreTarget(e.target)) return null;
    var card = e.target.closest('#table-cards .im-stock-card[data-ticker]');
    if (card) {
      if (
        e.target.closest(
          '.im-card-toggle, .im-row-name, .im-card-spark, .quote-spark, .company-name, .company-name-wrap',
        )
      ) {
        return card.getAttribute('data-ticker');
      }
      return null;
    }
    var tr = e.target.closest('#table-body tr[data-ticker]');
    if (tr) return tr.getAttribute('data-ticker');
    return null;
  }

  function onDocClick(e) {
    var ticker = tickerFromEvent(e);
    if (!ticker) return;
    e.preventDefault();
    e.stopPropagation();
    var host = e.target.closest('[data-ticker]');
    var nameEl = host && host.querySelector('.company-name');
    open({ ticker: ticker, name: nameEl ? nameEl.textContent.trim() : '' });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && state.open) {
      e.preventDefault();
      if (state.expanded) {
        setExpanded(false);
      } else {
        close();
      }
    }
  }

  function applyLang() {
    if (!state.open) return;
    var labels = t();
    var closeBtn = document.getElementById('im-candle-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', labels.close);
    syncExpandButton();
    updateSubtitle();
    syncRangeButtons();
    syncIntervalButtons();
    syncInvestorCumButtons();
    syncInvestorPeriodButtons();
    syncInvestorCumVisibility();
    syncInvestorPeriodVisibility();
    syncPaneLabels();
    refreshInvestorOscSeries();
  }

  function bind() {
    if (document.documentElement.getAttribute('data-im-candle-bound') === '1') return;
    document.documentElement.setAttribute('data-im-candle-bound', '1');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  bind();

  global.InvestingMapCandleModal = {
    open: open,
    close: close,
    applyLang: applyLang,
    _ui: {
      defaultRangeByInterval: DEFAULT_RANGE_BY_INTERVAL,
      rangeForInterval: rangeForInterval,
      panes: PANES,
      paneIndex: PANE_INDEX,
      paneMargins: PANE_MARGINS,
      paneStretch: paneStretch,
      investorCumOptions: INVESTOR_CUM_OPTIONS,
      investorPeriodOptions: INVESTOR_PERIOD_OPTIONS,
      readStoredInvestorCum: readStoredInvestorCum,
      readStoredInvestorPeriod: readStoredInvestorPeriod,
      buildInvestorOscLinesFromByTime: buildInvestorOscLinesFromByTime,
      setInvestorCum: setInvestorCum,
      setInvestorPeriod: setInvestorPeriod,
      paneInvestorLabel: paneInvestorLabel,
      setExpanded: setExpanded,
      isExpanded: function () {
        return !!state.expanded;
      },
    },
    _indicators: {
      sma: sma,
      ema: ema,
      stddev: stddev,
      bollinger: bollinger,
      trailingMinMaxNorm: trailingMinMaxNorm,
      bandwidthPercentile: bandwidthPercentile,
      disparityFromMa: disparityFromMa,
      macd: macd,
      atrPercent: atrPercent,
      aggregateWeeklyBars: aggregateWeeklyBars,
      isoWeekKey: isoWeekKey,
      normalizeBars: normalizeBars,
      buildPanelData: buildPanelData,
      buildInvestorOscLinesFromByTime: buildInvestorOscLinesFromByTime,
      investorOscField: investorOscField,
      applyLiveQuoteToBars: applyLiveQuoteToBars,
      applyLiveQuoteToWeeklyBars: applyLiveQuoteToWeeklyBars,
      asOfToTradeDate: asOfToTradeDate,
      priceMaPeriods: priceMaPeriods,
      maLabel: maLabel,
      PRICE_MA_SPECS: PRICE_MA_SPECS,
      DISP_MA_PERIOD: DISP_MA_PERIOD,
      NORM_WINDOW: NORM_WINDOW,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
