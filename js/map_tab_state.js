/**
 * Preserve table / heatmap / graph tab when switching industry via nav links.
 * Default tab is company list (table). Hub links use ?tab=table.
 * ?tab=table&ticker=005930 — open company list and scroll to the row.
 */
(function (global) {
  'use strict';

  var VALID = { heatmap: 1, table: 1, graph: 1 };
  var focusStyleInjected = false;

  function injectFocusStyle() {
    if (focusStyleInjected) return;
    focusStyleInjected = true;
    var css =
      '#table-body tr.im-row-focus td{background:color-mix(in srgb,var(--accent) 14%,var(--surface2))!important}' +
      '#table-body tr.im-row-focus td:first-child .company-name{color:var(--accent)}' +
      '#table-cards [data-ticker].im-row-focus{outline:2px solid var(--accent);outline-offset:2px}';
    var el = document.createElement('style');
    el.id = 'im-map-ticker-focus-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function getFocusTicker() {
    try {
      var t = new URLSearchParams(window.location.search).get('ticker');
      return t ? String(t).trim() : '';
    } catch (e) {
      return '';
    }
  }

  function isTableTabActive() {
    var tableEl = document.getElementById('tab-table');
    return tableEl && tableEl.classList.contains('active');
  }

  function getTab() {
    try {
      var sp = new URLSearchParams(window.location.search);
      if (sp.get('ticker')) return 'table';
      var q = sp.get('tab');
      if (q && VALID[q]) return q;
    } catch (e) {}
    try {
      var s = localStorage.getItem('im_map_tab');
      if (s && VALID[s]) return s;
    } catch (e2) {}
    if (isTableTabActive()) return 'table';
    var graphEl = document.getElementById('tab-graph');
    if (graphEl && graphEl.classList.contains('active')) return 'graph';
    var heatEl = document.getElementById('tab-heatmap');
    if (heatEl && heatEl.classList.contains('active')) return 'heatmap';
    return 'table';
  }

  function onTabChange(tab) {
    if (!VALID[tab]) return;
    try {
      localStorage.setItem('im_map_tab', tab);
    } catch (e) {}
    try {
      var u = new URL(window.location.href);
      if (tab === 'table') u.searchParams.delete('tab');
      else u.searchParams.set('tab', tab);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e2) {}
    try {
      if (global.matchMedia && global.matchMedia('(max-width: 768px)').matches) {
        global.scrollTo(0, 0);
      }
    } catch (e3) {}
  }

  function appendToNavUrl(href) {
    var tab = getTab();
    if (!tab || tab === 'table') return href;
    try {
      var u = new URL(href, window.location.href);
      u.searchParams.set('tab', tab);
      return u.pathname + u.search + u.hash;
    } catch (e) {
      var sep = href.indexOf('?') >= 0 ? '&' : '?';
      return href + sep + 'tab=' + encodeURIComponent(tab);
    }
  }

  function clearRowFocus() {
    document.querySelectorAll('#table-body tr.im-row-focus').forEach(function (r) {
      r.classList.remove('im-row-focus');
    });
    document.querySelectorAll('#table-cards [data-ticker].im-row-focus').forEach(function (c) {
      c.classList.remove('im-row-focus');
    });
  }

  function findTickerElement(ticker) {
    if (!ticker) return null;
    var mobile = global.InvestingMapMobileTable && global.InvestingMapMobileTable.isMobile
      && global.InvestingMapMobileTable.isMobile();
    if (mobile) {
      return document.querySelector('#table-cards [data-ticker="' + ticker + '"]')
        || document.querySelector('#table-body tr[data-ticker="' + ticker + '"]');
    }
    return document.querySelector('#table-body tr[data-ticker="' + ticker + '"]');
  }

  function scrollToTicker(ticker, opts) {
    if (!ticker) return false;
    opts = opts || {};
    injectFocusStyle();
    var el = findTickerElement(ticker);
    if (!el) return false;

    clearRowFocus();
    if (global.InvestingMapMobileTable && global.InvestingMapMobileTable.scrollToTicker && el.closest('#table-cards')) {
      global.InvestingMapMobileTable.scrollToTicker(ticker);
    } else {
      el.scrollIntoView({ block: 'center', behavior: opts.instant ? 'auto' : 'smooth' });
    }
    el.classList.add('im-row-focus');
    if (!opts.keepHighlight) {
      setTimeout(function () {
        el.classList.remove('im-row-focus');
      }, 2500);
    }
    return true;
  }

  /** Re-scroll after table re-render (e.g. quotePosition sort) while ?ticker= is set. */
  function focusTickerAfterTableRender() {
    var ticker = getFocusTicker();
    if (!ticker || !isTableTabActive()) return;
    requestAnimationFrame(function () {
      scrollToTicker(ticker);
    });
  }

  function applyInitialTickerFocus() {
    var ticker = getFocusTicker();
    if (!ticker) return;
    var attempts = 0;
    function tryScroll() {
      ticker = getFocusTicker();
      if (!ticker) return;
      if (scrollToTicker(ticker)) return;
      attempts += 1;
      if (attempts < 40) setTimeout(tryScroll, 150);
    }
    setTimeout(tryScroll, 80);
  }

  function focusTickerIfPending() {
    focusTickerAfterTableRender();
  }

  function applyInitialTab(switchTab) {
    if (typeof switchTab !== 'function') return;
    var tab = getTab() || 'table';
    var btnIds = { table: 'tab-btn-table', graph: 'tab-btn-graph', heatmap: 'tab-btn-heatmap' };
    var btn = document.getElementById(btnIds[tab] || 'tab-btn-table');
    if (btn) switchTab(tab, btn);
    applyInitialTickerFocus();
  }

  function buildMapTableTickerUrl(mapPath, ticker, lang) {
    try {
      var u = new URL(mapPath || 'index.html', global.location && global.location.href ? global.location.href : undefined);
      if (lang) u.searchParams.set('lang', lang);
      u.searchParams.set('tab', 'table');
      if (ticker) u.searchParams.set('ticker', String(ticker).trim());
      return u.pathname + u.search + u.hash;
    } catch (e) {
      var sep = (mapPath || '').indexOf('?') >= 0 ? '&' : '?';
      var q = 'tab=table';
      if (lang) q += '&lang=' + encodeURIComponent(lang);
      if (ticker) q += '&ticker=' + encodeURIComponent(String(ticker).trim());
      return (mapPath || 'index.html') + sep + q;
    }
  }

  global.InvestingMapTabState = {
    getTab: getTab,
    getFocusTicker: getFocusTicker,
    onTabChange: onTabChange,
    appendToNavUrl: appendToNavUrl,
    applyInitialTab: applyInitialTab,
    scrollToTicker: scrollToTicker,
    focusTickerIfPending: focusTickerIfPending,
    focusTickerAfterTableRender: focusTickerAfterTableRender,
    buildMapTableTickerUrl: buildMapTableTickerUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
