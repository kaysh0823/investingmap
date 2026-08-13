/**
 * Market-cap treemap heatmap for industry map pages (d3.treemap).
 * Tile size = mcap; tile color/label = selected return horizon (finviz-style).
 */
(function (global) {
  'use strict';

  var HORIZONS = [
    { id: '1d', field: 'chg1dPct', clip: 3, ko: '당일', en: '1D' },
    { id: '5d', field: 'ret5dPct', clip: 10, ko: '5일', en: '5D' },
    { id: '20d', field: 'ret20dPct', clip: 20, ko: '20일', en: '20D' },
    { id: '50d', field: 'ret50dPct', clip: 30, ko: '50일', en: '50D' },
    { id: '120d', field: 'ret120dPct', clip: 50, ko: '120일', en: '120D' },
  ];
  var CHG_RANGE = ['#c62828', '#9a3b3b', '#7a4a4a', '#414554', '#4a7a4a', '#3d8b40', '#2e7d32'];
  var NEUTRAL = '#414554';
  var TEXT_LIGHT = '#f0f3f6';
  var TEXT_DARK = '#161b22';
  var TEXT_MUTED_LIGHT = 'rgba(240,243,246,0.78)';
  var TEXT_MUTED_DARK = 'rgba(22,27,34,0.72)';

  var lastTapTicker = null;
  var outsideTapBound = false;
  var lastLayoutKey = '';
  var selectedHorizon = '1d';
  var lastOpts = null;
  var resizeObs = null;
  var resizeTimer = null;
  var observedEl = null;

  function horizonById(id) {
    for (var i = 0; i < HORIZONS.length; i++) {
      if (HORIZONS[i].id === id) return HORIZONS[i];
    }
    return HORIZONS[0];
  }

  function currentHorizon() {
    return horizonById(selectedHorizon);
  }

  function companyReturn(company, hz) {
    if (!company) return null;
    var v = company[hz.field];
    if (v == null || !isFinite(v)) return null;
    return v;
  }

  function domainForClip(clip) {
    return [-clip, (-clip * 2) / 3, -clip / 3, 0, clip / 3, (clip * 2) / 3, clip];
  }

  function chgFillManual(pct, clip) {
    var x = Math.max(-clip, Math.min(clip, pct));
    var t = (x + clip) / (2 * clip);
    var pos = t * (CHG_RANGE.length - 1);
    var i = Math.floor(pos);
    var f = pos - i;
    if (i >= CHG_RANGE.length - 1) return CHG_RANGE[CHG_RANGE.length - 1];
    var a = d3.rgb(CHG_RANGE[i]);
    var b = d3.rgb(CHG_RANGE[i + 1]);
    return d3.rgb(a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f).formatHex();
  }

  function makeScale(clip) {
    if (typeof d3 !== 'undefined' && d3.scaleLinear) {
      var sc = d3.scaleLinear().domain(domainForClip(clip)).range(CHG_RANGE).clamp(true);
      if (typeof d3.interpolateRgb === 'function') sc.interpolate(d3.interpolateRgb);
      return sc;
    }
    return function (v) {
      return chgFillManual(v, clip);
    };
  }

  function chgFill(company, hz) {
    var pct = companyReturn(company, hz || currentHorizon());
    if (pct == null) return NEUTRAL;
    return makeScale((hz || currentHorizon()).clip)(pct);
  }

  function relativeLuminance(col) {
    var rgb = typeof d3 !== 'undefined' && d3.rgb ? d3.rgb(col) : { r: 65, g: 69, b: 84 };
    function lin(c) {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
  }

  function textColorsForFill(fill) {
    var light = relativeLuminance(fill) > 0.42;
    return {
      name: light ? TEXT_DARK : TEXT_LIGHT,
      mcap: light ? TEXT_MUTED_DARK : TEXT_MUTED_LIGHT,
      chg: light ? TEXT_DARK : TEXT_LIGHT,
    };
  }

  function formatChg(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    var abs = Math.abs(pct).toFixed(1);
    if (pct > 0) return '+' + abs + '%';
    if (pct < 0) return '\u2212' + abs + '%';
    return '0.0%';
  }

  function formatTick(n) {
    var rounded = Math.round(n);
    var val = Math.abs(n - rounded) < 0.05 ? rounded : Math.round(n * 10) / 10;
    if (val > 0) return '+' + val + '%';
    if (val < 0) return '\u2212' + Math.abs(val) + '%';
    return '0%';
  }

  function displayName(c, lang) {
    if (lang === 'en' && c.nameEn) return c.nameEn;
    return c.name || c.nameKo || c.ticker || '';
  }

  function buildHierarchy(companies) {
    var byChain = {};
    (companies || []).forEach(function (c) {
      var ch = c.chain || '—';
      if (!byChain[ch]) byChain[ch] = [];
      byChain[ch].push(c);
    });
    var chains = Object.keys(byChain).sort(function (a, b) {
      var sumA = 0;
      var sumB = 0;
      byChain[a].forEach(function (x) {
        sumA += Math.max(x.mcapWon || 0, 0);
      });
      byChain[b].forEach(function (x) {
        sumB += Math.max(x.mcapWon || 0, 0);
      });
      return sumB - sumA;
    });
    return {
      name: 'root',
      children: chains.map(function (ch) {
        return {
          name: ch,
          chain: ch,
          children: byChain[ch].map(function (c) {
            return {
              name: displayName(c, 'ko'),
              company: c,
              chain: ch,
              value: Math.max(c.mcapWon || 0, 1),
            };
          }),
        };
      }),
    };
  }

  function layoutKey(companies, w, h, lang) {
    var parts = (companies || [])
      .map(function (c) {
        return (c.ticker || '') + ':' + Math.round(c.mcapWon || 0) + ':' + (c.chain || '');
      })
      .sort();
    return lang + '#' + w + 'x' + h + '#' + parts.join('|');
  }

  function measureBox(el) {
    var rect = el.getBoundingClientRect();
    var w = Math.max(0, Math.floor(rect.width || el.clientWidth || 0));
    var h = Math.max(0, Math.floor(rect.height || el.clientHeight || 0));
    return { w: w, h: h };
  }

  function isMobileHeatmap() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width:768px)').matches;
  }

  function injectStyles() {
    var el = document.getElementById('im-hm-tooltip-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'im-hm-tooltip-css';
      document.head.appendChild(el);
    }
    el.textContent =
      '.im-hm-tooltip{position:fixed;z-index:9999;pointer-events:none;' +
      'padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;line-height:1.4;' +
      'white-space:pre-line;background:var(--surface2,#21262d);color:var(--text,#e6edf3);' +
      'border:1px solid var(--border,#30363d);box-shadow:0 4px 14px rgba(0,0,0,.35);' +
      'max-width:min(360px,86vw);display:none}' +
      '.im-hm-tooltip .im-hm-tt-name{display:block;font-size:13px;font-weight:700;color:var(--text,#e6edf3)}' +
      '.im-hm-tooltip .im-hm-tt-mcap,.im-hm-tooltip .im-hm-tt-chg{display:block;margin-top:2px;font-size:12px;font-weight:600;color:var(--text-muted,#8b949e)}' +
      '.hm-horizon-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;align-items:center}' +
      '.hm-horizon-tab{padding:6px 12px;border-radius:16px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;cursor:pointer}' +
      '.hm-horizon-tab:hover{border-color:var(--accent,#58a6ff);color:var(--text,#e6edf3)}' +
      '.hm-horizon-tab[aria-pressed="true"]{border-color:var(--accent,#58a6ff);' +
      'background:color-mix(in srgb, var(--accent,#58a6ff) 14%, var(--surface2,#21262d));color:var(--accent,#58a6ff)}' +
      '#heatmap-root{position:relative}' +
      '#heatmap-root svg.im-hm-svg{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '.hm-legend-scale{display:flex;flex-direction:column;gap:6px;width:min(420px,100%);margin-top:4px}' +
      '.hm-legend-title{font-size:12px;font-weight:700;color:var(--text-muted,#8b949e)}' +
      '.hm-legend-bar{height:10px;border-radius:4px;border:1px solid var(--border,#30363d);' +
      'background:linear-gradient(to right,#c62828 0%,#9a3b3b 16.6%,#7a4a4a 33.3%,#414554 50%,#4a7a4a 66.6%,#3d8b40 83.3%,#2e7d32 100%)}' +
      '.hm-legend-ticks{display:flex;justify-content:space-between;font-size:11px;font-variant-numeric:tabular-nums;color:var(--text-muted,#8b949e)}' +
      'text.hm-chg,text.hm-name,text.hm-mcap{pointer-events:none;font-variant-numeric:tabular-nums}';
  }

  function getTooltip() {
    injectStyles();
    var tt = document.getElementById('im-hm-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'im-hm-tooltip';
      tt.className = 'im-hm-tooltip';
      tt.setAttribute('role', 'tooltip');
      document.body.appendChild(tt);
    }
    return tt;
  }

  function showTooltip(company, lang, formatMcap, ev) {
    var hz = currentHorizon();
    var tt = getTooltip();
    var nm = displayName(company, lang);
    var mcap = formatMcap(company) || '—';
    var chg = formatChg(companyReturn(company, hz));
    var hzLabel = lang === 'en' ? hz.en : hz.ko;
    tt.innerHTML =
      '<span class="im-hm-tt-name"></span><span class="im-hm-tt-mcap"></span><span class="im-hm-tt-chg"></span>';
    tt.querySelector('.im-hm-tt-name').textContent = nm;
    tt.querySelector('.im-hm-tt-mcap').textContent = mcap;
    tt.querySelector('.im-hm-tt-chg').textContent = hzLabel + ' ' + chg;
    tt.style.display = 'block';
    moveTooltip(ev);
  }

  function moveTooltip(ev) {
    var tt = document.getElementById('im-hm-tooltip');
    if (!tt || tt.style.display === 'none' || !ev) return;
    var pad = 12;
    var x = (ev.clientX != null ? ev.clientX : 0) + pad;
    var y = (ev.clientY != null ? ev.clientY : 0) - pad;
    var rect = tt.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = (ev.clientX != null ? ev.clientX : 0) - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = (ev.clientY != null ? ev.clientY : 0) - rect.height - pad;
    if (y < 8) y = 8;
    if (x < 8) x = 8;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  function hideTooltip() {
    var tt = document.getElementById('im-hm-tooltip');
    if (tt) tt.style.display = 'none';
    lastTapTicker = null;
  }

  function bindOutsideTap() {
    if (outsideTapBound) return;
    outsideTapBound = true;
    document.addEventListener(
      'pointerdown',
      function (ev) {
        if (!isMobileHeatmap()) return;
        var tt = document.getElementById('im-hm-tooltip');
        if (!tt || tt.style.display === 'none') return;
        var tile = ev.target && ev.target.closest ? ev.target.closest('.hm-tile') : null;
        if (tile && tile.getAttribute('data-ticker')) return;
        hideTooltip();
      },
      true,
    );
  }

  function renderLegend(el, lang) {
    if (!el) return;
    injectStyles();
    var hz = currentHorizon();
    var title =
      lang === 'en'
        ? hz.en + ' return (tile size = market cap)'
        : hz.ko + ' 수익률 (칸 크기 = 시가총액)';
    var ticks = domainForClip(hz.clip).map(formatTick);
    el.innerHTML =
      '<div class="hm-legend-scale">' +
      '<div class="hm-legend-title">' +
      title +
      '</div>' +
      '<div class="hm-legend-bar" role="img" aria-label="' +
      title +
      '"></div>' +
      '<div class="hm-legend-ticks">' +
      ticks
        .map(function (t) {
          return '<span>' + t + '</span>';
        })
        .join('') +
      '</div></div>';
  }

  function syncHorizonTabs(lang) {
    var bar = document.getElementById('hm-horizon-tabs');
    if (!bar) return;
    var btns = bar.querySelectorAll('[data-hm-horizon]');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-hm-horizon');
      var hz = horizonById(id);
      btns[i].textContent = lang === 'en' ? hz.en : hz.ko;
      btns[i].setAttribute('aria-pressed', id === selectedHorizon ? 'true' : 'false');
    }
  }

  function ensureHorizonTabs(container, lang) {
    var wrap = container.parentNode;
    if (!wrap) return;
    var bar = document.getElementById('hm-horizon-tabs');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'hm-horizon-tabs';
      bar.className = 'hm-horizon-tabs';
      bar.setAttribute('role', 'tablist');
      wrap.insertBefore(bar, container);
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-hm-horizon]');
        if (!btn) return;
        var id = btn.getAttribute('data-hm-horizon');
        if (!id || id === selectedHorizon) return;
        selectedHorizon = id;
        if (lastOpts) render(lastOpts);
      });
    }
    bar.innerHTML = HORIZONS.map(function (hz) {
      return (
        '<button type="button" class="hm-horizon-tab" role="tab" data-hm-horizon="' +
        hz.id +
        '" aria-pressed="' +
        (hz.id === selectedHorizon ? 'true' : 'false') +
        '">' +
        (lang === 'en' ? hz.en : hz.ko) +
        '</button>'
      );
    }).join('');
  }

  function paintLeaf(g, company) {
    var hz = currentHorizon();
    var pct = companyReturn(company, hz);
    var fill = chgFill(company, hz);
    var ink = textColorsForFill(fill);
    var rect = g.select('rect');
    if (!rect.empty()) rect.attr('fill', fill);
    var name = g.select('text.hm-name');
    if (!name.empty()) name.attr('fill', ink.name);
    var mcap = g.select('text.hm-mcap');
    if (!mcap.empty()) mcap.attr('fill', ink.mcap);
    var chg = g.select('text.hm-chg');
    if (!chg.empty()) {
      chg.attr('fill', ink.chg);
      chg.text(formatChg(pct));
    }
  }

  function recolorLeaves(container, companies) {
    if (!container || typeof d3 === 'undefined') return;
    var byTicker = {};
    (companies || []).forEach(function (c) {
      if (c && c.ticker) byTicker[c.ticker] = c;
    });
    d3.select(container)
      .selectAll('g.hm-tile[data-ticker]')
      .each(function () {
        var g = d3.select(this);
        var ticker = g.attr('data-ticker');
        var c = byTicker[ticker];
        if (!c) return;
        paintLeaf(g, c);
      });
  }

  function observeContainer(el) {
    if (typeof ResizeObserver === 'undefined') return;
    if (observedEl === el && resizeObs) return;
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
      }, 40);
    });
    resizeObs.observe(el);
  }

  function render(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    lastOpts = opts;
    var companies = opts.companies || [];
    if (opts.excludeTickers && opts.excludeTickers.length) {
      var skip = {};
      opts.excludeTickers.forEach(function (t) {
        skip[t] = true;
      });
      companies = companies.filter(function (c) {
        return !skip[c.ticker];
      });
    }
    var lang = opts.lang || 'ko';
    var formatMcap =
      opts.formatMcap ||
      function (c) {
        return c.mcapWon ? String(c.mcapWon) : '—';
      };
    var chainLabelFn = opts.chainLabel;

    injectStyles();
    bindOutsideTap();
    ensureHorizonTabs(container, lang);
    syncHorizonTabs(lang);
    observeContainer(container);
    renderLegend(opts.legend, lang);

    var box = measureBox(container);
    var w = box.w;
    var h = box.h;
    if (w < 40 || h < 40) return;

    var hz = currentHorizon();
    var key = layoutKey(companies, w, h, lang);
    if (key === lastLayoutKey && container.querySelector('svg.im-hm-svg')) {
      recolorLeaves(container, companies);
      return;
    }

    container.innerHTML = '';
    hideTooltip();

    var data = buildHierarchy(companies);
    if (!data.children || !data.children.length) {
      container.textContent = lang === 'en' ? 'No market cap data.' : '시가총액 데이터가 없습니다.';
      lastLayoutKey = '';
      return;
    }

    var root = d3
      .hierarchy(data)
      .sum(function (d) {
        return d.value || 0;
      })
      .sort(function (a, b) {
        return (b.value || 0) - (a.value || 0);
      });

    d3.treemap()
      .size([w, h])
      .paddingOuter(2)
      .paddingTop(function (d) {
        return d.depth === 1 ? 20 : 1;
      })
      .paddingInner(1)
      .round(true)(root);

    var svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'im-hm-svg')
      .attr('width', w)
      .attr('height', h)
      .attr('viewBox', '0 0 ' + w + ' ' + h)
      .attr('preserveAspectRatio', 'none');

    var nodes = svg
      .selectAll('g')
      .data(
        root.descendants().filter(function (d) {
          return d.depth > 0;
        }),
      )
      .join('g')
      .attr('class', 'hm-tile')
      .attr('transform', function (d) {
        return 'translate(' + d.x0 + ',' + d.y0 + ')';
      });

    nodes.each(function (d) {
      var g = d3.select(this);
      var leaf = d.data.company;
      var tw = d.x1 - d.x0;
      var th = d.y1 - d.y0;

      if (d.depth === 1) {
        g.append('rect')
          .attr('width', tw)
          .attr('height', th)
          .attr('fill', 'none')
          .attr('stroke', 'var(--border)')
          .attr('stroke-width', 1)
          .attr('rx', 4);
        if (tw > 48 && th > 16) {
          var lbl = chainLabelFn ? chainLabelFn(d.data.name) : d.data.name;
          g.append('text')
            .attr('class', 'hm-chain-label')
            .attr('x', 6)
            .attr('y', 14)
            .text(lbl);
        }
        return;
      }

      if (!leaf) return;

      var pct = companyReturn(leaf, hz);
      var fill = chgFill(leaf, hz);
      var ink = textColorsForFill(fill);
      g.append('rect')
        .attr('width', Math.max(0, tw))
        .attr('height', Math.max(0, th))
        .attr('fill', fill)
        .attr('stroke', 'rgba(0,0,0,0.18)')
        .attr('stroke-width', 1)
        .attr('rx', 3);

      var nm = displayName(leaf, lang);
      var mcap = formatMcap(leaf);
      var chgTxt = formatChg(pct);
      g.attr('data-company-name', nm);
      g.attr('data-ticker', leaf.ticker || '');
      g.attr('data-leaf', '1');
      g.attr('aria-label', nm + ' · ' + mcap + ' · ' + chgTxt + ' (' + (leaf.ticker || '') + ')');

      var showAll = tw > 72 && th > 64;
      var showNameChg = !showAll && tw > 56 && th > 40;
      if (showAll || showNameChg) {
        g.append('text')
          .attr('class', 'hm-name')
          .attr('x', 6)
          .attr('y', 16)
          .attr('fill', ink.name)
          .text(nm.length > Math.floor(tw / 7) ? nm.slice(0, Math.max(4, Math.floor(tw / 7) - 1)) + '…' : nm);
      }
      if (showAll) {
        g.append('text')
          .attr('class', 'hm-mcap')
          .attr('x', 6)
          .attr('y', 30)
          .attr('fill', ink.mcap)
          .text(mcap);
        g.append('text')
          .attr('class', 'hm-chg')
          .attr('x', 6)
          .attr('y', 44)
          .attr('fill', ink.chg)
          .text(chgTxt);
      } else if (showNameChg) {
        g.append('text')
          .attr('class', 'hm-chg')
          .attr('x', 6)
          .attr('y', 30)
          .attr('fill', ink.chg)
          .text(chgTxt);
      }
    });

    nodes
      .filter(function (d) {
        return d.depth === 2 && d.data.company;
      })
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev, d) {
        if (isMobileHeatmap()) return;
        showTooltip(d.data.company, lang, formatMcap, ev);
      })
      .on('mousemove', function (ev) {
        if (isMobileHeatmap()) return;
        moveTooltip(ev);
      })
      .on('mouseleave', function () {
        if (isMobileHeatmap()) return;
        hideTooltip();
      })
      .on('click', function (ev, d) {
        var company = d.data.company;
        if (!company) return;
        if (isMobileHeatmap()) {
          ev.preventDefault();
          ev.stopPropagation();
          var ticker = company.ticker || '';
          if (lastTapTicker && lastTapTicker === ticker) {
            hideTooltip();
            if (opts.onSelect) opts.onSelect(company);
            return;
          }
          lastTapTicker = ticker;
          showTooltip(company, lang, formatMcap, ev);
          return;
        }
        hideTooltip();
        if (opts.onSelect) opts.onSelect(company);
      });

    lastLayoutKey = key;
  }

  global.InvestingMapHeatmap = {
    render: render,
    recolor: function (opts) {
      opts = opts || lastOpts || {};
      if (opts.legend) renderLegend(opts.legend, opts.lang || 'ko');
      if (opts.container) recolorLeaves(opts.container, opts.companies || []);
    },
    setHorizon: function (id) {
      selectedHorizon = id || '1d';
      if (lastOpts) render(lastOpts);
    },
    chgFill: chgFill,
  };
})(typeof window !== 'undefined' ? window : globalThis);
