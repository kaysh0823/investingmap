/**
 * Map company candle modal: lightweight-charts v4 + /api/ticker_ohlc.
 * Stacked panels (price / volume / BBW%) with synced timeScale + crosshair.
 */
(function (global) {
  'use strict';

  /** lightweight-charts is not on cdnjs; jsDelivr serves the npm standalone build. */
  var LWC_SRC =
    'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';

  var RANGES = ['3m', '6m', '1y'];
  var DEFAULT_RANGE = '1y';
  var DISPLAY_DAYS = { '3m': 50, '6m': 120, '1y': 200 };
  var MA_PRICE = 120;
  var MA_VOL = 20;
  var BB_PERIOD = 20;
  var BB_MULT = 2;
  var BBW_NORM_WINDOW = 120;

  var I18N = {
    ko: {
      close: '닫기',
      loading: '차트 불러오는 중…',
      empty: '표시할 일봉 데이터가 없습니다.',
      error: '차트를 불러오지 못했습니다.',
      range3m: '3M',
      range6m: '6M',
      range1y: '1Y',
      open: '시가',
      high: '고가',
      low: '저가',
      closePx: '종가',
      volume: '거래량',
      ma120: 'MA120',
      vma20: 'VMA20',
      bbw: 'BBW%',
      chartLabel: '일봉 차트',
      panePrice: '가격',
      paneVol: '거래량',
      paneBbw: 'BBW%',
    },
    en: {
      close: 'Close',
      loading: 'Loading chart…',
      empty: 'No daily candle data available.',
      error: 'Failed to load chart.',
      range3m: '3M',
      range6m: '6M',
      range1y: '1Y',
      open: 'Open',
      high: 'High',
      low: 'Low',
      closePx: 'Close',
      volume: 'Volume',
      ma120: 'MA120',
      vma20: 'VMA20',
      bbw: 'BBW%',
      chartLabel: 'Daily chart',
      panePrice: 'Price',
      paneVol: 'Volume',
      paneBbw: 'BBW%',
    },
  };

  var state = {
    open: false,
    ticker: null,
    name: '',
    range: DEFAULT_RANGE,
    charts: null,
    seriesRefs: null,
    barsByTime: null,
    syncingRange: false,
    syncingCross: false,
    fetchToken: 0,
    lwcPromise: null,
    lastFocus: null,
    resizeObs: null,
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
   * Normalize Bollinger bandwidth over a trailing window to 0..100.
   * BBW%_i = (width_i - min_w) / (max_w - min_w) * 100 on [i-window+1, i].
   */
  function bandwidthPercentile(widths, window) {
    var out = new Array(widths.length);
    for (var i = 0; i < widths.length; i++) {
      out[i] = null;
      if (widths[i] == null || !isFinite(widths[i]) || i < window - 1) continue;
      var minW = Infinity;
      var maxW = -Infinity;
      var n = 0;
      for (var j = i - window + 1; j <= i; j++) {
        var w = widths[j];
        if (w == null || !isFinite(w)) continue;
        n += 1;
        if (w < minW) minW = w;
        if (w > maxW) maxW = w;
      }
      if (n < window || !(maxW > minW)) {
        out[i] = n === window && maxW === minW ? 50 : null;
        continue;
      }
      out[i] = ((widths[i] - minW) / (maxW - minW)) * 100;
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
      '.im-candle-dialog{position:relative;z-index:1;width:min(960px,100%);max-height:min(94vh,900px);display:flex;flex-direction:column;background:var(--surface,#161b22);color:var(--text,#e6edf3);border:1px solid var(--border,#30363d);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.45);overflow:hidden}' +
      '.im-candle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 10px;border-bottom:1px solid var(--border,#30363d);flex-shrink:0}' +
      '.im-candle-titles{min-width:0;flex:1}' +
      '.im-candle-title{margin:0;font-size:17px;font-weight:700;line-height:1.3;word-break:keep-all}' +
      '.im-candle-sub{margin:4px 0 0;font-size:12px;color:var(--text-muted,#8b949e);font-family:ui-monospace,monospace}' +
      '.im-candle-close{flex-shrink:0;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--text,#e6edf3);font-size:22px;line-height:1;cursor:pointer}' +
      '.im-candle-close:hover,.im-candle-close:focus-visible{background:var(--surface2,#21262d);outline:2px solid var(--accent,#58a6ff);outline-offset:0}' +
      '.im-candle-toolbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border,#30363d);flex-shrink:0}' +
      '.im-candle-ranges{display:inline-flex;gap:4px;padding:2px;border-radius:8px;background:var(--surface2,#21262d)}' +
      '.im-candle-range{border:0;background:transparent;color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer}' +
      '.im-candle-range[aria-pressed="true"]{background:var(--surface,#161b22);color:var(--text,#e6edf3);box-shadow:0 0 0 1px var(--border,#30363d)}' +
      '.im-candle-tip{flex:1;min-width:160px;font-size:11px;color:var(--text-muted,#8b949e);font-variant-numeric:tabular-nums;line-height:1.45}' +
      '.im-candle-body{position:relative;flex:1;min-height:360px;padding:6px 8px 10px;display:flex;flex-direction:column;min-height:0}' +
      '.im-candle-stack{display:flex;flex-direction:column;flex:1;min-height:0;gap:2px;height:100%}' +
      '.im-candle-pane{position:relative;min-height:0;width:100%}' +
      '.im-candle-pane-price{flex:6 1 0}' +
      '.im-candle-pane-vol{flex:2 1 0}' +
      '.im-candle-pane-bbw{flex:2 1 0}' +
      '.im-candle-pane-label{position:absolute;top:4px;left:8px;z-index:2;font-size:10px;font-weight:700;letter-spacing:.02em;color:var(--text-muted,#8b949e);pointer-events:none}' +
      '.im-candle-pane-chart{width:100%;height:100%}' +
      '.im-candle-status{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:14px;color:var(--text-muted,#8b949e);background:rgba(22,27,34,.72);z-index:3}' +
      '.im-candle-status.is-on{display:flex}' +
      'body.im-candle-open{overflow:hidden}' +
      '@media (max-width:768px){' +
      '.im-candle-root{padding:0;align-items:stretch}' +
      '.im-candle-dialog{width:100%;max-height:none;height:100%;border-radius:0;border:0}' +
      '.im-candle-body{flex:1;min-height:0}' +
      '.im-candle-tip{font-size:10px}' +
      '}';
    var el = document.getElementById('im-candle-modal-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'im-candle-modal-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function ensureDom() {
    injectCss();
    var root = document.getElementById('im-candle-root');
    if (root && !document.getElementById('im-candle-stack')) {
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
      '<div class="im-candle-tip" id="im-candle-tip" aria-live="polite"></div>' +
      '</div>' +
      '<div class="im-candle-body">' +
      '<div class="im-candle-stack" id="im-candle-stack" role="img">' +
      '<div class="im-candle-pane im-candle-pane-price"><span class="im-candle-pane-label" data-pane="price"></span><div class="im-candle-pane-chart" id="im-candle-price"></div></div>' +
      '<div class="im-candle-pane im-candle-pane-vol"><span class="im-candle-pane-label" data-pane="vol"></span><div class="im-candle-pane-chart" id="im-candle-vol"></div></div>' +
      '<div class="im-candle-pane im-candle-pane-bbw"><span class="im-candle-pane-label" data-pane="bbw"></span><div class="im-candle-pane-chart" id="im-candle-bbw"></div></div>' +
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
      syncRangeButtons();
      if (state.ticker) loadAndRender(state.ticker, state.range);
    });
    return root;
  }

  function syncPaneLabels() {
    var labels = t();
    var root = document.getElementById('im-candle-stack');
    if (!root) return;
    var map = { price: labels.panePrice, vol: labels.paneVol, bbw: labels.paneBbw };
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
      var lab = r === '3m' ? labels.range3m : r === '6m' ? labels.range6m : labels.range1y;
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

  function buildPanelData(fullBars, range) {
    var closes = fullBars.map(function (b) {
      return b.c;
    });
    var vols = fullBars.map(function (b) {
      return b.v;
    });
    var ma120 = sma(closes, MA_PRICE);
    var vma20 = sma(vols, MA_VOL);
    var bb = bollinger(closes, BB_PERIOD, BB_MULT);
    var bbwPct = bandwidthPercentile(bb.width, BBW_NORM_WINDOW);

    var displayN = DISPLAY_DAYS[range] || DISPLAY_DAYS['1y'];
    var start = Math.max(0, fullBars.length - displayN);

    var candles = [];
    var maLine = [];
    var volumes = [];
    var vmaLine = [];
    var bbwLine = [];
    var byTime = Object.create(null);

    for (var i = start; i < fullBars.length; i++) {
      var b = fullBars[i];
      candles.push({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c });
      volumes.push({
        time: b.t,
        value: b.v,
        color: b.c >= b.o ? 'rgba(63,185,80,0.55)' : 'rgba(248,81,73,0.55)',
      });
      if (ma120[i] != null && isFinite(ma120[i])) maLine.push({ time: b.t, value: ma120[i] });
      if (vma20[i] != null && isFinite(vma20[i])) vmaLine.push({ time: b.t, value: vma20[i] });
      if (bbwPct[i] != null && isFinite(bbwPct[i])) bbwLine.push({ time: b.t, value: bbwPct[i] });
      byTime[b.t] = {
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
        ma120: ma120[i],
        vma20: vma20[i],
        bbw: bbwPct[i],
      };
    }

    return {
      candles: candles,
      maLine: maLine,
      volumes: volumes,
      vmaLine: vmaLine,
      bbwLine: bbwLine,
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
      labels.ma120 +
      ' ' +
      fmtPrice(b.ma120) +
      ' · ' +
      labels.vma20 +
      ' ' +
      fmtVol(b.vma20) +
      ' · ' +
      labels.bbw +
      ' ' +
      fmtNum(b.bbw, 1);
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
  }

  function makeChart(LWC, container, colors, opts) {
    return LWC.createChart(container, {
      width: container.clientWidth || 600,
      height: Math.max(container.clientHeight || 80, 60),
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
        scaleMargins: opts && opts.scaleMargins ? opts.scaleMargins : { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: colors.border,
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
          else if (k === 2 && tipBar) price = tipBar.bbw;
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
    var bbwEl = document.getElementById('im-candle-bbw');
    if (!priceEl || !volEl || !bbwEl) return;
    priceEl.innerHTML = '';
    volEl.innerHTML = '';
    bbwEl.innerHTML = '';

    var colors = themeColors();
    var priceChart = makeChart(LWC, priceEl, colors, {
      scaleMargins: { top: 0.06, bottom: 0.1 },
      timeVisible: false,
    });
    var volChart = makeChart(LWC, volEl, colors, {
      scaleMargins: { top: 0.12, bottom: 0.08 },
      timeVisible: false,
    });
    var bbwChart = makeChart(LWC, bbwEl, colors, {
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

    var bbwSeries = bbwChart.addLineSeries({
      color: '#f0883e',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'BBW%',
    });
    bbwSeries.setData(data.bbwLine);

    // Hide time labels on upper panes
    priceChart.timeScale().applyOptions({ visible: false });
    volChart.timeScale().applyOptions({ visible: false });
    bbwChart.timeScale().applyOptions({ visible: true, borderVisible: true });

    var charts = [priceChart, volChart, bbwChart];
    var primarySeries = [candle, volSeries, bbwSeries];
    wireSync(charts, primarySeries);

    priceChart.timeScale().fitContent();
    try {
      var lr = priceChart.timeScale().getVisibleLogicalRange();
      if (lr) {
        volChart.timeScale().setVisibleLogicalRange(lr);
        bbwChart.timeScale().setVisibleLogicalRange(lr);
      }
    } catch (e) {}

    state.charts = charts;
    state.seriesRefs = { candle: candle, ma: maSeries, vol: volSeries, vma: vmaSeries, bbw: bbwSeries };
    state.barsByTime = data.byTime;

    var stack = document.getElementById('im-candle-stack');
    if (stack && typeof ResizeObserver !== 'undefined') {
      state.resizeObs = new ResizeObserver(function () {
        resizeCharts();
      });
      state.resizeObs.observe(stack);
    }
    resizeCharts();
  }

  function resizeCharts() {
    if (!state.charts) return;
    var ids = ['im-candle-price', 'im-candle-vol', 'im-candle-bbw'];
    for (var i = 0; i < state.charts.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      try {
        state.charts[i].applyOptions({
          width: el.clientWidth,
          height: Math.max(el.clientHeight || 60, 48),
        });
      } catch (e) {}
    }
  }

  function loadAndRender(code, range) {
    var labels = t();
    var token = ++state.fetchToken;
    setStatus(labels.loading, true);
    updateTip(null);

    return loadLwc()
      .then(function (LWC) {
        return fetch(ohlcApiUrl(code, range), { credentials: 'omit' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json().then(function (json) {
            return { LWC: LWC, json: json };
          });
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
        var data = buildPanelData(fullBars, range);
        if (!data.candles.length) {
          destroyCharts();
          setStatus(labels.empty, true);
          return;
        }
        setStatus('', false);
        createCharts(pack.LWC, data);
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
    state.range =
      opts && opts.range && RANGES.indexOf(opts.range) >= 0 ? opts.range : DEFAULT_RANGE;

    var root = document.getElementById('im-candle-root');
    root.removeAttribute('hidden');
    root.classList.add('is-open');
    document.body.classList.add('im-candle-open');

    document.getElementById('im-candle-title').textContent = state.name || ticker;
    document.getElementById('im-candle-sub').textContent = ticker + ' · ' + labels.chartLabel;
    document.getElementById('im-candle-close').setAttribute('aria-label', labels.close);
    syncRangeButtons();
    syncPaneLabels();
    document.getElementById('im-candle-stack').setAttribute('aria-label', labels.chartLabel);

    loadAndRender(ticker, state.range);
    setTimeout(function () {
      var dialog = root.querySelector('.im-candle-dialog');
      if (dialog) dialog.focus();
      resizeCharts();
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
    var sub = document.getElementById('im-candle-sub');
    if (sub && state.ticker) sub.textContent = state.ticker + ' · ' + labels.chartLabel;
    syncRangeButtons();
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
    _indicators: {
      sma: sma,
      stddev: stddev,
      bollinger: bollinger,
      bandwidthPercentile: bandwidthPercentile,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
