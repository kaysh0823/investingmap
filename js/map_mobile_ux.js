/**
 * Mobile layout fixes: hub-style topbar, tab labels, h1 sector-description toggle.
 * Collapsed editorial stays in the DOM (CSS display:none) for SEO.
 */
(function (global) {
  'use strict';

  var MQ = '(max-width: 768px)';
  var mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MQ) : null;
  var titleToggleReady = false;
  var topbarReady = false;

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

  var BRAND_NAME = 'Investing Map';

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

  function hubIndexHref() {
    var lang = pageLang();
    return '../index.html?lang=' + encodeURIComponent(lang);
  }

  function reorderHeaderActions(actions) {
    if (!actions || actions.dataset.imReorder === '1') return;
    var nav = actions.querySelector('#sector-nav');
    var quotes = actions.querySelector('#quotes-asof');
    var theme = actions.querySelector('#theme-toggle');
    var lang = actions.querySelector('#lang-toggle');
    var nodes = [nav, quotes, theme, lang].filter(Boolean);
    nodes.forEach(function (n) {
      actions.appendChild(n);
    });
    actions.dataset.imReorder = '1';
  }

  function setupMapTopbar() {
    var header = document.querySelector('.header');
    var actions = header && header.querySelector('.header-actions');
    if (!header || !actions) return;

    reorderHeaderActions(actions);

    if (!topbarReady) {
      topbarReady = true;
      var topbar = document.createElement('div');
      topbar.id = 'im-map-topbar';
      topbar.className = 'hub-topbar im-map-topbar';

      var brand = document.createElement('a');
      brand.className = 'hub-brand';
      brand.id = 'im-map-brand-link';
      brand.href = hubIndexHref();
      brand.innerHTML =
        '<span class="hub-brand-mark" aria-hidden="true"></span>' +
        '<span class="hub-brand-name" id="im-map-brand-name">' +
        BRAND_NAME +
        '</span>';

      var ref = header.firstChild;
      if (ref && ref.parentNode === header) header.insertBefore(topbar, ref);
      else header.appendChild(topbar);
      topbar.appendChild(brand);
      topbar.appendChild(actions);
    }

    var brandLink = document.getElementById('im-map-brand-link');
    if (brandLink) brandLink.href = hubIndexHref();
    document.body.classList.toggle('im-map-topbar-active', isMobile());
  }

  function setEditorialExpanded(btn, panel, expanded) {
    if (!btn || !panel) return;
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded) panel.classList.remove('is-collapsed');
    else panel.classList.add('is-collapsed');
  }

  function ensureTitleToggleButton() {
    var existing = document.getElementById('map-title-toggle');
    if (existing) return existing;

    var h1 = document.getElementById('hdr-title');
    if (!h1 || !h1.parentNode) return null;

    // Unwrap legacy hdr-title-wrap / info button if present.
    var wrap = document.getElementById('hdr-title-wrap');
    if (wrap && wrap.contains(h1)) {
      var wrapParent = wrap.parentNode;
      if (wrapParent && wrapParent.contains(h1)) wrapParent.insertBefore(h1, wrap);
      wrap.remove();
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-title-toggle';
    btn.id = 'map-title-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'map-editorial-panel');
    var h1Parent = h1.parentNode;
    if (h1Parent && h1Parent.contains(h1)) h1Parent.insertBefore(btn, h1);
    else if (h1Parent) h1Parent.appendChild(btn);
    btn.appendChild(h1);

    var chevron = document.createElement('span');
    chevron.className = 'map-title-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    btn.appendChild(chevron);
    return btn;
  }

  function ensureEditorialPanel() {
    var panel = document.getElementById('map-editorial-panel');
    if (panel) return panel;

    var details = document.querySelector('#map-editorial details.map-editorial-details');
    var body = document.getElementById('map-editorial-body');
    var section = document.getElementById('map-editorial');
    if (!section || !body) return null;

    panel = document.createElement('div');
    panel.id = 'map-editorial-panel';
    panel.className = 'map-editorial-panel is-collapsed';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', 'map-editorial-title');

    var title = document.getElementById('map-editorial-title');
    if (!title || title.tagName === 'SUMMARY') {
      var sr = document.createElement('span');
      sr.id = 'map-editorial-title';
      sr.className = 'map-editorial-title-sr';
      sr.textContent = (title && title.textContent) || '섹터 설명';
      panel.appendChild(sr);
    } else {
      panel.appendChild(title);
    }

    panel.appendChild(body);
    if (details && details.parentNode && details.parentNode.contains(details)) {
      details.parentNode.insertBefore(panel, details);
      details.remove();
    } else {
      section.appendChild(panel);
    }
    return panel;
  }

  function setupMapTitleToggle() {
    var btn = ensureTitleToggleButton();
    var panel = ensureEditorialPanel();
    if (!btn || !panel) return;

    if (!titleToggleReady) {
      titleToggleReady = true;
      setEditorialExpanded(btn, panel, false);
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        setEditorialExpanded(btn, panel, !open);
      });
    }

    // Keep subtitle compact on mobile (content still in DOM).
    document.body.classList.toggle('im-mobile-hdr-compact', isMobile());
  }

  function injectStyles() {
    var styleId = 'im-mobile-ux-css-v8';
    ['im-mobile-ux-css-v7', 'im-mobile-ux-css-v6', 'im-mobile-ux-css-v5', 'im-mobile-ux-css-v4', 'im-mobile-ux-css'].forEach(function (id) {
      var old = document.getElementById(id);
      if (old) old.remove();
    });

    var css =
      /* Keep related-map links in HTML for crawlers; hide from all viewports (desktop + mobile). */
      '.im-seo-related{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}' +
      '.hub-topbar.im-map-topbar .hub-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);min-width:0}' +
      '.hub-topbar.im-map-topbar .hub-brand-mark{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#1f6feb,#58a6ff);flex-shrink:0;box-shadow:0 2px 8px rgba(88,166,255,.25)}' +
      '.hub-topbar.im-map-topbar .hub-brand-name{font-size:15px;font-weight:700;letter-spacing:-.2px;white-space:nowrap}' +
      '.map-title-toggle{display:flex;align-items:flex-start;gap:6px;width:100%;margin:0;padding:0;border:none;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}' +
      '.map-title-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}' +
      '.map-title-toggle h1{flex:1;min-width:0;margin:0}' +
      '.map-title-chevron{flex-shrink:0;margin-top:.35em;font-size:.7em;line-height:1;color:var(--text-muted);transition:transform .15s ease}' +
      '.map-title-toggle[aria-expanded="true"] .map-title-chevron{transform:rotate(180deg)}' +
      '.map-editorial-panel.is-collapsed{display:none}' +
      '.map-editorial-title-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
      '@media (min-width:769px){' +
      '.header>.im-map-topbar{border:none;padding:0;margin:0;background:transparent}' +
      '.im-map-topbar .hub-brand{display:none!important}' +
      '.header>.im-map-topbar{display:block}' +
      '.header .header-actions{position:absolute;top:20px;right:20px;max-width:78%;justify-content:flex-end}' +
      '}' +
      '@media (max-width:768px){' +
      'body.im-map-topbar-active .header{padding:0 0 4px!important;gap:2px!important}' +
      'body.im-map-topbar-active .im-map-topbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:6px 12px!important;margin:0!important;border-bottom:1px solid var(--border)!important;background:color-mix(in srgb,var(--surface) 55%,transparent)!important;position:sticky;top:0;z-index:90;backdrop-filter:blur(10px)}' +
      'body.im-map-topbar-active .im-map-topbar .hub-brand-mark{width:24px!important;height:24px!important;border-radius:6px!important}' +
      'body.im-map-topbar-active .im-map-topbar .hub-brand-name{font-size:13px!important}' +
      'body.im-map-topbar-active .header .header-actions{position:static!important;top:auto!important;right:auto!important;display:flex!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important;width:auto!important;max-width:min(58vw,240px)!important;row-gap:0!important;order:0!important;margin:0!important}' +
      'body.im-map-topbar-active .header-actions .quotes-asof{flex:1 1 auto!important;min-width:0!important;text-align:right!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:10px!important;line-height:1.2!important;padding:0 2px!important}' +
      'body.im-map-topbar-active .theme-toggle,body.im-map-topbar-active .lang-toggle{flex:0 0 auto!important;padding:4px 8px!important;min-height:28px;font-size:13px}' +
      'body.im-map-topbar-active .lang-toggle #lang-toggle-text{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}' +
      'body.im-map-topbar-active .lang-toggle .flag{margin-right:0!important;font-size:15px;line-height:1}' +
      'body.im-map-topbar-active .lang-toggle{min-width:32px;justify-content:center}' +
      'body.im-mobile-hdr-compact #hdr-subtitle{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
      'body.im-map-topbar-active .header h1,body.im-map-topbar-active .map-title-toggle,body.im-map-topbar-active .header-meta{padding-left:12px!important;padding-right:12px!important}' +
      'body.im-map-topbar-active .header h1{font-size:15px!important;line-height:1.2!important;padding-top:4px!important;padding-bottom:0!important;margin:0!important}' +
      'body.im-map-topbar-active .header-meta{display:flex!important;flex-wrap:wrap!important;margin-top:0!important;gap:4px!important;padding-top:2px!important;padding-bottom:0!important}' +
      'body.im-map-topbar-active .header .badge{font-size:10px!important;padding:1px 8px!important;line-height:1.3!important}' +
      '.tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;flex-wrap:unset!important;overflow:visible!important;padding:0!important;border-bottom:1px solid var(--border)}' +
      '.tab-btn{flex:unset!important;min-width:0!important;padding:8px 4px!important;font-size:11px!important;line-height:1.25!important;white-space:normal!important;word-break:keep-all!important;text-align:center!important;min-height:40px;display:flex;align-items:center;justify-content:center;border-bottom:2px solid transparent;margin:0!important}' +
      '.tab-btn.active{border-bottom-color:var(--accent)}' +
      '#map-editorial.map-editorial-collapsible,.geo-summary.map-editorial-collapsible{padding:0 12px 2px!important;margin:0!important}' +
      '.map-editorial-body{font-size:12px!important;line-height:1.4!important;padding-top:2px!important}' +
      '.map-editorial-body p{margin:0 0 6px!important}' +
      /* Chips / search / table natural scroll (mobile only) */
      '#tab-table.tab-content.active{display:block!important;height:auto!important;min-height:0!important;overflow:visible!important}' +
      '#tab-table .table-container{display:block!important;height:auto!important;min-height:0!important;overflow:visible!important}' +
      '#tab-table .filter-row-chain{flex-wrap:nowrap!important;align-items:center;min-width:0;width:100%}' +
      '#tab-table .filter-row-chain .filter-label{flex-shrink:0}' +
      '#tab-table .filter-row-chain #chain-chips{display:flex!important;flex-wrap:nowrap!important;gap:6px;align-items:center;min-width:0;flex:1;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none}' +
      '#tab-table .filter-row-chain #chain-chips::-webkit-scrollbar{display:none}' +
      '#tab-table .filter-row-chain .filter-chip{flex-shrink:0}' +
      '#tab-table .search-box{padding:5px 10px!important;font-size:12px!important;min-height:0!important;height:auto!important}' +
      '#tab-table .tbl-wrap{flex:none!important;max-height:none!important;overflow-x:auto!important;overflow-y:visible!important}' +
      '.heatmap-meta{word-break:keep-all;line-height:1.45}' +
      '.graph-hint{white-space:normal;word-break:keep-all;line-height:1.4}' +
      '.filter-label{white-space:nowrap}' +
      '.result-count{white-space:nowrap}' +
      '.im-trust-footer{padding:8px 12px 10px!important;margin-top:10px!important;margin-bottom:0!important;font-size:11px!important;line-height:1.35!important}' +
      '.im-trust-nav{gap:2px 10px!important;margin-bottom:4px!important}' +
      '.im-trust-nav a{font-size:11px!important;line-height:1.3!important}' +
      '.im-trust-disclaimer{font-size:11px!important;line-height:1.35!important;margin:0!important;max-width:none!important}' +
      '.im-trust-copy{font-size:10px!important;line-height:1.3!important;margin:4px 0 0!important}' +
      '}';

    var el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function syncTabs() {
    var lang = pageLang();
    var short = TAB_SHORT[lang] || TAB_SHORT.ko;
    if (!isMobile()) return;
    ['tab-btn-heatmap', 'tab-btn-table', 'tab-btn-graph'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var shortLabel = short[id];
      if (!shortLabel) return;
      var current = el.innerHTML;
      if (current !== shortLabel) {
        if (!el.dataset.fullLabel) el.dataset.fullLabel = current;
        el.innerHTML = shortLabel;
      }
    });
  }

  /** Call from map applyLang() after tab labels are set (mobile short labels only). */
  function notifyLangApplied() {
    ['tab-btn-heatmap', 'tab-btn-table', 'tab-btn-graph'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) delete el.dataset.fullLabel;
    });
    syncTabs();
  }

  function syncAll() {
    injectStyles();
    setupMapTopbar();
    setupMapTitleToggle();
    syncTabs();
  }

  if (mql && mql.addEventListener) {
    mql.addEventListener('change', syncAll);
  } else if (mql && mql.addListener) {
    mql.addListener(syncAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAll);
  } else {
    syncAll();
  }

  injectStyles();

  global.InvestingMapMobileUx = {
    isMobile: isMobile,
    syncTabs: syncTabs,
    syncAll: syncAll,
    notifyLangApplied: notifyLangApplied,
  };
})(typeof window !== 'undefined' ? window : globalThis);
