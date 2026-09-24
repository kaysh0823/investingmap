/**
 * Valuation comparison v3 — chain-group PER TTM / FY / PBR / dividend strip.
 * Snapshot: /data/hub_valuation_snapshot.json (KRX FY + Naver TTM for hub).
 */
(function (global) {
  'use strict';

  var lastOpts = null;
  var resizeObs = null;
  var observedEl = null;
  var resizeTimer = null;
  var snapshotCache = null;
  var snapshotLoading = null;
  var liveTickRegistered = false;
  var METRICS = ['perTtm', 'perFy', 'pbr', 'dvdYld'];
  var METRIC_STORAGE = 'im_val_metric_v2';
  var SORT_STORAGE = 'im_val_sort';
  var selectedMetric = 'perTtm';
  var selectedSort = 'chain';
  var CHG_CLIP = 15;
  var CHG_RANGE = ['#c62828', '#e53935', '#8e3a3a', '#2a2e38', '#2e7d32', '#43a047', '#00c853'];
  var MISSING_COLOR = '#9aa3ad';
  var stylesInjected = false;

  var COPY = {
    ko: {
      title: '밸류에이션 비교',
      groupMetric: '지표',
      groupSort: '정렬',
      metricPerTtm: 'PER TTM',
      metricPerFy: 'PER FY',
      metricPbr: 'PBR',
      metricDvd: '배당수익률',
      sortChain: '체인 순',
      sortMedian: '그룹 중앙값 순',
      medianLabel: function (v, metric, n) {
        if (n != null && n <= 2) return '(n=' + n + ')';
        var unit = metric === 'dvdYld' ? '%' : '×';
        var name =
          metric === 'perTtm' ? 'PER(TTM)' :
          metric === 'perFy' ? 'PER(FY)' :
          metric === 'pbr' ? 'PBR' : '배당';
        return name + ' 중앙값 ' + formatMetric(v, metric) + unit;
      },
      naDeficit: 'N/A(적자)',
      fyTag: 'FY',
      fyFallbackTip: '(FY 대체)',
      loading: '밸류에이션 데이터를 불러오는 중…',
      failed: '밸류에이션 스냅샷을 불러오지 못했습니다.',
      noData: '표시할 밸류에이션 데이터가 없습니다.',
      legend: '점 크기=시총 · 색=당일 등락률 · 세로 점선=전 시장 P25/P50/P75(KRX FY)',
      legendPer:
        'PER(TTM) = 주가 ÷ 최근 4분기 EPS (Naver/WISEfn) · 시장 백분위선은 KRX 직전 사업연도 EPS 기준',
      basisClose: function (dd) {
        return '기준 ' + formatDash(dd) + ' · KRX 12021 · 종가 기준';
      },
      basisLive: function (dd) {
        return '기준 ' + formatDash(dd) + ' · 장중 현재가 기준';
      },
      tipPerTtm: 'PER TTM',
      tipPerFy: 'PER FY',
      tipPbr: 'PBR',
      tipEpsTtm: 'EPS(TTM)',
      tipDvd: '배당수익률',
      tipClose: '종가',
      tipLast: '현재가',
      tipMcap: '시총',
      tipChg: '당일등락률',
      tipChain: '체인',
    },
    en: {
      title: 'Valuation',
      groupMetric: 'Metric',
      groupSort: 'Sort',
      metricPerTtm: 'PER TTM',
      metricPerFy: 'PER FY',
      metricPbr: 'PBR',
      metricDvd: 'Div. yield',
      sortChain: 'Chain order',
      sortMedian: 'By group median',
      medianLabel: function (v, metric, n) {
        if (n != null && n <= 2) return '(n=' + n + ')';
        var unit = metric === 'dvdYld' ? '%' : '×';
        var name =
          metric === 'perTtm' ? 'PER(TTM)' :
          metric === 'perFy' ? 'PER(FY)' :
          metric === 'pbr' ? 'PBR' : 'Yield';
        return name + ' median ' + formatMetric(v, metric) + unit;
      },
      naDeficit: 'N/A (loss)',
      fyTag: 'FY',
      fyFallbackTip: '(FY fallback)',
      loading: 'Loading valuation data…',
      failed: 'Could not load valuation snapshot.',
      noData: 'No valuation data available.',
      legend: 'Dot size=mcap · color=1D chg · dashed lines=market P25/P50/P75 (KRX FY)',
      legendPer:
        'PER(TTM) = price ÷ TTM EPS (Naver/WISEfn) · market percentile lines use KRX prior-year EPS',
      basisClose: function (dd) {
        return 'As of ' + formatDash(dd) + ' · KRX 12021 · close basis';
      },
      basisLive: function (dd) {
        return 'As of ' + formatDash(dd) + ' · intraday last';
      },
      tipPerTtm: 'PER TTM',
      tipPerFy: 'PER FY',
      tipPbr: 'PBR',
      tipEpsTtm: 'EPS (TTM)',
      tipDvd: 'Div. yield',
      tipClose: 'Close',
      tipLast: 'Last',
      tipMcap: 'Mcap',
      tipChg: '1D chg',
      tipChain: 'Chain',
    },
  };

  function formatDash(dd) {
    var s = String(dd || '').replace(/\//g, '-').trim();
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  function isUsableLabel(v) {
    return v != null && v !== '' && String(v) !== 'undefined' && typeof v !== 'undefined';
  }

  function labelsFor(opts) {
    var lang = opts && opts.lang === 'en' ? 'en' : 'ko';
    var base = COPY[lang];
    var L = opts && opts.labels ? opts.labels : {};
    var out = {};
    Object.keys(base).forEach(function (k) {
      out[k] = base[k];
    });
    Object.keys(L).forEach(function (k) {
      if (isUsableLabel(L[k])) out[k] = L[k];
    });
    return out;
  }

  function formatMetric(v, metric) {
    if (v == null || !isFinite(v)) return '—';
    if (metric === 'dvdYld') return (Math.round(v * 100) / 100).toFixed(2);
    if (Math.abs(v) >= 100) return Math.round(v).toString();
    if (Math.abs(v) >= 10) return (Math.round(v * 10) / 10).toFixed(1);
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  function formatMcap(won) {
    if (!(won > 0)) return '—';
    var j = won / 1e12;
    return j >= 1 ? j.toFixed(2) + '조' : (won / 1e8).toFixed(0) + '억';
  }

  function formatPct(v) {
    if (v == null || !isFinite(v)) return '—';
    var s = (Math.round(v * 100) / 100).toFixed(2);
    return (v > 0 ? '+' : '') + s + '%';
  }

  function normalizeMetric(m) {
    if (m === 'per') return 'perTtm';
    return METRICS.indexOf(m) >= 0 ? m : 'perTtm';
  }

  function loadMetric() {
    try {
      return normalizeMetric(global.localStorage && global.localStorage.getItem(METRIC_STORAGE));
    } catch (e) {
      return 'perTtm';
    }
  }

  function saveMetric(m) {
    selectedMetric = normalizeMetric(m);
    try {
      if (global.localStorage) global.localStorage.setItem(METRIC_STORAGE, selectedMetric);
    } catch (e) {}
  }

  function loadSort() {
    try {
      var s = global.localStorage && global.localStorage.getItem(SORT_STORAGE);
      return s === 'median' ? 'median' : 'chain';
    } catch (e) {
      return 'chain';
    }
  }

  function saveSort(s) {
    selectedSort = s === 'median' ? 'median' : 'chain';
    try {
      if (global.localStorage) global.localStorage.setItem(SORT_STORAGE, selectedSort);
    } catch (e) {}
  }

  function sessionOpenNow() {
    var Tick = global.InvestingMapReturnsTick;
    if (Tick && typeof Tick.sessionOpenNow === 'function') return !!Tick.sessionOpenNow();
    return false;
  }

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css =
      '.valuation-wrap{display:flex;flex-direction:column;gap:10px;min-height:420px;padding:0 4px 8px}' +
      '.valuation-toolbar{display:flex;flex-direction:column;gap:8px}' +
      '.valuation-seg-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
      '.valuation-seg-title{font-size:11px;font-weight:600;color:var(--text-muted,#8b949e);min-width:2.5em;flex:0 0 auto}' +
      '.valuation-seg{display:inline-flex;flex-wrap:wrap;gap:0;border:1px solid var(--border,#30363d);border-radius:8px;overflow:hidden;background:var(--surface2,#21262d)}' +
      '.valuation-seg button{appearance:none;border:0;border-right:1px solid var(--border,#30363d);background:transparent;color:var(--text,#e6edf3);padding:6px 12px;font-size:12px;cursor:pointer}' +
      '.valuation-seg button:last-child{border-right:0}' +
      '.valuation-seg button.active{background:color-mix(in srgb,var(--accent,#58a6ff) 22%,transparent);color:var(--accent,#58a6ff);font-weight:600}' +
      '.valuation-basis{font-size:12px;color:var(--text-muted,#8b949e);margin:0;padding:0 8px;overflow:visible;white-space:nowrap}' +
      '#valuation-root{flex:1;min-height:360px;position:relative}' +
      '#valuation-legend{font-size:12px;color:var(--text-muted,#8b949e);line-height:1.45;padding:0 8px}' +
      '.valuation-tip{position:fixed;z-index:40;pointer-events:none;max-width:280px;background:rgba(22,27,34,.96);border:1px solid var(--border,#30363d);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text,#e6edf3);box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
      '.valuation-tip b{display:block;margin-bottom:4px}' +
      '.valuation-band-label{font-size:11px;fill:var(--text-muted,#8b949e)}' +
      '.valuation-fy-tag{font-size:8px;fill:var(--text-muted,#8b949e);pointer-events:none}' +
      '@media (max-width:640px){.valuation-toolbar{gap:10px}.valuation-seg button{padding:6px 10px}}';
    var el = document.createElement('style');
    el.id = 'im-map-valuation-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function contrastPct(pct, clip) {
    if (pct == null || !isFinite(pct)) return 0;
    var c = clip > 0 ? clip : 15;
    var t = Math.max(-c, Math.min(c, pct)) / c;
    return Math.sign(t) * Math.pow(Math.abs(t), 0.85);
  }

  function colorForChg(pct) {
    if (pct == null || !isFinite(pct) || typeof d3 === 'undefined') return MISSING_COLOR;
    var sc = d3.scaleLinear().domain([-1, -0.66, -0.33, 0, 0.33, 0.66, 1]).range(CHG_RANGE).clamp(true);
    return sc(contrastPct(pct, CHG_CLIP));
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var idx = (sorted.length - 1) * (p / 100);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function isPlottable(v, metric) {
    if (v == null || !isFinite(v)) return false;
    if (metric === 'dvdYld') return v >= 0;
    return v > 0;
  }

  function xDomainFor(metric) {
    if (metric === 'pbr') return [0.1, 20];
    if (metric === 'dvdYld') return [0, 12];
    return [0.5, 200];
  }

  function makeXScale(metric, width) {
    var dom = xDomainFor(metric);
    if (metric === 'dvdYld') {
      return d3.scaleLinear().domain(dom).range([0, width]).clamp(true);
    }
    return d3.scaleLog().domain(dom).range([0, width]).clamp(true);
  }

  /**
   * Resolve display value for a company × metric.
   * @returns {{ value: number|null, fyFallback: boolean, live: boolean }}
   */
  function resolveDisplay(q, company, metric, liveSession) {
    q = q || {};
    var last =
      company && typeof company.last === 'number' && company.last > 0
        ? company.last
        : null;
    if (metric === 'perTtm') {
      var eps = q.epsTtm;
      if (liveSession && eps != null && eps > 0 && last != null) {
        return { value: last / eps, fyFallback: false, live: true };
      }
      if (q.perTtm != null && q.perTtm > 0) {
        return { value: q.perTtm, fyFallback: false, live: false };
      }
      if (q.perFy != null && q.perFy > 0) {
        return { value: q.perFy, fyFallback: true, live: false };
      }
      return { value: null, fyFallback: false, live: false };
    }
    if (metric === 'perFy') {
      return { value: q.perFy != null && q.perFy > 0 ? q.perFy : null, fyFallback: false, live: false };
    }
    if (metric === 'pbr') {
      if (q.pbrTtm != null && q.pbrTtm > 0) {
        return { value: q.pbrTtm, fyFallback: false, live: false };
      }
      if (q.pbrFy != null && q.pbrFy > 0) {
        return { value: q.pbrFy, fyFallback: true, live: false };
      }
      return { value: null, fyFallback: false, live: false };
    }
    if (metric === 'dvdYld') {
      return {
        value: q.dvdYld != null && isFinite(q.dvdYld) ? q.dvdYld : null,
        fyFallback: false,
        live: false,
      };
    }
    return { value: null, fyFallback: false, live: false };
  }

  /** Market percentile basis — always KRX FY PER (or matching FY field). */
  function marketMetricValue(q, metric) {
    if (!q) return null;
    if (metric === 'perTtm' || metric === 'perFy') {
      return q.perFy != null && q.perFy > 0 ? q.perFy : null;
    }
    if (metric === 'pbr') return q.pbrFy != null && q.pbrFy > 0 ? q.pbrFy : null;
    if (metric === 'dvdYld') return q.dvdYld != null && isFinite(q.dvdYld) ? q.dvdYld : null;
    return null;
  }

  function fetchSnapshot() {
    if (snapshotCache) return Promise.resolve(snapshotCache);
    if (snapshotLoading) return snapshotLoading;
    var url = '../data/hub_valuation_snapshot.json';
    snapshotLoading = fetch(url, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        snapshotCache = j;
        snapshotLoading = null;
        return j;
      })
      .catch(function (e) {
        snapshotLoading = null;
        throw e;
      });
    return snapshotLoading;
  }

  function metricButtonLabel(m, labels) {
    if (m === 'perTtm') return labels.metricPerTtm;
    if (m === 'perFy') return labels.metricPerFy;
    if (m === 'pbr') return labels.metricPbr;
    return labels.metricDvd;
  }

  function ensureChrome(opts) {
    var wrap = opts.container && opts.container.closest
      ? opts.container.closest('.valuation-wrap')
      : null;
    if (!wrap) return;
    var toolbar = wrap.querySelector('.valuation-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'valuation-toolbar';
      wrap.insertBefore(toolbar, opts.container);
    }
    var labels = labelsFor(opts);
    toolbar.innerHTML = '';

    function addSegRow(title, items, isActive, onClick) {
      var row = document.createElement('div');
      row.className = 'valuation-seg-row';
      var tit = document.createElement('span');
      tit.className = 'valuation-seg-title';
      tit.textContent = title;
      row.appendChild(tit);
      var seg = document.createElement('div');
      seg.className = 'valuation-seg';
      items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = it.label;
        if (isActive(it.id)) b.classList.add('active');
        b.addEventListener('click', function () { onClick(it.id); });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      toolbar.appendChild(row);
    }

    addSegRow(
      labels.groupMetric,
      METRICS.map(function (m) {
        return { id: m, label: metricButtonLabel(m, labels) };
      }),
      function (id) { return id === selectedMetric; },
      function (id) {
        saveMetric(id);
        if (lastOpts) draw(lastOpts);
      },
    );
    addSegRow(
      labels.groupSort,
      [
        { id: 'chain', label: labels.sortChain },
        { id: 'median', label: labels.sortMedian },
      ],
      function (id) { return id === selectedSort; },
      function (id) {
        saveSort(id);
        if (lastOpts) draw(lastOpts);
      },
    );
  }

  function syncBasisBadge(snapshot, labels, liveSession) {
    var hint = document.getElementById('valuation-hint');
    if (!hint) return;
    var dd = snapshot && snapshot.recentDd ? String(snapshot.recentDd).slice(0, 10) : '';
    if (!dd) {
      hint.textContent = labels.loading;
      return;
    }
    hint.textContent = liveSession ? labels.basisLive(dd) : labels.basisClose(dd);
  }

  function chainOrder(companies) {
    var present = {};
    (companies || []).forEach(function (c) {
      if (c && c.chain) present[c.chain] = true;
    });
    var curated =
      typeof global.CURATED_CHAIN_ORDER !== 'undefined' && global.CURATED_CHAIN_ORDER.length
        ? global.CURATED_CHAIN_ORDER.slice()
        : [];
    var order = [];
    curated.forEach(function (ch) {
      if (present[ch]) order.push(ch);
    });
    Object.keys(present)
      .sort()
      .forEach(function (ch) {
        if (order.indexOf(ch) < 0) order.push(ch);
      });
    return order;
  }

  function groupMedian(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    return percentile(s, 50);
  }

  function registerLiveTick() {
    if (liveTickRegistered) return;
    var Tick = global.InvestingMapReturnsTick;
    if (!Tick || !Tick.register) return;
    liveTickRegistered = true;
    Tick.register(
      'valuation',
      function () {
        return Promise.resolve({ data: {}, dataVersion: String(Date.now()) });
      },
      function () {
        var tab = document.getElementById('tab-valuation');
        if (!tab || !tab.classList.contains('active')) return;
        if (lastOpts) draw(lastOpts);
      },
    );
  }

  function draw(opts) {
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    var labels = labelsFor(opts);
    var companies = Array.isArray(opts.companies)
      ? opts.companies
      : Array.isArray(global.koreanCompanies)
        ? global.koreanCompanies
        : [];

    container.innerHTML = '';
    hideTip();

    var loading = document.createElement('div');
    loading.style.cssText =
      'display:flex;align-items:center;justify-content:center;height:100%;' +
      'color:var(--text-muted,#8b949e);padding:24px';
    loading.textContent = labels.loading;
    container.appendChild(loading);

    fetchSnapshot()
      .then(function (snapshot) {
        container.innerHTML = '';
        var live = sessionOpenNow();
        syncBasisBadge(snapshot, labels, live);
        paint(container, companies, snapshot, opts, labels, live);
      })
      .catch(function () {
        container.innerHTML = '';
        var err = document.createElement('div');
        err.style.cssText =
          'display:flex;align-items:center;justify-content:center;height:100%;' +
          'color:var(--text-muted,#8b949e);padding:24px;text-align:center';
        err.textContent = labels.failed;
        container.appendChild(err);
      });
  }

  function paint(container, companies, snapshot, opts, labels, liveSession) {
    var quotes = (snapshot && snapshot.quotes) || {};
    var metric = selectedMetric;
    var lang = opts.lang === 'en' ? 'en' : 'ko';

    var marketVals = [];
    Object.keys(quotes).forEach(function (t) {
      var v = marketMetricValue(quotes[t], metric);
      if (isPlottable(v, metric)) marketVals.push(v);
    });
    marketVals.sort(function (a, b) { return a - b; });
    var p25 = percentile(marketVals, 25);
    var p50 = percentile(marketVals, 50);
    var p75 = percentile(marketVals, 75);

    var byChain = {};
    companies.forEach(function (c) {
      if (!c || !c.ticker) return;
      var t = String(c.ticker);
      var q = quotes[t];
      if (!q) return;
      var ch = c.chain || (lang === 'en' ? 'Other' : '기타');
      if (!byChain[ch]) byChain[ch] = [];
      var resolved = resolveDisplay(q, c, metric, liveSession);
      byChain[ch].push({
        ticker: t,
        name: lang === 'en' && c.nameEn ? c.nameEn : c.name || t,
        nameEn: c.nameEn,
        chain: ch,
        mcap: c.mcapWon > 0 ? c.mcapWon : null,
        chg1dPct: typeof c.chg1dPct === 'number' ? c.chg1dPct : null,
        last: typeof c.last === 'number' ? c.last : null,
        value: resolved.value,
        plottable: isPlottable(resolved.value, metric),
        fyFallback: !!resolved.fyFallback,
        live: !!resolved.live,
        q: q,
      });
    });

    var order = chainOrder(companies).filter(function (ch) {
      return byChain[ch] && byChain[ch].length;
    });
    if (!order.length) {
      var empty = document.createElement('div');
      empty.style.cssText =
        'display:flex;align-items:center;justify-content:center;height:100%;' +
        'color:var(--text-muted,#8b949e);padding:24px;text-align:center';
      empty.textContent = labels.noData;
      container.appendChild(empty);
      return;
    }

    var groups = order.map(function (ch) {
      var items = byChain[ch];
      var vals = items.filter(function (d) { return d.plottable; }).map(function (d) { return d.value; });
      return { chain: ch, items: items, median: groupMedian(vals) };
    });

    if (selectedSort === 'median') {
      groups.sort(function (a, b) {
        var am = a.median == null ? Infinity : a.median;
        var bm = b.median == null ? Infinity : b.median;
        return am - bm;
      });
    }

    var rect = container.getBoundingClientRect();
    var width = Math.floor(rect.width || container.clientWidth || 0) || 640;
    var bandH = 44;
    var labelW = Math.min(140, Math.floor(width * 0.22));
    var naW = 72;
    var margin = { top: 32, right: 12, bottom: 28, left: labelW };
    var innerW = Math.max(80, width - margin.left - margin.right - naW);
    var height = margin.top + margin.bottom + groups.length * bandH;

    var x = makeXScale(metric, innerW);
    var mcaps = [];
    groups.forEach(function (g) {
      g.items.forEach(function (d) {
        if (d.mcap > 0) mcaps.push(d.mcap);
      });
    });
    var rScale = d3
      .scaleSqrt()
      .domain([d3.min(mcaps) || 1e10, d3.max(mcaps) || 1e14])
      .range([3.5, 11])
      .clamp(true);

    var svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', labels.title);

    var gRoot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var pctMarks = [
      { p: 25, v: p25 },
      { p: 50, v: p50 },
      { p: 75, v: p75 },
    ]
      .filter(function (o) {
        return o.v != null && isFinite(o.v) && isPlottable(o.v, metric);
      })
      .map(function (o) {
        return { p: o.p, v: o.v, x: x(o.v) };
      })
      .sort(function (a, b) { return a.x - b.x; });
    pctMarks.forEach(function (o, i) {
      gRoot
        .append('line')
        .attr('x1', o.x)
        .attr('x2', o.x)
        .attr('y1', 0)
        .attr('y2', groups.length * bandH)
        .attr('stroke', 'var(--text-muted,#8b949e)')
        .attr('stroke-opacity', o.p === 50 ? 0.55 : 0.35)
        .attr('stroke-dasharray', o.p === 50 ? '4,4' : '2,3');
      var yLab = -8;
      if (i > 0 && Math.abs(o.x - pctMarks[i - 1].x) < 28) {
        yLab = pctMarks[i - 1]._yLab === -8 ? -18 : -8;
      }
      o._yLab = yLab;
      gRoot
        .append('text')
        .attr('x', o.x + 3)
        .attr('y', yLab)
        .attr('fill', 'var(--text-muted,#8b949e)')
        .attr('font-size', 10)
        .text('P' + o.p);
    });

    var tickVals =
      metric === 'dvdYld'
        ? [0, 2, 4, 6, 8, 10, 12]
        : metric === 'pbr'
          ? [0.1, 0.3, 0.5, 1, 2, 5, 10, 20]
          : [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
    var axis = d3.axisBottom(x).tickValues(tickVals).tickFormat(function (v) {
      return metric === 'dvdYld' ? v + '%' : String(v);
    });
    gRoot
      .append('g')
      .attr('transform', 'translate(0,' + groups.length * bandH + ')')
      .call(axis)
      .selectAll('text')
      .attr('fill', 'var(--text-muted,#8b949e)')
      .attr('font-size', 10);
    gRoot.selectAll('.domain, .tick line').attr('stroke', 'var(--border,#30363d)');

    groups.forEach(function (g, gi) {
      var y0 = gi * bandH;
      var yMid = y0 + bandH / 2;
      gRoot
        .append('rect')
        .attr('x', -margin.left)
        .attr('y', y0)
        .attr('width', width)
        .attr('height', bandH)
        .attr('fill', gi % 2 ? 'rgba(255,255,255,0.02)' : 'transparent');

      gRoot
        .append('text')
        .attr('class', 'valuation-band-label')
        .attr('x', -8)
        .attr('y', yMid)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .text(g.chain.length > 14 ? g.chain.slice(0, 13) + '…' : g.chain);

      if (g.median != null && isPlottable(g.median, metric)) {
        var mx = x(g.median);
        var nPlot = g.items.filter(function (d) { return d.plottable; }).length;
        gRoot
          .append('line')
          .attr('x1', mx)
          .attr('x2', mx)
          .attr('y1', y0 + 4)
          .attr('y2', y0 + bandH - 4)
          .attr('stroke', 'var(--accent,#58a6ff)')
          .attr('stroke-width', 1.5);
        gRoot
          .append('text')
          .attr('x', mx + 4)
          .attr('y', y0 + 12)
          .attr('fill', 'var(--accent,#58a6ff)')
          .attr('font-size', 10)
          .text(labels.medianLabel(g.median, metric, nPlot));
      }

      if (gi === 0) {
        gRoot
          .append('text')
          .attr('x', innerW + naW / 2)
          .attr('y', -8)
          .attr('text-anchor', 'middle')
          .attr('fill', 'var(--text-muted,#8b949e)')
          .attr('font-size', 10)
          .text(labels.naDeficit);
      }

      g.items.forEach(function (d) {
        var cx;
        var cy = yMid + (Math.random() - 0.5) * 10;
        if (d.plottable) cx = x(d.value);
        else cx = innerW + 16 + Math.random() * (naW - 28);
        var r = d.mcap > 0 ? rScale(d.mcap) : 4;
        var circle = gRoot
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', r)
          .attr('fill', d.plottable ? colorForChg(d.chg1dPct) : MISSING_COLOR)
          .attr('fill-opacity', 0.88)
          .attr('stroke', 'rgba(0,0,0,0.25)')
          .attr('stroke-width', 0.5)
          .style('cursor', 'pointer');
        if (d.fyFallback && d.plottable) {
          gRoot
            .append('text')
            .attr('class', 'valuation-fy-tag')
            .attr('x', cx)
            .attr('y', cy - r - 2)
            .attr('text-anchor', 'middle')
            .text(labels.fyTag);
        }
        circle
          .on('mouseenter', function (ev) {
            showTip(ev, d, labels, liveSession);
          })
          .on('mousemove', function (ev) {
            moveTip(ev);
          })
          .on('mouseleave', hideTip)
          .on('click', function () {
            if (typeof opts.onSelect === 'function') opts.onSelect(d);
          });
      });
    });

    var legend = opts.legend || document.getElementById('valuation-legend');
    if (legend) {
      legend.innerHTML =
        '<div>' + labels.legend + '</div><div style="margin-top:4px">' + labels.legendPer + '</div>';
    }
  }

  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'valuation-tip';
    tipEl.style.display = 'none';
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function showTip(ev, d, labels, liveSession) {
    var el = ensureTip();
    var q = d.q || {};
    var perTtmShow = d.live
      ? d.value
      : q.perTtm != null && q.perTtm > 0
        ? q.perTtm
        : null;
    var fyNote = d.fyFallback ? ' ' + labels.fyFallbackTip : '';
    el.innerHTML =
      '<b>' +
      d.name +
      ' (' +
      d.ticker +
      ')</b>' +
      labels.tipChain +
      ': ' +
      d.chain +
      '<br>' +
      labels.tipPerTtm +
      ': ' +
      formatMetric(perTtmShow, 'perTtm') +
      '×' +
      fyNote +
      ' · ' +
      labels.tipPerFy +
      ': ' +
      formatMetric(q.perFy, 'perFy') +
      '×<br>' +
      labels.tipPbr +
      ': ' +
      formatMetric(q.pbrTtm != null ? q.pbrTtm : q.pbrFy, 'pbr') +
      '× · ' +
      labels.tipEpsTtm +
      ': ' +
      formatMetric(q.epsTtm, 'perTtm') +
      '<br>' +
      labels.tipDvd +
      ': ' +
      formatMetric(q.dvdYld, 'dvdYld') +
      '% · ' +
      (liveSession ? labels.tipLast : labels.tipClose) +
      ': ' +
      (liveSession && d.last != null
        ? Number(d.last).toLocaleString()
        : q.close != null
          ? Number(q.close).toLocaleString()
          : '—') +
      '<br>' +
      labels.tipMcap +
      ': ' +
      formatMcap(d.mcap) +
      ' · ' +
      labels.tipChg +
      ': ' +
      formatPct(d.chg1dPct);
    el.style.display = 'block';
    moveTip(ev);
  }

  function moveTip(ev) {
    if (!tipEl) return;
    tipEl.style.left = (ev.clientX || 0) + 12 + 'px';
    tipEl.style.top = (ev.clientY || 0) + 12 + 'px';
  }

  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
  }

  function observeContainer(el) {
    if (!el || !global.ResizeObserver) return;
    if (observedEl === el) return;
    if (resizeObs) resizeObs.disconnect();
    observedEl = el;
    resizeObs = new ResizeObserver(function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (lastOpts) draw(lastOpts);
      }, 120);
    });
    resizeObs.observe(el);
  }

  function render(opts) {
    opts = opts || {};
    if (!opts.container) return;
    lastOpts = opts;
    selectedMetric = loadMetric();
    selectedSort = loadSort();
    injectStyles();
    ensureChrome(opts);
    observeContainer(opts.container);
    registerLiveTick();
    draw(opts);
  }

  global.InvestingMapValuation = {
    render: render,
    getMetric: function () {
      return selectedMetric;
    },
    setMetric: function (m) {
      saveMetric(m);
      if (lastOpts) draw(lastOpts);
    },
    _test: {
      percentile: percentile,
      isPlottable: isPlottable,
      resolveDisplay: resolveDisplay,
      marketMetricValue: marketMetricValue,
      formatMetric: formatMetric,
      normalizeMetric: normalizeMetric,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
