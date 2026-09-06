/**
 * Sector performance calendar — YTD lines rebased to prior year-end = 100.
 * window.InvestingMapPerfCalendar.render({ container, legend, sectorId, lang, ... })
 */
(function (global) {
  'use strict';

  var YEAR_STORAGE = 'im_perf_year';
  var YEAR_SPAN = 5;
  var AVG_KEY = 'avg';
  var INDEX_COLORS = { KOSPI: '#f85149', KOSDAQ: '#58a6ff' };
  var AVG_COLOR = 'var(--accent, #58a6ff)';

  var lastOpts = null;
  var resizeObs = null;
  var observedEl = null;
  var resizeTimer = null;
  var requestId = 0;
  var payloadCache = {};
  var selectedLines = new Set();
  var selectedYear = null;
  var lastPayload = null;
  var lastLines = [];
  var applyEmphasisFn = null;

  var COPY = {
    ko: {
      title: '퍼포먼스 캘린더',
      subtitle: '전년말 종가=100 기준 연중 수익률',
      sectorAvg: '섹터 평균',
      kospi: 'KOSPI',
      kosdaq: 'KOSDAQ',
      loading: '퍼포먼스 데이터를 불러오는 중…',
      failed: '퍼포먼스 캘린더 데이터를 불러오지 못했습니다.',
      noData: '표시할 퍼포먼스 데이터가 없습니다.',
      legend: '종목·섹터 평균·지수 범례',
      base: '기준',
      change: '기준 대비',
      openChart: '캔들 차트 열기',
      yearTabs: '연도 선택',
    },
    en: {
      title: 'Performance Calendar',
      subtitle: 'YTD vs prior year-end=100',
      sectorAvg: 'Sector average',
      kospi: 'KOSPI',
      kosdaq: 'KOSDAQ',
      loading: 'Loading performance data…',
      failed: 'Could not load performance calendar data.',
      noData: 'No performance data available.',
      legend: 'Members, sector average, and index legend',
      base: 'Base',
      change: 'vs base',
      openChart: 'Open candle chart',
      yearTabs: 'Year filter',
    },
  };

  function labelsFor(opts) {
    var lang = opts && opts.lang === 'en' ? 'en' : 'ko';
    var base = COPY[lang];
    var supplied = (opts && opts.labels) || {};
    var out = {};
    Object.keys(base).forEach(function (key) {
      out[key] = supplied[key] || base[key];
    });
    return out;
  }

  function currentKstYear(now) {
    var d = now || new Date();
    var kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCFullYear();
  }

  function yearOptions(now) {
    var cur = currentKstYear(now);
    var years = [];
    for (var i = 0; i < YEAR_SPAN; i++) years.push(cur - i);
    return years;
  }

  function normalizeYear(raw, now) {
    var cur = currentKstYear(now);
    var min = cur - (YEAR_SPAN - 1);
    var n = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n) || n < min || n > cur) return cur;
    return n;
  }

  function loadYear() {
    try {
      if (global.localStorage) return normalizeYear(localStorage.getItem(YEAR_STORAGE));
    } catch (e) {}
    return currentKstYear();
  }

  function saveYear(year) {
    try {
      if (global.localStorage) localStorage.setItem(YEAR_STORAGE, String(normalizeYear(year)));
    } catch (e) {}
  }

  selectedYear = loadYear();

  function resolveSectorId(opts) {
    if (opts && opts.sectorId) return String(opts.sectorId).trim();
    try {
      return (document.body && document.body.getAttribute('data-sector')) || '';
    } catch (e) {
      return '';
    }
  }

  function apiPrefix(opts) {
    if (opts && opts.prefix != null && opts.prefix !== '') return String(opts.prefix).replace(/\/$/, '');
    try {
      return (global.location && global.location.origin) || '';
    } catch (e) {
      return '';
    }
  }

  function cacheKey(sectorId, year) {
    return String(sectorId) + '|' + String(year);
  }

  function parseDay(t) {
    var s = String(t || '').slice(0, 10);
    var parts = s.split('-');
    if (parts.length !== 3) return null;
    var y = +parts[0];
    var m = +parts[1];
    var d = +parts[2];
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function normalizeSeries(points) {
    return (Array.isArray(points) ? points : [])
      .map(function (p) {
        return { t: parseDay(p.t), v: Number(p.v), rawT: String(p.t || '').slice(0, 10) };
      })
      .filter(function (p) {
        return p.t && !isNaN(p.t.getTime()) && isFinite(p.v);
      })
      .sort(function (a, b) {
        return a.t - b.t;
      });
  }

  function memberColor(index) {
    var hue = (index * 137.508 + 24) % 360;
    var light = document.documentElement.getAttribute('data-theme') === 'light' ? 40 : 62;
    return 'hsl(' + hue.toFixed(1) + ' 42% ' + light + '%)';
  }

  function displayName(member, lang) {
    if (!member) return '';
    if (lang === 'en' && member.nameEn) return member.nameEn;
    return member.name || member.nameEn || member.ticker || '';
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

  function formatMonthTick(date, lang) {
    var m = date.getMonth() + 1;
    if (lang === 'en') {
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
    }
    return m + '월';
  }

  function buildLines(payload, lang, labels) {
    var lines = [];
    (payload.members || []).forEach(function (member, index) {
      var series = normalizeSeries(member.points);
      if (!series.length) return;
      lines.push({
        key: String(member.ticker),
        name: displayName(member, lang),
        ticker: String(member.ticker),
        kind: 'member',
        color: memberColor(index),
        series: series,
      });
    });
    var avgSeries = normalizeSeries(payload.sectorAvg);
    if (avgSeries.length) {
      lines.push({
        key: AVG_KEY,
        name: labels.sectorAvg,
        ticker: null,
        kind: 'avg',
        color: AVG_COLOR,
        series: avgSeries,
      });
    }
    var indices = payload.indices || {};
    ['KOSPI', 'KOSDAQ'].forEach(function (code) {
      var series = normalizeSeries(indices[code]);
      if (!series.length) return;
      lines.push({
        key: code,
        name: code === 'KOSPI' ? labels.kospi : labels.kosdaq,
        ticker: null,
        kind: 'index',
        color: INDEX_COLORS[code],
        series: series,
      });
    });
    return lines;
  }

  function injectStyles() {
    if (document.getElementById('im-perfcalendar-css')) return;
    var style = document.createElement('style');
    style.id = 'im-perfcalendar-css';
    style.textContent =
      '.perfcalendar-wrap{padding:20px 28px 28px;max-width:1400px;margin:0 auto}' +
      '.perfcalendar-head{margin:0 0 10px}' +
      '.perfcalendar-head h2{margin:0;font-size:16px;font-weight:700;color:var(--text,#e6edf3)}' +
      '.perfcalendar-meta{margin:4px 0 0;color:var(--text-muted,#8b949e);font-size:13px}' +
      '.perf-year-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;align-items:center}' +
      '.perf-year-tab{padding:6px 12px;min-height:32px;border-radius:16px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;cursor:pointer}' +
      '.perf-year-tab:hover{border-color:var(--accent,#58a6ff);color:var(--text,#e6edf3)}' +
      '.perf-year-tab[aria-selected="true"]{border-color:var(--accent,#58a6ff);color:var(--accent,#58a6ff);' +
      'background:color-mix(in srgb,var(--accent,#58a6ff) 14%,var(--surface2,#21262d))}' +
      '#perfcalendar-root{position:relative;width:100%;min-height:420px;height:min(62vh,640px);' +
      'background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:10px;overflow:hidden}' +
      '#perfcalendar-root svg{display:block;width:100%;height:100%}' +
      '.perf-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'color:var(--text-muted,#8b949e);font-size:13px;pointer-events:none;z-index:2}' +
      '.perf-status[hidden]{display:none}' +
      '.perf-tooltip{position:absolute;z-index:3;max-width:240px;padding:8px 10px;border:1px solid var(--border,#30363d);' +
      'border-radius:8px;background:color-mix(in srgb,var(--surface,#161b22) 94%,transparent);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.2);color:var(--text,#e6edf3);font-size:11px;line-height:1.45;' +
      'pointer-events:none;transform:translate(10px,-50%)}' +
      '.perf-tooltip[hidden]{display:none}' +
      '.perf-tooltip strong{display:block;font-size:12px}' +
      '.perf-tooltip .is-up{color:#3fb950}.perf-tooltip .is-down{color:#f85149}' +
      '.perf-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:12px}' +
      '.perf-legend-item{display:inline-flex;align-items:center;gap:5px;padding:2px 0;border:0;background:none;' +
      'color:var(--text-muted,#8b949e);font:500 10px/1.3 inherit;cursor:pointer}' +
      '.perf-legend-item:hover,.perf-legend-item:focus-visible,.perf-legend-item.is-selected{color:var(--text,#e6edf3);outline:none}' +
      '.perf-legend-item.is-avg,.perf-legend-item.is-index{font-weight:700;color:var(--text,#e6edf3)}' +
      '.perf-legend-item.is-selected{font-weight:700}' +
      '.perf-chip{width:13px;height:3px;border-radius:2px;flex:0 0 auto}' +
      '.perf-chip.is-dashed{background:repeating-linear-gradient(90deg,currentColor 0 4px,transparent 4px 7px);height:2px}' +
      '.perf-candle-btn{margin-left:2px;border:0;background:transparent;color:var(--text-muted,#8b949e);' +
      'cursor:pointer;font-size:11px;line-height:1;padding:0 2px}' +
      '.perf-candle-btn:hover{color:var(--accent,#58a6ff)}' +
      '.perf-axis text{fill:var(--text-muted,#8b949e);font-size:10px}' +
      '.perf-axis path,.perf-axis line{stroke:var(--border,#30363d)}' +
      '.perf-grid line{stroke:var(--border,#30363d);stroke-opacity:.5}.perf-grid path{display:none}' +
      '@media(max-width:768px){.perfcalendar-wrap{padding:14px 12px 20px}.perfcalendar-meta{font-size:12px}' +
      '.perf-year-tab{flex:1 1 0;padding:8px 6px;min-height:36px;font-size:11px}' +
      '#perfcalendar-root{min-height:min(52vh,480px)!important;height:min(58vh,560px)!important}' +
      '.perf-legend{gap:5px 9px}.perf-legend-item{font-size:9px}}';
    document.head.appendChild(style);
  }

  function ensureChrome(opts) {
    injectStyles();
    var container = opts.container;
    var wrap = container && container.parentNode;
    if (!wrap) return;
    var labels = labelsFor(opts);

    var head = wrap.querySelector('.perfcalendar-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'perfcalendar-head';
      head.innerHTML = '<h2 id="perfcalendar-title"></h2>';
      var hint = wrap.querySelector('#perfcalendar-hint') || wrap.querySelector('.perfcalendar-meta');
      if (hint) {
        if (!hint.id) hint.id = 'perfcalendar-hint';
        hint.classList.add('perfcalendar-meta');
        wrap.insertBefore(head, hint);
        head.appendChild(hint);
      } else {
        wrap.insertBefore(head, container);
        var p = document.createElement('p');
        p.className = 'perfcalendar-meta';
        p.id = 'perfcalendar-hint';
        head.appendChild(p);
      }
    }
    var titleEl = head.querySelector('#perfcalendar-title');
    if (titleEl) titleEl.textContent = labels.title;
    var hintEl = head.querySelector('#perfcalendar-hint') || document.getElementById('perfcalendar-hint');
    if (hintEl) hintEl.textContent = labels.subtitle;

    var tabs = wrap.querySelector('#perfcalendar-year-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'perfcalendar-year-tabs';
      tabs.className = 'perf-year-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.addEventListener('click', function (event) {
        var button = event.target.closest('[data-perf-year]');
        if (!button) return;
        var next = normalizeYear(button.getAttribute('data-perf-year'));
        if (next === selectedYear) return;
        selectedYear = next;
        saveYear(next);
        if (lastOpts) fetchAndRender(lastOpts);
      });
      if (container && wrap.contains(container)) wrap.insertBefore(tabs, container);
      else wrap.appendChild(tabs);
    }
    tabs.setAttribute('aria-label', labels.yearTabs);
    tabs.innerHTML = yearOptions()
      .map(function (year) {
        return (
          '<button type="button" class="perf-year-tab" role="tab" data-perf-year="' +
          year +
          '" aria-selected="' +
          (year === selectedYear ? 'true' : 'false') +
          '">' +
          year +
          '</button>'
        );
      })
      .join('');
  }

  function setStatus(container, message) {
    if (!container) return;
    var el = container.querySelector('.perf-status');
    if (!el) {
      el = document.createElement('div');
      el.className = 'perf-status';
      container.appendChild(el);
    }
    el.textContent = message || '';
    el.hidden = !message;
  }

  function ensureTooltip(container) {
    var tip = container.querySelector('.perf-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'perf-tooltip';
      tip.hidden = true;
      tip.setAttribute('role', 'tooltip');
      container.appendChild(tip);
    }
    return tip;
  }

  function openCandle(line, opts) {
    if (!line || line.kind !== 'member' || !line.ticker) return;
    var name = line.name || line.ticker;
    if (opts && typeof opts.onSelect === 'function') {
      opts.onSelect({ ticker: line.ticker, name: name, nameEn: name });
      return;
    }
    if (global.InvestingMapCandleModal && typeof global.InvestingMapCandleModal.open === 'function') {
      global.InvestingMapCandleModal.open({ ticker: line.ticker, name: name });
    }
  }

  function defaultOpacity(line) {
    return line.kind === 'member' ? 0.22 : 1;
  }

  function defaultWidth(line) {
    if (line.kind === 'avg') return 2.6;
    if (line.kind === 'index') return 2.1;
    return 1;
  }

  function renderLegend(legendEl, lines, labels, opts, applyEmphasis) {
    if (!legendEl) return;
    legendEl.className = 'perf-legend';
    legendEl.setAttribute('aria-label', labels.legend);
    legendEl.innerHTML = '';

    var sorted = lines.slice().sort(function (a, b) {
      var rank = function (line) {
        if (line.kind === 'avg') return 1;
        if (line.kind === 'index') return 2;
        return 0;
      };
      var ra = rank(a);
      var rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.kind === 'member' && b.kind === 'member') return lineReturn(b) - lineReturn(a);
      return String(a.key).localeCompare(String(b.key));
    });

    sorted.forEach(function (line) {
      var row = document.createElement('span');
      row.className = 'perf-legend-item-wrap';
      row.style.display = 'inline-flex';
      row.style.alignItems = 'center';
      row.style.gap = '2px';

      var button = document.createElement('button');
      button.type = 'button';
      button.className =
        'perf-legend-item' +
        (line.kind === 'index' ? ' is-index' : '') +
        (line.kind === 'avg' ? ' is-avg' : '');
      button.setAttribute('data-line-key', line.key);
      var selected = selectedLines.has(line.key);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');

      var chip = document.createElement('span');
      chip.className = 'perf-chip' + (line.kind === 'index' ? ' is-dashed' : '');
      chip.style.background = line.kind === 'index' ? 'transparent' : line.color;
      chip.style.color = line.color;
      if (line.kind === 'index') chip.style.borderBottom = '2px dashed ' + line.color;

      var label = document.createElement('span');
      label.textContent = line.name + formatLegendReturn(lineReturn(line));

      button.appendChild(chip);
      button.appendChild(label);

      var clickTimer = null;
      button.addEventListener('mouseenter', function () {
        applyEmphasis(line.key);
      });
      button.addEventListener('mouseleave', function () {
        applyEmphasis(null);
      });
      button.addEventListener('focus', function () {
        applyEmphasis(line.key);
      });
      button.addEventListener('blur', function () {
        applyEmphasis(null);
      });
      button.addEventListener('click', function () {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(function () {
          if (selectedLines.has(line.key)) selectedLines.delete(line.key);
          else selectedLines.add(line.key);
          applyEmphasis(null);
        }, 220);
      });
      button.addEventListener('dblclick', function (event) {
        if (clickTimer) clearTimeout(clickTimer);
        event.preventDefault();
        openCandle(line, opts);
      });

      row.appendChild(button);

      if (line.kind === 'member') {
        var candleBtn = document.createElement('button');
        candleBtn.type = 'button';
        candleBtn.className = 'perf-candle-btn';
        candleBtn.setAttribute('aria-label', labels.openChart + ': ' + line.name);
        candleBtn.title = labels.openChart;
        candleBtn.textContent = '▣';
        candleBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          openCandle(line, opts);
        });
        row.appendChild(candleBtn);
      }

      legendEl.appendChild(row);
    });
  }

  function getUrlTicker() {
    try {
      return String(new URLSearchParams(window.location.search).get('ticker') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function applyUrlTickerSelection(lines, legendEl) {
    var ticker = getUrlTicker();
    if (!ticker || !lines || !lines.length) return;
    var match = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].kind === 'member' && lines[i].key === ticker) {
        match = lines[i];
        break;
      }
    }
    if (!match) return;
    selectedLines.add(match.key);
    if (legendEl) {
      var item = legendEl.querySelector('.perf-legend-item[data-line-key="' + ticker + '"]');
      if (item && typeof item.scrollIntoView === 'function') {
        try {
          item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } catch (e2) {
          item.scrollIntoView(true);
        }
      }
    }
  }

  function drawChart(opts, payload) {
    var container = opts.container;
    var legendEl = opts.legend || document.getElementById('perfcalendar-legend');
    var labels = labelsFor(opts);
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    if (!container || !global.d3) return;

    var year = payload.year || selectedYear;
    var lines = buildLines(payload, lang, labels);
    lastLines = lines;
    lastPayload = payload;

    container.querySelectorAll('svg').forEach(function (svg) {
      svg.remove();
    });

    if (!lines.length) {
      setStatus(container, labels.noData);
      if (legendEl) legendEl.innerHTML = '';
      return;
    }
    setStatus(container, '');

    var width = Math.max(300, Math.floor(container.getBoundingClientRect().width || container.clientWidth || 800));
    var height = Math.max(320, Math.floor(container.getBoundingClientRect().height || container.clientHeight || 420));
    var mobile = width < 640;
    var margin = { top: 14, right: mobile ? 10 : 18, bottom: 34, left: mobile ? 40 : 48 };
    var innerW = Math.max(40, width - margin.left - margin.right);
    var innerH = Math.max(40, height - margin.top - margin.bottom);

    var allPoints = lines.reduce(function (out, line) {
      return out.concat(line.series);
    }, []);
    var xDomain = [new Date(year, 0, 1), new Date(year, 11, 31)];
    var yExtent = d3.extent(allPoints.concat([{ v: 100 }]), function (p) {
      return p.v;
    });
    var ySpan = Math.max(1, yExtent[1] - yExtent[0]);
    var yPad = Math.max(0.8, ySpan * 0.08);
    var x = d3.scaleTime().domain(xDomain).range([0, innerW]);
    var y = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .nice()
      .range([innerH, 0]);

    var svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('role', 'img')
      .attr('aria-label', labels.title);
    var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    plot
      .append('g')
      .attr('class', 'perf-grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(mobile ? 5 : 7)
          .tickSize(-innerW)
          .tickFormat(''),
      );

    plot
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', y(100))
      .attr('y2', y(100))
      .attr('stroke', 'var(--text-muted,#8b949e)')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4');
    plot
      .append('text')
      .attr('x', 4)
      .attr('y', y(100) - 5)
      .attr('fill', 'var(--text-muted,#8b949e)')
      .attr('font-size', 9)
      .text(labels.base + ' 100');

    var monthTicks = [];
    for (var mi = 0; mi < 12; mi++) monthTicks.push(new Date(year, mi, 1));
    plot
      .append('g')
      .attr('class', 'perf-axis')
      .attr('transform', 'translate(0,' + innerH + ')')
      .call(
        d3
          .axisBottom(x)
          .tickValues(monthTicks)
          .tickFormat(function (d) {
            return formatMonthTick(d, lang);
          }),
      );
    plot
      .append('g')
      .attr('class', 'perf-axis')
      .call(
        d3.axisLeft(y).ticks(mobile ? 5 : 7).tickFormat(function (v) {
          return Number(v).toFixed(0);
        }),
      );

    var lineGenerator = d3
      .line()
      .defined(function (p) {
        return isFinite(p.v);
      })
      .x(function (p) {
        return x(p.t);
      })
      .y(function (p) {
        return y(p.v);
      })
      .curve(d3.curveMonotoneX);

    var ordered = lines.slice().sort(function (a, b) {
      var rank = function (line) {
        if (line.kind === 'member') return 0;
        if (line.kind === 'index') return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });

    var paths = plot
      .selectAll('.perf-line')
      .data(ordered, function (line) {
        return line.key;
      })
      .join('path')
      .attr('class', 'perf-line')
      .attr('data-line-key', function (line) {
        return line.key;
      })
      .attr('fill', 'none')
      .attr('stroke', function (line) {
        return line.color;
      })
      .attr('stroke-width', function (line) {
        return defaultWidth(line);
      })
      .attr('stroke-opacity', function (line) {
        return defaultOpacity(line);
      })
      .attr('stroke-dasharray', function (line) {
        return line.kind === 'index' ? '5 4' : null;
      })
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('d', function (line) {
        return lineGenerator(line.series);
      })
      .attr('pointer-events', 'none');

    var crosshair = plot
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'var(--text-muted,#8b949e)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3')
      .style('display', 'none');
    var marker = plot
      .append('circle')
      .attr('r', 3.5)
      .attr('stroke', 'var(--surface,#161b22)')
      .attr('stroke-width', 1.5)
      .style('display', 'none');
    var tooltip = ensureTooltip(container);

    function applyEmphasis(hoverKey) {
      var hasSelection = selectedLines.size > 0;
      var useDefault = !hoverKey && !hasSelection;
      paths
        .attr('stroke-opacity', function (line) {
          if (useDefault) return defaultOpacity(line);
          var on = line.key === hoverKey || (hasSelection && selectedLines.has(line.key));
          return on ? (line.kind === 'member' ? 0.95 : 1) : 0.08;
        })
        .attr('stroke-width', function (line) {
          var on =
            !useDefault && (line.key === hoverKey || (hasSelection && selectedLines.has(line.key)));
          if (on) return line.kind === 'member' ? 2.2 : line.kind === 'avg' ? 3 : 2.6;
          return defaultWidth(line);
        });
      if (legendEl) {
        legendEl.querySelectorAll('.perf-legend-item').forEach(function (item) {
          var key = item.getAttribute('data-line-key');
          var selected = selectedLines.has(key);
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
      }
    }
    applyEmphasisFn = applyEmphasis;

    function nearestPoint(line, targetDate) {
      var bisect = d3.bisector(function (p) {
        return p.t;
      }).left;
      var index = bisect(line.series, targetDate);
      var left = line.series[Math.max(0, index - 1)];
      var right = line.series[Math.min(line.series.length - 1, index)];
      if (!left) return right;
      if (!right) return left;
      return Math.abs(targetDate - left.t) <= Math.abs(targetDate - right.t) ? left : right;
    }

    function candidateLines(includeMembers) {
      if (selectedLines.size > 0) {
        return lines.filter(function (line) {
          return selectedLines.has(line.key);
        });
      }
      if (includeMembers) return lines;
      var focus = lines.filter(function (line) {
        return line.kind !== 'member';
      });
      return focus.length ? focus : lines;
    }

    function bestNearPointer(pointer, pool) {
      var targetDate = x.invert(pointer[0]);
      var best = null;
      pool.forEach(function (line) {
        var point = nearestPoint(line, targetDate);
        if (!point) return;
        var dx = x(point.t) - pointer[0];
        var dy = y(point.v) - pointer[1];
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (!best || distance < best.distance) best = { line: line, point: point, distance: distance };
      });
      return best;
    }

    function clearHover() {
      crosshair.style('display', 'none');
      marker.style('display', 'none');
      tooltip.hidden = true;
      applyEmphasis(null);
    }

    var overlayClickTimer = null;
    plot
      .append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('pointermove', function (event) {
        var pointer = d3.pointer(event, this);
        var best = bestNearPointer(pointer, candidateLines(false));
        if (!best) return;
        applyEmphasis(best.line.key);
        var px = x(best.point.t);
        var py = y(best.point.v);
        crosshair.attr('x1', px).attr('x2', px).style('display', null);
        marker.attr('cx', px).attr('cy', py).attr('fill', best.line.color).style('display', null);

        var change = best.point.v - 100;
        var dateText = best.point.rawT || d3.timeFormat('%Y-%m-%d')(best.point.t);
        tooltip.innerHTML = '<strong></strong><span></span><br><span></span>';
        var spans = tooltip.querySelectorAll('span');
        tooltip.querySelector('strong').textContent = best.line.name;
        spans[0].textContent = dateText + ' · ' + best.point.v.toFixed(2);
        spans[1].textContent =
          labels.change + ' ' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        spans[1].className = change > 0 ? 'is-up' : change < 0 ? 'is-down' : '';
        tooltip.hidden = false;
        tooltip.style.left = Math.min(margin.left + px, width - 210) + 'px';
        tooltip.style.top = Math.max(28, Math.min(height - 28, margin.top + py)) + 'px';
      })
      .on('pointerleave', clearHover)
      .on('click', function (event) {
        var pointer = d3.pointer(event, this);
        var best = bestNearPointer(pointer, lines.filter(function (l) { return l.kind === 'member'; }));
        if (!best || best.distance > 28) return;
        if (overlayClickTimer) clearTimeout(overlayClickTimer);
        overlayClickTimer = setTimeout(function () {
          if (selectedLines.has(best.line.key)) selectedLines.delete(best.line.key);
          else selectedLines.add(best.line.key);
          applyEmphasis(null);
        }, 220);
      })
      .on('dblclick', function (event) {
        if (overlayClickTimer) clearTimeout(overlayClickTimer);
        var pointer = d3.pointer(event, this);
        var best = bestNearPointer(pointer, lines.filter(function (l) { return l.kind === 'member'; }));
        if (!best || best.distance > 28) return;
        event.preventDefault();
        openCandle(best.line, opts);
      });

    applyEmphasis(null);
    renderLegend(legendEl, lines, labels, opts, applyEmphasis);
    applyUrlTickerSelection(lines, legendEl);
    applyEmphasis(null);
  }

  function fetchAndRender(opts) {
    ensureChrome(opts);
    var container = opts.container;
    var labels = labelsFor(opts);
    var sectorId = resolveSectorId(opts);
    var year = normalizeYear(selectedYear);
    selectedYear = year;
    saveYear(year);

    if (!sectorId) {
      setStatus(container, labels.failed);
      return Promise.resolve();
    }

    var key = cacheKey(sectorId, year);
    if (payloadCache[key]) {
      drawChart(opts, payloadCache[key]);
      return Promise.resolve(payloadCache[key]);
    }

    setStatus(container, labels.loading);
    var rid = ++requestId;
    var url =
      apiPrefix(opts) +
      '/api/sector_perf_calendar?sector=' +
      encodeURIComponent(sectorId) +
      '&year=' +
      encodeURIComponent(String(year));

    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (rid !== requestId) return;
        if (payload && payload.error && !(payload.members && payload.members.length)) {
          throw new Error(payload.error);
        }
        payloadCache[key] = payload;
        drawChart(opts, payload);
        return payload;
      })
      .catch(function (err) {
        if (rid !== requestId) return;
        console.warn('perf calendar:', err);
        setStatus(container, labels.failed);
        if (opts.legend) opts.legend.innerHTML = '';
      });
  }

  function observeContainer(container) {
    if (!global.ResizeObserver || !container || observedEl === container) return;
    if (resizeObs) resizeObs.disconnect();
    observedEl = container;
    resizeObs = new ResizeObserver(function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (lastOpts && lastPayload) drawChart(lastOpts, lastPayload);
      }, 120);
    });
    resizeObs.observe(container);
  }

  function render(opts) {
    opts = opts || {};
    if (!opts.container) return;
    lastOpts = opts;
    selectedYear = normalizeYear(selectedYear);
    injectStyles();
    ensureChrome(opts);
    observeContainer(opts.container);
    fetchAndRender(opts);
  }

  global.InvestingMapPerfCalendar = {
    render: render,
    getYear: function () {
      return selectedYear;
    },
    setYear: function (year) {
      selectedYear = normalizeYear(year);
      saveYear(selectedYear);
      if (lastOpts) fetchAndRender(lastOpts);
    },
    clearSelection: function () {
      selectedLines.clear();
      if (applyEmphasisFn) applyEmphasisFn(null);
    },
    _test: {
      normalizeYear: normalizeYear,
      currentKstYear: currentKstYear,
      buildLines: buildLines,
      parseDay: parseDay,
      YEAR_STORAGE: YEAR_STORAGE,
      AVG_KEY: AVG_KEY,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
