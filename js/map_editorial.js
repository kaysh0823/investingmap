/**
 * Sector editorial intro on industry map pages (AdSense / thin-content compliance).
 * Paragraph text: lib/sector_editorial.mjs → js/sector_editorial_data.js (IM_SECTOR_EDITORIAL).
 * Static HTML (#im-seo-body) is prerendered from the same source; this script syncs lang / open state.
 */
(function (global) {
  'use strict';

  var SECTION_TITLE = {
    ko: '섹터 설명',
    en: 'Sector overview',
  };

  var EDITORIAL = global.IM_SECTOR_EDITORIAL || {};

  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css =
      'section#map-editorial.geo-summary.map-editorial-collapsible{max-width:none;margin-left:0;margin-right:0;width:100%}' +
      '#map-editorial.map-editorial-collapsible{padding:6px 28px 10px}' +
      '.map-editorial-details{margin:0}' +
      '.map-editorial-summary{font-size:15px;font-weight:700;color:var(--text);cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:flex-start;gap:8px;user-select:none;padding:6px 0;margin:0;text-align:left}' +
      '.map-editorial-summary::-webkit-details-marker{display:none}' +
      '.map-editorial-summary::before{content:"\\25B8";font-size:11px;color:var(--accent);transition:transform .2s ease;flex-shrink:0}' +
      '.map-editorial-details[open] .map-editorial-summary::before{transform:rotate(90deg)}' +
      '.map-editorial-summary:hover{color:var(--accent)}' +
      '.map-editorial-body{padding-top:4px;font-size:13px;line-height:1.55;color:var(--text-muted)}' +
      '.map-editorial-body p{margin:0 0 10px}' +
      '.map-editorial-body p:last-child{margin-bottom:0}' +
      '.map-editorial-body a{color:var(--accent)}' +
      '.map-editorial-body .map-editorial-seo{margin:0;padding:0;border:none}' +
      '.map-editorial-body .map-editorial-seo-title{font-size:14px;font-weight:700;color:var(--text);margin:14px 0 8px}' +
      '.map-editorial-body .map-editorial-dynamic+.map-editorial-seo .map-editorial-seo-title{margin-top:14px}' +
      '.map-editorial-body .im-seo-keywords,.map-editorial-body .im-seo-snapshot-note{font-size:12px;opacity:.9}' +
      '.map-editorial-body p[hidden],.map-editorial-body h2[hidden]{display:none}';
    var el = document.createElement('style');
    el.id = 'map-editorial-collapsible-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function detachSeoBlock(root) {
    if (!root) return null;
    var seo = root.querySelector('#im-seo-body');
    if (!seo || !seo.parentNode) return null;
    return seo.parentNode.removeChild(seo);
  }

  function syncSeoLang(seoEl, lang) {
    if (!seoEl) return;
    var nodes = seoEl.querySelectorAll('[lang="ko"], [lang="en"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.hidden = el.getAttribute('lang') !== lang;
    }
  }

  function seoHasParagraphs(seoEl) {
    return !!(seoEl && seoEl.querySelectorAll('.im-seo-body-p').length >= 2);
  }

  function ensureCollapsible(section) {
    if (!section) return;
    if (section.querySelector('.map-editorial-details')) {
      section.classList.add('map-editorial-collapsible');
      var existing = section.querySelector('.map-editorial-details');
      if (existing) existing.open = true;
      return;
    }
    var titleEl = document.getElementById('map-editorial-title');
    var bodyEl = document.getElementById('map-editorial-body');
    if (!titleEl || !bodyEl) return;

    var details = document.createElement('details');
    details.className = 'map-editorial-details';
    details.open = true;

    var summary = document.createElement('summary');
    summary.className = 'map-editorial-summary';
    summary.id = 'map-editorial-title';

    details.appendChild(summary);
    details.appendChild(bodyEl);
    bodyEl.classList.add('map-editorial-body');

    section.insertBefore(details, titleEl);
    titleEl.remove();
    section.classList.add('map-editorial-collapsible');
  }

  function imLang() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) {}
    return document.documentElement.lang === 'ko' ? 'ko' : 'en';
  }

  function render(lang) {
    injectStyles();
    var sector = (document.body && document.body.getAttribute('data-sector')) || '';
    var data = EDITORIAL[sector];
    var section = document.getElementById('map-editorial');
    if (!section) return;
    lang = lang || imLang();
    ensureCollapsible(section);
    var titleEl = document.getElementById('map-editorial-title');
    var bodyEl = document.getElementById('map-editorial-body');
    if (titleEl) titleEl.textContent = SECTION_TITLE[lang] || SECTION_TITLE.ko;
    if (bodyEl) {
      var seoBlock = bodyEl.querySelector('#im-seo-body') || section.querySelector('#im-seo-body');
      if (seoHasParagraphs(seoBlock)) {
        // Prefer prerendered #im-seo-body (same source as SECTOR_EDITORIAL) — avoid duplicate paragraphs.
        var dyn = bodyEl.querySelector('.map-editorial-dynamic');
        if (dyn) dyn.remove();
        syncSeoLang(seoBlock, lang);
      } else if (data) {
        var block = data[lang] || data.en;
        seoBlock = detachSeoBlock(bodyEl) || detachSeoBlock(section);
        var editorialHtml = block.paragraphs
          .map(function (p) {
            return '<p>' + p + '</p>';
          })
          .join('');
        bodyEl.innerHTML = '<div class="map-editorial-dynamic">' + editorialHtml + '</div>';
        if (seoBlock) {
          bodyEl.appendChild(seoBlock);
          syncSeoLang(seoBlock, lang);
        }
      }
    }
    section.setAttribute('lang', lang);
    section.classList.add('map-editorial-ready');
  }

  global.InvestingMapEditorial = { render: render };

  document.addEventListener('DOMContentLoaded', function () {
    render(imLang());
  });
  if (document.readyState !== 'loading') render(imLang());
})(typeof window !== 'undefined' ? window : globalThis);
