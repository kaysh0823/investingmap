/**
 * Map company candle modal: lightweight-charts v4 + /api/ticker_ohlc.
 * Stacked panels (price / volume / MACD / BBW%·DISP% / ATR%) with synced axes.
 */
(function (global) {
  'use strict';

  /** lightweight-charts is not on cdnjs; jsDelivr serves the npm standalone build. */
  var LWC_SRC =
    'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';

  var RANGES = ['3m', '6m', '1y', '3y', '5y'];
  var INTERVALS = ['daily', 'weekly'];
  var DEFAULT_RANGE_BY_INTERVAL = { daily: '1y', weekly: '5y' };
  var DISPLAY_BARS = {
    daily: { '3m': 50, '6m': 120, '1y': 200, '3y': 750, '5y': 1250 },
    weekly: { '3m': 13, '6m': 26, '1y': 52, '3y': 156, '5y': 260 },
  };
  var RIGHT_OFFSET_BARS = 7;
  var PRICE_SCALE_MIN_WIDTH = 84;
  var MA_FAST = 50;
  var MA_PRICE = 120;
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

  var I18N = {
    ko: {
      close: '닫기',
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
      ma50: 'MA50',
      ma120: 'MA120',
      vma20: 'VMA20',
      bbw: 'BBW%',
      disp: '이격도%',
      macd: 'MACD',
      macdSignal: 'Signal',
      macdHist: 'Hist',
      atr: 'ATR(3)/종가%',
      atrSignal: 'ATR EMA9',
      chartLabel: '일봉 차트',
      weeklyChartLabel: '주봉 차트',
      panePrice: '가격',
      paneVol: '거래량',
      paneMacd: 'MACD',
      paneNorm: 'BBW% · 이격도% (125일)',
      paneAtr: 'ATR(3)/종가% · EMA9',
      liveSession: '장중(현재가)',
    },
    en: {
      close: 'Close',
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
      ma50: 'MA50',
      ma120: 'MA120',
      vma20: 'VMA20',
      bbw: 'BBW%',
      disp: 'DISP%',
      macd: 'MACD',
      macdSignal: 'Signal',
      macdHist: 'Hist',
      atr: 'ATR(3)/Close%',
      atrSignal: 'ATR EMA9',
      chartLabel: 'Daily chart',
      weeklyChartLabel: 'Weekly chart',
      panePrice: 'Price',
      paneVol: 'Volume',
      paneMacd: 'MACD',
      paneNorm: 'BBW% · DISP% (125d)',
      paneAtr: 'ATR(3)/Close% · EMA9',
      liveSession: 'Live (last)',
    },
  };

  var state = {
    open: false,
    ticker: null,
    name: '',
    range: DEFAULT_RANGE_BY_INTERVAL.daily,
    interval: 'daily',
    rangeByInterval: {
      daily: DEFAULT_RANGE_BY_INTERVAL.daily,
      weekly: DEFAULT_RANGE_BY_INTERVAL.weekly,
    },
    charts: null,
    seriesRefs: null,
    barsByTime: null,
    syncingRange: false,
    syncingCross: false,
    fetchToken: 0,
    lwcPromise: null,
    lastFocus: null,
    resizeObs: null,
    liveOverlay: false,
    liveBarTime: null,
    aligningPriceScales: false,
    alignedPriceScaleWidth: PRICE_SCALE_MIN_WIDTH,
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
        };
      } else {
        current.t = bar.t;
        current.h = Math.max(current.h, bar.h);
        current.l = Math.min(current.l, bar.l);
        current.c = bar.c;
        current.v += Number(bar.v) || 0;
        current.live = current.live || !!bar.live;
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

  function ohlcApiUrl(code, range) {
    var origin =
      global.location && global.location.protocol && global.location.protocol.indexOf('http') === 0
        ? global.location.origin
        : '';
    return (
      origin +
      '/api/ticker_ohlc?code=' +
      encodeURIComponent(code) +
      '&range=' +
      encodeURIComponent(range)
    );
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
   * Overlay /api/quotes last onto the newest OHLC bar while the regular session is open.
   * Same trade day → patch c/h/l; newer trade day → append a synthetic bar.
   */
  function applyLiveQuoteToBars(bars, quotesJson, code) {
    if (!bars || !bars.length || !quotesJson) {
      return { bars: bars, live: false, liveTime: null };
    }
    // Settled session: keep confirmed closes.
    if (quotesJson.regularSession === false) {
      return { bars: bars, live: false, liveTime: null };
    }
    if (quotesJson.regularSession !== true) {
      return { bars: bars, live: false, liveTime: null };
    }

    var tick = String(code || '')
      .replace(/\D/g, '')
      .padStart(6, '0')
      .slice(-6);
    var items = quotesJson.items || {};
    var item = items[tick] || items[code] || null;
    if (!item) return { bars: bars, live: false, liveTime: null };

    var last = typeof item.last === 'number' ? item.last : Number(item.last);
    if (!isFinite(last) || last <= 0) return { bars: bars, live: false, liveTime: null };

    var qDate = asOfToTradeDate(quotesJson.asOf);
    if (!qDate) return { bars: bars, live: false, liveTime: null };

    var out = bars.slice();
    var lastBar = out[out.length - 1];
    var lastT = lastBar.t;

    if (qDate === lastT) {
      var high = lastBar.h != null && isFinite(lastBar.h) ? Math.max(lastBar.h, last) : last;
      var low = lastBar.l != null && isFinite(lastBar.l) ? Math.min(lastBar.l, last) : last;
      out[out.length - 1] = {
        t: lastBar.t,
        o: lastBar.o,
        h: high,
        l: low,
        c: last,
        v: lastBar.v,
        live: true,
      };
      return { bars: out, live: true, liveTime: lastT };
    }

    if (qDate > lastT) {
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
        v: 0,
        live: true,
      });
      return { bars: out, live: true, liveTime: qDate };
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
      '.im-candle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px 8px;border-bottom:1px solid var(--border,#30363d);flex:0 0 auto}' +
      '.im-candle-titles{min-width:0;flex:1}' +
      '.im-candle-title{margin:0;font-size:17px;font-weight:700;line-height:1.3;word-break:keep-all}' +
      '.im-candle-sub{margin:4px 0 0;font-size:12px;color:var(--text-muted,#8b949e);font-family:ui-monospace,monospace}' +
      '.im-candle-close{flex-shrink:0;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--text,#e6edf3);font-size:22px;line-height:1;cursor:pointer}' +
      '.im-candle-close:hover,.im-candle-close:focus-visible{background:var(--surface2,#21262d);outline:2px solid var(--accent,#58a6ff);outline-offset:0}' +
      '.im-candle-toolbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border,#30363d);flex:0 0 auto}' +
      '.im-candle-ranges,.im-candle-intervals{display:inline-flex;gap:4px;padding:2px;border-radius:8px;background:var(--surface2,#21262d)}' +
      '.im-candle-range{border:0;background:transparent;color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer}' +
      '.im-candle-range[aria-pressed="true"]{background:var(--surface,#161b22);color:var(--text,#e6edf3);box-shadow:0 0 0 1px var(--border,#30363d)}' +
      '.im-candle-tip{flex:1;min-width:140px;max-height:3.6em;overflow:hidden;font-size:11px;color:var(--text-muted,#8b949e);font-variant-numeric:tabular-nums;line-height:1.35}' +
      '.im-candle-body{position:relative;flex:1 1 auto;min-height:0;padding:6px 8px 8px;display:flex;flex-direction:column;overflow:hidden}' +
      '.im-candle-stack{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;height:100%;width:100%;gap:0;overflow:hidden}' +
      '.im-candle-pane{position:relative;min-height:0;width:100%;overflow:hidden;box-sizing:border-box}' +
      '.im-candle-pane-price{flex:0 0 40%}' +
      '.im-candle-pane-vol{flex:0 0 13%}' +
      '.im-candle-pane-macd{flex:0 0 16%}' +
      '.im-candle-pane-norm{flex:0 0 16%}' +
      '.im-candle-pane-atr{flex:0 0 15%}' +
      '.im-candle-pane-label{position:absolute;top:4px;left:8px;z-index:2;font-size:10px;font-weight:700;letter-spacing:.02em;color:var(--text-muted,#8b949e);pointer-events:none}' +
      '.im-candle-pane-chart{width:100%;height:100%;min-height:0}' +
      '.im-candle-status{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:14px;color:var(--text-muted,#8b949e);background:rgba(22,27,34,.72);z-index:3}' +
      '.im-candle-status.is-on{display:flex}' +
      'body.im-candle-open{overflow:hidden}' +
      '@media (max-width:768px){' +
      '.im-candle-root{padding:0;align-items:stretch}' +
      '.im-candle-dialog{width:100%;height:100dvh;max-width:100%;max-height:100dvh;border-radius:0;border:0}' +
      '.im-candle-tip{font-size:10px;max-height:4em}' +
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
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        cb();
      });
    });
  }

  function ensureDom() {
    injectCss();
    var root = document.getElementById('im-candle-root');
    if (
      root &&
      (!document.getElementById('im-candle-stack') ||
        !document.getElementById('im-candle-macd') ||
        !document.getElementById('im-candle-norm') ||
        !document.getElementById('im-candle-atr') ||
        !document.getElementById('im-candle-intervals') ||
        document.getElementById('im-candle-disp'))
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
      '<button type="button" class="im-candle-close" id="im-candle-close" aria-label="">×</button>' +
      '</div>' +
      '<div class="im-candle-toolbar">' +
      '<div class="im-candle-ranges" role="group" id="im-candle-ranges"></div>' +
      '<div class="im-candle-intervals" role="group" id="im-candle-intervals"></div>' +
      '<div class="im-candle-tip" id="im-candle-tip" aria-live="polite"></div>' +
      '</div>' +
      '<div class="im-candle-body">' +
      '<div class="im-candle-stack" id="im-candle-stack" role="img">' +
      '<div class="im-candle-pane im-candle-pane-price"><span class="im-candle-pane-label" data-pane="price"></span><div class="im-candle-pane-chart" id="im-candle-price"></div></div>' +
      '<div class="im-candle-pane im-candle-pane-vol"><span class="im-candle-pane-label" data-pane="vol"></span><div class="im-candle-pane-chart" id="im-candle-vol"></div></div>' +
      '<div class="im-candle-pane im-candle-pane-macd"><span class="im-candle-pane-label" data-pane="macd"></span><div class="im-candle-pane-chart" id="im-candle-macd"></div></div>' +
      '<div class="im-candle-pane im-candle-pane-norm"><span class="im-candle-pane-label" data-pane="norm"></span><div class="im-candle-pane-chart" id="im-candle-norm"></div></div>' +
      '<div class="im-candle-pane im-candle-pane-atr"><span class="im-candle-pane-label" data-pane="atr"></span><div class="im-candle-pane-chart" id="im-candle-atr"></div></div>' +
      '</div>' +
      '<div class="im-candle-status" id="im-candle-status"></div>' +
      '</div></div>';
    document.body.appendChild(root);

    root.querySelector('.im-candle-backdrop').addEventListener('click', close);
    root.querySelector('#im-candle-close').addEventListener('click', close);
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
      updateSubtitle();
      document
        .getElementById('im-candle-stack')
        .setAttribute(
          'aria-label',
          interval === 'weekly' ? t().weeklyChartLabel : t().chartLabel,
        );
      if (state.ticker) loadAndRender(state.ticker, state.range);
    });
    return root;
  }

  function syncPaneLabels() {
    var labels = t();
    var root = document.getElementById('im-candle-stack');
    if (!root) return;
    var map = {
      price: labels.panePrice,
      vol: labels.paneVol,
      macd: labels.paneMacd,
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

  function setStatus(msg, on) {
    var el = document.getElementById('im-candle-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!on);
  }

  /* ---------- series build ---------- */

  function normalizeBars(rawBars) {
    var bars = [];
    for (var i = 0; i < rawBars.length; i++) {
      var b = rawBars[i];
      if (!b || !b.t) continue;
      var c = typeof b.c === 'number' ? b.c : Number(b.c);
      if (!isFinite(c) || c <= 0) continue;
      var o = b.o != null && isFinite(Number(b.o)) ? Number(b.o) : c;
      var h = b.h != null && isFinite(Number(b.h)) ? Number(b.h) : Math.max(o, c);
      var l = b.l != null && isFinite(Number(b.l)) ? Number(b.l) : Math.min(o, c);
      var v = b.v != null && isFinite(Number(b.v)) ? Number(b.v) : 0;
      if (h < Math.max(o, c)) h = Math.max(o, c);
      if (l > Math.min(o, c)) l = Math.min(o, c);
      bars.push({ t: b.t, o: o, h: h, l: l, c: c, v: v });
    }
    return bars;
  }

  function buildPanelData(fullBars, range, interval) {
    var closes = fullBars.map(function (b) {
      return b.c;
    });
    var vols = fullBars.map(function (b) {
      return b.v;
    });
    var ma50 = sma(closes, MA_FAST);
    var ma120 = sma(closes, MA_PRICE);
    var vma20 = sma(vols, MA_VOL);
    var bb = bollinger(closes, BB_PERIOD, BB_MULT);
    var bbwPct = trailingMinMaxNorm(bb.width, NORM_WINDOW);
    var disparity = disparityFromMa(closes, ma50);
    var dispPct = trailingMinMaxNorm(disparity, NORM_WINDOW);
    var macdPack = macd(closes, MACD_FAST, MACD_SLOW, MACD_SIGNAL);
    var atrPack = atrPercent(fullBars, ATR_PERIOD, ATR_SIGNAL);

    var displayMap = DISPLAY_BARS[interval] || DISPLAY_BARS.daily;
    var displayN = displayMap[range] || displayMap['1y'];
    var start = Math.max(0, fullBars.length - displayN);

    var candles = [];
    var ma50Line = [];
    var maLine = [];
    var volumes = [];
    var vmaLine = [];
    var macdLine = [];
    var macdSignalLine = [];
    var macdHist = [];
    var bbwLine = [];
    var dispLine = [];
    var atrLine = [];
    var atrSignalLine = [];
    var byTime = Object.create(null);

    for (var i = start; i < fullBars.length; i++) {
      var b = fullBars[i];
      candles.push({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c });
      volumes.push({
        time: b.t,
        value: b.v,
        color: b.c >= b.o ? 'rgba(63,185,80,0.55)' : 'rgba(248,81,73,0.55)',
      });
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
      if (bbwPct[i] != null && isFinite(bbwPct[i])) bbwLine.push({ time: b.t, value: bbwPct[i] });
      if (dispPct[i] != null && isFinite(dispPct[i])) dispLine.push({ time: b.t, value: dispPct[i] });
      if (atrPack.value[i] != null && isFinite(atrPack.value[i])) {
        atrLine.push({ time: b.t, value: atrPack.value[i] });
      }
      if (atrPack.signal[i] != null && isFinite(atrPack.signal[i])) {
        atrSignalLine.push({ time: b.t, value: atrPack.signal[i] });
      }
      byTime[b.t] = {
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
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
      };
    }

    return {
      candles: candles,
      ma50Line: ma50Line,
      maLine: maLine,
      volumes: volumes,
      vmaLine: vmaLine,
      macdLine: macdLine,
      macdSignalLine: macdSignalLine,
      macdHist: macdHist,
      bbwLine: bbwLine,
      dispLine: dispLine,
      atrLine: atrLine,
      atrSignalLine: atrSignalLine,
      byTime: byTime,
    };
  }

  function updateTip(time) {
    var tip = document.getElementById('im-candle-tip');
    if (!tip) return;
    var labels = t();
    if (!time || !state.barsByTime || !state.barsByTime[time]) {
      tip.textContent = '';
      return;
    }
    var b = state.barsByTime[time];
    tip.textContent =
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
      labels.ma50 +
      ' ' +
      fmtPrice(b.ma50) +
      ' · ' +
      labels.ma120 +
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
      fmtNum(b.macdHist, 2) +
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
    if (b.live) tip.textContent += ' · ' + labels.liveSession;
  }

  function destroyCharts() {
    if (state.resizeObs) {
      try {
        state.resizeObs.disconnect();
      } catch (e) {}
      state.resizeObs = null;
    }
    if (state.charts) {
      for (var i = 0; i < state.charts.length; i++) {
        try {
          state.charts[i].remove();
        } catch (e2) {}
      }
    }
    state.charts = null;
    state.seriesRefs = null;
    state.barsByTime = null;
    state.aligningPriceScales = false;
    state.alignedPriceScaleWidth = PRICE_SCALE_MIN_WIDTH;
  }

  function makeChart(LWC, container, colors, opts) {
    var w = Math.max(container.clientWidth || 0, 120);
    var h = Math.max(container.clientHeight || 0, 48);
    var mode =
      opts && opts.logScale && LWC.PriceScaleMode
        ? LWC.PriceScaleMode.Logarithmic
        : LWC.PriceScaleMode
          ? LWC.PriceScaleMode.Normal
          : 0;
    return LWC.createChart(container, {
      width: w,
      height: h,
      layout: {
        background: { type: 'solid', color: colors.bg },
        textColor: colors.muted,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 1 },
      rightPriceScale: {
        borderColor: colors.border,
        mode: mode,
        minimumWidth: PRICE_SCALE_MIN_WIDTH,
        alignLabels: true,
        scaleMargins: opts && opts.scaleMargins ? opts.scaleMargins : { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: colors.border,
        rightOffset: RIGHT_OFFSET_BARS,
        timeVisible: !!(opts && opts.timeVisible),
        visible: opts && opts.timeVisible !== false ? true : true,
      },
      handleScroll: true,
      handleScale: true,
    });
  }

  function wireSync(charts, seriesByChart) {
    function onRange(sourceIdx, range) {
      if (state.syncingRange || !range) return;
      state.syncingRange = true;
      for (var i = 0; i < charts.length; i++) {
        if (i === sourceIdx) continue;
        try {
          charts[i].timeScale().setVisibleLogicalRange(range);
        } catch (e) {}
      }
      state.syncingRange = false;
    }

    for (var i = 0; i < charts.length; i++) {
      (function (idx) {
        charts[idx].timeScale().subscribeVisibleLogicalRangeChange(function (range) {
          onRange(idx, range);
        });
      })(i);
    }

    function syncCross(sourceIdx, param) {
      if (state.syncingCross) return;
      state.syncingCross = true;
      var time = param && param.time ? param.time : null;
      if (!time) {
        updateTip(null);
        for (var j = 0; j < charts.length; j++) {
          if (j === sourceIdx) continue;
          try {
            charts[j].clearCrosshairPosition();
          } catch (e) {}
        }
        state.syncingCross = false;
        return;
      }
      updateTip(String(time));
      for (var k = 0; k < charts.length; k++) {
        if (k === sourceIdx) continue;
        var series = seriesByChart[k];
        if (!series) continue;
        try {
          var tipBar = state.barsByTime && state.barsByTime[String(time)];
          var price = null;
          if (k === 0 && tipBar) price = tipBar.c;
          else if (k === 1 && tipBar) price = tipBar.v;
          else if (k === 2 && tipBar) price = tipBar.macd;
          else if (k === 3 && tipBar) price = tipBar.bbw;
          else if (k === 4 && tipBar) price = tipBar.atr;
          if (price != null && isFinite(price)) {
            charts[k].setCrosshairPosition(price, time, series);
          }
        } catch (e3) {}
      }
      state.syncingCross = false;
    }

    for (var c = 0; c < charts.length; c++) {
      (function (idx) {
        charts[idx].subscribeCrosshairMove(function (param) {
          syncCross(idx, param);
        });
      })(c);
    }
  }

  function createCharts(LWC, data) {
    destroyCharts();
    var priceEl = document.getElementById('im-candle-price');
    var volEl = document.getElementById('im-candle-vol');
    var macdEl = document.getElementById('im-candle-macd');
    var normEl = document.getElementById('im-candle-norm');
    var atrEl = document.getElementById('im-candle-atr');
    if (!priceEl || !volEl || !macdEl || !normEl || !atrEl) return;
    priceEl.innerHTML = '';
    volEl.innerHTML = '';
    macdEl.innerHTML = '';
    normEl.innerHTML = '';
    atrEl.innerHTML = '';

    var colors = themeColors();
    var priceChart = makeChart(LWC, priceEl, colors, {
      scaleMargins: { top: 0.06, bottom: 0.1 },
      timeVisible: false,
      logScale: true,
    });
    var volChart = makeChart(LWC, volEl, colors, {
      scaleMargins: { top: 0.12, bottom: 0.08 },
      timeVisible: false,
    });
    var macdChart = makeChart(LWC, macdEl, colors, {
      scaleMargins: { top: 0.12, bottom: 0.12 },
      timeVisible: false,
    });
    var normChart = makeChart(LWC, normEl, colors, {
      scaleMargins: { top: 0.12, bottom: 0.12 },
      timeVisible: false,
    });
    var atrChart = makeChart(LWC, atrEl, colors, {
      scaleMargins: { top: 0.12, bottom: 0.12 },
      timeVisible: true,
    });

    var candle = priceChart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderVisible: false,
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });
    candle.setData(data.candles);

    var ma50Series = priceChart.addLineSeries({
      color: '#e3b341',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'MA50',
    });
    ma50Series.setData(data.ma50Line);

    var maSeries = priceChart.addLineSeries({
      color: '#58a6ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'MA120',
    });
    maSeries.setData(data.maLine);

    var volSeries = volChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      color: 'rgba(63,185,80,0.55)',
    });
    volSeries.setData(data.volumes);

    var vmaSeries = volChart.addLineSeries({
      color: '#d2a8ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'VMA20',
    });
    vmaSeries.setData(data.vmaLine);

    var macdHistSeries = macdChart.addHistogramSeries({
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    macdHistSeries.setData(data.macdHist);

    var macdLineSeries = macdChart.addLineSeries({
      color: '#58a6ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'MACD',
    });
    macdLineSeries.setData(data.macdLine);

    var macdSignalSeries = macdChart.addLineSeries({
      color: '#f778ba',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Signal',
    });
    macdSignalSeries.setData(data.macdSignalLine);

    var bbwSeries = normChart.addLineSeries({
      color: '#f0883e',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'BBW%',
    });
    bbwSeries.setData(data.bbwLine);

    var dispSeries = normChart.addLineSeries({
      color: '#39c5cf',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'DISP%',
    });
    dispSeries.setData(data.dispLine);

    var atrSeries = atrChart.addLineSeries({
      color: '#a371f7',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: 'ATR(3)/Close%',
    });
    atrSeries.setData(data.atrLine);

    var atrSignalSeries = atrChart.addLineSeries({
      color: '#e3b341',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: 'EMA9',
    });
    atrSignalSeries.setData(data.atrSignalLine);

    priceChart.timeScale().applyOptions({ visible: false });
    volChart.timeScale().applyOptions({ visible: false });
    macdChart.timeScale().applyOptions({ visible: false });
    normChart.timeScale().applyOptions({ visible: false });
    atrChart.timeScale().applyOptions({ visible: true, borderVisible: true });

    var charts = [priceChart, volChart, macdChart, normChart, atrChart];
    var primarySeries = [candle, volSeries, macdLineSeries, bbwSeries, atrSeries];
    wireSync(charts, primarySeries);

    priceChart.timeScale().fitContent();
    try {
      var lr = priceChart.timeScale().getVisibleLogicalRange();
      if (lr) {
        volChart.timeScale().setVisibleLogicalRange(lr);
        macdChart.timeScale().setVisibleLogicalRange(lr);
        normChart.timeScale().setVisibleLogicalRange(lr);
        atrChart.timeScale().setVisibleLogicalRange(lr);
      }
    } catch (e) {}

    state.charts = charts;
    state.seriesRefs = {
      candle: candle,
      ma50: ma50Series,
      ma: maSeries,
      vol: volSeries,
      vma: vmaSeries,
      macdHist: macdHistSeries,
      macd: macdLineSeries,
      macdSignal: macdSignalSeries,
      bbw: bbwSeries,
      disp: dispSeries,
      atr: atrSeries,
      atrSignal: atrSignalSeries,
    };
    state.barsByTime = data.byTime;

    var stack = document.getElementById('im-candle-stack');
    if (state.resizeObs) {
      try {
        state.resizeObs.disconnect();
      } catch (eRo) {}
      state.resizeObs = null;
    }
    if (stack && typeof ResizeObserver !== 'undefined') {
      state.resizeObs = new ResizeObserver(function () {
        resizeCharts();
      });
      state.resizeObs.observe(stack);
      var body = document.querySelector('.im-candle-body');
      if (body) state.resizeObs.observe(body);
    }
    resizeCharts();
    afterLayout(function () {
      resizeCharts();
      alignPriceScaleWidths();
    });
  }

  /**
   * lightweight-charts has a minimum width but no max/fixed-width option.
   * Measure each rendered right scale, then raise every panel's minimum to the
   * widest actual scale. This produces one shared plot width for all values.
   */
  function alignPriceScaleWidths(chartsOverride) {
    var charts = chartsOverride || state.charts;
    if (!charts || state.aligningPriceScales) return;
    state.aligningPriceScales = true;
    try {
      var width = PRICE_SCALE_MIN_WIDTH;
      for (var i = 0; i < charts.length; i++) {
        var scale = charts[i].priceScale('right');
        if (!scale || typeof scale.width !== 'function') continue;
        var measured = Number(scale.width());
        if (isFinite(measured)) width = Math.max(width, Math.ceil(measured));
      }
      if (width !== state.alignedPriceScaleWidth) {
        state.alignedPriceScaleWidth = width;
        for (var j = 0; j < charts.length; j++) {
          charts[j].priceScale('right').applyOptions({ minimumWidth: width });
        }
      }
    } catch (e) {
      // Keep the baseline minimumWidth on older lightweight-charts builds.
    } finally {
      state.aligningPriceScales = false;
    }
  }

  function resizeCharts() {
    if (!state.charts) return;
    var ids = ['im-candle-price', 'im-candle-vol', 'im-candle-macd', 'im-candle-norm', 'im-candle-atr'];
    for (var i = 0; i < state.charts.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var w = Math.max(el.clientWidth || 0, 80);
      var h = Math.max(el.clientHeight || 0, 40);
      try {
        if (typeof state.charts[i].resize === 'function') {
          state.charts[i].resize(w, h);
        } else {
          state.charts[i].applyOptions({ width: w, height: h });
        }
      } catch (e) {}
    }
    requestAnimationFrame(alignPriceScaleWidths);
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
        var ohlcP = fetch(ohlcApiUrl(code, requestRange), { credentials: 'omit' }).then(function (res) {
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
        var overlaid = applyLiveQuoteToBars(fullBars, pack.quotes, code);
        fullBars = overlaid.bars;
        state.liveOverlay = !!overlaid.live;
        state.liveBarTime = overlaid.liveTime || null;
        updateSubtitle();

        if (state.interval === 'weekly') fullBars = aggregateWeeklyBars(fullBars);
        var data = buildPanelData(fullBars, range, state.interval);
        if (!data.candles.length) {
          destroyCharts();
          setStatus(labels.empty, true);
          return;
        }
        setStatus('', false);
        // Wait until modal flex layout assigns real pane pixel heights.
        afterLayout(function () {
          if (token !== state.fetchToken || !state.open) return;
          createCharts(pack.LWC, data);
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
    var ticker = opts && opts.ticker ? String(opts.ticker).replace(/\D/g, '') : '';
    if (!ticker || ticker.length < 5) return;
    ensureDom();
    var labels = t();
    state.lastFocus = document.activeElement;
    state.open = true;
    state.ticker = ticker;
    state.name = resolveName(ticker, opts && opts.name);
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

    document.getElementById('im-candle-title').textContent = state.name || ticker;
    state.liveOverlay = false;
    state.liveBarTime = null;
    updateSubtitle();
    document.getElementById('im-candle-close').setAttribute('aria-label', labels.close);
    syncRangeButtons();
    syncIntervalButtons();
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
      close();
    }
  }

  function applyLang() {
    if (!state.open) return;
    var labels = t();
    var closeBtn = document.getElementById('im-candle-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', labels.close);
    updateSubtitle();
    syncRangeButtons();
    syncIntervalButtons();
    syncPaneLabels();
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
      alignPriceScaleWidths: alignPriceScaleWidths,
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
      applyLiveQuoteToBars: applyLiveQuoteToBars,
      asOfToTradeDate: asOfToTradeDate,
      NORM_WINDOW: NORM_WINDOW,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
