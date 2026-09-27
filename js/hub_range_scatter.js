/**
 * Hub scatter: 5-day high-low range (X) × log market cap (Y).
 * Universe = hub_index companies present in hub_volatility_snapshot.
 * Highlight = turnover5d Top20, gainers5d Top20, RS Top20 (existing fetches).
 */
(function (global) {
  'use strict';

  var X_MAX = 0.5;
  var X_TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  var Y_TICKS = [1e11, 1e12, 1e13, 1e14, 1e15];
  var COLOR = {
    other: '#58a6ff',
    turnover5d: '#f85149',
    gain5d: '#f0883e',
    rs: '#3fb950',
    multi: '#a371f7',
  };
  var STORE_KEY = 'im.hub.scatter.groups';
  var STYLE_ID = 'im-hub-range-scatter-css';

  var state = {
    lang: 'ko',
    hub: null,
    vol: null,
    points: [],
    total: 0,
    shown: 0,
    recentDd: '',
    turnover5d: [],
    gainers5d: [],
    rsTop20: [],
    groups: { turnover5d: true, gain5d: true, rs: true, other: true },
    searchQ: '',
    tabSearchCtrl: null,
    resizeObs: null,
    ready: false,
  };

  var COPY = {
    ko: {
      title: '5일 변동폭 × 시가총액',
      basis: function (dd) {
        return '기준 ' + dd + ' 종가 · 5거래일 고저 레인지 ÷ 종가';
      },
      coverage: function (n, m) {
        return '표시 ' + n + ' / 전체 ' + m;
      },
      legendTurnover: '5일 거래대금 Top20',
      legendGain: '5일 상승률 Top20',
      legendRs: 'RS Top20',
      legendMulti: '복수 그룹',
      legendOther: '기타',
      tipRsRank: function (n) {
        return n + '위';
      },
      overflowTitle: '5일 레인지 50% 초과',
      xAxis: '5일 레인지',
      yAxis: '시가총액',
      tipRange: '5일 레인지',
      tipMcap: '시가총액',
      tipRet: '5일 수익률',
      tipTurnover: '5일 거래대금',
      tipGroup: '그룹',
      yTicks: { 1e11: '1천억', 1e12: '1조', 1e13: '10조', 1e14: '100조', 1e15: '1,000조' },
      loading: '불러오는 중…',
      failed: '산점도 데이터를 불러오지 못했습니다.',
    },
    en: {
      title: '5-day range × Market cap',
      basis: function (dd) {
        return 'As of ' + dd + ' close · 5-session high−low range ÷ close';
      },
      coverage: function (n, m) {
        return 'Showing ' + n + ' / ' + m;
      },
      legendTurnover: '5D turnover Top 20',
      legendGain: '5D gainers Top 20',
      legendRs: 'RS Top 20',
      legendMulti: 'Multiple groups',
      legendOther: 'Other',
      tipRsRank: function (n) {
        return '#' + n;
      },
      overflowTitle: '5-day range above 50%',
      xAxis: '5-day range',
      yAxis: 'Market cap',
      tipRange: '5D range',
      tipMcap: 'Market cap',
      tipRet: '5D return',
      tipTurnover: '5D turnover',
      tipGroup: 'Group',
      yTicks: { 1e11: '100B', 1e12: '1T', 1e13: '10T', 1e14: '100T', 1e15: '1,000T' },
      loading: 'Loading…',
      failed: 'Could not load scatter data.',
    },
  };

  function labels() {
    return COPY[state.lang] || COPY.ko;
  }

  function percentile(values, p) {
    var arr = [];
    (values || []).forEach(function (v) {
      if (v != null && isFinite(v)) arr.push(Number(v));
    });
    arr.sort(function (a, b) {
      return a - b;
    });
    if (!arr.length) return null;
    if (arr.length === 1) return arr[0];
    var idx = (arr.length - 1) * p;
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    var w = idx - lo;
    return arr[lo] * (1 - w) + arr[hi] * w;
  }

  /** @returns {{ x: number, overflow: boolean }} */
  function clampX(v) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return { x: 0, overflow: false };
    if (n > X_MAX) return { x: X_MAX, overflow: true };
    return { x: n, overflow: false };
  }

  function membershipOf(ticker, turnoverSet, gainSet, rsSet) {
    var groups = [];
    var id = String(ticker);
    if (turnoverSet && turnoverSet.has(id)) groups.push('turnover5d');
    if (gainSet && gainSet.has(id)) groups.push('gain5d');
    if (rsSet && rsSet.has(id)) groups.push('rs');
    return groups;
  }

  /** Display bucket after chip filters. multi | turnover5d | gain5d | rs | other */
  function displayKind(groups, filters) {
    filters = filters || {};
    var on = [];
    (groups || []).forEach(function (g) {
      if (filters[g] !== false) on.push(g);
    });
    if (!on.length) return 'other';
    if (on.length === 1) return on[0];
    return 'multi';
  }

  function loadGroupFilters() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      ['turnover5d', 'gain5d', 'rs', 'other'].forEach(function (k) {
        if (saved && typeof saved[k] === 'boolean') state.groups[k] = saved[k];
      });
    } catch (e) {}
  }

  function saveGroupFilters() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          turnover5d: state.groups.turnover5d !== false,
          gain5d: state.groups.gain5d !== false,
          rs: state.groups.rs !== false,
          other: state.groups.other !== false,
        }),
      );
    } catch (e) {}
  }

  function staggerPercentileLabels(entries) {
    var last = -1e9;
    var level = 0;
    return (entries || []).map(function (e) {
      var px = Number(e.px);
      if (px - last < 28) level = (level + 1) % 3;
      else level = 0;
      last = px;
      return { px: px, label: e.label, dy: [0, 12, 24][level] };
    });
  }

  function formatDashDd(raw) {
    var s = String(raw || '').replace(/\D/g, '');
    if (s.length === 8) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return String(raw || '');
  }

  function formatPct1(frac) {
    if (frac == null || !isFinite(frac)) return '—';
    return (frac * 100).toFixed(1) + '%';
  }

  function formatSignedPct(n) {
    if (n == null || !isFinite(n)) return '';
    var sign = n > 0 ? '+' : '';
    return sign + Number(n).toFixed(2) + '%';
  }

  function formatMcapKo(won) {
    if (won == null || !isFinite(won) || won <= 0) return '—';
    if (won >= 1e12) return (won / 1e12).toFixed(2) + '조';
    return Math.round(won / 1e8).toLocaleString('ko-KR') + '억';
  }

  function formatMcapEn(won) {
    if (won == null || !isFinite(won) || won <= 0) return '—';
    if (won >= 1e12) return (won / 1e12).toFixed(2) + 'T';
    if (won >= 1e8) return (won / 1e8).toFixed(0) + '억';
    return String(Math.round(won));
  }

  function formatMcap(won) {
    return state.lang === 'en' ? formatMcapEn(won) : formatMcapKo(won);
  }

  function formatTurnover(won) {
    if (won == null || !isFinite(won) || won <= 0) return '';
    if (state.lang === 'en') {
      if (won >= 1e12) return (won / 1e12).toFixed(2) + 'T';
      return (won / 1e8).toFixed(0) + '억';
    }
    if (won >= 1e12) return (won / 1e12).toFixed(2) + '조원';
    return Math.round(won / 1e8).toLocaleString('ko-KR') + '억원';
  }

  function yTickLabel(v) {
    var map = labels().yTicks;
    if (map[v]) return map[v];
    return String(v);
  }

  function tickerSet(rows) {
    var set = new Set();
    (rows || []).forEach(function (r) {
      if (r && r.ticker != null) set.add(String(r.ticker).trim());
    });
    return set;
  }

  function rowByTicker(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (r && r.ticker != null) map[String(r.ticker).trim()] = r;
    });
    return map;
  }

  function listHubCompanies(hub) {
    var out = [];
    var sectors = (hub && hub.sectors) || {};
    Object.keys(sectors).forEach(function (sid) {
      var block = sectors[sid];
      var meta = (block && block.meta) || {};
      (block && block.companies ? block.companies : []).forEach(function (c) {
        if (!c || c.ticker == null) return;
        out.push({
          ticker: String(c.ticker).trim(),
          name: c.name || '',
          nameEn: c.nameEn || c.name || '',
          sectorId: sid,
          sectorKo: meta.ko || meta.shortKo || sid,
          sectorEn: meta.en || meta.shortEn || sid,
        });
      });
    });
    return out;
  }

  function buildModel(hub, vol, turnoverRows, gainRows, rsRows) {
    var quotes = (vol && vol.quotes) || {};
    var companies = listHubCompanies(hub);
    var tSet = tickerSet(turnoverRows);
    var gSet = tickerSet(gainRows);
    var rSet = tickerSet(rsRows);
    var tMap = rowByTicker(turnoverRows);
    var gMap = rowByTicker(gainRows);
    var rMap = rowByTicker(rsRows);
    var rsRank = {};
    (rsRows || []).forEach(function (r, i) {
      if (!r || r.ticker == null) return;
      var id = String(r.ticker).trim();
      rsRank[id] = r.rank != null && isFinite(Number(r.rank)) ? Number(r.rank) : i + 1;
    });
    var points = [];
    companies.forEach(function (c) {
      var q = quotes[c.ticker];
      if (!q || q.rangeVol5 == null || !isFinite(q.rangeVol5)) return;
      if (q.mcap == null || !isFinite(q.mcap) || q.mcap <= 0) return;
      var clamped = clampX(q.rangeVol5);
      var groups = membershipOf(c.ticker, tSet, gSet, rSet);
      var tRow = tMap[c.ticker];
      var gRow = gMap[c.ticker];
      var rRow = rMap[c.ticker];
      points.push({
        ticker: c.ticker,
        name: c.name,
        nameEn: c.nameEn,
        sectorKo: c.sectorKo,
        sectorEn: c.sectorEn,
        rangeVol5: q.rangeVol5,
        x: clamped.x,
        overflow: clamped.overflow,
        mcap: q.mcap,
        groups: groups,
        ret5dPct: gRow && gRow.ret5dPct != null ? gRow.ret5dPct : null,
        turnoverWon: tRow && tRow.turnoverWon != null ? tRow.turnoverWon : null,
        rs: rRow && rRow.rs != null && isFinite(Number(rRow.rs)) ? Number(rRow.rs) : null,
        rsRank: rsRank[c.ticker] != null ? rsRank[c.ticker] : null,
      });
    });
    return {
      points: points,
      total: companies.length,
      shown: points.length,
      recentDd: formatDashDd(vol && vol.recentDd),
    };
  }

  function displayName(p) {
    return state.lang === 'en' ? p.nameEn || p.name : p.name || p.nameEn;
  }

  function groupLabel(group) {
    var L = labels();
    if (group === 'turnover5d') return L.legendTurnover;
    if (group === 'gain5d') return L.legendGain;
    if (group === 'rs') return L.legendRs;
    if (group === 'multi') return L.legendMulti;
    return L.legendOther;
  }

  function pointKind(p) {
    return displayKind(p && p.groups, state.groups);
  }

  function visiblePoints() {
    return state.points.filter(function (p) {
      var kind = pointKind(p);
      if (kind === 'other' && state.groups.other === false) return false;
      return true;
    });
  }

  function countInGroup(id) {
    var n = 0;
    state.points.forEach(function (p) {
      if (p.groups && p.groups.indexOf(id) >= 0) n += 1;
    });
    return n;
  }

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent =
      '#hub-range-scatter{background:var(--surface,#161b22);border:1px solid var(--border,#30363d);' +
      'border-radius:12px;padding:14px 14px 12px;min-width:0;box-sizing:border-box}' +
      '#hub-range-scatter-title{margin:0;font-size:16px;font-weight:700;color:var(--text,#e6edf3)}' +
      '#hub-range-scatter-sub,#hub-range-scatter-count{margin:4px 0 0;font-size:12px;color:var(--text-muted,#8b949e);line-height:1.4}' +
      '.hub-range-legend{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 8px}' +
      '.hub-range-chip{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;' +
      'font-weight:600;padding:4px 10px;border-radius:999px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text,#e6edf3)}' +
      '.hub-range-legend button.hub-range-chip{cursor:pointer}' +
      '.hub-range-chip.is-static{cursor:default}' +
      '.hub-range-chip.is-off{opacity:.4}' +
      '#hub-range-scatter-pct{margin:0 0 8px;font-size:12px;color:var(--text-muted,#8b949e);line-height:1.4}' +
      '.hub-range-swatch{width:9px;height:9px;border-radius:50%;display:inline-block}' +
      '#hub-range-scatter-search{margin:0 0 8px;max-width:320px}' +
      '#hub-range-wrap{order:1;min-width:0;width:100%;max-width:100%}' +
      '#hub-range-scatter-chart{width:100%;height:clamp(460px,60vh,680px);min-width:0;position:relative;overflow:hidden}' +
      '#hub-range-scatter-chart svg{display:block;width:100%;height:100%}' +
      '#hub-range-scatter-overflow{margin-top:8px;font-size:12px;color:var(--text-muted,#8b949e);line-height:1.45}' +
      '.hub-range-tip{position:fixed;z-index:80;pointer-events:none;max-width:280px;padding:8px 10px;' +
      'border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);' +
      'border:1px solid var(--border,#30363d);font-size:12px;line-height:1.4;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
      '@media (max-width:768px){#hub-range-scatter-chart{height:420px}#hub-range-scatter-search{max-width:none}}';
    document.head.appendChild(el);
  }

  function ensureTooltip() {
    var tip = document.getElementById('hub-range-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'hub-range-tip';
      tip.className = 'hub-range-tip';
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  function hideTip() {
    var tip = document.getElementById('hub-range-tip');
    if (tip) tip.hidden = true;
  }

  function showTip(ev, p) {
    var tip = ensureTooltip();
    var L = labels();
    var lines = [
      displayName(p) + ' (' + p.ticker + ')',
      (state.lang === 'en' ? p.sectorEn : p.sectorKo) || '',
      L.tipRange + ' ' + formatPct1(p.rangeVol5),
      L.tipMcap + ' ' + formatMcap(p.mcap),
    ];
    if (p.ret5dPct != null && isFinite(p.ret5dPct)) lines.push(L.tipRet + ' ' + formatSignedPct(p.ret5dPct));
    var tv = formatTurnover(p.turnoverWon);
    if (tv) lines.push(L.tipTurnover + ' ' + tv);
    var memberNames = (p.groups || []).map(groupLabel);
    var rsBit = '';
    if (p.rs != null && isFinite(p.rs)) {
      rsBit = 'RS ' + Number(p.rs).toFixed(1);
      if (p.rsRank != null && isFinite(p.rsRank)) rsBit += ' (' + L.tipRsRank(p.rsRank) + ')';
    }
    if (rsBit && memberNames.length) lines.push(rsBit + ' · ' + memberNames.join(', '));
    else if (rsBit) lines.push(rsBit);
    else lines.push(L.tipGroup + ' ' + (memberNames.length ? memberNames.join(', ') : L.legendOther));
    tip.textContent = lines.filter(Boolean).join('\n');
    tip.style.whiteSpace = 'pre-line';
    tip.hidden = false;
    var x = (ev.clientX || 0) + 12;
    var y = (ev.clientY || 0) + 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function ensureChrome() {
    injectStyles();
    var root = document.getElementById('hub-range-scatter');
    if (!root) return null;
    var L = labels();
    var title = document.getElementById('hub-range-scatter-title');
    if (title) title.textContent = L.title;
    var sub = document.getElementById('hub-range-scatter-sub');
    if (sub) sub.textContent = state.recentDd ? L.basis(state.recentDd) : L.loading;
    var count = document.getElementById('hub-range-scatter-count');
    if (count) {
      count.textContent = state.ready ? L.coverage(state.shown, state.total) : '';
    }
    var legend = document.getElementById('hub-range-scatter-legend');
    if (legend && !legend._built) {
      legend.className = 'hub-range-legend';
      legend._built = true;
      [
        ['turnover5d', COLOR.turnover5d, true],
        ['gain5d', COLOR.gain5d, true],
        ['rs', COLOR.rs, true],
        ['multi', COLOR.multi, false],
        ['other', COLOR.other, true],
      ].forEach(function (row) {
        var el = document.createElement(row[2] ? 'button' : 'span');
        el.className = 'hub-range-chip' + (row[2] ? '' : ' is-static');
        if (row[2]) el.type = 'button';
        el.setAttribute('data-group', row[0]);
        el.innerHTML = '<span class="hub-range-swatch" style="background:' + row[1] + '"></span><span></span>';
        if (row[2]) {
          el.addEventListener('click', function () {
            state.groups[row[0]] = state.groups[row[0]] === false;
            saveGroupFilters();
            paint();
          });
        }
        legend.appendChild(el);
      });
    }
    if (legend) {
      legend.querySelectorAll('[data-group]').forEach(function (b) {
        var g = b.getAttribute('data-group');
        var span = b.querySelector('span:last-child');
        var text = groupLabel(g);
        if (g === 'turnover5d' || g === 'gain5d' || g === 'rs') text += ' (' + countInGroup(g) + ')';
        if (span) span.textContent = text;
        if (b.tagName === 'BUTTON') {
          var on = state.groups[g] !== false;
          b.classList.toggle('is-off', !on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      });
    }
    var searchHost = document.getElementById('hub-range-scatter-search');
    var lib = global.InvestingMapTabSearch;
    if (searchHost && lib && !state.tabSearchCtrl) {
      state.tabSearchCtrl = lib.create({
        container: searchHost,
        lang: state.lang,
        onQuery: function (q) {
          onUserSearch(q);
        },
        onEnter: function (q) {
          onUserSearch(q);
        },
      });
    } else if (state.tabSearchCtrl && state.tabSearchCtrl.setLang) {
      state.tabSearchCtrl.setLang(state.lang);
    }
    return document.getElementById('hub-range-scatter-chart');
  }

  function matchesPoint(p, q) {
    var lib = global.InvestingMapTabSearch;
    if (!lib || !q) return false;
    return lib.matches(
      { name: p.name, nameKo: p.name, nameEn: p.nameEn, ticker: p.ticker },
      q,
    );
  }

  function scrollFirstIfNeeded(container, hits) {
    var lib = global.InvestingMapTabSearch;
    if (!lib || !hits || hits.length !== 1 || !container) return;
    var el = container.querySelector('[data-ticker="' + hits[0].ticker + '"]');
    if (el) lib.scrollIntoViewIfNeeded(el);
  }

  function onUserSearch(q) {
    state.searchQ = q == null ? '' : String(q);
    paint();
    var chart = document.getElementById('hub-range-scatter-chart');
    var qTrim = state.searchQ.trim();
    if (!qTrim || !chart) return;
    var hits = visiblePoints().filter(function (p) {
      return matchesPoint(p, qTrim);
    });
    scrollFirstIfNeeded(chart, hits);
  }

  function updateSearchStatus(drawn) {
    var ctrl = state.tabSearchCtrl;
    var lib = global.InvestingMapTabSearch;
    if (!ctrl || !lib) return;
    var q = String(state.searchQ || '').trim();
    if (!q) {
      ctrl.setStatus(0, { query: '' });
      return;
    }
    var companies = state.points.map(function (p) {
      return { ticker: p.ticker, name: p.name, nameKo: p.name, nameEn: p.nameEn };
    });
    var visible = new Set(
      drawn.map(function (p) {
        return p.ticker;
      }),
    );
    var classified = lib.classifyChartHits(companies, visible, q);
    if (classified.chartHits.length) ctrl.setStatus(classified.chartHits.length, { query: classified.query });
    else if (classified.nameOnlyHits.length) ctrl.setStatus(0, { notOnChart: true, query: classified.query });
    else ctrl.setStatus(0, { query: classified.query });
  }

  function labelCandidates(drawn, mobile) {
    var q = String(state.searchQ || '').trim();
    var list = [];
    drawn.forEach(function (p) {
      var searchHit = q && matchesPoint(p, q);
      var highlight = pointKind(p) !== 'other';
      if (searchHit || highlight) list.push(p);
    });
    if (mobile) {
      var highlights = list
        .filter(function (p) {
          return pointKind(p) !== 'other' && !(q && matchesPoint(p, q));
        })
        .sort(function (a, b) {
          return b.mcap - a.mcap;
        })
        .slice(0, 20);
      var searchHits = list.filter(function (p) {
        return q && matchesPoint(p, q);
      });
      var seen = {};
      list = [];
      searchHits.concat(highlights).forEach(function (p) {
        if (seen[p.ticker]) return;
        seen[p.ticker] = true;
        list.push(p);
      });
    }
    return list;
  }

  function layoutLabelYs(items) {
    if (!items.length || typeof d3 === 'undefined' || !d3.forceSimulation) return;
    var nodes = items.map(function (p) {
      return { p: p, x: p._lx, y: p._ly };
    });
    var sim = d3
      .forceSimulation(nodes)
      .force('yCollide', yCollideForce(7))
      .stop();
    var i;
    for (i = 0; i < 30; i++) sim.tick();
    nodes.forEach(function (n) {
      n.p._ly = n.y;
    });
  }

  function yCollideForce(pad) {
    var nodes;
    function force() {
      var i;
      var j;
      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          var a = nodes[i];
          var b = nodes[j];
          var dy = b.y - a.y;
          var min = pad * 2;
          if (Math.abs(dy) >= min) continue;
          var dir = dy === 0 ? 1 : dy / Math.abs(dy);
          var push = (min - Math.abs(dy)) / 2;
          a.y -= push * dir;
          b.y += push * dir;
        }
      }
    }
    force.initialize = function (n) {
      nodes = n;
    };
    return force;
  }

  function paintOverflow(points) {
    var box = document.getElementById('hub-range-scatter-overflow');
    if (!box) return;
    var over = points.filter(function (p) {
      return p.overflow;
    });
    if (!over.length) {
      box.textContent = '';
      return;
    }
    var L = labels();
    var bits = over.map(function (p) {
      return displayName(p) + '(' + formatPct1(p.rangeVol5) + ')';
    });
    box.textContent = L.overflowTitle + ': ' + bits.join(', ');
  }

  function paint() {
    var chart = ensureChrome();
    if (!chart || typeof d3 === 'undefined') return;
    var drawn = visiblePoints();
    var w = chart.clientWidth || 640;
    var h = chart.clientHeight || 460;
    var mobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    var margin = { top: 18, right: 16, bottom: 36, left: mobile ? 52 : 64 };
    var iw = Math.max(10, w - margin.left - margin.right);
    var ih = Math.max(10, h - margin.top - margin.bottom);

    var mcaps = drawn.map(function (p) {
      return p.mcap;
    });
    var minM = mcaps.length ? Math.min.apply(null, mcaps) : 1e11;
    var maxM = mcaps.length ? Math.max.apply(null, mcaps) : 1e14;
    var y = d3.scaleLog().domain([minM * 0.8, maxM * 1.2]).range([ih, 0]).clamp(true);
    var x = d3.scaleLinear().domain([0, X_MAX]).range([0, iw]);

    var xs = state.points.map(function (p) {
      return p.rangeVol5;
    });
    var p25 = percentile(xs, 0.25);
    var p50 = percentile(xs, 0.5);
    var p75 = percentile(xs, 0.75);

    chart.innerHTML = '';
    var svg = d3
      .select(chart)
      .append('svg')
      .attr('viewBox', '0 0 ' + w + ' ' + h)
      .attr('width', w)
      .attr('height', h);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var pctNote = document.getElementById('hub-range-scatter-pct');
    var pctEntries = [];
    [p25, p50, p75].forEach(function (v, idx) {
      if (v == null || !isFinite(v)) return;
      var cx = clampX(v).x;
      var px = x(cx);
      g.append('line')
        .attr('x1', px)
        .attr('x2', px)
        .attr('y1', 0)
        .attr('y2', ih)
        .attr('stroke', '#8b949e')
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-width', 1);
      pctEntries.push({ px: px, label: ['P25', 'P50', 'P75'][idx] });
    });
    if (!mobile) {
      staggerPercentileLabels(pctEntries).forEach(function (row) {
        g.append('text')
          .attr('x', row.px + 3)
          .attr('y', 10 + row.dy)
          .attr('fill', '#8b949e')
          .attr('font-size', 10)
          .attr('pointer-events', 'none')
          .text(row.label);
      });
    }
    if (pctNote) {
      if (mobile && p25 != null && p50 != null && p75 != null) {
        pctNote.hidden = false;
        pctNote.textContent =
          'P25 ' + formatPct1(p25) + ' · P50 ' + formatPct1(p50) + ' · P75 ' + formatPct1(p75);
      } else {
        pctNote.hidden = true;
        pctNote.textContent = '';
      }
    }

    var xAxis = d3
      .axisBottom(x)
      .tickValues(X_TICKS)
      .tickFormat(function (v) {
        return Math.round(v * 100) + '%';
      });
    var yTicksIn = Y_TICKS.filter(function (v) {
      return v >= y.domain()[0] && v <= y.domain()[1];
    });
    var yAxis = d3
      .axisLeft(y)
      .tickValues(yTicksIn.length ? yTicksIn : Y_TICKS)
      .tickFormat(yTickLabel);
    g.append('g').attr('transform', 'translate(0,' + ih + ')').call(xAxis);
    g.append('g').call(yAxis);
    g.selectAll('.domain, .tick line').attr('stroke', '#30363d');
    g.selectAll('.tick text').attr('fill', '#8b949e').attr('font-size', mobile ? 10 : 11);

    var q = String(state.searchQ || '').trim();
    var base = drawn.filter(function (p) {
      return pointKind(p) === 'other';
    });
    var hi = drawn.filter(function (p) {
      return pointKind(p) !== 'other';
    });

    function bindDot(sel, r, fill, opacity) {
      sel
        .attr('cx', function (p) {
          return x(p.x);
        })
        .attr('cy', function (p) {
          return y(p.mcap);
        })
        .attr('r', r)
        .attr('fill', fill)
        .attr('fill-opacity', opacity)
        .attr('data-ticker', function (p) {
          return p.ticker;
        })
        .style('cursor', 'pointer')
        .on('mouseenter', function (ev, p) {
          showTip(ev, p);
        })
        .on('mousemove', function (ev, p) {
          showTip(ev, p);
        })
        .on('mouseleave', hideTip)
        .on('click', function (ev, p) {
          hideTip();
          if (global.InvestingMapCandleModal && typeof global.InvestingMapCandleModal.open === 'function') {
            global.InvestingMapCandleModal.open({ ticker: p.ticker, name: displayName(p) });
          }
        });
      if (q) {
        sel.attr('stroke', function (p) {
          return matchesPoint(p, q) ? '#f0b429' : 'none';
        });
        sel.attr('stroke-width', function (p) {
          return matchesPoint(p, q) ? 3 : 0;
        });
        sel.attr('opacity', function (p) {
          return matchesPoint(p, q) ? 1 : 0.15;
        });
      }
    }

    bindDot(
      g.append('g').attr('class', 'hub-range-base').selectAll('circle').data(base).join('circle'),
      3.5,
      COLOR.other,
      0.35,
    );
    bindDot(
      g
        .append('g')
        .attr('class', 'hub-range-hi')
        .selectAll('circle')
        .data(hi)
        .join('circle'),
      5,
      function (p) {
        return COLOR[pointKind(p)] || COLOR.other;
      },
      0.95,
    );

    g.append('g')
      .attr('class', 'hub-range-clamp')
      .selectAll('text')
      .data(
        drawn.filter(function (p) {
          return p.overflow;
        }),
      )
      .join('text')
      .attr('x', function (p) {
        return x(p.x) + 7;
      })
      .attr('y', function (p) {
        return y(p.mcap);
      })
      .attr('fill', '#e6edf3')
      .attr('font-size', 11)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('pointer-events', 'none')
      .text('▶');

    var labeled = labelCandidates(drawn, mobile);
    labeled.forEach(function (p) {
      p._lx = x(p.x) + 6;
      p._ly = y(p.mcap);
    });
    layoutLabelYs(labeled);
    var font = mobile ? 10 : 11;
    g.append('g')
      .attr('class', 'hub-range-labels')
      .selectAll('text')
      .data(labeled)
      .join('text')
      .attr('x', function (p) {
        return p._lx;
      })
      .attr('y', function (p) {
        return p._ly;
      })
      .attr('fill', function (p) {
        return q && matchesPoint(p, q) ? '#f0b429' : '#e6edf3';
      })
      .attr('font-size', font)
      .attr('font-weight', 600)
      .attr('dominant-baseline', 'middle')
      .text(function (p) {
        var nm = displayName(p);
        return nm.length > 10 ? nm.slice(0, 9) + '…' : nm;
      });

    updateSearchStatus(drawn);
    paintOverflow(state.points);
  }

  function observe(chart) {
    if (!chart || typeof ResizeObserver === 'undefined') return;
    if (state.resizeObs) return;
    state.resizeObs = new ResizeObserver(function () {
      if (state.ready) paint();
    });
    state.resizeObs.observe(chart);
  }

  function load() {
    ensureChrome();
    var chart = document.getElementById('hub-range-scatter-chart');
    if (chart) chart.textContent = labels().loading;
    return Promise.all([
      fetch('data/hub_index.json', { cache: 'default' }).then(function (r) {
        if (!r.ok) throw new Error('hub_index');
        return r.json();
      }),
      fetch('data/hub_volatility_snapshot.json', { cache: 'default' }).then(function (r) {
        if (!r.ok) throw new Error('vol');
        return r.json();
      }),
    ])
      .then(function (pair) {
        state.hub = pair[0];
        state.vol = pair[1];
        applyModel(buildModel(state.hub, state.vol, state.turnover5d, state.gainers5d, state.rsTop20));
        state.ready = true;
        paint();
        observe(document.getElementById('hub-range-scatter-chart'));
      })
      .catch(function () {
        var chartEl = document.getElementById('hub-range-scatter-chart');
        if (chartEl) chartEl.textContent = labels().failed;
      });
  }

  function applyModel(model) {
    state.points = model.points;
    state.total = model.total;
    state.shown = model.shown;
    state.recentDd = model.recentDd;
  }

  function rebuildIfReady() {
    if (!state.hub || !state.vol) return;
    applyModel(buildModel(state.hub, state.vol, state.turnover5d, state.gainers5d, state.rsTop20));
    state.ready = true;
    paint();
  }

  function setMovers(payload) {
    payload = payload || {};
    state.turnover5d = payload.turnover5dTop10 || [];
    state.gainers5d = payload.gainers5dTop10 || [];
    if (payload.lang === 'en' || payload.lang === 'ko') state.lang = payload.lang;
    rebuildIfReady();
  }

  function setRs(payload) {
    payload = payload || {};
    state.rsTop20 = payload.rsTop20 || [];
    if (payload.lang === 'en' || payload.lang === 'ko') state.lang = payload.lang;
    rebuildIfReady();
  }

  function setLang(lang) {
    state.lang = lang === 'en' ? 'en' : 'ko';
    if (state.ready) paint();
    else ensureChrome();
  }

  function init() {
    var root = document.getElementById('hub-range-scatter');
    if (!root) return;
    try {
      var stored = localStorage.getItem('im_lang');
      if (stored === 'en' || stored === 'ko') state.lang = stored;
    } catch (e) {}
    var htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang === 'en' || htmlLang === 'ko') state.lang = htmlLang;
    loadGroupFilters();
    load();
  }

  global.InvestingMapHubRangeScatter = {
    init: init,
    setMovers: setMovers,
    setRs: setRs,
    setLang: setLang,
    paint: paint,
    _test: {
      percentile: percentile,
      clampX: clampX,
      displayKind: displayKind,
      membershipOf: membershipOf,
      buildModel: buildModel,
      formatDashDd: formatDashDd,
      staggerPercentileLabels: staggerPercentileLabels,
      inputs: function () {
        return {
          turnover5d: state.turnover5d,
          gainers5d: state.gainers5d,
          rsTop20: state.rsTop20,
        };
      },
    },
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
