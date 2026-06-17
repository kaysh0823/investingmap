/**
 * investingmap — live quotes polling (Cloudflare Pages /api/quotes or custom URL).
 * Default: same-origin /api/quotes (Pages Function + KRX OPEN API).
 * Override: <meta name="investingmap-quotes-api" content="https://...">
 */
(function (global) {
  'use strict';

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

  function mergeCompanies(companies, items) {
    if (!companies || !items) return;
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var key = normalizeTicker(c.ticker);
      if (!key) {
        c.quoteLast = c.quoteHi52 = c.quoteLo52 = c.quoteYoyPct = null;
        continue;
      }
      var q = items[key];
      if (!q) {
        c.quoteLast = c.quoteHi52 = c.quoteLo52 = c.quoteYoyPct = null;
        continue;
      }
      c.quoteLast = typeof q.last === 'number' && isFinite(q.last) ? q.last : null;
      c.quoteHi52 = typeof q.high52w === 'number' && isFinite(q.high52w) ? q.high52w : null;
      c.quoteLo52 = typeof q.low52w === 'number' && isFinite(q.low52w) ? q.low52w : null;
      c.quoteYoyPct = typeof q.yoyReturnPct === 'number' && isFinite(q.yoyReturnPct) ? q.yoyReturnPct : null;
    }
  }

  function formatWon(n, lang) {
    if (n == null || !isFinite(n)) return '—';
    var loc = lang === 'en' ? 'en-US' : 'ko-KR';
    return Math.round(n).toLocaleString(loc);
  }

  function formatYoy(n, lang) {
    if (n == null || !isFinite(n)) return '—';
    var s = n.toFixed(2) + (lang === 'en' ? '%' : '%');
    return (n > 0 ? '+' : '') + s;
  }

  function formatQuotesRow(c, lang) {
    return {
      last: formatWon(c.quoteLast, lang),
      hi: formatWon(c.quoteHi52, lang),
      lo: formatWon(c.quoteLo52, lang),
      yoy: formatYoy(c.quoteYoyPct, lang),
    };
  }

  /**
   * @param {object} opts
   * @param {() => object[]} opts.getCompanies
   * @param {() => void} opts.renderTable
   * @param {string} [opts.baseUrl] — override meta
   * @param {number} [opts.pollMs]
   * @param {(iso: string) => void} [opts.onAsOf]
   * @param {(err: Error) => void} [opts.onError]
   */
  function start(opts) {
    var base = (opts && opts.baseUrl != null && opts.baseUrl !== '') ? String(opts.baseUrl).replace(/\/+$/, '') : getApiBase();
    if (!base) return null;
    var getCompanies = opts.getCompanies;
    var renderTable = opts.renderTable;
    var pollMs = (opts && opts.pollMs) || 45000;
    var onAsOf = opts.onAsOf || function () {};
    var onError = opts.onError || function () {};
    var pollCount = 0;

    function run() {
      pollCount++;
      var companies = getCompanies();
      if (!companies || !companies.length) return;
      var codes = [];
      var seen = {};
      for (var j = 0; j < companies.length; j++) {
        var k = normalizeTicker(companies[j].ticker);
        if (!k || seen[k]) continue;
        seen[k] = 1;
        codes.push(k);
      }
      if (!codes.length) return;
      var url = base + '/?codes=' + encodeURIComponent(codes.join(','));
      if (pollCount % 8 === 0) url += '&warm=1';
      fetch(url, { mode: 'cors', cache: 'no-store' })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) {
              var msg = (j && (j.message || j.error)) ? String(j.message || j.error) : ('quotes ' + r.status);
              throw new Error(msg);
            }
            return j;
          });
        })
        .then(function (j) {
          mergeCompanies(getCompanies(), j.items || {});
          try {
            onAsOf(j.asOf || '');
          } catch (e1) {}
          if (renderTable) renderTable();
        })
        .catch(function (err) {
          try {
            onError(err || new Error('quotes fetch failed'));
          } catch (e2) {}
        });
    }

    run();
    return setInterval(run, pollMs);
  }

  global.InvestingMapLiveQuotes = {
    getApiBase: getApiBase,
    start: start,
    mergeCompanies: mergeCompanies,
    formatWon: formatWon,
    formatYoy: formatYoy,
    formatQuotesRow: formatQuotesRow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
