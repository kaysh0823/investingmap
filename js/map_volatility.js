/**
 * Volatility distribution scatter — ATR3/close vs log market cap, colored by selectable metric.
 */
(function (global) {
  'use strict';

  var lastOpts = null;
  var resizeObs = null;
  var observedEl = null;
  var resizeTimer = null;
  var snapshotCache = null;
  var snapshotLoading = null;
  var COLOR_MODES = ['pctb', 'rs', 'chg'];
  var COLOR_MODE_STORAGE = 'im_vol_cmode';
  var MISSING_COLOR = '#b0b8c1';
  var CHG_CLIP = 15;
  var CHG_RANGE = ['#c62828', '#e53935', '#8e3a3a', '#2a2e38', '#2e7d32', '#43a047', '#00c853'];
  var selectedColorMode = 'pctb';

  var COPY = {
    ko: {
      title: '변동성 분포',
      xAxis: 'ATR3/종가',
      yAxis: '시가총액(로그)',
      atr: 'ATR3/종가',
      mcap: '시가총액',
      pctB: '20일 %b',
      turnover: '거래대금',
      chg: '당일 등락률',
      rs: 'RS',
      noData: '변동성 스냅샷 데이터가 없습니다.',
      legendSize: '크기 = 거래대금',
      legendLines: '세로선 = 전 종목 변동성 백분위 P10~P90(P25·P50·P75 강조)',
      legendPctB: '색 = 20일 %b(진할수록 높음)',
      legendChg: '색 = 당일 등락률',
      legendRs: '색 = RS(진할수록 높음)',
      modePctB: '%b',
      modeChg: '당일 등락률',
      modeRs: 'RS',
      pctLine: function (p, v) {
        if (p === 50) return 'P50(중앙값) · ' + v.toFixed(3);
        return 'P' + p + ' · ' + v.toFixed(3);
      },
    },
    en: {
      title: 'Volatility Distribution',
      xAxis: 'ATR3/Close',
      yAxis: 'Market cap (log)',
      atr: 'ATR3/Close',
      mcap: 'Market cap',
      pctB: '20D %b',
      turnover: 'Turnover',
      chg: '1-day change',
      rs: 'RS',
      noData: 'No volatility snapshot data available.',
      legendSize: 'Size = turnover',
      legendLines: 'Lines = market-wide volatility percentiles P10~P90 (P25·P50·P75 emphasized)',
      legendPctB: 'Color = 20D %b (darker = higher)',
      legendChg: 'Color = 1-day change',
      legendRs: 'Color = RS (darker = higher)',
      modePctB: '%b',
      modeChg: '1-day change',
      modeRs: 'RS',
      pctLine: function (p, v) {
        if (p === 50) return 'P50 (median) · ' + v.toFixed(3);
        return 'P' + p + ' · ' + v.toFixed(3);
      },
    },
  };

  function normalizeColorMode(mode) {
    if (mode === 'turnover') return 'pctb';
    return COLOR_MODES.indexOf(mode) >= 0 ? mode : 'pctb';
  }

  function loadColorMode() {
    try {
      if (global.localStorage) {
        return normalizeColorMode(localStorage.getItem(COLOR_MODE_STORAGE));
      }
    } catch (e) {}
    return 'pctb';
  }

  function saveColorMode(mode) {
    try {
      if (global.localStorage) localStorage.setItem(COLOR_MODE_STORAGE, normalizeColorMode(mode));
    } catch (e) {}
  }

  selectedColorMode = loadColorMode();

  function labelsFor(opts) {
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var base = COPY[lang];
    var supplied = opts.labels || {};
    var out = {};
    Object.keys(base).forEach(function (key) {
      out[key] = supplied[key] || base[key];
    });
    return out;
  }

  function colorLegendText(labels, mode) {
    if (mode === 'chg') return labels.legendChg;
    if (mode === 'rs') return labels.legendRs;
    return labels.legendPctB;
  }

  function colorMetricLabel(labels, mode) {
    if (mode === 'chg') return labels.chg;
    if (mode === 'rs') return labels.rs;
    return labels.pctB;
  }

  function legendGradientStyle(mode) {
    if (mode === 'chg') {
      return 'background:linear-gradient(to right,#c62828,#e53935,#8e3a3a,#2a2e38,#2e7d32,#43a047,#00c853)';
    }
    return 'background:linear-gradient(to right,#ffe0e0,#8b0000)';
  }

  function displayName(company, lang) {
    return lang === 'en' && company.nameEn
      ? company.nameEn
      : company.name || company.nameKo || company.ticker || '';
  }

  function formatMcap(value, lang) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return '—';
    if (lang === 'en') {
      if (value >= 1e12) return '$' + (value / 1e12 / 1300).toFixed(2) + 'B';
      return '₩' + (value / 1e12).toFixed(2) + 'T';
    }
    if (value >= 1e12) return (value / 1e12).toFixed(2) + '조원';
    if (value >= 1e8) return (value / 1e8).toFixed(1) + '억원';
    return Math.round(value).toLocaleString('ko-KR') + '원';
  }

  function formatTurnover(value, lang) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    if (lang === 'en') {
      if (value >= 1e12) return '₩' + (value / 1e12).toFixed(2) + 'T';
      if (value >= 1e9) return '₩' + (value / 1e9).toFixed(1) + 'B';
      if (value >= 1e6) return '₩' + (value / 1e6).toFixed(1) + 'M';
      return '₩' + Math.round(value).toLocaleString('en-US');
    }
    if (value >= 1e12) return (value / 1e12).toFixed(2) + '조원';
    if (value >= 1e8) return (value / 1e8).toFixed(1) + '억원';
    if (value >= 1e4) return (value / 1e4).toFixed(1) + '만원';
    return Math.round(value).toLocaleString('ko-KR') + '원';
  }

  function formatPctB(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toFixed(2);
  }

  function formatRs(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toFixed(1);
  }

  function formatChg(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
    return sign + Math.abs(value).toFixed(2) + '%';
  }

  function formatColorMetric(item, mode, lang) {
    if (mode === 'chg') return formatChg(item.chg1dPct);
    if (mode === 'rs') return formatRs(item.rs);
    return formatPctB(item.pctB);
  }

  function formatMcapAxis(value, lang) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return '';
    if (lang === 'en') {
      if (value >= 1e12) return '₩' + (value / 1e12).toFixed(value >= 1e13 ? 0 : 1) + 'T';
      if (value >= 1e9) return '₩' + (value / 1e9).toFixed(0) + 'B';
      return '₩' + (value / 1e6).toFixed(0) + 'M';
    }
    if (value >= 1e12) return (value / 1e12).toFixed(value >= 1e13 ? 0 : 1) + '조';
    return Math.round(value / 1e8).toLocaleString('ko') + '억';
  }

  function logMcapTickValues(min, max) {
    var safeMin = Math.max(1, min);
    var safeMax = Math.max(safeMin * 1.01, max);
    var lo = Math.floor(Math.log10(safeMin));
    var hi = Math.ceil(Math.log10(safeMax));
    var mults = [1, 2, 3, 5];
    var ticks = [];
    for (var e = lo; e <= hi; e++) {
      var base = Math.pow(10, e);
      mults.forEach(function (m) {
        var v = m * base;
        if (v >= safeMin * 0.999 && v <= safeMax * 1.001) ticks.push(v);
      });
    }
    return ticks.length ? ticks : [safeMin, safeMax];
  }

  function formatAtrTick(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    if (value >= 0.1) return value.toFixed(2);
    if (value >= 0.01) return value.toFixed(2);
    return value.toFixed(3);
  }

  function expandLinearDomain(min, max, extras, padRatio) {
    var lo = min;
    var hi = max;
    (extras || []).forEach(function (v) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    var span = Math.max(hi - lo, 0.001);
    var pad = span * (padRatio || 0.06);
    return [Math.max(0, lo - pad), hi + pad];
  }

  function expandLogDomain(min, max, padRatio) {
    var safeMin = Math.max(1, min);
    var safeMax = Math.max(safeMin * 1.01, max);
    var logMin = Math.log10(safeMin);
    var logMax = Math.log10(safeMax);
    var span = Math.max(logMax - logMin, 0.02);
    var pad = span * (padRatio || 0.08);
    return [Math.pow(10, logMin - pad), Math.pow(10, logMax + pad)];
  }

  function formatAtr(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toFixed(4);
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    var idx = (sorted.length - 1) * (p / 100);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function redScale() {
    return d3.scaleSequential(function (t) {
      return d3.interpolate('#ffe0e0', '#8b0000')(t);
    });
  }

  function colorForChg(chg) {
    if (typeof chg !== 'number' || !isFinite(chg)) return MISSING_COLOR;
    var t = (Math.max(-CHG_CLIP, Math.min(CHG_CLIP, chg)) + CHG_CLIP) / (2 * CHG_CLIP);
    var pos = t * (CHG_RANGE.length - 1);
    var index = Math.floor(pos);
    if (index >= CHG_RANGE.length - 1) return CHG_RANGE[CHG_RANGE.length - 1];
    var fraction = pos - index;
    var a = d3.rgb(CHG_RANGE[index]);
    var b = d3.rgb(CHG_RANGE[index + 1]);
    return d3
      .rgb(
        a.r + (b.r - a.r) * fraction,
        a.g + (b.g - a.g) * fraction,
        a.b + (b.b - a.b) * fraction,
      )
      .formatHex();
  }

  function buildColorFn(fg, mode) {
    var red = redScale();
    if (mode === 'pctb') {
      red.domain([0, 1]);
      return function (d) {
        if (typeof d.pctB !== 'number' || !isFinite(d.pctB)) return MISSING_COLOR;
        return red(clamp01(d.pctB));
      };
    }
    if (mode === 'rs') {
      red.domain([0, 1]);
      return function (d) {
        if (typeof d.rs !== 'number' || !isFinite(d.rs)) return MISSING_COLOR;
        return red(clamp01(d.rs / 100));
      };
    }
    return function (d) {
      return colorForChg(d.chg1dPct);
    };
  }

  function turnoverRadiusScale(fg) {
    var maxTurnover =
      d3.max(fg, function (d) {
        return d.turnoverWon > 0 ? d.turnoverWon : 0;
      }) || 1;
    return d3.scaleSqrt().domain([0, maxTurnover]).range([4, 16]).clamp(true);
  }

  function dotRadius(d, rScale) {
    return d.turnoverWon > 0 ? rScale(d.turnoverWon) : 4;
  }

  function snapshotUrl() {
    try {
      var origin = global.location && global.location.origin ? global.location.origin : '';
      return origin + '/data/hub_volatility_snapshot.json';
    } catch (e) {
      return '/data/hub_volatility_snapshot.json';
    }
  }

  function loadSnapshot() {
    if (snapshotCache) return Promise.resolve(snapshotCache);
    if (snapshotLoading) return snapshotLoading;
    snapshotLoading = fetch(snapshotUrl())
      .then(function (res) {
        if (!res.ok) throw new Error('snapshot HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        snapshotCache = data;
        snapshotLoading = null;
        return data;
      })
      .catch(function (err) {
        snapshotLoading = null;
        throw err;
      });
    return snapshotLoading;
  }

  function colorForPctB(pctB, colorScale) {
    return colorScale(clamp01(pctB));
  }

  function injectStyles() {
    var style = document.getElementById('im-volatility-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'im-volatility-css';
      document.head.appendChild(style);
    }
    style.textContent =
      '.volatility-wrap{padding:20px 28px 28px;max-width:1400px;margin:0 auto}' +
      '.volatility-meta{margin:0 0 12px;color:var(--text-muted,#8b949e);font-size:13px}' +
      '.vol-mode-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;align-items:center}' +
      '.vol-mode-tab{padding:6px 12px;min-height:32px;border-radius:16px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;cursor:pointer}' +
      '.vol-mode-tab:hover{border-color:var(--accent,#58a6ff);color:var(--text,#e6edf3)}' +
      '.vol-mode-tab[aria-selected="true"]{border-color:var(--accent,#58a6ff);color:var(--accent,#58a6ff);' +
      'background:color-mix(in srgb,var(--accent,#58a6ff) 14%,var(--surface2,#21262d))}' +
      '#volatility-root{position:relative;width:100%;min-height:420px;height:min(62vh,640px);' +
      'background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:10px;overflow:hidden}' +
      '#volatility-root svg{display:block;width:100%;height:100%}' +
      '.im-vol-tooltip{position:fixed;z-index:10001;display:none;pointer-events:none;max-width:min(360px,86vw);' +
      'padding:9px 12px;border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);' +
      'border:1px solid var(--border,#30363d);box-shadow:0 4px 14px rgba(0,0,0,.38);font-size:12px;line-height:1.5}' +
      '.im-vol-tooltip strong{display:block;font-size:13px;margin-bottom:2px}' +
      '.im-vol-dot{cursor:pointer;transition:stroke-width .12s,opacity .12s}' +
      '.im-vol-node.im-vol-focus .im-vol-dot{stroke:var(--accent,#58a6ff)!important;stroke-width:3!important;' +
      'filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent,#58a6ff) 55%,transparent))}' +
      '.im-vol-node.im-vol-focus{animation:im-vol-pulse 1.2s ease-in-out 2}' +
      '.im-vol-node.im-vol-focus text{opacity:1!important;font-weight:700!important;font-size:12px!important}' +
      '@keyframes im-vol-pulse{0%,100%{opacity:1}50%{opacity:.88}}' +
      '.im-vol-legend{margin-top:12px;color:var(--text-muted,#8b949e);font-size:12px}' +
      '.im-vol-legend-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}' +
      '.im-vol-gradient{width:min(160px,40vw);height:10px;border-radius:5px;border:1px solid var(--border,#30363d)}' +
      '.im-vol-gradient-label{font-size:10px;opacity:.85}' +
      '.im-vol-grid line{stroke:var(--border,#30363d)}' +
      '.im-vol-axis line,.im-vol-axis path{stroke:var(--text-muted,#8b949e)}' +
      '.im-vol-axis text{fill:var(--text-muted,#8b949e);font-size:10px}' +
      '@media(max-width:768px){.volatility-wrap{padding:14px 12px 20px}.volatility-meta{font-size:12px}' +
      '.vol-mode-tab{flex:1 1 0;padding:8px 6px;min-height:36px;font-size:11px}' +
      '#volatility-root{min-height:min(52vh,480px)!important;height:min(58vh,560px)!important}' +
      '.im-vol-legend{font-size:11px}}';
  }

  function tooltipEl() {
    injectStyles();
    var el = document.getElementById('im-vol-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'im-vol-tooltip';
      el.className = 'im-vol-tooltip';
      el.setAttribute('role', 'tooltip');
      document.body.appendChild(el);
    }
    return el;
  }

  function moveTooltip(event) {
    var el = document.getElementById('im-vol-tooltip');
    if (!el || el.style.display === 'none' || !event) return;
    var pad = 12;
    var x = event.clientX + pad;
    var y = event.clientY - pad;
    var rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    el.style.left = Math.max(8, x) + 'px';
    el.style.top = Math.max(8, y) + 'px';
  }

  function hideTooltip() {
    var el = document.getElementById('im-vol-tooltip');
    if (el) el.style.display = 'none';
  }

  function getUrlTicker() {
    try {
      return new URLSearchParams(window.location.search).get('ticker') || '';
    } catch (e) {
      return '';
    }
  }

  function applyTickerFocus(container) {
    if (!container) return;
    var ticker = getUrlTicker();
    container.querySelectorAll('.im-vol-node.im-vol-focus').forEach(function (el) {
      el.classList.remove('im-vol-focus');
    });
    if (!ticker) return;
    var node = container.querySelector('.im-vol-node[data-ticker="' + ticker + '"]');
    if (!node) return;
    node.classList.add('im-vol-focus');
    try {
      if (typeof d3 !== 'undefined') d3.select(node).raise();
    } catch (eRaise) { /* ignore */ }
    var circle = node.querySelector('.im-vol-dot');
    if (circle) {
      var r = parseFloat(circle.getAttribute('r')) || 6;
      circle.setAttribute('r', String(Math.max(r * 1.35, 10)));
    }
    try {
      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch (e2) {
      node.scrollIntoView(true);
    }
  }

  function showTooltip(item, opts, event) {
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var labels = labelsFor(opts);
    var el = tooltipEl();
    el.innerHTML = '';
    var name = document.createElement('strong');
    name.textContent = item.name + ' (' + (item.ticker || '—') + ')';
    el.appendChild(name);
    [
      labels.mcap + ' ' + formatMcap(item.mcap, lang),
      labels.atr + ' ' + formatAtr(item.atrPct),
      labels.turnover + ' ' + formatTurnover(item.turnoverWon, lang),
      colorMetricLabel(labels, selectedColorMode) +
        ' ' +
        formatColorMetric(item, selectedColorMode, lang),
    ].forEach(function (text) {
      var line = document.createElement('div');
      line.textContent = text;
      el.appendChild(line);
    });
    el.style.display = 'block';
    moveTooltip(event);
  }

  function observeContainer(container) {
    if (!global.ResizeObserver || observedEl === container) return;
    if (resizeObs) resizeObs.disconnect();
    observedEl = container;
    resizeObs = new ResizeObserver(function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (lastOpts) render(lastOpts);
      }, 120);
    });
    resizeObs.observe(container);
  }

  function ensureColorModeTabs(container, opts) {
    var wrap = container.parentNode;
    if (!wrap) return;
    var labels = labelsFor(opts);
    var tabs = wrap.querySelector('#vol-mode-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'vol-mode-tabs';
      tabs.className = 'vol-mode-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.addEventListener('click', function (event) {
        var button = event.target.closest('[data-vol-mode]');
        if (!button) return;
        var next = normalizeColorMode(button.getAttribute('data-vol-mode'));
        if (next === selectedColorMode) return;
        selectedColorMode = next;
        saveColorMode(next);
        if (lastOpts) render(lastOpts);
      });
    }
    tabs.setAttribute(
      'aria-label',
      opts.lang === 'en' ? 'Volatility color metric' : '변동성 색상 지표',
    );
    tabs.innerHTML = [
      { id: 'pctb', text: labels.modePctB },
      { id: 'rs', text: labels.modeRs },
      { id: 'chg', text: labels.modeChg },
    ]
      .map(function (mode) {
        return (
          '<button type="button" class="vol-mode-tab" role="tab" data-vol-mode="' +
          mode.id +
          '" aria-selected="' +
          (mode.id === selectedColorMode ? 'true' : 'false') +
          '">' +
          mode.text +
          '</button>'
        );
      })
      .join('');
    if (tabs.parentNode !== wrap || tabs.nextSibling !== container) {
      if (container && wrap.contains(container)) {
        wrap.insertBefore(tabs, container);
      } else {
        wrap.appendChild(tabs);
      }
    }
  }

  function renderLegend(el, opts) {
    if (!el) return;
    var labels = labelsFor(opts);
    el.className = 'im-vol-legend';
    var gradientHint =
      selectedColorMode === 'chg'
        ? '<span class="im-vol-gradient-label" aria-hidden="true">−15% · 0% · +15%</span>'
        : '';
    el.innerHTML =
      '<div class="im-vol-legend-row"><span>' +
      labels.legendSize +
      ' · ' +
      colorLegendText(labels, selectedColorMode) +
      ' · ' +
      labels.legendLines +
      '</span><span class="im-vol-gradient" style="' +
      legendGradientStyle(selectedColorMode) +
      '" aria-hidden="true"></span>' +
      gradientHint +
      '</div>';
  }

  function sectorTickerSet(companies) {
    var set = {};
    (companies || []).forEach(function (c) {
      if (c && c.ticker) set[String(c.ticker).trim()] = true;
    });
    return set;
  }

  function companyByTicker(companies) {
    var map = {};
    (companies || []).forEach(function (c) {
      if (c && c.ticker) map[String(c.ticker).trim()] = c;
    });
    return map;
  }

  function render(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    lastOpts = opts;
    injectStyles();
    observeContainer(container);
    ensureColorModeTabs(container, opts);

    if (!container.style.minHeight) container.style.minHeight = '420px';
    renderLegend(opts.legend, opts);

    loadSnapshot()
      .then(function (snapshot) {
        if (lastOpts !== opts) return;
        draw(container, opts, snapshot);
      })
      .catch(function () {
        container.innerHTML = '';
        var empty = document.createElement('div');
        empty.style.cssText =
          'display:flex;align-items:center;justify-content:center;height:100%;padding:24px;' +
          'color:var(--text-muted,#8b949e);text-align:center';
        empty.textContent = labelsFor(opts).noData;
        container.appendChild(empty);
      });
  }

  function draw(container, opts, snapshot) {
    var quotes = (snapshot && snapshot.quotes) || {};
    var sectorSet = sectorTickerSet(opts.companies);
    var coMap = companyByTicker(opts.companies);
    var marketAtrs = [];
    var fg = [];
    Object.keys(quotes).forEach(function (ticker) {
      var q = quotes[ticker];
      if (!q || !(q.mcap > 0) || !(q.atrPct >= 0)) return;
      marketAtrs.push(q.atrPct);
      if (!sectorSet[ticker]) return;
      var co = coMap[ticker];
      fg.push({
        ticker: ticker,
        mcap: q.mcap,
        atrPct: q.atrPct,
        pctB: q.pctB,
        close: q.close,
        turnoverWon:
          co && typeof co.turnoverWon === 'number' && isFinite(co.turnoverWon) ? co.turnoverWon : null,
        rs: co && typeof co.rs === 'number' && isFinite(co.rs) ? co.rs : null,
        chg1dPct:
          co && typeof co.chg1dPct === 'number' && isFinite(co.chg1dPct) ? co.chg1dPct : null,
      });
    });

    container.innerHTML = '';
    hideTooltip();

    if (!fg.length) {
      var empty = document.createElement('div');
      empty.style.cssText =
        'display:flex;align-items:center;justify-content:center;height:100%;padding:24px;' +
        'color:var(--text-muted,#8b949e);text-align:center';
      empty.textContent = labelsFor(opts).noData;
      container.appendChild(empty);
      return;
    }

    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var labels = labelsFor(opts);
    var rect = container.getBoundingClientRect();
    var width = Math.floor(rect.width || container.clientWidth || 0);
    var height = Math.floor(rect.height || container.clientHeight || 0);
    if (width < 80 || height < 80) {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(opts); }, 100);
      return;
    }

    var mobile = global.matchMedia && global.matchMedia('(max-width:768px)').matches;
    var margin = mobile
      ? { top: 28, right: 20, bottom: 58, left: 78 }
      : { top: 32, right: 36, bottom: 68, left: 92 };
    var innerW = Math.max(1, width - margin.left - margin.right);
    var innerH = Math.max(1, height - margin.top - margin.bottom);

    marketAtrs.sort(function (a, b) { return a - b; });
    var PCTS = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90];
    var EMPH = [25, 50, 75];
    var pctVals = PCTS.map(function (p) {
      return { p: p, v: percentile(marketAtrs, p) };
    });

    var sectorAtrMin = d3.min(fg, function (d) { return d.atrPct; }) || 0;
    var sectorAtrMax = d3.max(fg, function (d) { return d.atrPct; }) || 0.001;
    var xDomain = expandLinearDomain(
      sectorAtrMin,
      sectorAtrMax,
      pctVals.map(function (o) { return o.v; }),
      mobile ? 0.08 : 0.06,
    );

    var sectorMcapMin = d3.min(fg, function (d) { return d.mcap; }) || 1;
    var sectorMcapMax = d3.max(fg, function (d) { return d.mcap; }) || 1;
    var yDomain = expandLogDomain(sectorMcapMin, sectorMcapMax, mobile ? 0.1 : 0.08);
    var yTickValues = logMcapTickValues(yDomain[0], yDomain[1]);

    var x = d3.scaleLinear().domain(xDomain).range([0, innerW]).clamp(true);
    var y = d3.scaleLog().domain(yDomain).range([innerH, 0]).clamp(true);
    var colorFn = buildColorFn(fg, selectedColorMode);
    var rScale = turnoverRadiusScale(fg);

    var nameByTicker = {};
    (opts.companies || []).forEach(function (c) {
      if (c && c.ticker) nameByTicker[String(c.ticker).trim()] = displayName(c, lang);
    });

    var svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'im-vol-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('role', 'img')
      .attr('aria-label', labels.title);
    var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    plot
      .append('g')
      .attr('class', 'im-vol-grid')
      .call(
        d3.axisLeft(y)
          .tickValues(yTickValues)
          .tickSize(-innerW)
          .tickFormat(''),
      )
      .selectAll('line')
      .attr('opacity', 0.28);

    plot
      .append('g')
      .attr('class', 'im-vol-grid')
      .attr('transform', 'translate(0,' + innerH + ')')
      .call(
        d3.axisBottom(x)
          .ticks(6)
          .tickSize(-innerH)
          .tickFormat(''),
      )
      .selectAll('line')
      .attr('opacity', 0.22);

    pctVals.forEach(function (item) {
      var p = item.p;
      var val = item.v;
      var isEmph = EMPH.indexOf(p) >= 0;
      plot
        .append('line')
        .attr('x1', x(val))
        .attr('x2', x(val))
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', isEmph ? 'rgba(139,148,158,0.72)' : 'rgba(139,148,158,0.40)')
        .attr('stroke-width', isEmph ? 1.4 : 0.8)
        .attr('stroke-dasharray', isEmph ? '4,4' : '2,3');
      if (isEmph) {
        plot
          .append('text')
          .attr('x', x(val) + 4)
          .attr('y', 12)
          .attr('fill', 'var(--text-muted,#8b949e)')
          .attr('font-size', 10)
          .text(labels.pctLine(p, val));
      } else {
        plot
          .append('text')
          .attr('x', x(val) + 2)
          .attr('y', 12)
          .attr('fill', 'rgba(139,148,158,0.55)')
          .attr('font-size', 8)
          .text('P' + p);
      }
    });

    var fgNodes = plot
      .selectAll('g.im-vol-node')
      .data(fg, function (d) { return d.ticker; })
      .join('g')
      .attr('class', 'im-vol-node')
      .attr('data-ticker', function (d) { return d.ticker || ''; })
      .attr('transform', function (d) {
        return 'translate(' + x(d.atrPct) + ',' + y(d.mcap) + ')';
      });

    fgNodes
      .append('circle')
      .attr('class', 'im-vol-dot')
      .attr('r', function (d) { return dotRadius(d, rScale); })
      .attr('fill', function (d) { return colorFn(d); })
      .attr('fill-opacity', 0.92)
      .attr('stroke', 'rgba(255,255,255,.35)')
      .attr('stroke-width', 1)
      .on('mouseenter', function (event, d) {
        showTooltip({
          ticker: d.ticker,
          name: nameByTicker[d.ticker] || d.ticker,
          mcap: d.mcap,
          atrPct: d.atrPct,
          pctB: d.pctB,
          turnoverWon: d.turnoverWon,
          rs: d.rs,
          chg1dPct: d.chg1dPct,
        }, opts, event);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)
      .on('click', function (event, d) {
        hideTooltip();
        var company = (opts.companies || []).find(function (c) {
          return String(c.ticker).trim() === d.ticker;
        });
        if (opts.onSelect && company) opts.onSelect(company);
      });

    fgNodes
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', function (d) { return -(dotRadius(d, rScale) + 4); })
      .attr('fill', 'var(--text,#e6edf3)')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none')
      .text(function (d) {
        var name = nameByTicker[d.ticker] || d.ticker;
        return name.length > 10 ? name.slice(0, 9) + '…' : name;
      });

    plot
      .append('g')
      .attr('class', 'im-vol-axis')
      .attr('transform', 'translate(0,' + innerH + ')')
      .call(
        d3.axisBottom(x)
          .ticks(6)
          .tickFormat(function (d) { return formatAtrTick(d); }),
      );

    plot
      .append('g')
      .attr('class', 'im-vol-axis')
      .call(
        d3.axisLeft(y)
          .tickValues(yTickValues)
          .tickFormat(function (d) { return formatMcapAxis(d, lang); }),
      );

    plot
      .append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 44)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted,#8b949e)')
      .attr('font-size', 12)
      .text(labels.xAxis);

    plot
      .append('text')
      .attr('transform', 'translate(-62,' + innerH / 2 + ') rotate(-90)')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted,#8b949e)')
      .attr('font-size', 12)
      .text(labels.yAxis);

    applyTickerFocus(container);
  }

  global.InvestingMapVolatility = {
    render: render,
    percentile: percentile,
    clamp01: clamp01,
    colorForPctB: colorForPctB,
    normalizeColorMode: normalizeColorMode,
    buildColorFn: buildColorFn,
    colorForChg: colorForChg,
    dotRadius: dotRadius,
    turnoverRadiusScale: turnoverRadiusScale,
    expandLinearDomain: expandLinearDomain,
    expandLogDomain: expandLogDomain,
    formatMcapAxis: formatMcapAxis,
    formatAtrTick: formatAtrTick,
    logMcapTickValues: logMcapTickValues,
    getColorMode: function () {
      return selectedColorMode;
    },
    setColorMode: function (mode) {
      selectedColorMode = normalizeColorMode(mode);
      saveColorMode(selectedColorMode);
      if (lastOpts) render(lastOpts);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
