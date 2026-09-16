/**
 * Shared returns basis badge for hub + map pages.
 * Uses API meta only (never client clock for mode/asOf).
 *
 * "기준 {anchorDd} · {정규장 LIVE | 애프터마켓 LIVE | 장마감 공식종가} · {asOf HH:mm} · v{hash}"
 */
(function (global) {
  'use strict';

  var meta = null;
  var syncing = false;
  var targets = [];

  function shortHash(dataVersion) {
    var s = String(dataVersion || '');
    if (!s) return '';
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36).slice(0, 6);
  }

  function formatAnchorDash(ymd) {
    var s = String(ymd || '').replace(/-/g, '');
    if (!/^\d{8}$/.test(s)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return String(ymd);
      return '';
    }
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }

  function formatAsOfHm(asOf) {
    if (!asOf) return '';
    var d = new Date(asOf);
    if (!isFinite(d.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(d);
      var hh = '';
      var mm = '';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') hh = parts[i].value;
        if (parts[i].type === 'minute') mm = parts[i].value;
      }
      if (hh && mm) return hh + ':' + mm;
    } catch (e) {}
    return '';
  }

  function modeLabel(m, lang) {
    var en = lang === 'en';
    if (!m) return '';
    if (m.numeratorMode === 'live') {
      // Prefer explicit aftermarket when sessionOpen but not regularSession.
      if (m.regularSession === false && m.sessionOpen === true) {
        return en ? 'Aftermarket LIVE' : '애프터마켓 LIVE';
      }
      if (m.regularSession === true || m.sessionOpen === true) {
        return en ? 'Regular LIVE' : '정규장 LIVE';
      }
      return en ? 'LIVE' : 'LIVE';
    }
    return en ? 'Official close' : '장마감 공식종가';
  }

  function remember(apiMeta) {
    if (!apiMeta) return;
    meta = {
      asOf: apiMeta.asOf || null,
      sessionOpen: apiMeta.sessionOpen != null ? !!apiMeta.sessionOpen : null,
      regularSession: apiMeta.regularSession != null ? !!apiMeta.regularSession : null,
      numeratorMode: apiMeta.numeratorMode || null,
      anchorDd: apiMeta.anchorDd || null,
      refsRecentDd: apiMeta.refsRecentDd || null,
      k: typeof apiMeta.k === 'number' && isFinite(apiMeta.k) ? apiMeta.k : null,
      dataVersion: apiMeta.dataVersion || null,
    };
  }

  function getMeta() {
    if (!meta) return {};
    return {
      asOf: meta.asOf,
      sessionOpen: meta.sessionOpen,
      regularSession: meta.regularSession,
      numeratorMode: meta.numeratorMode,
      anchorDd: meta.anchorDd,
      refsRecentDd: meta.refsRecentDd,
      k: meta.k,
      dataVersion: meta.dataVersion,
    };
  }

  function format(lang) {
    lang = lang === 'en' ? 'en' : 'ko';
    var m = getMeta();
    var dash = formatAnchorDash(m.anchorDd);
    if (!dash && !m.dataVersion) return syncing ? (lang === 'en' ? 'Syncing…' : '동기화 중…') : '';
    var parts = [];
    var basis = lang === 'en' ? 'Basis' : '기준';
    if (dash) parts.push(basis + ' ' + dash);
    var mode = modeLabel(m, lang);
    if (mode) parts.push(mode);
    var hm = formatAsOfHm(m.asOf);
    if (hm) parts.push(hm);
    var hash = shortHash(m.dataVersion);
    if (hash) parts.push('v' + hash);
    if (syncing) parts.push(lang === 'en' ? 'Syncing…' : '동기화 중…');
    return parts.join(' · ');
  }

  function bind(elOrSelector) {
    if (!elOrSelector) return;
    function add(el) {
      if (!el || el.nodeType !== 1) return;
      if (targets.indexOf(el) >= 0) return;
      targets.push(el);
    }
    if (typeof elOrSelector === 'string') {
      var nodes = document.querySelectorAll(elOrSelector);
      for (var i = 0; i < nodes.length; i++) add(nodes[i]);
      return;
    }
    add(elOrSelector);
  }

  function paint(lang) {
    var text = format(lang);
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (!el) continue;
      el.textContent = text;
      el.setAttribute('data-returns-badge', '1');
      if (syncing) el.setAttribute('data-syncing', '1');
      else el.removeAttribute('data-syncing');
    }
    // Hint lines: append badge (strip prior)
    var badgeRe = /\s*·\s*(기준|Basis)[\s\S]*$/;
    var hintIds = ['heatmap-hint', 'momentum-hint', 'volatility-hint'];
    for (var h = 0; h < hintIds.length; h++) {
      var hint = document.getElementById(hintIds[h]);
      if (!hint) continue;
      var base = String(hint.textContent || '').replace(badgeRe, '').trim();
      hint.textContent = text ? (base ? base + ' · ' + text : text) : base;
    }
  }

  function setSyncing(flag, lang) {
    syncing = !!flag;
    paint(lang || 'ko');
  }

  function updateFromApi(apiMeta, lang) {
    remember(apiMeta);
    paint(lang === 'en' ? 'en' : 'ko');
  }

  global.InvestingMapReturnsBadge = {
    remember: remember,
    getMeta: getMeta,
    format: format,
    bind: bind,
    paint: paint,
    setSyncing: setSyncing,
    updateFromApi: updateFromApi,
    shortHash: shortHash,
  };
})(typeof window !== 'undefined' ? window : globalThis);
