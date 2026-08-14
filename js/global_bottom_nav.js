/**
 * Global mobile bottom nav: Home + industry maps (all pages).
 * Sector list: battery/renewable/nuclear (ex-energy), kconsume/kcontent/cosmetics (ex-kculture), auto, medtech.
 * Bump ?v= when ITEMS change (see scripts/patch_global_bottom_nav.mjs GLOBAL_BOTTOM_NAV_V).
 */
(function (global) {
  'use strict';

  var ITEMS = [
    { id: 'home', path: 'index.html', icon: '\u2302', ko: '\uD648', en: 'Home' },
    { id: 'bigchip', path: 'bigchip/korea_bigchip_map.html', icon: '\uD83C\uDFC6', ko: '\uC0BC\uC131\uC804\uC790/\uD558\uC774\uB2C9\uC2A4', en: 'Samsung/SK hynix', koShort: '\uC0BC\uC131/\uD558\uC774\uB2C9\uC2A4', enShort: 'Samsung' },
    { id: 'semi', path: 'semiconductor/korea_semiconductor_map.html', icon: '\uD83D\uDCA0', ko: '\uBC18\uB3C4\uCCB4', en: 'Semi' },
    { id: 'elec', path: 'elec/korea_elec_map.html', icon: '\uD83D\uDCA1', ko: '\uC804\uAE30\u00B7\uC804\uC790', en: 'Electronics', koShort: '\uC804\uAE30\uC804\uC790', enShort: 'Elec' },
    { id: 'battery', path: 'battery/korea_battery_map.html', icon: '\uD83D\uDD0B', ko: '2\uCC28\uC804\uC9C0', en: 'Battery', koShort: '\uBC30\uD130\uB9AC', enShort: 'Battery' },
    { id: 'renewable', path: 'renewable/korea_renewable_map.html', icon: '\uD83C\uDF31', ko: '\uC2E0\uC7AC\uC0DD', en: 'Renewable', koShort: '\uC2E0\uC7AC\uC0DD', enShort: 'Renew' },
    { id: 'nuclear', path: 'nuclear/korea_nuclear_map.html', icon: '\u269B', ko: '\uC6D0\uC804', en: 'Nuclear' },
    { id: 'powergrid', path: 'powergrid/korea_powergrid_map.html', icon: '\uD83D\uDD0C', ko: '\uC804\uB825\uC124\uBE44', koShort: '\uC804\uB825', en: 'Power Equip.', enShort: 'Power' },
    { id: 'ship', path: 'ship/korea_ship_map.html', icon: '\u2693', ko: '\uC870\uC120', en: 'Ship' },
    { id: 'metal', path: 'metal/korea_metal_map.html', icon: '\u2699\uFE0F', ko: '\uCCA0\uAC15\u00B7\uAE08\uC18D\u00B7\uAE30\uACC4', en: 'Metals', koShort: '\uCCA0\uAC15\uAE30\uACC4', enShort: 'Metal' },
    { id: 'defense', path: 'defense/korea_defense_map.html', icon: '\uD83D\uDEF0\uFE0F', ko: '\uBC29\uC0B0', en: 'Defense' },
    { id: 'kconsume', path: 'kconsume/korea_kconsume_map.html', icon: '\uD83D\uDED2', ko: 'K-\uC18C\uBE44/\uC720\uD1B5', en: 'K-Consume', koShort: 'K-\uC18C\uBE44', enShort: 'Consume' },
    { id: 'cosmetics', path: 'cosmetics/korea_cosmetics_map.html', icon: '\uD83D\uDC84', ko: '\uD654\uC7A5\uD488/\uBBF8\uC6A9\uAE30\uAE30', en: 'Cosmetics', koShort: '\uD654\uC7A5\uD488', enShort: 'Cosme' },
    { id: 'kcontent', path: 'kcontent/korea_kcontent_map.html', icon: '\uD83C\uDFAC', ko: 'K-\uCF58\uD150\uCE20', en: 'K-Content', koShort: 'K-\uCF58\uD150\uCE20', enShort: 'Content' },
    { id: 'bio', path: 'bio/korea_bio_map.html', icon: '\uD83E\uDDEC', ko: '\uBC14\uC774\uC624', en: 'Bio' },
    { id: 'robot', path: 'robot/korea_robot_map.html', icon: '\uD83E\uDD16', ko: '\uB85C\uBD07', en: 'Robot' },
    { id: 'auto', path: 'auto/korea_auto_map.html', icon: '\uD83D\uDE97', ko: '\uC790\uB3D9\uCC28', en: 'Auto' },
    { id: 'medtech', path: 'medtech/korea_medtech_map.html', icon: '\uD83E\uDE7A', ko: '\uC758\uB8CC\uAE30\uAE30/\uD5EC\uC2A4\uCF00\uC5B4', en: 'MedTech', koShort: '\uC758\uB8CC\uAE30\uAE30', enShort: 'Med' },
    { id: 'finance', path: 'finance/korea_finance_map.html', icon: '\uD83C\uDFE6', ko: '\uAE08\uC735', en: 'Finance' },
    { id: 'construction', path: 'construction/korea_construction_map.html', icon: '\uD83C\uDFD7\uFE0F', ko: '\uAC74\uC124', en: 'Construction' },
    { id: 'software', path: 'software/korea_software_map.html', icon: '\uD83D\uDCBB', ko: 'IT\u00B7\uC18C\uD504\uD2B8\uC6E8\uC5B4', en: 'IT & Software', koShort: 'IT\u00B7SW', enShort: 'Software' },
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
      if (item.id !== 'home') {
        try {
          var u = new URL(href, window.location.href);
          u.searchParams.set('tab', 'heatmap');
          href = u.pathname + u.search + u.hash;
        } catch (e) {
          var sep = href.indexOf('?') >= 0 ? '&' : '?';
          href = href + sep + 'tab=heatmap';
        }
      }
      var label = navLabel(item, l);
      var cls = 'im-bottom-tab' + (item.id === active ? ' is-active' : '');
      var iconCls = 'im-bottom-tab-icon' + (item.id === 'home' ? ' im-bottom-tab-icon--home' : '');
      return '<a class="' + cls + '" href="' + href + '">' +
        '<span class="' + iconCls + '" aria-hidden="true">' + item.icon + '</span>' +
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
