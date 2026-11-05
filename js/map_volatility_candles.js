(function (global) {
'use strict';
var lastOpts = null;
  var volatilityDays = 1;
  var volatilityCache = {};
  var volatilityQueue = [];
  var volatilityActive = 0;
  var viewMode = 'overview';
  var resizeObserver = null;
  var lastWidth = 0;
  var redrawTimer = null;
  var storedCacheLoaded = false;
  var refreshTimer = null;

  function queueRedraw() {
    if (redrawTimer) return;
    redrawTimer = setTimeout(function () {
      redrawTimer = null;
      if (lastOpts) drawVolatility(lastOpts);
    }, 60);
  }

  function restoreCandleCache() {
    if (storedCacheLoaded) return;
    storedCacheLoaded = true;
    try {
      var saved = JSON.parse(global.localStorage.getItem('im_volatility_bars_v1') || '{}');
      Object.keys(saved).forEach(function (code) {
        var entry = saved[code];
        if (/^[0-9A-Z]{6}$/.test(code) && Array.isArray(entry.bars) && entry.bars.length <= 21 && Date.now() - entry.time < 86400000) volatilityCache[code] = entry;
      });
    } catch (e) {}
  }

  function saveCandleCache() {
    try {
      var saved = {};
      Object.keys(volatilityCache).forEach(function (code) {
        var entry = volatilityCache[code];
        if (Array.isArray(entry.bars) && entry.bars.length && Date.now() - entry.time < 86400000) saved[code] = { bars: entry.bars, time: entry.time, status: entry.status };
      });
      global.localStorage.setItem('im_volatility_bars_v1', JSON.stringify(saved));
    } catch (e) {}
  }

  function candleRows(rows, width, mode) {
    if (!rows.length) return [];
    if (mode === 'overview') return [rows.slice()];
    var capacity = Math.max(1, Math.floor((width - 58) / 48));
    var groups = new Map();
    rows.forEach(function (row) {
      var company = row.company || row;
      var key = company.chain || '기타';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    var result = [];
    var current = [];
    groups.forEach(function (group) {
      if (current.length && current.length + group.length > capacity) {
        result.push(current); current = [];
      }
      // An oversized chain gets its own row and fits within the available width.
      current = current.concat(group);
    });
    if (current.length) result.push(current);
    return result;
  }

  // Aggregate trading sessions against the preceding close, on one shared % scale.
  function volatilityBar(bars, days) {
    var sorted = (bars || []).slice().sort(function (a, b) { return String(a.t).localeCompare(String(b.t)); });
    if (sorted.length < days + 1) return null;
    var sample = sorted.slice(-days);
    var base = Number(sorted[sorted.length - days - 1].c);
    if (!(base > 0) || sample.some(function (b) {
      return ![b.o, b.h, b.l, b.c].every(function (v) { return Number.isFinite(v) && v > 0; }) || b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c);
    })) return null;
    function pct(v) { return (v / base - 1) * 100; }
    return { o: pct(sample[0].o), h: pct(Math.max.apply(null, sample.map(function (b) { return b.h; }))),
      l: pct(Math.min.apply(null, sample.map(function (b) { return b.l; }))), c: pct(sample[sample.length - 1].c),
      start: sample[0].t, end: sample[sample.length - 1].t };
  }

  function pumpVolatility() {
    while (volatilityActive < 3 && volatilityQueue.length) {
      (function (codes) {
        volatilityActive++;
        function attempt(number) {
          var controller = new AbortController();
          var timeout = setTimeout(function () { controller.abort(); }, 20000);
          return fetch('/api/volatility_candles?codes=' + codes.slice().sort().join(','), { signal: controller.signal })
            .then(function (r) { if (!r.ok) throw new Error('OHLC'); return r.json(); })
            .then(function (data) {
              if (!data.tickers || codes.some(function (code) { return !data.tickers[code] || !Array.isArray(data.tickers[code].bars); })) throw new Error('Invalid OHLC');
              codes.forEach(function (code) { volatilityCache[code] = { bars: data.tickers[code].bars, status: data.tickers[code].status, time: Date.now() }; });
              saveCandleCache();
            })
            .catch(function (error) {
              if (number < 2) return new Promise(function (resolve) { setTimeout(resolve, (number + 1) * 1000); }).then(function () { return attempt(number + 1); });
              throw error;
            }).finally(function () { clearTimeout(timeout); });
        }
        attempt(0)
          .catch(function () {
            codes.forEach(function (code) {
              var previous = volatilityCache[code] || {};
              volatilityCache[code] = { bars: previous.bars || [], status: previous.status, time: previous.time || 0, failed: true, retryAfter: Date.now() + 30000 };
            });
          })
          .finally(function () {
            volatilityActive--;
            queueRedraw();
            pumpVolatility();
          });
      })(volatilityQueue.splice(0, 30));
    }
  }

  function volatilityMetrics(bar) {
    if (!bar) return null;
    // Convert normalized prices back to ratios; differences alone are % points.
    function change(from, to) { return ((100 + to) / (100 + from) - 1) * 100; }
    return [change(bar.l, bar.h), change(bar.o, bar.c), change(bar.o, bar.h), change(bar.l, bar.c)];
  }

  function metricLabels(en) {
    return en ? ['Low → High', 'Open → Close', 'Open → High', 'Low → Close'] : ['고가−저가', '시가→종가', '시가→고가', '저가→종가'];
  }

  function metricScales(rows) {
    var scales = [0, 0, 0, 0];
    rows.forEach(function (row) {
      var values = volatilityMetrics(row.bar);
      if (values) values.forEach(function (value, i) { scales[i] = Math.max(scales[i], Math.abs(value)); });
    });
    return scales.map(function (value) { return Math.max(1, Math.ceil(value)); });
  }

  function metricBarGeometry(value, extent, signed) {
    var size = Math.min(1, Math.abs(value) / Math.max(1, extent)) * (signed ? 50 : 100);
    return { left: signed ? value < 0 ? 50 - size : 50 : 0, width: size };
  }

  function appendMetrics(panel, rows, en) {
    var heading = document.createElement('h4'); heading.textContent = en ? 'Compare volatility by company' : '종목별 변동성 비교'; heading.style.cssText = 'margin:18px 0 6px;font-size:14px'; panel.appendChild(heading);
    var note = document.createElement('p'); note.style.cssText = 'font-size:11px;color:#94a3b8;line-height:1.7';
    note.textContent = en ? 'Selected period · Range = (High / Low − 1) × 100; other changes = (End / Start − 1) × 100. During trading, Close means latest price.' : '선택 기간 기준 · 고가−저가 = (고가 ÷ 저가 − 1) × 100 · 나머지는 (도착 가격 ÷ 시작 가격 − 1) × 100 · 장중 종가는 현재가입니다.';
    panel.appendChild(note);
    var legend = document.createElement('p'); legend.style.cssText = 'font-size:11px;color:#94a3b8;line-height:1.7'; legend.textContent = en ? 'Longer bar = larger change · Shared scale within each column · Open → Close: left = decline, right = rise · — = insufficient data' : '막대가 길수록 큰 변동 · 같은 열은 모든 종목에 동일한 눈금 · 시가→종가: 왼쪽 하락 / 오른쪽 상승 · —는 데이터 부족'; panel.appendChild(legend);
    var scales = metricScales(rows);
    var wrapper = document.createElement('div'); wrapper.style.cssText = 'overflow-x:auto'; panel.appendChild(wrapper);
    var table = document.createElement('table'); table.className = 'mm-metric-comparison'; table.style.cssText = 'width:100%;min-width:560px;table-layout:fixed;border-collapse:collapse;font-size:12px'; wrapper.appendChild(table);
    var head = table.createTHead().insertRow();
    [en ? 'Company / period' : '종목 / 기간'].concat(metricLabels(en)).forEach(function (label, index) {
      var th = document.createElement('th'); th.textContent = label; th.scope = 'col'; th.style.cssText = 'padding:10px 8px;text-align:left;white-space:nowrap;background:var(--surface,#101722)';
      if (index === 0) th.style.width = '28%';
      else { var scale = document.createElement('small'); scale.style.cssText = 'display:block;color:#94a3b8;font-weight:normal;margin-top:5px'; scale.textContent = index === 2 ? '−' + scales[index - 1] + '% / 0 / +' + scales[index - 1] + '%' : '0 ~ ' + scales[index - 1] + '%'; th.appendChild(scale); }
      head.appendChild(th);
    });
    var body = table.createTBody(), chain = null;
    rows.forEach(function (r) {
      var c = r.company, key = c.chain || (en ? 'Other' : '기타');
      if (chain !== key) { chain = key; var group = body.insertRow(); var th = document.createElement('th'); th.colSpan = 5; th.scope = 'rowgroup'; th.textContent = key; th.style.cssText = 'padding:12px 8px;text-align:left;background:var(--surface2,#1e293b);color:#a5b4fc'; group.appendChild(th); }
      var tr = body.insertRow(), name = document.createElement('th'); name.scope = 'row'; name.style.cssText = 'padding:10px 8px;text-align:left;border-bottom:1px solid var(--border,#334155)';
      name.textContent = (en && c.nameEn ? c.nameEn : c.name || c.nameKo || c.ticker) + ' (' + c.ticker + ')';
      if (r.bar) { var date = document.createElement('small'); date.style.cssText = 'display:block;color:#94a3b8;font-weight:normal'; date.textContent = r.bar.start + ' ~ ' + r.bar.end; name.appendChild(date); }
      tr.appendChild(name);
      var values = volatilityMetrics(r.bar);
      for (var i = 0; i < 4; i++) {
        var td = tr.insertCell(); td.style.cssText = 'padding:10px 8px;border-bottom:1px solid var(--border,#334155);font-variant-numeric:tabular-nums';
        if (!values) { td.textContent = '—'; continue; }
        var color = i === 1 ? values[i] > 0 ? '#22c55e' : values[i] < 0 ? '#ef4444' : '#94a3b8' : ['#818cf8', '', '#fbbf24', '#38bdf8'][i];
        var value = document.createElement('span'); value.textContent = (i === 1 && values[i] > 0 ? '+' : '') + values[i].toFixed(2) + '%'; value.style.cssText = 'display:block;text-align:right;margin-bottom:6px;color:' + color; td.appendChild(value);
        var track = document.createElement('div'); track.className = 'mm-metric-track'; track.setAttribute('aria-hidden', 'true'); track.style.cssText = 'position:relative;height:12px;background:var(--surface2,#1e293b);border-radius:3px;overflow:hidden'; td.appendChild(track);
        var geometry = metricBarGeometry(values[i], scales[i], i === 1);
        var fill = document.createElement('div'); fill.style.cssText = 'position:absolute;top:2px;height:8px;border-radius:2px;background:' + color + ';left:' + geometry.left + '%;width:' + geometry.width + '%'; track.appendChild(fill);
        var zero = document.createElement('div'); zero.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:#94a3b8;left:' + (i === 1 ? 50 : 0) + '%'; track.appendChild(zero);
      }
    });
  }

  function drawVolatility(opts) {
    var panel = document.getElementById('mm-volatility');
    if (!panel) return;
    restoreCandleCache();
    var en = opts.lang === 'en';
    var companies = [], seen = new Set();
    (opts.companies || []).forEach(function (c) {
      if (c.ticker && !seen.has(c.ticker)) { seen.add(c.ticker); companies.push(c); }
    });
    companies.sort(function (a, b) { return String(a.chain || '기타').localeCompare(String(b.chain || '기타'), 'ko'); });
    panel.replaceChildren();
    var title = document.createElement('h3'); title.textContent = en ? 'Volatility measurement' : '변동성 측정'; panel.appendChild(title);
    var filters = document.createElement('div'); filters.className = 'mm-mode-tabs'; panel.appendChild(filters);
    [1, 3, 5, 10, 20].forEach(function (days) {
      var button = document.createElement('button'); button.className = 'mm-mode-tab'; button.type = 'button';
      button.textContent = en ? days + 'D' : days === 1 ? '당일' : days + '일';
      button.setAttribute('aria-pressed', String(days === volatilityDays));
      button.onclick = function () { volatilityDays = days; drawVolatility(lastOpts || opts); };
      filters.appendChild(button);
    });
    var views = document.createElement('div'); views.className = 'mm-mode-tabs'; views.style.marginTop = '10px'; panel.appendChild(views);
    [{ id: 'overview', label: en ? 'Fit all' : '한눈에 보기' }, { id: 'readable', label: en ? 'Larger labels' : '종목명 크게 보기' }].forEach(function (mode) {
      var button = document.createElement('button'); button.className = 'mm-mode-tab'; button.type = 'button';
      button.textContent = mode.label; button.setAttribute('aria-pressed', String(mode.id === viewMode));
      button.onclick = function () { viewMode = mode.id; drawVolatility(lastOpts || opts); }; views.appendChild(button);
    });
    var note = document.createElement('p'); note.style.cssText = 'font-size:11px;color:#94a3b8;line-height:1.6';
    note.textContent = en ? 'Trading sessions · 0% = preceding close · Shared % scale · Hover or focus for details' : '거래일 기준 · 0% = 기간 시작 전 종가 · 모든 종목에 같은 % 축 적용 · 마우스를 올리거나 선택해 상세 확인'; panel.appendChild(note);
    var rows = companies.map(function (c) {
      var cached = volatilityCache[c.ticker];
      var expired = cached && Date.now() - cached.time > 30000;
      if (!cached || (!cached.pending && expired && (!cached.retryAfter || Date.now() >= cached.retryAfter))) {
        volatilityCache[c.ticker] = { bars: cached && cached.bars || [], status: cached && cached.status, pending: true, time: cached && cached.time || 0 };
        volatilityQueue.push(c.ticker);
      }
      return { company: c, bar: cached && volatilityBar(cached.bars, volatilityDays) };
    });
    var ready = rows.filter(function (r) { return r.bar; });
    var pending = rows.filter(function (r) { return volatilityCache[r.company.ticker].pending; }).length;
    var failed = rows.filter(function (r) { return volatilityCache[r.company.ticker].failed; }).length;
    var previous = rows.filter(function (r) { var cached = volatilityCache[r.company.ticker]; return r.bar && (cached.pending || cached.failed); }).length;
    var missing = rows.filter(function (r) { var cached = volatilityCache[r.company.ticker]; return !r.bar && !cached.pending && !cached.failed; }).length;
    var status = document.createElement('p'); status.style.cssText = 'font-size:11px;color:#94a3b8';
    status.textContent = (en ? 'Available ' : '표시 ') + ready.length + '/' + rows.length + (pending ? (en ? ' · Loading/retrying ' : ' · 불러오는 중·자동 재시도 ') + pending : '') + (failed ? (en ? ' · Connection failed ' : ' · 통신 실패 ') + failed : '') + (missing ? (en ? ' · History/OHLC insufficient ' : ' · 원본 일봉·기간 부족 ') + missing : '') + (previous ? (en ? ' · Showing saved data ' : ' · 이전 조회 데이터 표시 ') + previous : ''); panel.appendChild(status);
    if (!pending && (rows.length > ready.length || failed)) {
      var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'mm-mode-tab'; retry.textContent = en ? 'Retry missing data' : '누락 데이터 다시 불러오기';
      retry.onclick = function () { rows.forEach(function (r) { var cached = volatilityCache[r.company.ticker]; if (!r.bar || cached.failed) volatilityCache[r.company.ticker] = { bars: cached.bars || [], time: 0 }; }); drawVolatility(lastOpts || opts); }; panel.appendChild(retry);
    }
    var extent = Math.max(1, d3.max(ready, function (r) { return Math.max(Math.abs(r.bar.h), Math.abs(r.bar.l)); }) || 1) * 1.12;
    var width = Math.max(120, panel.clientWidth - 32 || 960);
    var bands = candleRows(rows, width, viewMode);
    var plotBottom = viewMode === 'overview' ? 290 : 200;
    var y = d3.scaleLinear().domain([-extent, extent]).nice().range([plotBottom, 22]);
    var detailBox = document.createElement('div'); detailBox.setAttribute('aria-live', 'polite');
    detailBox.style.cssText = 'min-height:36px;font-size:12px;line-height:1.6;padding:6px 0;white-space:pre-wrap;color:var(--text,#cbd5e1)';
    detailBox.textContent = en ? 'OHLC BAR: vertical = high/low · left tick = open · right tick = close. Hover for details.' : 'OHLC BAR: 세로선은 고가·저가, 왼쪽 눈금은 시가, 오른쪽 눈금은 종가입니다. 마우스를 올려 상세 정보를 확인하세요.';
    panel.appendChild(detailBox);
    bands.forEach(function (band) {
    var w = Math.max(60, width - 58);
    var step = w / Math.max(1, band.length);
    var bodyWidth = Math.max(1, Math.min(18, step * 0.55));
    var frame = document.createElement('div'); frame.className = 'mm-candle-row'; frame.style.cssText = 'display:flex;min-width:0;margin-bottom:12px'; panel.appendChild(frame);
    var height = plotBottom + 126;
    var axis = d3.select(frame).append('svg').attr('width', 58).attr('height', height).style('flex-shrink', 0);
    axis.append('g').attr('transform', 'translate(56,0)').call(d3.axisLeft(y).ticks(7).tickFormat(function (v) { return (v > 0 ? '+' : '') + v + '%'; }));
    var svg = d3.select(frame).append('svg').attr('viewBox', '0 0 ' + w + ' ' + height).attr('width', w).attr('height', height).style('min-width', 0).style('flex', '1').attr('role', 'img').attr('aria-label', title.textContent);
    y.ticks(7).forEach(function (v) { svg.append('line').attr('x2', w).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', v === 0 ? '#94a3b8' : '#283342').attr('stroke-dasharray', v === 0 ? '' : '3 4'); });
    var groupStart = 0;
    band.forEach(function (r, i) {
      var c = r.company, bar = r.bar, x = (i + 0.5) * step;
      if (i === 0 || c.chain !== band[i - 1].company.chain) {
        groupStart = i;
        svg.append('line').attr('x1', i * step).attr('x2', i * step).attr('y2', plotBottom + 110).attr('stroke', '#526173');
      }
      if (i === band.length - 1 || c.chain !== band[i + 1].company.chain) {
        var groupLabel = c.chain || (en ? 'Other' : '기타');
        var span = (i - groupStart + 1) * step;
        var maxChars = Math.max(1, Math.floor(span / 9));
        svg.append('text').attr('x', (groupStart + i + 1) * step / 2).attr('y', 14).attr('text-anchor', 'middle').attr('fill', '#a5b4fc').attr('font-size', 10).text(groupLabel.length > maxChars ? groupLabel.slice(0, Math.max(1, maxChars - 1)) + '…' : groupLabel).append('title').text(groupLabel);
      }
      var g = svg.append('g').attr('data-ticker', c.ticker).attr('tabindex', 0).attr('role', 'button').style('cursor', 'pointer');
      var name = en && c.nameEn ? c.nameEn : c.name || c.nameKo || c.ticker;
      var detail = name + ' (' + c.ticker + ')';
      if (bar) {
        var color = bar.c >= bar.o ? '#22c55e' : '#ef4444';
        g.append('line').attr('x1', x).attr('x2', x).attr('y1', y(bar.h)).attr('y2', y(bar.l)).attr('stroke', color).attr('stroke-width', 2);
        g.append('line').attr('class', 'ohlc-open').attr('x1', x - bodyWidth / 2).attr('x2', x).attr('y1', y(bar.o)).attr('y2', y(bar.o)).attr('stroke', color).attr('stroke-width', 2);
        g.append('line').attr('class', 'ohlc-close').attr('x1', x).attr('x2', x + bodyWidth / 2).attr('y1', y(bar.c)).attr('y2', y(bar.c)).attr('stroke', color).attr('stroke-width', 2);
        detail += '\n' + bar.start + ' ~ ' + bar.end + '\n' + (en ? ['Open', 'High', 'Low', 'Close'] : ['시가', '고가', '저가', '종가']).map(function (label, n) { return label + ': ' + [bar.o, bar.h, bar.l, bar.c][n].toFixed(2) + '%'; }).join('\n');
        detail += '\n' + volatilityMetrics(bar).map(function (value, n) { return metricLabels(en)[n] + ': ' + value.toFixed(2) + '%'; }).join('\n');
      } else {
        g.append('text').attr('x', x).attr('y', y(0) - 8).attr('fill', '#64748b').attr('text-anchor', 'middle').text('—');
      }
      g.attr('aria-label', detail).append('title').text(detail);
      g.append('rect').attr('x', i * step).attr('width', step).attr('y', 22).attr('height', plotBottom - 22).attr('fill', 'transparent');
      g.append('text').attr('transform', 'translate(' + (x - 2) + ',' + (plotBottom + 8) + ') rotate(90)').attr('fill', 'var(--text,#cbd5e1)').attr('font-size', Math.max(7, Math.min(10, step * 0.8))).text(name.length > 12 ? name.slice(0, 11) + '…' : name);
      function showDetail() { detailBox.textContent = (c.chain || '') + ' · ' + detail.replace(/\n/g, ' · '); }
      g.on('mouseenter', showDetail).on('focus', showDetail);
      function select() { if (opts.onSelect) opts.onSelect(c); }
      g.on('click', select).on('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    });
    });
    appendMetrics(panel, rows, en);
    pumpVolatility();
  }


function render(opts) {
  if (!opts || typeof d3 === 'undefined') return;
  lastOpts = opts;
  var panel = document.getElementById('mm-volatility');
  if (panel && !resizeObserver && global.ResizeObserver) {
    resizeObserver = new global.ResizeObserver(function () {
      var nextWidth = panel.clientWidth;
      if (nextWidth > 0 && Math.abs(nextWidth - lastWidth) > 1) {
        lastWidth = nextWidth; drawVolatility(lastOpts);
      }
    });
    resizeObserver.observe(panel);
  }
  if (!document.getElementById('mm-volatility-style')) {
    var style = document.createElement('style'); style.id = 'mm-volatility-style';
    style.textContent = "#mm-volatility{min-width:0;padding:16px;border:1px solid var(--border,#2b3645);border-radius:12px;background:var(--surface,#101722);color:var(--text,#cbd5e1)}#mm-volatility h3{margin:0 0 12px;font-size:16px}#mm-volatility .mm-mode-tabs{display:flex;flex-wrap:wrap;gap:8px}#mm-volatility .mm-mode-tab{padding:8px 16px;border:1px solid var(--border,#334155);border-radius:20px;background:var(--surface2,#1e293b);color:var(--text,#cbd5e1);cursor:pointer}#mm-volatility [aria-pressed=true]{background:#334155;color:#fff;border-color:#818cf8}"; document.head.appendChild(style);
  }
  drawVolatility(opts);
  if (!refreshTimer && global.setInterval) refreshTimer = global.setInterval(function () {
    var target = document.getElementById('mm-volatility');
    if (lastOpts && !document.hidden && target && target.getClientRects().length) drawVolatility(lastOpts);
  }, 35000);
}
global.InvestingMapVolatilityCandles = { render: render, _test: { volatilityBar: volatilityBar, candleRows: candleRows, volatilityMetrics: volatilityMetrics, metricScales: metricScales, metricBarGeometry: metricBarGeometry } };
})(typeof window !== 'undefined' ? window : globalThis);
