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
    let currentChain = 'all', currentMarket = 'all', searchTerm = '', sortKey = 'quotePosition', sortDir = -1;

    let imKrwPerUsd = 1400;
    function loadFx() {
      return fetch('../data/fx_usdkrw.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('fx')); })
        .then(function (j) {
          if (j && typeof j.rate === 'number' && j.rate > 500 && j.rate < 5000) imKrwPerUsd = j.rate;
        })
        .catch(function () { /* keep imKrwPerUsd */ });
    }
    function fmtMcapKoJo(won) {
      if (won == null || won === 0) return '\u2014';
      var jo = won / 1e12;
      return jo.toFixed(2) + '\uC870\uC6D0';
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
      const hubBack = document.getElementById('hub-back');
      if (hubBack) hubBack.href = '../index.html?lang=' + encodeURIComponent(lang);
      document.title = t.title;
      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: t.title, description: t.subtitle });
      if (window.InvestingMapGeoFooter) InvestingMapGeoFooter.apply(lang);
      if (window.InvestingMapEditorial) InvestingMapEditorial.render(lang);
      if (window.InvestingMapSectorNav) InvestingMapSectorNav.render(document.body.getAttribute('data-sector') || '', lang);
      document.getElementById('hdr-title').textContent = t.title;
      document.getElementById('hdr-subtitle').textContent = t.subtitle;
      document.getElementById('badge-total').innerHTML = t.badgeTotal;
      document.getElementById('badge-market').innerHTML = t.badgeMarket;
            document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap || (lang === 'en' ? '🔥 Market cap heatmap' : '🔥 시총 히트맵');
      document.getElementById('tab-btn-table').innerHTML = t.tabTable;
      var hmHint = document.getElementById('heatmap-hint');
      if (hmHint && t.heatmapHint) hmHint.textContent = t.heatmapHint;
      document.getElementById('tab-btn-graph').innerHTML = t.tabGraph;
      document.querySelector('.lang-toggle .flag').textContent = t.langFlag;
      document.getElementById('lang-toggle-text').textContent = t.langText;
      const hubLbl = document.getElementById('hub-link-label');
      if (hubLbl) hubLbl.textContent = lang === 'en' ? 'Hub' : '허브';
      document.getElementById('fl-chain-label').textContent = t.flChain;
      document.getElementById('fl-market-label').textContent = t.flMarket;
      document.getElementById('search-input').placeholder = t.searchPlaceholder;
      document.getElementById('result-label').innerHTML = t.resultLabel + '<span id="show-count"></span>' + t.resultUnit;
      document.getElementById('th-name').textContent = t.thName;
      document.getElementById('th-ticker').textContent = t.thTicker;
      var thLast = document.getElementById('th-last');
      if (thLast) thLast.textContent = t.thLast;
      var th52hi = document.getElementById('th-52hi');
      if (th52hi) th52hi.textContent = t.th52High;
      var th52lo = document.getElementById('th-52lo');
      if (th52lo) th52lo.textContent = t.th52Lo;
      var thpos = document.getElementById('th-position');
      if (thpos) thpos.textContent = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.positionHeaderLabel) ? InvestingMapLiveQuotes.positionHeaderLabel(lang, t) : (t.thPosition || (lang === 'en' ? 'Price Position' : '주가 위치'));
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
      document.getElementById('sb-korean').textContent = t.sbKorean;
      document.getElementById('sb-global').textContent = t.sbGlobal;
      document.getElementById('sb-size').textContent = t.sbSize;
      document.getElementById('sb-how').textContent = t.sbHow;
      document.getElementById('sb-size-desc').innerHTML = t.sizeDesc;
      document.getElementById('sb-how-desc').innerHTML = t.howDesc;
      document.getElementById('graph-hint-text').textContent = t.graphHint;
      syncThemeToggle();
      updateQuotesAsofDisplay();
      buildChainChips();
      buildMarketChips();
      buildSidebarLegend();
      renderTable();
      if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap();
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
        const label = ch === 'all' ? t.allFilter : (t.chainFilter[ch] || ch);
        const isActive = currentChain === ch;
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

    function buildSidebarLegend() {
      const t = T[lang];
      const chainContainer = document.getElementById('sb-chain-legend');
      const chains = SECTOR_ORDER;
      chainContainer.innerHTML = chains.map(ch =>
        '<div class="legend-item" onclick="toggleChainHighlight(\'' + escAttr(ch) + '\')">' +
        '<div class="legend-dot" style="background:' + (CHAIN_COLORS[ch] || '#888') + '"></div>' +
        (t.chainLabel[ch] || ch) +
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
        if (!chainMatches(c, currentChain)) return false;
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
          if (sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition') {
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
      const chainLabel = (ch) => t.chainFilter[ch] || ch;
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
          '<td><div class="company-name">' + displayName + '</div>' + subNameHtml + '</td>' +
          '<td><span class="ticker">' + c.ticker + '</span></td>' +
          '<td class="quote-cell">' + qr.last + '</td>' +
          '<td class="quote-cell">' + qr.hi + '</td>' +
          '<td class="quote-cell">' + qr.lo + '</td>' +
          '<td class="quote-cell">' + ((qr && (qr.position != null ? qr.position : qr.yoy)) || '\u2014') + '</td>' +
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
      currentChain = chain;
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
      const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, mcapWon: 6, per: 7, pbr: 8, market: 9, chain: 10 };
      const idx = keyMap[sortKey];
      if (idx !== undefined) {
        const ths = document.querySelectorAll('thead th');
        if (ths[idx]) ths[idx].className = sortDir === 1 ? 'sort-asc' : 'sort-desc';
      }
    }

    function sortTable(key) {
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
      document.querySelectorAll('thead th').forEach(th => th.className = '');
      const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, mcapWon: 6, per: 7, pbr: 8, market: 9, chain: 10 };
      const idx = keyMap[key];
      if (idx !== undefined) {
        const ths = document.querySelectorAll('thead th');
        if (ths[idx]) ths[idx].className = sortDir === 1 ? 'sort-asc' : 'sort-desc';
      }
      renderTable();
    }

    let simulation, svgEl, g, zoomBehavior, selectedNode = null, highlightedChain = null;

    function sectorAngle(chain) {
      const i = SECTOR_ORDER.indexOf(chain);
      const idx = i < 0 ? 0 : i;
      return (idx / N_SECTORS) * 2 * Math.PI;
    }

    function buildGraph() {
      const container = document.getElementById('graph-svg');
      const W = container.clientWidth || 900, H = container.clientHeight || 700;
      const graphStroke = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--graph-stroke').trim() || '#0d1117'; } catch (e) { return '#0d1117'; } })();
      const graphLabel = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--graph-label').trim() || '#c9d1d9'; } catch (e) { return '#c9d1d9'; } })();
      const isGlobalId = (id) => globalCompanies.some(g => g.id === id);
      const graphCompanies = koreanCompanies.filter(c => c.ticker !== 'UNLISTED' && c.mcapWon > 0);

      const nodes = [];
      const nodeIndex = {};
      graphCompanies.forEach(c => {
        nodes.push({
          id: c.id, label: c.name, labelEn: c.nameEn, type: 'korean', chain: c.chain,
          ticker: c.ticker, market: c.market, mcapWon: c.mcapWon, semType: c.semType, semTypeEn: c.semTypeEn,
          products: c.products, productsEn: c.productsEn, revenue: c.revenue,
          revTier: c.revTier, data: c,
          r: c.revTier === 3 ? 18 : c.revTier === 2 ? 13 : 9
        });
        nodeIndex[c.id] = nodes.length - 1;
      });

      const usedGlobal = new Set();
      graphCompanies.forEach(c => (c.partners || []).forEach(p => usedGlobal.add(partnerRef(p).id)));
      globalCompanies.filter(g => usedGlobal.has(g.id)).forEach(g => {
        nodes.push({
          id: g.id,
          label: g.name,
          labelEn: g.nameEn != null && g.nameEn !== '' ? g.nameEn : g.name,
          type: 'global',
          region: g.region,
          sector: g.sector,
          country: g.country,
          r: 7,
        });
        nodeIndex[g.id] = nodes.length - 1;
      });

      const links = [];
      const byChain = d3.group(graphCompanies, d => d.chain);
      for (const [ch, arr] of byChain) {
        const sorted = arr.slice().sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
        for (let i = 0; i < sorted.length - 1; i++) {
          links.push({
            source: sorted[i].id,
            target: sorted[i + 1].id,
            sourceChain: ch,
            kind: 'peer',
            baseStrokeW: 1.15
          });
        }
        const gids = [];
        arr.forEach(c => (c.partners || []).forEach(p => {
          const pid = partnerRef(p).id;
          if (isGlobalId(pid)) gids.push(pid);
        }));
        const uniq = [...new Set(gids)].sort();
        for (let i = 0; i < uniq.length - 1; i++) {
          if (nodeIndex[uniq[i]] === undefined || nodeIndex[uniq[i + 1]] === undefined) continue;
          links.push({
            source: uniq[i],
            target: uniq[i + 1],
            sourceChain: ch,
            kind: 'globalPeer',
            baseStrokeW: 0.75
          });
        }
      }

      graphCompanies.forEach(c => {
        (c.partners || []).forEach(p => {
          const pr = partnerRef(p);
          const pid = pr.id;
          if (nodeIndex[pid] === undefined) return;
          const w = pr.weight;
          const strokeW = (w != null && Number.isFinite(w))
            ? Math.max(0.9, 0.85 + w * 4.2)
            : (pr.kind === 'backing' ? 1.0 : (pr.kind === 'theme' || pr.kind === 'export' ? 1.05 : 1.2));
          links.push({
            source: c.id, target: pid, sourceChain: c.chain,
            edgeLabel: pr.edgeLabel, edgeLabelEn: pr.edgeLabelEn, weight: pr.weight, kind: pr.kind,
            baseStrokeW: strokeW
          });
        });
      });

      const d3svg = d3.select('#graph-svg');
      d3svg.selectAll('*').remove();
      svgEl = d3svg;
      zoomBehavior = d3.zoom().scaleExtent([0.12, 4]).on('zoom', e => g.attr('transform', e.transform));
      d3svg.call(zoomBehavior);
      d3svg.on('click', (e) => { if (e.target === d3svg.node() || e.target.tagName === 'svg') resetSelection(); });
      g = d3svg.append('g');
      simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id)
          .distance(d => {
            if (d.kind === 'globalPeer') return 70;
            const S = d.source, T = d.target;
            const sk = S.type || 'korean', tk = T.type || 'korean';
            if (sk === 'korean' && tk === 'korean') return d.kind === 'peer' ? 52 : 62;
            return 128;
          })
          .strength(d => (d.kind === 'globalPeer' ? 0.14 : (d.kind === 'peer' ? 0.36 : 0.28))))
        .force('charge', d3.forceManyBody().strength(d => d.type === 'korean' ? -200 : -95))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide(d => d.r + 8))
        .force('x', d3.forceX(d => {
          if (d.type === 'global') return W / 2;
          const a = sectorAngle(d.chain);
          return W / 2 + Math.cos(a) * 200;
        }).strength(0.07))
        .force('y', d3.forceY(d => {
          if (d.type === 'global') return H / 2;
          const a = sectorAngle(d.chain);
          return H / 2 + Math.sin(a) * 200;
        }).strength(0.07));
      const link = g.append('g').selectAll('line').data(links).join('line')
        .attr('stroke', d => d.kind === 'globalPeer' ? '#8b949e' : (CHAIN_COLORS[d.sourceChain] || '#555'))
        .attr('stroke-opacity', d => d.kind === 'globalPeer' ? 0.18 : 0.22)
        .attr('stroke-width', d => d.baseStrokeW || 1.2)
        .attr('stroke-dasharray', d => {
          if (d.kind === 'globalPeer') return '2 5';
          if (d.kind === 'peer') return null;
          return d.kind === 'backing' ? '5 4' : (d.kind === 'theme' || d.kind === 'export' ? '3 5' : null);
        });
      const node = g.append('g').selectAll('g').data(nodes).join('g')
        .attr('class', d => 'node node-' + d.type).attr('cursor', 'pointer')
        .on('mouseover', (e, d) => showTooltip(e, d))
        .on('mouseout', () => hideTooltip())
        .on('click', (e, d) => { e.stopPropagation(); selectNode(d, node, link); })
        .call(d3.drag()
          .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));
      node.filter(d => d.type === 'korean').append('circle')
        .attr('r', d => d.r).attr('fill', d => CHAIN_COLORS[d.chain] || '#888')
        .attr('fill-opacity', 0.85).attr('stroke', graphStroke).attr('stroke-width', 1.5);
      node.filter(d => d.type === 'global').append('polygon')
        .attr('points', d => { const r = d.r + 2; return '0,' + (-r) + ' ' + r + ',0 0,' + r + ' ' + (-r) + ',0'; })
        .attr('fill', d => REGION_COLORS[d.region] || '#888').attr('fill-opacity', 0.8)
        .attr('stroke', graphStroke).attr('stroke-width', 1.2);
      node.filter(d => d.r >= 9 || d.type === 'global').append('text')
        .text(d => (lang === 'en' ? (d.labelEn || d.label) : d.label))
        .attr('text-anchor', 'middle').attr('dy', d => d.r + 11)
        .attr('font-size', d => d.type === 'korean' ? (d.r >= 13 ? 11 : 9) : 9)
        .attr('fill', graphLabel).attr('pointer-events', 'none');
      simulation.on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
      });
      setTimeout(() => { svgEl.transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity.translate(W * 0.05, H * 0.05).scale(0.82)); }, 1200);
    }

    function selectNode(d, node, link) {
      if (selectedNode === d.id) { resetSelection(); return; }
      selectedNode = d.id;
      const connected = new Set([d.id]);
      link.each(l => {
        const s = l.source.id || l.source, t = l.target.id || l.target;
        if (s === d.id || t === d.id) { connected.add(s); connected.add(t); }
      });
      node.classed('node-dim', n => !connected.has(n.id));
      link.attr('stroke-opacity', l => { const s = l.source.id || l.source, t = l.target.id || l.target; return (s === d.id || t === d.id) ? 0.9 : 0.03; })
        .attr('stroke-width', l => {
          const s = l.source.id || l.source, t = l.target.id || l.target;
          const on = (s === d.id || t === d.id);
          const base = l.baseStrokeW || 1.2;
          return on ? Math.max(2.4, base * 2.2) : Math.max(0.55, base * 0.55);
        });
    }

    function resetSelection() {
      selectedNode = null; highlightedChain = null;
      if (!svgEl) return;
      svgEl.selectAll('.node').classed('node-dim', false);
      svgEl.selectAll('line').attr('stroke-opacity', d => d.kind === 'globalPeer' ? 0.18 : 0.22).attr('stroke-width', d => d.baseStrokeW || 1.2)
        .attr('stroke-dasharray', d => {
          if (d.kind === 'globalPeer') return '2 5';
          if (d.kind === 'peer') return null;
          return d.kind === 'backing' ? '5 4' : (d.kind === 'theme' || d.kind === 'export' ? '3 5' : null);
        })
        .attr('stroke', d => d.kind === 'globalPeer' ? '#8b949e' : (CHAIN_COLORS[d.sourceChain] || '#555'));
    }

    function toggleChainHighlight(chain) {
      if (!svgEl) return;
      if (highlightedChain === chain) { resetSelection(); return; }
      highlightedChain = chain;
      const chainIds = new Set(koreanCompanies.filter(c => chainMatches(c, chain)).map(c => c.id));
      const linkedIds = new Set(chainIds);
      koreanCompanies.filter(c => chainMatches(c, chain)).forEach(c => (c.partners || []).forEach(p => linkedIds.add(partnerRef(p).id)));
      svgEl.selectAll('.node').classed('node-dim', d => !linkedIds.has(d.id));
      svgEl.selectAll('line').attr('stroke-opacity', l => chainIds.has(l.source.id || l.source) ? 0.75 : 0.03)
        .attr('stroke-width', l => {
          const base = l.baseStrokeW || 1.2;
          return chainIds.has(l.source.id || l.source) ? Math.max(2, base * 1.7) : Math.max(0.55, base * 0.55);
        });
    }

    function showTooltip(e, d) {
      const tt = document.getElementById('graph-tooltip');
      const t = T[lang];
      const color = d.type === 'korean' ? (CHAIN_COLORS[d.chain] || '#888') : (REGION_COLORS[d.region] || '#888');
      const displayName = lang === 'en' ? (d.labelEn || d.label) : d.label;
      let html = '<div class="tooltip-name" style="color:' + color + '">' + displayName + '</div>';
      if (d.type === 'korean') {
        const chainDisplay = t.chainFilter[d.chain] || d.chain;
        const I18nTt = window.InvestingMapI18n;
        const semTypeDisplay = I18nTt ? I18nTt.field(d, 'semType', 'semTypeEn', lang) : (lang === 'en' ? (d.semTypeEn || '\u2014') : (d.semType || '\u2014'));
        const productsDisplay = I18nTt ? I18nTt.field(d, 'products', 'productsEn', lang) : (lang === 'en' ? (d.productsEn || '\u2014') : (d.products || '\u2014'));
        const mktTt = I18nTt ? I18nTt.marketLabel(d.market, lang) : d.market;
        const subTt = lang === 'en' ? (d.label || '') : (d.labelEn || '');
        const subPart = subTt && subTt !== displayName ? subTt + ' \u00B7 ' : '';
        html += '<div class="tooltip-meta">' + subPart + d.ticker + ' \u00B7 ' + mktTt + '</div>';
        html += '<div class="tooltip-row"><span class="tooltip-label">' + t.ttChain + '</span><span class="tooltip-val">' + chainDisplay + '</span></div>';
        html += '<div class="tooltip-row"><span class="tooltip-label">' + t.ttSemType + '</span><span class="tooltip-val">' + semTypeDisplay + '</span></div>';
        html += '<div class="tooltip-row"><span class="tooltip-label">' + t.ttProducts + '</span><span class="tooltip-val">' + productsDisplay + '</span></div>';
        const capStr = lang === 'en' ? fmtMcapUsdBillion(d.mcapWon || 0) : fmtMcapKoJo(d.mcapWon || 0);
        html += '<div class="tooltip-row"><span class="tooltip-label">' + t.ttRevenue + '</span><span class="tooltip-val">' + capStr + '</span></div>';
        const partners = d.data.partners || [];
        const pNames = partners.slice(0, 5).map(p => {
          const pr = partnerRef(p);
          const nm = getPartnerInfo(pr.id).name;
          const lbl = lang === 'en' ? (pr.edgeLabelEn || pr.edgeLabel) : (pr.edgeLabel || pr.edgeLabelEn);
          let s = nm;
          if (lbl) s += ' — ' + lbl;
          if (pr.weight != null && Number.isFinite(pr.weight)) s += ' (~' + Math.round(pr.weight * 100) + '%)';
          return s;
        }).join(', ');
        html += '<div class="tooltip-row"><span class="tooltip-label">' + t.ttPartners + '</span><span class="tooltip-val">' + pNames + (partners.length > 5 ? '…' : '') + '</span></div>';
      } else {
        html += '<div class="tooltip-meta">' + d.country + ' · ' + d.sector + '</div>';
        const suppliers = koreanCompanies.filter(c => companyLinksTo(c, d.id));
        if (suppliers.length) {
          const names = suppliers.slice(0, 4).map(s => lang === 'en' ? s.nameEn : s.name).join(', ');
          html += '<div class="tooltip-row"><span class="tooltip-label">' + t.ttSuppliers + '</span><span class="tooltip-val">' + names + (suppliers.length > 4 ? '…' : '') + '</span></div>';
        }
      }
      tt.innerHTML = html; tt.style.display = 'block';
      const rect = svgEl.node().getBoundingClientRect();
      tt.style.left = (e.pageX - rect.left - window.scrollX + 14) + 'px';
      tt.style.top = (e.pageY - rect.top - window.scrollY - 10) + 'px';
    }
    function hideTooltip() { document.getElementById('graph-tooltip').style.display = 'none'; }
    function resetZoom() { const svgNode = svgEl.node(); svgEl.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity.translate(svgNode.clientWidth * 0.05, svgNode.clientHeight * 0.05).scale(0.82)); }
    function zoomIn() { svgEl.transition().duration(300).call(zoomBehavior.scaleBy, 1.3); }
    function zoomOut() { svgEl.transition().duration(300).call(zoomBehavior.scaleBy, 0.77); }


    function resetTableFilters() {
      currentChain = 'all';
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
      InvestingMapHeatmap.render({
        container: el,
        legend: document.getElementById('heatmap-legend'),
        companies: koreanCompanies,
        chainColors: CHAIN_COLORS,
        lang: lang,
        formatMcap: fmtMcapTableCell,
        onSelect: function (c) {
          resetTableFilters();
          switchTab('table', document.getElementById('tab-btn-table'));
          setTimeout(function () {
            if (window.InvestingMapMobileTable) { InvestingMapMobileTable.scrollToTicker(c.ticker || ''); return; }
          var row = document.querySelector('#table-body tr[data-ticker="' + (c.ticker || '') + '"]');
            if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 40);
        }
      });
      el.querySelectorAll('.hm-tile').forEach(function (g) {
        if (g.querySelector('.hm-name')) g.setAttribute('data-leaf', '1');
      });
    }

    function switchTab(tab, btn) {
      document.body.classList.toggle('im-tab-table', tab === 'table');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab).classList.add('active');
      if (btn) btn.classList.add('active');
      if (tab === 'heatmap') setTimeout(renderHeatmap, 40);
      if (tab === 'graph') setTimeout(() => { if (!svgEl) buildGraph(); }, 50);
    }

    loadFx().then(function () {
      document.body.classList.toggle('im-tab-table', document.getElementById('tab-table')?.classList.contains('active'));
      if (document.getElementById('tab-heatmap')?.classList.contains('active')) setTimeout(renderHeatmap, 80);
      applyLang();
      if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.start) {
        InvestingMapLiveQuotes.start({
          getCompanies: function () { return koreanCompanies; },
          renderTable: function () { renderTable(); if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap(); },
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
          }
        });
      }
    });
