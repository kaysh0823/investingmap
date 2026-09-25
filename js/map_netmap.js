/**
 * Sector company network map (force graph) — sourced edges from data/netmap/<sector>.json.
 * Independent of the WIP relation_network / tab-graph UI.
 */
(function (global) {
  'use strict';

  var EDGE_TYPES = ['supply', 'partner', 'equity', 'peer', 'distribution'];
  var COUNTRIES = ['us', 'tw', 'jp', 'cn', 'eu'];
  var FILTER_KEY = 'im.netmap.filters';
  var LINK_DIST = { supply: 70, partner: 60, equity: 50, peer: 90, distribution: 70 };
  var COUNTRY_COLOR = {
    us: '#4c8dff',
    tw: '#2bb5a0',
    jp: '#e0607e',
    cn: '#f2a03d',
    eu: '#9b6cf5',
    kr: '#8b949e',
  };
  var EDGE_COLOR = {
    supply: '#7d8590',
    partner: '#3fb950',
    equity: '#a371f7',
    peer: '#6e7681',
    distribution: '#d29922',
  };

  var lastOpts = null;
  var renderSeq = 0;
  var widthRetryTimer = null;
  var stylesInjected = false;
  var dataCache = Object.create(null);
  var dataLoading = Object.create(null);
  var sim = null;
  var zoomBehavior = null;
  var svgRoot = null;
  var gRoot = null;
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
      types: L.types || {},
      countries: L.countries || {},
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

    var used = Object.create(null);
    edges.forEach(function (e) {
      used[e.source] = true;
      used[e.target] = true;
    });
    // Keep isolated domestic anchors/listed when scope filters removed their edges? Spec: remove hidden from sim.
    // Keep nodes that pass keepNode AND (have an edge OR are searched). Prefer: only nodes in used.
    var nodes = nodesIn.filter(function (n) {
      return n && keepNode[n.id] && used[n.id];
    });
    // If filter wiped everything but we have nodes, fall back to keepNode set with no edges
    if (!nodes.length && !edges.length) {
      nodes = nodesIn.filter(function (n) {
        return n && keepNode[n.id];
      });
    }
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
    var R = Math.min(width, height) * 0.28;
    chainList.forEach(function (ch, i) {
      var a = (2 * Math.PI * i) / n - Math.PI / 2;
      chainCenters[ch] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
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
      radial: Math.min(width, height) * 0.42,
    };
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
      '.netmap-wrap{display:flex;flex-direction:column;gap:8px;min-height:520px}' +
      '.netmap-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.netmap-toolbar input[type=search]{min-width:160px;flex:1;max-width:280px;padding:6px 10px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font:inherit;font-size:13px}' +
      '.netmap-chips{display:flex;flex-wrap:wrap;gap:6px}' +
      '.netmap-chip{padding:5px 10px;border:1px solid var(--border,#30363d);border-radius:999px;background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font:inherit;font-size:12px;cursor:pointer}' +
      '.netmap-chip.is-on{color:var(--text,#e6edf3);border-color:var(--accent,#58a6ff);background:color-mix(in srgb,var(--accent,#58a6ff) 16%,var(--surface2,#21262d))}' +
      '.netmap-actions{display:flex;gap:6px;margin-left:auto}' +
      '.netmap-actions button{padding:5px 10px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font:inherit;font-size:12px;cursor:pointer}' +
      '.netmap-layout{display:grid;grid-template-columns:1fr 300px;gap:12px;min-height:520px}' +
      '.netmap-layout.is-drawer{grid-template-columns:1fr}' +
      '#netmap-root{position:relative;min-height:520px;border:1px solid var(--border,#30363d);border-radius:10px;background:var(--surface,#161b22);overflow:hidden}' +
      '#netmap-root svg{display:block;width:100%;height:100%;min-height:520px}' +
      '#netmap-side{border:1px solid var(--border,#30363d);border-radius:10px;background:var(--surface,#161b22);padding:12px;overflow:auto;max-height:70vh}' +
      '#netmap-side[hidden]{display:none!important}' +
      '.netmap-side-title{font-weight:700;margin:0 0 8px;font-size:14px}' +
      '.netmap-side-meta{font-size:12px;color:var(--text-muted,#8b949e);margin-bottom:10px}' +
      '.netmap-rel{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-top:1px solid var(--border,#30363d);font-size:12px}' +
      '.netmap-rel-row{display:flex;gap:6px;align-items:flex-start}' +
      '.netmap-badge{display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;border:1px solid var(--border,#30363d);color:var(--text-muted,#8b949e)}' +
      '.netmap-badge.high{color:#3fb950;border-color:#3fb950}' +
      '.netmap-badge.medium{color:#d29922;border-color:#d29922}' +
      '.netmap-badge.low{opacity:.7}' +
      '.netmap-legend{font-size:12px;color:var(--text-muted,#8b949e);line-height:1.45}' +
      '.netmap-legend-row{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0;align-items:center}' +
      '.netmap-swatch{display:inline-flex;align-items:center;gap:4px}' +
      '.netmap-line{display:inline-block;width:22px;height:0;border-top:2px solid #7d8590;vertical-align:middle}' +
      '.netmap-line.dash{border-top-style:dashed}' +
      '.netmap-line.dot{border-top-style:dotted}' +
      '.netmap-dot{display:inline-block;width:10px;height:10px;border-radius:50%}' +
      '.netmap-tip{position:fixed;z-index:40;pointer-events:none;max-width:280px;padding:8px 10px;border-radius:8px;background:rgba(22,27,34,.96);border:1px solid var(--border,#30363d);color:var(--text,#e6edf3);font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
      '.netmap-open-chart{margin:0 0 10px;padding:6px 10px;border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);color:var(--text,#e6edf3);font:inherit;font-size:12px;cursor:pointer}' +
      '@media (max-width:899px){.netmap-layout{grid-template-columns:1fr}.netmap-layout #netmap-side:not([hidden]){position:sticky;bottom:0;max-height:40vh;z-index:2}}';
    var el = document.createElement('style');
    el.id = 'im-netmap-css';
    el.textContent = css;
    document.head.appendChild(el);
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

  function colorForDomestic(node) {
    var rsMod = global.InvestingMapRsColor;
    if (!rsMod || typeof rsMod.colorForRs !== 'function') return '#9aa3ad';
    var marketRs =
      typeof rsMod.marketRsFor === 'function'
        ? rsMod.marketRsFor({ market: node._market })
        : null;
    return rsMod.colorForRs(node._rs, marketRs);
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
    html += '<p class="netmap-side-title">' + escapeHtml(name) + '</p>';
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

  function buildToolbar(host, labels) {
    host.innerHTML = '';
    host.className = 'netmap-toolbar';
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
    host.appendChild(search);

    var typeChips = document.createElement('div');
    typeChips.className = 'netmap-chips';
    EDGE_TYPES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'netmap-chip' + (filters.types[t] ? ' is-on' : '');
      b.textContent = (labels.types && labels.types[t]) || t;
      b.addEventListener('click', function () {
        filters.types[t] = !filters.types[t];
        b.classList.toggle('is-on', !!filters.types[t]);
        saveFilters();
        restartGraph();
      });
      typeChips.appendChild(b);
    });
    host.appendChild(typeChips);

    var scopeChips = document.createElement('div');
    scopeChips.className = 'netmap-chips';
    ;[
      ['all', labels.scopeAll],
      ['domestic', labels.scopeDomestic],
    ].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'netmap-chip' + (filters.scope === pair[0] ? ' is-on' : '');
      b.textContent = pair[1];
      b.addEventListener('click', function () {
        filters.scope = pair[0];
        saveFilters();
        var chips = scopeChips.querySelectorAll('.netmap-chip');
        for (var i = 0; i < chips.length; i++) {
          chips[i].classList.toggle('is-on', i === (pair[0] === 'all' ? 0 : 1));
        }
        restartGraph();
      });
      scopeChips.appendChild(b);
    });
    host.appendChild(scopeChips);

    var countryChips = document.createElement('div');
    countryChips.className = 'netmap-chips';
    COUNTRIES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'netmap-chip' + (filters.countries[c] !== false ? ' is-on' : '');
      b.textContent = (labels.countries && labels.countries[c]) || c.toUpperCase();
      b.style.borderColor = COUNTRY_COLOR[c];
      b.addEventListener('click', function () {
        filters.countries[c] = !(filters.countries[c] !== false);
        b.classList.toggle('is-on', filters.countries[c] !== false);
        saveFilters();
        restartGraph();
      });
      countryChips.appendChild(b);
    });
    host.appendChild(countryChips);

    var actions = document.createElement('div');
    actions.className = 'netmap-actions';
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
      buildToolbar(host, labels);
      restartGraph();
    });
    actions.appendChild(fitBtn);
    actions.appendChild(resetBtn);
    host.appendChild(actions);
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
    var w = svg.clientWidth || 720;
    var h = svg.clientHeight || 560;
    var t = global.d3.zoomIdentity.translate(w / 2 - hit.x, h / 2 - hit.y).scale(1.4);
    svgRoot.transition().duration(350).call(zoomBehavior.transform, t);
  }

  function fitView() {
    if (!svgRoot || !gRoot || !zoomBehavior || typeof d3 === 'undefined') return;
    var nodes = graphState.nodes;
    if (!nodes.length) return;
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    nodes.forEach(function (n) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });
    var svg = svgRoot.node();
    var w = svg.clientWidth || 720;
    var h = svg.clientHeight || 560;
    var bw = Math.max(40, maxX - minX);
    var bh = Math.max(40, maxY - minY);
    var scale = Math.min(2.5, 0.85 / Math.max(bw / w, bh / h));
    var tx = w / 2 - (scale * (minX + maxX)) / 2;
    var ty = h / 2 - (scale * (minY + maxY)) / 2;
    svgRoot.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function renderLegend(el, raw, filtered, labels) {
    if (!el) return;
    var html = '<div class="netmap-legend-row">';
    EDGE_TYPES.forEach(function (t) {
      var st = edgeStyle(t, 'high');
      var cls = 'netmap-line' + (st.dasharray === '6,4' ? ' dash' : st.dasharray === '2,3' ? ' dot' : '');
      html +=
        '<span class="netmap-swatch"><span class="' +
        cls +
        '" style="border-color:' +
        st.color +
        '"></span>' +
        escapeHtml((labels.types && labels.types[t]) || t) +
        '</span>';
    });
    html += '</div><div class="netmap-legend-row">';
    COUNTRIES.forEach(function (c) {
      html +=
        '<span class="netmap-swatch"><span class="netmap-dot" style="background:' +
        COUNTRY_COLOR[c] +
        '"></span>' +
        escapeHtml((labels.countries && labels.countries[c]) || c.toUpperCase()) +
        '</span>';
    });
    html += '</div>';
    html += '<div>' + escapeHtml(labels.legendRs) + '</div>';
    var asOf = (raw && raw.asOf) || '';
    html +=
      '<div style="margin-top:4px">asOf ' +
      escapeHtml(asOf) +
      ' · nodes ' +
      filtered.nodes.length +
      ' · edges ' +
      filtered.edges.length +
      '</div>';
    el.innerHTML = html;
  }

  function paint(container, width, height) {
    if (typeof d3 === 'undefined') return;
    stopSim();
    container.innerHTML = '';
    clearSelection();
    var labels = labelsFor(lastOpts);
    var lang = lastOpts.lang === 'en' ? 'en' : 'ko';
    var filtered = filterGraph(graphState.raw, filters);
    var tickers = graphState.tickers;
    var nodes = enrichNodes(filtered.nodes, tickers).map(function (n) {
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
      renderLegend(lastOpts.legend, graphState.raw, filtered, labels);
      return;
    }

    var degrees = degreeMap(edges);
    var mcapScale = mcapRadiusScale(lastOpts.companies);
    nodes.forEach(function (n) {
      n._r = nodeRadius(n, mcapScale, degrees[n.id] || 0);
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
          .attr('fill', colorForDomestic(d))
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
            return edgeStyle(d.type, d.confidence).distance;
          })
          .strength(0.6),
      )
      .force(
        'charge',
        d3.forceManyBody().strength(function (d) {
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
        d3.forceX(function (d) {
          if (isDomesticNode(d) && d.chain && seeds.chainCenters[d.chain]) {
            return seeds.chainCenters[d.chain].x;
          }
          return seeds.cx;
        }).strength(function (d) {
          return isDomesticNode(d) ? 0.05 : 0;
        }),
      )
      .force(
        'y',
        d3.forceY(function (d) {
          if (isDomesticNode(d) && d.chain && seeds.chainCenters[d.chain]) {
            return seeds.chainCenters[d.chain].y;
          }
          return seeds.cy;
        }).strength(function (d) {
          return isDomesticNode(d) ? 0.05 : 0;
        }),
      )
      .force(
        'radial',
        d3
          .forceRadial(
            function (d) {
              return isGlobalNode(d) ? seeds.radial : 0;
            },
            seeds.cx,
            seeds.cy,
          )
          .strength(function (d) {
            return isGlobalNode(d) ? 0.06 : 0;
          }),
      )
      .alphaDecay(0.03);

    var ticks = 0;
    sim.on('tick', function () {
      ticks += 1;
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
    });

    applySearchHighlight();
    renderLegend(lastOpts.legend, graphState.raw, filtered, labels);
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

    fetchData(opts.dataUrl)
      .then(function (raw) {
        if (seq !== renderSeq) return;
        graphState.raw = raw;
        graphState.tickers = indexCompanies(opts.companies);
        container.innerHTML = '';
        measureContainerWidth(container, 0, function (w, h) {
          if (seq !== renderSeq) return;
          container.innerHTML = '';
          if (seq !== renderSeq) return;
          paint(container, w, h);
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
    var layout = opts.container.closest ? opts.container.closest('.netmap-layout') : null;
    if (layout) layout.classList.toggle('is-drawer', layoutIsDrawer());
    var toolbar = opts.toolbar || document.getElementById('netmap-toolbar');
    if (toolbar) buildToolbar(toolbar, labelsFor(opts));
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
    _test: {
      EDGE_TYPES: EDGE_TYPES,
      COUNTRIES: COUNTRIES,
      defaultFilters: defaultFilters,
      filterGraph: filterGraph,
      edgeStyle: edgeStyle,
      nodeRadius: nodeRadius,
      computeLayoutSeeds: computeLayoutSeeds,
      mcapRadiusScale: mcapRadiusScale,
      isDomesticNode: isDomesticNode,
      isGlobalNode: isGlobalNode,
      getRenderSeq: function () {
        return renderSeq;
      },
      pruneExtraSvgs: pruneExtraSvgs,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
