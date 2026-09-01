/**
 * Volatility distribution scatter — ATR3/close vs log market cap, colored by 20D %b.
 */
(function (global) {
  'use strict';

  var lastOpts = null;
  var resizeObs = null;
  var observedEl = null;
  var resizeTimer = null;
  var snapshotCache = null;
  var snapshotLoading = null;

  var COPY = {
    ko: {
      title: '변동성 분포',
      xAxis: 'ATR3/종가',
      yAxis: '시가총액(로그)',
      atr: 'ATR3/종가',
      mcap: '시가총액',
      pctB: '20일 %b',
      noData: '변동성 스냅샷 데이터가 없습니다.',
      legend:
        '색=20일 %b(진할수록 높음) · 세로선=전체 변동성 25/50/75%',
      pctLine: function (p, v) {
        return p + '% ' + v.toFixed(3);
      },
    },
    en: {
      title: 'Volatility Distribution',
      xAxis: 'ATR3/Close',
      yAxis: 'Market cap (log)',
      atr: 'ATR3/Close',
      mcap: 'Market cap',
      pctB: '20D %b',
      noData: 'No volatility snapshot data available.',
      legend:
        'Color = 20D %b (darker = higher) · vertical lines = market ATR 25/50/75%',
      pctLine: function (p, v) {
        return p + '% ' + v.toFixed(3);
      },
    },
  };

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

  function formatPctB(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toFixed(2);
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

  function p99(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return percentile(sorted, 99);
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
      '#volatility-root{position:relative;width:100%;min-height:420px;height:min(62vh,640px);' +
      'background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:10px;overflow:hidden}' +
      '#volatility-root svg{display:block;width:100%;height:100%}' +
      '.im-vol-tooltip{position:fixed;z-index:10001;display:none;pointer-events:none;max-width:min(360px,86vw);' +
      'padding:9px 12px;border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);' +
      'border:1px solid var(--border,#30363d);box-shadow:0 4px 14px rgba(0,0,0,.38);font-size:12px;line-height:1.5}' +
      '.im-vol-tooltip strong{display:block;font-size:13px;margin-bottom:2px}' +
      '.im-vol-dot{cursor:pointer}' +
      '.im-vol-legend{margin-top:12px;color:var(--text-muted,#8b949e);font-size:12px}' +
      '.im-vol-legend-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}' +
      '.im-vol-gradient{width:min(160px,40vw);height:10px;border-radius:5px;border:1px solid var(--border,#30363d);' +
      'background:linear-gradient(to right,#ffe0e0,#8b0000)}' +
      '.im-vol-grid line{stroke:var(--border,#30363d)}' +
      '.im-vol-axis line,.im-vol-axis path{stroke:var(--text-muted,#8b949e)}' +
      '.im-vol-axis text{fill:var(--text-muted,#8b949e);font-size:10px}' +
      '@media(max-width:768px){.volatility-wrap{padding:14px 12px 20px}.volatility-meta{font-size:12px}' +
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
      labels.pctB + ' ' + formatPctB(item.pctB),
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

  function renderLegend(el, opts, colorScale) {
    if (!el) return;
    var labels = labelsFor(opts);
    el.className = 'im-vol-legend';
    el.innerHTML =
      '<div class="im-vol-legend-row"><span>' +
      labels.legend +
      '</span><span class="im-vol-gradient" aria-hidden="true"></span></div>';
  }

  function sectorTickerSet(companies) {
    var set = {};
    (companies || []).forEach(function (c) {
      if (c && c.ticker) set[String(c.ticker).trim()] = true;
    });
    return set;
  }

  function render(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    lastOpts = opts;
    injectStyles();
    observeContainer(container);

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
    var marketAtrs = [];
    var fg = [];
    Object.keys(quotes).forEach(function (ticker) {
      var q = quotes[ticker];
      if (!q || !(q.mcap > 0) || !(q.atrPct >= 0) || !Number.isFinite(q.pctB)) return;
      marketAtrs.push(q.atrPct);
      if (!sectorSet[ticker]) return;
      fg.push({
        ticker: ticker,
        mcap: q.mcap,
        atrPct: q.atrPct,
        pctB: q.pctB,
        close: q.close,
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
    var p25 = percentile(marketAtrs, 25);
    var p50 = percentile(marketAtrs, 50);
    var p75 = percentile(marketAtrs, 75);

    var sectorAtrMin = d3.min(fg, function (d) { return d.atrPct; }) || 0;
    var sectorAtrMax = d3.max(fg, function (d) { return d.atrPct; }) || 0.001;
    var xDomain = expandLinearDomain(sectorAtrMin, sectorAtrMax, [p25, p50, p75], mobile ? 0.08 : 0.06);

    var sectorMcapMin = d3.min(fg, function (d) { return d.mcap; }) || 1;
    var sectorMcapMax = d3.max(fg, function (d) { return d.mcap; }) || 1;
    var yDomain = expandLogDomain(sectorMcapMin, sectorMcapMax, mobile ? 0.1 : 0.08);
    var yTickValues = logMcapTickValues(yDomain[0], yDomain[1]);

    var x = d3.scaleLinear().domain(xDomain).range([0, innerW]).clamp(true);
    var y = d3.scaleLog().domain(yDomain).range([innerH, 0]).clamp(true);
    var colorScale = d3.scaleSequential(function (t) {
      return d3.interpolate('#ffe0e0', '#8b0000')(t);
    }).domain([0, 1]);

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

    [25, 50, 75].forEach(function (p) {
      var val = percentile(marketAtrs, p);
      plot
        .append('line')
        .attr('x1', x(val))
        .attr('x2', x(val))
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', 'var(--text-muted,#8b949e)')
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.55);
      plot
        .append('text')
        .attr('x', x(val) + 4)
        .attr('y', 12)
        .attr('fill', 'var(--text-muted,#8b949e)')
        .attr('font-size', 10)
        .text(labels.pctLine(p, val));
    });

    var fgNodes = plot
      .selectAll('g.im-vol-node')
      .data(fg, function (d) { return d.ticker; })
      .join('g')
      .attr('class', 'im-vol-node')
      .attr('transform', function (d) {
        return 'translate(' + x(d.atrPct) + ',' + y(d.mcap) + ')';
      });

    fgNodes
      .append('circle')
      .attr('class', 'im-vol-dot')
      .attr('r', 7)
      .attr('fill', function (d) { return colorForPctB(d.pctB, colorScale); })
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
      .attr('dy', -11)
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
  }

  global.InvestingMapVolatility = {
    render: render,
    percentile: percentile,
    clamp01: clamp01,
    colorForPctB: colorForPctB,
    expandLinearDomain: expandLinearDomain,
    expandLogDomain: expandLogDomain,
    formatMcapAxis: formatMcapAxis,
    formatAtrTick: formatAtrTick,
    logMcapTickValues: logMcapTickValues,
  };
})(typeof window !== 'undefined' ? window : globalThis);
