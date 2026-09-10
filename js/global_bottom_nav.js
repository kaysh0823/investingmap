/**
 * Global mobile bottom nav: Home + industry maps (all pages).
 * Sector list: battery/renewable/nuclear (ex-energy), kconsume/kcontent/cosmetics (ex-kculture), auto, medtech.
 * Bump ?v= when ITEMS change (see scripts/patch_global_bottom_nav.mjs GLOBAL_BOTTOM_NAV_V).
 */
(function (global) {
  'use strict';

  var ITEMS = [
    { id: 'home', path: 'index.html', icon: '\u2302', ko: '\uD648', en: 'Home' },
    { id: 'bigchip', path: 'bigchip/korea_bigchip_map.html', icon: "🏆", ko: "삼성전자/하이닉스", en: "Samsung/SK hynix", koShort: "삼성/하이닉스", enShort: "Samsung/SK hynix" },
    { id: 'semi', path: 'semiconductor/korea_semiconductor_map.html', icon: "💠", ko: "반도체", en: "Semi", koShort: "반도체", enShort: "Semi" },
    { id: 'elec', path: 'elec/korea_elec_map.html', icon: "💡", ko: "전기·전자", en: "Electrical & Electronics", koShort: "전기·전자", enShort: "Electronics" },
    { id: 'software', path: 'software/korea_software_map.html', icon: "💻", ko: "IT·소프트웨어", en: "IT & Software", koShort: "IT·SW", enShort: "Software" },
    { id: 'telecom', path: 'telecom/korea_telecom_map.html', icon: "📡", ko: "통신", en: "Telecom", koShort: "통신", enShort: "Telecom" },
    { id: 'robot', path: 'robot/korea_robot_map.html', icon: "🤖", ko: "로봇", en: "Robot", koShort: "로봇", enShort: "Robot" },
    { id: 'auto', path: 'auto/korea_auto_map.html', icon: "🚗", ko: "자동차", en: "Auto", koShort: "자동차", enShort: "Auto" },
    { id: 'battery', path: 'battery/korea_battery_map.html', icon: "🔋", ko: "2차전지", en: "Battery", koShort: "2차전지", enShort: "Battery" },
    { id: 'renewable', path: 'renewable/korea_renewable_map.html', icon: "🌱", ko: "신재생", en: "Renewable", koShort: "신재생", enShort: "Renewable" },
    { id: 'nuclear', path: 'nuclear/korea_nuclear_map.html', icon: "⚛", ko: "원전", en: "Nuclear", koShort: "원전", enShort: "Nuclear" },
    { id: 'powergrid', path: 'powergrid/korea_powergrid_map.html', icon: "🔌", ko: "전력설비", en: "Power Equip.", koShort: "전력설비", enShort: "Power" },
    { id: 'chemical', path: 'chemical/korea_chemical_map.html', icon: "⚗️", ko: "화학·정유", en: "Chemicals & Refining", koShort: "화학·정유", enShort: "Chemicals" },
    { id: 'metal', path: 'metal/korea_metal_map.html', icon: "⚙️", ko: "철강·비철금속", en: "Steel & Nonferrous", koShort: "철강·비철금속", enShort: "Steel & Nonferrous" },
    { id: 'machinery', path: 'machinery/korea_machinery_map.html', icon: "🚧", ko: "산업·건설기계", en: "Machinery", koShort: "산업·건설기계", enShort: "Machinery" },
    { id: 'construction', path: 'construction/korea_construction_map.html', icon: "🏗️", ko: "건설", en: "Construction", koShort: "건설", enShort: "Construction" },
    { id: 'ship', path: 'ship/korea_ship_map.html', icon: "⚓", ko: "조선·기자재", en: "Shipbuilding & Equipment", koShort: "조선·기자재", enShort: "Shipbuilding & Equipment" },
    { id: 'defense', path: 'defense/korea_defense_map.html', icon: "🛰️", ko: "방산/우주", en: "Defense & Space", koShort: "방산/우주", enShort: "Defense & Space" },
    { id: 'shipping', path: 'shipping/korea_shipping_map.html', icon: "🚢", ko: "해운·물류", en: "Shipping & Logistics", koShort: "해운·물류", enShort: "Shipping" },
    { id: 'travel', path: 'travel/korea_travel_map.html', icon: "✈️", ko: "여행·레저·항공", en: "Travel & Airlines", koShort: "여행·항공", enShort: "Travel" },
    { id: 'kconsume', path: 'kconsume/korea_kconsume_map.html', icon: "🛒", ko: "소비/유통", en: "Consumer/Retail", koShort: "소비/유통", enShort: "Consumer/Retail" },
    { id: 'kcontent', path: 'kcontent/korea_kcontent_map.html', icon: "🎬", ko: "콘텐츠", en: "K-Content", koShort: "콘텐츠", enShort: "K-Content" },
    { id: 'cosmetics', path: 'cosmetics/korea_cosmetics_map.html', icon: "💄", ko: "화장품/미용기기", en: "Cosmetics", koShort: "화장품", enShort: "Cosmetics" },
    { id: 'medtech', path: 'medtech/korea_medtech_map.html', icon: "🩺", ko: "의료기기/헬스케어", en: "MedTech", koShort: "헬스케어", enShort: "MedTech" },
    { id: 'bio', path: 'bio/korea_bio_map.html', icon: "🧬", ko: "바이오", en: "Bio", koShort: "바이오", enShort: "Bio" },
    { id: 'finance', path: 'finance/korea_finance_map.html', icon: "🏦", ko: "금융", en: "Finance", koShort: "금융", enShort: "Finance" },
    { id: 'holdings', path: 'holdings/korea_holdings_map.html', icon: "🏢", ko: "지주회사", en: "Holdings", koShort: "지주회사", enShort: "Holdings" },
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
    if (/\/(bigchip|semiconductor|bio|ship|shipping|defense|robot|auto|medtech|energy|battery|ess|renewable|nuclear|powergrid|kculture|kconsume|cosmetics|kcontent|finance|construction|software|holdings|telecom|chemical|travel|elec|metal|machinery)\//i.test(path)) return '../';
    return '';
  }

  function detectActiveId() {
    var path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
    if (path.indexOf('/bigchip/') !== -1) return 'bigchip';
    if (path.indexOf('/semiconductor/') !== -1) return 'semi';
    if (path.indexOf('/bio/') !== -1) return 'bio';
    if (path.indexOf('/shipping/') !== -1) return 'shipping';
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
    if (path.indexOf('/chemical/') !== -1) return 'chemical';
    if (path.indexOf('/travel/') !== -1) return 'travel';
    if (path.indexOf('/elec/') !== -1) return 'elec';
    if (path.indexOf('/machinery/') !== -1) return 'machinery';
    if (path.indexOf('/metal/') !== -1) return 'metal';
    if (path === '/' || /\/index\.html$/.test(path)) return 'home';
    return '';
  }

  function navLabel(item, lang) {
    if (lang === 'en') return item.enShort || item.en;
    return item.koShort || item.ko;
  }

  function currentMapTab() {
    try {
      if (global.InvestingMapTabState && typeof global.InvestingMapTabState.getTab === 'function') {
        var t = global.InvestingMapTabState.getTab();
        if (t === 'heatmap' || t === 'momentum' || t === 'graph' || t === 'table') return t;
      }
    } catch (e) {}
    try {
      var s = localStorage.getItem('im_map_tab');
      if (s === 'heatmap' || s === 'momentum' || s === 'graph' || s === 'table') return s;
    } catch (e2) {}
    return 'table';
  }

  /** Preserve current map tab across sector hops; never forward ticker. */
  function applyMapTabToHref(href) {
    var tab = currentMapTab();
    try {
      var u = new URL(href, window.location.href);
      u.searchParams.delete('ticker');
      if (tab === 'table') u.searchParams.delete('tab');
      else u.searchParams.set('tab', tab);
      return u.pathname + u.search + u.hash;
    } catch (e) {
      var cleaned = String(href || '').replace(/([?&])ticker=[^&]*/g, '$1').replace(/[?&]$/, '');
      if (tab === 'table') {
        return cleaned.replace(/([?&])tab=(heatmap|momentum|graph|table)\b/g, '$1').replace(/[?&]$/, '');
      }
      try {
        var u2 = new URL(cleaned, window.location.href);
        u2.searchParams.set('tab', tab);
        return u2.pathname + u2.search + u2.hash;
      } catch (e2) {
        var sep = cleaned.indexOf('?') >= 0 ? '&' : '?';
        return cleaned + sep + 'tab=' + encodeURIComponent(tab);
      }
    }
  }

  function bindTabPreserve(nav) {
    if (!nav || nav.getAttribute('data-im-tab-preserve') === '1') return;
    nav.setAttribute('data-im-tab-preserve', '1');
    function onNav(ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a.im-bottom-tab') : null;
      if (!a || !nav.contains(a)) return;
      var href = a.getAttribute('href') || '';
      if (!href || /(?:^|\/)index\.html(?:\?|$)/.test(href)) return;
      var next = applyMapTabToHref(href);
      if (next && next !== href) a.setAttribute('href', next);
    }
    nav.addEventListener('pointerdown', onNav, true);
    nav.addEventListener('click', onNav, true);
  }

  function injectStyles() {
    if (document.getElementById('im-global-bottom-nav-css')) return;
    var css =
      '.im-global-bottom-nav{display:none}' +
      '@media (max-width:768px){' +
      'body.im-has-bottom-nav{padding-bottom:calc(62px + env(safe-area-inset-bottom,0px))!important}' +
      '.im-global-bottom-nav{display:flex;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:2px;position:fixed;left:0;right:0;bottom:0;z-index:120;background:color-mix(in srgb,var(--surface) 94%,transparent);border-top:1px solid var(--border);backdrop-filter:blur(12px);padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 20px rgba(0,0,0,.15)}' +
      '.im-global-bottom-nav::-webkit-scrollbar{display:none}' +
      '.im-bottom-tab{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 10px;text-decoration:none;color:var(--text-muted);font-size:10px;font-weight:600;border-radius:8px;min-height:44px;min-width:56px;text-align:center;line-height:1.15;word-break:keep-all}' +
      '.im-bottom-tab-icon{font-size:16px;line-height:1}' +
      '.im-bottom-tab-icon--home{font-size:19px;line-height:1}' +
      '.im-bottom-tab-label{display:block;max-width:4.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
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
      if (item.id !== 'home') href = applyMapTabToHref(href);
      var label = navLabel(item, l);
      var cls = 'im-bottom-tab' + (item.id === active ? ' is-active' : '');
      var iconCls = 'im-bottom-tab-icon' + (item.id === 'home' ? ' im-bottom-tab-icon--home' : '');
      return '<a class="' + cls + '" href="' + href + '">' +
        '<span class="' + iconCls + '" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="im-bottom-tab-label">' + label + '</span></a>';
    }).join('');
    bindTabPreserve(nav);
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
