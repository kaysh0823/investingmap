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
    var title = document.createElement('h3'); title.textContent = en ? 'Volatility candles' : '변동성 캔들'; panel.appendChild(title);
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
      var expired = cached && Date.now() - cached.time > (cached.status && cached.status !== 'ok' ? 30000 : 300000);
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
    detailBox.textContent = en ? 'Hover a candle to see its company and OHLC.' : '캔들 위에 마우스를 올리면 종목명과 시가·고가·저가·종가를 확인할 수 있습니다.';
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
        var color = bar.c >= bar.o ? '#ef5350' : '#4c9aff';
        g.append('line').attr('x1', x).attr('x2', x).attr('y1', y(bar.h)).attr('y2', y(bar.l)).attr('stroke', color).attr('stroke-width', 2);
        g.append('rect').attr('x', x - bodyWidth / 2).attr('width', bodyWidth).attr('y', Math.min(y(bar.o), y(bar.c))).attr('height', Math.max(2, Math.abs(y(bar.o) - y(bar.c)))).attr('fill', color);
        detail += '\n' + bar.start + ' ~ ' + bar.end + '\n' + (en ? ['Open', 'High', 'Low', 'Close'] : ['시가', '고가', '저가', '종가']).map(function (label, n) { return label + ': ' + [bar.o, bar.h, bar.l, bar.c][n].toFixed(2) + '%'; }).join('\n');
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
}
global.InvestingMapVolatilityCandles = { render: render, _test: { volatilityBar: volatilityBar, candleRows: candleRows } };
})(typeof window !== 'undefined' ? window : globalThis);
