/* investingmap-cross-sector-v1 */
    function imInitialLang(fallback) {
      try {
        const q = new URLSearchParams(window.location.search).get('lang');
        if (q === 'en' || q === 'ko') return q;
        const s = localStorage.getItem('im_lang');
        if (s === 'en' || s === 'ko') return s;
      } catch (e) { }
      return fallback;
    }

    let lang = imInitialLang('ko');
    let imQuotesAsOf = '';
    let imQuotesRegularSession = null;
    let imQuotesError = '';
    function updateQuotesAsofDisplay() {
      var el = document.getElementById('quotes-asof');
      if (!el) return;
      if (imQuotesError) {
        el.textContent = imQuotesError;
        return;
      }
      var text = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.formatQuotesAsofDisplay)
        ? InvestingMapLiveQuotes.formatQuotesAsofDisplay(imQuotesAsOf, imQuotesRegularSession, lang)
        : '';
      el.textContent = text;
    }
    let selectedChains = new Set(), currentMarket = 'all', searchTerm = '', sortKey = 'quotePosition', sortDir = -1;

    function chainMatchesFilter(companyChain, filter) {
      if (filter === 'all') return true;
      if (!companyChain) return false;
      return companyChain === filter;
    }

    let imKrwPerUsd = 1400;
    function loadFx() {
      return fetch('/api/fx', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('fx')); })
        .then(function (j) {
          if (j && typeof j.rate === 'number' && j.rate > 500 && j.rate < 5000) imKrwPerUsd = j.rate;
        })
        .catch(function () { /* keep imKrwPerUsd */ });
    }
    function fmtMcapKoJo(won) {
      var mcapFmt = (typeof window !== 'undefined' ? window : globalThis).InvestingMapMcapFmt;
      return (mcapFmt && mcapFmt.fmtMcapKoJo)
        ? mcapFmt.fmtMcapKoJo(won)
        : (won == null || won === 0 ? '—' : (Math.round(Number(won) / 1e10) * 1e10 / 1e12).toFixed(2) + '조원');
    }
    function fmtMcapUsdBillion(won) {
      if (won == null || won === 0) return '\u2014';
      var usd = won / imKrwPerUsd;
      var bil = usd / 1e9;
      return '~$' + bil.toFixed(2) + 'B';
    }
    function fmtMcapTableCell(c) {
      if (c.ticker === 'UNLISTED' || !c.mcapWon) return '\u2014';
      return lang === 'en' ? fmtMcapUsdBillion(c.mcapWon) : fmtMcapKoJo(c.mcapWon);
    }
    function fmtFinRatio(v) {
      if (v == null || !Number.isFinite(v)) return '\u2014';
      return v.toFixed(2);
    }

    function syncThemeToggle() {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      var btn = document.getElementById('theme-toggle');
      if (!btn) return;
      btn.textContent = cur === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F';
      var en = (typeof lang !== 'undefined' && lang === 'en');
      btn.title = cur === 'light' ? (en ? 'Dark mode' : '\uB2E4\uD06C \uBAA8\uB4DC') : (en ? 'Light mode' : '\uB77C\uC774\uD2B8 \uBAA8\uB4DC');
    }

    function toggleTheme() {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('im_theme', next); } catch (e) { }
      syncThemeToggle();
      if (typeof svgEl !== 'undefined' && svgEl) {
        svgEl.selectAll('*').remove();
        svgEl = null;
      }
      var tabG = document.getElementById('tab-graph');
      if (tabG && tabG.classList.contains('active') && typeof buildGraph === 'function') buildGraph();
    }

    function toggleLang() {
      lang = lang === 'ko' ? 'en' : 'ko';
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('lang', lang);
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e) { }
      applyLang();
    }

    function applyLang() {
      const t = T[lang];
      document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'ko');
      try { localStorage.setItem('im_lang', lang); } catch (e) { }
      document.title = t.title;
      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: t.title, description: t.subtitle });
      if (window.InvestingMapGeoFooter) InvestingMapGeoFooter.apply(lang);
      if (window.InvestingMapEditorial) InvestingMapEditorial.render(lang);
      if (window.InvestingMapSectorNav) InvestingMapSectorNav.render(document.body.getAttribute('data-sector') || '', lang);
      document.getElementById('hdr-title').textContent = t.title;
      document.getElementById('hdr-subtitle').textContent = t.subtitle;
      document.getElementById('badge-total').innerHTML = t.badgeTotal;
      document.getElementById('badge-market').innerHTML = t.badgeMarket;
            document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap || (lang === 'en' ? '🔥 Sector heatmap' : '🔥 섹터 히트맵');
      var momentumBtn = document.getElementById('tab-btn-momentum');
      if (momentumBtn) momentumBtn.innerHTML = t.tabMomentum || (lang === 'en' ? '📊 Momentum matrix' : '📊 모멘텀 매트릭스');
      var momentumHint = document.getElementById('momentum-hint');
      if (momentumHint) momentumHint.textContent = t.momentumHint || (lang === 'en' ? 'RS × 52W position · size = daily turnover · color = 1-day return' : 'RS × 주가 위치 · 크기 = 당일 거래대금 · 색 = 당일 등락률');
      var volatilityBtn = document.getElementById('tab-btn-volatility');
      if (volatilityBtn) volatilityBtn.innerHTML = t.tabVolatility || (lang === 'en' ? '📉 Volatility Distribution' : '📉 변동성 분포');
      var volatilityHint = document.getElementById('volatility-hint');
      if (volatilityHint) volatilityHint.textContent = t.volatilityHint || (lang === 'en' ? 'Color = 20D %b (darker = higher) · gray = all listings · vertical lines = market ATR 25/50/75%' : '색=20일 %b(진할수록 높음) · 회색=전체 종목 · 세로선=전체 변동성 25/50/75%');
      var perfCalBtn = document.getElementById('tab-btn-perfcalendar');
      if (perfCalBtn) perfCalBtn.innerHTML = t.tabPerfCalendar || (lang === 'en' ? '📅 Performance Calendar' : '📅 퍼포먼스 캘린더');
      var perfCalHint = document.getElementById('perfcalendar-hint');
      if (perfCalHint) perfCalHint.textContent = t.perfCalendarSubtitle || (lang === 'en' ? 'YTD vs prior year-end=100' : '전년말 종가=100 기준 연중 수익률');
      document.getElementById('tab-btn-table').innerHTML = t.tabTable;
      var hmHint = document.getElementById('heatmap-hint');
      if (hmHint && t.heatmapHint) hmHint.textContent = t.heatmapHint;
      document.getElementById('tab-btn-graph').innerHTML = t.tabGraph;
      document.querySelector('.lang-toggle .flag').textContent = t.langFlag;
      document.getElementById('lang-toggle-text').textContent = t.langText;
      document.getElementById('fl-chain-label').textContent = t.flChain;
      document.getElementById('fl-market-label').textContent = t.flMarket;
      document.getElementById('search-input').placeholder = t.searchPlaceholder;
      document.getElementById('result-label').innerHTML = t.resultLabel + '<span id="show-count"></span>' + t.resultUnit;
      document.getElementById('th-name').textContent = t.thName;
      document.getElementById('th-ticker').textContent = t.thTicker;
      var thSpark = document.getElementById('th-spark');
      if (thSpark) thSpark.textContent = t.thSpark || (lang === 'en' ? 'Chart' : '차트');
      var thLast = document.getElementById('th-last');
      var thChg1d = document.getElementById('th-chg1d');
      var thRet20d = document.getElementById('th-ret20d');
      var thRet50d = document.getElementById('th-ret50d');
      var thRet120d = document.getElementById('th-ret120d');
      var thRet200d = document.getElementById('th-ret200d');
      if (thLast) thLast.textContent = t.thLast;
      if (thChg1d) thChg1d.textContent = t.thChg1d || (lang === 'en' ? '1D' : '1일');
      if (thRet20d) thRet20d.textContent = t.thRet20d || (lang === 'en' ? '20D' : '20일');
      if (thRet50d) thRet50d.textContent = t.thRet50d || (lang === 'en' ? '50D' : '50일');
      if (thRet120d) thRet120d.textContent = t.thRet120d || (lang === 'en' ? '120D' : '120일');
      if (thRet200d) thRet200d.textContent = t.thRet200d || (lang === 'en' ? '200D' : '200일');
      var th52hi = document.getElementById('th-52hi');
      if (th52hi) th52hi.textContent = t.th52High;
      var th52lo = document.getElementById('th-52lo');
      if (th52lo) th52lo.textContent = t.th52Lo;
      var thpos = document.getElementById('th-position');
      var thrs = document.getElementById('th-rs');
      if (thpos) thpos.textContent = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.positionHeaderLabel) ? InvestingMapLiveQuotes.positionHeaderLabel(lang, t) : (t.thPosition || (lang === 'en' ? '52W Range' : '주가 위치'));
      if (thrs) thrs.textContent = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.rsHeaderLabel) ? InvestingMapLiveQuotes.rsHeaderLabel(lang, t) : (t.thRs || 'RS');
      document.getElementById('th-market').textContent = t.thMarket;
      const thM = document.getElementById('th-mcap');
      if (thM) thM.textContent = t.thMcap;
      const thPer = document.getElementById('th-per');
      if (thPer) thPer.textContent = t.thPer;
      const thPbr = document.getElementById('th-pbr');
      if (thPbr) thPbr.textContent = t.thPbr;
      document.getElementById('th-chain').textContent = t.thChain;
      document.getElementById('th-semtype').textContent = t.thSemType;
      document.getElementById('th-products').textContent = t.thProducts;
      document.getElementById('th-partners').textContent = t.thPartners;
      document.getElementById('table-note').textContent = t.note;
      if(document.getElementById('sb-korean'))document.getElementById('sb-korean').textContent= t.sbKorean;
      if(document.getElementById('sb-global'))document.getElementById('sb-global').textContent= t.sbGlobal;
      if(document.getElementById('sb-size'))document.getElementById('sb-size').textContent= t.sbSize;
      if(document.getElementById('sb-how'))document.getElementById('sb-how').textContent= t.sbHow;
      if(document.getElementById('sb-size-desc'))document.getElementById('sb-size-desc').innerHTML= t.sizeDesc;
      if(document.getElementById('sb-how-desc'))document.getElementById('sb-how-desc').innerHTML= t.howDesc;
      /* sb-korean guard */ if(document.getElementById('graph-hint-text'))document.getElementById('graph-hint-text').textContent= t.graphHint;
      syncThemeToggle();
      updateQuotesAsofDisplay();
      if (window.InvestingMapMobileUx) { InvestingMapMobileUx.syncAll(); if (InvestingMapMobileUx.notifyLangApplied) InvestingMapMobileUx.notifyLangApplied(); }
      if (window.InvestingMapCandleModal && InvestingMapCandleModal.applyLang) InvestingMapCandleModal.applyLang();
      if (window.InvestingMapDesktopSidebar) InvestingMapDesktopSidebar.render(lang);
      if (window.InvestingMapGlobalBottomNav) InvestingMapGlobalBottomNav.render(lang);
      buildChainChips();
      buildMarketChips();
      buildSidebarLegend();
      renderTable();
      if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap(); if (document.getElementById('tab-momentum')?.classList.contains('active')) renderMomentum(); if (document.getElementById('tab-volatility')?.classList.contains('active')) renderVolatility(); if (document.getElementById('tab-perfcalendar')?.classList.contains('active')) renderPerfCalendar();
      if (svgEl) {
        svgEl.selectAll('.node text')
          .text(d => (lang === 'en' ? (d.labelEn || d.label) : d.label));
      }
    }

    function escAttr(s) {
      return String(s).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
    }

    function buildChainChips() {
      const t = T[lang];
      const container = document.getElementById('chain-chips');
      const chains = ['all'].concat(SECTOR_ORDER);
      container.innerHTML = chains.map(ch => {
        const label = ch === 'all' ? t.allFilter : ((window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainFilter[ch] || ch));
        const isActive = ch === 'all' ? selectedChains.size === 0 : selectedChains.has(ch);
        const color = CHAIN_COLORS[ch];
        const style = isActive ? 'background:' + (color || '#58a6ff') + ';color:#0d1117;border-color:transparent;' : '';
        const ec = escAttr(ch);
        return '<div class="filter-chip' + (isActive ? ' active' : '') + '" style="' + style + '" data-filter-chain="' + ec + '" onclick="setChainFilter(\'' + ec + '\',this)">' + label + '</div>';
      }).join('');
    }

    function buildMarketChips() {
      const t = T[lang];
      const container = document.getElementById('market-chips');
      const markets = ['all', 'KOSPI', 'KOSDAQ', '비상장'];
      container.innerHTML = markets.map(m => {
        const label = m === 'all' ? t.allFilter : ((window.InvestingMapI18n && InvestingMapI18n.marketChipLabel(m, t, lang)) || m);
        const isActive = currentMarket === m;
        const style = isActive ? 'background:#58a6ff;color:#0d1117;border-color:transparent;' : '';
        const em = escAttr(m);
        return '<div class="filter-chip' + (isActive ? ' active' : '') + '" style="' + style + '" data-filter-market="' + em + '" onclick="setMarketFilter(\'' + em + '\',this)">' + label + '</div>';
      }).join('');
    }

    function buildSidebarLegend() { if (!document.getElementById('sb-chain-legend')) return; /* sb-chain-legend guard */
      const t = T[lang];
      const chainContainer = document.getElementById('sb-chain-legend');
      const chains = SECTOR_ORDER;
      chainContainer.innerHTML = chains.map(ch =>
        '<div class="legend-item" onclick="toggleChainHighlight(\'' + escAttr(ch) + '\')">' +
        '<div class="legend-dot" style="background:' + (CHAIN_COLORS[ch] || '#888') + '"></div>' +
        ((window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainLabel[ch] || ch)) +
        '</div>'
      ).join('');
      const regionContainer = document.getElementById('sb-region-legend');
      const regions = ['us', 'tw', 'cn', 'eu', 'kr', 'jp', 'gb', 'il', 'dk'];
      const regionHtml = regions.map(r =>
        '<div class="legend-item">' +
        '<div class="legend-diamond" style="background:' + REGION_COLORS[r] + '"></div>' +
        t.regionLabel[r] +
        '</div>'
      ).join('');
      regionContainer.innerHTML = regionHtml + '<div style="margin-top:10px;font-size:11px;color:var(--text-muted);line-height:1.7">' + t.peerNetworkDesc + '</div>';
    }

    function getChainStyle(chain) {
      const c = CHAIN_COLORS[chain] || '#888';
      return 'background:' + c + '22;color:' + c + ';border:1px solid ' + c + '55';
    }
    function getPartnerInfo(id) {
      const g = globalCompanies.find(x => x.id === id);
      if (g) return { name: (window.InvestingMapI18n ? InvestingMapI18n.entityName(g, lang) : g.name), region: g.region };
      const k = koreanCompanies.find(x => x.id === id);
      if (k) return { name: (window.InvestingMapI18n ? InvestingMapI18n.entityName(k, lang) : k.name), region: 'kr' };
      return { name: id, region: 'us' };
    }
    function partnerRef(p) {
      if (typeof p === 'string') return { id: p, edgeLabel: '', edgeLabelEn: '', weight: null, kind: 'default' };
      return {
        id: p.id,
        edgeLabel: (p.edgeLabel || '').trim(),
        edgeLabelEn: (p.edgeLabelEn || '').trim(),
        weight: (p.weight != null && Number.isFinite(p.weight)) ? p.weight : null,
        kind: p.kind || 'default'
      };
    }
    function companyLinksTo(c, gid) {
      return (c.partners || []).some(p => partnerRef(p).id === gid);
    }

    function companyChains(c) {
      return [c.chain].concat(c.extraChains || []);
    }
    function chainMatches(c, filter) {
      if (filter === 'all') return true;
      return companyChains(c).includes(filter);
    }

    function renderTable() {
      const t = T[lang];
      let data = koreanCompanies.filter(c => {
        if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.shouldHideFromTable && InvestingMapLiveQuotes.shouldHideFromTable(c)) return false;
        if (selectedChains.size > 0 && ![...selectedChains].some(ch => chainMatches(c, ch))) return false;
        if (currentMarket !== 'all' && c.market !== currentMarket) return false;
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          const q = searchTerm;
          if (!c.name.includes(q) && !c.nameEn.toLowerCase().includes(s) && !c.ticker.includes(q)
            && !companyChains(c).some(ch => ch.includes(q)) && !(c.semType || '').includes(q) && !(c.semTypeEn || '').toLowerCase().includes(s)
            && !(c.products || '').includes(q)) return false;
        }
        return true;
      });
      if (sortKey) {
        data.sort(function (a, b) {
          if (sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'chg1dPct' || sortKey === 'ret20dPct' || sortKey === 'ret50dPct' || sortKey === 'ret120dPct' || sortKey === 'ret200dPct' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition' || sortKey === 'rs') {
            var av = a[sortKey];
            var bv = b[sortKey];
            var na = av == null || !Number.isFinite(av);
            var nb = bv == null || !Number.isFinite(bv);
            if (na && nb) return 0;
            if (na) return 1;
            if (nb) return -1;
            if (+av < +bv) return -sortDir;
            if (+av > +bv) return sortDir;
            return 0;
          }
          var av2 = a[sortKey] || '';
          var bv2 = b[sortKey] || '';
          if (av2 < bv2) return -sortDir;
          if (av2 > bv2) return sortDir;
          return 0;
        });
      }
      const countEl = document.getElementById('show-count');
      if (countEl) countEl.textContent = data.length;
      const chainLabel = (ch) => (window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainFilter[ch] || t.chainLabel[ch] || ch);
      const semTypeField = t.fieldSemType;
      const productsField = t.fieldProducts;
      const tbody = document.getElementById('table-body');
      tbody.innerHTML = data.map(c => {
        const partnerHtml = (c.partners || []).slice(0, 6).map(p => {
          const pr = partnerRef(p);
          const info = getPartnerInfo(pr.id);
          return '<span class="partner-tag ' + info.region + '">' + info.name + '</span>';
        }).join('') + ((c.partners || []).length > 6 ? '<span class="partner-tag">+' + ((c.partners || []).length - 6) + '</span>' : '');
        const displayName = lang === 'en' ? (c.nameEn || c.name) : (c.name || c.nameEn);
        const subNameRaw = lang === 'en' ? (c.name || '') : (c.nameEn || '');
        const subNameHtml = subNameRaw && subNameRaw !== displayName ? '<div class="company-name-sub">' + subNameRaw + '</div>' : '';
        const I18n = window.InvestingMapI18n;
        const semTypeDisplay = I18n ? I18n.field(c, 'semType', 'semTypeEn', lang) : (c[semTypeField] || c.semType || '\u2014');
        const productsDisplay = I18n ? I18n.field(c, 'products', 'productsEn', lang) : (c[productsField] || c.products || '\u2014');
        const chainDisplay = companyChains(c).map(ch =>
          '<span class="chain-tag" style="' + getChainStyle(ch) + '">' + chainLabel(ch) + '</span>'
        ).join(' ');
        const qr = (window.InvestingMapLiveQuotes && (InvestingMapLiveQuotes.formatQuotesRow(c, lang) || InvestingMapLiveQuotes.emptyQuotesRow())) || { last: '\u2014', hi: '\u2014', lo: '\u2014', position: '\u2014' };
        const mcapCell = fmtMcapTableCell(c);
        const mktClass = I18n ? I18n.marketCssClass(c.market) : (c.market === '비상장' ? 'unlisted' : c.market.toLowerCase());
        const mktLabel = I18n ? I18n.marketLabel(c.market, lang) : c.market;
        return '<tr data-ticker="' + c.ticker + '">' +
          '<td>' + ((window.InvestingMapCrossSector && InvestingMapCrossSector.nameCellHtml(c, displayName, subNameHtml, lang)) || ('<div class="company-name">' + displayName + '</div>' + subNameHtml)) + '</td>' +
          '<td><span class="ticker">' + c.ticker + '</span></td>' +
          '<td class="spark-cell">' + (qr.spark || '\u2014') + '</td>' +
          '<td class="quote-cell">' + qr.last + '</td>' +
          '<td class="quote-cell ret-cell">' + (qr.chg1d || '\u2014') + '</td>' +
          '<td class="quote-cell ret-cell">' + (qr.ret20d || '\u2014') + '</td>' +
          '<td class="quote-cell ret-cell">' + (qr.ret50d || '\u2014') + '</td>' +
          '<td class="quote-cell ret-cell">' + (qr.ret120d || '\u2014') + '</td>' +
          '<td class="quote-cell ret-cell">' + (qr.ret200d || '\u2014') + '</td>' +
          '<td class="quote-cell">' + qr.hi + '</td>' +
          '<td class="quote-cell">' + qr.lo + '</td>' +
          '<td class="quote-cell">' + ((qr && (qr.position != null ? qr.position : qr.yoy)) || '\u2014') + '</td>' +
          '<td class="quote-cell">' + (qr.rs || '\u2014') + '</td>' +
          '<td class="mcap-cell">' + mcapCell + '</td>' +
          '<td class="fin-cell">' + fmtFinRatio(c.per) + '</td>' +
          '<td class="fin-cell">' + fmtFinRatio(c.pbr) + '</td>' +
          '<td><span class="market-badge ' + mktClass + '">' + mktLabel + '</span></td>' +
          '<td>' + chainDisplay + '</td>' +
          '<td style="font-size:12px;color:var(--text-muted)">' + semTypeDisplay + '</td>' +
          '<td class="products-cell">' + productsDisplay + '</td>' +
          '<td><div class="partners-list">' + partnerHtml + '</div></td>' +
          '</tr>';
      }).join('');
      if (window.InvestingMapMobileTable) InvestingMapMobileTable.sync(document.getElementById('main-table'));
    }

    function setChainFilter(chain, el) {
      if (chain === 'all') {
        selectedChains.clear();
      } else {
        if (selectedChains.has(chain)) {
          selectedChains.delete(chain);
        } else {
          selectedChains.add(chain);
        }
      }
      buildChainChips();
      renderTable();
    }
    function setMarketFilter(m, el) {
      currentMarket = m;
      buildMarketChips();
      renderTable();
    }
    function setSearch(v) { searchTerm = v; renderTable(); }

    function syncSortHeader() {
      document.querySelectorAll('thead th').forEach(th => th.className = '');
      if (!sortKey) return;
      const keyMap = { name: 0, ticker: 1, quoteLast: 3, chg1dPct: 4, ret20dPct: 5, ret50dPct: 6, ret120dPct: 7, ret200dPct: 8, quoteHi52: 9, quoteLo52: 10, quotePosition: 11, rs: 12, mcapWon: 13, per: 14, pbr: 15, market: 16, chain: 17 };
      const idx = keyMap[sortKey];
      if (idx !== undefined) {
        const ths = document.querySelectorAll('thead th');
        if (ths[idx]) ths[idx].className = sortDir === 1 ? 'sort-asc' : 'sort-desc';
      }
    }

    function sortTable(key) {
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
      document.querySelectorAll('thead th').forEach(th => th.className = '');
      const keyMap = { name: 0, ticker: 1, quoteLast: 3, chg1dPct: 4, ret20dPct: 5, ret50dPct: 6, ret120dPct: 7, ret200dPct: 8, quoteHi52: 9, quoteLo52: 10, quotePosition: 11, rs: 12, mcapWon: 13, per: 14, pbr: 15, market: 16, chain: 17 };
      const idx = keyMap[key];
      if (idx !== undefined) {
        const ths = document.querySelectorAll('thead th');
        if (ths[idx]) ths[idx].className = sortDir === 1 ? 'sort-asc' : 'sort-desc';
      }
      renderTable();
    }

    
    // ═══════════════════════════════════════════════════════
    // GRAPH (RelationNetwork v2)
    // ═══════════════════════════════════════════════════════
    let svgEl = null;

    function rnProfileKey() {
      const ds = document.body.getAttribute('data-sector') || 'powergrid';
      if (ds === 'semi') return 'semiconductor';
      return ds;
    }

    function rnGraphCtx() {
      return {
        sectorId: rnProfileKey(),
        profileKey: rnProfileKey(),
        lang: lang,
        T: T,
        koreanCompanies: koreanCompanies,
        globalCompanies: globalCompanies,
        CHAIN_COLORS: CHAIN_COLORS,
        REGION_COLORS: REGION_COLORS,
        container: document.getElementById('graph-svg'),
        networkVersion: 1,
      };
    }

    function buildGraph() {
      if (!window.RelationNetwork) return;
      RelationNetwork.onTabVisible(rnGraphCtx());
      svgEl = true;
    }

    function selectNode() { /* handled by RelationNetwork */ }
    function resetSelection() { if (window.RelationNetwork) RelationNetwork.resetView(); }
    function toggleChainHighlight() { /* chain highlight via search/filters in v2 */ }

    function resetZoom() {
      const el = document.getElementById('graph-svg');
      if (!el || !window.d3) return;
      d3.select(el).transition().duration(400).call(
        d3.zoom().transform,
        d3.zoomIdentity.translate(el.clientWidth * 0.05, el.clientHeight * 0.05).scale(0.88)
      );
    }
    function zoomIn() {
      const el = document.getElementById('graph-svg');
      if (!el || !window.d3) return;
      d3.select(el).transition().call(d3.zoom().scaleBy, 1.35);
    }
    function zoomOut() {
      const el = document.getElementById('graph-svg');
      if (!el || !window.d3) return;
      d3.select(el).transition().call(d3.zoom().scaleBy, 0.74);
    }

    function showTooltip() { /* v2 uses detail panel */ }
    function hideTooltip() { }

    function resetTableFilters() {
      selectedChains.clear();
      currentMarket = 'all';
      searchTerm = '';
      var inp = document.getElementById('search-input');
      if (inp) inp.value = '';
      buildChainChips();
      buildMarketChips();
      renderTable();
    }

    function renderHeatmap() {
      if (!window.InvestingMapHeatmap) return;
      var el = document.getElementById('heatmap-root');
      if (!el) return;
      var tHm = T[lang];
      InvestingMapHeatmap.render({
        container: el,
        legend: document.getElementById('heatmap-legend'),
        companies: koreanCompanies,
        chainColors: CHAIN_COLORS,
        lang: lang,
        chainLabel: function (ch) {
          return (window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel)
            ? InvestingMapI18n.chainDisplayLabel(ch, T[lang])
            : ((tHm.chainFilter && tHm.chainFilter[ch]) || (tHm.chainLabel && tHm.chainLabel[ch]) || ch);
        },
        formatMcap: fmtMcapTableCell,
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({
            ticker: c.ticker,
            name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker)
          });
        }
      });
      el.querySelectorAll('.hm-tile').forEach(function (g) {
        if (g.querySelector('.hm-name')) g.setAttribute('data-leaf', '1');
      });
    }

    function renderPerfCalendar() {
      if (!window.InvestingMapPerfCalendar) return;
      var el = document.getElementById('perfcalendar-root');
      if (!el) return;
      var pt = T[lang] || {};
      var sid = (document.body && document.body.getAttribute('data-sector')) || '';
      InvestingMapPerfCalendar.render({
        container: el,
        legend: document.getElementById('perfcalendar-legend'),
        sectorId: sid,
        lang: lang,
        labels: {
          title: pt.perfCalendarTitle,
          subtitle: pt.perfCalendarSubtitle,
          sectorAvg: pt.perfCalendarSectorAvg,
          kospi: pt.perfCalendarKospi,
          kosdaq: pt.perfCalendarKosdaq,
          loading: pt.perfCalendarLoading,
          failed: pt.perfCalendarFailed,
          noData: pt.perfCalendarNoData,
          legend: pt.perfCalendarLegend,
          base: pt.perfCalendarBase,
          change: pt.perfCalendarChange,
          openChart: pt.perfCalendarOpenChart,
          yearTabs: pt.perfCalendarYearTabs
        },
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({
            ticker: c.ticker,
            name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker)
          });
        }
      });
    }

    function renderVolatility() {
      if (!window.InvestingMapVolatility) return;
      var el = document.getElementById('volatility-root');
      if (!el) return;
      var vt = T[lang] || {};
      InvestingMapVolatility.render({
        container: el,
        legend: document.getElementById('volatility-legend'),
        companies: koreanCompanies,
        lang: lang,
        labels: {
          title: vt.volatilityTitle,
          xAxis: vt.volatilityAxisAtr,
          yAxis: vt.volatilityAxisMcap,
          atr: vt.volatilityAtr,
          mcap: vt.volatilityMcap,
          pctB: vt.volatilityPctB,
          noData: vt.volatilityNoData,
          legend: vt.volatilityLegend
        },
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({
            ticker: c.ticker,
            name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker)
          });
        }
      });
    }

    function renderMomentum() {
      if (!window.InvestingMapMomentum) return;
      var el = document.getElementById('momentum-root');
      if (!el) return;
      var mt = T[lang] || {};
      InvestingMapMomentum.render({
        container: el,
        legend: document.getElementById('momentum-legend'),
        companies: koreanCompanies,
        lang: lang,
        labels: {
          xAxis: mt.momentumAxisRs,
          yAxis: mt.momentumAxisPosition,
          leader: mt.momentumLeader,
          pullback: mt.momentumPullback,
          emerging: mt.momentumEmerging,
          lagging: mt.momentumLagging,
          turnover: mt.momentumTurnover,
          change: mt.momentumChange,
          position: mt.momentumPosition,
          noData: mt.momentumNoData,
          legend: mt.momentumLegend
        },
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({
            ticker: c.ticker,
            name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker)
          });
        }
      });
    }



    function switchTab(tab, btn) {
      document.body.classList.toggle('im-tab-table', tab === 'table');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab).classList.add('active');
      if (btn) btn.classList.add('active');
      if (tab === 'heatmap') setTimeout(renderHeatmap, 40);
      if (tab === 'momentum') setTimeout(renderMomentum, 40);
      if (tab === 'volatility') setTimeout(renderVolatility, 40);
      if (tab === 'perfcalendar') setTimeout(renderPerfCalendar, 40);
      if (tab === 'graph') setTimeout(function() { buildGraph(); }, 50);
      else if (window.RelationNetwork) RelationNetwork.onTabHidden();
      if (window.InvestingMapTabState) InvestingMapTabState.onTabChange(tab);
    }

    loadFx().catch(function () { }).finally(function () {
      if (window.InvestingMapTabState) InvestingMapTabState.applyInitialTab(switchTab);
      document.body.classList.toggle('im-tab-table', document.getElementById('tab-table')?.classList.contains('active'));
      if (document.getElementById('tab-heatmap')?.classList.contains('active')) setTimeout(renderHeatmap, 80);
      if (document.getElementById('tab-momentum')?.classList.contains('active')) setTimeout(renderMomentum, 80);
      if (document.getElementById('tab-volatility')?.classList.contains('active')) setTimeout(renderVolatility, 80);
      if (document.getElementById('tab-perfcalendar')?.classList.contains('active')) setTimeout(renderPerfCalendar, 80);
      var imQuoteOpts = {
          getCompanies: function () { return koreanCompanies; },
          renderTable: function () { renderTable(); if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap(); if (document.getElementById('tab-momentum')?.classList.contains('active')) renderMomentum(); if (document.getElementById('tab-volatility')?.classList.contains('active')) renderVolatility(); if (document.getElementById('tab-perfcalendar')?.classList.contains('active')) renderPerfCalendar(); },
          onAsOf: function (iso, meta) {
            imQuotesError = '';
            imQuotesAsOf = iso || '';
            imQuotesRegularSession = meta && meta.regularSession != null ? meta.regularSession : null;
            updateQuotesAsofDisplay();
          },
          onError: function (err) {
            imQuotesError = lang === 'en'
              ? 'Quotes unavailable (check KRX_AUTH_KEY on Cloudflare)'
              : '시세 연결 실패 (Cloudflare KRX OPEN API 인증키·KRX API 승인 확인)';
            imQuotesAsOf = '';
            updateQuotesAsofDisplay();
            renderTable();
            if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap(); if (document.getElementById('tab-momentum')?.classList.contains('active')) renderMomentum(); if (document.getElementById('tab-volatility')?.classList.contains('active')) renderVolatility(); if (document.getElementById('tab-perfcalendar')?.classList.contains('active')) renderPerfCalendar();
          }
        };
      applyLang();
      if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.bootMapQuotes) {
        Promise.resolve(InvestingMapLiveQuotes.bootMapQuotes(imQuoteOpts)).catch(function () {});
      } else if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.start) {
        InvestingMapLiveQuotes.start(imQuoteOpts);
      }
    });
