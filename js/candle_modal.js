/**
 * Map company candle modal: lightweight-charts (CDN) + /api/ticker_ohlc on demand.
 * Opens on table row / company name / mini-spark (and mobile card name/spark/summary).
 */
(function (global) {
  'use strict';

  /** lightweight-charts is not published on cdnjs; jsDelivr serves the npm standalone build. */
  var LWC_SRC =
    'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';

  var RANGES = ['3m', '6m', '1y'];
  var DEFAULT_RANGE = '6m';

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
      chartLabel: '일봉 차트',
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
      chartLabel: 'Daily chart',
    },
  };

  var state = {
    open: false,
    ticker: null,
    name: '',
    range: DEFAULT_RANGE,
    chart: null,
    candleSeries: null,
    volumeSeries: null,
    barsByTime: null,
    fetchToken: 0,
    lwcPromise: null,
    lastFocus: null,
  };

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

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtPrice(n) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ko-KR');
  }

  function fmtVol(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ko-KR');
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

  function injectCss() {
    if (document.getElementById('im-candle-modal-css')) return;
    var css =
      '#main-table tbody tr[data-ticker]{cursor:pointer}' +
      '#main-table tbody tr[data-ticker] .company-name,' +
      '#main-table tbody tr[data-ticker] .spark-cell{cursor:pointer}' +
      '#table-cards .im-row-name,#table-cards .im-card-spark{cursor:pointer}' +
      '.im-candle-root{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
      '.im-candle-root.is-open{display:flex}' +
      '.im-candle-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}' +
      '.im-candle-dialog{position:relative;z-index:1;width:min(920px,100%);max-height:min(92vh,820px);display:flex;flex-direction:column;background:var(--surface,#161b22);color:var(--text,#e6edf3);border:1px solid var(--border,#30363d);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.45);overflow:hidden}' +
      '.im-candle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 10px;border-bottom:1px solid var(--border,#30363d)}' +
      '.im-candle-titles{min-width:0;flex:1}' +
      '.im-candle-title{margin:0;font-size:17px;font-weight:700;line-height:1.3;word-break:keep-all}' +
      '.im-candle-sub{margin:4px 0 0;font-size:12px;color:var(--text-muted,#8b949e);font-family:ui-monospace,monospace}' +
      '.im-candle-close{flex-shrink:0;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--text,#e6edf3);font-size:22px;line-height:1;cursor:pointer}' +
      '.im-candle-close:hover,.im-candle-close:focus-visible{background:var(--surface2,#21262d);outline:2px solid var(--accent,#58a6ff);outline-offset:0}' +
      '.im-candle-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border,#30363d)}' +
      '.im-candle-ranges{display:inline-flex;gap:4px;padding:2px;border-radius:8px;background:var(--surface2,#21262d)}' +
      '.im-candle-range{border:0;background:transparent;color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer}' +
      '.im-candle-range[aria-pressed="true"]{background:var(--surface,#161b22);color:var(--text,#e6edf3);box-shadow:0 0 0 1px var(--border,#30363d)}' +
      '.im-candle-tip{flex:1;min-width:140px;font-size:12px;color:var(--text-muted,#8b949e);font-variant-numeric:tabular-nums;line-height:1.4}' +
      '.im-candle-body{position:relative;flex:1;min-height:280px;padding:8px 8px 12px}' +
      '.im-candle-chart{width:100%;height:420px}' +
      '.im-candle-status{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:14px;color:var(--text-muted,#8b949e);background:rgba(22,27,34,.72);z-index:2}' +
      '.im-candle-status.is-on{display:flex}' +
      'body.im-candle-open{overflow:hidden}' +
      '@media (max-width:768px){' +
      '.im-candle-root{padding:0;align-items:stretch}' +
      '.im-candle-dialog{width:100%;max-height:none;height:100%;border-radius:0;border:0}' +
      '.im-candle-chart{height:min(58vh,480px);flex:1}' +
      '.im-candle-body{flex:1;display:flex;flex-direction:column;min-height:0}' +
      '}';
    var el = document.createElement('style');
    el.id = 'im-candle-modal-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function ensureDom() {
    injectCss();
    var root = document.getElementById('im-candle-root');
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
      '<div class="im-candle-chart" id="im-candle-chart" role="img"></div>' +
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

  function destroyChart() {
    if (state.chart) {
      try {
        state.chart.remove();
      } catch (e) {}
    }
    state.chart = null;
    state.candleSeries = null;
    state.volumeSeries = null;
    state.barsByTime = null;
  }

  function barsToSeries(bars) {
    var candles = [];
    var volumes = [];
    var byTime = Object.create(null);
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i];
      if (!b || !b.t) continue;
      var c = typeof b.c === 'number' ? b.c : Number(b.c);
      if (!isFinite(c) || c <= 0) continue;
      var o = b.o != null && isFinite(Number(b.o)) ? Number(b.o) : c;
      var h = b.h != null && isFinite(Number(b.h)) ? Number(b.h) : Math.max(o, c);
      var l = b.l != null && isFinite(Number(b.l)) ? Number(b.l) : Math.min(o, c);
      var v = b.v != null && isFinite(Number(b.v)) ? Number(b.v) : 0;
      if (h < Math.max(o, c)) h = Math.max(o, c);
      if (l > Math.min(o, c)) l = Math.min(o, c);
      candles.push({ time: b.t, open: o, high: h, low: l, close: c });
      volumes.push({
        time: b.t,
        value: v,
        color: c >= o ? 'rgba(63,185,80,0.55)' : 'rgba(248,81,73,0.55)',
      });
      byTime[b.t] = { o: o, h: h, l: l, c: c, v: v };
    }
    return { candles: candles, volumes: volumes, byTime: byTime };
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
      '  ·  ' +
      labels.open +
      ' ' +
      fmtPrice(b.o) +
      '  ' +
      labels.high +
      ' ' +
      fmtPrice(b.h) +
      '  ' +
      labels.low +
      ' ' +
      fmtPrice(b.l) +
      '  ' +
      labels.closePx +
      ' ' +
      fmtPrice(b.c) +
      '  ' +
      labels.volume +
      ' ' +
      fmtVol(b.v);
  }

  function createChart(LWC, seriesData) {
    destroyChart();
    var container = document.getElementById('im-candle-chart');
    if (!container) return;
    container.innerHTML = '';
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#161b22';
    var text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e6edf3';
    var muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#8b949e';
    var border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#30363d';

    var chart = LWC.createChart(container, {
      width: container.clientWidth || 600,
      height: container.clientHeight || 420,
      layout: {
        background: { type: 'solid', color: bg },
        textColor: muted,
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 1 },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: false },
    });

    var candle = chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderVisible: false,
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });
    candle.setData(seriesData.candles);

    var volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volume.setData(seriesData.volumes);

    chart.subscribeCrosshairMove(function (param) {
      var time = param && param.time ? String(param.time) : '';
      updateTip(time);
    });

    chart.timeScale().fitContent();
    state.chart = chart;
    state.candleSeries = candle;
    state.volumeSeries = volume;
    state.barsByTime = seriesData.byTime;

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        if (!state.chart || !container) return;
        state.chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight || 420,
        });
      });
      ro.observe(container);
      container._imCandleRo = ro;
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
        var bars = (pack.json && pack.json.bars) || [];
        var seriesData = barsToSeries(bars);
        if (!seriesData.candles.length) {
          destroyChart();
          setStatus(labels.empty, true);
          return;
        }
        setStatus('', false);
        createChart(pack.LWC, seriesData);
      })
      .catch(function () {
        if (token !== state.fetchToken || !state.open) return;
        destroyChart();
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
    if (opts && opts.range && RANGES.indexOf(opts.range) >= 0) state.range = opts.range;

    var root = document.getElementById('im-candle-root');
    root.removeAttribute('hidden');
    root.classList.add('is-open');
    document.body.classList.add('im-candle-open');

    document.getElementById('im-candle-title').textContent = state.name || ticker;
    document.getElementById('im-candle-sub').textContent =
      ticker + ' · ' + labels.chartLabel;
    var closeBtn = document.getElementById('im-candle-close');
    closeBtn.setAttribute('aria-label', labels.close);
    syncRangeButtons();
    document.getElementById('im-candle-chart').setAttribute('aria-label', labels.chartLabel);

    loadAndRender(ticker, state.range);
    setTimeout(function () {
      var dialog = root.querySelector('.im-candle-dialog');
      if (dialog) dialog.focus();
    }, 0);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    state.fetchToken += 1;
    destroyChart();
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
    // Cross-sector badges and other explicit nav chips — let the browser navigate.
    if (a.classList.contains('im-cross-sector-badge')) return true;
    if (a.closest('.im-seo-related, .im-seo-body-p, .global-bottom-nav, .desktop-sidebar, .filter-bar, .tabs, header, footer, nav')) {
      return true;
    }
    // Anchor inside a company table row / mobile card: usually the name/stock link —
    // intercept for candle modal (keep href for SEO/fallback; preventDefault on open).
    if (a.closest('#table-body tr[data-ticker], #table-cards .im-stock-card[data-ticker]')) {
      return false;
    }
    return true;
  }

  function shouldIgnoreTarget(el) {
    if (!el || !el.closest) return true;
    if (el.closest('.im-card-chevron, thead, .filter-bar, .tabs, #im-candle-root')) return true;
    if (el.closest('button:not(.im-candle-range), input, select, textarea, label')) {
      // Form controls outside open targets
      if (!el.closest('#table-body tr[data-ticker], #table-cards .im-stock-card[data-ticker]')) return true;
      // Rare controls inside a row — don't treat as candle trigger
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
        e.target.closest('.im-card-toggle, .im-row-name, .im-card-spark, .quote-spark, .company-name, .company-name-wrap')
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
    // Block default for name/stock <a href> inside the row; keep href for SEO/fallback.
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
