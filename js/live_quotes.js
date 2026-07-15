/**
 * investingmap — live quotes polling (Cloudflare Pages /api/quotes or custom URL).
 */
(function (global) {
  'use strict';

  var CHUNK_SIZE = 18;
  var POSITION_FALLBACK_KO = '주가 위치';
  var POSITION_FALLBACK_EN = '52W Range';
  var RS_FALLBACK = 'RS';
  var rsSnapshot = null;
  var rsSnapshotPromise = null;

  function rsSnapshotUrl() {
    var origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : '';
    return origin + '/data/hub_rs_snapshot.json';
  }

  function rsSnapshotApiUrl() {
    var apiBase = getApiBase();
    if (apiBase) {
      var path = apiBase.replace(/\/quotes\/?$/i, '/hub_rs_snapshot');
      if (path === apiBase) {
        path = apiBase.replace(/\/?$/, '') + '/hub_rs_snapshot';
      }
      return quotesRequestUrl(path, '');
    }
    var origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : '';
    return origin + '/api/hub_rs_snapshot';
  }

  function loadRsSnapshot() {
    if (rsSnapshot) return Promise.resolve(rsSnapshot);
    if (!rsSnapshotPromise) {
      rsSnapshotPromise = fetch(rsSnapshotUrl(), { cache: 'default', credentials: 'same-origin' })
        .then(function (r) {
          if (r.ok) return r.json();
          return null;
        })
        .then(function (j) {
          if (j && j.quotes && Object.keys(j.quotes).length) {
            rsSnapshot = j;
            return rsSnapshot;
          }
          return fetch(rsSnapshotApiUrl(), { cache: 'default', credentials: 'same-origin' })
            .then(function (r2) { return r2.ok ? r2.json() : { quotes: {} }; })
            .then(function (j2) {
              rsSnapshot = j2 && j2.quotes ? j2 : { quotes: {} };
              return rsSnapshot;
            });
        })
        .catch(function () {
          rsSnapshot = { quotes: {} };
          return rsSnapshot;
        });
    }
    return rsSnapshotPromise;
  }

  function pickRetPct(row, newKey, oldKey) {
    if (!row) return null;
    var v = row[newKey];
    if (typeof v === 'number' && isFinite(v)) return v;
    if (oldKey) {
      var legacy = row[oldKey];
      if (typeof legacy === 'number' && isFinite(legacy)) return legacy;
    }
    return null;
  }

  function applyRsFieldsFromRow(c, row) {
    if (!row) {
      c.rs = null;
      c.chg1dPct = c.ret20dPct = c.ret50dPct = c.ret120dPct = c.ret250dPct = null;
      return;
    }
    c.rs = typeof row.rs === 'number' && isFinite(row.rs) ? row.rs : null;
    c.chg1dPct = pickRetPct(row, 'chg1dPct');
    c.ret20dPct = pickRetPct(row, 'ret20dPct', 'ret1mPct');
    c.ret50dPct = pickRetPct(row, 'ret50dPct', 'ret3mPct');
    c.ret120dPct = pickRetPct(row, 'ret120dPct', 'ret6mPct');
    c.ret250dPct = pickRetPct(row, 'ret250dPct', 'ret1yPct');
  }

  function applyRsFieldsFromRowIfPresent(c, row) {
    if (!row) return;
    if (typeof row.rs === 'number' && isFinite(row.rs)) c.rs = row.rs;
    var v;
    v = pickRetPct(row, 'chg1dPct');
    if (v != null) c.chg1dPct = v;
    v = pickRetPct(row, 'ret20dPct', 'ret1mPct');
    if (v != null) c.ret20dPct = v;
    v = pickRetPct(row, 'ret50dPct', 'ret3mPct');
    if (v != null) c.ret50dPct = v;
    v = pickRetPct(row, 'ret120dPct', 'ret6mPct');
    if (v != null) c.ret120dPct = v;
    v = pickRetPct(row, 'ret250dPct', 'ret1yPct');
    if (v != null) c.ret250dPct = v;
  }

  function quoteItemHasRsReturns(q) {
    if (!q) return false;
    if (typeof q.rs === 'number' && isFinite(q.rs)) return true;
    if (pickRetPct(q, 'chg1dPct') != null) return true;
    if (pickRetPct(q, 'ret20dPct', 'ret1mPct') != null) return true;
    if (pickRetPct(q, 'ret50dPct', 'ret3mPct') != null) return true;
    if (pickRetPct(q, 'ret120dPct', 'ret6mPct') != null) return true;
    if (pickRetPct(q, 'ret250dPct', 'ret1yPct') != null) return true;
    return false;
  }

  /** True when /api/quotes already carries RS + horizon returns (e.g. Supabase path). */
  function quotesResponseHasRsReturns(j) {
    if (!j) return false;
    if (j.source === 'supabase') return true;
    var items = j.items || {};
    for (var k in items) {
      if (Object.prototype.hasOwnProperty.call(items, k) && quoteItemHasRsReturns(items[k])) {
        return true;
      }
    }
    return false;
  }

  function mergeRsIntoCompanies(companies, snap) {
    if (!companies) return;
    var quotes = (snap && snap.quotes) || {};
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var key = normalizeTicker(c.ticker);
      if (!key) {
        c.rs = null;
        c.chg1dPct = c.ret20dPct = c.ret50dPct = c.ret120dPct = c.ret250dPct = null;
        continue;
      }
      applyRsFieldsFromRow(c, quotes[key]);
    }
  }

  /** Naver last for 1D only; 20D+ stay on KRX snapshot. */
  function applyLiveReturns(companies, snap) {
    var RL = global.InvestingMapReturnLive;
    if (!RL || !companies || !snap) return;
    if (!RL.shouldUseLive1dReturns(snap.recentDd)) return;
    var snapStale = RL.isRecentDdStale(snap.recentDd);
    var quotes = snap.quotes || {};
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var key = normalizeTicker(c.ticker);
      if (!key || c.quoteLast == null) continue;
      var row = quotes[key];
      var refClose = null;
      if (typeof c.quotePrevClose === 'number' && c.quotePrevClose > 0) {
        refClose = c.quotePrevClose;
      } else if (row && row.refClose != null && row.refClose > 0) {
        // When KRX recentDd lags, keep API/Naver chg1dPct instead of multi-day span vs old refClose.
        if (snapStale && c.chg1dPct != null) continue;
        refClose = row.refClose;
      }
      if (refClose == null || refClose <= 0) continue;
      var live = RL.calcLiveChg1dPct(c.quoteLast, refClose);
      if (live != null) c.chg1dPct = live;
    }
  }

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

  /** Hide table rows when KRX quotes merged with a zero last / 52w high / 52w low, or below mcap floor. */
  function shouldHideFromTable(c) {
    if (!c) return false;
    if (c.quoteLast === 0 || c.quoteHi52 === 0 || c.quoteLo52 === 0) return true;
    if (global.InvestingMapMcapFmt && InvestingMapMcapFmt.passesMcapFloor && !InvestingMapMcapFmt.passesMcapFloor(c)) {
      return true;
    }
    return false;
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
      c.quotePrevClose = typeof q.prevClose === 'number' && isFinite(q.prevClose) ? q.prevClose : null;
      c.quoteHi52 = typeof q.high52w === 'number' && isFinite(q.high52w) ? q.high52w : null;
      c.quoteLo52 = typeof q.low52w === 'number' && isFinite(q.low52w) ? q.low52w : null;
      c.quotePosition = calcQuotePosition(c.quoteLast, c.quoteHi52, c.quoteLo52);
      if (typeof q.mcapWon === 'number' && isFinite(q.mcapWon) && q.mcapWon > 0) {
        var mcapFmt = global.InvestingMapMcapFmt;
        if (!mcapFmt || mcapFmt.shouldApplyLiveMcap(c.mcapWon, q.mcapWon)) {
          c.mcapWon = q.mcapWon;
        }
      }
      if (typeof q.per === 'number' && isFinite(q.per)) c.per = q.per;
      if (typeof q.pbr === 'number' && isFinite(q.pbr)) c.pbr = q.pbr;
      applyRsFieldsFromRowIfPresent(c, q);
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

  function returnColorStyle(n) {
    if (n == null || !isFinite(n)) return '';
    if (n > 0) return 'color:#3fb950;font-weight:600';
    if (n < 0) return 'color:#f85149;font-weight:600';
    return 'color:var(--text-muted)';
  }

  function formatReturnPct(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var sign = n > 0 ? '+' : '';
    var text = sign + n.toFixed(2) + '%';
    return '<span style="' + returnColorStyle(n) + '">' + text + '</span>';
  }

  function formatReturnPctPlain(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  }

  function formatRs(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    return n.toFixed(1);
  }

  function rsColorStyle(n) {
    if (n == null || !isFinite(n)) return '';
    if (n >= 80) return 'color:#059669;font-weight:700';
    if (n >= 60) return 'color:#22c55e;font-weight:600';
    if (n >= 40) return 'color:#facc15';
    return 'color:#fca5a5';
  }

  function formatRsHtml(c) {
    var n = c && typeof c.rs === 'number' ? c.rs : null;
    var text = formatRs(n);
    if (text === '\u2014') return text;
    return '<span style="' + rsColorStyle(n) + '">' + text + '</span>';
  }

  function formatQuotesRow(c, lang) {
    var posHtml = formatPositionHtml(c);
    return {
      last: formatWon(c.quoteLast, lang),
      chg1d: formatReturnPct(c.chg1dPct),
      ret20d: formatReturnPct(c.ret20dPct),
      ret50d: formatReturnPct(c.ret50dPct),
      ret120d: formatReturnPct(c.ret120dPct),
      ret250d: formatReturnPct(c.ret250dPct),
      hi: formatWon(c.quoteHi52, lang),
      lo: formatWon(c.quoteLo52, lang),
      position: posHtml,
      rs: formatRsHtml(c),
      yoy: posHtml,
    };
  }

  function emptyQuotesRow() {
    return {
      last: '\u2014', chg1d: '\u2014', ret20d: '\u2014', ret50d: '\u2014', ret120d: '\u2014', ret250d: '\u2014',
      hi: '\u2014', lo: '\u2014', position: '\u2014', rs: '\u2014', yoy: '\u2014',
    };
  }

  function positionHeaderLabel(lang, t) {
    if (t && t.thPosition) return t.thPosition;
    return lang === 'en' ? POSITION_FALLBACK_EN : POSITION_FALLBACK_KO;
  }

  function rsHeaderLabel(lang, t) {
    if (t && t.thRs) return t.thRs;
    return RS_FALLBACK;
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

  function formatAsOfYmdKst(asOf) {
    if (!asOf) return '';
    var d = new Date(asOf);
    if (!isFinite(d.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      var y = '';
      var m = '';
      var day = '';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'year') y = parts[i].value;
        if (parts[i].type === 'month') m = parts[i].value;
        if (parts[i].type === 'day') day = parts[i].value;
      }
      if (y && m && day) return y + '-' + m + '-' + day;
    } catch (e) {}
    return '';
  }

  function formatQuotesAsofDisplay(asOf, regularSession, lang) {
    var ymd = formatAsOfYmdKst(asOf);
    if (regularSession === false) {
      var closed = lang === 'en' ? 'Closed' : '\uC7A5\uB9C8\uAC10';
      return ymd ? closed + ' \u00B7 ' + ymd : closed;
    }
    if (regularSession === true || asOf) {
      return lang === 'en' ? '~10m delayed' : '10\uBD84 \uC9C0\uC5F0';
    }
    return '';
  }

  function fetchAllCodes(base, codes) {
    var merged = {};
    var asOf = '';
    var regularSession = null;
    var source = '';
    var chain = Promise.resolve();
    for (var i = 0; i < codes.length; i += CHUNK_SIZE) {
      (function (chunk) {
        chain = chain.then(function () {
          var q = 'codes=' + chunk.map(encodeURIComponent).join(',');
          return fetchJson(quotesRequestUrl(base, q));
        }).then(function (j) {
          if (j && j.asOf) asOf = j.asOf;
          if (j && j.regularSession != null) regularSession = j.regularSession;
          if (j && j.source) source = j.source;
          var items = (j && j.items) || {};
          for (var k in items) {
            if (Object.prototype.hasOwnProperty.call(items, k)) merged[k] = items[k];
          }
        });
      })(codes.slice(i, i + CHUNK_SIZE));
    }
    return chain.then(function () {
      return { asOf: asOf, items: merged, regularSession: regularSession, source: source };
    });
  }

  function focusTickerAfterRender() {
    if (global.InvestingMapTabState && InvestingMapTabState.focusTickerAfterTableRender) {
      InvestingMapTabState.focusTickerAfterTableRender();
    } else if (global.InvestingMapTabState && InvestingMapTabState.focusTickerIfPending) {
      InvestingMapTabState.focusTickerIfPending();
    }
  }

  function hydrateRsSnapshot(opts) {
    var getCompanies = opts && opts.getCompanies;
    var renderTable = opts && opts.renderTable;
    return loadRsSnapshot().then(function (snap) {
      if (getCompanies) {
        mergeRsIntoCompanies(getCompanies(), snap);
        applyLiveReturns(getCompanies(), snap);
      }
      if (renderTable) renderTable();
      focusTickerAfterRender();
      return snap;
    });
  }

  function bootMapQuotes(opts) {
    return start(opts);
  }

  function start(opts) {
    var base = (opts && opts.baseUrl != null && opts.baseUrl !== '') ? String(opts.baseUrl).replace(/\/+$/, '') : getApiBase();
    var getCompanies = opts.getCompanies;
    var renderTable = opts.renderTable;
    var pollMs = (opts && opts.pollMs) || 300000;
    var onAsOf = opts.onAsOf || function () {};
    var onError = opts.onError || function () {};
    var running = false;

    if (!base) {
      return hydrateRsSnapshot(opts);
    }

    function run() {
      if (running) return Promise.resolve(null);
      running = true;
      var companies = getCompanies();
      if (!companies || !companies.length) {
        running = false;
        return Promise.resolve(null);
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
        return Promise.resolve(null);
      }
      return fetchAllCodes(base, codes)
        .then(function (j) {
          mergeCompanies(getCompanies(), j.items || {});
          // Always load RS snap for multi-horizon fallback + live 1D vs refClose.
          // Supabase chg1dPct can lag KRX close-to-close while `last` is Naver intraday.
          return loadRsSnapshot().then(function (snap) {
            if (snap && !quotesResponseHasRsReturns(j)) {
              mergeRsIntoCompanies(getCompanies(), snap);
            }
            if (snap) applyLiveReturns(getCompanies(), snap);
            try {
              onAsOf(j.asOf || '', { regularSession: j.regularSession });
            } catch (e1) {}
            if (renderTable) renderTable();
            focusTickerAfterRender();
            return j;
          });
        })
        .catch(function (err) {
          try {
            onError(err || new Error('quotes fetch failed'));
          } catch (e2) {}
          return hydrateRsSnapshot(opts);
        })
        .then(function (result) {
          running = false;
          return result;
        });
    }

    var first = run();
    setInterval(function () {
      run();
    }, pollMs);
    return first;
  }

  global.InvestingMapLiveQuotes = {
    getApiBase: getApiBase,
    formatQuotesAsofDisplay: formatQuotesAsofDisplay,
    start: start,
    bootMapQuotes: bootMapQuotes,
    hydrateRsSnapshot: hydrateRsSnapshot,
    mergeCompanies: mergeCompanies,
    shouldHideFromTable: shouldHideFromTable,
    calcQuotePosition: calcQuotePosition,
    resolveQuotePosition: resolveQuotePosition,
    formatWon: formatWon,
    formatPosition: formatPosition,
    formatPositionHtml: formatPositionHtml,
    formatReturnPct: formatReturnPct,
    formatReturnPctPlain: formatReturnPctPlain,
    formatRs: formatRs,
    formatRsHtml: formatRsHtml,
    rsHeaderLabel: rsHeaderLabel,
    loadRsSnapshot: loadRsSnapshot,
    mergeRsIntoCompanies: mergeRsIntoCompanies,
    applyLiveReturns: applyLiveReturns,
    positionHeaderLabel: positionHeaderLabel,
    emptyQuotesRow: emptyQuotesRow,
    formatQuotesRow: formatQuotesRow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
