/**
 * Cross-sector badges on company table rows (desktop + mobile card via DOM clone).
 */
(function (global) {
  'use strict';

  var I18N = {
    ko: { alsoIn: '다른 섹터에도 포함' },
    en: { alsoIn: 'Also listed in' },
  };

  function injectStyles() {
    if (document.getElementById('im-cross-sector-css')) return;
    var css =
      '.company-name-wrap{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 6px;min-width:0}' +
      '.company-name-wrap .company-name-sub{flex-basis:100%}' +
      '.im-cross-sector-badge{display:inline-flex;align-items:center;font-size:10px;font-weight:600;line-height:1.3;' +
      'padding:1px 6px;border-radius:999px;border:1px solid var(--border);color:var(--accent);' +
      'background:color-mix(in srgb, var(--accent) 12%, transparent);text-decoration:none;white-space:nowrap;' +
      'vertical-align:middle;margin-left:2px;-webkit-tap-highlight-color:transparent}' +
      '.im-cross-sector-badge:hover,.im-cross-sector-badge:focus{text-decoration:none;filter:brightness(1.08);outline:none}' +
      '.im-cross-sector-badge:focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +
      '@media (max-width:768px){.im-cross-sector-badge{font-size:9px;padding:1px 5px}}';
    var el = document.createElement('style');
    el.id = 'im-cross-sector-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function sectorHref(mapRel, ticker) {
    if (!mapRel) return '#';
    var parts = mapRel.split('/');
    var sectorDir = parts[0];
    var file = parts.slice(1).join('/');
    var cur = (global.location && global.location.pathname) || '';
    cur = cur.replace(/\\/g, '/');
    var inDir = cur.indexOf('/' + sectorDir + '/') !== -1 || cur.endsWith('/' + sectorDir);
    var href = inDir ? file : ('../' + mapRel);
    return href + '#ticker-' + ticker;
  }

  function badgeLabel(sector, lang) {
    if (!sector) return '';
    if (lang === 'en') return sector.shortEn || sector.labelEn || sector.sectorId;
    return sector.shortKo || sector.labelKo || sector.sectorId;
  }

  function badgesHtml(crossSectors, ticker, lang) {
    if (!crossSectors || !crossSectors.length) return '';
    injectStyles();
    var t = I18N[lang] || I18N.ko;
    return crossSectors.map(function (s) {
      var label = badgeLabel(s, lang);
      var href = sectorHref(s.map, ticker);
      var title = (t.alsoIn || 'Also in') + ': ' + (lang === 'en' ? (s.labelEn || label) : (s.labelKo || label));
      return (
        '<a class="im-cross-sector-badge" href="' +
        href +
        '" title="' +
        title.replace(/"/g, '&quot;') +
        '" data-sector-id="' +
        (s.sectorId || '') +
        '">+' +
        label +
        '</a>'
      );
    }).join('');
  }

  function nameCellHtml(c, displayName, subNameHtml, lang) {
    var badges = badgesHtml(c && c.crossSectors, c && c.ticker, lang);
    if (!badges) {
      return '<div class="company-name">' + displayName + '</div>' + (subNameHtml || '');
    }
    return (
      '<div class="company-name-wrap">' +
      '<div class="company-name">' +
      displayName +
      badges +
      '</div>' +
      (subNameHtml || '') +
      '</div>'
    );
  }

  injectStyles();

  global.InvestingMapCrossSector = {
    badgesHtml: badgesHtml,
    nameCellHtml: nameCellHtml,
    sectorHref: sectorHref,
  };
})(typeof window !== 'undefined' ? window : globalThis);
