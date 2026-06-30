/**
 * Hub dashboard: sector pulse (mcap-weighted return), top-10 price position, card stats.
 */
(function (global) {
  'use strict';

  var SECTOR_ORDER = ['semi', 'energy', 'ship', 'defense', 'kculture', 'bio', 'robot'];
  var PULSE_HORIZONS = [
    { retKey: 'yoyReturnPct', labelKey: 'pulseRow1y' },
    { retKey: 'return6mPct', labelKey: 'pulseRow6m' },
    { retKey: 'return3mPct', labelKey: 'pulseRow3m' },
  ];
  var pulseHorizonKey = 'yoyReturnPct';
  var PULSE_HORIZON_KEY = 'im-hub-pulse-horizon';
  var HUB_API_TIMEOUT_MS = 90000;
  var HUB_API_RETRIES = 2;
  var HUB_API_RETRY_DELAY_MS = 2500;
  var SWR_KEY = 'im-hub-dashboard-v3';
  var SWR_TTL_MS = 30 * 60 * 1000;
  var hubData = null;
  var dashboardData = { sectors: {}, top10: [], regularSession: null };
  var sectorsLoading = false;
  var top10Loading = false;
  var sectorsFailed = false;
  var top10Failed = false;
  var fxRate = 1400;

  var I18N = {
    ko: {
      pulseTitle: '섹터 퍼포먼스',
      pulseSub: '시총 합산 수익률 (최근 종가 시총 ÷ 과거 시총) — 1년·6개월·3개월',
      pulseRow1y: '1년',
      pulseRow6m: '6개월',
      pulseRow3m: '3개월',
      pulseColSector: '섹터',
      pulseColReturn: '1년 수익률',
      pulseMcapLabel: '시가총액 합산(비중)',
      pulseColCount: '종목 수',
      pulseLoading: '로딩중…',
      pulseStatusLoading: '계산 중…',
      topTitle: '주가 위치 Top 10',
      topSub: '52주 구간 대비 현재가 — 전 산업 상장사',
      topViewAll: '지도에서 더 보기',
      loading: '시세 불러오는 중…',
      quotesFailed: '시세를 불러오지 못했습니다.',
      noData: '—',
      companies: '개 상장사',
      keyPlayers: '대표 종목',
      sessionLive: '실시간',
      sessionClosed: '장마감',
    },
    en: {
      pulseTitle: 'Sector performance',
      pulseSub: 'Mcap-sum return (recent ÷ past mcap) — 1Y, 6M, 3M',
      pulseRow1y: '1 year',
      pulseRow6m: '6 months',
      pulseRow3m: '3 months',
      pulseColSector: 'Sector',
      pulseColReturn: '1Y return',
      pulseMcapLabel: 'Total mcap (weight)',
      pulseColCount: 'Listings',
      pulseLoading: 'Loading…',
      pulseStatusLoading: 'Calculating…',
      topTitle: 'Top 10 price position',
      topSub: 'Last vs 52-week range — all industries',
      topViewAll: 'Browse maps',
      loading: 'Loading quotes…',
      quotesFailed: 'Could not load quotes.',
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

  function injectStyles() {
    if (document.getElementById('im-hub-dashboard-css-v6')) return;
    var css =
      '.hub-sector-pulse{margin-bottom:22px}' +
      '.hub-pulse-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:8px 16px;margin-bottom:12px}' +
      '.hub-pulse-head h2{font-size:16px;font-weight:700;color:var(--text)}' +
      '.hub-pulse-head p{font-size:12px;color:var(--text-muted);margin:0}' +
      '.hub-pulse-head-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.hub-pulse-session{font-size:11px;font-weight:600;color:var(--accent);padding:4px 10px;border-radius:12px;background:color-mix(in srgb,var(--accent) 12%,var(--surface2));border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border))}' +
      '.hub-pulse-loading-badge{font-size:11px;font-weight:600;color:var(--text-muted);padding:4px 10px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);animation:hub-pulse-blink 1.2s ease-in-out infinite}' +
      '@keyframes hub-pulse-blink{0%,100%{opacity:1}50%{opacity:.45}}' +
      '.hub-pulse-toolbar{margin-bottom:10px}' +
      '.hub-pulse-tabs{display:flex;flex-wrap:wrap;gap:6px}' +
      '.hub-pulse-tab{font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;font-family:inherit;line-height:1.2;transition:border-color .15s,background .15s,color .15s}' +
      '.hub-pulse-tab:hover:not(.is-active){border-color:color-mix(in srgb,var(--text-muted) 50%,var(--border));color:var(--text)}' +
      '.hub-pulse-tab.is-active{background:color-mix(in srgb,var(--accent) 14%,var(--surface2));border-color:var(--accent);color:var(--accent)}' +
      '.hub-pulse-cards{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}' +
      '.hub-pulse-card{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:14px 10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;text-decoration:none;color:inherit;min-width:0;transition:border-color .15s,box-shadow .15s}' +
      '.hub-pulse-card:hover{border-color:var(--accent);box-shadow:0 4px 16px rgba(0,0,0,.12)}' +
      '.hub-pulse-card-sector{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.02em;line-height:1.2;word-break:keep-all}' +
      '.hub-pulse-card-sector .hub-pulse-icon{font-size:20px;line-height:1}' +
      '.hub-pulse-card-ret{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}' +
      '.hub-pulse-card-ret.is-up{color:#3fb950}' +
      '.hub-pulse-card-ret.is-down{color:#f85149}' +
      '.hub-pulse-card-ret.is-flat{color:var(--text-muted)}' +
      '.hub-pulse-card-ret.is-loading{font-size:12px;font-weight:600;color:var(--text-muted)}' +
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
      '@media (max-width:768px){.hub-dashboard-row{grid-template-columns:1fr}.hub-side-panel{position:static}.hub-pulse-cards{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:8px;padding-bottom:4px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory}.hub-pulse-card{flex:0 0 132px;scroll-snap-align:start}}';
    var el = document.createElement('style');
    el.id = 'im-hub-dashboard-css-v6';
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

  function hubApiEnabled() {
    if (typeof window === 'undefined' || !window.location || !window.location.protocol) return false;
    return window.location.protocol.indexOf('http') === 0;
  }

  function hubApiUrl(path) {
    var meta = document.querySelector('meta[name="investingmap-hub-api"]');
    var custom = meta && meta.getAttribute('content') ? String(meta.getAttribute('content')).trim() : '';
    var base = custom ? custom.replace(/\/+$/, '') : (hubApiEnabled() ? '' : '');
    if (!base && !hubApiEnabled()) return '';
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    var bust = sep + '_v=3';
    return (base || '') + path + bust;
  }

  function fetchWithTimeout(url, ms, acceptPartial) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var tid = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, ms);
      fetch(url, { cache: 'default', credentials: 'same-origin' })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) {
              if (acceptPartial && j && ((j.sectors && Object.keys(j.sectors).length) || (j.top10 && j.top10.length))) {
                return j;
              }
              throw new Error('hub_api_' + r.status);
            }
            return j;
          });
        })
        .then(function (j) {
          if (done) return;
          done = true;
          clearTimeout(tid);
          resolve(j);
        })
        .catch(function (err) {
          if (done) return;
          done = true;
          clearTimeout(tid);
          reject(err);
        });
    });
  }

  function fetchWithRetry(url, ms, retriesLeft, acceptPartial) {
    return fetchWithTimeout(url, ms, acceptPartial).catch(function (err) {
      if (retriesLeft <= 0) throw err;
      return new Promise(function (resolve) {
        setTimeout(resolve, HUB_API_RETRY_DELAY_MS);
      }).then(function () {
        return fetchWithRetry(url, ms, retriesLeft - 1, acceptPartial);
      });
    });
  }

  function readSwr() {
    try {
      var raw = sessionStorage.getItem(SWR_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.t || Date.now() - d.t > SWR_TTL_MS) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  function writeSwr() {
    try {
      sessionStorage.setItem(SWR_KEY, JSON.stringify({
        t: Date.now(),
        sectors: dashboardData.sectors || {},
        top10: dashboardData.top10 || [],
        regularSession: dashboardData.regularSession,
      }));
    } catch (e) { /* ignore */ }
  }

  function localSectorStats() {
    var out = {};
    if (!hubData) return out;
    var totalMcap = 0;
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      totalMcap += block.companies.reduce(function (s, c) { return s + (c.mcapWon || 0); }, 0);
    });
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      var sectorMcap = block.companies.reduce(function (s, c) { return s + (c.mcapWon || 0); }, 0);
      out[sid] = {
        mcapWon: sectorMcap,
        weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
        listingCount: block.companies.length,
        yoyReturnPct: null,
        return6mPct: null,
        return3mPct: null,
      };
    });
    return out;
  }

  function loadFx() {
    return fetch('data/fx_usdkrw.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && typeof j.rate === 'number' && j.rate > 0) fxRate = j.rate;
      })
      .catch(function () {});
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

  function formatPct(n, lang) {
    if (n == null || !isFinite(n)) return I18N[lang].noData;
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  }

  function sparklineSvg(pct, loading) {
    if (loading) {
      return '<svg class="hub-pulse-spark" viewBox="0 0 56 22" aria-hidden="true">' +
        '<polyline fill="none" stroke="#8b949e" stroke-width="1.8" stroke-dasharray="3 3" points="2,11 54,11"/></svg>';
    }
    var up = pct != null && pct >= 0;
    var color = pct == null ? '#8b949e' : up ? '#3fb950' : '#f85149';
    var pts = up
      ? '2,18 10,14 18,16 26,10 34,12 42,6 50,8 54,4'
      : '2,6 10,10 18,8 26,14 34,12 42,16 50,14 54,18';
    return '<svg class="hub-pulse-spark" viewBox="0 0 56 22" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.8" points="' + pts + '"/></svg>';
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

  function readPulseHorizon() {
    try {
      var k = sessionStorage.getItem(PULSE_HORIZON_KEY);
      if (k && PULSE_HORIZONS.some(function (h) { return h.retKey === k; })) {
        pulseHorizonKey = k;
      }
    } catch (e) { /* ignore */ }
  }

  function savePulseHorizon(key) {
    pulseHorizonKey = key;
    try { sessionStorage.setItem(PULSE_HORIZON_KEY, key); } catch (e) { /* ignore */ }
  }

  function buildPulseTabs(lang) {
    var labels = t(lang);
    return '<div class="hub-pulse-toolbar">' +
      '<div class="hub-pulse-tabs" role="tablist" aria-label="' + labels.pulseTitle + '">' +
      PULSE_HORIZONS.map(function (h) {
        var active = h.retKey === pulseHorizonKey;
        return '<button type="button" class="hub-pulse-tab' + (active ? ' is-active' : '') + '"' +
          ' role="tab" aria-selected="' + (active ? 'true' : 'false') + '"' +
          ' data-horizon="' + h.retKey + '">' + labels[h.labelKey] + '</button>';
      }).join('') +
      '</div></div>';
  }

  function bindPulseTabs(wrap, lang) {
    if (!wrap) return;
    var tabs = wrap.querySelectorAll('.hub-pulse-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var key = this.getAttribute('data-horizon');
        if (!key || key === pulseHorizonKey) return;
        savePulseHorizon(key);
        renderPulse(lang);
      });
    }
  }

  function buildPulseCards(lang, sectors, local, retKey) {
    var labels = t(lang);
    var ql = '?lang=' + encodeURIComponent(lang);
    return SECTOR_ORDER.map(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return '';
      var meta = block.meta || {};
      var label = lang === 'en' ? meta.en : meta.ko;
      var pulse = sectors[sid] || local[sid] || {};
      var retPct = pulse[retKey] != null ? pulse[retKey] : null;
      var sectorMcap = pulse.mcapWon != null ? pulse.mcapWon :
        block.companies.reduce(function (s, c) { return s + (c.mcapWon || 0); }, 0);
      var weightPct = pulse.weightPct != null ? pulse.weightPct : (local[sid] ? local[sid].weightPct : 0);
      var isLoading = sectorsLoading && retPct == null;
      var cls = 'hub-pulse-card-ret is-flat';
      var retText;
      if (isLoading) {
        cls = 'hub-pulse-card-ret is-loading';
        retText = labels.pulseLoading;
      } else {
        if (retPct != null) cls = retPct > 0 ? 'hub-pulse-card-ret is-up' : retPct < 0 ? 'hub-pulse-card-ret is-down' : 'hub-pulse-card-ret is-flat';
        retText = formatPct(retPct, lang);
      }
      var href = (meta.map || 'index.html') + ql;
      var countLabel = (pulse.listingCount != null ? pulse.listingCount : block.companies.length) +
        (lang === 'en' ? '' : '\uAC1C');
      var mcapBlock =
        '<div class="hub-pulse-mcap-label">' + labels.pulseMcapLabel + '</div>' +
        '<div class="hub-pulse-mcap-val">' + formatMcapWithWeight(sectorMcap, weightPct, lang) + '</div>' +
        '<div class="hub-pulse-count">' + countLabel + '</div>';
      return '<a class="hub-pulse-card" href="' + href + '">' +
        '<div class="hub-pulse-card-sector"><span class="hub-pulse-icon" aria-hidden="true">' + (meta.icon || '') + '</span><span>' + label + '</span></div>' +
        '<div class="' + cls + '">' + retText + '</div>' +
        sparklineSvg(retPct, isLoading) +
        mcapBlock +
        '</a>';
    }).join('');
  }

  function renderPulse(lang) {
    var wrap = document.getElementById('hub-sector-pulse-body');
    if (!wrap || !hubData) return;
    var labels = t(lang);
    var local = localSectorStats();
    var sectors = dashboardData && dashboardData.sectors ? dashboardData.sectors : {};
    var cards = buildPulseCards(lang, sectors, local, pulseHorizonKey);

    wrap.innerHTML =
      buildPulseTabs(lang) +
      '<div class="hub-pulse-cards" role="tabpanel">' + cards + '</div>';

    bindPulseTabs(wrap, lang);

    var statusWrap = document.getElementById('hub-pulse-status');
    if (statusWrap) {
      var parts = [];
      if (sectorsLoading) {
        parts.push('<span class="hub-pulse-loading-badge">' + labels.pulseStatusLoading + '</span>');
      }
      if (dashboardData && dashboardData.regularSession === true) {
        parts.push('<span class="hub-pulse-session">' + labels.sessionLive + '</span>');
      } else if (dashboardData && dashboardData.regularSession === false) {
        parts.push('<span class="hub-pulse-session">' + labels.sessionClosed + '</span>');
      }
      statusWrap.innerHTML = parts.join('');
    }
  }

  function renderTop10(lang) {
    var list = document.getElementById('hub-top-position-list');
    if (!list) return;
    var labels = t(lang);
    var ql = '?lang=' + encodeURIComponent(lang);
    var ranked = dashboardData && dashboardData.top10 ? dashboardData.top10 : [];

    if (!ranked.length) {
      var msg = top10Loading ? labels.loading : labels.quotesFailed;
      list.innerHTML = '<li class="hub-top-loading" style="font-size:12px;color:var(--text-muted)">' + msg + '</li>';
      return;
    }

    list.innerHTML = ranked.map(function (row) {
      var name = lang === 'en' ? (row.nameEn || row.name) : row.name;
      var sectorMeta = hubData.sectors[row.sectorId] && hubData.sectors[row.sectorId].meta;
      var sectorLabel = sectorMeta ? (lang === 'en' ? sectorMeta.en : sectorMeta.ko) : '';
      var href = (row.mapPath || 'index.html') + ql;
      return '<li><a class="hub-top-item" href="' + href + '">' +
        '<div class="hub-top-row">' +
        '<div><div class="hub-top-name">' + name + '</div>' +
        '<div class="hub-top-ticker">' + row.ticker + '</div>' +
        (sectorLabel ? '<div class="hub-top-sector">' + sectorLabel + '</div>' : '') +
        '</div>' +
        '<span class="hub-top-pos ' + positionClass(row.positionPct) + '">' + formatPosition(row.positionPct) + '</span>' +
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

  function applySectorsPayload(j) {
    if (!j || j.error) return;
    dashboardData.sectors = j.sectors || dashboardData.sectors;
    if (j.regularSession != null) dashboardData.regularSession = j.regularSession;
  }

  function applyTop10Payload(j) {
    if (!j || j.error) return;
    dashboardData.top10 = j.top10 || dashboardData.top10;
    if (j.regularSession != null) dashboardData.regularSession = j.regularSession;
  }

  function fetchSectors(lang) {
    var url = hubApiUrl('/api/hub_sectors');
    if (!url) {
      sectorsLoading = false;
      renderPulse(lang);
      return Promise.resolve();
    }
    sectorsLoading = true;
    sectorsFailed = false;
    renderPulse(lang);
    return fetchWithRetry(url, HUB_API_TIMEOUT_MS, HUB_API_RETRIES, true)
      .then(function (j) {
        if (j && j.error) throw new Error(j.error);
        applySectorsPayload(j);
        var ok = j.sectors && Object.values(j.sectors).some(function (s) {
          return s && s.return6mPct != null && s.return3mPct != null;
        });
        if (!ok) throw new Error('hub_sectors_incomplete');
        writeSwr();
      })
      .catch(function () {
        sectorsFailed = true;
      })
      .then(function () {
        sectorsLoading = false;
        renderPulse(lang);
      });
  }

  function fetchTop10(lang) {
    var url = hubApiUrl('/api/hub_top10');
    if (!url) {
      top10Loading = false;
      renderTop10(lang);
      return Promise.resolve();
    }
    top10Loading = true;
    top10Failed = false;
    renderTop10(lang);
    return fetchWithRetry(url, HUB_API_TIMEOUT_MS, HUB_API_RETRIES, true)
      .then(function (j) {
        if (j && j.error) throw new Error(j.error);
        applyTop10Payload(j);
      })
      .catch(function () {
        top10Failed = true;
      })
      .then(function () {
        top10Loading = false;
        if (dashboardData.top10 && dashboardData.top10.length) writeSwr();
        renderTop10(lang);
      });
  }

  function fetchDashboardAndRender(lang) {
    return Promise.all([fetchSectors(lang), fetchTop10(lang)]).then(function () {
      if (!sectorsFailed || !top10Failed) writeSwr();
      renderPulse(lang);
      renderTop10(lang);
    });
  }

  function init(lang) {
    injectStyles();
    lang = pageLang(lang);
    readPulseHorizon();
    Promise.all([loadHubIndex(), loadFx()])
      .then(function () {
        var swr = readSwr();
        if (swr) {
          dashboardData.sectors = swr.sectors || {};
          dashboardData.top10 = swr.top10 || [];
          dashboardData.regularSession = swr.regularSession;
        }
        renderLabels(lang);
        enhanceCards(lang);
        renderPulse(lang);
        renderTop10(lang);
        sectorsLoading = true;
        top10Loading = true;
        renderPulse(lang);
        renderTop10(lang);
        return fetchDashboardAndRender(lang);
      })
      .catch(function (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[hub_dashboard] init failed', err);
        }
      });
  }

  function onLangChange(lang) {
    lang = pageLang(lang);
    readPulseHorizon();
    renderLabels(lang);
    enhanceCards(lang);
    renderPulse(lang);
    renderTop10(lang);
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
