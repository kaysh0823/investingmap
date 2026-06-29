/**
 * Mobile layout fixes: sector nav grid, tab labels, header toolbar.
 */
(function (global) {
  'use strict';

  var MQ = '(max-width: 768px)';
  var mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MQ) : null;

  var TAB_SHORT = {
    ko: {
      'tab-btn-heatmap': '🔥 히트맵',
      'tab-btn-table': '📋 기업목록',
      'tab-btn-graph': '🌐 네트워크',
    },
    en: {
      'tab-btn-heatmap': '🔥 Heatmap',
      'tab-btn-table': '📋 List',
      'tab-btn-graph': '🌐 Network',
    },
  };

  function isMobile() {
    return mql && mql.matches;
  }

  function pageLang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'en' || l === 'ko') return l;
    try {
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) {}
    return 'ko';
  }

  function injectStyles() {
    if (document.getElementById('im-mobile-ux-css')) return;
    var css =
      '.header-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:flex-end;width:100%}' +
      '@media (max-width:768px){' +
      '.theme-toggle,.lang-toggle{flex:0 0 auto}' +
      '.header-actions .quotes-asof{flex:1 0 100%;text-align:left;white-space:normal;font-size:10px;line-height:1.4}' +
      '.tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;flex-wrap:unset!important;overflow:visible!important;padding:0!important;border-bottom:1px solid var(--border)}' +
      '.tab-btn{flex:unset!important;min-width:0!important;padding:10px 6px!important;font-size:11px!important;line-height:1.35!important;white-space:normal!important;word-break:keep-all!important;text-align:center!important;min-height:44px;display:flex;align-items:center;justify-content:center;border-bottom:2px solid transparent;margin:0!important}' +
      '.tab-btn.active{border-bottom-color:var(--accent)}' +
      '.header h1{word-break:keep-all;line-height:1.3;padding-right:0}' +
      '.header p{word-break:keep-all;line-height:1.5}' +
      '.heatmap-meta{word-break:keep-all;line-height:1.45}' +
      '.graph-hint{white-space:normal;word-break:keep-all;line-height:1.4}' +
      '.filter-label{white-space:nowrap}' +
      '.result-count{white-space:nowrap}' +
      '}';
    var el = document.createElement('style');
    el.id = 'im-mobile-ux-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function syncTabs() {
    var lang = pageLang();
    var short = TAB_SHORT[lang] || TAB_SHORT.ko;
    var mobile = isMobile();
    ['tab-btn-heatmap', 'tab-btn-table', 'tab-btn-graph'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var current = el.innerHTML;
      var shortLabel = short[id];
      if (!mobile) {
        el.innerHTML = el.dataset.fullLabel || current;
        el.dataset.fullLabel = el.innerHTML;
        return;
      }
      if (shortLabel && current !== shortLabel) el.dataset.fullLabel = current;
      el.innerHTML = shortLabel || el.dataset.fullLabel || current;
    });
  }

  function syncAll() {
    injectStyles();
    syncTabs();
  }

  if (mql && mql.addEventListener) {
    mql.addEventListener('change', syncAll);
  } else if (mql && mql.addListener) {
    mql.addListener(syncAll);
  }

  injectStyles();

  global.InvestingMapMobileUx = {
    isMobile: isMobile,
    syncTabs: syncTabs,
    syncAll: syncAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
