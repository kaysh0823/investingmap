/**
 * Preserve heatmap / table / graph tab when switching industry via nav links.
 */
(function (global) {
  'use strict';

  var VALID = { heatmap: 1, table: 1, graph: 1 };

  function getTab() {
    try {
      var q = new URLSearchParams(window.location.search).get('tab');
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

  function applyInitialTab(switchTab) {
    if (typeof switchTab !== 'function') return;
    var tab = getTab();
    if (!tab || tab === 'heatmap') return;
    var btnIds = { table: 'tab-btn-table', graph: 'tab-btn-graph', heatmap: 'tab-btn-heatmap' };
    var btn = document.getElementById(btnIds[tab]);
    if (btn) switchTab(tab, btn);
  }

  global.InvestingMapTabState = {
    getTab: getTab,
    onTabChange: onTabChange,
    appendToNavUrl: appendToNavUrl,
    applyInitialTab: applyInitialTab,
  };
})(typeof window !== 'undefined' ? window : globalThis);
