/**
 * Sector company network map (force graph) — sourced edges from data/netmap/<sector>.json.
 * Independent of the WIP relation_network / tab-graph UI.
 */
(function (global) {
  'use strict';

  var EDGE_TYPES = ['supply', 'partner', 'equity', 'peer', 'distribution'];
  var COUNTRIES = ['us', 'tw', 'jp', 'cn', 'eu', 'other'];
  var FILTER_KEY = 'im.netmap.filters';
  var LINK_DIST = { supply: 70, partner: 60, equity: 50, peer: 90, distribution: 70 };
  var COUNTRY_COLOR = {
    us: '#4c8dff',
    tw: '#2bb5a0',
    jp: '#e0607e',
    cn: '#f2a03d',
    eu: '#9b6cf5',
    other: '#b08968',
    kr: '#8b949e',
  };
  var EDGE_COLOR = {
    supply: '#7d8590',
    partner: '#3fb950',
    equity: '#a371f7',
    peer: '#6e7681',
    distribution: '#d29922',
  };

  var ANCHOR_TICKERS = ['005930', '000660'];
  var lastOpts = null;
  var renderSeq = 0;
  var widthRetryTimer = null;
  var stylesInjected = false;
  var recolorBound = false;
  var resizeObs = null;
  var observedEl = null;
  var dataCache = Object.create(null);
  var dataLoading = Object.create(null);
  var anchorRsCache = Object.create(null);
  var anchorFetchPromise = null;
  var sim = null;
  var zoomBehavior = null;
  var svgRoot = null;
  var gRoot = null;
  var layoutWidth = 720;
  var layoutHeight = 560;
  var autoFitArmed = false;
  var userNavigated = false;
  var selectedId = null;
  var tipEl = null;
  var filters = defaultFilters();
  var graphState = { nodes: [], edges: [], raw: null, tickers: Object.create(null) };

  function defaultFilters() {
    return {
      types: { supply: true, partner: true, equity: true, peer: true, distribution: true },
      scope: 'all',
      countries: { us: true, tw: true, jp: true, cn: true, eu: true },
      search: '',
    };
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (!raw) return defaultFilters();
      var j = JSON.parse(raw);
      var d = defaultFilters();
      if (j && typeof j === 'object') {
        if (j.types && typeof j.types === 'object') {
          EDGE_TYPES.forEach(function (t) {
            if (typeof j.types[t] === 'boolean') d.types[t] = j.types[t];
          });
        }
        if (j.scope === 'domestic' || j.scope === 'all') d.scope = j.scope;
        if (j.countries && typeof j.countries === 'object') {
          COUNTRIES.forEach(function (c) {
            if (typeof j.countries[c] === 'boolean') d.countries[c] = j.countries[c];
          });
        }
        if (typeof j.search === 'string') d.search = j.search;
      }
      return d;
    } catch (e) {
      return defaultFilters();
    }
  }

  function saveFilters() {
    try {
      localStorage.setItem(
        FILTER_KEY,
        JSON.stringify({
          types: filters.types,
          scope: filters.scope,
          countries: filters.countries,
          search: filters.search || '',
        }),
      );
    } catch (e) {}
  }

  function labelsFor(opts) {
    var L = (opts && opts.labels) || {};
    return {
      title: L.title || 'Network map',
      search: L.search || 'Search',
      scopeAll: L.scopeAll || 'Domestic + global',
      scopeDomestic: L.scopeDomestic || 'Domestic only',
      fit: L.fit || 'Fit',
      reset: L.reset || 'Reset',
      noData: L.noData || 'No network data.',
      failed: L.failed || 'Could not load network map.',
      loading: L.loading || 'Loading…',
      source: L.source || 'Source',
      openChart: L.openChart || 'Open chart',
      legendRs: L.legendRs || 'Domestic color = RS (green above market · red below) · size = market cap',
      guideDomestic:
        L.guideDomestic ||
        '● Domestic: color = RS (green above market · red below), size = market cap',
      guideGlobal: L.guideGlobal || '■ Global: color = country, size = connection count',
      footerHint: L.footerHint || 'Sources appear in the relation list after clicking a node',
      panelFilters: L.panelFilters || 'Filters & legend',
      sectionSearch: L.sectionSearch || 'Search',
      sectionTypes: L.sectionTypes || 'Relation types',
      sectionScope: L.sectionScope || 'Scope',
      sectionCountries: L.sectionCountries || 'Countries',
      sectionGuide: L.sectionGuide || 'Node guide',
      close: L.close || 'Close',
      asOfLabel: L.asOfLabel || 'as of',
      nodesLabel: L.nodesLabel || 'nodes',
      edgesLabel: L.edgesLabel || 'edges',
      types: L.types || {},
      countries: L.countries || {},
      countryNames: L.countryNames || {},
    };
  }

  function isDomesticNode(n) {
    if (!n) return false;
    if (n.country === 'kr') return true;
    var t = String(n.type || '');
    return t.indexOf('kr_') === 0;
  }

  function isGlobalNode(n) {
    return n && n.type === 'global';
  }

  function isAnchorNode(n) {
    return n && n.type === 'kr_anchor';
  }

  /** Pure: filter nodes/edges by type/scope/country chips. Search is highlight-only. */
  function filterGraph(raw, filt) {
    filt = filt || defaultFilters();
    var types = filt.types || {};
    var scope = filt.scope === 'domestic' ? 'domestic' : 'all';
    var countries = filt.countries || {};
    var nodesIn = (raw && raw.nodes) || [];
    var edgesIn = (raw && raw.edges) || [];

    var keepNode = Object.create(null);
    nodesIn.forEach(function (n) {
      if (!n || !n.id) return;
      if (scope === 'domestic') {
        if (!isDomesticNode(n)) return;
      } else if (isGlobalNode(n)) {
        var c = String(n.country || '').toLowerCase();
        if (c === 'kr') {
          /* keep */
        } else if (COUNTRIES.indexOf(c) >= 0) {
          if (countries[c] === false) return;
        }
      }
      keepNode[n.id] = true;
    });

    var edges = [];
    edgesIn.forEach(function (e) {
      if (!e || !e.source || !e.target) return;
      if (e.source === e.target) return;
      var ty = String(e.type || '');
      if (types[ty] === false) return;
      if (!keepNode[e.source] || !keepNode[e.target]) return;
      edges.push(e);
    });

    // Keep all nodes that pass keepNode — including isolated domestic listings (degree 0).
    var nodes = nodesIn.filter(function (n) {
      return n && keepNode[n.id];
    });
    return { nodes: nodes, edges: edges };
  }

  function edgeStyle(type, confidence) {
    var t = String(type || 'peer');
    var conf = String(confidence || 'medium');
    var width = conf === 'high' ? 1.8 : conf === 'low' ? 0.8 : 1.2;
    var opacity = conf === 'low' ? 0.5 : 1;
    var dash = t === 'equity' ? '6,4' : t === 'peer' ? '2,3' : null;
    var arrow = t === 'peer' ? false : true;
    return {
      color: EDGE_COLOR[t] || '#7d8590',
      width: width,
      opacity: opacity,
      dasharray: dash,
      arrow: arrow,
      distance: LINK_DIST[t] != null ? LINK_DIST[t] : 70,
    };
  }

  function mcapRadiusScale(companies) {
    var vals = [];
    (companies || []).forEach(function (c) {
      if (c && c.mcapWon > 0) vals.push(c.mcapWon);
    });
    vals.sort(function (a, b) {
      return a - b;
    });
    var lo = vals.length ? vals[0] : 1e11;
    var hi = vals.length ? vals[vals.length - 1] : 1e13;
    if (hi <= lo) hi = lo * 10;
    return function (mcap) {
      if (!(mcap > 0)) return 8;
      var t = (Math.sqrt(mcap) - Math.sqrt(lo)) / (Math.sqrt(hi) - Math.sqrt(lo) || 1);
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      return 6 + t * 20;
    };
  }

  function nodeRadius(node, mcapScale, degree) {
    if (!node) return 8;
    if (isGlobalNode(node)) {
      var d = Math.max(0, Number(degree) || 0);
      var t = Math.min(1, d / 12);
      return 10 + t * 12;
    }
    var r = typeof mcapScale === 'function' ? mcapScale(node._mcapWon) : 8;
    if (!(r > 0)) r = 8;
    if (isAnchorNode(node)) r = Math.min(30, Math.max(r, 18));
    return r;
  }

  /** Chain / country seed positions for weak structural forces. */
  function computeLayoutSeeds(chains, countries, width, height) {
    var cx = width / 2;
    var cy = height / 2;
    var chainList = chains || [];
    var countryList = countries || COUNTRIES.slice();
    var chainCenters = Object.create(null);
    var n = Math.max(chainList.length, 1);
    var domesticR = Math.min(width, height) * 0.28;
    chainList.forEach(function (ch, i) {
      var a = (2 * Math.PI * i) / n - Math.PI / 2;
      chainCenters[ch] = { x: cx + Math.cos(a) * domesticR, y: cy + Math.sin(a) * domesticR };
    });
    var countryAngles = Object.create(null);
    var cn = Math.max(countryList.length, 1);
    countryList.forEach(function (c, i) {
      countryAngles[c] = (2 * Math.PI * i) / cn - Math.PI / 2;
    });
    return {
      cx: cx,
      cy: cy,
      chainCenters: chainCenters,
      countryAngles: countryAngles,
      domesticR: domesticR,
      isolateR: domesticR * 1.15,
      radial: Math.min(width, height) * 0.42,
    };
  }

  /**
   * Pure fit transform from node coordinates.
   * @returns {{ scale: number, tx: number, ty: number, minX: number, maxX: number, minY: number, maxY: number }}
   */
  function computeFit(nodes, width, height, opts) {
    opts = opts || {};
    var padding = opts.padding != null ? opts.padding : 40;
    var maxScale = opts.maxScale != null ? opts.maxScale : 1.6;
    var list = nodes || [];
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    var count = 0;
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n || n.x == null || n.y == null || !isFinite(n.x) || !isFinite(n.y)) continue;
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
      count += 1;
    }
    if (!count) {
      return { scale: 1, tx: 0, ty: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    var bw = Math.max(1, maxX - minX);
    var bh = Math.max(1, maxY - minY);
    var availW = Math.max(1, width - padding * 2);
    var availH = Math.max(1, height - padding * 2);
    var scale = Math.min(maxScale, availW / bw, availH / bh);
    if (!(scale > 0) || !isFinite(scale)) scale = 1;
    var tx = width / 2 - (scale * (minX + maxX)) / 2;
    var ty = height / 2 - (scale * (minY + maxY)) / 2;
    return { scale: scale, tx: tx, ty: ty, minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function clampNodeToStage(n, width, height) {
    if (!n) return;
    var cx = width / 2;
    var cy = height / 2;
    var halfW = width * 0.7;
    var halfH = height * 0.7;
    if (n.x < cx - halfW) n.x = cx - halfW;
    else if (n.x > cx + halfW) n.x = cx + halfW;
    if (n.y < cy - halfH) n.y = cy - halfH;
    else if (n.y > cy + halfH) n.y = cy + halfH;
  }

  function markUserNavigated() {
    userNavigated = true;
    autoFitArmed = false;
  }

  function maybeAutoFitOnce() {
    if (!autoFitArmed || userNavigated) return;
    autoFitArmed = false;
    fitView({ padding: 40, maxScale: 1.6, animate: true });
  }

  function domainOfUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return String(url || '').slice(0, 40);
    }
  }

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css =
      '.netmap-shell{display:flex;gap:12px;align-items:stretch;min-height:560px}' +
      '.netmap-panel-fold{flex:0 0 240px;min-width:240px;max-width:240px;align-self:stretch}' +
      '.netmap-panel-fold>summary{display:none;list-style:none;cursor:pointer;padding:10px 12px;border:1px solid var(--border,#30363d);border-radius:10px;background:var(--surface,#161b22);color:var(--text,#e6edf3);font-size:13px;font-weight:600}' +
      '.netmap-panel-fold>summary::-webkit-details-marker{display:none}' +
      '.netmap-panel{background:var(--surface,#161b22);border:1px solid var(--border,#30363d);border-radius:10px;padding:12px;overflow:auto;max-height:clamp(560px,72vh,860px);position:sticky;top:0;box-sizing:border-box}' +
      '.netmap-panel-sec{margin:0 0 14px}' +
      '.netmap-panel-sec:last-child{margin-bottom:0}' +
      '.netmap-panel-label{display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#8b949e);margin:0 0 6px;font-weight:600}' +
      '.netmap-panel input[type=search]{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font:inherit;font-size:13px}' +
      '.netmap-panel-list{display:flex;flex-direction:column;gap:4px}' +
      '.netmap-panel-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 8px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font:inherit;font-size:12px;cursor:pointer;opacity:.45}' +
      '.netmap-panel-row.is-on{opacity:1;border-color:var(--accent,#58a6ff);background:color-mix(in srgb,var(--accent,#58a6ff) 14%,var(--surface2,#21262d))}' +
      '.netmap-panel-row-label{flex:1;min-width:0}' +
      '.netmap-panel-row-count{color:var(--text-muted,#8b949e);font-variant-numeric:tabular-nums;font-size:11px}' +
      '.netmap-panel-row .netmap-ccode{font-weight:700;min-width:22px}' +
      '.netmap-panel-row .netmap-cname{flex:1;color:var(--text-muted,#8b949e);font-size:11px}' +
      '.netmap-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px}' +
      '.netmap-seg button{padding:7px 6px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font:inherit;font-size:11px;cursor:pointer}' +
      '.netmap-seg button.is-on{color:var(--text,#e6edf3);border-color:var(--accent,#58a6ff);background:color-mix(in srgb,var(--accent,#58a6ff) 16%,var(--surface2,#21262d))}' +
      '.netmap-panel-countries.is-disabled{opacity:.4;pointer-events:none}' +
      '.netmap-panel-guide{font-size:12px;color:var(--text-muted,#8b949e);line-height:1.45;margin:0}' +
      '.netmap-panel-guide p{margin:0 0 6px}' +
      '.netmap-panel-footer{font-size:11px;color:var(--text-muted,#8b949e);line-height:1.45;border-top:1px solid var(--border,#30363d);padding-top:10px}' +
      '.netmap-edge-swatch{position:relative;display:inline-block;width:28px;height:12px;flex:0 0 28px}' +
      '.netmap-edge-swatch::before{content:"";position:absolute;left:0;right:5px;top:50%;border-top:2px solid #7d8590}' +
      '.netmap-edge-swatch.partner::before{border-color:#3fb950}' +
      '.netmap-edge-swatch.equity::before{border-color:#a371f7;border-top-style:dashed}' +
      '.netmap-edge-swatch.peer::before{border-color:#6e7681;border-top-style:dotted}' +
      '.netmap-edge-swatch.distribution::before{border-color:#d29922}' +
      '.netmap-edge-swatch.has-arrow::after{content:"";position:absolute;right:0;top:50%;transform:translateY(-50%);border:4px solid transparent;border-left-color:#7d8590}' +
      '.netmap-edge-swatch.partner.has-arrow::after{border-left-color:#3fb950}' +
      '.netmap-edge-swatch.equity.has-arrow::after{border-left-color:#a371f7}' +
      '.netmap-edge-swatch.distribution.has-arrow::after{border-left-color:#d29922}' +
      '.netmap-dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:0 0 10px}' +
      '.netmap-stage{position:relative;flex:1;min-width:0;min-height:clamp(560px,72vh,860px)}' +
      '#netmap-root{height:clamp(560px,72vh,860px);border:1px solid var(--border,#30363d);border-radius:10px;background:var(--surface,#161b22);overflow:hidden}' +
      '#netmap-root svg{display:block;width:100%;height:100%}' +
      '.netmap-stage-actions{position:absolute;top:12px;left:12px;z-index:3;display:flex;gap:6px}' +
      '.netmap-stage-actions button{padding:5px 10px;border:1px solid var(--border,#30363d);border-radius:8px;background:color-mix(in srgb,var(--surface,#161b22) 88%,transparent);backdrop-filter:blur(6px);color:var(--text,#e6edf3);font:inherit;font-size:12px;cursor:pointer}' +
      '#netmap-side{position:absolute;top:12px;right:12px;width:320px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);overflow:auto;z-index:4;border:1px solid var(--border,#30363d);border-radius:10px;padding:12px;box-sizing:border-box;background:color-mix(in srgb,var(--surface,#161b22) 88%,transparent);backdrop-filter:blur(10px)}' +
      '#netmap-side[hidden]{display:none!important}' +
      '.netmap-side-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px}' +
      '.netmap-side-title{font-weight:700;margin:0;font-size:14px}' +
      '.netmap-side-close{border:0;background:transparent;color:var(--text-muted,#8b949e);cursor:pointer;font-size:18px;line-height:1;padding:0 2px}' +
      '.netmap-side-meta{font-size:12px;color:var(--text-muted,#8b949e);margin-bottom:10px}' +
      '.netmap-rel{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-top:1px solid var(--border,#30363d);font-size:12px}' +
      '.netmap-rel-row{display:flex;gap:6px;align-items:flex-start}' +
      '.netmap-badge{display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;border:1px solid var(--border,#30363d);color:var(--text-muted,#8b949e)}' +
      '.netmap-badge.high{color:#3fb950;border-color:#3fb950}' +
      '.netmap-badge.medium{color:#d29922;border-color:#d29922}' +
      '.netmap-badge.low{opacity:.7}' +
      '.netmap-open-chart{margin:0 0 10px;padding:6px 10px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font:inherit;font-size:12px;cursor:pointer}' +
      '.netmap-tip{position:fixed;z-index:40;pointer-events:none;max-width:280px;padding:8px 10px;border-radius:8px;background:rgba(22,27,34,.96);border:1px solid var(--border,#30363d);color:var(--text,#e6edf3);font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
      '@media (max-width:899px){' +
      '.netmap-shell{flex-direction:column;min-height:0}' +
      '.netmap-panel-fold{flex:none;min-width:0;max-width:none;width:100%}' +
      '.netmap-panel-fold>summary{display:block;margin-bottom:8px}' +
      '.netmap-panel{position:static;max-height:50vh;margin-top:0}' +
      '.netmap-panel-fold:not([open]) .netmap-panel{display:none}' +
      '.netmap-stage{min-height:520px}' +
      '#netmap-root{height:520px}' +
      '#netmap-side:not([hidden]){position:sticky;top:auto;right:auto;bottom:0;width:100%;max-width:none;max-height:40vh;border-radius:10px 10px 0 0}' +
      '}';
    var el = document.createElement('style');
    el.id = 'im-netmap-css';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'netmap-tip';
    tipEl.style.display = 'none';
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function showTip(ev, html) {
    var el = ensureTip();
    el.innerHTML = html;
    el.style.display = 'block';
    var x = (ev.clientX || 0) + 12;
    var y = (ev.clientY || 0) + 12;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
  }

  function pruneExtraSvgs(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    var svgs = container.querySelectorAll('svg');
    if (!svgs || svgs.length <= 1) return;
    for (var i = 1; i < svgs.length; i++) {
      if (svgs[i].parentNode) svgs[i].parentNode.removeChild(svgs[i]);
    }
  }

  function measureContainerWidth(container, attempt, done) {
    attempt = attempt || 0;
    var raf =
      typeof global.requestAnimationFrame === 'function'
        ? global.requestAnimationFrame.bind(global)
        : function (fn) {
            return setTimeout(fn, 16);
          };
    raf(function () {
      var tab = document.getElementById('tab-netmap');
      var visible = !tab || tab.classList.contains('active') || tab.offsetParent !== null;
      var rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 0 };
      var w = Math.floor(rect.width || container.clientWidth || 0);
      var h = Math.floor(rect.height || container.clientHeight || 0);
      if ((!visible || w <= 0) && attempt < 12) {
        if (widthRetryTimer) clearTimeout(widthRetryTimer);
        widthRetryTimer = setTimeout(function () {
          measureContainerWidth(container, attempt + 1, done);
        }, 32);
        return;
      }
      done(w > 0 ? w : 720, h > 200 ? h : 560);
    });
  }

  function fetchData(url) {
    if (dataCache[url]) return Promise.resolve(dataCache[url]);
    if (dataLoading[url]) return dataLoading[url];
    dataLoading[url] = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        dataCache[url] = j;
        dataLoading[url] = null;
        return j;
      })
      .catch(function (e) {
        dataLoading[url] = null;
        throw e;
      });
    return dataLoading[url];
  }

  function indexCompanies(companies) {
    var map = Object.create(null);
    (companies || []).forEach(function (c) {
      if (!c || !c.ticker) return;
      map[String(c.ticker)] = c;
    });
    return map;
  }

  function enrichNodes(nodes, tickers) {
    return (nodes || []).map(function (n) {
      var copy = Object.assign({}, n);
      if (n.ticker && tickers[String(n.ticker)]) {
        var c = tickers[String(n.ticker)];
        copy._mcapWon = c.mcapWon > 0 ? c.mcapWon : null;
        copy._rs = typeof c.rs === 'number' && isFinite(c.rs) ? c.rs : null;
        copy._market = c.market || c.Market || '';
        copy._company = c;
      } else {
        copy._mcapWon = null;
        copy._rs = null;
        copy._market = '';
        copy._company = null;
      }
      return copy;
    });
  }

  function degreeMap(edges) {
    var d = Object.create(null);
    (edges || []).forEach(function (e) {
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      d[s] = (d[s] || 0) + 1;
      d[t] = (d[t] || 0) + 1;
    });
    return d;
  }

  function stopSim() {
    if (sim) {
      try {
        sim.stop();
      } catch (e) {}
      sim = null;
    }
  }

  function colorForDomestic(node, tickers, anchorRs) {
    var rsMod = global.InvestingMapRsColor;
    if (!rsMod || typeof rsMod.colorForRs !== 'function') return '#9aa3ad';
    tickers = tickers || (graphState && graphState.tickers) || Object.create(null);
    anchorRs = anchorRs || anchorRsCache;
    var ticker = node && node.ticker != null ? String(node.ticker) : '';
    var company =
      (ticker && tickers[ticker]) ||
      (node && node._company) ||
      null;
    var rs = null;
    var marketHint = '';
    if (company) {
      rs = typeof company.rs === 'number' && isFinite(company.rs) ? company.rs : null;
      marketHint = company.market || company.Market || '';
    } else if (ticker && anchorRs[ticker] && typeof anchorRs[ticker].rs === 'number') {
      rs = anchorRs[ticker].rs;
      marketHint = anchorRs[ticker].market || '';
    } else if (node && typeof node._rs === 'number' && isFinite(node._rs)) {
      rs = node._rs;
      marketHint = node._market || '';
    }
    var marketRs =
      typeof rsMod.marketRsFor === 'function'
        ? rsMod.marketRsFor(company || { market: marketHint })
        : null;
    return rsMod.colorForRs(rs, marketRs);
  }

  function syncNodeRsFromLive(node) {
    if (!node || !node.ticker) return;
    var ticker = String(node.ticker);
    var c = graphState.tickers && graphState.tickers[ticker];
    if (c) {
      node._company = c;
      node._rs = typeof c.rs === 'number' && isFinite(c.rs) ? c.rs : null;
      node._market = c.market || c.Market || '';
      if (c.mcapWon > 0) node._mcapWon = c.mcapWon;
      return;
    }
    var a = anchorRsCache[ticker];
    if (a && typeof a.rs === 'number') {
      node._rs = a.rs;
      node._market = a.market || node._market || '';
    }
  }

  function recolorNodes() {
    if (!lastOpts) return;
    graphState.tickers = indexCompanies(lastOpts.companies);
    if (!gRoot || typeof d3 === 'undefined') return;
    gRoot.selectAll('.nm-node').each(function (d) {
      if (!d || isGlobalNode(d)) return;
      syncNodeRsFromLive(d);
      var fill = colorForDomestic(d, graphState.tickers, anchorRsCache);
      d3.select(this).select('circle').attr('fill', fill);
    });
  }

  function fetchAnchorRs() {
    var missing = ANCHOR_TICKERS.filter(function (t) {
      return !(anchorRsCache[t] && typeof anchorRsCache[t].rs === 'number');
    });
    if (!missing.length) return Promise.resolve(anchorRsCache);
    if (anchorFetchPromise) return anchorFetchPromise;
    var origin = '';
    try {
      origin = global.location && global.location.origin ? global.location.origin : '';
    } catch (e) {
      origin = '';
    }
    var url = (origin || '') + '/api/quotes?codes=' + ANCHOR_TICKERS.join(',');
    anchorFetchPromise = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('anchor_quotes_' + r.status);
        return r.json();
      })
      .then(function (j) {
        var items = (j && j.items) || {};
        ANCHOR_TICKERS.forEach(function (t) {
          var row = items[t] || items[String(Number(t))] || null;
          if (row && typeof row.rs === 'number' && isFinite(row.rs)) {
            anchorRsCache[t] = {
              rs: row.rs,
              market: row.market || row.Market || (t === '005930' || t === '000660' ? 'KOSPI' : ''),
            };
          }
        });
        anchorFetchPromise = null;
        return anchorRsCache;
      })
      .catch(function () {
        anchorFetchPromise = null;
        return anchorRsCache;
      });
    return anchorFetchPromise;
  }

  function bindRecolorListeners() {
    if (recolorBound) return;
    recolorBound = true;
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('im:market-rs', function () {
        recolorNodes();
      });
    }
    var Tick = global.InvestingMapReturnsTick;
    if (Tick && typeof Tick.register === 'function') {
      Tick.register(
        'netmap',
        function () {
          return Promise.resolve({ data: {}, dataVersion: String(Date.now()) });
        },
        function () {
          recolorNodes();
        },
      );
    }
  }

  function observeStageResize(el) {
    if (!el || typeof global.ResizeObserver !== 'function') return;
    if (observedEl === el) return;
    if (resizeObs) {
      try {
        resizeObs.disconnect();
      } catch (e) {}
    }
    observedEl = el;
    resizeObs = new global.ResizeObserver(function () {
      updateViewBoxOnly();
    });
    resizeObs.observe(el);
  }

  function updateViewBoxOnly() {
    if (!svgRoot || !lastOpts || !lastOpts.container) return;
    measureContainerWidth(lastOpts.container, 0, function (w, h) {
      layoutWidth = w;
      layoutHeight = h;
      try {
        svgRoot.attr('viewBox', '0 0 ' + w + ' ' + h);
      } catch (e) {}
    });
  }

  function matchesSearch(node, q) {
    if (!q) return false;
    var s = q.toLowerCase();
    return (
      String(node.nameKo || '')
        .toLowerCase()
        .indexOf(s) >= 0 ||
      String(node.nameEn || '')
        .toLowerCase()
        .indexOf(s) >= 0 ||
      String(node.ticker || '')
        .toLowerCase()
        .indexOf(s) >= 0 ||
      String(node.id || '')
        .toLowerCase()
        .indexOf(s) >= 0
    );
  }

  function clearSelection() {
    selectedId = null;
    if (gRoot) {
      gRoot.selectAll('.nm-node').style('opacity', 1);
      gRoot.selectAll('.nm-link').style('opacity', function (d) {
        return edgeStyle(d.type, d.confidence).opacity;
      });
      gRoot.selectAll('.nm-label').style('opacity', 1);
    }
    renderSide(null);
  }

  function neighborSet(id, edges) {
    var set = Object.create(null);
    set[id] = true;
    (edges || []).forEach(function (e) {
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      if (s === id) set[t] = true;
      if (t === id) set[s] = true;
    });
    return set;
  }

  function selectNode(id) {
    if (selectedId === id) {
      clearSelection();
      return;
    }
    selectedId = id;
    var keep = neighborSet(id, graphState.edges);
    if (gRoot) {
      gRoot.selectAll('.nm-node').style('opacity', function (d) {
        return keep[d.id] ? 1 : 0.12;
      });
      gRoot.selectAll('.nm-label').style('opacity', function (d) {
        return keep[d.id] ? 1 : 0.12;
      });
      gRoot.selectAll('.nm-link').style('opacity', function (d) {
        var s = typeof d.source === 'object' ? d.source.id : d.source;
        var t = typeof d.target === 'object' ? d.target.id : d.target;
        var base = edgeStyle(d.type, d.confidence).opacity;
        return keep[s] && keep[t] && (s === id || t === id) ? base : 0.08;
      });
    }
    var node = graphState.nodes.find(function (n) {
      return n.id === id;
    });
    renderSide(node);
  }

  function renderSide(node) {
    var side = lastOpts && lastOpts.side;
    if (!side) return;
    var labels = labelsFor(lastOpts);
    var lang = lastOpts.lang === 'en' ? 'en' : 'ko';
    if (!node) {
      side.hidden = true;
      side.innerHTML = '';
      return;
    }
    side.hidden = false;
    var name = lang === 'en' ? node.nameEn || node.nameKo : node.nameKo || node.nameEn;
    var html = '';
    html += '<div class="netmap-side-head">';
    html += '<p class="netmap-side-title">' + escapeHtml(name) + '</p>';
    html +=
      '<button type="button" class="netmap-side-close" aria-label="' +
      escapeAttr(labels.close) +
      '">×</button>';
    html += '</div>';
    html +=
      '<div class="netmap-side-meta">' +
      escapeHtml([node.chain, node.role, node.country].filter(Boolean).join(' · ')) +
      '</div>';
    if (node.ticker && global.InvestingMapCandleModal && typeof global.InvestingMapCandleModal.open === 'function') {
      html +=
        '<button type="button" class="netmap-open-chart" data-ticker="' +
        escapeAttr(node.ticker) +
        '" data-name="' +
        escapeAttr(name) +
        '">' +
        escapeHtml(labels.openChart) +
        '</button>';
    }
    var edges = graphState.edges.filter(function (e) {
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      return s === node.id || t === node.id;
    });
    var byId = Object.create(null);
    graphState.nodes.forEach(function (n) {
      byId[n.id] = n;
    });
    edges.forEach(function (e) {
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      var out = s === node.id;
      var otherId = out ? t : s;
      var other = byId[otherId];
      var otherName = other
        ? lang === 'en'
          ? other.nameEn || other.nameKo
          : other.nameKo || other.nameEn
        : otherId;
      var dir =
        e.type === 'peer' ? '↔' : out ? '→' : '←';
      var conf = String(e.confidence || 'medium');
      html += '<div class="netmap-rel">';
      html +=
        '<div class="netmap-rel-row"><span>' +
        dir +
        '</span><strong>' +
        escapeHtml(otherName) +
        '</strong> <span class="netmap-badge ' +
        escapeAttr(conf) +
        '">' +
        escapeHtml(conf) +
        '</span></div>';
      html += '<div>' + escapeHtml(e.labelKo || e.type) + '</div>';
      var ev = (e.evidence && e.evidence[0]) || null;
      if (ev && ev.url) {
        html +=
          '<div><a href="' +
          escapeAttr(ev.url) +
          '" target="_blank" rel="noopener">' +
          escapeHtml(labels.source + ': ' + domainOfUrl(ev.url)) +
          '</a></div>';
      }
      html += '</div>';
    });
    side.innerHTML = html;
    var closeBtn = side.querySelector('.netmap-side-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        clearSelection();
      });
    }
    var btn = side.querySelector('.netmap-open-chart');
    if (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-ticker');
        var nm = btn.getAttribute('data-name');
        try {
          global.InvestingMapCandleModal.open(code, nm);
        } catch (err) {
          try {
            global.InvestingMapCandleModal.open({ ticker: code, name: nm });
          } catch (e2) {}
        }
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function countEdgesByType(raw, filt) {
    var base = Object.assign({}, filt || defaultFilters(), {
      types: { supply: true, partner: true, equity: true, peer: true, distribution: true },
    });
    var g = filterGraph(raw, base);
    var counts = { supply: 0, partner: 0, equity: 0, peer: 0, distribution: 0 };
    g.edges.forEach(function (e) {
      if (counts[e.type] != null) counts[e.type] += 1;
    });
    return counts;
  }

  function countNodesByCountry(raw, filt) {
    var base = Object.assign({}, filt || defaultFilters(), { scope: 'all' });
    var g = filterGraph(raw, base);
    var counts = { us: 0, tw: 0, jp: 0, cn: 0, eu: 0 };
    g.nodes.forEach(function (n) {
      if (!isGlobalNode(n)) return;
      var c = String(n.country || '').toLowerCase();
      if (counts[c] != null) counts[c] += 1;
    });
    return counts;
  }

  function updatePanelCounts(panel, labels) {
    if (!panel || !graphState.raw) return;
    var typeCounts = countEdgesByType(graphState.raw, filters);
    EDGE_TYPES.forEach(function (t) {
      var el = panel.querySelector('[data-type-count="' + t + '"]');
      if (el) el.textContent = String(typeCounts[t] || 0);
    });
    var countryCounts = countNodesByCountry(graphState.raw, filters);
    COUNTRIES.forEach(function (c) {
      var el = panel.querySelector('[data-country-count="' + c + '"]');
      if (el) el.textContent = String(countryCounts[c] || 0);
    });
    var countriesSec = panel.querySelector('.netmap-panel-countries');
    if (countriesSec) {
      countriesSec.classList.toggle('is-disabled', filters.scope === 'domestic');
    }
    var filtered = filterGraph(graphState.raw, filters);
    var footer = panel.querySelector('.netmap-panel-footer-stats');
    if (footer) {
      var asOf = (graphState.raw && graphState.raw.asOf) || '';
      footer.textContent =
        (labels.asOfLabel || 'as of') +
        ' ' +
        asOf +
        ' · ' +
        (labels.nodesLabel || 'nodes') +
        ' ' +
        filtered.nodes.length +
        ' · ' +
        (labels.edgesLabel || 'edges') +
        ' ' +
        filtered.edges.length;
    }
  }

  function ensureStageActions(labels) {
    var stage =
      lastOpts && lastOpts.container && lastOpts.container.closest
        ? lastOpts.container.closest('.netmap-stage')
        : null;
    if (!stage) return;
    var host = stage.querySelector('.netmap-stage-actions');
    if (!host) {
      host = document.createElement('div');
      host.className = 'netmap-stage-actions';
      stage.appendChild(host);
    }
    host.innerHTML = '';
    var fitBtn = document.createElement('button');
    fitBtn.type = 'button';
    fitBtn.textContent = labels.fit;
    fitBtn.addEventListener('click', fitView);
    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = labels.reset;
    resetBtn.addEventListener('click', function () {
      filters = defaultFilters();
      saveFilters();
      var panel = document.getElementById('netmap-panel');
      if (panel) buildPanel(panel, labelsFor(lastOpts));
      restartGraph();
    });
    host.appendChild(fitBtn);
    host.appendChild(resetBtn);
  }

  function buildPanel(panel, labels) {
    if (!panel) return;
    var fold = panel.closest ? panel.closest('.netmap-panel-fold') : null;
    if (fold && typeof fold.open === 'boolean') {
      fold.open = !layoutIsDrawer();
    }
    panel.innerHTML = '';

    function sec(labelText) {
      var s = document.createElement('div');
      s.className = 'netmap-panel-sec';
      var lab = document.createElement('span');
      lab.className = 'netmap-panel-label';
      lab.textContent = labelText;
      s.appendChild(lab);
      panel.appendChild(s);
      return s;
    }

    var searchSec = sec(labels.sectionSearch);
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = labels.search;
    search.value = filters.search || '';
    search.addEventListener('input', function () {
      filters.search = search.value || '';
      saveFilters();
      applySearchHighlight();
      if (filters.search) focusSearchMatch();
    });
    searchSec.appendChild(search);

    var typeSec = sec(labels.sectionTypes);
    var typeList = document.createElement('div');
    typeList.className = 'netmap-panel-list';
    EDGE_TYPES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'netmap-panel-row' + (filters.types[t] ? ' is-on' : '');
      b.setAttribute('data-type', t);
      var sw = document.createElement('span');
      sw.className =
        'netmap-edge-swatch ' + t + (t === 'peer' ? '' : ' has-arrow');
      b.appendChild(sw);
      var lab = document.createElement('span');
      lab.className = 'netmap-panel-row-label';
      lab.textContent = (labels.types && labels.types[t]) || t;
      b.appendChild(lab);
      var cnt = document.createElement('span');
      cnt.className = 'netmap-panel-row-count';
      cnt.setAttribute('data-type-count', t);
      cnt.textContent = '0';
      b.appendChild(cnt);
      b.addEventListener('click', function () {
        filters.types[t] = !filters.types[t];
        b.classList.toggle('is-on', !!filters.types[t]);
        saveFilters();
        restartGraph();
      });
      typeList.appendChild(b);
    });
    typeSec.appendChild(typeList);

    var scopeSec = sec(labels.sectionScope);
    var seg = document.createElement('div');
    seg.className = 'netmap-seg';
    ;[
      ['all', labels.scopeAll],
      ['domestic', labels.scopeDomestic],
    ].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = filters.scope === pair[0] ? 'is-on' : '';
      b.textContent = pair[1];
      b.addEventListener('click', function () {
        filters.scope = pair[0];
        saveFilters();
        var buttons = seg.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].classList.toggle('is-on', i === (pair[0] === 'all' ? 0 : 1));
        }
        restartGraph();
      });
      seg.appendChild(b);
    });
    scopeSec.appendChild(seg);

    var countrySec = sec(labels.sectionCountries);
    countrySec.classList.add('netmap-panel-countries');
    if (filters.scope === 'domestic') countrySec.classList.add('is-disabled');
    var countryList = document.createElement('div');
    countryList.className = 'netmap-panel-list';
    COUNTRIES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'netmap-panel-row' + (filters.countries[c] !== false ? ' is-on' : '');
      var dot = document.createElement('span');
      dot.className = 'netmap-dot';
      dot.style.background = COUNTRY_COLOR[c];
      b.appendChild(dot);
      var code = document.createElement('span');
      code.className = 'netmap-ccode';
      code.textContent = (labels.countries && labels.countries[c]) || c.toUpperCase();
      b.appendChild(code);
      var cname = document.createElement('span');
      cname.className = 'netmap-cname';
      cname.textContent =
        (labels.countryNames && labels.countryNames[c]) || c.toUpperCase();
      b.appendChild(cname);
      var cnt = document.createElement('span');
      cnt.className = 'netmap-panel-row-count';
      cnt.setAttribute('data-country-count', c);
      cnt.textContent = '0';
      b.appendChild(cnt);
      b.addEventListener('click', function () {
        filters.countries[c] = !(filters.countries[c] !== false);
        b.classList.toggle('is-on', filters.countries[c] !== false);
        saveFilters();
        restartGraph();
      });
      countryList.appendChild(b);
    });
    countrySec.appendChild(countryList);

    var guideSec = sec(labels.sectionGuide);
    var guide = document.createElement('div');
    guide.className = 'netmap-panel-guide';
    guide.innerHTML =
      '<p>' +
      escapeHtml(labels.guideDomestic) +
      '</p><p>' +
      escapeHtml(labels.guideGlobal) +
      '</p>';
    guideSec.appendChild(guide);

    var footer = document.createElement('div');
    footer.className = 'netmap-panel-footer';
    footer.innerHTML =
      '<div class="netmap-panel-footer-stats"></div><div>' +
      escapeHtml(labels.footerHint) +
      '</div>';
    panel.appendChild(footer);

    updatePanelCounts(panel, labels);
    ensureStageActions(labels);
  }

  function applySearchHighlight() {
    if (!gRoot) return;
    var q = (filters.search || '').trim();
    gRoot.selectAll('.nm-node').classed('is-match', function (d) {
      return q ? matchesSearch(d, q) : false;
    });
    gRoot.selectAll('.nm-node').attr('stroke-width', function (d) {
      if (isAnchorNode(d)) return 2;
      return q && matchesSearch(d, q) ? 2.5 : 1;
    });
  }

  function focusSearchMatch() {
    if (!gRoot || !svgRoot || !zoomBehavior) return;
    var q = (filters.search || '').trim();
    if (!q) return;
    var hit = graphState.nodes.find(function (n) {
      return matchesSearch(n, q);
    });
    if (!hit || hit.x == null) return;
    var svg = svgRoot.node();
    var w = svg.clientWidth || layoutWidth || 720;
    var h = svg.clientHeight || layoutHeight || 560;
    var t = global.d3.zoomIdentity.translate(w / 2 - hit.x, h / 2 - hit.y).scale(1.4);
    svgRoot.transition().duration(350).call(zoomBehavior.transform, t);
  }

  function fitView(opts) {
    if (!svgRoot || !gRoot || !zoomBehavior || typeof d3 === 'undefined') return;
    var nodes = graphState.nodes;
    if (!nodes.length) return;
    opts = opts || {};
    var svg = svgRoot.node();
    var w = (svg && svg.clientWidth) || layoutWidth || 720;
    var h = (svg && svg.clientHeight) || layoutHeight || 560;
    var fit = computeFit(nodes, w, h, {
      padding: opts.padding != null ? opts.padding : 40,
      maxScale: opts.maxScale != null ? opts.maxScale : 1.6,
    });
    var transform = d3.zoomIdentity.translate(fit.tx, fit.ty).scale(fit.scale);
    if (opts.animate === false) {
      svgRoot.call(zoomBehavior.transform, transform);
    } else {
      svgRoot.transition().duration(400).call(zoomBehavior.transform, transform);
    }
  }

  function paint(container, width, height) {
    if (typeof d3 === 'undefined') return;
    stopSim();
    container.innerHTML = '';
    clearSelection();
    layoutWidth = width;
    layoutHeight = height;
    autoFitArmed = true;
    userNavigated = false;
    var labels = labelsFor(lastOpts);
    var lang = lastOpts.lang === 'en' ? 'en' : 'ko';
    var filtered = filterGraph(graphState.raw, filters);
    var panel = document.getElementById('netmap-panel');
    if (panel) updatePanelCounts(panel, labels);
    var tickers = graphState.tickers;
    var nodes = enrichNodes(filtered.nodes, tickers).map(function (n) {
      syncNodeRsFromLive(n);
      return Object.assign({}, n);
    });
    var nodeById = Object.create(null);
    nodes.forEach(function (n) {
      nodeById[n.id] = n;
    });
    var edges = filtered.edges
      .filter(function (e) {
        return nodeById[e.source] && nodeById[e.target];
      })
      .map(function (e) {
        return Object.assign({}, e);
      });
    graphState.nodes = nodes;
    graphState.edges = edges;

    if (!nodes.length) {
      var empty = document.createElement('div');
      empty.style.cssText =
        'display:flex;align-items:center;justify-content:center;height:100%;min-height:520px;color:var(--text-muted)';
      empty.textContent = labels.noData;
      container.appendChild(empty);
      return;
    }

    var degrees = degreeMap(edges);
    var mcapScale = mcapRadiusScale(lastOpts.companies);
    nodes.forEach(function (n) {
      n._degree = degrees[n.id] || 0;
      n._r = nodeRadius(n, mcapScale, n._degree);
    });

    var chains = [];
    var seenCh = Object.create(null);
    nodes.forEach(function (n) {
      if (isDomesticNode(n) && n.chain && !seenCh[n.chain]) {
        seenCh[n.chain] = true;
        chains.push(n.chain);
      }
    });
    var seeds = computeLayoutSeeds(chains, COUNTRIES, width, height);

    var svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', labels.title);
    svgRoot = svg;
    pruneExtraSvgs(container);

    var defs = svg.append('defs');
    EDGE_TYPES.forEach(function (t) {
      if (t === 'peer') return;
      var st = edgeStyle(t, 'high');
      defs
        .append('marker')
        .attr('id', 'nm-arrow-' + t)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', st.color);
    });

    gRoot = svg.append('g').attr('class', 'nm-zoom');
    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.4, 4])
      .on('zoom', function (ev) {
        if (ev.sourceEvent) markUserNavigated();
        gRoot.attr('transform', ev.transform);
        var k = ev.transform.k;
        gRoot.selectAll('.nm-label').style('display', function (d) {
          return shouldShowLabel(d, k) ? null : 'none';
        });
      });
    svg.call(zoomBehavior);
    svg.on('click', function (ev) {
      if (ev.target === svg.node()) clearSelection();
    });

    var link = gRoot
      .append('g')
      .attr('class', 'nm-links')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('class', 'nm-link')
      .attr('stroke', function (d) {
        return edgeStyle(d.type, d.confidence).color;
      })
      .attr('stroke-width', function (d) {
        return edgeStyle(d.type, d.confidence).width;
      })
      .attr('stroke-opacity', function (d) {
        return edgeStyle(d.type, d.confidence).opacity;
      })
      .attr('stroke-dasharray', function (d) {
        return edgeStyle(d.type, d.confidence).dasharray;
      })
      .attr('marker-end', function (d) {
        var st = edgeStyle(d.type, d.confidence);
        return st.arrow ? 'url(#nm-arrow-' + d.type + ')' : null;
      })
      .on('mousemove', function (ev, d) {
        showTip(ev, escapeHtml(d.labelKo || d.type));
      })
      .on('mouseleave', hideTip);

    var nodeG = gRoot
      .append('g')
      .attr('class', 'nm-nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'nm-node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', function (ev, d) {
            if (ev.sourceEvent) markUserNavigated();
            if (!ev.active && sim) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', function (ev, d) {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on('end', function (ev, d) {
            if (!ev.active && sim) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on('mousemove', function (ev, d) {
        var nm = lang === 'en' ? d.nameEn || d.nameKo : d.nameKo || d.nameEn;
        showTip(
          ev,
          '<b>' +
            escapeHtml(nm) +
            '</b><br>' +
            escapeHtml([d.chain, d.role, d.country].filter(Boolean).join(' · ')),
        );
      })
      .on('mouseleave', hideTip)
      .on('click', function (ev, d) {
        ev.stopPropagation();
        selectNode(d.id);
      });

    nodeG.each(function (d) {
      var g = d3.select(this);
      if (isGlobalNode(d)) {
        var s = d._r;
        g.append('rect')
          .attr('x', -s / 2)
          .attr('y', -s / 2)
          .attr('width', s)
          .attr('height', s)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('fill', COUNTRY_COLOR[d.country] || COUNTRY_COLOR.kr)
          .attr('stroke', '#c9d1d9')
          .attr('stroke-width', 1);
      } else {
        g.append('circle')
          .attr('r', d._r)
          .attr('fill', colorForDomestic(d, tickers, anchorRsCache))
          .attr('stroke', isAnchorNode(d) ? '#e6edf3' : '#30363d')
          .attr('stroke-width', isAnchorNode(d) ? 2 : 1);
      }
      g.append('text')
        .attr('class', 'nm-label')
        .attr('text-anchor', 'middle')
        .attr('dy', d._r + 10)
        .attr('fill', 'var(--text,#e6edf3)')
        .attr('font-size', 10)
        .text(lang === 'en' ? d.nameEn || d.nameKo : d.nameKo || d.nameEn)
        .style('display', shouldShowLabel(d, 1) ? null : 'none');
    });

    sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(edges)
          .id(function (d) {
            return d.id;
          })
          .distance(function (d) {
            var s = typeof d.source === 'object' ? d.source : null;
            var t = typeof d.target === 'object' ? d.target : null;
            if (
              (s && isGlobalNode(s) && (s._degree || 0) === 1) ||
              (t && isGlobalNode(t) && (t._degree || 0) === 1)
            ) {
              return 55;
            }
            return edgeStyle(d.type, d.confidence).distance;
          })
          .strength(0.6),
      )
      .force(
        'charge',
        d3.forceManyBody().strength(function (d) {
          if ((d._degree || 0) === 0) return -60;
          return isGlobalNode(d) ? -260 : -220;
        }),
      )
      .force(
        'collide',
        d3.forceCollide().radius(function (d) {
          return (d._r || 8) + 4;
        }),
      )
      .force(
        'x',
        d3
          .forceX(function (d) {
            if ((d._degree || 0) === 0) return seeds.cx;
            if (isDomesticNode(d) && d.chain && seeds.chainCenters[d.chain]) {
              return seeds.chainCenters[d.chain].x;
            }
            return seeds.cx;
          })
          .strength(function (d) {
            if ((d._degree || 0) === 0) return 0.02;
            return isDomesticNode(d) ? 0.05 : 0;
          }),
      )
      .force(
        'y',
        d3
          .forceY(function (d) {
            if ((d._degree || 0) === 0) return seeds.cy;
            if (isDomesticNode(d) && d.chain && seeds.chainCenters[d.chain]) {
              return seeds.chainCenters[d.chain].y;
            }
            return seeds.cy;
          })
          .strength(function (d) {
            if ((d._degree || 0) === 0) return 0.02;
            return isDomesticNode(d) ? 0.05 : 0;
          }),
      )
      .force(
        'radial',
        d3
          .forceRadial(
            function (d) {
              if ((d._degree || 0) === 0) return seeds.isolateR;
              if (isGlobalNode(d)) return seeds.radial;
              return 0;
            },
            seeds.cx,
            seeds.cy,
          )
          .strength(function (d) {
            if ((d._degree || 0) === 0) return 0.35;
            if (isGlobalNode(d) && (d._degree || 0) === 1) return 0.08;
            if (isGlobalNode(d)) return 0.06;
            return 0;
          }),
      )
      .alphaDecay(0.03);

    var ticks = 0;
    var autoFitFired = false;
    function tryAutoFitFromSim() {
      if (autoFitFired) return;
      if (!autoFitArmed || userNavigated) return;
      if (sim && sim.alpha() >= 0.02 && ticks < 300) return;
      autoFitFired = true;
      maybeAutoFitOnce();
    }
    sim.on('tick', function () {
      ticks += 1;
      nodes.forEach(function (n) {
        clampNodeToStage(n, width, height);
      });
      link
        .attr('x1', function (d) {
          return d.source.x;
        })
        .attr('y1', function (d) {
          return d.source.y;
        })
        .attr('x2', function (d) {
          return d.target.x;
        })
        .attr('y2', function (d) {
          return d.target.y;
        });
      nodeG.attr('transform', function (d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      });
      if (ticks >= 300) sim.stop();
      tryAutoFitFromSim();
    });
    sim.on('end', function () {
      tryAutoFitFromSim();
    });

    applySearchHighlight();
    if (filters.search) setTimeout(focusSearchMatch, 50);
  }

  function shouldShowLabel(d, k) {
    if (isAnchorNode(d) || isGlobalNode(d)) return true;
    if ((d._r || 0) >= 12) return true;
    return k >= 1.6;
  }

  function restartGraph() {
    if (!lastOpts || !lastOpts.container) return;
    var container = lastOpts.container;
    var seq = renderSeq;
    measureContainerWidth(container, 0, function (w, h) {
      if (seq !== renderSeq) return;
      container.innerHTML = '';
      if (seq !== renderSeq) return;
      paint(container, w, h);
    });
  }

  function renderChart() {
    if (!lastOpts) return;
    var seq = ++renderSeq;
    if (widthRetryTimer) {
      clearTimeout(widthRetryTimer);
      widthRetryTimer = null;
    }
    var opts = lastOpts;
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    var labels = labelsFor(opts);
    container.innerHTML = '';
    hideTip();
    var loading = document.createElement('div');
    loading.style.cssText =
      'display:flex;align-items:center;justify-content:center;min-height:520px;color:var(--text-muted)';
    loading.textContent = labels.loading;
    container.appendChild(loading);

    var dataP = fetchData(opts.dataUrl);
    var anchorP = fetchAnchorRs();
    Promise.all([dataP, anchorP])
      .then(function (pair) {
        if (seq !== renderSeq) return;
        graphState.raw = pair[0];
        graphState.tickers = indexCompanies(opts.companies);
        var panel = opts.panel || document.getElementById('netmap-panel');
        if (panel) updatePanelCounts(panel, labels);
        container.innerHTML = '';
        measureContainerWidth(container, 0, function (w, h) {
          if (seq !== renderSeq) return;
          container.innerHTML = '';
          if (seq !== renderSeq) return;
          paint(container, w, h);
          recolorNodes();
        });
      })
      .catch(function () {
        if (seq !== renderSeq) return;
        container.innerHTML = '';
        var err = document.createElement('div');
        err.style.cssText =
          'display:flex;align-items:center;justify-content:center;min-height:520px;color:var(--text-muted);text-align:center;padding:24px';
        err.textContent = labels.failed;
        container.appendChild(err);
      });
  }

  function layoutIsDrawer() {
    return typeof global.matchMedia === 'function' && global.matchMedia('(max-width: 899px)').matches;
  }

  function render(opts) {
    opts = opts || {};
    if (!opts.container) return;
    lastOpts = opts;
    filters = loadFilters();
    injectStyles();
    bindRecolorListeners();
    observeStageResize(opts.container);
    var panel = opts.panel || document.getElementById('netmap-panel');
    if (panel) buildPanel(panel, labelsFor(opts));
    ensureStageActions(labelsFor(opts));
    if (opts.side) {
      opts.side.hidden = true;
      opts.side.innerHTML = '';
    }
    renderChart();
  }

  function focus(code) {
    if (!code) return;
    var hit = graphState.nodes.find(function (n) {
      return String(n.ticker || '') === String(code);
    });
    if (hit) {
      selectNode(hit.id);
      filters.search = String(code);
      focusSearchMatch();
    }
  }

  function getState() {
    return {
      selectedId: selectedId,
      filters: JSON.parse(JSON.stringify(filters)),
      nodeCount: graphState.nodes.length,
      edgeCount: graphState.edges.length,
    };
  }

  global.InvestingMapNetmap = {
    render: render,
    focus: focus,
    getState: getState,
    recolorNodes: recolorNodes,
    _test: {
      EDGE_TYPES: EDGE_TYPES,
      COUNTRIES: COUNTRIES,
      defaultFilters: defaultFilters,
      filterGraph: filterGraph,
      edgeStyle: edgeStyle,
      nodeRadius: nodeRadius,
      computeLayoutSeeds: computeLayoutSeeds,
      computeFit: computeFit,
      clampNodeToStage: clampNodeToStage,
      mcapRadiusScale: mcapRadiusScale,
      isDomesticNode: isDomesticNode,
      isGlobalNode: isGlobalNode,
      colorForDomestic: colorForDomestic,
      recolorNodes: recolorNodes,
      getRenderSeq: function () {
        return renderSeq;
      },
      pruneExtraSvgs: pruneExtraSvgs,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
