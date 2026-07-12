/**
 * Mobile: company table → compact card list (no horizontal scroll).
 * Cards collapse to a summary; tap header to expand details (mobile only).
 */
(function (global) {
  'use strict';

  var MQ = '(max-width: 768px)';
  var mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MQ) : null;

  function injectStyles() {
    if (document.getElementById('im-mobile-table-css')) return;
    var css =
      '@media (max-width:768px){' +
      'html,body{overflow-x:hidden;max-width:100vw}' +
      '.tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;overflow:visible!important;flex-wrap:unset!important;padding:8px 0!important}' +
      '.tab-btn{flex:unset!important;min-width:0!important;text-align:center;white-space:normal!important;word-break:keep-all!important;line-height:1.35;padding:10px 6px!important;font-size:11px!important}' +
      '.tbl-wrap{overflow-x:hidden!important;border:none;background:transparent}' +
      '#main-table.im-hide-mobile{display:none!important}' +
      '.im-mobile-cards{display:block!important}' +
      '.heatmap-wrap{padding:12px 14px 20px!important}' +
      '.geo-summary.map-editorial-collapsible{padding-left:14px!important;padding-right:14px!important}' +
      '.filter-bar{flex-wrap:wrap;max-width:100%}' +
      '.header,.table-container{max-width:100%;overflow-x:hidden}' +
      '.im-stock-card .im-card-summary{display:block}' +
      '.im-stock-card .im-card-detail{max-height:0;overflow:hidden;transition:max-height .28s ease}' +
      '.im-stock-card .im-card-toggle{cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}' +
      '.im-stock-card .im-card-toggle:focus{outline:2px solid var(--accent);outline-offset:-2px}' +
      '.im-stock-card .im-card-toggle:focus:not(:focus-visible){outline:none}' +
      '.im-stock-card .im-card-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}' +
      '.im-stock-card .im-card-chevron{flex-shrink:0;width:1.1em;height:1.1em;margin-top:3px;margin-left:4px;color:var(--text-muted);transition:transform .28s ease;display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1}' +
      '.im-stock-card.is-expanded .im-card-chevron{transform:rotate(180deg)}' +
      '.im-stock-card .im-row-head{align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;background:var(--surface2)}' +
      '}' +      '@media (min-width:769px){' +
      '.im-mobile-cards{display:none!important}' +
      '}' +
      '.im-mobile-cards{display:none;padding:4px 0 12px}' +
      '.im-stock-card{margin:0 0 6px;border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden}' +
      '.im-stock-card.im-card-flash{outline:2px solid var(--accent);outline-offset:1px}' +
      '.im-row{display:flex;align-items:center;border-bottom:1px solid var(--border);min-width:0}' +
      '.im-row:last-child{border-bottom:none}' +
      '.im-row-head{align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;background:var(--surface2)}' +
      '.im-row-name{flex:1;min-width:0}' +
      '.im-row-name .company-name{font-size:15px;font-weight:700;color:var(--text);line-height:1.35}' +
      '.im-row-name .company-name-sub{font-size:11px;color:var(--text-muted);margin-top:2px;font-weight:400;line-height:1.3}' +
      '.im-row-meta{flex-shrink:0;text-align:right;font-size:12px;color:var(--text-muted);display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px;line-height:1.4}' +
      '.im-row-meta .ticker{font-family:monospace;color:var(--accent);font-weight:600}' +
      '.im-row-2col{display:grid;grid-template-columns:1fr 1fr;align-items:stretch}' +
      '.im-kv{display:flex;align-items:baseline;justify-content:space-between;gap:6px;min-width:0;padding:8px 10px}' +
      '.im-row-2col .im-kv{border-right:1px solid var(--border)}' +
      '.im-row-2col .im-kv:last-child{border-right:none}' +
      '.im-kv-lbl{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;flex-shrink:0}' +
      '.im-kv-val{font-size:14px;font-weight:600;color:var(--text);text-align:right;min-width:0;word-break:break-word}' +
      '.im-kv-val .quote-cell{display:inline}' +
      '.im-row-kv{align-items:flex-start;justify-content:space-between;gap:8px;padding:8px 12px}' +
      '.im-row-kv .im-kv-lbl{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;flex-shrink:0;max-width:38%}' +
      '.im-row-kv .im-kv-val{font-size:12px;font-weight:400;color:var(--text);text-align:right;flex:1;min-width:0;line-height:1.45}' +
      '.im-row-kv .im-kv-val .partner-tag,.im-row-kv .im-kv-val .chain-tag{font-size:11px;margin:2px 0 2px 4px}' +
      '.im-row-split .im-split-col{display:flex;flex-direction:column;gap:4px;padding:8px 10px;min-width:0;border-right:1px solid var(--border)}' +
      '.im-row-split .im-split-col:last-child{border-right:none}' +
      '.im-split-line{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px;min-width:0;width:100%}' +
      '.im-split-lbl{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;line-height:1.35}' +
      '.im-split-val{font-size:14px;font-weight:600;color:var(--text);line-height:1.35}' +
      '.im-split-sep{color:var(--text-muted);font-weight:400;font-size:12px;margin:0 1px}' +
      '@media (max-width:768px){.im-mobile-cards{display:block}}';
    var el = document.createElement('style');
    el.id = 'im-mobile-table-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function colMapFromTable(table) {
    var map = {};
    var ths = table.querySelectorAll('thead th');
    for (var i = 0; i < ths.length; i++) {
      var id = ths[i].id;
      if (id) map[id] = i;
    }
    return map;
  }

  function cellHtml(tr, map, id) {
    var idx = map[id];
    if (idx == null || !tr.cells[idx]) return '';
    return tr.cells[idx].innerHTML;
  }

  function cellText(tr, map, id) {
    var idx = map[id];
    if (idx == null || !tr.cells[idx]) return '';
    return (tr.cells[idx].textContent || '').trim();
  }

  function ensureCardsRoot(table) {
    var wrap = table.closest('.tbl-wrap');
    if (!wrap) return null;
    var root = document.getElementById('table-cards');
    if (!root) {
      root = document.createElement('div');
      root.id = 'table-cards';
      root.className = 'im-mobile-cards';
      root.setAttribute('aria-live', 'polite');
      wrap.appendChild(root);
    }
    return root;
  }

  function kvCell(lbl, val) {
    return (
      '<div class="im-kv"><span class="im-kv-lbl">' +
      lbl +
      '</span><span class="im-kv-val">' +
      (val || '—') +
      '</span></div>'
    );
  }

  function row2col(left, right) {
    return '<div class="im-row im-row-2col">' + left + right + '</div>';
  }

  function splitPair(a, b) {
    return (
      '<span>' +
      (a || '—') +
      '</span><span class="im-split-sep">/</span><span>' +
      (b || '—') +
      '</span>'
    );
  }

  function rowPosRsHiLo(lblPos, lblRs, pos, rs, lblHi, lblLo, hi, lo) {
    var left =
      '<div class="im-split-col">' +
      '<div class="im-split-line im-split-lbl">' +
      splitPair(lblPos, lblRs) +
      '</div>' +
      '<div class="im-split-line im-split-val">' +
      splitPair(pos, rs) +
      '</div></div>';
    var right =
      '<div class="im-split-col">' +
      '<div class="im-split-line im-split-lbl">' +
      splitPair(lblHi, lblLo) +
      '</div>' +
      '<div class="im-split-line im-split-val">' +
      splitPair(hi, lo) +
      '</div></div>';
    return '<div class="im-row im-row-2col im-row-split">' + left + right + '</div>';
  }

  function rowKv(lbl, val) {
    if (!val || val === '—') return '';
    return (
      '<div class="im-row im-row-kv"><span class="im-kv-lbl">' +
      lbl +
      '</span><span class="im-kv-val">' +
      val +
      '</span></div>'
    );
  }

  function thLabel(id, fallback) {
    return (document.getElementById(id) || {}).textContent || fallback || '';
  }

  function collectExpandedTickers(root) {
    var out = new Set();
    if (!root) return out;
    var cards = root.querySelectorAll('.im-stock-card.is-expanded[data-ticker]');
    for (var i = 0; i < cards.length; i++) {
      var t = cards[i].getAttribute('data-ticker');
      if (t) out.add(t);
    }
    return out;
  }

  function setCardExpanded(card, expanded) {
    if (!card) return;
    var toggle = card.querySelector('.im-card-toggle');
    var detail = card.querySelector('.im-card-detail');
    card.classList.toggle('is-expanded', !!expanded);
    if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (!detail) return;
    if (expanded) {
      detail.style.maxHeight = detail.scrollHeight + 'px';
    } else {
      if (!detail.style.maxHeight || detail.style.maxHeight === '0px') {
        detail.style.maxHeight = '0px';
      } else {
        detail.style.maxHeight = detail.scrollHeight + 'px';
        // Force reflow so collapse animates from current height.
        void detail.offsetHeight;
        detail.style.maxHeight = '0px';
      }
    }
  }

  function toggleCard(card) {
    if (!card) return;
    setCardExpanded(card, !card.classList.contains('is-expanded'));
  }

  function bindCardInteractions(root) {
    if (!root || root.getAttribute('data-im-accordion-bound') === '1') return;
    root.setAttribute('data-im-accordion-bound', '1');

    root.addEventListener('click', function (e) {
      var toggle = e.target.closest && e.target.closest('.im-card-toggle');
      if (!toggle || !root.contains(toggle)) return;
      e.preventDefault();
      toggleCard(toggle.closest('.im-stock-card'));
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var toggle = e.target.closest && e.target.closest('.im-card-toggle');
      if (!toggle || !root.contains(toggle)) return;
      e.preventDefault();
      toggleCard(toggle.closest('.im-stock-card'));
    });
  }

  function buildCard(tr, map) {
    var ticker = tr.getAttribute('data-ticker') || cellText(tr, map, 'th-ticker');
    var safeTicker = String(ticker || '').replace(/"/g, '');
    var detailId = 'im-card-detail-' + (safeTicker || 'x');
    var nameBlock = cellHtml(tr, map, 'th-name');
    var marketBlock = cellHtml(tr, map, 'th-market');
    var tickerSpan = cellHtml(tr, map, 'th-ticker');
    var last = cellHtml(tr, map, 'th-last');
    var mcap = cellHtml(tr, map, 'th-mcap');
    var per = cellHtml(tr, map, 'th-per');
    var pbr = cellHtml(tr, map, 'th-pbr');
    var pos = cellHtml(tr, map, 'th-position');
    var rs = cellHtml(tr, map, 'th-rs');
    var hi = cellHtml(tr, map, 'th-52hi');
    var lo = cellHtml(tr, map, 'th-52lo');
    var chain = cellHtml(tr, map, 'th-chain');
    var sem = cellHtml(tr, map, 'th-semtype');
    var products = cellHtml(tr, map, 'th-products');
    var partners = cellHtml(tr, map, 'th-partners');

    var lblChain = thLabel('th-chain', '');
    var lblSem = thLabel('th-semtype', '');
    var lblProd = thLabel('th-products', '');
    var lblPart = thLabel('th-partners', '');
    var lblHi = thLabel('th-52hi', '52W Hi');
    var lblLo = thLabel('th-52lo', '52W Lo');
    var lblLast = thLabel('th-last', '');
    var lblMcap = thLabel('th-mcap', '');
    var lblPer = thLabel('th-per', 'PER');
    var lblPbr = thLabel('th-pbr', 'PBR');
    var lblPos = thLabel('th-position', '');
    var lblRs = thLabel('th-rs', 'RS');
    var lbl1d = thLabel('th-chg1d', '1D');

    var meta = tickerSpan || ticker;
    if (marketBlock) meta += ' · ' + marketBlock;

    var summary =
      '<div class="im-card-summary im-card-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="' +
      detailId +
      '">' +
      '<div class="im-row im-row-head">' +
      '<div class="im-row-name">' +
      nameBlock +
      '</div>' +
      '<div class="im-row-meta">' +
      meta +
      '</div>' +
      '<span class="im-card-chevron" aria-hidden="true">▼</span>' +
      '</div>' +
      row2col(kvCell(lblLast, last), kvCell(lbl1d, cellHtml(tr, map, 'th-chg1d'))) +
      '<div class="im-row im-row-kv"><span class="im-kv-lbl">' +
      lblMcap +
      '</span><span class="im-kv-val">' +
      (mcap || '—') +
      '</span></div>' +
      '</div>';

    var detail =
      '<div class="im-card-detail" id="' +
      detailId +
      '" style="max-height:0px">' +
      row2col(
        kvCell(thLabel('th-ret20d', '20D'), cellHtml(tr, map, 'th-ret20d')),
        kvCell(thLabel('th-ret50d', '50D'), cellHtml(tr, map, 'th-ret50d'))
      ) +
      row2col(
        kvCell(thLabel('th-ret120d', '120D'), cellHtml(tr, map, 'th-ret120d')),
        kvCell(thLabel('th-ret250d', '250D'), cellHtml(tr, map, 'th-ret250d'))
      ) +
      row2col(kvCell(lblPer, per), kvCell(lblPbr, pbr)) +
      rowPosRsHiLo(lblPos, lblRs, pos, rs, lblHi, lblLo, hi, lo) +
      rowKv(lblChain, chain) +
      rowKv(lblSem, sem) +
      rowKv(lblProd, products) +
      rowKv(lblPart, partners) +
      '</div>';

    return (
      '<article class="im-stock-card" data-ticker="' +
      safeTicker +
      '">' +
      summary +
      detail +
      '</article>'
    );
  }

  function applyVisibility(table) {
    var mobile = mql && mql.matches;
    table.classList.toggle('im-hide-mobile', !!mobile);
    var root = document.getElementById('table-cards');
    if (root) root.style.display = mobile ? 'block' : 'none';
  }

  function restoreExpanded(root, expandedTickers) {
    if (!root || !expandedTickers || !expandedTickers.size) return;
    expandedTickers.forEach(function (ticker) {
      var card = root.querySelector('.im-stock-card[data-ticker="' + ticker + '"]');
      if (card) setCardExpanded(card, true);
    });
  }

  function sync(table) {
    if (!table) return;
    injectStyles();
    var root = ensureCardsRoot(table);
    if (!root) return;
    var expandedTickers = collectExpandedTickers(root);
    var map = colMapFromTable(table);
    var rows = table.querySelectorAll('#table-body tr');
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += buildCard(rows[i], map);
    }
    root.innerHTML = html;
    bindCardInteractions(root);
    restoreExpanded(root, expandedTickers);
    applyVisibility(table);
  }

  function scrollToTicker(ticker) {
    if (!ticker) return;
    var mobile = mql && mql.matches;
    var el = mobile
      ? document.querySelector('#table-cards [data-ticker="' + ticker + '"]')
      : document.querySelector('#table-body tr[data-ticker="' + ticker + '"]');
    if (!el && mobile) {
      el = document.querySelector('#table-body tr[data-ticker="' + ticker + '"]');
    }
    if (el) {
      if (mobile && el.classList.contains('im-stock-card')) {
        setCardExpanded(el, true);
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('im-card-flash');
      setTimeout(function () {
        el.classList.remove('im-card-flash');
      }, 1800);
    }
  }

  function onViewportChange() {
    var table = document.getElementById('main-table');
    if (table) applyVisibility(table);
    if (!(mql && mql.matches)) return;
    var expanded = document.querySelectorAll('#table-cards .im-stock-card.is-expanded');
    for (var i = 0; i < expanded.length; i++) {
      setCardExpanded(expanded[i], true);
    }
  }

  if (mql && mql.addEventListener) {
    mql.addEventListener('change', onViewportChange);
  } else if (mql && mql.addListener) {
    mql.addListener(onViewportChange);
  }

  injectStyles();

  global.InvestingMapMobileTable = {
    sync: sync,
    scrollToTicker: scrollToTicker,
    isMobile: function () {
      return mql && mql.matches;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
