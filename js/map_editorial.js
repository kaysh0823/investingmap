/**
 * Sector editorial intro on industry map pages.
 * Paragraph text: lib/sector_editorial.mjs → js/sector_editorial_data.js (IM_SECTOR_EDITORIAL).
 * Static HTML (#im-seo-body) is prerendered from the same source; this script syncs lang / open state.
 * Lead + how-to sit inside #map-editorial-panel (collapsed by default via h1 toggle).
 * Longer notes open via “산업 해설·출처 보기”.
 */
(function (global) {
  'use strict';

  var SECTION_TITLE = {
    ko: '섹터 설명',
    en: 'Sector overview',
  };

  var MORE_LABEL = {
    ko: '산업 해설·출처 보기',
    en: 'Show industry notes & sources',
  };

  var LESS_LABEL = {
    ko: '해설·출처 접기',
    en: 'Hide industry notes',
  };

  var EDITORIAL = global.IM_SECTOR_EDITORIAL || {};

  var stylesInjected = false;
  var moreBound = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css =
      'section#map-editorial.geo-summary.map-editorial-collapsible{max-width:none;margin-left:0;margin-right:0;width:100%}' +
      '#map-editorial.map-editorial-collapsible{padding:6px 28px 10px}' +
      '.map-editorial-body{padding-top:4px;font-size:13px;line-height:1.55;color:var(--text-muted)}' +
      '.map-editorial-body p{margin:0 0 10px}' +
      '.map-editorial-body p:last-child{margin-bottom:0}' +
      '.map-editorial-body a{color:var(--accent)}' +
      '.map-editorial-lead,.map-editorial-howto{color:var(--text);font-size:13.5px;line-height:1.55;margin:0 0 8px}' +
      '.map-editorial-howto{color:var(--text-muted)}' +
      '.map-editorial-more-btn{display:inline-flex;align-items:center;gap:6px;margin:4px 0 10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
      '.map-editorial-more-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
      '.map-editorial-detail.is-collapsed{display:none}' +
      '.map-editorial-body .map-editorial-seo{margin:0;padding:0;border:none}' +
      '.map-editorial-body .map-editorial-seo-title{font-size:14px;font-weight:700;color:var(--text);margin:0 0 8px}' +
      '.map-editorial-body .im-seo-keywords,.map-editorial-body .im-seo-snapshot-note{font-size:12px;opacity:.9}' +
      '.map-editorial-body p[hidden],.map-editorial-body h2[hidden],.map-editorial-more-btn[hidden]{display:none}' +
      '#map-editorial-panel.is-collapsed{display:none}' +
      '#map-editorial-panel.is-collapsed .map-editorial-detail.is-collapsed{display:none}' +
      '#tab-btn-graph[hidden],#tab-btn-graph{display:none!important}';
    var el = document.createElement('style');
    el.id = 'map-editorial-collapsible-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function setDetailExpanded(open) {
    var detail = document.getElementById('map-editorial-detail');
    var btns = document.querySelectorAll('.map-editorial-more-btn');
    if (!detail) return;
    if (open) detail.classList.remove('is-collapsed');
    else detail.classList.add('is-collapsed');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var lang = b.getAttribute('lang') === 'en' ? 'en' : 'ko';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.textContent = open ? LESS_LABEL[lang] : MORE_LABEL[lang];
    }
  }

  function bindMoreButton() {
    if (moreBound) return;
    var btns = document.querySelectorAll('.map-editorial-more-btn');
    if (!btns.length) return;
    moreBound = true;
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var detail = document.getElementById('map-editorial-detail');
        var open = detail && !detail.classList.contains('is-collapsed');
        setDetailExpanded(!open);
      });
    }
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
    return !!(
      seoEl &&
      (seoEl.querySelectorAll('.im-seo-body-p').length >= 1 ||
        seoEl.querySelectorAll('.im-seo-lead').length >= 1)
    );
  }

  function ensureCollapsible(section) {
    if (!section) return;
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
        var dyn = bodyEl.querySelector('.map-editorial-dynamic');
        if (dyn) dyn.remove();
        syncSeoLang(seoBlock, lang);
      } else if (data) {
        var block = data[lang] || data.en;
        seoBlock = detachSeoBlock(bodyEl) || detachSeoBlock(section);
        var parts = [];
        if (block.lead) parts.push('<p class="map-editorial-lead">' + block.lead + '</p>');
        if (block.howTo) parts.push('<p class="map-editorial-howto">' + block.howTo + '</p>');
        var detailPs = (block.paragraphs || [])
          .map(function (p) {
            return '<p class="im-seo-detail">' + p + '</p>';
          })
          .join('');
        parts.push(
          '<div class="map-editorial-detail-wrap">' +
            '<button type="button" class="map-editorial-more-btn" aria-expanded="false" aria-controls="map-editorial-detail" lang="' +
            lang +
            '">' +
            MORE_LABEL[lang] +
            '</button>' +
            '<div id="map-editorial-detail" class="map-editorial-detail is-collapsed" role="region">' +
            detailPs +
            '</div></div>',
        );
        bodyEl.innerHTML = '<div class="map-editorial-dynamic">' + parts.join('') + '</div>';
        moreBound = false;
        if (seoBlock) {
          bodyEl.appendChild(seoBlock);
          syncSeoLang(seoBlock, lang);
        }
      }
    }
    bindMoreButton();
    section.setAttribute('lang', lang);
    section.classList.add('map-editorial-ready');
  }

  global.InvestingMapEditorial = { render: render, setDetailExpanded: setDetailExpanded };

  document.addEventListener('DOMContentLoaded', function () {
    render(imLang());
  });
  if (document.readyState !== 'loading') render(imLang());
})(typeof window !== 'undefined' ? window : globalThis);
