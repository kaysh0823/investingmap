/**
 * Global mobile bottom nav: Home + 7 industry maps (all pages).
 */
(function (global) {
  'use strict';

  var ITEMS = [
    { id: 'home', path: 'index.html', icon: '\u2302', ko: '\uD648', en: 'Home' },
    { id: 'semi', path: 'semiconductor/korea_semiconductor_map.html', icon: '\uD83D\uDCA0', ko: '\uBC18\uB3C4\uCCB4', en: 'Semi' },
    { id: 'bio', path: 'bio/korea_bio_map.html', icon: '\uD83E\uDDEC', ko: '\uBC14\uC774\uC624', en: 'Bio' },
    { id: 'ship', path: 'ship/korea_ship_map.html', icon: '\u2693', ko: '\uC870\uC120', en: 'Ship' },
    { id: 'defense', path: 'defense/korea_defense_map.html', icon: '\uD83D\uDEF0\uFE0F', ko: '\uBC29\uC704', en: 'Defense' },
    { id: 'robot', path: 'robot/korea_robot_map.html', icon: '\uD83E\uDD16', ko: '\uB85C\uBD07', en: 'Robot' },
    { id: 'energy', path: 'energy/korea_energy_map.html', icon: '\u26A1', ko: '\uC5D0\uB108\uC9C0', en: 'Energy' },
    { id: 'kculture', path: 'kculture/korea_kculture_map.html', icon: '\uD83C\uDFAC', ko: 'K\uCEEC\uCC98', en: 'K-Culture' },
  ];

  function pageLang(lang) {
    if (lang === 'en' || lang === 'ko') return lang;
    var l = document.documentElement.getAttribute('lang');
    if (l === 'en' || l === 'ko') return l;
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) {}
    return 'ko';
  }

  function pathPrefix() {
    var path = window.location.pathname.replace(/\\/g, '/');
    if (/\/(semiconductor|bio|ship|defense|robot|energy|kculture)\//i.test(path)) return '../';
    return '';
  }

  function detectActiveId() {
    var path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
    if (path.indexOf('/semiconductor/') !== -1) return 'semi';
    if (path.indexOf('/bio/') !== -1) return 'bio';
    if (path.indexOf('/ship/') !== -1) return 'ship';
    if (path.indexOf('/defense/') !== -1) return 'defense';
    if (path.indexOf('/robot/') !== -1) return 'robot';
    if (path.indexOf('/energy/') !== -1) return 'energy';
    if (path.indexOf('/kculture/') !== -1) return 'kculture';
    if (path === '/' || /\/index\.html$/.test(path)) return 'home';
    return '';
  }

  function injectStyles() {
    if (document.getElementById('im-global-bottom-nav-css')) return;
    var css =
      '.im-global-bottom-nav{display:none}' +
      '@media (max-width:768px){' +
      'body.im-has-bottom-nav{padding-bottom:calc(62px + env(safe-area-inset-bottom,0px))!important}' +
      '.im-global-bottom-nav{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));position:fixed;left:0;right:0;bottom:0;z-index:120;background:color-mix(in srgb,var(--surface) 94%,transparent);border-top:1px solid var(--border);backdrop-filter:blur(12px);padding:6px 2px calc(6px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 20px rgba(0,0,0,.15)}' +
      '.im-bottom-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 2px;text-decoration:none;color:var(--text-muted);font-size:9px;font-weight:600;border-radius:8px;min-height:44px;min-width:0;text-align:center;line-height:1.2;word-break:keep-all}' +
      '.im-bottom-tab-icon{font-size:16px;line-height:1}' +
      '.im-bottom-tab-label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.im-bottom-tab.is-active{color:var(--accent)}' +
      '.im-bottom-tab:active{background:var(--surface2)}' +
      '}';
    var el = document.createElement('style');
    el.id = 'im-global-bottom-nav-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function render(lang) {
    injectStyles();
    document.body.classList.add('im-has-bottom-nav');
    var l = pageLang(lang);
    var prefix = pathPrefix();
    var active = detectActiveId();
    var nav = document.getElementById('im-global-bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'im-global-bottom-nav';
      nav.className = 'im-global-bottom-nav';
      nav.setAttribute('aria-label', l === 'en' ? 'Industry maps' : '\uC0B0\uC5C5 \uC9C0\uB3C4');
      document.body.appendChild(nav);
    }
    var qs = '?lang=' + encodeURIComponent(l);
    nav.innerHTML = ITEMS.map(function (item) {
      var href = prefix + item.path + qs;
      if (item.id !== 'home' && global.InvestingMapTabState && InvestingMapTabState.appendToNavUrl) {
        href = InvestingMapTabState.appendToNavUrl(href);
      }
      var label = l === 'en' ? item.en : item.ko;
      var cls = 'im-bottom-tab' + (item.id === active ? ' is-active' : '');
      return '<a class="' + cls + '" href="' + href + '">' +
        '<span class="im-bottom-tab-icon" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="im-bottom-tab-label">' + label + '</span></a>';
    }).join('');
  }

  function init() {
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.InvestingMapGlobalBottomNav = {
    ITEMS: ITEMS,
    render: render,
    detectActiveId: detectActiveId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
