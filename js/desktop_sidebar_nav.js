/**
 * Desktop left sidebar: Hub + industry maps (persistent on map pages).
 * Sector list: battery/renewable/nuclear (ex-energy), kconsume/kcontent/cosmetics (ex-kculture), auto, medtech.
 * Bump ?v= when ITEMS change (see scripts/patch_desktop_sidebar.mjs DESKTOP_SIDEBAR_NAV_V).
 */
(function (global) {
  'use strict';

  var SIDEBAR_W = 200;

  var ITEMS = [
    { id: 'home', path: 'index.html', icon: '\u2302', ko: '\uD5C8\uBE0C', en: 'Hub' },
    { id: 'bigchip', path: 'bigchip/korea_bigchip_map.html', icon: '\uD83C\uDFC6', ko: '\uC0BC\uC131\uC804\uC790/\uD558\uC774\uB2C9\uC2A4', en: 'Samsung/SK hynix' },
    { id: 'semi', path: 'semiconductor/korea_semiconductor_map.html', icon: '\uD83D\uDCA0', ko: '\uBC18\uB3C4\uCCB4', en: 'Semi' },
    { id: 'elec', path: 'elec/korea_elec_map.html', icon: '\uD83D\uDCA1', ko: '\uC804\uAE30\u00B7\uC804\uC790', en: 'Electronics' },
    { id: 'battery', path: 'battery/korea_battery_map.html', icon: '\uD83D\uDD0B', ko: '2\uCC28\uC804\uC9C0', en: 'Battery' },
    { id: 'renewable', path: 'renewable/korea_renewable_map.html', icon: '\uD83C\uDF31', ko: '\uC2E0\uC7AC\uC0DD', en: 'Renewable' },
    { id: 'nuclear', path: 'nuclear/korea_nuclear_map.html', icon: '\u269B', ko: '\uC6D0\uC804', en: 'Nuclear' },
    { id: 'powergrid', path: 'powergrid/korea_powergrid_map.html', icon: '\uD83D\uDD0C', ko: '\uC804\uB825\uC124\uBE44', en: 'Power Equip.' },
    { id: 'ship', path: 'ship/korea_ship_map.html', icon: '\u2693', ko: '\uC870\uC120', en: 'Ship' },
    { id: 'metal', path: 'metal/korea_metal_map.html', icon: '\u2699\uFE0F', ko: '\uCCA0\uAC15\u00B7\uAE08\uC18D\u00B7\uAE30\uACC4', en: 'Metals' },
    { id: 'defense', path: 'defense/korea_defense_map.html', icon: '\uD83D\uDEF0\uFE0F', ko: '\uBC29\uC0B0/\uC6B0\uC8FC/\uD56D\uACF5', en: 'Defense, Space & Aviation' },
    { id: 'kconsume', path: 'kconsume/korea_kconsume_map.html', icon: '\uD83D\uDED2', ko: 'K-\uC18C\uBE44/\uC720\uD1B5', en: 'K-Consume' },
    { id: 'cosmetics', path: 'cosmetics/korea_cosmetics_map.html', icon: '\uD83D\uDC84', ko: '\uD654\uC7A5\uD488/\uBBF8\uC6A9\uAE30\uAE30', en: 'Cosmetics' },
    { id: 'kcontent', path: 'kcontent/korea_kcontent_map.html', icon: '\uD83C\uDFAC', ko: 'K-\uCF58\uD150\uCE20', en: 'K-Content' },
    { id: 'bio', path: 'bio/korea_bio_map.html', icon: '\uD83E\uDDEC', ko: '\uBC14\uC774\uC624', en: 'Bio' },
    { id: 'robot', path: 'robot/korea_robot_map.html', icon: '\uD83E\uDD16', ko: '\uB85C\uBD07', en: 'Robot' },
    { id: 'auto', path: 'auto/korea_auto_map.html', icon: '\uD83D\uDE97', ko: '\uC790\uB3D9\uCC28', en: 'Auto' },
    { id: 'medtech', path: 'medtech/korea_medtech_map.html', icon: '\uD83E\uDE7A', ko: '\uC758\uB8CC\uAE30\uAE30/\uD5EC\uC2A4\uCF00\uC5B4', en: 'MedTech' },
    { id: 'finance', path: 'finance/korea_finance_map.html', icon: '\uD83C\uDFE6', ko: '\uAE08\uC735', en: 'Finance' },
    { id: 'construction', path: 'construction/korea_construction_map.html', icon: '\uD83C\uDFD7\uFE0F', ko: '\uAC74\uC124', en: 'Construction' },
    { id: 'software', path: 'software/korea_software_map.html', icon: '\uD83D\uDCBB', ko: 'IT\u00B7\uC18C\uD504\uD2B8\uC6E8\uC5B4', en: 'IT & Software' },
    { id: 'holdings', path: 'holdings/korea_holdings_map.html', icon: '\uD83C\uDFE2', ko: '\uC9C0\uC8FC\uD68C\uC0AC', en: 'Holdings' },
    { id: 'telecom', path: 'telecom/korea_telecom_map.html', icon: '\uD83D\uDCE1', ko: '\uD1B5\uC2E0', en: 'Telecom' },
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
    if (/\/(bigchip|semiconductor|bio|ship|defense|robot|auto|medtech|energy|battery|ess|renewable|nuclear|powergrid|kculture|kconsume|cosmetics|kcontent|finance|construction|software|holdings|telecom|elec|metal)\//i.test(path)) return '../';
    return '';
  }

  function detectActiveId() {
    var path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
    if (path.indexOf('/bigchip/') !== -1) return 'bigchip';
    if (path.indexOf('/semiconductor/') !== -1) return 'semi';
    if (path.indexOf('/bio/') !== -1) return 'bio';
    if (path.indexOf('/ship/') !== -1) return 'ship';
    if (path.indexOf('/defense/') !== -1) return 'defense';
    if (path.indexOf('/robot/') !== -1) return 'robot';
    if (path.indexOf('/auto/') !== -1) return 'auto';
    if (path.indexOf('/medtech/') !== -1) return 'medtech';
    if (path.indexOf('/battery/') !== -1) return 'battery';
    if (path.indexOf('/ess/') !== -1) return 'battery';
    if (path.indexOf('/renewable/') !== -1) return 'renewable';
    if (path.indexOf('/nuclear/') !== -1) return 'nuclear';
    if (path.indexOf('/energy/') !== -1) return 'battery';
    if (path.indexOf('/powergrid/') !== -1) return 'powergrid';
    if (path.indexOf('/kconsume/') !== -1) return 'kconsume';
    if (path.indexOf('/cosmetics/') !== -1) return 'cosmetics';
    if (path.indexOf('/kcontent/') !== -1) return 'kcontent';
    if (path.indexOf('/kculture/') !== -1) return 'kconsume';
    if (path.indexOf('/finance/') !== -1) return 'finance';
    if (path.indexOf('/construction/') !== -1) return 'construction';
    if (path.indexOf('/software/') !== -1) return 'software';
    if (path.indexOf('/holdings/') !== -1) return 'holdings';
    if (path.indexOf('/telecom/') !== -1) return 'telecom';
    if (path.indexOf('/elec/') !== -1) return 'elec';
    if (path.indexOf('/metal/') !== -1) return 'metal';
    if (path === '/' || /\/index\.html$/.test(path)) return 'home';
    return '';
  }

  function navLabel(item, lang) {
    if (lang === 'en') return item.enShort || item.en;
    return item.koShort || item.ko;
  }

  function itemHref(item, prefix, qs) {
    var href = prefix + item.path + qs;
    if (item.id === 'home') return href;
    try {
      var u = new URL(href, window.location.href);
      u.searchParams.set('tab', 'heatmap');
      return u.pathname + u.search + u.hash;
    } catch (e) {
      var sep = href.indexOf('?') >= 0 ? '&' : '?';
      return href + sep + 'tab=heatmap';
    }
  }

  function injectStyles() {
    if (document.getElementById('im-desktop-sidebar-css')) return;
    var css =
      ':root{--im-sidebar-w:' + SIDEBAR_W + 'px}' +
      '.im-desktop-sidebar{display:none}' +
      '@media (min-width:769px){' +
      '.im-desktop-sidebar{display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;width:var(--im-sidebar-w);z-index:130;background:linear-gradient(180deg,var(--header-g0),var(--header-g1));border-right:1px solid var(--border);padding:14px 10px 16px;overflow-y:auto}' +
      'body.im-has-desktop-sidebar{padding-left:var(--im-sidebar-w)}' +
      '.im-side-brand{display:flex;align-items:center;gap:9px;padding:6px 8px 14px;margin-bottom:6px;text-decoration:none;color:var(--text);border-bottom:1px solid var(--border)}' +
      '.im-side-brand-mark{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#1f6feb,#58a6ff);flex-shrink:0;box-shadow:0 2px 8px rgba(88,166,255,.22)}' +
      '.im-side-brand-name{font-size:13px;font-weight:700;letter-spacing:-.2px;line-height:1.25}' +
      '.im-side-nav{display:flex;flex-direction:column;gap:3px;flex:1}' +
      '.im-side-link{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:10px;text-decoration:none;color:var(--text-muted);font-size:13px;font-weight:600;line-height:1.2;transition:background .15s,color .15s}' +
      '.im-side-link:hover{background:var(--surface2);color:var(--text)}' +
      '.im-side-link.is-active{background:color-mix(in srgb,var(--accent) 14%,var(--surface2));color:var(--accent)}' +
      '.im-side-icon{font-size:17px;line-height:1;width:22px;text-align:center;flex-shrink:0}' +
      '.im-side-icon--home{font-size:20px}' +
      '.im-side-label{min-width:0;word-break:keep-all}' +
      '.sector-nav{display:none!important}' +
      '.header .header-actions{justify-content:flex-end}' +
      '}' +
      '@media (max-width:768px){body.im-has-desktop-sidebar{padding-left:0}}';
    var el = document.createElement('style');
    el.id = 'im-desktop-sidebar-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function render(lang) {
    injectStyles();
    document.body.classList.add('im-has-desktop-sidebar');
    var l = pageLang(lang);
    var prefix = pathPrefix();
    var active = detectActiveId();
    var qs = '?lang=' + encodeURIComponent(l);
    var brandName = l === 'en' ? 'Investing Map' : 'Investing Map';
    var navLabelText = l === 'en' ? 'Industry maps' : '\uC0B0\uC5C5 \uC9C0\uB3C4';

    var aside = document.getElementById('im-desktop-sidebar');
    if (!aside) {
      aside = document.createElement('aside');
      aside.id = 'im-desktop-sidebar';
      aside.className = 'im-desktop-sidebar';
      document.body.insertBefore(aside, document.body.firstChild);
    }
    aside.setAttribute('aria-label', navLabelText);

    var links = ITEMS.map(function (item) {
      var label = navLabel(item, l);
      var cls = 'im-side-link' + (item.id === active ? ' is-active' : '');
      var iconCls = 'im-side-icon' + (item.id === 'home' ? ' im-side-icon--home' : '');
      var href = itemHref(item, prefix, qs);
      if (item.id === active) {
        return '<span class="' + cls + '" aria-current="page">' +
          '<span class="' + iconCls + '" aria-hidden="true">' + item.icon + '</span>' +
          '<span class="im-side-label">' + label + '</span></span>';
      }
      return '<a class="' + cls + '" href="' + href + '">' +
        '<span class="' + iconCls + '" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="im-side-label">' + label + '</span></a>';
    }).join('');

    aside.innerHTML =
      '<a class="im-side-brand" href="' + prefix + 'index.html' + qs + '">' +
      '<span class="im-side-brand-mark" aria-hidden="true"></span>' +
      '<span class="im-side-brand-name">' + brandName + '</span></a>' +
      '<nav class="im-side-nav">' + links + '</nav>';
  }

  function init() {
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.InvestingMapDesktopSidebar = {
    ITEMS: ITEMS,
    render: render,
    detectActiveId: detectActiveId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
