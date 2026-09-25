/**
 * Valuation comparison v8 — chain-group PER TTM / FY / PBR / dividend strip.
 * Dot size = EPS(TTM|FY); color = RS vs market RS (shared rs_color_scale diverging).
 * Snapshot: /data/hub_valuation_snapshot.json (KRX FY + Naver TTM for hub).
 */
(function (global) {
  'use strict';

  var lastOpts = null;
  var resizeObs = null;
  var observedEl = null;
  var resizeTimer = null;
  var winResizeBound = false;
  var snapshotCache = null;
  var snapshotLoading = null;
  var liveTickRegistered = false;
  var stylesInjected = false;
  var metricLoaded = false;
  var widthRetryTimer = null;
  var lastChart = { metric: null };
  var lastPaintX = null;
  var lastPaintMetric = null;
  var TRANS_MS = 200;

  var METRICS = ['perTtm', 'perFy', 'pbr', 'dvd'];
  var METRIC_STORAGE = 'im.valuation.metric';
  var state = { metric: 'perTtm', sort: 'chain' };

  var CHG_CLIP = 15;
  var CHG_RANGE = ['#c62828', '#e53935', '#8e3a3a', '#2a2e38', '#2e7d32', '#43a047', '#00c853'];
  var MISSING_COLOR = '#9aa3ad';
  var EPS_R_MIN = 3.5;
  var EPS_R_MAX = 11;

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
        var unit = metric === 'dvd' ? '%' : '×';
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
      legend:
        '점 크기 = EPS(TTM) · 색 = RS (시장 RS 초과 초록 · 미만 빨강) · 세로 점선 = 전 시장 P25/P50/P75(KRX FY)',
      legendPer:
        'PER(TTM) = 주가 ÷ 최근 4분기 EPS (Naver/WISEfn) · 시장 백분위선은 KRX 직전 사업연도 EPS 기준',
      legendRsLo: '시장 RS 미만',
      legendRsMid: '시장 RS',
      legendRsHi: '초과',
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
      tipRs: 'RS',
      tipRsVs: function (marketRs, delta) {
        if (marketRs == null || !isFinite(marketRs)) return '';
        var sign = delta > 0 ? '+' : '';
        return (
          '시장 RS ' +
          (Math.round(marketRs * 10) / 10).toFixed(1) +
          ' 대비 ' +
          sign +
          (Math.round(delta * 10) / 10).toFixed(1)
        );
      },
      marketRsPending: '시장 RS 기준 미로드',
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
        var unit = metric === 'dvd' ? '%' : '×';
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
      legend:
        'Dot size = EPS(TTM) · color = RS (green above market RS · red below) · dashed lines = market P25/P50/P75 (KRX FY)',
      legendPer:
        'PER(TTM) = price ÷ TTM EPS (Naver/WISEfn) · market percentile lines use KRX prior-year EPS',
      legendRsLo: 'Below market RS',
      legendRsMid: 'Market RS',
      legendRsHi: 'Above',
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
      tipRs: 'RS',
      tipRsVs: function (marketRs, delta) {
        if (marketRs == null || !isFinite(marketRs)) return '';
        var sign = delta > 0 ? '+' : '';
        return (
          'vs market RS ' +
          (Math.round(marketRs * 10) / 10).toFixed(1) +
          ' (' +
          sign +
          (Math.round(delta * 10) / 10).toFixed(1) +
          ')'
        );
      },
      marketRsPending: 'Market RS not loaded',
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
    if (metric === 'dvd') return (Math.round(v * 100) / 100).toFixed(2);
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
    if (m === 'dvdYld') return 'dvd';
    return METRICS.indexOf(m) >= 0 ? m : 'perTtm';
  }

  function loadMetricOnce() {
    if (metricLoaded) return;
    metricLoaded = true;
    try {
      var raw = global.localStorage && global.localStorage.getItem(METRIC_STORAGE);
      state.metric = normalizeMetric(raw);
    } catch (e) {
      state.metric = 'perTtm';
    }
  }

  function persistMetric() {
    try {
      if (global.localStorage) global.localStorage.setItem(METRIC_STORAGE, state.metric);
    } catch (e) {}
  }

  /**
   * Viewport-clamp tooltip position.
   * @param {{x:number,y?:number,w:number,h?:number,vw:number,vh?:number}} o
   * @returns {{left:number,top:number}}
   */
  function clampTip(o) {
    var x = Number(o.x) || 0;
    var y = Number(o.y) || 0;
    var w = Number(o.w) || 0;
    var h = Number(o.h) || 0;
    var vw = Number(o.vw) || 0;
    var vh = Number(o.vh);
    if (!isFinite(vh) || vh <= 0) {
      vh = typeof global.innerHeight === 'number' ? global.innerHeight : 1080;
    }
    var left = Math.min(x + 12, vw - w - 8);
    var top = Math.min(y + 12, vh - h - 8);
    if (!isFinite(left)) left = x + 12;
    if (!isFinite(top)) top = y + 12;
    left = Math.max(8, left);
    top = Math.max(8, top);
    return { left: left, top: top };
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
      '.valuation-wrap{display:flex;flex-direction:column;gap:10px;min-height:420px;padding:0 4px 8px 12px;min-width:0}' +
      '.valuation-toolbar{display:flex;flex-direction:column;gap:8px;min-width:0}' +
      '.valuation-seg-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
      '.valuation-seg-title{font-size:11px;font-weight:600;color:var(--text-muted,#8b949e);min-width:2.5em;flex:0 0 auto}' +
      '.valuation-seg{display:inline-flex;flex-wrap:wrap;gap:0;border:1px solid var(--border,#30363d);border-radius:8px;overflow:hidden;background:var(--surface2,#21262d)}' +
      '.valuation-seg button{appearance:none;border:0;border-right:1px solid var(--border,#30363d);background:transparent;color:var(--text,#e6edf3);padding:6px 12px;font-size:12px;cursor:pointer}' +
      '.valuation-seg button:last-child{border-right:0}' +
      '.valuation-seg button.active{background:color-mix(in srgb,var(--accent,#58a6ff) 22%,transparent);color:var(--accent,#58a6ff);font-weight:600}' +
      '.valuation-basis{font-size:12px;color:var(--text-muted,#8b949e);margin:0;margin-left:0;padding:0 8px;overflow:visible;white-space:nowrap}' +
      '#valuation-root{flex:1;min-height:360px;position:relative;min-width:0}' +
      '#valuation-root svg{display:block;width:100%;height:auto}' +
      '#valuation-legend{font-size:12px;color:var(--text-muted,#8b949e);line-height:1.45;padding:0 8px}' +
      '.valuation-legend-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin-top:6px}' +
      '.valuation-gradient{display:inline-block;width:120px;height:10px;border-radius:4px;border:1px solid var(--border,#30363d)}' +
      '.valuation-gradient-label{font-size:11px;color:var(--text-muted,#8b949e)}' +
      '.valuation-tip{position:fixed;z-index:40;pointer-events:none;max-width:260px;background:rgba(22,27,34,.96);border:1px solid var(--border,#30363d);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text,#e6edf3);box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
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

  /** @deprecated chg coloring kept for tests only — dots use RS via InvestingMapRsColor. */
  function colorForChg(pct) {
    if (pct == null || !isFinite(pct) || typeof d3 === 'undefined') return MISSING_COLOR;
    var sc = d3.scaleLinear().domain([-1, -0.66, -0.33, 0, 0.33, 0.66, 1]).range(CHG_RANGE).clamp(true);
    return sc(contrastPct(pct, CHG_CLIP));
  }

  function colorForRsDot(d) {
    if (!global.InvestingMapRsColor || typeof global.InvestingMapRsColor.colorForRs !== 'function') {
      return MISSING_COLOR;
    }
    var center =
      typeof global.InvestingMapRsColor.marketRsFor === 'function'
        ? global.InvestingMapRsColor.marketRsFor(d)
        : 50;
    return global.InvestingMapRsColor.colorForRs(d && d.rs, center);
  }

  /** Prefer TTM EPS; fall back to FY. */
  function resolveEps(q) {
    q = q || {};
    if (q.epsTtm != null && isFinite(q.epsTtm) && q.epsTtm > 0) return q.epsTtm;
    if (q.epsFy != null && isFinite(q.epsFy) && q.epsFy > 0) return q.epsFy;
    if (q.epsTtm != null && isFinite(q.epsTtm)) return q.epsTtm;
    if (q.epsFy != null && isFinite(q.epsFy)) return q.epsFy;
    return null;
  }

  /**
   * Pure sqrt radius for EPS (no d3 required).
   * eps ≤ 0 → EPS_R_MIN (N/A / deficit).
   */
  function epsRadius(eps, domainMin, domainMax) {
    if (!(eps > 0)) return EPS_R_MIN;
    var lo = domainMin;
    var hi = domainMax;
    if (!(hi > lo) || !isFinite(lo) || !isFinite(hi)) return (EPS_R_MIN + EPS_R_MAX) / 2;
    var t = Math.sqrt((eps - lo) / (hi - lo));
    t = Math.max(0, Math.min(1, t));
    return EPS_R_MIN + t * (EPS_R_MAX - EPS_R_MIN);
  }

  function makeEpsRadiusScale(positiveEps) {
    var vals = (positiveEps || []).filter(function (v) {
      return v != null && isFinite(v) && v > 0;
    });
    var lo = vals.length ? Math.min.apply(null, vals) : 1;
    var hi = vals.length ? Math.max.apply(null, vals) : lo;
    if (typeof d3 !== 'undefined' && d3.scaleSqrt) {
      var sc = d3.scaleSqrt().domain([lo, hi]).range([EPS_R_MIN, EPS_R_MAX]).clamp(true);
      return {
        domain: [lo, hi],
        radius: function (eps) {
          if (!(eps > 0)) return EPS_R_MIN;
          return sc(eps);
        },
      };
    }
    return {
      domain: [lo, hi],
      radius: function (eps) {
        return epsRadius(eps, lo, hi);
      },
    };
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
    if (metric === 'dvd') return v >= 0;
    return v > 0;
  }

  function clampNum(v, lo, hi) {
    if (v == null || !isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  /** Floor-index quantile on ascending array (q in 0..1). */
  function quantileAsc(sorted, q) {
    if (!sorted || !sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var i = Math.floor((sorted.length - 1) * q);
    return sorted[Math.max(0, Math.min(sorted.length - 1, i))];
  }

  /**
   * Data-driven x domain for PER/PBR; dvd stays linear 0..max(≤12).
   * @param {string} metric
   * @param {number[]} values plottable member values (loss excluded)
   * @param {{p25?:number|null,p50?:number|null,p75?:number|null}} marketPct
   */
  function computeXDomain(metric, values, marketPct) {
    marketPct = marketPct || {};
    var vals = (values || [])
      .filter(function (v) {
        return v != null && isFinite(v) && (metric === 'dvd' ? v >= 0 : v > 0);
      })
      .slice()
      .sort(function (a, b) {
        return a - b;
      });

    if (metric === 'dvd') {
      var mx = vals.length ? vals[vals.length - 1] : 1;
      var hiDvd = Math.max(1, Math.min(12, mx * 1.05));
      return { lo: 0, hi: hiDvd, domain: [0, hiDvd] };
    }

    var isPbr = metric === 'pbr';
    var loBound = isPbr ? [0.1, 2] : [0.3, 5];
    var hiBound = isPbr ? [3, 50] : [20, 1000];
    var q05 = vals.length ? quantileAsc(vals, 0.05) : isPbr ? 0.5 : 1;
    var q95 = vals.length ? quantileAsc(vals, 0.95) : hiBound[0];
    var lo = clampNum(q05 / 1.25, loBound[0], loBound[1]);
    // Cap on upper quantile (not raw max) so a few extreme PER/PBR don't stretch the axis.
    var hi = clampNum(q95 * 1.6, hiBound[0], hiBound[1]);

    [marketPct.p25, marketPct.p50, marketPct.p75].forEach(function (p) {
      if (p != null && isFinite(p) && p > 0) {
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    });

    if (!(lo > 0)) lo = loBound[0];
    if (!(hi > lo)) hi = lo * 2;
    return { lo: lo, hi: hi, domain: [lo, hi] };
  }

  function makeXScale(metric, width, domain) {
    var dom = domain && domain.length === 2 ? domain : computeXDomain(metric, [], {}).domain;
    if (metric === 'dvd') {
      return d3.scaleLinear().domain(dom).range([0, width]).clamp(true);
    }
    return d3.scaleLog().domain(dom).range([0, width]).clamp(true);
  }

  /** 1-2-5 log ticks with ≥ minGap px spacing. */
  function ticks125(domain, x, minGap) {
    minGap = minGap == null ? 40 : minGap;
    var lo = domain[0];
    var hi = domain[1];
    if (!(lo > 0) || !(hi > lo)) return [];
    var cands = [];
    var exp0 = Math.floor(Math.log10(lo)) - 1;
    var exp1 = Math.ceil(Math.log10(hi)) + 1;
    for (var e = exp0; e <= exp1; e++) {
      [1, 2, 5].forEach(function (m) {
        var v = m * Math.pow(10, e);
        if (v >= lo * 0.999 && v <= hi * 1.001) cands.push(v);
      });
    }
    cands.sort(function (a, b) {
      return a - b;
    });
    var out = [];
    var lastPx = -Infinity;
    cands.forEach(function (v) {
      var px = x(v);
      if (!isFinite(px)) return;
      if (px - lastPx >= minGap) {
        out.push(v);
        lastPx = px;
      }
    });
    return out;
  }

  function formatAxisTick(v, metric) {
    if (metric === 'dvd') return v + '%';
    if (v >= 1000) {
      var k = v / 1000;
      return (Math.abs(k - Math.round(k)) < 1e-6 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
    }
    if (v >= 1) return String(Math.round(v));
    if (v >= 0.1) return (Math.round(v * 10) / 10).toString();
    return String(v);
  }

  function stableJitter(ticker) {
    var s = String(ticker || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((Math.abs(h) % 1000) / 1000 - 0.5) * 10;
  }

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
    if (metric === 'dvd') {
      return {
        value: q.dvdYld != null && isFinite(q.dvdYld) ? q.dvdYld : null,
        fyFallback: false,
        live: false,
      };
    }
    return { value: null, fyFallback: false, live: false };
  }

  function marketMetricValue(q, metric) {
    if (!q) return null;
    if (metric === 'perTtm' || metric === 'perFy') {
      return q.perFy != null && q.perFy > 0 ? q.perFy : null;
    }
    if (metric === 'pbr') return q.pbrFy != null && q.pbrFy > 0 ? q.pbrFy : null;
    if (metric === 'dvd') return q.dvdYld != null && isFinite(q.dvdYld) ? q.dvdYld : null;
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

  function assertToolbarActive(toolbar) {
    if (!toolbar || typeof console === 'undefined' || typeof console.assert !== 'function') return;
    var rows = toolbar.querySelectorAll('.valuation-seg-row');
    var metricRow = rows[0];
    var sortRow = rows[1];
    if (metricRow) {
      var activeM = metricRow.querySelector('button.active');
      console.assert(
        activeM && activeM.getAttribute('data-metric') === state.metric,
        '[valuation] active metric button mismatch',
        state.metric,
        activeM && activeM.getAttribute('data-metric'),
      );
    }
    if (sortRow) {
      var activeS = sortRow.querySelector('button.active');
      console.assert(
        activeS && activeS.getAttribute('data-sort') === state.sort,
        '[valuation] active sort button mismatch',
        state.sort,
        activeS && activeS.getAttribute('data-sort'),
      );
    }
  }

  function setState(patch) {
    if (patch && patch.metric != null) {
      state.metric = normalizeMetric(patch.metric);
      persistMetric();
    }
    if (patch && patch.sort != null) {
      state.sort = patch.sort === 'median' ? 'median' : 'chain';
    }
    renderToolbar();
    renderChart();
  }

  function renderToolbar() {
    if (!lastOpts) return;
    var opts = lastOpts;
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

    function addSegRow(title, items, kind) {
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
        if (kind === 'metric') {
          b.setAttribute('data-metric', it.id);
          if (it.id === state.metric) b.classList.add('active');
          b.addEventListener('click', function () {
            setState({ metric: it.id });
          });
        } else {
          b.setAttribute('data-sort', it.id);
          if (it.id === state.sort) b.classList.add('active');
          b.addEventListener('click', function () {
            setState({ sort: it.id });
          });
        }
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
      'metric',
    );
    addSegRow(
      labels.groupSort,
      [
        { id: 'chain', label: labels.sortChain },
        { id: 'median', label: labels.sortMedian },
      ],
      'sort',
    );
    assertToolbarActive(toolbar);
  }

  function marketRsLoaded() {
    if (global.InvestingMapRsColor && typeof global.InvestingMapRsColor.hasMarketRs === 'function') {
      return !!global.InvestingMapRsColor.hasMarketRs();
    }
    var m = global.InvestingMapMarketRs;
    if (!m || typeof m !== 'object') return false;
    return (
      (typeof m.kospiRs === 'number' && isFinite(m.kospiRs)) ||
      (typeof m.kosdaqRs === 'number' && isFinite(m.kosdaqRs))
    );
  }

  function syncBasisBadge(snapshot, labels, liveSession) {
    var hint = document.getElementById('valuation-hint');
    if (!hint) return;
    var dd = snapshot && snapshot.recentDd ? String(snapshot.recentDd).slice(0, 10) : '';
    var base = !dd
      ? labels.loading
      : liveSession
        ? labels.basisLive(dd)
        : labels.basisClose(dd);
    if (!marketRsLoaded() && labels.marketRsPending) {
      hint.textContent = base + ' · ' + labels.marketRsPending;
    } else {
      hint.textContent = base;
    }
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
        if (lastOpts) renderChart();
      },
    );
  }

  function measureTextWidth(text, fontSize) {
    if (typeof document === 'undefined') {
      return Math.ceil(String(text || '').length * (fontSize || 10) * 0.7);
    }
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden';
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('font-size', String(fontSize || 10));
    t.textContent = text || '';
    svg.appendChild(t);
    document.body.appendChild(svg);
    var w = 0;
    try {
      w = t.getBBox().width;
    } catch (e) {
      w = String(text || '').length * (fontSize || 10) * 0.7;
    }
    document.body.removeChild(svg);
    return Math.ceil(w) || Math.ceil(String(text || '').length * (fontSize || 10) * 0.7);
  }

  function measureContainerWidth(container, attempt, done) {
    attempt = attempt || 0;
    var raf =
      typeof global.requestAnimationFrame === 'function'
        ? global.requestAnimationFrame.bind(global)
        : function (fn) { return setTimeout(fn, 16); };
    raf(function () {
      var tab = document.getElementById('tab-valuation');
      var visible = !tab || tab.classList.contains('active') || tab.offsetParent !== null;
      var rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 0 };
      var w = Math.floor(rect.width || container.clientWidth || 0);
      if ((!visible || w <= 0) && attempt < 12) {
        if (widthRetryTimer) clearTimeout(widthRetryTimer);
        widthRetryTimer = setTimeout(function () {
          measureContainerWidth(container, attempt + 1, done);
        }, 32);
        return;
      }
      done(w > 0 ? w : 640);
    });
  }

  function renderChart() {
    if (!lastOpts) return;
    var opts = lastOpts;
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
        measureContainerWidth(container, 0, function (width) {
          paint(container, companies, snapshot, opts, labels, live, width);
        });
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

  function paint(container, companies, snapshot, opts, labels, liveSession, width) {
    var quotes = (snapshot && snapshot.quotes) || {};
    var metric = state.metric;
    lastChart.metric = metric;
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
      var eps = resolveEps(q);
      byChain[ch].push({
        ticker: t,
        name: lang === 'en' && c.nameEn ? c.nameEn : c.name || t,
        nameEn: c.nameEn,
        chain: ch,
        mcap: c.mcapWon > 0 ? c.mcapWon : null,
        chg1dPct: typeof c.chg1dPct === 'number' ? c.chg1dPct : null,
        rs: typeof c.rs === 'number' && isFinite(c.rs) ? c.rs : null,
        market: c.market || c.Market || '',
        last: typeof c.last === 'number' ? c.last : null,
        value: resolved.value,
        plottable: isPlottable(resolved.value, metric),
        fyFallback: !!resolved.fyFallback,
        live: !!resolved.live,
        eps: eps,
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
      lastPaintX = null;
      return;
    }

    var groups = order.map(function (ch) {
      var items = byChain[ch];
      var vals = items.filter(function (d) { return d.plottable; }).map(function (d) { return d.value; });
      return { chain: ch, items: items, median: groupMedian(vals) };
    });

    if (state.sort === 'median') {
      groups.sort(function (a, b) {
        var am = a.median == null ? Infinity : a.median;
        var bm = b.median == null ? Infinity : b.median;
        return am - bm;
      });
    }

    var plotValues = [];
    groups.forEach(function (g) {
      g.items.forEach(function (d) {
        if (d.plottable) plotValues.push(d.value);
      });
    });
    var domInfo = computeXDomain(metric, plotValues, { p25: p25, p50: p50, p75: p75 });
    var domain = domInfo.domain;

    var bandH = 44;
    var labelW = Math.min(140, Math.floor(width * 0.22));
    var naW = measureTextWidth(labels.naDeficit, 10) + 16;
    var margin = { top: 32, right: 24, bottom: 28, left: labelW };
    var innerW = Math.max(80, width - margin.left - margin.right - naW);
    var height = margin.top + margin.bottom + groups.length * bandH;

    var x = makeXScale(metric, innerW, domain);
    var prevX = lastPaintX;
    var doTrans =
      !!prevX &&
      lastPaintMetric != null &&
      (metric === 'dvd') === (lastPaintMetric === 'dvd');

    function clampPlot(v) {
      if (v == null || !isFinite(v)) return { display: null, dir: 0 };
      if (v > domain[1]) return { display: domain[1], dir: 1 };
      if (metric !== 'dvd' && v < domain[0]) return { display: domain[0], dir: -1 };
      if (metric === 'dvd' && v < 0) return { display: 0, dir: -1 };
      return { display: v, dir: 0 };
    }

    var epsPos = [];
    groups.forEach(function (g) {
      g.items.forEach(function (d) {
        if (d.eps > 0) epsPos.push(d.eps);
      });
    });
    var epsScale = makeEpsRadiusScale(epsPos);
    var rScale = epsScale;

    var svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'valuation-chart')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
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
        var cp = clampPlot(o.v);
        return { p: o.p, v: o.v, x: x(cp.display), x0: prevX ? prevX(cp.display) : x(cp.display) };
      })
      .sort(function (a, b) { return a.x - b.x; });

    pctMarks.forEach(function (o, i) {
      var line = gRoot
        .append('line')
        .attr('class', 'val-pct-line')
        .attr('x1', doTrans ? o.x0 : o.x)
        .attr('x2', doTrans ? o.x0 : o.x)
        .attr('y1', 0)
        .attr('y2', groups.length * bandH)
        .attr('stroke', 'var(--text-muted,#8b949e)')
        .attr('stroke-opacity', o.p === 50 ? 0.55 : 0.35)
        .attr('stroke-dasharray', o.p === 50 ? '4,4' : '2,3');
      if (doTrans) {
        line.transition().duration(TRANS_MS).attr('x1', o.x).attr('x2', o.x);
      }
      var yLab = -8;
      if (i > 0 && Math.abs(o.x - pctMarks[i - 1].x) < 28) {
        yLab = pctMarks[i - 1]._yLab === -8 ? -18 : -8;
      }
      o._yLab = yLab;
      var pLab = gRoot
        .append('text')
        .attr('class', 'val-pct-label')
        .attr('x', (doTrans ? o.x0 : o.x) + 3)
        .attr('y', yLab)
        .attr('fill', 'var(--text-muted,#8b949e)')
        .attr('font-size', 10)
        .text('P' + o.p);
      if (doTrans) {
        pLab.transition().duration(TRANS_MS).attr('x', o.x + 3);
      }
    });

    var tickVals =
      metric === 'dvd'
        ? [0, 2, 4, 6, 8, 10, 12].filter(function (v) {
            return v >= domain[0] && v <= domain[1] + 1e-9;
          })
        : ticks125(domain, x, 40);
    var axisG = gRoot
      .append('g')
      .attr('class', 'val-x-axis')
      .attr('transform', 'translate(0,' + groups.length * bandH + ')');
    var axis = d3.axisBottom(x).tickValues(tickVals).tickFormat(function (v) {
      return formatAxisTick(v, metric);
    });
    if (doTrans && prevX) {
      axisG.call(
        d3.axisBottom(prevX).tickValues(tickVals).tickFormat(function (v) {
          return formatAxisTick(v, metric);
        }),
      );
      axisG.transition().duration(TRANS_MS).call(axis);
    } else {
      axisG.call(axis);
    }
    axisG.selectAll('text').attr('fill', 'var(--text-muted,#8b949e)').attr('font-size', 10);
    axisG.selectAll('.domain, .tick line').attr('stroke', 'var(--border,#30363d)');

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
        var medC = clampPlot(g.median);
        var mx = x(medC.display);
        var mx0 = prevX ? prevX(medC.display) : mx;
        var nPlot = g.items.filter(function (d) { return d.plottable; }).length;
        var medLine = gRoot
          .append('line')
          .attr('class', 'val-median-line')
          .attr('x1', doTrans ? mx0 : mx)
          .attr('x2', doTrans ? mx0 : mx)
          .attr('y1', y0 + 4)
          .attr('y2', y0 + bandH - 4)
          .attr('stroke', 'var(--accent,#58a6ff)')
          .attr('stroke-width', 1.5);
        if (doTrans) {
          medLine.transition().duration(TRANS_MS).attr('x1', mx).attr('x2', mx);
        }
        var medTxt = gRoot
          .append('text')
          .attr('class', 'val-median-label')
          .attr('x', (doTrans ? mx0 : mx) + 4)
          .attr('y', y0 + 12)
          .attr('fill', 'var(--accent,#58a6ff)')
          .attr('font-size', 10)
          .text(labels.medianLabel(g.median, metric, nPlot));
        if (doTrans) {
          medTxt.transition().duration(TRANS_MS).attr('x', mx + 4);
        }
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
        var cy = yMid + stableJitter(d.ticker);
        var cx;
        var cx0;
        var clampDir = 0;
        // EPS ≤ 0 (deficit) → N/A lane at min radius; else metric x when plottable.
        var inNaLane = !d.plottable || !(d.eps > 0);
        if (!inNaLane) {
          var cp = clampPlot(d.value);
          clampDir = cp.dir;
          cx = x(cp.display);
          cx0 = prevX ? prevX(cp.display) : cx;
        } else {
          cx = innerW + 16 + Math.abs(stableJitter(d.ticker + 'na')) * 0.8 + 4;
          cx0 = cx;
          clampDir = 0;
        }
        var r = rScale.radius(d.eps);
        var fill = colorForRsDot(d);

        if (clampDir !== 0) {
          var mark = gRoot
            .append('text')
            .attr('class', 'val-outlier')
            .attr('x', doTrans ? cx0 : cx)
            .attr('y', cy)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', fill)
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .style('cursor', 'pointer')
            .text(clampDir > 0 ? '▶' : '◀');
          if (doTrans) {
            mark.transition().duration(TRANS_MS).attr('x', cx);
          }
          mark
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
        } else {
          var circle = gRoot
            .append('circle')
            .attr('class', 'val-dot')
            .attr('cx', doTrans ? cx0 : cx)
            .attr('cy', cy)
            .attr('r', r)
            .attr('fill', fill)
            .attr('fill-opacity', 0.88)
            .attr('stroke', 'rgba(0,0,0,0.25)')
            .attr('stroke-width', 0.5)
            .style('cursor', 'pointer');
          if (doTrans) {
            circle.transition().duration(TRANS_MS).attr('cx', cx);
          }
          if (d.fyFallback && d.plottable) {
            var fyT = gRoot
              .append('text')
              .attr('class', 'valuation-fy-tag')
              .attr('x', doTrans ? cx0 : cx)
              .attr('y', cy - r - 2)
              .attr('text-anchor', 'middle')
              .text(labels.fyTag);
            if (doTrans) {
              fyT.transition().duration(TRANS_MS).attr('x', cx);
            }
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
        }
      });
    });

    lastPaintX = x;
    lastPaintMetric = metric;

    var legend = opts.legend || document.getElementById('valuation-legend');
    if (legend) {
      var gradCss =
        global.InvestingMapRsColor && typeof global.InvestingMapRsColor.gradientCss === 'function'
          ? global.InvestingMapRsColor.gradientCss()
          : 'background:linear-gradient(to right,#f85149,#6e7681,#3fb950)';
      var rsLabel = marketRsLoaded()
        ? labels.legendRsLo + ' · ' + labels.legendRsMid + ' · ' + labels.legendRsHi
        : labels.marketRsPending || labels.legendRsMid;
      legend.innerHTML =
        '<div>' +
        labels.legend +
        '</div><div class="valuation-legend-row">' +
        '<span class="valuation-gradient" style="' +
        gradCss +
        '" aria-hidden="true"></span>' +
        '<span class="valuation-gradient-label">' +
        rsLabel +
        '</span></div><div style="margin-top:4px">' +
        labels.legendPer +
        '</div>';
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
      (d.eps != null && isFinite(d.eps) ? formatMetric(d.eps, 'perTtm') : '—') +
      ' · ' +
      labels.tipRs +
      ': ' +
      (d.rs != null && isFinite(d.rs) ? (Math.round(d.rs * 10) / 10).toFixed(1) : '—') +
      (function () {
        if (!(d.rs != null && isFinite(d.rs)) || typeof labels.tipRsVs !== 'function') return '';
        var mRs =
          global.InvestingMapRsColor && typeof global.InvestingMapRsColor.marketRsFor === 'function'
            ? global.InvestingMapRsColor.marketRsFor(d)
            : null;
        if (mRs == null || !isFinite(mRs)) return '';
        var vs = labels.tipRsVs(mRs, d.rs - mRs);
        return vs ? ' (' + vs + ')' : '';
      })() +
      '<br>' +
      labels.tipDvd +      ': ' +
      formatMetric(q.dvdYld, 'dvd') +
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
    var tipW = tipEl.offsetWidth || 260;
    var tipH = tipEl.offsetHeight || 80;
    var vw = typeof global.innerWidth === 'number' ? global.innerWidth : 1920;
    var vh = typeof global.innerHeight === 'number' ? global.innerHeight : 1080;
    var pos = clampTip({
      x: ev.clientX || 0,
      y: ev.clientY || 0,
      w: tipW,
      h: tipH,
      vw: vw,
      vh: vh,
    });
    tipEl.style.left = pos.left + 'px';
    tipEl.style.top = pos.top + 'px';
  }

  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
  }

  function scheduleRerender() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (lastOpts) renderChart();
    }, 150);
  }

  function observeContainer(el) {
    if (!el || !global.ResizeObserver) return;
    if (observedEl === el) return;
    if (resizeObs) resizeObs.disconnect();
    observedEl = el;
    resizeObs = new ResizeObserver(function () {
      scheduleRerender();
    });
    resizeObs.observe(el);
  }

  function bindWindowResize() {
    if (winResizeBound || typeof global.addEventListener !== 'function') return;
    winResizeBound = true;
    global.addEventListener('resize', scheduleRerender);
  }

  var marketRsBound = false;
  function bindMarketRs() {
    if (marketRsBound || typeof global.addEventListener !== 'function') return;
    marketRsBound = true;
    global.addEventListener('im:market-rs', function () {
      var tab = document.getElementById('tab-valuation');
      if (!tab || !tab.classList.contains('active')) return;
      if (lastOpts) renderChart();
    });
  }

  /**
   * Pure-ish sync helper for verify (no jsdom required).
   * Sets state.metric and returns active label + chart.metric as if toolbar/chart re-rendered.
   */
  function simulateMetricSelect(metricId, opts) {
    state.metric = normalizeMetric(metricId);
    lastChart.metric = state.metric;
    var labels = labelsFor(opts || { lang: 'ko' });
    return {
      state: { metric: state.metric, sort: state.sort },
      activeLabel: metricButtonLabel(state.metric, labels),
      chart: { metric: lastChart.metric },
    };
  }

  function render(opts) {
    opts = opts || {};
    if (!opts.container) return;
    lastOpts = opts;
    loadMetricOnce();
    injectStyles();
    renderToolbar();
    observeContainer(opts.container);
    bindWindowResize();
    bindMarketRs();
    registerLiveTick();
    renderChart();
  }

  global.InvestingMapValuation = {
    render: render,
    getMetric: function () {
      return state.metric;
    },
    setMetric: function (m) {
      setState({ metric: m });
    },
    getState: function () {
      return { metric: state.metric, sort: state.sort };
    },
    _test: {
      percentile: percentile,
      isPlottable: isPlottable,
      resolveDisplay: resolveDisplay,
      marketMetricValue: marketMetricValue,
      formatMetric: formatMetric,
      normalizeMetric: normalizeMetric,
      clampTip: clampTip,
      computeXDomain: computeXDomain,
      ticks125: ticks125,
      formatAxisTick: formatAxisTick,
      quantileAsc: quantileAsc,
      epsRadius: epsRadius,
      makeEpsRadiusScale: makeEpsRadiusScale,
      resolveEps: resolveEps,
      colorForRsDot: colorForRsDot,
      EPS_R_MIN: EPS_R_MIN,
      EPS_R_MAX: EPS_R_MAX,
      simulateMetricSelect: simulateMetricSelect,
      METRICS: METRICS,
      METRIC_STORAGE: METRIC_STORAGE,
      getState: function () {
        return { metric: state.metric, sort: state.sort };
      },
      getChart: function () {
        return { metric: lastChart.metric };
      },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
