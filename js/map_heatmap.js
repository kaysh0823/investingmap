/**
 * Market-cap treemap heatmap for industry map pages (d3.treemap).
 */
(function (global) {
  'use strict';

  function chainColor(chainColors, chain) {
    return (chainColors && chainColors[chain]) || '#6b7280';
  }

  function displayName(c, lang) {
    if (lang === 'en' && c.nameEn) return c.nameEn;
    return c.name || c.nameKo || c.ticker || '';
  }

  function buildHierarchy(companies, chainColors) {
    var byChain = {};
    (companies || []).forEach(function (c) {
      var ch = c.chain || '—';
      if (!byChain[ch]) byChain[ch] = [];
      byChain[ch].push(c);
    });
    var chains = Object.keys(byChain).sort(function (a, b) {
      var sumA = 0;
      var sumB = 0;
      byChain[a].forEach(function (x) { sumA += Math.max(x.mcapWon || 0, 0); });
      byChain[b].forEach(function (x) { sumB += Math.max(x.mcapWon || 0, 0); });
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

  function renderLegend(el, chains, chainColors, lang, chainLabelFn) {
    if (!el) return;
    el.innerHTML = chains
      .map(function (ch) {
        var label = chainLabelFn ? chainLabelFn(ch) : ch;
        var col = chainColor(chainColors, ch);
        return (
          '<span><i style="background:' +
          col +
          '"></i>' +
          label +
          '</span>'
        );
      })
      .join('');
  }

  function render(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container || typeof d3 === 'undefined') return;
    var companies = opts.companies || [];
    var chainColors = opts.chainColors || {};
    var lang = opts.lang || 'ko';
    var formatMcap = opts.formatMcap || function (c) { return c.mcapWon ? String(c.mcapWon) : '—'; };
    var chainLabelFn = opts.chainLabel;

    container.innerHTML = '';
    var w = container.clientWidth || 800;
    var h = container.clientHeight || 480;
    if (w < 200) w = 800;
    if (h < 200) h = 480;

    var data = buildHierarchy(companies, chainColors);
    if (!data.children || !data.children.length) {
      container.textContent = lang === 'en' ? 'No market cap data.' : '시가총액 데이터가 없습니다.';
      return;
    }

    var root = d3
      .hierarchy(data)
      .sum(function (d) { return d.value || 0; })
      .sort(function (a, b) { return (b.value || 0) - (a.value || 0); });

    d3
      .treemap()
      .size([w, h])
      .paddingOuter(6)
      .paddingTop(function (d) { return d.depth === 1 ? 22 : 2; })
      .paddingInner(2)
      .round(true)(root);

    var chains = data.children.map(function (g) { return g.name; });
    renderLegend(opts.legend, chains, chainColors, lang, chainLabelFn);

    var svg = d3
      .select(container)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .attr('viewBox', '0 0 ' + w + ' ' + h);

    var nodes = svg
      .selectAll('g')
      .data(root.descendants().filter(function (d) { return d.depth > 0; }))
      .join('g')
      .attr('class', 'hm-tile')
      .attr('transform', function (d) {
        return 'translate(' + d.x0 + ',' + d.y0 + ')';
      });

    nodes.each(function (d) {
      var g = d3.select(this);
      var leaf = d.data.company;
      var ch = d.data.chain || (d.parent && d.parent.data && d.parent.data.chain);
      var col = chainColor(chainColors, ch);
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

      var base = d3.rgb(col);
      var fill = base.brighter(leaf.mcapWon ? 0.15 : 0.5);
      g.append('rect')
        .attr('width', Math.max(0, tw))
        .attr('height', Math.max(0, th))
        .attr('fill', fill)
        .attr('stroke', 'rgba(0,0,0,0.12)')
        .attr('stroke-width', 1)
        .attr('rx', 3);

      var nm = displayName(leaf, lang);
      var mcap = formatMcap(leaf);
      var tip = nm + ' (' + (leaf.ticker || '') + ') — ' + mcap;
      g.attr('title', tip);

      if (tw > 56 && th > 36) {
        g.append('text')
          .attr('class', 'hm-name')
          .attr('x', 6)
          .attr('y', 16)
          .attr('fill', '#fff')
          .text(nm.length > Math.floor(tw / 7) ? nm.slice(0, Math.max(4, Math.floor(tw / 7) - 1)) + '…' : nm);
      }
      if (tw > 48 && th > 52) {
        g.append('text')
          .attr('class', 'hm-mcap')
          .attr('x', 6)
          .attr('y', 30)
          .text(mcap);
      }
    });

    nodes.filter(function (d) { return d.depth === 2; }).on('click', function (ev, d) {
      if (!d.data.company || !opts.onSelect) return;
      opts.onSelect(d.data.company);
    });
  }

  global.InvestingMapHeatmap = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
