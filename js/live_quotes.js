/**
 * investingmap — live quotes polling (Cloudflare Pages /api/quotes or custom URL).
 */
(function (global) {
  'use strict';
  var QUOTES_API_VERSION = '11';

  var CHUNK_SIZE = 18;
  var POSITION_FALLBACK_KO = '주가 위치';
  var POSITION_FALLBACK_EN = '52W Range';
  var RS_FALLBACK = 'RS';
  var rsSnapshot = null;
  var rsSnapshotPromise = null;
  /** @type {{kospiRs?: number, kosdaqRs?: number}|null} */
  var momentumIndices = null;
  /** @type {{ asOf?: string|null, sessionOpen?: boolean|null, numeratorMode?: string|null, anchorDd?: string|null, refsRecentDd?: string|null, k?: number|null }|null} */
  var returnMeta = null;

  function rememberMomentumIndices(source) {
    if (!source) return;
    var ix = source.indices || source;
    if (!ix || typeof ix !== 'object') return;
    var next = momentumIndices ? { kospiRs: momentumIndices.kospiRs, kosdaqRs: momentumIndices.kosdaqRs } : {};
    var kospi =
      ix.KOSPI && typeof ix.KOSPI.rs === 'number'
        ? ix.KOSPI.rs
        : typeof ix.kospiRs === 'number'
          ? ix.kospiRs
          : null;
    var kosdaq =
      ix.KOSDAQ && typeof ix.KOSDAQ.rs === 'number'
        ? ix.KOSDAQ.rs
        : typeof ix.kosdaqRs === 'number'
          ? ix.kosdaqRs
          : null;
    if (kospi != null && isFinite(kospi)) next.kospiRs = kospi;
    if (kosdaq != null && isFinite(kosdaq)) next.kosdaqRs = kosdaq;
    if (next.kospiRs != null || next.kosdaqRs != null) {
      momentumIndices = next;
      try {
        global.InvestingMapMarketRs = {
          kospiRs: next.kospiRs,
          kosdaqRs: next.kosdaqRs,
        };
        if (typeof global.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
          global.dispatchEvent(
            new CustomEvent('im:market-rs', { detail: global.InvestingMapMarketRs }),
          );
        }
      } catch (e) {}
    }
  }

  function getMomentumIndices() {
    if (!momentumIndices) return {};
    var out = {};
    if (typeof momentumIndices.kospiRs === 'number' && isFinite(momentumIndices.kospiRs)) {
      out.kospiRs = momentumIndices.kospiRs;
    }
    if (typeof momentumIndices.kosdaqRs === 'number' && isFinite(momentumIndices.kosdaqRs)) {
      out.kosdaqRs = momentumIndices.kosdaqRs;
    }
    return out;
  }

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
            rememberMomentumIndices(j);
            rsSnapshot = j;
            return rsSnapshot;
          }
          return fetch(rsSnapshotApiUrl(), { cache: 'default', credentials: 'same-origin' })
            .then(function (r2) { return r2.ok ? r2.json() : { quotes: {} }; })
            .then(function (j2) {
              rememberMomentumIndices(j2);
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

  function applyRsOnlyFromRow(c, row) {
    if (!row) {
      c.rs = null;
      return;
    }
    c.rs = typeof row.rs === 'number' && isFinite(row.rs) ? row.rs : null;
  }

  function applyQuoteReturnsFromApi(c, q) {
    if (!q) return;
    var v;
    v = pickRetPct(q, 'chg1dPct');
    if (v != null) c.chg1dPct = v;
    v = pickRetPct(q, 'ret5dPct');
    if (v != null) c.ret5dPct = v;
    v = pickRetPct(q, 'ret20dPct', 'ret1mPct');
    if (v != null) c.ret20dPct = v;
    v = pickRetPct(q, 'ret50dPct', 'ret3mPct');
    if (v != null) c.ret50dPct = v;
    v = pickRetPct(q, 'ret120dPct', 'ret6mPct');
    if (v != null) c.ret120dPct = v;
    v = pickRetPct(q, 'ret200dPct', 'ret1yPct');
    if (v != null) c.ret200dPct = v;
  }

  function quoteItemHasRs(q) {
    return !!(q && typeof q.rs === 'number' && isFinite(q.rs));
  }

  /** True when /api/quotes already carries RS (snapshot fetch only needed for RS gaps). */
  function quotesResponseHasRs(j) {
    if (!j) return false;
    if (j.indices) return true;
    var items = j.items || {};
    for (var k in items) {
      if (Object.prototype.hasOwnProperty.call(items, k) && quoteItemHasRs(items[k])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Skip hub_rs_snapshot when quotes already include RS (returns come from API alone).
   */
  function quotesResponseCanSkipRsSnapshot(j) {
    return quotesResponseHasRs(j);
  }

  /** Merge RS ranks only — never overwrite API returns (chg1d / retXd). */
  function mergeRsIntoCompanies(companies, snap) {
    if (!companies) return;
    var quotes = (snap && snap.quotes) || {};
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var key = normalizeTicker(c.ticker);
      if (!key) {
        c.rs = null;
        continue;
      }
      applyRsOnlyFromRow(c, quotes[key]);
    }
  }

  /** @deprecated Returns are computed server-side in /api/quotes; kept as no-op. */
  function applyLiveReturns() {}

  function rememberReturnMeta(j) {
    if (!j) return;
    returnMeta = {
      asOf: j.asOf || null,
      sessionOpen: j.sessionOpen != null ? !!j.sessionOpen : null,
      regularSession: j.regularSession != null ? !!j.regularSession : null,
      numeratorMode: j.numeratorMode || null,
      anchorDd: j.anchorDd || null,
      refsRecentDd: j.refsRecentDd || null,
      k: typeof j.k === 'number' && isFinite(j.k) ? j.k : null,
      dataVersion: j.dataVersion || null,
    };
    try {
      if (global.InvestingMapReturnsBadge) {
        global.InvestingMapReturnsBadge.remember(returnMeta);
      }
    } catch (e) {}
  }

  function getReturnMeta() {
    if (global.InvestingMapReturnsBadge && global.InvestingMapReturnsBadge.getMeta) {
      var shared = global.InvestingMapReturnsBadge.getMeta();
      if (shared && (shared.anchorDd || shared.dataVersion)) return shared;
    }
    if (!returnMeta) return {};
    return {
      asOf: returnMeta.asOf || null,
      sessionOpen: returnMeta.sessionOpen,
      regularSession: returnMeta.regularSession,
      numeratorMode: returnMeta.numeratorMode || null,
      anchorDd: returnMeta.anchorDd || null,
      refsRecentDd: returnMeta.refsRecentDd || null,
      k: returnMeta.k,
      dataVersion: returnMeta.dataVersion || null,
    };
  }

  function formatAnchorDash(ymd) {
    var s = String(ymd || '').replace(/-/g, '');
    if (!/^\d{8}$/.test(s)) return '';
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }

  /** Shared badge via InvestingMapReturnsBadge when available. */
  function formatReturnMetaBadge(lang) {
    if (global.InvestingMapReturnsBadge && global.InvestingMapReturnsBadge.format) {
      return global.InvestingMapReturnsBadge.format(lang);
    }
    var meta = getReturnMeta();
    var dash = formatAnchorDash(meta.anchorDd);
    if (!dash) return '';
    var mode = meta.numeratorMode === 'live'
      ? 'live'
      : (lang === 'en' ? 'closed' : '\uB9C8\uAC10');
    var label = lang === 'en' ? 'Basis' : '\uAE30\uC900';
    return label + ' \u00B7 ' + dash + ' \u00B7 ' + mode;
  }

  function syncReturnMetaBadges(lang) {
    if (global.InvestingMapReturnsBadge && global.InvestingMapReturnsBadge.paint) {
      try {
        global.InvestingMapReturnsBadge.bind('#quotes-asof');
        global.InvestingMapReturnsBadge.paint(lang);
        return;
      } catch (e) {}
    }
    var badge = formatReturnMetaBadge(lang);
    var badgeRe = /\s*·\s*(기준|Basis)\s*·\s*\d{4}-\d{2}-\d{2}\s*·\s*(live|마감|closed)\s*$/;
    var ids = ['heatmap-hint', 'momentum-hint', 'volatility-hint'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var base = String(el.textContent || '').replace(badgeRe, '').trim();
      el.dataset.imHintBase = base;
      el.textContent = badge ? (base ? base + ' \u00B7 ' + badge : badge) : base;
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
        c.turnoverWon = null;
        c.high120d = c.low120d = c.high50d = c.low50d = c.high20d = c.low20d = c.high10d = c.low10d = c.high5d = c.low5d = c.bbUpper = c.bbLower = null;
        continue;
      }
      var q = items[key];
      if (!q) {
        c.quoteLast = c.quoteHi52 = c.quoteLo52 = c.quotePosition = null;
        c.turnoverWon = null;
        c.high120d = c.low120d = c.high50d = c.low50d = c.high20d = c.low20d = c.high10d = c.low10d = c.high5d = c.low5d = c.bbUpper = c.bbLower = null;
        continue;
      }
      c.quoteLast = typeof q.last === 'number' && isFinite(q.last) ? q.last : null;
      c.quotePrevClose = typeof q.prevClose === 'number' && isFinite(q.prevClose) ? q.prevClose : null;
      c.quoteHi52 = typeof q.high52w === 'number' && isFinite(q.high52w) ? q.high52w : null;
      c.quoteLo52 = typeof q.low52w === 'number' && isFinite(q.low52w) ? q.low52w : null;
      c.quotePosition = calcQuotePosition(c.quoteLast, c.quoteHi52, c.quoteLo52);
      c.turnoverWon =
        typeof q.turnoverWon === 'number' && isFinite(q.turnoverWon) && q.turnoverWon >= 0
          ? q.turnoverWon
          : null;
      c.high120d = typeof q.high120d === 'number' && isFinite(q.high120d) ? q.high120d : null;
      c.low120d = typeof q.low120d === 'number' && isFinite(q.low120d) ? q.low120d : null;
      c.high50d = typeof q.high50d === 'number' && isFinite(q.high50d) ? q.high50d : null;
      c.low50d = typeof q.low50d === 'number' && isFinite(q.low50d) ? q.low50d : null;
      c.high20d = typeof q.high20d === 'number' && isFinite(q.high20d) ? q.high20d : null;
      c.low20d = typeof q.low20d === 'number' && isFinite(q.low20d) ? q.low20d : null;
      c.high10d = typeof q.high10d === 'number' && isFinite(q.high10d) ? q.high10d : null;
      c.low10d = typeof q.low10d === 'number' && isFinite(q.low10d) ? q.low10d : null;
      c.high5d = typeof q.high5d === 'number' && isFinite(q.high5d) ? q.high5d : null;
      c.low5d = typeof q.low5d === 'number' && isFinite(q.low5d) ? q.low5d : null;
      c.bbUpper = typeof q.bbUpper === 'number' && isFinite(q.bbUpper) ? q.bbUpper : null;
      c.bbLower = typeof q.bbLower === 'number' && isFinite(q.bbLower) ? q.bbLower : null;
      if (typeof q.mcapWon === 'number' && isFinite(q.mcapWon) && q.mcapWon > 0) {
        var mcapFmt = global.InvestingMapMcapFmt;
        if (!mcapFmt || mcapFmt.shouldApplyLiveMcap(c.mcapWon, q.mcapWon)) {
          c.mcapWon = q.mcapWon;
        }
      }
      if (typeof q.per === 'number' && isFinite(q.per)) c.per = q.per;
      if (typeof q.pbr === 'number' && isFinite(q.pbr)) c.pbr = q.pbr;
      if (Array.isArray(q.spark20) && q.spark20.length >= 2) {
        c.spark20 = q.spark20;
      } else {
        c.spark20 = null;
      }
      if (typeof q.rs === 'number' && isFinite(q.rs)) c.rs = q.rs;
      applyQuoteReturnsFromApi(c, q);
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

  function rsColorStyle(n, company) {
    if (n == null || !isFinite(n)) return '';
    if (global.InvestingMapRsColor && typeof global.InvestingMapRsColor.colorForRs === 'function') {
      var center =
        typeof global.InvestingMapRsColor.marketRsFor === 'function'
          ? global.InvestingMapRsColor.marketRsFor(company)
          : 50;
      var col = global.InvestingMapRsColor.colorForRs(n, center);
      return 'color:' + col + ';font-weight:600';
    }
    if (n >= 80) return 'color:#059669;font-weight:700';
    if (n >= 60) return 'color:#22c55e;font-weight:600';
    if (n >= 40) return 'color:#facc15';
    return 'color:#fca5a5';
  }

  function formatRsHtml(c) {
    var n = c && typeof c.rs === 'number' ? c.rs : null;
    var text = formatRs(n);
    if (text === '\u2014') return text;
    return '<span style="' + rsColorStyle(n, c) + '">' + text + '</span>';
  }

  function formatSpark20Svg(closes) {
    var placeholder =
      '<svg class="quote-spark" viewBox="0 0 56 22" aria-hidden="true">' +
      '<polyline fill="none" stroke="#8b949e" stroke-width="1.8" stroke-dasharray="3 3" points="2,11 54,11"/></svg>';
    if (!closes || !closes.length || closes.length < 2) return placeholder;
    var vals = [];
    for (var i = 0; i < closes.length; i++) {
      var n = typeof closes[i] === 'number' ? closes[i] : Number(closes[i]);
      if (!isFinite(n)) continue;
      vals.push(n);
    }
    if (vals.length < 2) return placeholder;
    var min = vals[0];
    var max = vals[0];
    for (var j = 1; j < vals.length; j++) {
      if (vals[j] < min) min = vals[j];
      if (vals[j] > max) max = vals[j];
    }
    var span = max - min;
    if (!(span > 0)) span = 1;
    var w = 56;
    var h = 22;
    var pad = 2;
    var pts = [];
    for (var k = 0; k < vals.length; k++) {
      var x = pad + (k / (vals.length - 1)) * (w - 2 * pad);
      var y = pad + (1 - (vals[k] - min) / span) * (h - 2 * pad);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    var delta = vals[vals.length - 1] - vals[0];
    var color = delta > 0 ? '#3fb950' : delta < 0 ? '#f85149' : '#8b949e';
    return (
      '<svg class="quote-spark" viewBox="0 0 56 22" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.8" points="' + pts.join(' ') + '"/></svg>'
    );
  }

  function formatQuotesRow(c, lang) {
    var posHtml = formatPositionHtml(c);
    return {
      last: formatWon(c.quoteLast, lang),
      spark: formatSpark20Svg(c && c.spark20),
      chg1d: formatReturnPct(c.chg1dPct),
      ret20d: formatReturnPct(c.ret20dPct),
      ret50d: formatReturnPct(c.ret50dPct),
      ret120d: formatReturnPct(c.ret120dPct),
      ret200d: formatReturnPct(c.ret200dPct),
      hi: formatWon(c.quoteHi52, lang),
      lo: formatWon(c.quoteLo52, lang),
      position: posHtml,
      rs: formatRsHtml(c),
      yoy: posHtml,
    };
  }

  function emptyQuotesRow() {
    return {
      last: '\u2014',
      spark: formatSpark20Svg(null),
      chg1d: '\u2014', ret20d: '\u2014', ret50d: '\u2014', ret120d: '\u2014', ret200d: '\u2014',
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
    return fetch(url, { mode: 'cors', cache: 'default', credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) {
            var msg = (j && (j.message || j.error)) ? String(j.message || j.error) : ('quotes ' + r.status);
            throw new Error(msg);
          }
          var dv = r.headers.get('X-Data-Version') || r.headers.get('x-data-version') || '';
          if (dv && j && !j.dataVersion) j.dataVersion = dv;
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
    if (global.InvestingMapReturnsBadge && global.InvestingMapReturnsBadge.format) {
      var text = global.InvestingMapReturnsBadge.format(lang);
      if (text) return text;
    }
    var ymd = formatAsOfYmdKst(asOf);
    var base = '';
    if (regularSession === false) {
      var closed = lang === 'en' ? 'Closed' : '\uC7A5\uB9C8\uAC10';
      base = ymd ? closed + ' \u00B7 ' + ymd : closed;
    } else if (regularSession === true || asOf) {
      base = lang === 'en' ? '~10m delayed' : '10\uBD84 \uC9C0\uC5F0';
    }
    var badge = formatReturnMetaBadge(lang);
    if (badge && base) return base + ' \u00B7 ' + badge;
    return badge || base;
  }

  function fetchAllCodes(base, codes) {
    var merged = {};
    var asOf = '';
    var regularSession = null;
    var source = '';
    var indices = null;
    var metaFields = null;
    var chain = Promise.resolve();
    for (var i = 0; i < codes.length; i += CHUNK_SIZE) {
      (function (chunk) {
        chain = chain.then(function () {
          var q = 'codes=' + chunk.map(encodeURIComponent).join(',') + '&v=' + QUOTES_API_VERSION;
          return fetchJson(quotesRequestUrl(base, q));
        }).then(function (j) {
          if (j && j.asOf) asOf = j.asOf;
          if (j && j.regularSession != null) regularSession = j.regularSession;
          if (j && j.source) source = j.source;
          if (j && j.indices) {
            indices = j.indices;
            rememberMomentumIndices(j);
          }
          if (j && (j.anchorDd != null || j.numeratorMode != null || j.sessionOpen != null)) {
            metaFields = {
              sessionOpen: j.sessionOpen,
              numeratorMode: j.numeratorMode,
              anchorDd: j.anchorDd,
              refsRecentDd: j.refsRecentDd,
              k: j.k,
              dataVersion: j.dataVersion,
              regularSession: j.regularSession,
            };
          }
          var items = (j && j.items) || {};
          for (var k in items) {
            if (Object.prototype.hasOwnProperty.call(items, k)) merged[k] = items[k];
          }
        });
      })(codes.slice(i, i + CHUNK_SIZE));
    }
    return chain.then(function () {
      var out = {
        asOf: asOf,
        items: merged,
        regularSession: regularSession,
        source: source,
        indices: indices,
      };
      if (metaFields) {
        out.sessionOpen = metaFields.sessionOpen;
        out.numeratorMode = metaFields.numeratorMode;
        out.anchorDd = metaFields.anchorDd;
        out.refsRecentDd = metaFields.refsRecentDd;
        out.k = metaFields.k;
        out.dataVersion = metaFields.dataVersion;
        if (metaFields.regularSession != null) out.regularSession = metaFields.regularSession;
      }
      return out;
    });
  }

  function focusTickerAfterRender() {
    if (global.InvestingMapTabState && InvestingMapTabState.focusTickerAfterTableRender) {
      InvestingMapTabState.focusTickerAfterTableRender();
    } else if (global.InvestingMapTabState && InvestingMapTabState.focusTickerIfPending) {
      InvestingMapTabState.focusTickerIfPending();
    }
  }

  function invokeQuotesReady(onQuotesReady) {
    if (typeof onQuotesReady !== 'function') return;
    try {
      onQuotesReady();
    } catch (e) {}
  }

  function hydrateRsSnapshot(opts) {
    var getCompanies = opts && opts.getCompanies;
    var renderTable = opts && opts.renderTable;
    var onQuotesReady = (opts && opts.onQuotesReady) || function () {};
    return loadRsSnapshot().then(function (snap) {
      rememberMomentumIndices(snap);
      if (getCompanies) {
        mergeRsIntoCompanies(getCompanies(), snap);
      }
      try {
        if (renderTable) renderTable();
      } finally {
        invokeQuotesReady(onQuotesReady);
      }
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
    var onQuotesReady = opts.onQuotesReady || function () {};
    var onAsOf = opts.onAsOf || function () {};
    var onError = opts.onError || function () {};
    var running = false;
    var lastPayload = null;

    if (!base) {
      return hydrateRsSnapshot(opts);
    }

    function applyPayload(j) {
      if (!j) return null;
      lastPayload = j;
      mergeCompanies(getCompanies(), j.items || {});
      rememberReturnMeta(j);
      if (j && j.indices) rememberMomentumIndices(j);
      function finishQuotes() {
        try {
          var pageLang = document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'ko';
          syncReturnMetaBadges(pageLang);
        } catch (e0) {}
        try {
          onAsOf(j.asOf || '', {
            regularSession: j.regularSession,
            sessionOpen: j.sessionOpen,
            numeratorMode: j.numeratorMode,
            anchorDd: j.anchorDd,
            refsRecentDd: j.refsRecentDd,
            k: j.k,
            dataVersion: j.dataVersion,
          });
        } catch (e1) {}
        try {
          if (renderTable) renderTable();
        } finally {
          invokeQuotesReady(onQuotesReady);
        }
        focusTickerAfterRender();
        return j;
      }
      if (quotesResponseCanSkipRsSnapshot(j)) {
        return finishQuotes();
      }
      return loadRsSnapshot().then(function (snap) {
        if (snap && !quotesResponseHasRs(j)) {
          mergeRsIntoCompanies(getCompanies(), snap);
        }
        if (snap) rememberMomentumIndices(snap);
        return finishQuotes();
      });
    }

    function fetchFn() {
      if (running) return Promise.resolve({ data: lastPayload, dataVersion: lastPayload && lastPayload.dataVersion });
      running = true;
      var companies = getCompanies();
      if (!companies || !companies.length) {
        running = false;
        return Promise.resolve({ data: null, dataVersion: '' });
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
        return Promise.resolve({ data: null, dataVersion: '' });
      }
      return fetchAllCodes(base, codes)
        .then(function (j) {
          running = false;
          return { data: j, dataVersion: (j && j.dataVersion) || '' };
        })
        .catch(function (err) {
          running = false;
          try { onError(err || new Error('quotes fetch failed')); } catch (e2) {}
          throw err;
        });
    }

    function renderFn(j) {
      if (!j) return;
      applyPayload(j);
    }

    var Tick = global.InvestingMapReturnsTick;
    if (Tick && Tick.register) {
      Tick.register('quotes', fetchFn, renderFn);
      Tick.start();
      return Tick.forceTick();
    }

    // Fallback without ReturnsTick
    function run() {
      return fetchFn().then(function (res) {
        return applyPayload(res && res.data);
      }).catch(function () {
        return hydrateRsSnapshot(opts);
      });
    }
    var first = run();
    setInterval(function () { run(); }, 60 * 1000);
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
    getReturnMeta: getReturnMeta,
    formatReturnMetaBadge: formatReturnMetaBadge,
    syncReturnMetaBadges: syncReturnMetaBadges,
    getMomentumIndices: getMomentumIndices,
    rememberMomentumIndices: rememberMomentumIndices,
    positionHeaderLabel: positionHeaderLabel,
    emptyQuotesRow: emptyQuotesRow,
    formatQuotesRow: formatQuotesRow,
    formatSpark20Svg: formatSpark20Svg,
  };
})(typeof window !== 'undefined' ? window : globalThis);
