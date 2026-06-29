/**
 * Hub dashboard: sector pulse (mcap-weighted return), top-10 price position, card stats.
 */
(function (global) {
  'use strict';

  var SECTOR_ORDER = ['semi', 'energy', 'ship', 'defense', 'kculture', 'bio', 'robot'];
  var CHUNK_SIZE = 18;
  var hubData = null;
  var quoteItems = {};
  var quotesMeta = { asOf: '', regularSession: null };
  var fxRate = 1400;

  var I18N = {
    ko: {
      pulseTitle: '섹터 퍼포먼스',
      pulseSub: '시총 가중 1년 수익률 (KRX·상장사 합산)',
      pulseColSector: '섹터',
      pulseColReturn: '1년 수익률',
      pulseMcapLabel: '시가총액 합산(비중)',
      pulseColCount: '종목 수',
      topTitle: '주가 위치 Top 10',
      topSub: '52주 구간 대비 현재가 — 전 산업 상장사',
      topViewAll: '지도에서 더 보기',
      loading: '시세 불러오는 중…',
      noData: '—',
      companies: '개 상장사',
      keyPlayers: '대표 종목',
      sessionLive: '실시간',
      sessionClosed: '장마감',
    },
    en: {
      pulseTitle: 'Sector performance',
      pulseSub: 'Market-cap weighted 1Y return (KRX listed names)',
      pulseColSector: 'Sector',
      pulseColReturn: '1Y return',
      pulseMcapLabel: 'Total mcap (weight)',
      pulseColCount: 'Listings',
      topTitle: 'Top 10 price position',
      topSub: 'Last vs 52-week range — all industries',
      topViewAll: 'Browse maps',
      loading: 'Loading quotes…',
      noData: '—',
      companies: ' listings',
      keyPlayers: 'Key names',
      sessionLive: 'Live',
      sessionClosed: 'Closed',
    },
  };

  function pageLang(lang) {
    if (lang === 'en' || lang === 'ko') return lang;
    var l = document.documentElement.getAttribute('lang');
    return l === 'en' ? 'en' : 'ko';
  }

  function t(lang) {
    return I18N[lang] || I18N.ko;
  }

  function normalizeTicker(ticker) {
    if (ticker == null || ticker === '' || ticker === 'UNLISTED') return null;
    var s = String(ticker).trim().toUpperCase();
    if (/^[0-9A-Z]{6}$/.test(s)) return s;
    var alnum = s.replace(/[^0-9A-Z]/g, '');
    if (alnum.length > 6) return alnum.slice(0, 6);
    if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
    if (alnum.length === 6) return alnum;
    return null;
  }

  function injectStyles() {
    if (document.getElementById('im-hub-dashboard-css')) return;
    var css =
      '.hub-sector-pulse{margin-bottom:22px}' +
      '.hub-pulse-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:8px 16px;margin-bottom:12px}' +
      '.hub-pulse-head h2{font-size:16px;font-weight:700;color:var(--text)}' +
      '.hub-pulse-head p{font-size:12px;color:var(--text-muted);margin:0}' +
      '.hub-pulse-session{font-size:11px;font-weight:600;color:var(--accent);padding:4px 10px;border-radius:12px;background:color-mix(in srgb,var(--accent) 12%,var(--surface2));border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border))}' +
      '.hub-pulse-cards{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}' +
      '.hub-pulse-card{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:14px 10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;text-decoration:none;color:inherit;min-width:0;transition:border-color .15s,box-shadow .15s}' +
      '.hub-pulse-card:hover{border-color:var(--accent);box-shadow:0 4px 16px rgba(0,0,0,.12)}' +
      '.hub-pulse-card-sector{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.02em;line-height:1.2;word-break:keep-all}' +
      '.hub-pulse-card-sector .hub-pulse-icon{font-size:20px;line-height:1}' +
      '.hub-pulse-card-ret{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}' +
      '.hub-pulse-card-ret.is-up{color:#3fb950}' +
      '.hub-pulse-card-ret.is-down{color:#f85149}' +
      '.hub-pulse-card-ret.is-flat{color:var(--text-muted)}' +
      '.hub-pulse-spark{display:block;width:100%;max-width:72px;height:24px;margin:0 auto}' +
      '.hub-pulse-mcap-label{font-size:9px;font-weight:600;color:var(--text-muted);letter-spacing:.02em;line-height:1.2}' +
      '.hub-pulse-mcap-val{font-size:11px;font-weight:600;color:var(--text);line-height:1.35;word-break:keep-all}' +
      '.hub-pulse-count{font-size:10px;color:var(--text-muted)}' +
      '.hub-dashboard-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,300px);gap:20px;align-items:start;margin-bottom:24px}' +
      '.hub-side-panel{position:sticky;top:16px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 14px}' +
      '.hub-side-panel h3{font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text)}' +
      '.hub-side-panel .hub-side-sub{font-size:11px;color:var(--text-muted);line-height:1.45;margin-bottom:14px}' +
      '.hub-top-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}' +
      '.hub-top-item{display:block;text-decoration:none;color:inherit;padding:10px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);transition:border-color .15s,background .15s}' +
      '.hub-top-item:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--surface2))}' +
      '.hub-top-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}' +
      '.hub-top-name{font-size:13px;font-weight:700;color:var(--text);line-height:1.3;word-break:keep-all}' +
      '.hub-top-ticker{font-size:11px;color:var(--text-muted);margin-top:2px;font-family:ui-monospace,monospace}' +
      '.hub-top-sector{font-size:10px;font-weight:600;color:var(--accent);margin-top:4px}' +
      '.hub-top-pos{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0}' +
      '.hub-top-pos.is-high{color:#3fb950}' +
      '.hub-top-pos.is-mid{color:#facc15}' +
      '.hub-top-pos.is-low{color:#fca5a5}' +
      '.hub-card-keyplayers{font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4;word-break:keep-all}' +
      '.hub-card-keyplayers strong{color:var(--text);font-weight:600}' +
      '@media (max-width:1200px){.hub-pulse-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}' +
      '@media (max-width:768px){.hub-dashboard-row{grid-template-columns:1fr}.hub-side-panel{position:static}.hub-pulse-cards{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:8px;padding-bottom:4px;-webkit-overflow-scrolling:touch}.hub-pulse-card{flex:0 0 132px}}';
    var el = document.createElement('style');
    el.id = 'im-hub-dashboard-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function loadHubIndex() {
    if (hubData) return Promise.resolve(hubData);
    return fetch('data/hub_index.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('hub_index');
        return r.json();
      })
      .then(function (j) {
        hubData = j;
        return j;
      });
  }

  function getApiBase() {
    if (global.InvestingMapLiveQuotes && InvestingMapLiveQuotes.getApiBase) {
      return InvestingMapLiveQuotes.getApiBase();
    }
    return '/api/quotes';
  }

  function quotesUrl(base, query) {
    var q = query.charAt(0) === '?' ? query : '?' + query;
    if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + q;
    var origin = window.location && window.location.origin ? window.location.origin : '';
    var path = base.charAt(0) === '/' ? base : '/' + base;
    return origin + path.replace(/\/+$/, '') + q;
  }

  function fetchAllQuotes(codes) {
    var base = getApiBase();
    if (!base || !codes.length) return Promise.resolve({ items: {}, asOf: '', regularSession: null });
    var merged = {};
    var asOf = '';
    var regularSession = null;
    var chain = Promise.resolve();
    for (var i = 0; i < codes.length; i += CHUNK_SIZE) {
      (function (chunk) {
        chain = chain.then(function () {
          var q = 'codes=' + chunk.map(encodeURIComponent).join(',') + '&warm=1';
          return fetch(quotesUrl(base, q), { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
            return r.json();
          });
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
      return { items: merged, asOf: asOf, regularSession: regularSession };
    });
  }

  function allCompaniesFlat() {
    if (!hubData || !hubData.sectors) return [];
    var out = [];
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block || !block.companies) return;
      block.companies.forEach(function (c) {
        out.push({
          ticker: c.ticker,
          name: c.name,
          nameEn: c.nameEn,
          mcapWon: c.mcapWon,
          market: c.market,
          sectorId: sid,
          mapPath: block.meta && block.meta.map,
        });
      });
    });
    return out;
  }

  function weightedSectorReturn(companies, items) {
    var totalMcap = 0;
    var weighted = 0;
    var used = 0;
    companies.forEach(function (c) {
      var key = normalizeTicker(c.ticker);
      if (!key) return;
      var q = items[key];
      var ret = q && typeof q.yoyReturnPct === 'number' && isFinite(q.yoyReturnPct) ? q.yoyReturnPct : null;
      if (ret == null) return;
      var mcap = (q && q.mcapWon > 0) ? q.mcapWon : c.mcapWon;
      if (!mcap) return;
      totalMcap += mcap;
      weighted += mcap * ret;
      used++;
    });
    if (totalMcap <= 0) return { pct: null, used: used };
    return { pct: weighted / totalMcap, used: used };
  }

  function formatMcapWithWeight(won, weightPct, lang) {
    var weight = weightPct.toFixed(1) + '%';
    if (won == null || !isFinite(won) || won <= 0) return I18N[lang].noData;
    if (lang === 'en') {
      var rate = fxRate > 0 ? fxRate : 1400;
      var billions = (won / rate) / 1e9;
      return billions.toFixed(2) + 'B (' + weight + ')';
    }
    var trimmed = Math.round(won / 1e10) * 1e10;
    return (trimmed / 1e12).toFixed(2) + '\uC870\uC6D0 (' + weight + ')';
  }

  function loadFx() {
    return fetch('data/fx_usdkrw.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && typeof j.rate === 'number' && j.rate > 0) fxRate = j.rate;
      })
      .catch(function () {});
  }

  function formatPct(n, lang) {
    if (n == null || !isFinite(n)) return I18N[lang].noData;
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  }

  function sparklineSvg(pct) {
    var up = pct != null && pct >= 0;
    var color = pct == null ? '#8b949e' : up ? '#3fb950' : '#f85149';
    var pts = up
      ? '2,18 10,14 18,16 26,10 34,12 42,6 50,8 54,4'
      : '2,6 10,10 18,8 26,14 34,12 42,16 50,14 54,18';
    return '<svg class="hub-pulse-spark" viewBox="0 0 56 22" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.8" points="' + pts + '"/></svg>';
  }

  function totalMarketMcap() {
    var sum = 0;
    allCompaniesFlat().forEach(function (c) {
      sum += c.mcapWon || 0;
    });
    return sum;
  }

  function renderPulse(lang) {
    var wrap = document.getElementById('hub-sector-pulse-body');
    if (!wrap || !hubData) return;
    var labels = t(lang);
    var totalMcap = totalMarketMcap();
    var ql = '?lang=' + encodeURIComponent(lang);
    var cards = SECTOR_ORDER.map(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return '';
      var meta = block.meta || {};
      var label = lang === 'en' ? meta.en : meta.ko;
      var ret = weightedSectorReturn(block.companies, quoteItems);
      var sectorMcap = block.companies.reduce(function (s, c) { return s + (c.mcapWon || 0); }, 0);
      var weightPct = totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0;
      var cls = 'hub-pulse-card-ret is-flat';
      if (ret.pct != null) cls = ret.pct > 0 ? 'hub-pulse-card-ret is-up' : ret.pct < 0 ? 'hub-pulse-card-ret is-down' : 'hub-pulse-card-ret is-flat';
      var href = (meta.map || 'index.html') + ql;
      var countLabel = block.companies.length + (lang === 'en' ? '' : '\uAC1C');
      return '<a class="hub-pulse-card" href="' + href + '">' +
        '<div class="hub-pulse-card-sector"><span class="hub-pulse-icon" aria-hidden="true">' + (meta.icon || '') + '</span><span>' + label + '</span></div>' +
        '<div class="' + cls + '">' + formatPct(ret.pct, lang) + '</div>' +
        sparklineSvg(ret.pct) +
        '<div class="hub-pulse-mcap-label">' + labels.pulseMcapLabel + '</div>' +
        '<div class="hub-pulse-mcap-val">' + formatMcapWithWeight(sectorMcap, weightPct, lang) + '</div>' +
        '<div class="hub-pulse-count">' + countLabel + '</div>' +
        '</a>';
    }).join('');

    wrap.innerHTML = '<div class="hub-pulse-cards">' + cards + '</div>';

    var sess = document.getElementById('hub-pulse-session');
    if (sess) {
      if (quotesMeta.regularSession === true) sess.textContent = labels.sessionLive;
      else if (quotesMeta.regularSession === false) sess.textContent = labels.sessionClosed;
      else sess.textContent = '';
    }
  }

  function resolvePosition(c, q) {
    var LQ = global.InvestingMapLiveQuotes;
    if (LQ && LQ.calcQuotePosition) {
      var last = q && q.last != null ? q.last : null;
      var hi = q && q.high52w != null ? q.high52w : null;
      var lo = q && q.low52w != null ? q.low52w : null;
      return LQ.calcQuotePosition(last, hi, lo);
    }
    return null;
  }

  function shouldHide(q) {
    if (!q) return true;
    return q.last === 0 || q.high52w === 0 || q.low52w === 0;
  }

  function formatPosition(n) {
    if (n == null || !isFinite(n)) return I18N.ko.noData;
    if (n === 100) return '100%';
    if (n === 0) return '0%';
    return n.toFixed(1) + '%';
  }

  function positionClass(n) {
    if (n == null || !isFinite(n)) return '';
    if (n >= 80) return 'is-high';
    if (n >= 50) return 'is-mid';
    return 'is-low';
  }

  function renderTop10(lang) {
    var list = document.getElementById('hub-top-position-list');
    if (!list) return;
    var labels = t(lang);
    var ql = '?lang=' + encodeURIComponent(lang);
    var ranked = allCompaniesFlat()
      .map(function (c) {
        var key = normalizeTicker(c.ticker);
        var q = key ? quoteItems[key] : null;
        if (shouldHide(q)) return null;
        var pos = resolvePosition(c, q);
        if (pos == null) return null;
        return { c: c, pos: pos };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.pos - a.pos; })
      .slice(0, 10);

    if (!ranked.length) {
      list.innerHTML = '<li style="font-size:12px;color:var(--text-muted)">' + labels.loading + '</li>';
      return;
    }

    list.innerHTML = ranked.map(function (row, i) {
      var c = row.c;
      var name = lang === 'en' ? (c.nameEn || c.name) : c.name;
      var sectorMeta = hubData.sectors[c.sectorId] && hubData.sectors[c.sectorId].meta;
      var sectorLabel = sectorMeta ? (lang === 'en' ? sectorMeta.en : sectorMeta.ko) : '';
      var href = (c.mapPath || 'index.html') + ql;
      return '<li><a class="hub-top-item" href="' + href + '">' +
        '<div class="hub-top-row">' +
        '<div><div class="hub-top-name">' + name + '</div>' +
        '<div class="hub-top-ticker">' + c.ticker + '</div>' +
        (sectorLabel ? '<div class="hub-top-sector">' + sectorLabel + '</div>' : '') +
        '</div>' +
        '<span class="hub-top-pos ' + positionClass(row.pos) + '">' + formatPosition(row.pos) + '</span>' +
        '</div></a></li>';
    }).join('');
  }

  function enhanceCards(lang) {
    if (!hubData) return;
    var labels = t(lang);
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      var top = block.companies.slice(0, 3).map(function (c) {
        return lang === 'en' ? (c.nameEn || c.name) : c.name;
      });
      var el = document.getElementById('card-' + sid + '-keyplayers');
      if (el) {
        el.innerHTML = '<strong>' + labels.keyPlayers + ':</strong> ' + top.join(', ');
      }
      var badge = document.getElementById('card-' + sid + '-badge');
      if (badge) {
        var n = block.companies.length;
        badge.textContent = lang === 'en'
          ? n + ' LISTINGS'
          : n + labels.companies;
      }
    });
  }

  function renderLabels(lang) {
    var labels = t(lang);
    var set = function (id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('hub-pulse-title', labels.pulseTitle);
    set('hub-pulse-sub', labels.pulseSub);
    set('hub-top-title', labels.topTitle);
    set('hub-top-sub', labels.topSub);
  }

  function init(lang) {
    injectStyles();
    lang = pageLang(lang);
    Promise.all([loadHubIndex(), loadFx()])
      .then(function () {
        renderLabels(lang);
        enhanceCards(lang);
        return fetchQuotesAndRender(lang);
      })
      .catch(function () {});
  }

  function onLangChange(lang) {
    lang = pageLang(lang);
    renderLabels(lang);
    enhanceCards(lang);
    renderPulse(lang);
    renderTop10(lang);
  }

  function fetchQuotesAndRender(lang) {
    var codes = [];
    var seen = {};
    allCompaniesFlat().forEach(function (c) {
      var k = normalizeTicker(c.ticker);
      if (!k || seen[k]) return;
      seen[k] = 1;
      codes.push(k);
    });
    if (!codes.length) {
      renderPulse(lang);
      renderTop10(lang);
      return Promise.resolve();
    }
    return fetchAllQuotes(codes).then(function (j) {
      quoteItems = j.items || {};
      quotesMeta.asOf = j.asOf || '';
      quotesMeta.regularSession = j.regularSession;
      renderPulse(lang);
      renderTop10(lang);
    }).catch(function () {
      renderPulse(lang);
      renderTop10(lang);
    });
  }

  global.InvestingMapHubDashboard = {
    init: init,
    refresh: onLangChange,
    loadHubIndex: loadHubIndex,
  };

  if (document.getElementById('hub-sector-pulse')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
