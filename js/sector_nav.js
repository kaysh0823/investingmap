/**
 * Cross-industry navigation in map page headers (left of Hub link).
 */
(function (global) {
  'use strict';

  var SECTORS = [
    { id: 'semi', path: '../semiconductor/korea_semiconductor_map.html', ko: '\uBC18\uB3C4\uCCB4', en: 'Semi' },
    { id: 'bio', path: '../bio/korea_bio_map.html', ko: '\uBC14\uC774\uC624', en: 'Bio' },
    { id: 'ship', path: '../ship/korea_ship_map.html', ko: '\uC870\uC120', en: 'Ship' },
    { id: 'defense', path: '../defense/korea_defense_map.html', ko: '\uBC29\uC704', en: 'Defense' },
    { id: 'robot', path: '../robot/korea_robot_map.html', ko: '\uB85C\uBD07', en: 'Robot' },
    { id: 'kculture', path: '../kculture/korea_kculture_map.html', ko: 'K\uCEEC\uCC98', en: 'K-Culture' },
    { id: 'energy', path: '../energy/korea_energy_map.html', ko: '\uC5D0\uB108\uC9C0/\uD30C\uC6CC', en: 'Energy/Power' }
  ];

  function render(currentId, lang) {
    var nav = document.getElementById('sector-nav');
    if (!nav) return;
    var isEn = lang === 'en';
    nav.setAttribute('aria-label', isEn ? 'Industry maps' : '\uC0B0\uC5C5 \uC9C0\uB3C4');
    var qs = '?lang=' + encodeURIComponent(lang || 'ko');
    nav.innerHTML = SECTORS.map(function (s) {
      var label = isEn ? s.en : s.ko;
      if (s.id === currentId) {
        return '<span class="is-current" aria-current="page">' + label + '</span>';
      }
      return '<a href="' + s.path + qs + '" title="' + label + '">' + label + '</a>';
    }).join('');
  }

  global.InvestingMapSectorNav = {
    SECTORS: SECTORS,
    render: render
  };
})(typeof window !== 'undefined' ? window : globalThis);
