/**
 * Mobile: company table → card list (no horizontal scroll).
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
      '}' +
      '@media (min-width:769px){' +
      '.im-mobile-cards{display:none!important}' +
      '}' +
      '.im-mobile-cards{display:none;padding:4px 0 12px}' +
      '.im-stock-card{margin:0 0 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden}' +
      '.im-stock-card.im-card-flash{outline:2px solid var(--accent);outline-offset:1px}' +
      '.im-stock-card-head{padding:12px 14px;background:var(--surface2);border-bottom:1px solid var(--border)}' +
      '.im-stock-card-head .company-name{font-size:15px;font-weight:700;color:var(--text);line-height:1.35}' +
      '.im-stock-card-head .company-name-sub{font-size:11px;color:var(--text-muted);margin-top:2px;font-weight:400}' +
      '.im-stock-card-meta{margin-top:6px;font-size:12px;color:var(--text-muted);display:flex;flex-wrap:wrap;align-items:center;gap:6px}' +
      '.im-stock-card-meta .ticker{font-family:monospace;color:var(--accent);font-weight:600}' +
      '.im-stock-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border)}' +
      '.im-metric{padding:10px 12px;background:var(--surface);display:flex;flex-direction:column;gap:4px;min-width:0}' +
      '.im-metric-lbl{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px}' +
      '.im-metric-val{font-size:14px;font-weight:600;color:var(--text);word-break:break-all}' +
      '.im-stock-card-extra{padding:10px 14px 12px;font-size:12px;color:var(--text-muted);line-height:1.55;display:flex;flex-direction:column;gap:8px}' +
      '.im-extra-row{display:flex;flex-direction:column;gap:3px}' +
      '.im-extra-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted)}' +
      '.im-extra-val{color:var(--text);font-size:12px}' +
      '.im-extra-val .partner-tag,.im-extra-val .chain-tag{font-size:11px;margin:2px 4px 2px 0}' +
      '.im-metric-val .quote-cell{display:inline}' +
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

  function buildCard(tr, map) {
    var ticker = tr.getAttribute('data-ticker') || cellText(tr, map, 'th-ticker');
    var nameBlock = cellHtml(tr, map, 'th-name');
    var marketBlock = cellHtml(tr, map, 'th-market');
    var tickerSpan = cellHtml(tr, map, 'th-ticker');
    var last = cellHtml(tr, map, 'th-last');
    var mcap = cellHtml(tr, map, 'th-mcap');
    var per = cellHtml(tr, map, 'th-per');
    var pbr = cellHtml(tr, map, 'th-pbr');
    var pos = cellHtml(tr, map, 'th-position');
    var hi = cellText(tr, map, 'th-52hi');
    var lo = cellText(tr, map, 'th-52lo');
    var chain = cellHtml(tr, map, 'th-chain');
    var sem = cellHtml(tr, map, 'th-semtype');
    var products = cellHtml(tr, map, 'th-products');
    var partners = cellHtml(tr, map, 'th-partners');

    var lblChain = (document.getElementById('th-chain') || {}).textContent || '';
    var lblSem = (document.getElementById('th-semtype') || {}).textContent || '';
    var lblProd = (document.getElementById('th-products') || {}).textContent || '';
    var lblPart = (document.getElementById('th-partners') || {}).textContent || '';
    var lblHi = (document.getElementById('th-52hi') || {}).textContent || '52W Hi';
    var lblLo = (document.getElementById('th-52lo') || {}).textContent || '52W Lo';
    var lblLast = (document.getElementById('th-last') || {}).textContent || '';
    var lblMcap = (document.getElementById('th-mcap') || {}).textContent || '';
    var lblPer = (document.getElementById('th-per') || {}).textContent || 'PER';
    var lblPbr = (document.getElementById('th-pbr') || {}).textContent || 'PBR';
    var lblPos = (document.getElementById('th-position') || {}).textContent || '';

    var meta = tickerSpan || ticker;
    if (marketBlock) meta += ' · ' + marketBlock;

    var extras = '';
    if (hi || lo) {
      extras +=
        '<div class="im-extra-row"><span class="im-extra-lbl">' +
        lblHi +
        ' / ' +
        lblLo +
        '</span><span class="im-extra-val">' +
        (hi || '—') +
        ' · ' +
        (lo || '—') +
        '</span></div>';
    }
    if (chain) {
      extras +=
        '<div class="im-extra-row"><span class="im-extra-lbl">' +
        lblChain +
        '</span><span class="im-extra-val">' +
        chain +
        '</span></div>';
    }
    if (sem && sem !== '—') {
      extras +=
        '<div class="im-extra-row"><span class="im-extra-lbl">' +
        lblSem +
        '</span><span class="im-extra-val">' +
        sem +
        '</span></div>';
    }
    if (products && products !== '—') {
      extras +=
        '<div class="im-extra-row"><span class="im-extra-lbl">' +
        lblProd +
        '</span><span class="im-extra-val">' +
        products +
        '</span></div>';
    }
    if (partners) {
      extras +=
        '<div class="im-extra-row"><span class="im-extra-lbl">' +
        lblPart +
        '</span><span class="im-extra-val">' +
        partners +
        '</span></div>';
    }

    return (
      '<article class="im-stock-card" data-ticker="' +
      (ticker || '') +
      '">' +
      '<header class="im-stock-card-head">' +
      nameBlock +
      '<div class="im-stock-card-meta">' +
      meta +
      '</div></header>' +
      '<div class="im-stock-card-grid">' +
      '<div class="im-metric"><span class="im-metric-lbl">' +
      lblLast +
      '</span><span class="im-metric-val">' +
      (last || '—') +
      '</span></div>' +
      '<div class="im-metric"><span class="im-metric-lbl">' +
      lblMcap +
      '</span><span class="im-metric-val">' +
      (mcap || '—') +
      '</span></div>' +
      '<div class="im-metric"><span class="im-metric-lbl">' +
      lblPer +
      '</span><span class="im-metric-val">' +
      (per || '—') +
      '</span></div>' +
      '<div class="im-metric"><span class="im-metric-lbl">' +
      lblPbr +
      '</span><span class="im-metric-val">' +
      (pbr || '—') +
      '</span></div>' +
      '<div class="im-metric" style="grid-column:1/-1"><span class="im-metric-lbl">' +
      lblPos +
      '</span><span class="im-metric-val">' +
      (pos || '—') +
      '</span></div>' +
      '</div>' +
      (extras ? '<div class="im-stock-card-extra">' + extras + '</div>' : '') +
      '</article>'
    );
  }

  function applyVisibility(table) {
    var mobile = mql && mql.matches;
    table.classList.toggle('im-hide-mobile', !!mobile);
    var root = document.getElementById('table-cards');
    if (root) root.style.display = mobile ? 'block' : 'none';
  }

  function sync(table) {
    if (!table) return;
    injectStyles();
    var root = ensureCardsRoot(table);
    if (!root) return;
    var map = colMapFromTable(table);
    var rows = table.querySelectorAll('#table-body tr');
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += buildCard(rows[i], map);
    }
    root.innerHTML = html;
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
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('im-card-flash');
      setTimeout(function () {
        el.classList.remove('im-card-flash');
      }, 1800);
    }
  }

  if (mql && mql.addEventListener) {
    mql.addEventListener('change', function () {
      var table = document.getElementById('main-table');
      if (table) applyVisibility(table);
    });
  } else if (mql && mql.addListener) {
    mql.addListener(function () {
      var table = document.getElementById('main-table');
      if (table) applyVisibility(table);
    });
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
