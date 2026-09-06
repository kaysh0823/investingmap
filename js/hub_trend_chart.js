/**
 * Hub sector/index trend chart.
 * Consumes /api/hub_trend values that are already rebased to 100.
 */
(function (global) {
  'use strict';

  var HORIZONS = ['1d', '20d', '50d', '120d', '200d'];
  var INDEX_COLORS = { KOSPI: '#f85149', KOSDAQ: '#58a6ff' };
  var INDEX_NAMES = {
    ko: { KOSPI: '코스피', KOSDAQ: '코스닥' },
    en: { KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ' },
  };
  var SECTOR_NAMES_EN = {
    bigchip: 'Chip leaders', semi: 'Semiconductors', elec: 'Electrical & electronics',
    battery: 'Batteries', renewable: 'Renewable energy', nuclear: 'Nuclear power',
    powergrid: 'Power equipment', ship: 'Shipbuilding/Shipping', metal: 'Metals & machinery',
    defense: 'Defense & aerospace', kconsume: 'K-consumer & retail',
    cosmetics: 'Cosmetics', kcontent: 'K-content', bio: 'Bio & pharma',
    robot: 'Robotics', auto: 'Automotive', medtech: 'MedTech', finance: 'Financials',
    construction: 'Construction', software: 'IT & software', holdings: 'Holdings',
    telecom: 'Telecom',
  };
  var COPY = {
    ko: {
      loading: '추이 데이터를 불러오는 중…',
      failed: '섹터 추이 데이터를 불러오지 못했습니다.',
      empty: '표시할 추이 데이터가 없습니다.',
      base: '기준',
      change: '기준 대비',
      legend: '섹터 및 시장지수 범례',
    },
    en: {
      loading: 'Loading trend data…',
      failed: 'Could not load sector trend data.',
      empty: 'No trend data available.',
      base: 'Base',
      change: 'vs base',
      legend: 'Sector and market index legend',
    },
  };

  var state = {
    lang: 'ko',
    horizon: '20d',
    payload: null,
    initialized: false,
    requestId: 0,
    resizeObserver: null,
    themeObserver: null,
    pollTimer: null,
    selectedLines: new Set(),
  };

  function pageLang(value) {
    if (value === 'en' || value === 'ko') return value;
    return document.documentElement.lang === 'en' ? 'en' : 'ko';
  }

  function injectStyles() {
    if (document.getElementById('im-hub-trend-chart-css-v1')) return;
    var style = document.createElement('style');
    style.id = 'im-hub-trend-chart-css-v1';
    style.textContent =
      '.hub-trend{margin:0 0 24px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:14px}' +
      '.hub-trend-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 18px;margin-bottom:12px}' +
      '.hub-trend-head h2{margin:0;font-size:16px;font-weight:700;color:var(--text)}' +
      '.hub-trend-head p{margin:3px 0 0;font-size:12px;color:var(--text-muted)}' +
      '.hub-trend-tabs{display:flex;flex-wrap:nowrap;gap:5px}' +
      '.hub-trend-tab{padding:6px 12px;border:1px solid var(--border);border-radius:20px;background:var(--surface2);color:var(--text-muted);font:600 11px/1.2 inherit;cursor:pointer;transition:border-color .15s,color .15s,background .15s}' +
      '.hub-trend-tab:hover{color:var(--text);border-color:var(--text-muted)}' +
      '.hub-trend-tab.is-active{color:var(--accent);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface2))}' +
      '.hub-trend-chart-wrap{position:relative;min-width:0}' +
      '#hub-trend-chart{position:relative;min-height:420px;width:100%}' +
      '#hub-trend-chart svg{display:block;width:100%;height:auto;overflow:visible}' +
      '.hub-trend-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;min-height:280px;color:var(--text-muted);font-size:12px;pointer-events:none}' +
      '.hub-trend-status[hidden]{display:none}' +
      '.hub-trend-tooltip{position:absolute;z-index:3;max-width:230px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:0 8px 24px rgba(0,0,0,.2);color:var(--text);font-size:11px;line-height:1.45;pointer-events:none;transform:translate(10px,-50%)}' +
      '.hub-trend-tooltip[hidden]{display:none}' +
      '.hub-trend-tooltip strong{display:block;font-size:12px}' +
      '.hub-trend-tooltip .is-up{color:#3fb950}.hub-trend-tooltip .is-down{color:#f85149}' +
      '.hub-trend-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px}' +
      '.hub-trend-legend-item{display:inline-flex;align-items:center;gap:5px;padding:2px 0;border:0;background:none;color:var(--text-muted);font:500 10px/1.3 inherit;cursor:pointer}' +
      '.hub-trend-legend-item:hover,.hub-trend-legend-item:focus-visible,.hub-trend-legend-item.is-selected{color:var(--text);outline:none}' +
      '.hub-trend-chip{width:13px;height:3px;border-radius:2px;flex:0 0 auto}' +
      '.hub-trend-legend-item.is-index{font-weight:700;color:var(--text)}' +
      '.hub-trend-legend-item.is-selected{font-weight:700}' +
      '.hub-trend-axis text{fill:var(--text-muted);font-size:10px}' +
      '.hub-trend-axis path,.hub-trend-axis line{stroke:var(--border)}' +
      '.hub-trend-grid line{stroke:var(--border);stroke-opacity:.5}.hub-trend-grid path{display:none}' +
      '@media(max-width:640px){.hub-trend{padding:13px 10px}.hub-trend-head{align-items:flex-start}.hub-trend-tabs{width:100%}.hub-trend-tab{flex:1 1 0;min-width:0;padding:6px 3px;font-size:10px}#hub-trend-chart{min-height:350px}.hub-trend-legend{gap:5px 9px}.hub-trend-legend-item{font-size:9px}}';
    document.head.appendChild(style);
  }

  function setStatus(message) {
    var el = document.getElementById('hub-trend-status');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function sectorColor(index) {
    var hue = (index * 137.508 + 18) % 360;
    var light = document.documentElement.getAttribute('data-theme') === 'light' ? 42 : 64;
    return 'hsl(' + hue.toFixed(1) + ' 38% ' + light + '%)';
  }

  function sectorName(entry) {
    if (state.lang === 'en') return SECTOR_NAMES_EN[entry.sector] || entry.name || entry.sector;
    return entry.name || entry.sector;
  }

  function normalizeSeries(series) {
    return (Array.isArray(series) ? series : [])
      .map(function (point) {
        return { t: new Date(point.t), v: Number(point.v) };
      })
      .filter(function (point) {
        return !isNaN(point.t.getTime()) && isFinite(point.v);
      })
      .sort(function (a, b) { return a.t - b.t; });
  }

  function chartLines(payload) {
    var lines = [];
    (payload.sectors || []).forEach(function (entry, index) {
      var series = normalizeSeries(entry.series);
      if (!series.length) return;
      lines.push({
        key: 'sector:' + entry.sector,
        name: sectorName(entry),
        kind: 'sector',
        color: sectorColor(index),
        series: series,
      });
    });
    (payload.indices || []).forEach(function (entry) {
      var series = normalizeSeries(entry.series);
      if (!series.length) return;
      lines.push({
        key: 'index:' + entry.code,
        name: INDEX_NAMES[state.lang][entry.code] || entry.code,
        kind: 'index',
        color: INDEX_COLORS[entry.code] || '#d2a8ff',
        series: series,
      });
    });
    return lines;
  }

  function updateTabs() {
    document.querySelectorAll('.hub-trend-tab').forEach(function (button) {
      var active = button.getAttribute('data-horizon') === state.horizon;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
  }

  function lineReturn(line) {
    var series = line && line.series;
    return series && series.length ? series[series.length - 1].v - 100 : -Infinity;
  }

  function formatLegendReturn(pct) {
    if (!isFinite(pct)) return '';
    var rounded = Math.round(pct * 10) / 10;
    var sign = rounded > 0 ? '+' : '';
    return ' ' + sign + rounded.toFixed(1) + '%';
  }

  function renderLegend(lines, applyEmphasis) {
    var root = document.getElementById('hub-trend-legend');
    if (!root) return;
    root.innerHTML = '';
    root.setAttribute('aria-label', COPY[state.lang].legend);
    var sorted = lines.slice().sort(function (a, b) {
      if (a.kind === 'index' && b.kind !== 'index') return 1;
      if (b.kind === 'index' && a.kind !== 'index') return -1;
      return lineReturn(b) - lineReturn(a);
    });
    sorted.forEach(function (line) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'hub-trend-legend-item' + (line.kind === 'index' ? ' is-index' : '');
      button.setAttribute('data-line-key', line.key);
      var selected = state.selectedLines.has(line.key);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.innerHTML = '<span class="hub-trend-chip" style="background:' + line.color + '"></span><span></span>';
      button.lastChild.textContent = line.name + formatLegendReturn(lineReturn(line));
      button.addEventListener('mouseenter', function () { applyEmphasis(line.key); });
      button.addEventListener('mouseleave', function () { applyEmphasis(null); });
      button.addEventListener('focus', function () { applyEmphasis(line.key); });
      button.addEventListener('blur', function () { applyEmphasis(null); });
      button.addEventListener('click', function () {
        if (state.selectedLines.has(line.key)) state.selectedLines.delete(line.key);
        else state.selectedLines.add(line.key);
        applyEmphasis(null);
      });
      root.appendChild(button);
    });
  }

  function render() {
    var root = document.getElementById('hub-trend-chart');
    if (!root || !state.payload || !global.d3) return;
    root.innerHTML = '';
    var lines = chartLines(state.payload);
    if (!lines.length) {
      setStatus(COPY[state.lang].empty);
      var legend = document.getElementById('hub-trend-legend');
      if (legend) legend.innerHTML = '';
      return;
    }
    setStatus('');

    var width = Math.max(300, Math.floor(root.getBoundingClientRect().width || root.clientWidth || 800));
    var mobile = width < 640;
    var height = mobile ? 350 : 420;
    var margin = { top: 14, right: mobile ? 10 : 18, bottom: 34, left: mobile ? 43 : 50 };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;
    var allPoints = lines.reduce(function (out, line) { return out.concat(line.series); }, []);
    var xDomain = d3.extent(allPoints, function (point) { return point.t; });
    if (state.horizon === '1d') {
      var sessionDay = state.payload && state.payload.tradeDate;
      if (!sessionDay && allPoints.length) {
        var kst = new Date(allPoints[0].t.getTime() + 9 * 60 * 60 * 1000);
        sessionDay =
          kst.getUTCFullYear() +
          '-' +
          String(kst.getUTCMonth() + 1).padStart(2, '0') +
          '-' +
          String(kst.getUTCDate()).padStart(2, '0');
      }
      if (sessionDay) {
        xDomain = [
          new Date(sessionDay + 'T09:00:00+09:00'),
          new Date(sessionDay + 'T15:30:00+09:00'),
        ];
      }
    }
    if (+xDomain[0] === +xDomain[1]) {
      var padMs = state.horizon === '1d' ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000;
      xDomain = [new Date(+xDomain[0] - padMs), new Date(+xDomain[1] + padMs)];
    }
    var yExtent = d3.extent(allPoints.concat([{ v: 100 }]), function (point) { return point.v; });
    var ySpan = Math.max(1, yExtent[1] - yExtent[0]);
    var yPad = Math.max(0.6, ySpan * 0.09);
    var x = d3.scaleTime().domain(xDomain).range([0, innerWidth]);
    var y = d3.scaleLinear().domain([yExtent[0] - yPad, yExtent[1] + yPad]).nice().range([innerHeight, 0]);

    var svg = d3.select(root).append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('role', 'img')
      .attr('aria-label', document.getElementById('hub-trend-title')?.textContent || 'Sector trend');
    var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    plot.append('g')
      .attr('class', 'hub-trend-grid')
      .call(d3.axisLeft(y).ticks(mobile ? 5 : 7).tickSize(-innerWidth).tickFormat(''));
    plot.append('line')
      .attr('x1', 0).attr('x2', innerWidth).attr('y1', y(100)).attr('y2', y(100))
      .attr('stroke', 'var(--text-muted)').attr('stroke-opacity', 0.7)
      .attr('stroke-width', 1).attr('stroke-dasharray', '4 4');
    plot.append('text')
      .attr('x', 4).attr('y', y(100) - 5)
      .attr('fill', 'var(--text-muted)').attr('font-size', 9)
      .text(COPY[state.lang].base + ' 100');

    var xFormat = state.horizon === '1d' ? d3.timeFormat('%H:%M') : d3.timeFormat('%m/%d');
    plot.append('g').attr('class', 'hub-trend-axis')
      .attr('transform', 'translate(0,' + innerHeight + ')')
      .call(d3.axisBottom(x).ticks(mobile ? 4 : 7).tickFormat(xFormat));
    plot.append('g').attr('class', 'hub-trend-axis')
      .call(d3.axisLeft(y).ticks(mobile ? 5 : 7).tickFormat(function (value) { return Number(value).toFixed(0); }));

    var lineGenerator = d3.line()
      .defined(function (point) { return isFinite(point.v); })
      .x(function (point) { return x(point.t); })
      .y(function (point) { return y(point.v); })
      .curve(d3.curveMonotoneX);

    var ordered = lines.slice().sort(function (a, b) {
      return (a.kind === 'index' ? 1 : 0) - (b.kind === 'index' ? 1 : 0);
    });
    var paths = plot.selectAll('.hub-trend-line')
      .data(ordered, function (line) { return line.key; })
      .join('path')
      .attr('class', 'hub-trend-line')
      .attr('data-line-key', function (line) { return line.key; })
      .attr('fill', 'none')
      .attr('stroke', function (line) { return line.color; })
      .attr('stroke-width', function (line) { return line.kind === 'index' ? 2.2 : 1; })
      .attr('stroke-opacity', function (line) { return line.kind === 'index' ? 1 : 0.35; })
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('d', function (line) { return lineGenerator(line.series); });

    var crosshair = plot.append('line')
      .attr('y1', 0).attr('y2', innerHeight)
      .attr('stroke', 'var(--text-muted)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3').style('display', 'none');
    var marker = plot.append('circle')
      .attr('r', 3.5).attr('stroke', 'var(--surface)').attr('stroke-width', 1.5)
      .style('display', 'none');
    var tooltip = document.getElementById('hub-trend-tooltip');

    function applyEmphasis(hoverKey) {
      var hasSelection = state.selectedLines.size > 0;
      var useDefault = !hoverKey && !hasSelection;
      paths
        .attr('stroke-opacity', function (line) {
          if (useDefault) return line.kind === 'index' ? 1 : 0.35;
          var on =
            line.key === hoverKey ||
            (hasSelection && state.selectedLines.has(line.key));
          if (on) return line.kind === 'index' ? 1 : 0.95;
          return line.kind === 'index' ? 0.15 : 0.12;
        })
        .attr('stroke-width', function (line) {
          var on =
            !useDefault &&
            (line.key === hoverKey ||
              (hasSelection && state.selectedLines.has(line.key)));
          if (on) return line.kind === 'index' ? 2.8 : 2.4;
          return line.kind === 'index' ? 2.2 : 1;
        });
      document.querySelectorAll('.hub-trend-legend-item').forEach(function (item) {
        var key = item.getAttribute('data-line-key');
        var selected = state.selectedLines.has(key);
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    function clearChartHover() {
      crosshair.style('display', 'none');
      marker.style('display', 'none');
      if (tooltip) tooltip.hidden = true;
      applyEmphasis(null);
    }

    function nearestPoint(line, targetDate) {
      var bisect = d3.bisector(function (point) { return point.t; }).left;
      var index = bisect(line.series, targetDate);
      var left = line.series[Math.max(0, index - 1)];
      var right = line.series[Math.min(line.series.length - 1, index)];
      return !left ? right : !right ? left :
        Math.abs(targetDate - left.t) <= Math.abs(right.t - targetDate) ? left : right;
    }

    plot.append('rect')
      .attr('width', innerWidth).attr('height', innerHeight)
      .attr('fill', 'transparent').style('cursor', 'crosshair')
      .on('pointermove', function (event) {
        var pointer = d3.pointer(event, this);
        var targetDate = x.invert(pointer[0]);
        var best = null;
        lines.forEach(function (line) {
          var point = nearestPoint(line, targetDate);
          if (!point) return;
          var dx = x(point.t) - pointer[0];
          var dy = y(point.v) - pointer[1];
          var distance = Math.sqrt(dx * dx + dy * dy);
          if (!best || distance < best.distance) best = { line: line, point: point, distance: distance };
        });
        if (!best) return;
        applyEmphasis(best.line.key);
        var px = x(best.point.t);
        var py = y(best.point.v);
        crosshair.attr('x1', px).attr('x2', px).style('display', null);
        marker.attr('cx', px).attr('cy', py).attr('fill', best.line.color).style('display', null);
        if (tooltip) {
          var change = best.point.v - 100;
          var dateText = state.horizon === '1d'
            ? d3.timeFormat('%Y-%m-%d %H:%M')(best.point.t)
            : d3.timeFormat('%Y-%m-%d')(best.point.t);
          tooltip.innerHTML = '<strong></strong><span></span><br><span></span>';
          var tooltipSpans = tooltip.querySelectorAll('span');
          tooltip.querySelector('strong').textContent = best.line.name;
          tooltipSpans[0].textContent = dateText + ' · ' + best.point.v.toFixed(2);
          tooltipSpans[1].textContent = COPY[state.lang].change + ' ' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
          tooltipSpans[1].className = change > 0 ? 'is-up' : change < 0 ? 'is-down' : '';
          tooltip.hidden = false;
          var left = margin.left + px;
          var top = margin.top + py;
          tooltip.style.left = Math.min(left, width - 210) + 'px';
          tooltip.style.top = Math.max(28, Math.min(height - 28, top)) + 'px';
        }
      })
      .on('pointerleave', clearChartHover);

    applyEmphasis(null);
    renderLegend(lines, applyEmphasis);
    applyEmphasis(null);
  }

  function fetchAndRender(horizon) {
    if (!HORIZONS.includes(horizon)) horizon = '20d';
    state.horizon = horizon;
    updateTabs();
    setStatus(COPY[state.lang].loading);
    var requestId = ++state.requestId;
    return fetch('/api/hub_trend?horizon=' + encodeURIComponent(horizon), {
      headers: { Accept: 'application/json' },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (requestId !== state.requestId) return;
        state.payload = payload;
        render();
      })
      .catch(function (error) {
        if (requestId !== state.requestId) return;
        console.warn('hub trend chart:', error);
        setStatus(COPY[state.lang].failed);
      });
  }

  function isRegularKst() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    if (values.weekday === 'Sat' || values.weekday === 'Sun') return false;
    var minutes = Number(values.hour) * 60 + Number(values.minute);
    return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (isRegularKst() && !document.hidden) fetchAndRender(state.horizon);
    }, 5 * 60 * 1000);
  }

  function init(options) {
    options = options || {};
    state.lang = pageLang(options.lang);
    injectStyles();
    if (state.initialized) {
      updateTabs();
      if (state.payload) render();
      return;
    }
    var root = document.getElementById('hub-trend-chart');
    if (!root) return;
    state.initialized = true;
    document.querySelectorAll('.hub-trend-tab').forEach(function (button) {
      button.addEventListener('click', function () {
        fetchAndRender(button.getAttribute('data-horizon'));
      });
    });
    if (global.ResizeObserver) {
      var resizeTimer = null;
      state.resizeObserver = new ResizeObserver(function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { if (state.payload) render(); }, 80);
      });
      state.resizeObserver.observe(root);
    }
    state.themeObserver = new MutationObserver(function () {
      if (state.payload) render();
    });
    state.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    startPolling();
    fetchAndRender(options.horizon || '20d');
  }

  function setLang(lang) {
    state.lang = pageLang(lang);
    if (state.payload) render();
  }

  global.InvestingMapHubTrendChart = {
    init: init,
    setLang: setLang,
    refresh: function () { return fetchAndRender(state.horizon); },
  };
})(window);
