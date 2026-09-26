/**
 * Preserve table / heatmap / momentum / volatility / perfcalendar / valuation / netmap tab when switching industry via nav links.
 * Graph (관계 네트워크) is retired from public UI; ?tab=graph / localStorage 'graph' remap to netmap (else heatmap).
 * Sector nav links carry the current tab (?tab= omitted for table default).
 * ?tab=table&ticker=005930 — open company list and scroll to the row.
 */
(function (global) {
  'use strict';

  /** Tabs shown in the public UI. `graph` remains in VALID_LEGACY for deep-link remap only. */
  var PUBLIC_TABS = {
    heatmap: 1,
    momentum: 1,
    volatility: 1,
    perfcalendar: 1,
    valuation: 1,
    netmap: 1,
    table: 1,
  };

  function graphFallback() {
    try {
      if (typeof document !== 'undefined' && document.getElementById('tab-btn-netmap')) return 'netmap';
    } catch (e) {}
    return 'heatmap';
  }

  var focusStyleInjected = false;

  function publicTab(tab) {
    if (tab === 'graph') return graphFallback();
    if (!tab || !PUBLIC_TABS[tab]) return 'heatmap';
    return tab;
  }

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
      var q = sp.get('tab');
      if (q === 'graph') return graphFallback();
      if (q && PUBLIC_TABS[q]) return q;
      if (sp.get('ticker')) return 'table';
    } catch (e) {}
    try {
      var s = localStorage.getItem('im_map_tab');
      if (s === 'graph') {
        var fb = graphFallback();
        try {
          localStorage.setItem('im_map_tab', fb);
        } catch (eClear) {}
        return fb;
      }
      if (s && PUBLIC_TABS[s]) return s;
    } catch (e2) {}
    if (isTableTabActive()) return 'table';
    var momentumEl = document.getElementById('tab-momentum');
    if (momentumEl && momentumEl.classList.contains('active')) return 'momentum';
    var volatilityEl = document.getElementById('tab-volatility');
    if (volatilityEl && volatilityEl.classList.contains('active')) return 'volatility';
    var perfEl = document.getElementById('tab-perfcalendar');
    if (perfEl && perfEl.classList.contains('active')) return 'perfcalendar';
    var valEl = document.getElementById('tab-valuation');
    if (valEl && valEl.classList.contains('active')) return 'valuation';
    var netEl = document.getElementById('tab-netmap');
    if (netEl && netEl.classList.contains('active')) return 'netmap';
    var heatEl = document.getElementById('tab-heatmap');
    if (heatEl && heatEl.classList.contains('active')) return 'heatmap';
    return 'table';
  }

  function onTabChange(tab) {
    tab = publicTab(tab);
    if (!PUBLIC_TABS[tab]) return;
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

  function isIndustryMapPage() {
    try {
      var path = (window.location.pathname || '').replace(/\\/g, '/');
      return /\/(bigchip|semiconductor|elec|software|telecom|robot|auto|battery|renewable|nuclear|powergrid|chemical|metal|machinery|construction|ship|shipping|defense|shipping|travel|kconsume|kcontent|cosmetics|medtech|bio|finance|holdings|energy|ess|kculture)\//i.test(
        path
      );
    } catch (e) {
      return false;
    }
  }

  function appendToNavUrl(href) {
    try {
      var u = new URL(href, window.location.href);
      if (!isIndustryMapPage()) {
        u.searchParams.set('tab', 'heatmap');
        return u.pathname + u.search + u.hash;
      }
      var tab = publicTab(getTab());
      if (!tab || tab === 'table') u.searchParams.delete('tab');
      else u.searchParams.set('tab', tab);
      return u.pathname + u.search + u.hash;
    } catch (e) {
      if (!isIndustryMapPage()) {
        var sep = href.indexOf('?') >= 0 ? '&' : '?';
        return href + sep + 'tab=heatmap';
      }
      var tab2 = publicTab(getTab());
      if (!tab2 || tab2 === 'table') return href;
      var sep2 = href.indexOf('?') >= 0 ? '&' : '?';
      return href + sep2 + 'tab=' + encodeURIComponent(tab2);
    }
  }

  function clearRowFocus() {
    document.querySelectorAll('#table-body tr.im-row-focus').forEach(function (r) {
      r.classList.remove('im-row-focus');
    });
    document.querySelectorAll('#table-cards [data-ticker].im-row-focus').forEach(function (r) {
      r.classList.remove('im-row-focus');
    });
  }

  function scrollToTicker(ticker) {
    injectFocusStyle();
    clearRowFocus();
    var code = String(ticker || '').trim();
    if (!code) return false;
    var row = document.querySelector('#table-body tr[data-ticker="' + code + '"]');
    var card = document.querySelector('#table-cards [data-ticker="' + code + '"]');
    var el = row || card;
    if (!el) return false;
    el.classList.add('im-row-focus');
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      el.scrollIntoView(true);
    }
    return true;
  }

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
    var tab = publicTab(getTab() || 'table');
    var btnIds = {
      table: 'tab-btn-table',
      heatmap: 'tab-btn-heatmap',
      momentum: 'tab-btn-momentum',
      volatility: 'tab-btn-volatility',
      perfcalendar: 'tab-btn-perfcalendar',
      valuation: 'tab-btn-valuation',
      netmap: 'tab-btn-netmap',
    };
    var btn = document.getElementById(btnIds[tab] || 'tab-btn-table');
    if (btn) switchTab(tab, btn);
    if (tab === 'table') applyInitialTickerFocus();
  }

  function buildMapTableTickerUrl(mapPath, ticker, lang) {
    try {
      var u = new URL(
        mapPath || 'index.html',
        global.location && global.location.href ? global.location.href : undefined,
      );
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

  /** No-op when graph chrome is absent (pages no longer ship #tab-btn-graph / #tab-graph). */
  function hidePublicGraphTab() {
    var btn = document.getElementById('tab-btn-graph');
    if (btn) {
      btn.hidden = true;
      btn.setAttribute('aria-hidden', 'true');
      btn.tabIndex = -1;
      btn.style.display = 'none';
    }
    var panel = document.getElementById('tab-graph');
    if (panel) {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hidePublicGraphTab);
    } else {
      hidePublicGraphTab();
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
    publicTab: publicTab,
    graphFallback: graphFallback,
    /** @deprecated use graphFallback() — kept for older callers */
    GRAPH_FALLBACK: 'netmap',
    _test: {
      graphFallback: graphFallback,
      publicTab: publicTab,
      PUBLIC_TABS: PUBLIC_TABS,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
