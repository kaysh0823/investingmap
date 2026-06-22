/**
 * investingmap — live quotes polling (Cloudflare Pages /api/quotes or custom URL).
 */
(function (global) {
  'use strict';

  var CHUNK_SIZE = 18;
  var POSITION_FALLBACK_KO = '주가 위치';
  var POSITION_FALLBACK_EN = 'Price Position';

  function getApiBase() {
    try {
      var m = document.querySelector('meta[name="investingmap-quotes-api"]');
      var c = m && m.getAttribute('content') != null ? String(m.getAttribute('content')).trim() : '';
      if (c) return c.replace(/\/+$/, '');
      if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.indexOf('http') === 0) {
        return '/api/quotes';
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function quotesRequestUrl(base, query) {
    var q = query.charAt(0) === '?' ? query : '?' + query;
    if (/^https?:\/\//i.test(base)) {
      return base.replace(/\/+$/, '') + q;
    }
    var origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : '';
    var path = base.charAt(0) === '/' ? base : '/' + base;
    return origin + path.replace(/\/+$/, '') + q;
  }

  function normalizeTicker(t) {
    if (t == null || t === '' || t === 'UNLISTED') return null;
    var s = String(t).trim().toUpperCase();
    if (/^[0-9A-Z]{6}$/.test(s)) return s;
    var alnum = s.replace(/[^0-9A-Z]/g, '');
    if (alnum.length > 6) return alnum.slice(0, 6);
    if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
    if (alnum.length === 6) return alnum;
    return null;
  }

  /** (현재가 - 52주최저) / (52주최고 - 52주최저) × 100 — 고=100%, 저=0% */
  function calcQuotePosition(last, hi, lo) {
    if (last == null || hi == null || lo == null) return null;
    if (!isFinite(last) || !isFinite(hi) || !isFinite(lo)) return null;
    if (last >= hi) return 100;
    if (last <= lo) return 0;
    var span = hi - lo;
    if (span <= 0) return null;
    var pct = ((last - lo) / span) * 100;
    return pct < 0 ? 0 : pct > 100 ? 100 : pct;
  }

  function resolveQuotePosition(c) {
    if (!c) return null;
    if (typeof c.quotePosition === 'number' && isFinite(c.quotePosition)) return c.quotePosition;
    return calcQuotePosition(c.quoteLast, c.quoteHi52, c.quoteLo52);
  }

  function mergeCompanies(companies, items) {
    if (!companies || !items) return;
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var key = normalizeTicker(c.ticker);
      if (!key) {
        c.quoteLast = c.quoteHi52 = c.quoteLo52 = c.quotePosition = null;
        continue;
      }
      var q = items[key];
      if (!q) {
        c.quoteLast = c.quoteHi52 = c.quoteLo52 = c.quotePosition = null;
        continue;
      }
      c.quoteLast = typeof q.last === 'number' && isFinite(q.last) ? q.last : null;
      c.quoteHi52 = typeof q.high52w === 'number' && isFinite(q.high52w) ? q.high52w : null;
      c.quoteLo52 = typeof q.low52w === 'number' && isFinite(q.low52w) ? q.low52w : null;
      c.quotePosition = calcQuotePosition(c.quoteLast, c.quoteHi52, c.quoteLo52);
      if (typeof q.mcapWon === 'number' && isFinite(q.mcapWon) && q.mcapWon > 0) c.mcapWon = q.mcapWon;
      if (typeof q.per === 'number' && isFinite(q.per)) c.per = q.per;
      if (typeof q.pbr === 'number' && isFinite(q.pbr)) c.pbr = q.pbr;
    }
  }

  function formatWon(n, lang) {
    if (n == null || !isFinite(n)) return '\u2014';
    var loc = lang === 'en' ? 'en-US' : 'ko-KR';
    return Math.round(n).toLocaleString(loc);
  }

  function formatPosition(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    if (n === 100) return '100%';
    if (n === 0) return '0%';
    return n.toFixed(1) + '%';
  }

  /** 90%+ dark green, 80%+ green, 70%+ light green, 50–70% yellow, <50% light red */
  function positionColorStyle(n) {
    if (n == null || !isFinite(n)) return '';
    if (n >= 90) return 'color:#059669;font-weight:700';
    if (n >= 80) return 'color:#22c55e;font-weight:600';
    if (n >= 70) return 'color:#86efac';
    if (n >= 50) return 'color:#facc15';
    return 'color:#fca5a5';
  }

  function formatPositionHtml(c) {
    var n = resolveQuotePosition(c);
    var text = formatPosition(n);
    if (text === '\u2014') return text;
    return '<span style="' + positionColorStyle(n) + '">' + text + '</span>';
  }

  function formatQuotesRow(c, lang) {
    var posHtml = formatPositionHtml(c);
    return {
      last: formatWon(c.quoteLast, lang),
      hi: formatWon(c.quoteHi52, lang),
      lo: formatWon(c.quoteLo52, lang),
      position: posHtml,
      yoy: posHtml,
    };
  }

  function emptyQuotesRow() {
    return { last: '\u2014', hi: '\u2014', lo: '\u2014', position: '\u2014', yoy: '\u2014' };
  }

  function positionHeaderLabel(lang, t) {
    if (t && t.thPosition) return t.thPosition;
    return lang === 'en' ? POSITION_FALLBACK_EN : POSITION_FALLBACK_KO;
  }

  function fetchJson(url) {
    return fetch(url, { mode: 'cors', cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) {
            var msg = (j && (j.message || j.error)) ? String(j.message || j.error) : ('quotes ' + r.status);
            throw new Error(msg);
          }
          return j;
        });
      });
  }

  function formatQuotesAsofDisplay(asOf, regularSession, lang) {
    if (!asOf) return '';
    var short = asOf.indexOf('T') >= 0 ? asOf.replace('T', ' ').slice(0, 19) + ' UTC' : asOf;
    if (regularSession === false) {
      return lang === 'en'
        ? 'Market closed \u00b7 last close as of: ' + short
        : '\uC7A5 \uB9C8\uAC10 \u00b7 \uB9C8\uC9C0\uB9C9 \uC885\uAC00 \uAE30\uC900: ' + short;
    }
    return lang === 'en' ? 'Live quotes: ' + short : '\uC2E4\uC2DC\uAC04 \uC2DC\uC138: ' + short;
  }

  function fetchAllCodes(base, codes) {
    var merged = {};
    var asOf = '';
    var regularSession = null;
    var chain = Promise.resolve();
    for (var i = 0; i < codes.length; i += CHUNK_SIZE) {
      (function (chunk) {
        chain = chain.then(function () {
          var q = 'codes=' + chunk.map(encodeURIComponent).join(',');
          return fetchJson(quotesRequestUrl(base, q));
        }).then(function (j) {
          if (j && j.asOf) asOf = j.asOf;
          if (j && j.regularSession != null) regularSession = j.regularSession;
          var items = (j && j.items) || {};
          for (var k in items) {
            if (Object.prototype.hasOwnProperty.call(items, k)) merged[k] = items[k];
          }
        });
      })(codes.slice(i, i + CHUNK_SIZE));
    }
    return chain.then(function () {
      return { asOf: asOf, items: merged, regularSession: regularSession };
    });
  }

  function start(opts) {
    var base = (opts && opts.baseUrl != null && opts.baseUrl !== '') ? String(opts.baseUrl).replace(/\/+$/, '') : getApiBase();
    if (!base) return null;
    var getCompanies = opts.getCompanies;
    var renderTable = opts.renderTable;
    var pollMs = (opts && opts.pollMs) || 300000;
    var onAsOf = opts.onAsOf || function () {};
    var onError = opts.onError || function () {};
    var running = false;

    function run() {
      if (running) return;
      running = true;
      var companies = getCompanies();
      if (!companies || !companies.length) {
        running = false;
        return;
      }
      var codes = [];
      var seen = {};
      for (var j = 0; j < companies.length; j++) {
        var k = normalizeTicker(companies[j].ticker);
        if (!k || seen[k]) continue;
        seen[k] = 1;
        codes.push(k);
      }
      if (!codes.length) {
        running = false;
        return;
      }
      fetchAllCodes(base, codes)
        .then(function (j) {
          mergeCompanies(getCompanies(), j.items || {});
          try {
            onAsOf(j.asOf || '', { regularSession: j.regularSession });
          } catch (e1) {}
          if (renderTable) renderTable();
        })
        .catch(function (err) {
          try {
            onError(err || new Error('quotes fetch failed'));
          } catch (e2) {}
        })
        .then(function () {
          running = false;
        });
    }

    run();
    return setInterval(run, pollMs);
  }

  global.InvestingMapLiveQuotes = {
    getApiBase: getApiBase,
    formatQuotesAsofDisplay: formatQuotesAsofDisplay,
    start: start,
    mergeCompanies: mergeCompanies,
    calcQuotePosition: calcQuotePosition,
    resolveQuotePosition: resolveQuotePosition,
    formatWon: formatWon,
    formatPosition: formatPosition,
    formatPositionHtml: formatPositionHtml,
    positionHeaderLabel: positionHeaderLabel,
    emptyQuotesRow: emptyQuotesRow,
    formatQuotesRow: formatQuotesRow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
