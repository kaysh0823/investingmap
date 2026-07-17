/**
 * Hub dashboard: sector pulse (mcap-weighted return), top-10 52-week range, card stats.
 */
(function (global) {
  'use strict';

  var SECTOR_ORDER = ['semi', 'battery', 'renewable', 'nuclear', 'powergrid', 'ship', 'defense', 'kconsume', 'cosmetics', 'kcontent', 'bio', 'robot', 'auto', 'medtech', 'finance', 'construction'];
  var PULSE_HORIZONS = [
    { retKey: 'return1dPct', labelKey: 'pulseRow1d' },
    { retKey: 'return20dPct', labelKey: 'pulseRow20d' },
    { retKey: 'return50dPct', labelKey: 'pulseRow50d' },
    { retKey: 'return120dPct', labelKey: 'pulseRow120d' },
    { retKey: 'return250dPct', labelKey: 'pulseRow250d' },
  ];
  var pulseHorizonKey = 'return1dPct';
  var PULSE_HORIZON_KEY = 'im-hub-pulse-horizon-v3';
  var HUB_API_TIMEOUT_MS = 90000;
  var HUB_API_RETRIES = 2;
  var HUB_API_RETRY_DELAY_MS = 2500;
  var SWR_KEY = 'im-hub-dashboard-v16';
  var SWR_TTL_MS = 30 * 60 * 1000;
  var hubData = null;
  var dashboardData = { sectors: {}, top10: [], rsTop10: [], mcapTop10: [], gainers5dTop10: [], losers5dTop10: [], regularSession: null, asOf: null };
  var sectorsLoadingHorizon = null;
  var sectorsBootstrapping = false;
  var top10Loading = false;
  var rsTop10Loading = false;
  var moversLoading = false;
  var sectorsFailed = false;
  var top10Failed = false;
  var rsTop10Failed = false;
  var moversFailed = false;
  // Anti-flash gates: numbers stay hidden (skeleton) until a fresh API response
  // arrived, or the cached data is provably the same data version (same KST
  // anchor trading day, market closed).
  var sectorsReady = false;
  var top10Ready = false;
  var rsTop10Ready = false;
  var moversReady = false;
  var swrHold = null;
  var fxRate = 1400;
  var rsSnapshot = null;
  var hubSectorReturnsMeta = { mcapRecentDd: null, effectiveAnchorDd: null };
  var liveSectorPollTimer = null;
  var LIVE_SECTOR_POLL_MS = 5 * 60 * 1000;

  var SECTOR_LIVE_HORIZONS = [
    { retKey: 'return1dPct', useRefPast: true },
    { retKey: 'return20dPct', snapRetField: 'ret20dPct' },
    { retKey: 'return50dPct', snapRetField: 'ret50dPct' },
    { retKey: 'return120dPct', snapRetField: 'ret120dPct' },
    { retKey: 'return250dPct', snapRetField: 'ret250dPct' },
  ];
  var QUOTES_CHUNK = 18;

  /** Value-chain / keyword chips shown below representative stocks on hub cards. */
  var HUB_CARD_TAGS = {
    ko: {
      semi: ['설계', '파운드리', '메모리', '소재', '장비', '기판', '패키징'],
      battery: ['셀', '소재', '장비', '부품', 'ESS'],
      renewable: ['태양광', '풍력', '수소', '운영'],
      nuclear: ['원자로', 'SMR', '기자재', '정비'],
      powergrid: ['변압기', '개폐기', '송배전', '케이블', '발전설비', '원자력'],
      ship: ['조선소', '엔진', '철강', '조선기자재', '해양', '해운', '방산 해양'],
      defense: ['군용 항공', '미사일·C4ISR', '육상무기', '해군·함정', '우주·위성', '민항'],
      kconsume: ['라면·식품', '여행·항공', '패션', '쇼핑·유통'],
      cosmetics: ['브랜드', 'ODM', '미용기기', '유통·채널'],
      kcontent: ['게임', '드라마·웹툰', 'K-pop'],
      bio: ['신약', 'CDMO', '바이오시밀러', '의료기기', '진단'],
      robot: ['FA', 'AMR', '협동로봇', '센싱', '모션제어', '피지컬AI'],
      auto: ['완성차', '부품', '타이어', '전장'],
      medtech: ['진단', '임플란트', '의료장비', '헬스케어'],
      finance: ['은행', '증권', '보험', '카드', '캐피탈'],
      construction: ['종합건설', '주택', '디벨로퍼', '건설기계'],
    },
    en: {
      semi: ['Design', 'Foundry', 'Memory', 'Materials', 'Equipment', 'Substrates', 'Packaging'],
      battery: ['Cells', 'Materials', 'Equipment', 'Parts', 'ESS'],
      renewable: ['Solar', 'Wind', 'Hydrogen', 'Operators'],
      nuclear: ['Reactors', 'SMR', 'Components', 'O&M'],
      powergrid: ['Transformers', 'Switchgear', 'T&D', 'Cables', 'Generation', 'Nuclear'],
      ship: ['Yards', 'Engines', 'Steel', 'Marine equipment', 'Offshore', 'Shipping', 'Naval'],
      defense: ['Military aviation', 'Missiles & C4ISR', 'Land systems', 'Naval', 'Space & satellites', 'Civil aviation'],
      kconsume: ['Food', 'Travel', 'Fashion', 'Retail'],
      cosmetics: ['Brands', 'ODM', 'Aesthetic', 'Channels'],
      kcontent: ['Games', 'Drama & webtoon', 'K-pop'],
      bio: ['Novel drugs', 'CDMO', 'Biosimilars', 'Devices', 'Diagnostics'],
      robot: ['FA', 'AMR', 'Cobots', 'Sensing', 'Motion control', 'Physical AI'],
      auto: ['OEMs', 'Parts', 'Tires', 'Electronics'],
      medtech: ['Diagnostics', 'Implants', 'Equipment', 'Healthcare'],
      finance: ['Banks', 'Securities', 'Insurance', 'Cards', 'Consumer finance'],
      construction: ['Contractors', 'Housing', 'Developers', 'Equipment'],
    },
  };

  var I18N = {
    ko: {
      pulseTitle: '섹터 퍼포먼스',
      pulseSub: '시총 합산 수익률 (최근 종가 시총 ÷ 과거 시총) — 1D·20D·50D·120D·250D',
      pulseRow1d: '1D(1일)',
      pulseRow20d: '20D(1개월)',
      pulseRow50d: '50D(3개월)',
      pulseRow120d: '120D(6개월)',
      pulseRow250d: '250D(1년)',
      pulseColSector: '섹터',
      pulseColReturn: '1년 수익률',
      pulseMcapLabel: '시가총액 합산(비중)',
      pulseColCount: '종목 수',
      pulseLoading: '로딩중…',
      pulseStatusLoading: '계산 중…',
      topTitle: '주가 위치 Top 10',
      topSub: '52주 구간 대비 현재가 — 전 산업 상장사',
      rsTopTitle: 'RS Top 10',
      rsTopSub: 'KRX 전종목 · 20·50·120일 수익률 백분위 평균',
      mcapTopTitle: '시총 Top 10',
      mcapTopSub: '허브 수록 종목 · KRX 시가총액 기준',
      gain5dTopTitle: '5일 상승률 Top 10',
      gain5dTopSub: '허브 수록 종목 · 5거래일 수익률 기준',
      loss5dTopTitle: '5일 하락률 Top 10',
      loss5dTopSub: '허브 수록 종목 · 5거래일 수익률 기준',
      topViewAll: '지도에서 더 보기',
      loading: '시세 불러오는 중…',
      quotesFailed: '시세를 불러오지 못했습니다.',
      noData: '—',
      companies: '개 상장사',
      keyPlayers: '대표 종목',
      sessionLive: '10분 지연',
      sessionClosed: '장마감',
    },
    en: {
      pulseTitle: 'Sector performance',
      pulseSub: 'Market-cap-weighted return (recent ÷ past cap) — 1D, 20D, 50D, 120D, 250D',
      pulseRow1d: '1D (1 day)',
      pulseRow20d: '20D (1M)',
      pulseRow50d: '50D (3M)',
      pulseRow120d: '120D (6M)',
      pulseRow250d: '250D (1Y)',
      pulseColSector: 'Sector',
      pulseColReturn: '1Y return',
      pulseMcapLabel: 'Total market cap (weight)',
      pulseColCount: 'Companies',
      pulseLoading: 'Loading…',
      pulseStatusLoading: 'Calculating…',
      topTitle: 'Top 10 — 52-week range',
      topSub: 'Current price vs 52-week high/low — all sectors',
      rsTopTitle: 'RS Top 10',
      rsTopSub: 'Full KRX · avg of 20/50/120-day return percentiles',
      mcapTopTitle: 'Market cap Top 10',
      mcapTopSub: 'Hub-listed names · by KRX market cap',
      gain5dTopTitle: '5-day gainers Top 10',
      gain5dTopSub: 'Hub-listed names · by 5-trading-day return',
      loss5dTopTitle: '5-day losers Top 10',
      loss5dTopSub: 'Hub-listed names · by 5-trading-day return',
      topViewAll: 'Browse maps',
      loading: 'Loading quotes…',
      quotesFailed: 'Could not load quotes.',
      noData: '—',
      companies: ' companies',
      keyPlayers: 'Key companies',
      sessionLive: '~10m delayed',
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

  function hubTop10CompanyHref(row, lang) {
    var mapPath = row.mapPath || 'index.html';
    if (global.InvestingMapTabState && InvestingMapTabState.buildMapTableTickerUrl) {
      return InvestingMapTabState.buildMapTableTickerUrl(mapPath, row.ticker, lang);
    }
    try {
      var u = new URL(mapPath, window.location.href);
      u.searchParams.set('lang', lang);
      u.searchParams.set('tab', 'table');
      if (row.ticker) u.searchParams.set('ticker', String(row.ticker).trim());
      return u.pathname + u.search + u.hash;
    } catch (e) {
      return mapPath + '?lang=' + encodeURIComponent(lang) + '&tab=table&ticker=' + encodeURIComponent(row.ticker || '');
    }
  }

  function injectStyles() {
    if (document.getElementById('im-hub-dashboard-css-v13')) return;
    var oldCss = document.getElementById('im-hub-dashboard-css-v12')
      || document.getElementById('im-hub-dashboard-css-v11')
      || document.getElementById('im-hub-dashboard-css-v10')
      || document.getElementById('im-hub-dashboard-css-v9')
      || document.getElementById('im-hub-dashboard-css-v8')
      || document.getElementById('im-hub-dashboard-css-v7');
    if (oldCss) oldCss.remove();
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
      '.hub-pulse-cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}' +
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
      /* Desktop: industry cards | Top10 side panels (original). Mobile order swap in @media. */ +
      '.hub-dashboard-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(400px,520px);gap:20px;align-items:start;margin-bottom:24px}' +
      '.hub-dashboard-main{margin-bottom:0;min-width:0}' +
      '.hub-rank-panels{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-width:0;margin-bottom:0}' +
      '.hub-rank-panel{position:sticky;top:16px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:4px 4px 6px;min-width:0}' +
      '.hub-rank-toggle-inner{display:flex;flex-direction:column;gap:2px;min-width:0}' +
      '.hub-rank-toggle-sub{margin:0;font-size:11px;font-weight:400;color:var(--text-muted);line-height:1.4;white-space:normal;text-align:left}' +
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
      '.hub-top-pos.is-up{color:#3fb950}' +
      '.hub-top-pos.is-down{color:#f85149}' +
      '.hub-top-pos.is-flat{color:var(--text-muted)}' +
      '.hub-card-keyplayers{font-size:11px;color:var(--text-muted);margin-top:6px;margin-bottom:0;line-height:1.4;word-break:keep-all}' +
      '.hub-card-keyplayers strong{color:var(--text);font-weight:600}' +
      '.hub-card-tags{margin-top:8px;margin-bottom:12px}' +
      '.hub-pulse-skel{display:inline-block;width:56px;height:16px;border-radius:6px;vertical-align:middle;background:linear-gradient(90deg,var(--border) 25%,color-mix(in srgb,var(--border) 40%,var(--surface2)) 50%,var(--border) 75%);background-size:200% 100%;animation:hub-skel-shimmer 1.4s ease-in-out infinite}' +
      '.hub-top-skel{display:flex;flex-direction:column;gap:7px;padding:14px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface2)}' +
      '.hub-skel-bar{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--border) 25%,color-mix(in srgb,var(--border) 40%,var(--surface2)) 50%,var(--border) 75%);background-size:200% 100%;animation:hub-skel-shimmer 1.4s ease-in-out infinite}' +
      '.hub-skel-bar-sm{width:38%;height:9px}' +
      '@keyframes hub-skel-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
      '@media (max-width:1200px){.hub-dashboard-row{grid-template-columns:1fr}.hub-rank-panels{grid-template-columns:1fr 1fr}.hub-rank-panel{position:static}}' +
      '@media (max-width:768px){' +
      '.hub-dashboard-row{display:flex;flex-direction:column;align-items:stretch;gap:10px;margin-bottom:22px;width:100%}' +
      '.hub-rank-panels{order:1;display:flex;flex-direction:column;gap:10px;align-items:stretch;width:100%;max-width:none;min-width:0}' +
      '.hub-dashboard-main{order:2;width:100%;min-width:0}' +
      '.hub-rank-panel{position:static;width:100%;max-width:none;box-sizing:border-box}' +
      '.hub-rank-toggle{width:100%;align-items:flex-start}' +
      '.hub-pulse-tabs{flex-wrap:nowrap;gap:4px;width:100%}' +
      '.hub-pulse-tab{flex:1 1 0;min-width:0;padding:5px 4px;font-size:10px;white-space:nowrap;text-align:center}' +
      '.hub-pulse-cards{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:8px;padding-bottom:4px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory}' +
      '.hub-pulse-card{flex:0 0 132px;scroll-snap-align:start}' +
      '}'
    ;
    var el = document.createElement('style');
    el.id = 'im-hub-dashboard-css-v13';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function loadHubSectorReturns() {
    return fetch('data/hub_sector_returns.json?v=21', { cache: 'default' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j) {
          hubSectorReturnsMeta.mcapRecentDd = j.mcapRecentDd || null;
          hubSectorReturnsMeta.effectiveAnchorDd = j.effectiveAnchorDd || null;
          if (j.sectors) mergeSectorsPayload(j, { onlyMissing: true });
        }
      })
      .catch(function () {});
  }

  function loadRsSnapshotHub() {
    if (rsSnapshot) return Promise.resolve(rsSnapshot);
    return fetch('data/hub_rs_snapshot.json?v=1', { cache: 'default' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        rsSnapshot = j;
        return j;
      })
      .catch(function () { return null; });
  }

  function hubQuotesApiBase() {
    var LQ = global.InvestingMapLiveQuotes;
    if (LQ && LQ.getApiBase) return LQ.getApiBase();
    if (typeof window !== 'undefined' && window.location && window.location.protocol &&
        window.location.protocol.indexOf('http') === 0) {
      return '/api/quotes';
    }
    return '';
  }

  function hubQuotesRequestUrl(base, query) {
    var q = query.charAt(0) === '?' ? query : '?' + query;
    if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + q;
    var origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin : '';
    var path = base.charAt(0) === '/' ? base : '/' + base;
    return origin + path.replace(/\/+$/, '') + q;
  }

  function listAllHubTickers() {
    var RL = global.InvestingMapReturnLive;
    var norm = RL && RL.normalizeTicker ? RL.normalizeTicker : function (t) { return t; };
    var codes = [];
    var seen = {};
    if (!hubData) return codes;
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      block.companies.forEach(function (c) {
        var k = norm(c.ticker);
        if (!k || seen[k]) return;
        seen[k] = 1;
        codes.push(k);
      });
    });
    return codes;
  }

  function fetchHubLiveQuotes() {
    var base = hubQuotesApiBase();
    var codes = listAllHubTickers();
    if (!base || !codes.length) return Promise.resolve({});
    var merged = {};
    var chain = Promise.resolve();
    for (var i = 0; i < codes.length; i += QUOTES_CHUNK) {
      (function (chunk) {
        chain = chain.then(function () {
          var q = 'codes=' + chunk.map(encodeURIComponent).join(',');
          return fetch(hubQuotesRequestUrl(base, q), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (j) {
              var items = (j && j.items) || {};
              for (var k in items) {
                if (Object.prototype.hasOwnProperty.call(items, k)) merged[k] = items[k];
              }
              if (j && j.regularSession != null) dashboardData.regularSession = j.regularSession;
              if (j && j.asOf) dashboardData.asOf = j.asOf;
            });
        });
      })(codes.slice(i, i + QUOTES_CHUNK));
    }
    return chain.then(function () { return merged; });
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

  function formatSessionStatus(lang) {
    var labels = t(lang);
    if (dashboardData && dashboardData.regularSession === true) {
      return labels.sessionLive;
    }
    if (dashboardData && dashboardData.regularSession === false) {
      var ymd = formatAsOfYmdKst(dashboardData.asOf);
      return ymd ? labels.sessionClosed + ' · ' + ymd : labels.sessionClosed;
    }
    return '';
  }

  function applyLiveSectorReturns(quoteItems, snap) {
    var RL = global.InvestingMapReturnLive;
    if (!RL || !hubData || !snap || !quoteItems) return;
    var recentDd = snap.recentDd || hubSectorReturnsMeta.mcapRecentDd;
    if (!RL.shouldUseLive1dReturns(recentDd)) return;
    var stale = RL.isRecentDdStale(recentDd);
    var snapQuotes = snap.quotes || {};

    function mcapNowFn(key) {
      var row = snapQuotes[key];
      var q = quoteItems[key];
      if (!row || !q || q.last == null) return null;
      return RL.calcLiveMcapWon(row.refMcap, q.last, row.refClose);
    }

    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      if (!dashboardData.sectors[sid]) dashboardData.sectors[sid] = {};

      SECTOR_LIVE_HORIZONS.forEach(function (h) {
        if (h.retKey !== 'return1dPct' && !stale) return;
        var pastMap = h.useRefPast
          ? RL.refMcapMapFromSnap(snap)
          : RL.pastMcapMapFromSnapRet(snap, h.snapRetField);
        var ret = RL.sectorReturnMcapRatio(block.companies, mcapNowFn, pastMap);
        if (ret != null && isFinite(ret)) {
          dashboardData.sectors[sid][h.retKey] = ret;
        }
      });
    });
  }

  function refreshLiveSectorReturns(lang) {
    var RL = global.InvestingMapReturnLive;
    if (!RL) return Promise.resolve();
    return loadRsSnapshotHub().then(function (snap) {
      if (!snap) return;
      var recentDd = snap.recentDd || hubSectorReturnsMeta.mcapRecentDd;
      if (!RL.shouldUseLive1dReturns(recentDd)) return;
      return fetchHubLiveQuotes().then(function (items) {
        applyLiveSectorReturns(items, snap);
        sectorsReady = true;
        renderLabels(lang);
        renderPulse(lang);
        writeSwr();
      });
    });
  }

  function startLiveSectorPoll(lang) {
    if (liveSectorPollTimer) clearInterval(liveSectorPollTimer);
    liveSectorPollTimer = setInterval(function () {
      refreshLiveSectorReturns(lang);
    }, LIVE_SECTOR_POLL_MS);
  }

  function loadHubIndex() {
    if (hubData) return Promise.resolve(hubData);
    return fetch('data/hub_index.json?v=20')
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
    var bust = sep + '_v=6';
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

  /**
   * The cache is the same data version as a fresh fetch only when the market
   * was closed at save time and the cache belongs to the same KST anchor
   * trading day (quotes cannot have moved in between). Otherwise the cache
   * must not be painted before the fresh response.
   */
  function swrIsCurrentVersion(swr) {
    var RL = global.InvestingMapReturnLive;
    if (!swr || swr.regularSession !== false || !swr.asOf) return false;
    if (!RL || !RL.kstAnchorYmd || RL.isKrxRegularSession(new Date())) return false;
    var saved = new Date(swr.asOf);
    if (!isFinite(saved.getTime())) return false;
    return RL.kstAnchorYmd(saved) === RL.kstAnchorYmd(new Date());
  }

  function writeSwr() {
    try {
      sessionStorage.setItem(SWR_KEY, JSON.stringify({
        t: Date.now(),
        sectors: dashboardData.sectors || {},
        top10: dashboardData.top10 || [],
        rsTop10: dashboardData.rsTop10 || [],
        mcapTop10: dashboardData.mcapTop10 || [],
        gainers5dTop10: dashboardData.gainers5dTop10 || [],
        losers5dTop10: dashboardData.losers5dTop10 || [],
        regularSession: dashboardData.regularSession,
        asOf: dashboardData.asOf,
      }));
    } catch (e) { /* ignore */ }
  }

  function localSectorStats() {
    var out = {};
    if (!hubData) return out;
    var byTicker = {};
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      block.companies.forEach(function (c) {
        var t = c.ticker;
        if (t && !byTicker[t]) byTicker[t] = c.mcapWon || 0;
      });
    });
    var totalMcap = 0;
    Object.keys(byTicker).forEach(function (t) { totalMcap += byTicker[t]; });
    SECTOR_ORDER.forEach(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return;
      var sectorMcap = block.companies.reduce(function (s, c) { return s + (c.mcapWon || 0); }, 0);
      out[sid] = {
        mcapWon: sectorMcap,
        weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
        listingCount: block.companies.length,
        return1dPct: null,
        return20dPct: null,
        return50dPct: null,
        return120dPct: null,
        return250dPct: null,
      };
    });
    return out;
  }

  function loadFx() {
    return fetch('/api/fx', { cache: 'no-store' })
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

  function formatMcapValue(won, lang) {
    if (won == null || !isFinite(won) || won <= 0) return I18N[lang].noData;
    if (lang === 'en') {
      var rate = fxRate > 0 ? fxRate : 1400;
      return ((won / rate) / 1e9).toFixed(2) + 'B';
    }
    var trimmed = Math.round(won / 1e10) * 1e10;
    return (trimmed / 1e12).toFixed(2) + '\uC870\uC6D0';
  }

  function formatPct(n, lang) {
    if (n == null || !isFinite(n)) return I18N[lang].noData;
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  }

  function returnClass(n) {
    if (n == null || !isFinite(n)) return 'is-flat';
    if (n > 0) return 'is-up';
    if (n < 0) return 'is-down';
    return 'is-flat';
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

  function formatRsScore(n, lang) {
    if (n == null || !isFinite(n)) return t(lang).noData;
    return n.toFixed(1);
  }

  function rsClass(n) {
    return positionClass(n);
  }

  function migrateSectorHorizonKeys(sector) {
    if (!sector) return sector;
    if (sector.return20dPct == null && sector.return1mPct != null) sector.return20dPct = sector.return1mPct;
    if (sector.return50dPct == null && sector.return3mPct != null) sector.return50dPct = sector.return3mPct;
    if (sector.return120dPct == null && sector.return6mPct != null) sector.return120dPct = sector.return6mPct;
    if (sector.return250dPct == null && sector.yoyReturnPct != null) sector.return250dPct = sector.yoyReturnPct;
    return sector;
  }

  function readPulseHorizon() {
    try {
      var k = sessionStorage.getItem(PULSE_HORIZON_KEY);
      if (k === 'return1mPct') k = 'return20dPct';
      if (k === 'return3mPct') k = 'return50dPct';
      if (k === 'return6mPct') k = 'return120dPct';
      if (k === 'yoyReturnPct') k = 'return250dPct';
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

  function retKeyToHorizonParam(retKey) {
    if (retKey === 'return1dPct') return '1d';
    if (retKey === 'return50dPct') return '50d';
    if (retKey === 'return120dPct') return '120d';
    if (retKey === 'return250dPct') return '250d';
    return '20d';
  }

  function hasHorizonData(retKey) {
    var sectors = dashboardData.sectors || {};
    return Object.keys(sectors).some(function (sid) {
      var s = sectors[sid];
      return s && s[retKey] != null && isFinite(s[retKey]);
    });
  }

  function mergeSectorsPayload(j, opts) {
    if (!j || j.error) return;
    var onlyMissing = opts && opts.onlyMissing;
    var incoming = j.sectors || {};
    var base = dashboardData.sectors || {};
    var keys = ['return1dPct', 'return20dPct', 'return50dPct', 'return120dPct', 'return250dPct', 'mcapWon', 'weightPct', 'listingCount'];
    for (var sid in incoming) {
      if (!incoming.hasOwnProperty(sid)) continue;
      if (!base[sid]) base[sid] = {};
      var inc = migrateSectorHorizonKeys(incoming[sid]);
      var tgt = base[sid];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (onlyMissing && tgt[k] != null && isFinite(tgt[k])) continue;
        if (inc[k] != null) tgt[k] = inc[k];
      }
    }
    dashboardData.sectors = base;
    if (j.regularSession != null) dashboardData.regularSession = j.regularSession;
    if (j.asOf) dashboardData.asOf = j.asOf;
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
        refreshLiveSectorReturns(lang);
        if (!hasHorizonData(key)) {
          fetchSectorsHorizon(lang, key);
        }
      });
    }
  }

  function pulseSectorOrder(sectors, local, retKey) {
    return SECTOR_ORDER.filter(function (sid) {
      return hubData && hubData.sectors && hubData.sectors[sid];
    }).slice().sort(function (a, b) {
      var ra = (sectors[a] || local[a] || {})[retKey];
      var rb = (sectors[b] || local[b] || {})[retKey];
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    });
  }

  function buildPulseCards(lang, sectors, local, retKey) {
    var labels = t(lang);
    var ql = '?lang=' + encodeURIComponent(lang);
    return pulseSectorOrder(sectors, local, retKey).map(function (sid) {
      var block = hubData.sectors[sid];
      if (!block) return '';
      var meta = block.meta || {};
      var label = lang === 'en' ? meta.en : meta.ko;
      var pulse = sectors[sid] || local[sid] || {};
      var retPct = pulse[retKey] != null ? pulse[retKey] : null;
      var sectorMcap = pulse.mcapWon != null ? pulse.mcapWon :
        block.companies.reduce(function (s, c) { return s + (c.mcapWon || 0); }, 0);
      var weightPct = pulse.weightPct != null ? pulse.weightPct : (local[sid] ? local[sid].weightPct : 0);
      var isLoading = !sectorsReady || (sectorsLoadingHorizon === retKey && retPct == null);
      var cls = 'hub-pulse-card-ret is-flat';
      var retText;
      if (isLoading) {
        cls = 'hub-pulse-card-ret is-loading';
        retText = '<span class="hub-pulse-skel" aria-label="' + labels.pulseLoading + '"></span>';
      } else {
        if (retPct != null) cls = retPct > 0 ? 'hub-pulse-card-ret is-up' : retPct < 0 ? 'hub-pulse-card-ret is-down' : 'hub-pulse-card-ret is-flat';
        retText = formatPct(retPct, lang);
      }
      var href = (meta.map || 'index.html') + ql + '&tab=table';
      // Always use hub_index company count (snapshot listingCount goes stale after universe prunes).
      var countLabel = (block.companies ? block.companies.length : 0) +
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
      if (sectorsBootstrapping || (sectorsLoadingHorizon && !hasHorizonData(sectorsLoadingHorizon))) {
        parts.push('<span class="hub-pulse-loading-badge">' + labels.pulseStatusLoading + '</span>');
      }
      var sessionText = formatSessionStatus(lang);
      if (sessionText) {
        parts.push('<span class="hub-pulse-session">' + sessionText + '</span>');
      }
      statusWrap.innerHTML = parts.join('');
    }
  }

  function skeletonListHtml(n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<li class="hub-top-skel" aria-hidden="true">' +
        '<span class="hub-skel-bar" style="width:' + (52 + ((i * 17) % 38)) + '%"></span>' +
        '<span class="hub-skel-bar hub-skel-bar-sm"></span></li>';
    }
    return out;
  }

  function renderTop10(lang) {
    var list = document.getElementById('hub-top-position-list');
    if (!list) return;
    var labels = t(lang);
    var ranked = dashboardData && dashboardData.top10 ? dashboardData.top10 : [];

    if (!top10Ready) {
      list.innerHTML = skeletonListHtml(10);
      return;
    }
    if (!ranked.length) {
      var msg = top10Loading ? labels.loading : labels.quotesFailed;
      list.innerHTML = '<li class="hub-top-loading" style="font-size:12px;color:var(--text-muted)">' + msg + '</li>';
      return;
    }

    list.innerHTML = ranked.map(function (row) {
      var name = lang === 'en' ? (row.nameEn || row.name) : row.name;
      var sectorMeta = hubData.sectors[row.sectorId] && hubData.sectors[row.sectorId].meta;
      var sectorLabel = sectorMeta ? (lang === 'en' ? sectorMeta.en : sectorMeta.ko) : '';
      var href = hubTop10CompanyHref(row, lang);
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

  function renderRsTop10(lang) {
    var list = document.getElementById('hub-top-rs-list');
    if (!list) return;
    var labels = t(lang);
    var ranked = dashboardData && dashboardData.rsTop10 ? dashboardData.rsTop10 : [];

    if (!rsTop10Ready) {
      list.innerHTML = skeletonListHtml(10);
      return;
    }
    if (!ranked.length) {
      var msg = rsTop10Loading ? labels.loading : labels.quotesFailed;
      list.innerHTML = '<li class="hub-top-loading" style="font-size:12px;color:var(--text-muted)">' + msg + '</li>';
      return;
    }

    list.innerHTML = ranked.map(function (row) {
      var name = lang === 'en' ? (row.nameEn || row.name) : row.name;
      var sectorMeta = hubData && hubData.sectors[row.sectorId] && hubData.sectors[row.sectorId].meta;
      var sectorLabel = sectorMeta ? (lang === 'en' ? sectorMeta.en : sectorMeta.ko) : '';
      var href = hubTop10CompanyHref(row, lang);
      return '<li><a class="hub-top-item" href="' + href + '">' +
        '<div class="hub-top-row">' +
        '<div><div class="hub-top-name">' + name + '</div>' +
        '<div class="hub-top-ticker">' + row.ticker + '</div>' +
        (sectorLabel ? '<div class="hub-top-sector">' + sectorLabel + '</div>' : '') +
        '</div>' +
        '<span class="hub-top-pos ' + rsClass(row.rs) + '">' + formatRsScore(row.rs, lang) + '</span>' +
        '</div></a></li>';
    }).join('');
  }

  function renderMoverList(listId, ranked, ready, loading, lang, valueFn) {
    var list = document.getElementById(listId);
    if (!list) return;
    var labels = t(lang);
    ranked = ranked || [];
    if (!ready) {
      list.innerHTML = skeletonListHtml(10);
      return;
    }
    if (!ranked.length) {
      var msg = loading ? labels.loading : labels.quotesFailed;
      list.innerHTML = '<li class="hub-top-loading" style="font-size:12px;color:var(--text-muted)">' + msg + '</li>';
      return;
    }
    list.innerHTML = ranked.map(function (row) {
      var name = lang === 'en' ? (row.nameEn || row.name) : row.name;
      var sectorMeta = hubData && hubData.sectors[row.sectorId] && hubData.sectors[row.sectorId].meta;
      var sectorLabel = sectorMeta ? (lang === 'en' ? sectorMeta.en : sectorMeta.ko) : '';
      var href = hubTop10CompanyHref(row, lang);
      var val = valueFn(row);
      return '<li><a class="hub-top-item" href="' + href + '">' +
        '<div class="hub-top-row">' +
        '<div><div class="hub-top-name">' + name + '</div>' +
        '<div class="hub-top-ticker">' + row.ticker + '</div>' +
        (sectorLabel ? '<div class="hub-top-sector">' + sectorLabel + '</div>' : '') +
        '</div>' +
        '<span class="hub-top-pos ' + val.cls + '">' + val.text + '</span>' +
        '</div></a></li>';
    }).join('');
  }

  function renderMcapTop10(lang) {
    var ranked = dashboardData && dashboardData.mcapTop10 ? dashboardData.mcapTop10 : [];
    renderMoverList('hub-top-mcap-list', ranked, moversReady, moversLoading, lang, function (row) {
      return { text: formatMcapValue(row.mcapWon, lang), cls: '' };
    });
  }

  function renderGain5dTop10(lang) {
    var ranked = dashboardData && dashboardData.gainers5dTop10 ? dashboardData.gainers5dTop10 : [];
    renderMoverList('hub-top-gain5d-list', ranked, moversReady, moversLoading, lang, function (row) {
      return { text: formatPct(row.ret5dPct, lang), cls: returnClass(row.ret5dPct) };
    });
  }

  function renderLoss5dTop10(lang) {
    var ranked = dashboardData && dashboardData.losers5dTop10 ? dashboardData.losers5dTop10 : [];
    renderMoverList('hub-top-loss5d-list', ranked, moversReady, moversLoading, lang, function (row) {
      return { text: formatPct(row.ret5dPct, lang), cls: returnClass(row.ret5dPct) };
    });
  }

  function renderMovers(lang) {
    renderMcapTop10(lang);
    renderGain5dTop10(lang);
    renderLoss5dTop10(lang);
  }

  function renderCardTags(sid, lang) {
    var pack = HUB_CARD_TAGS[lang] || HUB_CARD_TAGS.ko;
    var tags = pack[sid] || [];
    var tagsEl = document.getElementById('card-' + sid + '-tags');
    if (!tagsEl) return;
    tagsEl.innerHTML = tags.map(function (tag) {
      return '<span class="hub-tag">' + tag + '</span>';
    }).join('');
    tagsEl.setAttribute('aria-hidden', tags.length ? 'false' : 'true');
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
      renderCardTags(sid, lang);
      var badge = document.getElementById('card-' + sid + '-badge');
      if (badge) {
        var n = block.companies.length;
        badge.textContent = lang === 'en'
          ? n + ' LISTINGS'
          : n + labels.companies;
      }
    });
  }

  function pulseSubText(lang) {
    var labels = t(lang);
    var RL = global.InvestingMapReturnLive;
    var recentDd = hubSectorReturnsMeta.mcapRecentDd;
    if (!RL || !recentDd || !RL.shouldUseLive1dReturns(recentDd)) return labels.pulseSub;
    if (RL.isRecentDdStale(recentDd)) {
      return lang === 'en'
        ? labels.pulseSub + ' · Recent leg: Naver quotes (KRX daily data lag)'
        : labels.pulseSub + ' · 최근일: 네이버 시세 (KRX 일별 반영 지연)';
    }
    var anchor = RL.ymdToDash(RL.kstAnchorYmd());
    var naverNote = RL.isKrxRegularSession && RL.isKrxRegularSession()
      ? (lang === 'en' ? '1D (~10m delayed)' : '1D 10분 지연')
      : (lang === 'en' ? '1D Naver' : '1D 네이버');
    return lang === 'en'
      ? labels.pulseSub + ' · As of ' + anchor + ' (' + naverNote + ')'
      : labels.pulseSub + ' · 기준 ' + anchor + ' (' + naverNote + ')';
  }

  function renderLabels(lang) {
    var labels = t(lang);
    var set = function (id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('hub-pulse-title', labels.pulseTitle);
    set('hub-pulse-sub', pulseSubText(lang));
    set('hub-top-title', labels.topTitle);
    set('hub-top-sub', labels.topSub);
    set('hub-rs-title', labels.rsTopTitle);
    set('hub-rs-sub', labels.rsTopSub);
    set('hub-mcap-title', labels.mcapTopTitle);
    set('hub-mcap-sub', labels.mcapTopSub);
    set('hub-gain5d-title', labels.gain5dTopTitle);
    set('hub-gain5d-sub', labels.gain5dTopSub);
    set('hub-loss5d-title', labels.loss5dTopTitle);
    set('hub-loss5d-sub', labels.loss5dTopSub);
  }

  function applySectorsPayload(j) {
    mergeSectorsPayload(j);
  }

  var sectorFetchInFlight = {};

  function fetchSectorsHorizon(lang, retKey) {
    if (sectorFetchInFlight[retKey]) return sectorFetchInFlight[retKey];
    var horizonParam = retKeyToHorizonParam(retKey);
    var url = hubApiUrl('/api/hub_sectors?horizon=' + encodeURIComponent(horizonParam));
    if (!url) {
      if (sectorsLoadingHorizon === retKey) sectorsLoadingHorizon = null;
      sectorsReady = true;
      renderPulse(lang);
      return Promise.resolve();
    }
    sectorsLoadingHorizon = retKey;
    sectorsFailed = false;
    renderPulse(lang);
    sectorFetchInFlight[retKey] = fetchWithRetry(url, HUB_API_TIMEOUT_MS, HUB_API_RETRIES, true)
      .then(function (j) {
        if (j && j.error) throw new Error(j.error);
        mergeSectorsPayload(j);
        sectorsReady = true;
        var ok = j.sectors && Object.values(j.sectors).some(function (s) {
          return s && s[retKey] != null && isFinite(s[retKey]);
        });
        if (!ok) throw new Error('hub_sectors_incomplete_' + horizonParam);
        writeSwr();
      })
      .catch(function () {
        sectorsFailed = true;
        // Fresh fetch failed — fall back to bundled/cached values instead of an endless skeleton.
        sectorsReady = true;
      })
      .then(function () {
        delete sectorFetchInFlight[retKey];
        if (sectorsLoadingHorizon === retKey) sectorsLoadingHorizon = null;
        renderPulse(lang);
      });
    return sectorFetchInFlight[retKey];
  }

  function fetchSectors(lang) {
    return fetchSectorsHorizon(lang, pulseHorizonKey);
  }

  function applyTop10Payload(j) {
    if (!j || j.error) return;
    dashboardData.top10 = j.top10 || dashboardData.top10;
    if (j.regularSession != null) dashboardData.regularSession = j.regularSession;
    if (j.asOf) dashboardData.asOf = j.asOf;
  }

  function applyRsTop10Payload(j) {
    if (!j || j.error) return;
    dashboardData.rsTop10 = j.top10 || dashboardData.rsTop10;
  }

  function applyMoversPayload(j) {
    if (!j || j.error) return;
    if (j.mcapTop10) dashboardData.mcapTop10 = j.mcapTop10;
    if (j.gainers5dTop10) dashboardData.gainers5dTop10 = j.gainers5dTop10;
    if (j.losers5dTop10) dashboardData.losers5dTop10 = j.losers5dTop10;
    if (j.asOf) dashboardData.asOf = j.asOf;
  }

  function fetchMovers(lang) {
    var url = hubApiUrl('/api/hub_movers');
    if (!url) {
      moversLoading = false;
      moversReady = true;
      renderMovers(lang);
      return Promise.resolve();
    }
    moversLoading = true;
    moversFailed = false;
    renderMovers(lang);
    return fetchWithRetry(url, HUB_API_TIMEOUT_MS, HUB_API_RETRIES, false)
      .then(function (j) {
        if (j && j.error) throw new Error(j.error);
        applyMoversPayload(j);
      })
      .catch(function () {
        moversFailed = true;
        if (swrHold) {
          if (!(dashboardData.mcapTop10 && dashboardData.mcapTop10.length) && swrHold.mcapTop10 && swrHold.mcapTop10.length) {
            dashboardData.mcapTop10 = swrHold.mcapTop10;
          }
          if (!(dashboardData.gainers5dTop10 && dashboardData.gainers5dTop10.length) && swrHold.gainers5dTop10 && swrHold.gainers5dTop10.length) {
            dashboardData.gainers5dTop10 = swrHold.gainers5dTop10;
          }
          if (!(dashboardData.losers5dTop10 && dashboardData.losers5dTop10.length) && swrHold.losers5dTop10 && swrHold.losers5dTop10.length) {
            dashboardData.losers5dTop10 = swrHold.losers5dTop10;
          }
        }
      })
      .then(function () {
        moversLoading = false;
        moversReady = true;
        if (!moversFailed && dashboardData.mcapTop10 && dashboardData.mcapTop10.length) writeSwr();
        renderMovers(lang);
      });
  }

  function fetchRsTop10(lang) {
    var url = hubApiUrl('/api/hub_rs_top10');
    if (!url) {
      rsTop10Loading = false;
      rsTop10Ready = true;
      renderRsTop10(lang);
      return Promise.resolve();
    }
    rsTop10Loading = true;
    rsTop10Failed = false;
    renderRsTop10(lang);
    return fetchWithRetry(url, HUB_API_TIMEOUT_MS, HUB_API_RETRIES, true)
      .then(function (j) {
        if (j && j.error) throw new Error(j.error);
        applyRsTop10Payload(j);
      })
      .catch(function () {
        rsTop10Failed = true;
        if (!(dashboardData.rsTop10 && dashboardData.rsTop10.length) && swrHold && swrHold.rsTop10 && swrHold.rsTop10.length) {
          dashboardData.rsTop10 = swrHold.rsTop10;
        }
      })
      .then(function () {
        rsTop10Loading = false;
        rsTop10Ready = true;
        if (!rsTop10Failed && dashboardData.rsTop10 && dashboardData.rsTop10.length) writeSwr();
        renderRsTop10(lang);
      });
  }

  function fetchTop10(lang) {
    var url = hubApiUrl('/api/hub_top10');
    if (!url) {
      top10Loading = false;
      top10Ready = true;
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
        if (!(dashboardData.top10 && dashboardData.top10.length) && swrHold && swrHold.top10 && swrHold.top10.length) {
          dashboardData.top10 = swrHold.top10;
        }
      })
      .then(function () {
        top10Loading = false;
        top10Ready = true;
        if (!top10Failed && dashboardData.top10 && dashboardData.top10.length) writeSwr();
        renderTop10(lang);
      });
  }

  function fetchDashboardAndRender(lang, sectorPromise) {
    var sectors = sectorPromise || fetchSectors(lang);
    return Promise.all([sectors, fetchTop10(lang), fetchRsTop10(lang), fetchMovers(lang)]).then(function () {
      if (!hasHorizonData(pulseHorizonKey)) {
        return fetchSectorsHorizon(lang, pulseHorizonKey);
      }
    }).then(function () {
      if (!sectorsFailed && !top10Failed && !rsTop10Failed && !moversFailed) writeSwr();
      sectorsBootstrapping = false;
      if (sectorsLoadingHorizon === pulseHorizonKey) sectorsLoadingHorizon = null;
      renderPulse(lang);
      renderTop10(lang);
      renderRsTop10(lang);
      renderMovers(lang);
      // Live Naver overlay is best-effort — do not block first paint of API data.
      refreshLiveSectorReturns(lang).then(function () {
        startLiveSectorPoll(lang);
      }).catch(function () {
        startLiveSectorPoll(lang);
      });
    });
  }

  function init(lang) {
    injectStyles();
    lang = pageLang(lang);
    readPulseHorizon();
    sectorsBootstrapping = true;
    top10Loading = true;
    rsTop10Loading = true;
    moversLoading = true;
    var swr = readSwr();
    if (swr) {
      if (swrIsCurrentVersion(swr)) {
        // Same data version as a fresh fetch would return — safe to paint immediately.
        dashboardData.sectors = swr.sectors || {};
        dashboardData.top10 = swr.top10 || [];
        dashboardData.rsTop10 = swr.rsTop10 || [];
        dashboardData.mcapTop10 = swr.mcapTop10 || [];
        dashboardData.gainers5dTop10 = swr.gainers5dTop10 || [];
        dashboardData.losers5dTop10 = swr.losers5dTop10 || [];
        dashboardData.regularSession = swr.regularSession;
        if (swr.asOf) dashboardData.asOf = swr.asOf;
        sectorsReady = Object.keys(dashboardData.sectors).length > 0;
        top10Ready = dashboardData.top10.length > 0;
        rsTop10Ready = dashboardData.rsTop10.length > 0;
        moversReady = dashboardData.mcapTop10.length > 0;
      } else {
        // Different (or unknown) data version — keep skeletons until the fresh
        // response lands; use only as a fallback if the fetch fails.
        swrHold = swr;
      }
    }
    Promise.all([loadHubIndex(), loadFx(), loadHubSectorReturns()])
      .then(function () {
        renderLabels(lang);
        enhanceCards(lang);
        renderPulse(lang);
        renderTop10(lang);
        renderRsTop10(lang);
        renderMovers(lang);
        var sectorFetch = fetchSectorsHorizon(lang, pulseHorizonKey);
        return fetchDashboardAndRender(lang, sectorFetch);
      })
      .catch(function (err) {
        sectorsBootstrapping = false;
        top10Loading = false;
        rsTop10Loading = false;
        moversLoading = false;
        sectorsReady = true;
        top10Ready = true;
        rsTop10Ready = true;
        moversReady = true;
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[hub_dashboard] init failed', err);
        }
        renderPulse(lang);
        renderTop10(lang);
        renderRsTop10(lang);
        renderMovers(lang);
      });
  }

  function onLangChange(lang) {
    lang = pageLang(lang);
    readPulseHorizon();
    renderLabels(lang);
    enhanceCards(lang);
    // Avoid flashing "Could not load" before hubData / first fetch finishes.
    if (!hubData && sectorsBootstrapping) return;
    renderPulse(lang);
    renderTop10(lang);
    renderRsTop10(lang);
    renderMovers(lang);
  }

  global.InvestingMapHubDashboard = {
    init: init,
    refresh: onLangChange,
    loadHubIndex: loadHubIndex,
    renderHubCardTags: function (lang) {
      lang = pageLang(lang);
      SECTOR_ORDER.forEach(function (sid) { renderCardTags(sid, lang); });
    },
  };

  if (document.getElementById('hub-sector-pulse')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
