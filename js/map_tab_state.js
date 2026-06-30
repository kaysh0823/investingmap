/**
 * Preserve heatmap / table / graph tab when switching industry via nav links.
 * ?tab=table&ticker=005930 — open company list and scroll to the row.
 */
(function (global) {
  'use strict';

  var VALID = { heatmap: 1, table: 1, graph: 1 };
  var pendingFocusTicker = null;
  var focusStyleInjected = false;

  function injectFocusStyle() {
    if (focusStyleInjected) return;
    focusStyleInjected = true;
    var css =
      '#table-body tr.im-row-focus td{background:color-mix(in srgb,var(--accent) 14%,var(--surface2))!important}' +
      '#table-body tr.im-row-focus td:first-child .company-name{color:var(--accent)}';
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

  function getTab() {
    try {
      var sp = new URLSearchParams(window.location.search);
      if (sp.get('ticker')) return 'table';
      var q = sp.get('tab');
      if (q && VALID[q]) return q;
    } catch (e) {}
    var tableEl = document.getElementById('tab-table');
    if (tableEl && tableEl.classList.contains('active')) return 'table';
    var graphEl = document.getElementById('tab-graph');
    if (graphEl && graphEl.classList.contains('active')) return 'graph';
    var heatEl = document.getElementById('tab-heatmap');
    if (heatEl && heatEl.classList.contains('active')) return 'heatmap';
    try {
      var s = localStorage.getItem('im_map_tab');
      if (s && VALID[s]) return s;
    } catch (e2) {}
    return 'heatmap';
  }

  function onTabChange(tab) {
    if (!VALID[tab]) return;
    try {
      localStorage.setItem('im_map_tab', tab);
    } catch (e) {}
    try {
      var u = new URL(window.location.href);
      if (tab === 'heatmap') u.searchParams.delete('tab');
      else u.searchParams.set('tab', tab);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e2) {}
  }

  function appendToNavUrl(href) {
    var tab = getTab();
    if (!tab || tab === 'heatmap') return href;
    try {
      var u = new URL(href, window.location.href);
      u.searchParams.set('tab', tab);
      return u.pathname + u.search + u.hash;
    } catch (e) {
      var sep = href.indexOf('?') >= 0 ? '&' : '?';
      return href + sep + 'tab=' + encodeURIComponent(tab);
    }
  }

  function scrollToTicker(ticker) {
    if (!ticker) return false;
    injectFocusStyle();
    if (global.InvestingMapMobileTable && global.InvestingMapMobileTable.scrollToTicker) {
      global.InvestingMapMobileTable.scrollToTicker(ticker);
      var card = document.querySelector('#table-cards [data-ticker="' + ticker + '"]');
      if (card) card.classList.add('im-row-focus');
      return true;
    }
    var row = document.querySelector('#table-body tr[data-ticker="' + ticker + '"]');
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add('im-row-focus');
      setTimeout(function () {
        row.classList.remove('im-row-focus');
      }, 2500);
      return true;
    }
    return false;
  }

  function applyInitialTickerFocus() {
    var ticker = getFocusTicker();
    if (!ticker) return;
    pendingFocusTicker = ticker;
    var attempts = 0;
    function tryScroll() {
      if (!pendingFocusTicker) return;
      if (scrollToTicker(pendingFocusTicker)) {
        pendingFocusTicker = null;
        return;
      }
      attempts += 1;
      if (attempts < 40) setTimeout(tryScroll, 150);
      else pendingFocusTicker = null;
    }
    setTimeout(tryScroll, 80);
  }

  function focusTickerIfPending() {
    if (!pendingFocusTicker) return;
    if (scrollToTicker(pendingFocusTicker)) pendingFocusTicker = null;
  }

  function applyInitialTab(switchTab) {
    if (typeof switchTab !== 'function') return;
    var tab = getTab();
    if (!tab || tab === 'heatmap') {
      applyInitialTickerFocus();
      return;
    }
    var btnIds = { table: 'tab-btn-table', graph: 'tab-btn-graph', heatmap: 'tab-btn-heatmap' };
    var btn = document.getElementById(btnIds[tab]);
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
    buildMapTableTickerUrl: buildMapTableTickerUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
