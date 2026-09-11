/**
 * Cross-sector badges + UI-only relation/affiliate chips on company table rows.
 * relations never feed mcap / counts / performance aggregation.
 */
(function (global) {
  'use strict';

  var I18N = {
    ko: { alsoIn: '다른 섹터에도 포함', related: '연관', affiliate: '계열' },
    en: { alsoIn: 'Also listed in', related: 'Related', affiliate: 'Affiliate' },
  };

  function injectStyles() {
    if (document.getElementById('im-cross-sector-css')) return;
    var css =
      '.company-name-wrap{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 6px;min-width:0}' +
      '.company-name-wrap .company-name-sub{flex-basis:100%}' +
      '.im-cross-sector-badge,.im-relation-badge{display:inline-flex;align-items:center;font-size:10px;font-weight:600;line-height:1.3;' +
      'padding:1px 6px;border-radius:999px;border:1px solid var(--border);text-decoration:none;white-space:nowrap;' +
      'vertical-align:middle;margin-left:2px;-webkit-tap-highlight-color:transparent}' +
      '.im-cross-sector-badge{color:var(--accent);background:color-mix(in srgb, var(--accent) 12%, transparent)}' +
      '.im-relation-badge{color:var(--muted, #64748b);background:color-mix(in srgb, var(--muted, #64748b) 10%, transparent)}' +
      '.im-relation-badge.im-relation-affiliate{color:#5C6BC0;border-color:color-mix(in srgb, #5C6BC0 40%, var(--border));' +
      'background:color-mix(in srgb, #5C6BC0 12%, transparent)}' +
      '.im-cross-sector-badge:hover,.im-cross-sector-badge:focus,.im-relation-badge:hover,.im-relation-badge:focus{text-decoration:none;filter:brightness(1.08);outline:none}' +
      '.im-cross-sector-badge:focus-visible,.im-relation-badge:focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +
      '@media (max-width:768px){.im-cross-sector-badge,.im-relation-badge{font-size:9px;padding:1px 5px}}';
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
    return href + '?ticker=' + encodeURIComponent(ticker);
  }

  function sectorBadgeLabel(sector, lang) {
    if (!sector) return '';
    if (lang === 'en') return sector.shortEn || sector.labelEn || sector.sectorId;
    return sector.shortKo || sector.labelKo || sector.sectorId;
  }

  function crossBadgesHtml(crossSectors, ticker, lang) {
    if (!crossSectors || !crossSectors.length) return '';
    var t = I18N[lang] || I18N.ko;
    return crossSectors.map(function (s) {
      var label = sectorBadgeLabel(s, lang);
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

  function relationBadgesHtml(relations, lang) {
    if (!relations || !relations.length) return '';
    var t = I18N[lang] || I18N.ko;
    // Cap chips to avoid clutter; prefer unique tickers
    var seen = {};
    var chips = [];
    for (var i = 0; i < relations.length; i++) {
      var r = relations[i];
      var key = (r.ticker || '') + '@' + (r.sector || '');
      if (!r.ticker || seen[key]) continue;
      seen[key] = true;
      chips.push(r);
      if (chips.length >= 6) break;
    }
    return chips.map(function (r) {
      var isAff = r.chip === '계열' || r.type === '지배구조';
      var chipLabel = isAff ? (lang === 'en' ? (r.chipEn || t.affiliate) : (r.chip || t.affiliate))
        : (lang === 'en' ? (r.chipEn || t.related) : (r.chip || t.related));
      var name = lang === 'en' ? (r.nameEn || r.name || r.ticker) : (r.name || r.ticker);
      var href = sectorHref(r.map, r.ticker);
      var title = (r.label || chipLabel) + ': ' + name + ' (' + r.ticker + ')';
      return (
        '<a class="im-relation-badge' +
        (isAff ? ' im-relation-affiliate' : '') +
        '" href="' +
        href +
        '" title="' +
        title.replace(/"/g, '&quot;') +
        '" data-relation-id="' +
        (r.relationId || '') +
        '" data-ticker="' +
        r.ticker +
        '">' +
        chipLabel +
        '·' +
        name +
        '</a>'
      );
    }).join('');
  }

  function nameCellHtml(c, displayName, subNameHtml, lang) {
    injectStyles();
    var badges = crossBadgesHtml(c && c.crossSectors, c && c.ticker, lang) + relationBadgesHtml(c && c.relations, lang);
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
    badgesHtml: crossBadgesHtml,
    relationBadgesHtml: relationBadgesHtml,
    nameCellHtml: nameCellHtml,
    sectorHref: sectorHref,
  };
})(typeof window !== 'undefined' ? window : globalThis);
