/** One stock, five calendar years aligned by month/day; original sector view stays intact. */
(function (global) {
  'use strict';
  var mode = 'sector', ticker = '', lastOpts = null, payload = null;
  var cache = {}, pending = {}, hiddenYears = new Set(), observer = null, observed = null, width = 0;
  var colors = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#fb7185'];
  var stockView = 'all', galleryObserver = null, galleryGeneration = 0, galleryQueue = [], galleryActive = 0;
  var galleryQuery = '';

  function requestData(opts, code) {
    if (cache[code] && Date.now() - cache[code].time < 300000) return Promise.resolve(cache[code].data);
    if (!pending[code]) {
      var prefix = opts.prefix || (global.location && global.location.origin) || '';
      pending[code] = fetch(prefix.replace(/\/$/, '') + '/api/ticker_perf_calendar?code=' + encodeURIComponent(code), { headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) { if (data.ticker !== code || !Array.isArray(data.years)) throw new Error('Invalid performance'); cache[code] = { data: data, time: Date.now() }; return data; })
        .finally(function () { delete pending[code]; });
    }
    return pending[code];
  }

  function pumpGallery() {
    while (galleryActive < 3 && galleryQueue.length) {
      var job = galleryQueue.shift();
      if (job.generation !== galleryGeneration || mode !== 'stock' || stockView !== 'all') continue;
      galleryActive++;
      (function (task) {
        requestData(task.opts, task.code).then(function (data) {
          if (task.generation === galleryGeneration && mode === 'stock' && stockView === 'all') draw(task.opts, data, task.card);
        }).catch(function () {
          if (task.generation !== galleryGeneration) return;
          var chart = task.card.querySelector('.perf-stock-chart'); chart.replaceChildren();
          button(chart, task.opts.lang === 'en' ? 'Retry' : '다시 불러오기', function () { galleryQueue.push(task); pumpGallery(); });
        }).finally(function () { galleryActive--; pumpGallery(); });
      })(job);
    }
  }

  function renderGallery(opts, members, panel) {
    var gallery = panel.querySelector('.perf-stock-gallery'), en = opts.lang === 'en';
    if (galleryObserver) galleryObserver.disconnect();
    galleryGeneration++; galleryQueue = []; gallery.replaceChildren();
    var generation = galleryGeneration;
    var controls = document.createElement('div'); controls.className = 'perf-year-tabs'; gallery.appendChild(controls);
    var currentYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
    for (var i = 0; i < 5; i++) {
      (function (year, color) {
        var toggle = button(controls, String(year), function () {
          if (hiddenYears.has(year)) hiddenYears.delete(year); else hiddenYears.add(year);
          toggle.setAttribute('aria-pressed', String(!hiddenYears.has(year))); toggle.style.opacity = hiddenYears.has(year) ? '.4' : '1';
          gallery.querySelectorAll('.perf-stock-card').forEach(function (card) { var hit = cache[card.getAttribute('data-ticker')]; if (hit) draw(lastOpts, hit.data, card); });
        });
        toggle.style.color = color; toggle.style.borderColor = color;
        toggle.setAttribute('aria-pressed', String(!hiddenYears.has(year))); toggle.style.opacity = hiddenYears.has(year) ? '.4' : '1';
      })(currentYear - i, colors[i]);
    }
    var search = document.createElement('input'); search.type = 'search'; search.className = 'perf-stock-select'; search.placeholder = en ? 'Search name or ticker' : '종목명·티커 검색'; search.setAttribute('aria-label', search.placeholder); gallery.appendChild(search);
    var note = document.createElement('p'); note.className = 'perfcalendar-meta'; note.textContent = en ? 'Shared year colors · Each card scales its own Y axis · Charts load as you scroll · Click a company name to expand' : '연도별 색상 공통 · 카드별 세로축 자동 조정 · 스크롤 위치의 차트부터 불러옵니다 · 종목명을 누르면 크게 보기'; gallery.appendChild(note);
    var count = document.createElement('p'); count.className = 'perfcalendar-meta'; count.setAttribute('aria-live', 'polite'); gallery.appendChild(count);
    var groups = document.createElement('div'); groups.className = 'perf-stock-groups'; gallery.appendChild(groups);
    var chainGroups = new Map();
    function enqueue(card) {
      if (card.getAttribute('data-requested') || card.hidden) return;
      card.setAttribute('data-requested', 'true');
      var code = card.getAttribute('data-ticker');
      if (cache[code] && Date.now() - cache[code].time < 300000) { draw(opts, cache[code].data, card); return; }
      galleryQueue.push({ opts: opts, code: code, card: card, generation: generation }); pumpGallery();
    }
    if (global.IntersectionObserver) galleryObserver = new global.IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) enqueue(entry.target); }); }, { rootMargin: '250px' });
    members.forEach(function (company) {
      var chain = company.chain || '기타';
      var group = chainGroups.get(chain);
      if (!group) {
        var section = document.createElement('section'); section.className = 'perf-stock-chain'; section.setAttribute('data-chain', chain);
        var chainHeading = document.createElement('h3'); chainHeading.className = 'perf-stock-chain-title';
        var chainName = document.createElement('span'); chainName.textContent = en ? company.chainEn || (chain === '기타' ? 'Other' : chain) : chain; chainHeading.appendChild(chainName);
        var chainCount = document.createElement('span'); chainCount.className = 'perf-stock-chain-count'; chainHeading.appendChild(chainCount); section.appendChild(chainHeading);
        var grid = document.createElement('div'); grid.className = 'perf-stock-grid'; section.appendChild(grid); groups.appendChild(section);
        group = { section: section, grid: grid, count: chainCount }; chainGroups.set(chain, group);
      }
      var card = document.createElement('article'); card.className = 'perf-stock-card'; card.setAttribute('data-ticker', company.ticker);
      var name = en && company.nameEn ? company.nameEn : company.name || company.nameKo || company.ticker;
      card.setAttribute('data-search', (name + ' ' + company.name + ' ' + company.nameEn + ' ' + company.ticker + ' ' + chain + ' ' + (company.chainEn || '')).toLowerCase());
      var heading = document.createElement('h4'); heading.className = 'perf-stock-card-title'; card.appendChild(heading);
      var open = button(heading, name + ' (' + company.ticker + ')', function () { ticker = company.ticker; stockView = 'single'; payload = null; global.InvestingMapPerfCalendar.render(lastOpts); }); open.title = en ? 'Expand chart' : '크게 보기';
      var chart = document.createElement('div'); chart.className = 'perf-stock-chart'; chart.textContent = en ? 'Waiting to load…' : '불러오기 대기…'; card.appendChild(chart);
      ['perf-stock-legend perf-year-tabs', 'perf-stock-note perfcalendar-meta', 'perf-stock-detail perfcalendar-meta'].forEach(function (className) { var el = document.createElement('div'); el.className = className; card.appendChild(el); });
      group.grid.appendChild(card);
      if (galleryObserver && global.IntersectionObserver) galleryObserver.observe(card); else enqueue(card);
    });
    search.oninput = function () {
      var query = search.value.trim().toLowerCase(), visible = 0;
      galleryQuery = search.value;
      groups.querySelectorAll('.perf-stock-card').forEach(function (card) { card.hidden = !!query && card.getAttribute('data-search').indexOf(query) < 0; if (!card.hidden) { visible++; if (!global.IntersectionObserver) enqueue(card); } });
      chainGroups.forEach(function (group) {
        var count = Array.from(group.grid.querySelectorAll('.perf-stock-card')).filter(function (card) { return !card.hidden; }).length;
        group.section.hidden = count === 0;
        group.count.textContent = en ? ' · ' + count + ' stocks' : ' · ' + count + '종목';
      });
      count.textContent = (en ? 'Stocks ' : '종목 ') + visible + '/' + members.length;
    };
    search.value = galleryQuery;
    search.oninput();
    if (!document.getElementById('perf-stock-chain-style')) {
      var style = document.createElement('style'); style.id = 'perf-stock-chain-style';
      style.textContent = '.perf-stock-chain{margin-top:24px}.perf-stock-chain-title{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid var(--border,#30363d);font-size:15px;color:var(--text,#e6edf3)}.perf-stock-chain-count{font-size:12px;font-weight:400;color:var(--text-muted,#8b949e)}.perf-stock-chain .perf-stock-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));margin-top:0}.perf-stock-card .perf-stock-card-title{margin:0 0 8px}.perf-stock-card .perf-stock-card-title button{border:0;background:none;color:var(--text,#e6edf3);font-size:13px;padding:0;text-align:left}';
      document.head.appendChild(style);
    }
  }

  function alignedDay(raw) {
    var parts = String(raw || '').split('-');
    if (parts.length !== 3) return null;
    var date = new Date(2000, Number(parts[1]) - 1, Number(parts[2]));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function yearSeries(data) {
    return (data && data.years || []).map(function (line, index) {
      return { year: line.year, color: colors[index % colors.length], baseDate: line.baseDate, baseMode: line.baseMode,
        points: (line.points || []).filter(function (p) { return Number.isFinite(p.v) && alignedDay(p.t); }).map(function (p) { return { date: alignedDay(p.t), rawDate: p.t, value: p.v - 100 }; }) };
    });
  }

  function button(parent, text, action) {
    var el = document.createElement('button'); el.type = 'button'; el.className = 'perf-year-tab'; el.textContent = text;
    el.onclick = action; parent.appendChild(el); return el;
  }

  function draw(opts, data, card) {
    if (mode !== 'stock' || !data || (!card && data.ticker !== ticker) || !global.d3) return;
    var panel = card || document.getElementById('perf-stock-years');
    if (!panel) return;
    var en = opts.lang === 'en';
    var chart = panel.querySelector('.perf-stock-chart'), legend = panel.querySelector('.perf-stock-legend');
    chart.replaceChildren(); legend.replaceChildren();
    var all = yearSeries(data), lines = all.filter(function (line) { return line.points.length && !hiddenYears.has(line.year); });
    all.forEach(function (line) {
      if (card) {
        var label = document.createElement('span'); label.style.color = line.color; label.style.fontSize = '10px';
        label.textContent = line.year + ': ' + (line.points.length ? line.points[line.points.length - 1].value.toFixed(1) + '%' : '—'); label.style.opacity = hiddenYears.has(line.year) ? '.4' : '1'; legend.appendChild(label); return;
      }
      var toggle = button(legend, line.year + (line.points.length ? ' · ' + line.points[line.points.length - 1].value.toFixed(1) + '%' : (en ? ' · No data' : ' · 데이터 없음')), function () {
        if (hiddenYears.has(line.year)) hiddenYears.delete(line.year); else hiddenYears.add(line.year);
        draw(lastOpts, payload);
      });
      toggle.style.borderColor = line.color;
      toggle.style.color = line.color;
      toggle.setAttribute('aria-pressed', String(!hiddenYears.has(line.year) && !!line.points.length));
      toggle.disabled = !line.points.length;
      toggle.style.opacity = hiddenYears.has(line.year) || !line.points.length ? '0.45' : '1';
      toggle.title = line.baseDate ? (en ? 'Base: ' : '기준일: ') + line.baseDate + (line.baseMode === 'first_available' ? (en ? ' (first available close)' : ' (전년말 데이터 없어 첫 제공 종가 기준)') : '') : '';
    });
    if (!lines.length) { chart.textContent = all.some(function (line) { return line.points.length; }) ? (en ? 'Select a year with data.' : '데이터가 있는 연도를 선택해주세요.') : (en ? 'No historical data for these years.' : '해당 연도의 이력이 없습니다.'); return; }
    var w = Math.max(260, chart.clientWidth || (card ? 400 : 900)), h = card ? 230 : 420;
    var margin = { left: card ? 48 : 62, right: 20, top: 18, bottom: 35 }, iw = w - margin.left - margin.right, ih = h - 53;
    var points = lines.flatMap(function (line) { return line.points; });
    var extent = d3.extent(points.concat([{ value: 0 }]), function (p) { return p.value; });
    var pad = Math.max(2, (extent[1] - extent[0]) * 0.08);
    var x = d3.scaleTime().domain([new Date(2000, 0, 1), new Date(2000, 11, 31)]).range([0, iw]);
    var y = d3.scaleLinear().domain([extent[0] - pad, extent[1] + pad]).nice().range([ih, 0]);
    var svg = d3.select(chart).append('svg').attr('viewBox', '0 0 ' + w + ' ' + h).attr('role', 'img').attr('aria-label', en ? 'Annual return curves by year' : '종목별 연도 수익률 비교');
    var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    plot.append('g').attr('class', 'perf-grid').call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(''));
    plot.append('line').attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--text-muted,#8b949e)').attr('stroke-dasharray', '4 4');
    plot.append('g').attr('class', 'perf-axis').call(d3.axisLeft(y).ticks(6).tickFormat(function (v) { return (v > 0 ? '+' : '') + v.toFixed(0) + '%'; }));
    plot.append('g').attr('class', 'perf-axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).tickValues((card ? [0, 3, 6, 9, 11] : Array.from({ length: 12 }, function (_, i) { return i; })).map(function (i) { return new Date(2000, i, 1); })).tickFormat(function (d) { return en ? d3.timeFormat('%b')(d) : d.getMonth() + 1 + '월'; }));
    var line = d3.line().x(function (p) { return x(p.date); }).y(function (p) { return y(p.value); });
    lines.forEach(function (series) {
      plot.append('path').datum(series.points).attr('class', 'perf-stock-year-line').attr('data-year', series.year).attr('d', line).attr('fill', 'none').attr('stroke', series.color).attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke');
      var end = series.points[series.points.length - 1];
      plot.append('circle').attr('cx', x(end.date)).attr('cy', y(end.value)).attr('r', 3).attr('fill', series.color).append('title').text(series.year + ' · ' + end.rawDate + ' · ' + end.value.toFixed(2) + '%');
    });
    var crosshair = plot.append('line').attr('y2', ih).attr('stroke', '#8b949e').attr('stroke-dasharray', '3 3').style('display', 'none');
    var detail = panel.querySelector('.perf-stock-detail');
    plot.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent').on('pointermove', function (event) {
      var px = Math.max(0, Math.min(iw, d3.pointer(event, this)[0]));
      var day = x.invert(px);
      crosshair.attr('x1', px).attr('x2', px).style('display', null);
      detail.textContent = lines.map(function (series) {
        // Do not carry this year's latest return into future months.
        if (day > series.points[series.points.length - 1].date) return series.year + ': —';
        var index = d3.bisector(function (p) { return p.date; }).left(series.points, day);
        var after = series.points[index], before = series.points[index - 1];
        var point = !before ? after : !after ? before : day - before.date < after.date - day ? before : after;
        return series.year + ': ' + point.value.toFixed(2) + '% (' + point.rawDate + ')';
      }).join(' · ');
    }).on('pointerleave', function () { crosshair.style('display', 'none'); });
    var fallbacks = all.filter(function (line) { return line.points.length && line.baseMode === 'first_available'; }).map(function (line) { return line.year + ': ' + line.baseDate; });
    panel.querySelector('.perf-stock-note').textContent = (en ? '0% = prior year-end close · This year ends at the latest available date · ' : '0% = 전년말 종가 · 올해는 최신 제공일까지 표시 · ') + (data.asOf || '') + (fallbacks.length ? (en ? ' · First available close used: ' : ' · 전년말 데이터 없어 첫 제공 종가 기준: ') + fallbacks.join(', ') : '');
  }

  function load(opts) {
    var code = ticker;
    if (!code) return;
    var key = code;
    var panel = document.getElementById('perf-stock-years');
    var chart = panel.querySelector('.perf-stock-chart');
    if (cache[key] && Date.now() - cache[key].time < 300000) { payload = cache[key].data; draw(opts, payload); return; }
    chart.textContent = opts.lang === 'en' ? 'Loading annual performance…' : '연도별 퍼포먼스를 불러오는 중…';
    requestData(opts, code).then(function (data) { if (mode === 'stock' && code === ticker) { payload = data; draw(lastOpts, data); } }).catch(function () {
      if (mode !== 'stock' || code !== ticker) return;
      chart.replaceChildren();
      var error = document.createElement('p'); error.textContent = opts.lang === 'en' ? 'Could not load annual performance.' : '연도별 데이터를 불러오지 못했습니다.'; chart.appendChild(error);
      button(chart, opts.lang === 'en' ? 'Retry' : '다시 불러오기', function () { load(lastOpts); });
    });
  }

  function mount(opts) {
    lastOpts = opts;
    var wrap = opts.container.parentNode, en = opts.lang === 'en';
    var modes = wrap.querySelector('#perf-comparison-modes');
    if (!modes) { modes = document.createElement('div'); modes.id = 'perf-comparison-modes'; modes.className = 'perf-year-tabs'; wrap.insertBefore(modes, wrap.firstChild); }
    modes.replaceChildren();
    [{ key: 'sector', text: en ? 'Compare stocks in a year' : '연도별 종목 비교' }, { key: 'stock', text: en ? 'Compare years for a stock' : '종목별 연도 비교' }].forEach(function (item) {
      var toggle = button(modes, item.text, function () { mode = item.key; global.InvestingMapPerfCalendar.render(lastOpts); });
      toggle.setAttribute('aria-selected', String(mode === item.key));
    });
    var panel = wrap.querySelector('#perf-stock-years');
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'perf-stock-years';
      panel.innerHTML = '<div class="perf-stock-views perf-year-tabs"></div><div class="perf-stock-single"><label class="perf-stock-label"></label><select class="perf-stock-select"></select><p class="perf-stock-note perfcalendar-meta"></p><div class="perf-stock-chart"></div><div class="perf-stock-legend perf-year-tabs"></div><p class="perf-stock-detail perfcalendar-meta" aria-live="polite"></p></div><section class="perf-stock-gallery"></section>';
      var select = panel.querySelector('select'); select.id = 'perf-stock-ticker'; panel.querySelector('label').htmlFor = select.id;
      select.onchange = function () { ticker = select.value; payload = null; hiddenYears.clear(); panel.querySelector('.perf-stock-legend').replaceChildren(); panel.querySelector('.perf-stock-note').textContent = ''; panel.querySelector('.perf-stock-detail').textContent = ''; load(lastOpts); };
      wrap.appendChild(panel);
      var style = document.createElement('style'); style.textContent = '#perf-stock-years{min-width:0}#perf-stock-years[hidden]{display:none}.perf-stock-label{display:block;margin:8px 0;font-size:13px;color:var(--text)}.perf-stock-select{width:min(100%,420px);padding:9px 12px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font-size:14px}.perf-stock-chart{margin:12px 0;min-height:420px;background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:10px}.perf-stock-chart svg{display:block;width:100%;height:420px}.perf-stock-detail{min-height:40px;line-height:1.6}.perf-stock-legend{margin-top:10px}'; document.head.appendChild(style);
    }
    if (!document.getElementById('perf-stock-gallery-style')) {
      var galleryStyle = document.createElement('style'); galleryStyle.id = 'perf-stock-gallery-style'; galleryStyle.textContent = '#perf-stock-years [hidden]{display:none!important}.perf-stock-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px;margin-top:14px}.perf-stock-card{min-width:0;padding:12px;border:1px solid var(--border,#30363d);border-radius:10px;background:var(--surface,#161b22)}.perf-stock-card h3{margin:0 0 8px}.perf-stock-card h3 button{border:0;background:none;color:var(--text,#e6edf3);font-size:13px;padding:0;text-align:left}.perf-stock-card .perf-stock-chart{min-height:230px;border:0;margin:6px 0}.perf-stock-card .perf-stock-chart svg{height:230px}.perf-stock-card .perf-stock-note{font-size:10px;line-height:1.5}.perf-stock-card .perf-stock-detail{font-size:10px;min-height:30px;line-height:1.4}.perf-stock-card .perf-stock-legend{gap:6px;margin:6px 0}'; document.head.appendChild(galleryStyle);
    }
    panel.hidden = mode !== 'stock';
    var views = panel.querySelector('.perf-stock-views'); views.replaceChildren();
    [{ key: 'all', text: en ? 'All stocks' : '전체 종목 한 번에 보기' }, { key: 'single', text: en ? 'Single stock' : '종목 하나 크게 보기' }].forEach(function (item) {
      var toggle = button(views, item.text, function () { stockView = item.key; global.InvestingMapPerfCalendar.render(lastOpts); }); toggle.setAttribute('aria-selected', String(stockView === item.key));
    });
    panel.querySelector('.perf-stock-single').hidden = stockView !== 'single'; panel.querySelector('.perf-stock-gallery').hidden = stockView !== 'all';
    opts.container.style.display = mode === 'stock' ? 'none' : '';
    if (opts.legend) opts.legend.style.display = mode === 'stock' ? 'none' : '';
    var search = wrap.querySelector('.perf-tab-search-row'); if (search) search.style.display = mode === 'stock' ? 'none' : '';
    if (mode !== 'stock') { if (galleryObserver) galleryObserver.disconnect(); galleryGeneration++; galleryQueue = []; return false; }
    var hint = wrap.querySelector('#perfcalendar-hint'); if (hint) hint.textContent = stockView === 'all' ? (en ? 'All sector stocks · compare five annual curves per card' : '섹터 내 모든 종목의 최근 5개 연도 수익률을 카드별로 비교') : (en ? 'One stock · annual curves aligned from January to December' : '종목 하나의 최근 5개 연도 수익률을 1~12월 축에서 비교');
    var members = (opts.companies || []).filter(function (c) { return c.ticker; });
    var selected = panel.querySelector('select'); selected.replaceChildren();
    members.forEach(function (c) { var option = document.createElement('option'); option.value = c.ticker; option.textContent = (en && c.nameEn ? c.nameEn : c.name || c.nameKo || c.ticker) + ' (' + c.ticker + ')'; selected.appendChild(option); });
    if (!members.some(function (c) { return c.ticker === ticker; })) ticker = members[0] && members[0].ticker || '';
    selected.querySelectorAll('option').forEach(function (option) { option.selected = option.value === ticker; }); panel.querySelector('label').textContent = en ? 'Select a stock' : '종목 선택';
    if (!members.length) { panel.querySelector('.perf-stock-chart').textContent = en ? 'No stocks in this sector.' : '이 섹터에 표시할 종목이 없습니다.'; return true; }
    if (stockView === 'all') { renderGallery(opts, members, panel); return true; }
    if (galleryObserver) galleryObserver.disconnect(); galleryGeneration++; galleryQueue = [];
    if (global.ResizeObserver && observed !== panel) {
      if (observer) observer.disconnect(); observed = panel;
      observer = new global.ResizeObserver(function () { if (mode === 'stock' && panel.clientWidth && panel.clientWidth !== width) { width = panel.clientWidth; draw(lastOpts, payload); } }); observer.observe(panel);
    }
    load(opts); return true;
  }
  global.InvestingMapPerfCalendarYears = { mount: mount, _test: { alignedDay: alignedDay, yearSeries: yearSeries } };
})(typeof window !== 'undefined' ? window : globalThis);
