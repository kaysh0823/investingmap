/**
 * Mobile layout fixes: hub-style topbar, tab labels, header toolbar, subtitle tooltip.
 */
(function (global) {
  'use strict';

  var MQ = '(max-width: 768px)';
  var mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MQ) : null;
  var subtitleEnhanced = false;
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

  var TIP_LABEL = {
    ko: '페이지 설명',
    en: 'Page description',
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

  function closeSubtitleTip() {
    var tip = document.getElementById('hdr-subtitle-tip');
    var btn = document.getElementById('hdr-info-btn');
    if (tip) tip.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openSubtitleTip() {
    var sub = document.getElementById('hdr-subtitle');
    var tip = document.getElementById('hdr-subtitle-tip');
    var btn = document.getElementById('hdr-info-btn');
    if (!sub || !tip || !btn) return;
    tip.textContent = sub.textContent || '';
    tip.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  function toggleSubtitleTip(e) {
    if (e) e.stopPropagation();
    var tip = document.getElementById('hdr-subtitle-tip');
    if (!tip) return;
    if (tip.hidden) openSubtitleTip();
    else closeSubtitleTip();
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

      header.insertBefore(topbar, header.firstChild);
      topbar.appendChild(brand);
      topbar.appendChild(actions);
    }

    var brandLink = document.getElementById('im-map-brand-link');
    if (brandLink) brandLink.href = hubIndexHref();
    document.body.classList.toggle('im-map-topbar-active', isMobile());
  }

  function enhanceSubtitleTooltip() {
    var h1 = document.getElementById('hdr-title');
    var sub = document.getElementById('hdr-subtitle');
    if (!h1 || !sub) return;

    if (!subtitleEnhanced) {
      subtitleEnhanced = true;
      var wrap = document.createElement('div');
      wrap.id = 'hdr-title-wrap';
      wrap.className = 'hdr-title-wrap';
      h1.parentNode.insertBefore(wrap, h1);
      wrap.appendChild(h1);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hdr-info-btn';
      btn.className = 'hdr-info-btn';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'hdr-subtitle-tip');
      var lang = pageLang();
      btn.setAttribute('aria-label', (TIP_LABEL[lang] || TIP_LABEL.ko) + ' (!)');
      btn.innerHTML = '<span class="hdr-info-glyph" aria-hidden="true">!</span>';
      btn.addEventListener('click', toggleSubtitleTip);
      wrap.appendChild(btn);

      var tip = document.createElement('div');
      tip.id = 'hdr-subtitle-tip';
      tip.className = 'hdr-subtitle-tip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      tip.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      wrap.appendChild(tip);

      document.addEventListener('click', closeSubtitleTip);
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') closeSubtitleTip();
      });
    }

    var langBtn = document.getElementById('hdr-info-btn');
    if (langBtn) {
      var lang = pageLang();
      langBtn.setAttribute('aria-label', (TIP_LABEL[lang] || TIP_LABEL.ko) + ' (!)');
    }

    document.body.classList.toggle('im-mobile-hdr-compact', isMobile());
    if (!isMobile()) closeSubtitleTip();
  }

  function injectStyles() {
    var styleId = 'im-mobile-ux-css-v6';
    ['im-mobile-ux-css-v5', 'im-mobile-ux-css-v4', 'im-mobile-ux-css'].forEach(function (id) {
      var old = document.getElementById(id);
      if (old) old.remove();
    });

    var css =
      '.hub-topbar.im-map-topbar .hub-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);min-width:0}' +
      '.hub-topbar.im-map-topbar .hub-brand-mark{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#1f6feb,#58a6ff);flex-shrink:0;box-shadow:0 2px 8px rgba(88,166,255,.25)}' +
      '.hub-topbar.im-map-topbar .hub-brand-name{font-size:15px;font-weight:700;letter-spacing:-.2px;white-space:nowrap}' +
      '.hdr-title-wrap{display:flex;align-items:flex-start;gap:6px;position:relative;min-width:0}' +
      '.hdr-title-wrap h1{flex:1;min-width:0;margin:0}' +
      '.hdr-info-btn{display:none;flex-shrink:0;align-items:center;justify-content:center;width:22px;height:22px;margin-top:2px;padding:0;border:1px solid var(--border);border-radius:50%;background:var(--surface2);color:var(--text-muted);font-size:12px;font-weight:700;line-height:1;cursor:pointer;transition:border-color .15s,color .15s}' +
      '.hdr-info-btn:hover,.hdr-info-btn[aria-expanded="true"]{border-color:var(--accent);color:var(--accent)}' +
      '.hdr-info-glyph{display:block;line-height:1}' +
      '.hdr-subtitle-tip{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:60;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-muted);font-size:12px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.22)}' +
      '.hdr-subtitle-tip:not([hidden]){display:block}' +
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
      'body.im-mobile-hdr-compact .hdr-info-btn{display:inline-flex;width:20px;height:20px;margin-top:1px;font-size:11px}' +
      'body.im-mobile-hdr-compact #hdr-subtitle{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
      'body.im-map-topbar-active .header h1,body.im-map-topbar-active .hdr-title-wrap,body.im-map-topbar-active .header-meta{padding-left:12px!important;padding-right:12px!important}' +
      'body.im-map-topbar-active .header h1{font-size:15px!important;line-height:1.2!important;padding-top:4px!important;padding-bottom:0!important;margin:0!important}' +
      'body.im-map-topbar-active .header-meta{display:flex!important;flex-wrap:wrap!important;margin-top:0!important;gap:4px!important;padding-top:2px!important;padding-bottom:0!important}' +
      'body.im-map-topbar-active .header .badge{font-size:10px!important;padding:1px 8px!important;line-height:1.3!important}' +
      '.tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;flex-wrap:unset!important;overflow:visible!important;padding:0!important;border-bottom:1px solid var(--border)}' +
      '.tab-btn{flex:unset!important;min-width:0!important;padding:8px 4px!important;font-size:11px!important;line-height:1.25!important;white-space:normal!important;word-break:keep-all!important;text-align:center!important;min-height:40px;display:flex;align-items:center;justify-content:center;border-bottom:2px solid transparent;margin:0!important}' +
      '.tab-btn.active{border-bottom-color:var(--accent)}' +
      '#map-editorial.map-editorial-collapsible,.geo-summary.map-editorial-collapsible{padding:0 12px 2px!important;margin:0!important}' +
      '.map-editorial-summary{font-size:11px!important;padding:2px 0!important;gap:4px!important;min-height:0!important}' +
      '.map-editorial-summary::before{font-size:8px!important}' +
      '.map-editorial-body{font-size:12px!important;line-height:1.4!important;padding-top:2px!important}' +
      '.map-editorial-body p{margin:0 0 6px!important}' +
      '.heatmap-meta{word-break:keep-all;line-height:1.45}' +
      '.graph-hint{white-space:normal;word-break:keep-all;line-height:1.4}' +
      '.filter-label{white-space:nowrap}' +
      '.result-count{white-space:nowrap}' +
      '.im-seo-related{display:none!important}' +
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
    setupMapTopbar();
    enhanceSubtitleTooltip();
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
    closeSubtitleTip: closeSubtitleTip,
  };
})(typeof window !== 'undefined' ? window : globalThis);
