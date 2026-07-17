/**
 * Cross-industry navigation in map page headers (left of Hub link).
 */
(function (global) {
  'use strict';

  var SECTORS = [
    { id: 'semi', path: '../semiconductor/korea_semiconductor_map.html', ko: '\uBC18\uB3C4\uCCB4', en: 'Semi' },
    { id: 'battery', path: '../battery/korea_battery_map.html', ko: '2\uCC28\uC804\uC9C0', en: 'Battery' },
    { id: 'renewable', path: '../renewable/korea_renewable_map.html', ko: '\uC2E0\uC7AC\uC0DD', en: 'Renewable', koShort: '\uC2E0\uC7AC\uC0DD', enShort: 'Renew' },
    { id: 'nuclear', path: '../nuclear/korea_nuclear_map.html', ko: '\uC6D0\uC804', en: 'Nuclear' },
    { id: 'powergrid', path: '../powergrid/korea_powergrid_map.html', ko: '\uC804\uB825\uC124\uBE44', en: 'Power Equip.', koShort: '\uC804\uB825', enShort: 'Power' },
    { id: 'ship', path: '../ship/korea_ship_map.html', ko: '\uC870\uC120', en: 'Ship' },
    { id: 'defense', path: '../defense/korea_defense_map.html', ko: '\uBC29\uC0B0', en: 'Defense' },
        { id: 'kconsume', path: '../kconsume/korea_kconsume_map.html', ko: 'K-\uC18C\uBE44/\uC720\uD1B5', en: 'K-Consume' },
    { id: 'cosmetics', path: '../cosmetics/korea_cosmetics_map.html', ko: '\uD654\uC7A5\uD488/\uBBF8\uC6A9\uAE30\uAE30', en: 'Cosmetics', koShort: '\uD654\uC7A5\uD488', enShort: 'Cosme' },
    { id: 'kcontent', path: '../kcontent/korea_kcontent_map.html', ko: 'K-\uCF58\uD150\uCE20', en: 'K-Content' },
    { id: 'bio', path: '../bio/korea_bio_map.html', ko: '\uBC14\uC774\uC624', en: 'Bio' },
    { id: 'robot', path: '../robot/korea_robot_map.html', ko: '\uB85C\uBD07', en: 'Robot' },
    { id: 'auto', path: '../auto/korea_auto_map.html', ko: '\uC790\uB3D9\uCC28', en: 'Auto' },
    { id: 'medtech', path: '../medtech/korea_medtech_map.html', ko: '\uC758\uB8CC\uAE30\uAE30/\uD5EC\uC2A4\uCF00\uC5B4', en: 'MedTech', koShort: '\uC758\uB8CC\uAE30\uAE30', enShort: 'Med' },
    { id: 'finance', path: '../finance/korea_finance_map.html', ko: '\uAE08\uC735', en: 'Finance' },
    { id: 'construction', path: '../construction/korea_construction_map.html', ko: '\uAC74\uC124', en: 'Construction' },
  ];

  function navLabel(s, lang, mobile) {
    if (lang === 'en') return (mobile && s.enShort) ? s.enShort : s.en;
    return (mobile && s.koShort) ? s.koShort : s.ko;
  }

  function injectSectorNavStyles() {
    if (document.getElementById('im-sector-nav-css')) return;
    var css =
      '.sector-nav{display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:flex-end;max-width:min(560px,72vw);flex:1 1 auto}' +
      '.sector-nav a,.sector-nav .is-current{display:inline-flex;align-items:center;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;color:var(--text-muted);text-decoration:none;font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap;transition:all .2s}' +
      '.sector-nav a:hover{border-color:var(--accent);color:var(--text)}' +
      '.sector-nav .is-current{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface2))}' +
      '.sector-nav .hub-back{display:inline-flex;align-items:center;gap:2px}' +
      '@media (max-width:768px){.sector-nav{display:none!important}}';
    var el = document.createElement('style');
    el.id = 'im-sector-nav-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function sectorHref(path, qs) {
    var href = path + qs;
    if (global.InvestingMapTabState && InvestingMapTabState.appendToNavUrl) {
      href = InvestingMapTabState.appendToNavUrl(href);
    }
    return href;
  }

  function render(currentId, lang, mobile) {
    injectSectorNavStyles();
    var nav = document.getElementById('sector-nav');
    if (!nav) return;
    var isEn = lang === 'en';
    var compact = mobile != null ? mobile : (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width:768px)').matches);
    nav.setAttribute('aria-label', isEn ? 'Industry maps' : '\uC0B0\uC5C5 \uC9C0\uB3C4');
    var qs = '?lang=' + encodeURIComponent(lang || 'ko');
    var hubLabel = isEn ? 'Hub' : '\uD5C8\uBE0C';
    var hubHtml =
      '<a class="hub-back" id="hub-back" href="../index.html' + qs + '">' +
      '<span aria-hidden="true">\u2190</span> <span id="hub-link-label">' + hubLabel + '</span></a>';
    nav.innerHTML = hubHtml + SECTORS.map(function (s) {
      var label = navLabel(s, lang || 'ko', compact);
      if (s.id === currentId) {
        return '<span class="is-current" aria-current="page">' + label + '</span>';
      }
      return '<a href="' + sectorHref(s.path, qs) + '" title="' + label + '">' + label + '</a>';
    }).join('');
  }

  global.InvestingMapSectorNav = {
    SECTORS: SECTORS,
    render: render
  };
})(typeof window !== 'undefined' ? window : globalThis);
