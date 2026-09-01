/**
 * Market-cap treemap heatmap for industry map pages (d3.treemap).
 * Tile size = compressed mcap (sqrt + floor); color/label = return horizon.
 */
(function (global) {
  'use strict';

  var HORIZONS = [
    { id: '1d', field: 'chg1dPct', clip: 15, ko: '당일', en: '1D' },
    { id: '5d', field: 'ret5dPct', clip: 15, ko: '5일', en: '5D' },
    { id: '20d', field: 'ret20dPct', clip: 15, ko: '20일', en: '20D' },
    { id: '50d', field: 'ret50dPct', clip: 15, ko: '50일', en: '50D' },
    { id: '120d', field: 'ret120dPct', clip: 15, ko: '120일', en: '120D' },
  ];
  /* Strong red ↔ dark neutral ↔ strong green (high chroma ends, dark mid). */
  var CHG_RANGE = ['#c62828', '#e53935', '#8e3a3a', '#2a2e38', '#2e7d32', '#43a047', '#00c853'];
  var NEUTRAL = '#2a2e38';
  var TEXT_LIGHT = '#f0f3f6';
  var TEXT_DARK = '#161b22';
  var TEXT_MUTED_LIGHT = 'rgba(240,243,246,0.78)';
  var TEXT_MUTED_DARK = 'rgba(22,27,34,0.72)';
  /** Contrast curve exponent (<1 → small moves saturate faster). */
  var CONTRAST_EXP = 0.55;
  /** Floor vs largest sqrt(mcap): keeps tiny caps clickable. */
  var MIN_SIZE_FRAC = 0.045;
  var SIZE_POWER = 0.5;

  var lastTapTicker = null;
  var outsideTapBound = false;
  var lastLayoutKey = '';
  var selectedHorizon = '1d';
  var lastOpts = null;
  var resizeObs = null;
  var resizeTimer = null;
  var observedEl = null;
  var pendingSizeRetry = null;
  var visibilityBound = false;

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

  /** Map pct into clip domain with steeper near-zero contrast. */
  function contrastPct(pct, clip) {
    if (pct == null || !isFinite(pct) || !clip) return 0;
    var x = Math.max(-clip, Math.min(clip, pct)) / clip;
    var y = (x < 0 ? -1 : 1) * Math.pow(Math.abs(x), CONTRAST_EXP);
    return y * clip;
  }

  function chgFillManual(pct, clip) {
    var mapped = contrastPct(pct, clip);
    var t = (mapped + clip) / (2 * clip);
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
      return function (v) {
        return sc(contrastPct(v, clip));
      };
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
    var rgb = typeof d3 !== 'undefined' && d3.rgb ? d3.rgb(col) : { r: 42, g: 46, b: 56 };
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

  function sizeValue(mcapWon, maxSqrt) {
    var m = Math.max(mcapWon || 0, 0);
    var v = Math.pow(m, SIZE_POWER);
    var floor = maxSqrt > 0 ? maxSqrt * MIN_SIZE_FRAC : 1;
    return Math.max(v, floor, 1);
  }

  function buildHierarchy(companies) {
    var byChain = {};
    var maxSqrt = 0;
    (companies || []).forEach(function (c) {
      var ch = c.chain || '—';
      if (!byChain[ch]) byChain[ch] = [];
      byChain[ch].push(c);
      var s = Math.pow(Math.max(c.mcapWon || 0, 0), SIZE_POWER);
      if (s > maxSqrt) maxSqrt = s;
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
          children: byChain[ch]
            .slice()
            .sort(function (a, b) {
              return (b.mcapWon || 0) - (a.mcapWon || 0);
            })
            .map(function (c) {
              return {
                name: displayName(c, 'ko'),
                company: c,
                chain: ch,
                value: sizeValue(c.mcapWon, maxSqrt),
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
    return lang + '#' + w + 'x' + h + '#sq' + SIZE_POWER + '#' + parts.join('|');
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
      '.hm-horizon-tabs{display:flex!important;visibility:visible!important;opacity:1!important;' +
      'flex-wrap:wrap;gap:6px;margin:0 0 12px;align-items:center;position:relative;z-index:2}' +
      '.hm-horizon-tab{padding:6px 12px;border-radius:16px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text-muted,#8b949e);font-size:12px;font-weight:600;cursor:pointer;' +
      '-webkit-appearance:none;appearance:none;min-height:32px;line-height:1.2}' +
      '.hm-horizon-tab:hover{border-color:var(--accent,#58a6ff);color:var(--text,#e6edf3)}' +
      '.hm-horizon-tab[aria-pressed="true"]{border-color:var(--accent,#58a6ff);' +
      'background:color-mix(in srgb, var(--accent,#58a6ff) 14%, var(--surface2,#21262d));color:var(--accent,#58a6ff)}' +
      '#heatmap-root{position:relative;width:100%;min-height:420px;height:min(62vh,640px)}' +
      '#heatmap-root svg.im-hm-svg{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '.hm-legend-scale{display:flex;flex-direction:column;gap:6px;width:min(420px,100%);margin-top:4px}' +
      '.hm-legend-title{font-size:12px;font-weight:700;color:var(--text-muted,#8b949e)}' +
      '.hm-legend-bar{height:10px;border-radius:4px;border:1px solid var(--border,#30363d);' +
      'background:linear-gradient(to right,#c62828 0%,#e53935 16.6%,#8e3a3a 33.3%,#2a2e38 50%,#2e7d32 66.6%,#43a047 83.3%,#00c853 100%)}' +
      '.hm-legend-ticks{display:flex;justify-content:space-between;font-size:11px;font-variant-numeric:tabular-nums;color:var(--text-muted,#8b949e)}' +
      'text.hm-chg,text.hm-name,text.hm-mcap{pointer-events:none;font-variant-numeric:tabular-nums;' +
      'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}' +
      'text.hm-chg{font-weight:700}' +
      'text.hm-name{font-weight:600}' +
      '.hm-tile.im-hm-focus rect{stroke:var(--accent,#58a6ff)!important;stroke-width:3!important;' +
      'filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent,#58a6ff) 55%,transparent))}' +
      '.hm-tile.im-hm-focus{animation:im-hm-pulse 1.2s ease-in-out 2}' +
      '@keyframes im-hm-pulse{0%,100%{opacity:1}50%{opacity:.88}}' +
      '@media (max-width:768px){' +
      '.hm-horizon-tabs{display:flex!important;gap:5px;margin:0 0 10px;width:100%}' +
      '.hm-horizon-tab{flex:1 1 auto;min-width:calc(20% - 4px);padding:8px 6px;font-size:11px;min-height:36px;' +
      'text-align:center;touch-action:manipulation}' +
      '#heatmap-root{min-height:min(52vh,480px)!important;height:min(58vh,560px)!important}' +
      '.hm-legend-scale{width:100%}' +
      '.hm-legend-title{font-size:11px}' +
      '.hm-legend-ticks{font-size:10px}' +
      '}';
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
        var tab = ev.target && ev.target.closest ? ev.target.closest('.hm-horizon-tab') : null;
        if (tab) return;
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
        ? hz.en + ' return (tile size ≈ market cap)'
        : hz.ko + ' 수익률 (칸 크기 ≈ 시가총액)';
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
      bar.setAttribute('aria-label', lang === 'en' ? 'Return horizon' : '수익률 기간');
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-hm-horizon]');
        if (!btn) return;
        var id = btn.getAttribute('data-hm-horizon');
        if (!id || id === selectedHorizon) return;
        selectedHorizon = id;
        if (lastOpts) render(lastOpts);
      });
    }
    /* Always keep tabs immediately before #heatmap-root (visible on mobile). */
    if (bar.parentNode !== wrap || bar.nextSibling !== container) {
      if (container && wrap.contains(container)) {
        wrap.insertBefore(bar, container);
      } else {
        wrap.appendChild(bar);
      }
    }
    bar.hidden = false;
    bar.style.display = 'flex';
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

  function getUrlTicker() {
    try {
      return new URLSearchParams(window.location.search).get('ticker') || '';
    } catch (e) {
      return '';
    }
  }

  function applyTickerFocus(container) {
    if (!container) return;
    var ticker = getUrlTicker();
    container.querySelectorAll('.hm-tile.im-hm-focus').forEach(function (el) {
      el.classList.remove('im-hm-focus');
    });
    if (!ticker) return;
    var tile = container.querySelector('.hm-tile[data-ticker="' + ticker + '"]');
    if (!tile) return;
    tile.classList.add('im-hm-focus');
    try {
      tile.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch (e2) {
      tile.scrollIntoView(true);
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
    applyTickerFocus(container);
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
    if (!visibilityBound && typeof document !== 'undefined') {
      visibilityBound = true;
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && lastOpts) requestAnimationFrame(function () { render(lastOpts); });
      });
      window.addEventListener('pageshow', function () {
        if (lastOpts) requestAnimationFrame(function () { render(lastOpts); });
      });
    }
  }

  function scheduleSizeRetry() {
    if (pendingSizeRetry) clearTimeout(pendingSizeRetry);
    pendingSizeRetry = setTimeout(function () {
      pendingSizeRetry = null;
      if (lastOpts) render(lastOpts);
    }, 120);
  }

  function labelPlan(tw, th, mobile) {
    /* Prefer return %; omit name/mcap when tight (esp. mobile). */
    var showChg = tw >= (mobile ? 26 : 34) && th >= (mobile ? 12 : 16);
    var showName = showChg && tw >= (mobile ? 52 : 56) && th >= (mobile ? 28 : 40);
    var showMcap = showName && tw >= 72 && th >= (mobile ? 52 : 64);
    var chgFs = Math.max(8, Math.min(mobile ? 11 : 12, Math.floor(Math.min(tw / 4.2, th / (showName ? 3.2 : 1.6)))));
    var nameFs = Math.max(8, Math.min(mobile ? 10 : 11, Math.floor(Math.min(tw / 7, 12))));
    var mcapFs = Math.max(8, Math.min(10, nameFs - 1));
    return { showChg: showChg, showName: showName, showMcap: showMcap, chgFs: chgFs, nameFs: nameFs, mcapFs: mcapFs };
  }

  function renderSmallCards(container, companies, w, h, lang, formatMcap, opts) {
    var hz = currentHorizon();
    var sorted = companies.slice().sort(function (a, b) { return (b.mcapWon || 0) - (a.mcapWon || 0); });
    var total = sorted.reduce(function (sum, c) { return sum + Math.max(Number(c.mcapWon) || 0, 1); }, 0);
    var gap = 6;
    var usable = Math.max(1, w - gap * (sorted.length - 1));
    var x = 0;
    var svg = d3.select(container).append('svg').attr('class', 'im-hm-svg')
      .attr('width', w).attr('height', h).attr('viewBox', '0 0 ' + w + ' ' + h)
      .attr('preserveAspectRatio', 'none');
    var cards = sorted.map(function (c, i) {
      var raw = usable * Math.max(Number(c.mcapWon) || 0, 1) / total;
      var cw = i === sorted.length - 1 ? w - x : Math.max(usable * 0.22, raw);
      var item = { company: c, x: x, w: Math.min(cw, w - x) };
      x += item.w + gap;
      return item;
    });
    if (cards.length > 1 && x - gap > w) {
      var scale = usable / cards.reduce(function (sum, item) { return sum + item.w; }, 0);
      x = 0;
      cards.forEach(function (item) { item.w *= scale; item.x = x; x += item.w + gap; });
    }
    var node = svg.selectAll('g').data(cards).join('g')
      .attr('class', 'hm-tile hm-small-card').attr('data-leaf', '1')
      .attr('data-ticker', function (d) { return d.company.ticker || ''; })
      .attr('transform', function (d) { return 'translate(' + d.x + ',0)'; })
      .style('cursor', 'pointer');
    node.each(function (d) {
      var c = d.company;
      var fill = chgFill(c, hz);
      var ink = textColorsForFill(fill);
      var nm = displayName(c, lang);
      var mcap = formatMcap(c);
      var pct = formatChg(companyReturn(c, hz));
      var g = d3.select(this);
      g.attr('aria-label', nm + ' · ' + mcap + ' · ' + pct);
      g.append('rect').attr('width', Math.max(0, d.w)).attr('height', h).attr('rx', 8)
        .attr('fill', fill).attr('stroke', 'rgba(0,0,0,.22)');
      g.append('text').attr('class', 'hm-name').attr('x', 16).attr('y', Math.max(34, h * 0.38))
        .attr('font-size', Math.max(14, Math.min(22, d.w / 12))).attr('fill', ink.name).text(nm);
      g.append('text').attr('class', 'hm-mcap').attr('x', 16).attr('y', Math.max(56, h * 0.38 + 25))
        .attr('font-size', 12).attr('fill', ink.mcap).text(mcap);
      g.append('text').attr('class', 'hm-chg').attr('x', 16).attr('y', Math.max(82, h * 0.38 + 55))
        .attr('font-size', Math.max(18, Math.min(28, d.w / 9))).attr('fill', ink.chg).text(pct);
    });
    node.on('mouseenter', function (ev, d) { if (!isMobileHeatmap()) showTooltip(d.company, lang, formatMcap, ev); })
      .on('mousemove', function (ev) { if (!isMobileHeatmap()) moveTooltip(ev); })
      .on('mouseleave', function () { if (!isMobileHeatmap()) hideTooltip(); })
      .on('click', function (ev, d) {
        if (isMobileHeatmap() && lastTapTicker !== d.company.ticker) {
          ev.preventDefault(); ev.stopPropagation(); lastTapTicker = d.company.ticker;
          showTooltip(d.company, lang, formatMcap, ev); return;
        }
        hideTooltip();
        if (opts.onSelect) opts.onSelect(d.company);
      });
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
    var mobile = isMobileHeatmap();

    injectStyles();
    bindOutsideTap();
    ensureHorizonTabs(container, lang);
    syncHorizonTabs(lang);
    observeContainer(container);
    renderLegend(opts.legend, lang);

    var box = measureBox(container);
    var w = box.w;
    var h = box.h;
    if (w >= 40 && h < 40) {
      /* Page stylesheet may not size the container; enforce a usable height. */
      container.style.minHeight = '420px';
      box = measureBox(container);
      w = box.w;
      h = box.h;
    }
    if (w < 40 || h < 40) {
      scheduleSizeRetry();
      return;
    }

    var hz = currentHorizon();
    var key = layoutKey(companies, w, h, lang);
    if (key === lastLayoutKey && container.querySelector('svg.im-hm-svg')) {
      recolorLeaves(container, companies);
      applyTickerFocus(container);
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
    if (companies.length <= 3) {
      renderSmallCards(container, companies, w, h, lang, formatMcap, opts);
      lastLayoutKey = key;
      applyTickerFocus(container);
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
        return d.depth === 1 ? 18 : 1;
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
            .attr('font-size', mobile ? 10 : 11)
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

      var plan = labelPlan(tw, th, mobile);
      var padX = Math.max(2, Math.min(6, Math.floor(tw / 20)));
      var y = Math.max(plan.chgFs + 1, Math.min(th - 2, plan.chgFs + (mobile ? 1 : 2)));

      if (plan.showName) {
        g.append('text')
          .attr('class', 'hm-name')
          .attr('x', padX)
          .attr('y', y)
          .attr('font-size', plan.nameFs)
          .attr('fill', ink.name)
          .text(nm.length > Math.floor(tw / (plan.nameFs * 0.62)) ? nm.slice(0, Math.max(3, Math.floor(tw / (plan.nameFs * 0.62)) - 1)) + '…' : nm);
        y += plan.nameFs + 2;
      }
      if (plan.showMcap) {
        g.append('text')
          .attr('class', 'hm-mcap')
          .attr('x', padX)
          .attr('y', y)
          .attr('font-size', plan.mcapFs)
          .attr('fill', ink.mcap)
          .text(mcap);
        y += plan.mcapFs + 2;
      }
      if (plan.showChg) {
        /* % first when name omitted: center-ish in tiny tiles */
        var chgY = plan.showName || plan.showMcap ? y : Math.min(th - 2, Math.max(plan.chgFs + 1, Math.round(th * 0.55 + plan.chgFs * 0.2)));
        g.append('text')
          .attr('class', 'hm-chg')
          .attr('x', padX)
          .attr('y', chgY)
          .attr('font-size', plan.chgFs)
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
    applyTickerFocus(container);
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
    colorForChange: function (pct) {
      return makeScale(HORIZONS[0].clip)(pct);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
