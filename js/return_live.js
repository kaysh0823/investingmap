/**
 * Live return helpers (browser) — see lib/return_live.mjs
 */
(function (global) {
  'use strict';

  var KST_TZ = 'Asia/Seoul';

  function kstDateParts(now) {
    now = now || new Date();
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: KST_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    var parts = fmt.formatToParts(now);
    function get(type) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === type) return parts[i].value;
      }
      return '';
    }
    return {
      year: parseInt(get('year'), 10),
      month: parseInt(get('month'), 10),
      day: parseInt(get('day'), 10),
    };
  }

  function kstYmd(now) {
    var p = kstDateParts(now);
    var m = String(p.month).padStart(2, '0');
    var d = String(p.day).padStart(2, '0');
    return '' + p.year + m + d;
  }

  function isRecentDdStale(recentDd, now) {
    if (!recentDd || typeof recentDd !== 'string') return false;
    return recentDd < kstYmd(now);
  }

  function calcReturnPct(now, past) {
    if (now == null || past == null || past <= 0) return null;
    if (!isFinite(now) || !isFinite(past)) return null;
    return ((now / past) - 1) * 100;
  }

  function calcLiveChg1dPct(liveLast, refClose) {
    var ret = calcReturnPct(liveLast, refClose);
    return ret != null ? Math.round(ret * 100) / 100 : null;
  }

  function calcLiveMcapWon(refMcap, liveLast, refClose) {
    if (refMcap == null || liveLast == null || refClose == null) return null;
    if (!isFinite(refMcap) || !isFinite(liveLast) || !isFinite(refClose)) return null;
    if (refMcap <= 0 || refClose <= 0 || liveLast <= 0) return null;
    return refMcap * (liveLast / refClose);
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

  function sectorReturnMcapRatio(companies, mcapNow, mcapPast) {
    var sumNow = 0;
    var sumPast = 0;
    var getNow = typeof mcapNow === 'function' ? mcapNow : function (code) { return mcapNow.get(code); };
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var key = normalizeTicker(c.ticker);
      if (!key) continue;
      var now = getNow(key);
      var past = mcapPast.get(key);
      if (now == null || past == null || !isFinite(now) || !isFinite(past) || now <= 0 || past <= 0) {
        continue;
      }
      sumNow += now;
      sumPast += past;
    }
    if (sumPast <= 0) return null;
    return ((sumNow / sumPast) - 1) * 100;
  }

  function past1dMcapMapFromSnap(snap) {
    var out = new Map();
    var quotes = (snap && snap.quotes) || {};
    for (var code in quotes) {
      if (!Object.prototype.hasOwnProperty.call(quotes, code)) continue;
      var row = quotes[code];
      if (row && typeof row.past1dMcap === 'number' && row.past1dMcap > 0) {
        out.set(code, row.past1dMcap);
      }
    }
    return out;
  }

  global.InvestingMapReturnLive = {
    kstYmd: kstYmd,
    isRecentDdStale: isRecentDdStale,
    calcReturnPct: calcReturnPct,
    calcLiveChg1dPct: calcLiveChg1dPct,
    calcLiveMcapWon: calcLiveMcapWon,
    normalizeTicker: normalizeTicker,
    sectorReturnMcapRatio: sectorReturnMcapRatio,
    past1dMcapMapFromSnap: past1dMcapMapFromSnap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
