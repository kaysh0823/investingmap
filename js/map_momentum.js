/**
 * RS × rolling price-position bubble matrix for sector map pages.
 * x = RS, y = price position, radius = daily turnover, color = 1D return.
 */
(function (global) {
  'use strict';

  var lastOpts = null;
  var resizeObs = null;
  var observedEl = null;
  var resizeTimer = null;
  var visibilityBound = false;
  var selectedYMode = '50d';
  var CHG_CLIP = 15;
  var CHG_RANGE = ['#c62828', '#e53935', '#8e3a3a', '#2a2e38', '#2e7d32', '#43a047', '#00c853'];
  var CONTRAST_EXP = 0.55;

  var COPY = {
    ko: {
      xAxis: 'RS',
      yAxis: '50D BOX',
      mode50d: '50D BOX',
      modeBb: '50D %b',
      y50d: '50D BOX',
      yBb: '50D %b',
      leader: '주도(강세)',
      pullback: '되돌림주의',
      emerging: '신규부상',
      lagging: '소외',
      turnover: '당일 거래대금',
      change: '당일 등락률',
      position: '주가 위치',
      noData: 'RS·주가 위치·거래대금 데이터가 있는 종목이 없습니다.',
      legend: '색 = 당일 등락률 · 크기 = 당일 거래대금',
    },
    en: {
      xAxis: 'RS',
      yAxis: '50D BOX',
      mode50d: '50D BOX',
      modeBb: '50D %b',
      y50d: '50D BOX',
      yBb: '50D %b',
      leader: 'Leading (strong)',
      pullback: 'Pullback risk',
      emerging: 'Emerging',
      lagging: 'Lagging',
      turnover: 'Daily turnover',
      change: '1-day return',
      position: 'Price position',
      noData: 'No companies have RS, price-position and turnover data.',
      legend: 'Color = 1-day return · size = daily turnover',
    },
  };

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function clamp100(value) {
    return Math.max(0, Math.min(100, value));
  }

  function normalizeYMode(mode) {
    return mode === '50d' || mode === 'bb' ? mode : '50d';
  }

  function pricePosition(company, mode) {
    if (!company) return null;
    mode = normalizeYMode(mode || selectedYMode);
    var last = company.quoteLast;
    var high = mode === 'bb' ? company.bbUpper : company.high50d;
    var low = mode === 'bb' ? company.bbLower : company.low50d;
    if (!isFiniteNumber(last) || !isFiniteNumber(high) || !isFiniteNumber(low) || high <= low) return null;
    var raw = ((last - low) / (high - low)) * 100;
    return { raw: raw, plot: clamp100(raw), mode: mode };
  }

  function datum(company, mode) {
    if (!company || !isFiniteNumber(company.rs) || !isFiniteNumber(company.turnoverWon)) return null;
    var position = pricePosition(company, mode);
    if (position == null) return null;
    return {
      company: company,
      rs: clamp100(company.rs),
      position: position.plot,
      rawPosition: position.raw,
      yMode: position.mode,
      turnover: Math.max(0, company.turnoverWon),
      change: isFiniteNumber(company.chg1dPct) ? company.chg1dPct : null,
    };
  }

  function labelsFor(opts, mode) {
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var base = COPY[lang];
    var supplied = opts.labels || {};
    var out = {};
    Object.keys(base).forEach(function (key) {
      out[key] = supplied[key] || base[key];
    });
    mode = normalizeYMode(mode || selectedYMode);
    out.yAxis = mode === 'bb' ? out.yBb : out.y50d;
    out.position = out.yAxis;
    return out;
  }

  function displayName(company, lang) {
    return lang === 'en' && company.nameEn
      ? company.nameEn
      : company.name || company.nameKo || company.ticker || '';
  }

  function bubbleLabelText(company, lang, radius) {
    var name = displayName(company, lang);
    var fontSize = Math.max(8, Math.min(12, radius * 0.5));
    var maxChars = Math.floor((radius * 2) / (fontSize * 0.62));
    if (name.length > maxChars) {
      name = name.slice(0, Math.max(1, maxChars - 1)) + '…';
    }
    return { text: name, fontSize: fontSize };
  }

  function formatPct(value, digits) {
    if (!isFiniteNumber(value)) return '—';
    var sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
    return sign + Math.abs(value).toFixed(digits == null ? 1 : digits) + '%';
  }

  function formatTurnover(value, lang) {
    if (!isFiniteNumber(value)) return '—';
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

  function fallbackColor(pct) {
    if (!isFiniteNumber(pct)) return '#2a2e38';
    var x = Math.max(-CHG_CLIP, Math.min(CHG_CLIP, pct)) / CHG_CLIP;
    var mapped = (x < 0 ? -1 : 1) * Math.pow(Math.abs(x), CONTRAST_EXP);
    var pos = ((mapped + 1) / 2) * (CHG_RANGE.length - 1);
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

  function bubbleColor(change) {
    if (
      global.InvestingMapHeatmap &&
      typeof global.InvestingMapHeatmap.colorForChange === 'function'
    ) {
      return global.InvestingMapHeatmap.colorForChange(change);
    }
    return fallbackColor(change);
  }

  function injectStyles() {
    var style = document.getElementById('im-momentum-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'im-momentum-css';
      document.head.appendChild(style);
    }
    style.textContent =
      '.momentum-wrap{padding:20px 28px 28px;max-width:1400px;margin:0 auto}' +
      '.momentum-meta{margin:0 0 12px;color:var(--text-muted,#8b949e);font-size:13px}' +
      '.mm-mode-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;align-items:center}' +
      '.mm-mode-tab{padding:6px 12px;min-height:32px;border-radius:16px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;cursor:pointer}' +
      '.mm-mode-tab:hover{border-color:var(--accent,#58a6ff);color:var(--text,#e6edf3)}' +
      '.mm-mode-tab[aria-selected="true"]{border-color:var(--accent,#58a6ff);color:var(--accent,#58a6ff);' +
      'background:color-mix(in srgb,var(--accent,#58a6ff) 14%,var(--surface2,#21262d))}' +
      '#momentum-root{position:relative;width:100%;min-height:420px;height:min(62vh,640px);' +
      'background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:10px;overflow:hidden}' +
      '#momentum-root svg{display:block;width:100%;height:100%}' +
      '.im-mm-tooltip{position:fixed;z-index:10001;display:none;pointer-events:none;max-width:min(360px,86vw);' +
      'padding:9px 12px;border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);' +
      'border:1px solid var(--border,#30363d);box-shadow:0 4px 14px rgba(0,0,0,.38);font-size:12px;line-height:1.5}' +
      '.im-mm-tooltip strong{display:block;font-size:13px;margin-bottom:2px}' +
      '.im-mm-bubble{cursor:pointer;transition:stroke-width .12s,opacity .12s}' +
      '.im-mm-bubble:hover,.im-mm-bubble:focus{stroke:var(--text,#e6edf3);stroke-width:2.5;outline:none}' +
      '.im-mm-node.im-mm-focus .im-mm-bubble{stroke:var(--accent,#58a6ff)!important;stroke-width:3!important;' +
      'filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent,#58a6ff) 55%,transparent))}' +
      '.im-mm-node.im-mm-focus text{opacity:1!important}' +
      '.im-mm-legend{margin-top:12px;color:var(--text-muted,#8b949e);font-size:12px}' +
      '.im-mm-legend-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}' +
      '.im-mm-gradient{width:min(260px,62vw);height:10px;border-radius:5px;border:1px solid var(--border,#30363d);' +
      'background:linear-gradient(to right,#c62828,#e53935,#8e3a3a,#2a2e38,#2e7d32,#43a047,#00c853)}' +
      '.im-mm-size{display:inline-flex;align-items:flex-end;gap:4px;height:22px}' +
      '.im-mm-size i{display:block;border:1px solid var(--text-muted,#8b949e);border-radius:50%}' +
      '@media(max-width:768px){.momentum-wrap{padding:14px 12px 20px}.momentum-meta{font-size:12px}' +
      '.mm-mode-tab{flex:1 1 0;padding:8px 6px;min-height:36px;font-size:11px}' +
      '#momentum-root{min-height:min(52vh,480px)!important;height:min(58vh,560px)!important}' +
      '.im-mm-legend{font-size:11px}}';
  }

  function tooltip() {
    injectStyles();
    var el = document.getElementById('im-mm-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'im-mm-tooltip';
      el.className = 'im-mm-tooltip';
      el.setAttribute('role', 'tooltip');
      document.body.appendChild(el);
    }
    return el;
  }

  function moveTooltip(event) {
    var el = document.getElementById('im-mm-tooltip');
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

  function showTooltip(item, opts, event) {
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var labels = labelsFor(opts, item.yMode);
    var el = tooltip();
    el.innerHTML = '';
    var name = document.createElement('strong');
    name.textContent = displayName(item.company, lang) + ' (' + (item.company.ticker || '—') + ')';
    el.appendChild(name);
    [
      labels.xAxis + ' ' + item.rs.toFixed(1),
      labels.position + ' ' + formatPct(item.yMode === 'bb' ? item.rawPosition : item.position, 1),
      labels.turnover + ' ' + formatTurnover(item.turnover, lang),
      labels.change + ' ' + formatPct(item.change, 2),
    ].forEach(function (text) {
      var line = document.createElement('div');
      line.textContent = text;
      el.appendChild(line);
    });
    el.style.display = 'block';
    moveTooltip(event);
  }

  function hideTooltip() {
    var el = document.getElementById('im-mm-tooltip');
    if (el) el.style.display = 'none';
  }

  function ensureModeTabs(container, opts) {
    var wrap = container.parentNode;
    if (!wrap) return;
    var labels = labelsFor(opts, selectedYMode);
    var tabs = wrap.querySelector('#mm-mode-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'mm-mode-tabs';
      tabs.className = 'mm-mode-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.addEventListener('click', function (event) {
        var button = event.target.closest('[data-mm-mode]');
        if (!button) return;
        var next = normalizeYMode(button.getAttribute('data-mm-mode'));
        if (next === selectedYMode) return;
        selectedYMode = next;
        if (lastOpts) render(lastOpts);
      });
    }
    tabs.setAttribute(
      'aria-label',
      opts.lang === 'en' ? 'Momentum vertical axis' : '모멘텀 세로축',
    );
    tabs.innerHTML = [
      { id: '50d', text: labels.mode50d },
      { id: 'bb', text: labels.modeBb },
    ]
      .map(function (mode) {
        return (
          '<button type="button" class="mm-mode-tab" role="tab" data-mm-mode="' +
          mode.id +
          '" aria-selected="' +
          (mode.id === selectedYMode ? 'true' : 'false') +
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
    var labels = labelsFor(opts, selectedYMode);
    el.className = 'im-mm-legend';
    el.innerHTML =
      '<div class="im-mm-legend-row"><span>' +
      labels.legend +
      '</span><span class="im-mm-gradient" aria-hidden="true"></span>' +
      '<span class="im-mm-size" aria-hidden="true"><i style="width:8px;height:8px"></i>' +
      '<i style="width:14px;height:14px"></i><i style="width:20px;height:20px"></i></span></div>';
  }

  function observeContainer(el) {
    if (typeof ResizeObserver !== 'undefined' && (observedEl !== el || !resizeObs)) {
      if (resizeObs) {
        try {
          resizeObs.disconnect();
        } catch (e) {}
      }
      observedEl = el;
      resizeObs = new ResizeObserver(function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          if (lastOpts) render(lastOpts);
        }, 50);
      });
      resizeObs.observe(el);
    }
    if (!visibilityBound) {
      visibilityBound = true;
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && lastOpts) requestAnimationFrame(function () { render(lastOpts); });
      });
      global.addEventListener('pageshow', function () {
        if (lastOpts) requestAnimationFrame(function () { render(lastOpts); });
      });
    }
  }

  function getUrlTicker() {
    try {
      return new URLSearchParams(window.location.search).get('ticker') || '';
    } catch (e) {
      return '';
    }
  }

  function applyTickerFocus(container, items, lang) {
    if (!container) return;
    var ticker = getUrlTicker();
    container.querySelectorAll('.im-mm-node.im-mm-focus').forEach(function (el) {
      el.classList.remove('im-mm-focus');
    });
    if (!ticker) return;
    var node = container.querySelector('.im-mm-node[data-ticker="' + ticker + '"]');
    if (!node) return;
    node.classList.add('im-mm-focus');
    var circle = node.querySelector('.im-mm-bubble');
    if (circle) {
      var r = parseFloat(circle.getAttribute('r')) || 10;
      circle.setAttribute('r', String(Math.max(r * 1.4, 18)));
    }
    if (!node.querySelector('text') && items && items.length) {
      var item = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].company && items[i].company.ticker === ticker) {
          item = items[i];
          break;
        }
      }
      if (item) {
        var label = bubbleLabelText(item.company, lang, Math.max(item.radius * 1.4, 18));
        d3.select(node)
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '.35em')
          .attr('fill', '#f0f3f6')
          .attr('stroke', 'rgba(0,0,0,.55)')
          .attr('stroke-width', 2)
          .style('paint-order', 'stroke')
          .attr('font-size', label.fontSize)
          .attr('font-weight', 700)
          .attr('pointer-events', 'none')
          .text(label.text);
      }
    }
    try {
      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch (e2) {
      node.scrollIntoView(true);
    }
  }

  function render(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    lastOpts = opts;
    injectStyles();
    observeContainer(container);
    ensureModeTabs(container, opts);
    renderLegend(opts.legend, opts);

    if (!container.style.minHeight) container.style.minHeight = '420px';
    var rect = container.getBoundingClientRect();
    var width = Math.floor(rect.width || container.clientWidth || 0);
    var height = Math.floor(rect.height || container.clientHeight || 0);
    if (width < 80 || height < 80) {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(opts); }, 100);
      return;
    }

    var items = (opts.companies || [])
      .map(function (company) { return datum(company, selectedYMode); })
      .filter(function (item) { return !!item; });
    container.innerHTML = '';
    hideTooltip();

    var labels = labelsFor(opts, selectedYMode);
    if (!items.length) {
      var empty = document.createElement('div');
      empty.style.cssText =
        'display:flex;align-items:center;justify-content:center;height:100%;padding:24px;' +
        'color:var(--text-muted,#8b949e);text-align:center';
      empty.textContent = labels.noData;
      container.appendChild(empty);
      return;
    }

    var mobile = global.matchMedia && global.matchMedia('(max-width:768px)').matches;
    var margin = mobile
      ? { top: 24, right: 18, bottom: 48, left: 50 }
      : { top: 28, right: 30, bottom: 54, left: 62 };
    var innerW = Math.max(1, width - margin.left - margin.right);
    var innerH = Math.max(1, height - margin.top - margin.bottom);
    var x = d3.scaleLinear().domain([0, 100]).range([0, innerW]);
    var y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);
    var maxTurnover = d3.max(items, function (item) { return item.turnover; }) || 1;
    var maxRadius = Math.max(12, Math.min(mobile ? 30 : 42, Math.sqrt((innerW * innerH) / items.length) * 0.3));
    var radius = d3.scaleSqrt().domain([0, maxTurnover]).range([7, maxRadius]);

    items.forEach(function (item) {
      item.radius = radius(item.turnover);
    });
    items.sort(function (a, b) {
      return b.radius - a.radius;
    });

    var svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'im-mm-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('role', 'img')
      .attr('aria-label', labels.xAxis + ' × ' + labels.yAxis);
    var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    [
      { text: labels.pullback, x: x(25), y: y(75) },
      { text: labels.leader, x: x(75), y: y(75) },
      { text: labels.lagging, x: x(25), y: y(25) },
      { text: labels.emerging, x: x(75), y: y(25) },
    ].forEach(function (label) {
      plot
        .append('text')
        .attr('x', label.x)
        .attr('y', label.y)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted,#8b949e)')
        .attr('opacity', 0.2)
        .attr('font-size', mobile ? 11 : 14)
        .attr('font-weight', 700)
        .text(label.text);
    });

    plot
      .append('line')
      .attr('x1', x(50))
      .attr('x2', x(50))
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'var(--text-muted,#8b949e)')
      .attr('stroke-dasharray', '4 5')
      .attr('opacity', 0.48);
    plot
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', y(50))
      .attr('y2', y(50))
      .attr('stroke', 'var(--text-muted,#8b949e)')
      .attr('stroke-dasharray', '4 5')
      .attr('opacity', 0.48);

    var tickCount = mobile ? 5 : 10;
    plot
      .append('g')
      .attr('transform', 'translate(0,' + innerH + ')')
      .call(d3.axisBottom(x).ticks(tickCount).tickSizeOuter(0))
      .call(function (g) {
        g.selectAll('text').attr('fill', 'var(--text-muted,#8b949e)');
        g.selectAll('line,path').attr('stroke', 'var(--border,#30363d)');
      });
    plot
      .append('g')
      .call(d3.axisLeft(y).ticks(tickCount).tickFormat(function (value) { return value + '%'; }).tickSizeOuter(0))
      .call(function (g) {
        g.selectAll('text').attr('fill', 'var(--text-muted,#8b949e)');
        g.selectAll('line,path').attr('stroke', 'var(--border,#30363d)');
      });
    svg
      .append('text')
      .attr('x', margin.left + innerW / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted,#8b949e)')
      .attr('font-size', 12)
      .text(labels.xAxis);
    svg
      .append('text')
      .attr('transform', 'translate(15,' + (margin.top + innerH / 2) + ') rotate(-90)')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted,#8b949e)')
      .attr('font-size', 12)
      .text(labels.yAxis);

    var nodes = plot
      .selectAll('g.im-mm-node')
      .data(items, function (item) { return item.company.ticker || item.company.name; })
      .join('g')
      .attr('class', 'im-mm-node')
      .attr('data-ticker', function (item) { return item.company.ticker || ''; })
      .attr('transform', function (item) {
        return 'translate(' + x(item.rs) + ',' + y(item.position) + ')';
      });
    nodes
      .append('circle')
      .attr('class', 'im-mm-bubble')
      .attr('r', function (item) { return item.radius; })
      .attr('fill', function (item) { return bubbleColor(item.change); })
      .attr('fill-opacity', 0.86)
      .attr('stroke', 'rgba(255,255,255,.38)')
      .attr('stroke-width', 1)
      .attr('tabindex', 0)
      .attr('aria-label', function (item) {
        return (
          displayName(item.company, opts.lang) +
          ', RS ' +
          item.rs.toFixed(1) +
          ', ' +
          labels.position +
          ' ' +
          formatPct(item.position, 1)
        );
      });
    nodes
      .filter(function (item) { return item.radius >= 14; })
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', '#f0f3f6')
      .attr('stroke', 'rgba(0,0,0,.55)')
      .attr('stroke-width', 2)
      .style('paint-order', 'stroke')
      .attr('font-size', function (item) {
        return bubbleLabelText(item.company, opts.lang, item.radius).fontSize;
      })
      .attr('font-weight', 700)
      .attr('pointer-events', 'none')
      .text(function (item) {
        return bubbleLabelText(item.company, opts.lang, item.radius).text;
      });

    nodes
      .on('mouseenter', function (event, item) { showTooltip(item, opts, event); })
      .on('mousemove', function (event) { moveTooltip(event); })
      .on('mouseleave', hideTooltip)
      .on('click', function (event, item) {
        hideTooltip();
        if (opts.onSelect) opts.onSelect(item.company);
      })
      .on('keydown', function (event, item) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (opts.onSelect) opts.onSelect(item.company);
      });

    applyTickerFocus(container, items, opts.lang || 'ko');
  }

  global.InvestingMapMomentum = {
    render: render,
    pricePosition: function (company, mode) {
      var value = pricePosition(company, mode);
      return value ? value.plot : null;
    },
    rawPosition: function (company, mode) {
      var value = pricePosition(company, mode);
      return value ? value.raw : null;
    },
    datum: datum,
    colorForChange: bubbleColor,
    setYMode: function (mode) {
      selectedYMode = normalizeYMode(mode);
      if (lastOpts) render(lastOpts);
    },
    getYMode: function () {
      return selectedYMode;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
