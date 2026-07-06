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
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    var parts = fmt.formatToParts(now);
    function get(type) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === type) return parts[i].value;
      }
      return '';
    }
    var wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: parseInt(get('year'), 10),
      month: parseInt(get('month'), 10),
      day: parseInt(get('day'), 10),
      weekday: wdMap[get('weekday')] != null ? wdMap[get('weekday')] : 0,
      hour: parseInt(get('hour'), 10),
      minute: parseInt(get('minute'), 10),
    };
  }

  var SESSION_OPEN = 9 * 60;
  var SESSION_CLOSE = 15 * 60 + 30;

  function isKrxRegularSession(now) {
    var p = kstDateParts(now);
    var minutes = p.hour * 60 + p.minute;
    return p.weekday >= 1 && p.weekday <= 5 && minutes >= SESSION_OPEN && minutes <= SESSION_CLOSE;
  }

  function kstYmd(now) {
    var p = kstDateParts(now);
    var m = String(p.month).padStart(2, '0');
    var d = String(p.day).padStart(2, '0');
    return '' + p.year + m + d;
  }

  function kstAnchorYmd(now) {
    var p = kstDateParts(now);
    if (p.weekday >= 1 && p.weekday <= 5) return kstYmd(now);
    for (var i = 1; i <= 7; i++) {
      var dt = new Date(now.getTime() - i * 86400000);
      var wd = kstDateParts(dt).weekday;
      if (wd >= 1 && wd <= 5) return kstYmd(dt);
    }
    return kstYmd(now);
  }

  function ymdToDash(ymd) {
    if (!ymd || ymd.length !== 8) return ymd || '';
    return ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8);
  }

  function isRecentDdStale(recentDd, now) {
    if (!recentDd || typeof recentDd !== 'string') return false;
    return recentDd < kstAnchorYmd(now);
  }

  function shouldUseLive1dReturns(recentDd, now) {
    if (!recentDd || typeof recentDd !== 'string') return true;
    return recentDd <= kstAnchorYmd(now);
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

  function calcLiveRetFromSnapPct(liveLast, refClose, snapRetPct) {
    if (snapRetPct == null || !isFinite(snapRetPct)) return null;
    if (refClose == null || refClose <= 0 || liveLast == null) return null;
    var pastClose = refClose / (1 + snapRetPct / 100);
    var ret = calcReturnPct(liveLast, pastClose);
    return ret != null ? Math.round(ret * 100) / 100 : null;
  }

  function pastMcapFromSnapRet(refMcap, snapRetPct) {
    if (refMcap == null || snapRetPct == null) return null;
    if (!isFinite(refMcap) || !isFinite(snapRetPct) || refMcap <= 0) return null;
    var denom = 1 + snapRetPct / 100;
    if (denom <= 0) return null;
    return refMcap / denom;
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

  function pastMcapMapFromSnapRet(snap, retField) {
    var out = new Map();
    var quotes = (snap && snap.quotes) || {};
    for (var code in quotes) {
      if (!Object.prototype.hasOwnProperty.call(quotes, code)) continue;
      var row = quotes[code];
      var past = pastMcapFromSnapRet(row && row.refMcap, row && row[retField]);
      if (past != null && past > 0) out.set(code, past);
    }
    return out;
  }

  global.InvestingMapReturnLive = {
    kstYmd: kstYmd,
    kstAnchorYmd: kstAnchorYmd,
    ymdToDash: ymdToDash,
    isKrxRegularSession: isKrxRegularSession,
    isKrxRegularSession: isKrxRegularSession,
    isRecentDdStale: isRecentDdStale,
    shouldUseLive1dReturns: shouldUseLive1dReturns,
    calcReturnPct: calcReturnPct,
    calcLiveChg1dPct: calcLiveChg1dPct,
    calcLiveRetFromSnapPct: calcLiveRetFromSnapPct,
    pastMcapFromSnapRet: pastMcapFromSnapRet,
    calcLiveMcapWon: calcLiveMcapWon,
    normalizeTicker: normalizeTicker,
    sectorReturnMcapRatio: sectorReturnMcapRatio,
    past1dMcapMapFromSnap: past1dMcapMapFromSnap,
    pastMcapMapFromSnapRet: pastMcapMapFromSnapRet,
  };
})(typeof window !== 'undefined' ? window : globalThis);
