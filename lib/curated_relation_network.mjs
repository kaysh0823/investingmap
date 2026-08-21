/**
 * Shared curated relation-network patches (CSS / sidebar / graph / table helpers).
 * Used by bigchip (ticker hubs) and semiconductor (value-chain group hubs).
 *
 * Inject before use:
 *   const CURATED_RELATION_MODE = 'ticker' | 'chainGroup';
 *   // chainGroup only:
 *   const CURATED_RELATION_HUBS = [{ id, chain, label, labelEn, partners: [...] }, ...];
 *   const CURATED_HUB_ANGLE = { [chain]: degrees, ... };
 *   const CURATED_FALLBACK_ANGLE = { [chain]: degrees, ... }; // non-hub chains
 */

export const CURATED_RELATION_CSS = `
    /* curated relation tags (bigchip-compatible class names) */
    #th-partners{width:230px;max-width:230px}
    .bigchip-relations-cell{width:230px;max-width:230px;white-space:normal}
    .bigchip-relation-tags{display:flex;flex-wrap:wrap;gap:3px;max-width:230px;max-height:52px;overflow:hidden}
    .bigchip-relation-tag{display:inline-flex;align-items:center;gap:4px;max-width:106px;padding:2px 6px;border:1px solid var(--border);border-radius:999px;font-size:10px;line-height:16px;color:var(--text-muted);background:var(--surface2);text-decoration:none}
    a.bigchip-relation-tag:hover{border-color:var(--accent);color:var(--accent)}
    .bigchip-relation-tag.supplier{border-color:rgba(88,166,255,.42)}
    .bigchip-relation-tag.peer{border-color:rgba(139,148,158,.42)}
    .bigchip-relation-tag.customer{border-color:rgba(240,164,75,.48)}
    .bigchip-relation-tag.more{font-weight:700;color:var(--text)}
    .bigchip-country-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--country-dot,#8b949e)}
    .bigchip-relation-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bigchip-filter-group{margin-top:10px}
    .bigchip-filter-label{margin-bottom:5px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}
    .bigchip-filter-list{display:flex;flex-wrap:wrap;gap:5px}
    .bigchip-filter-btn{display:inline-flex;align-items:center;gap:5px;min-height:27px;padding:4px 7px;border:1px solid var(--border);border-radius:7px;background:var(--surface2);color:var(--text-muted);font:inherit;font-size:10px;cursor:pointer}
    .bigchip-filter-btn:hover{border-color:var(--accent);color:var(--text)}
    .bigchip-filter-btn.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,var(--surface2));color:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
    .bigchip-filter-btn.reset{width:100%;justify-content:center;margin-top:9px;color:var(--text)}
    .bigchip-filter-btn.reset:disabled{opacity:.45;cursor:default;border-color:var(--border)}
    .bigchip-edge-swatch{display:inline-block;width:19px;height:0;border-top:2px solid var(--edge-color)}
    .bigchip-edge-swatch.peer{border-top-style:dashed}
    .bigchip-filter-dot{width:8px;height:8px;border-radius:50%;background:var(--filter-color,#8b949e);flex:none}
    .bigchip-filter-diamond{width:8px;height:8px;background:var(--filter-color,#8b949e);transform:rotate(45deg);flex:none}
    .bigchip-filter-summary{margin-top:8px;font-size:10px;color:var(--accent);line-height:1.45}
    @media (max-width: 768px) {
      #th-partners,
      .bigchip-relations-cell {
        width: 176px;
        max-width: 176px
      }

      .bigchip-relation-tags {
        max-width: 176px
      }

      .bigchip-filter-btn {
        min-height: 32px;
        padding: 6px 8px
      }
    }
`;

export const CURATED_RELATION_TABLE_HELPER = `
function bigchipEscape(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function bigchipRole(kind) {
      return kind === 'supplier' || kind === 'customer' || kind === 'peer' ? kind : 'peer';
    }
    function bigchipPresentChains() {
      const present = new Set();
      const hubs = (typeof CURATED_RELATION_HUBS !== 'undefined' && CURATED_RELATION_HUBS) || [];
      hubs.forEach((hub) => { if (hub.chain) present.add(hub.chain); });
      koreanCompanies.forEach((c) => {
        if (c.chain && c.chain !== 'IDM/종합반도체') present.add(c.chain);
      });
      globalCompanies.forEach((c) => {
        if (c.ticker && c.chain && c.chain !== 'IDM/종합반도체') present.add(c.chain);
      });
      const order = (typeof BIGCHIP_CHAIN_ORDER !== 'undefined' && BIGCHIP_CHAIN_ORDER.length)
        ? BIGCHIP_CHAIN_ORDER
        : ((typeof CURATED_CHAIN_ORDER !== 'undefined' && CURATED_CHAIN_ORDER.length) ? CURATED_CHAIN_ORDER : Object.keys(CHAIN_COLORS));
      return order.filter((ch) => ch !== 'IDM/종합반도체' && present.has(ch));
    }
    function bigchipNodeFill(item) {
      if (item.type === 'global') return REGION_COLORS[item.region] || '#888';
      if (item.chain && CHAIN_COLORS[item.chain]) return CHAIN_COLORS[item.chain];
      return (typeof BIGCHIP_NEUTRAL_COLOR !== 'undefined' ? BIGCHIP_NEUTRAL_COLOR : '#8b949e');
    }
    function bigchipIsDomesticPartner(company) {
      return !!(company.ticker || company.countryCode === 'KR' || company.isKR);
    }
    function bigchipRelationTags(c) {
      const maxVisible = 8;
      const dots = { KR: '#58a6ff', US: '#f0a44b', TW: '#4fc3a1', JP: '#d78ee8', NL: '#7fb7ff', CN: '#ef6b73', DE: '#f3c969', FR: '#8fb7ff', SG: '#5eead4', GB: '#a5b4fc', EU: '#a8b3c7' };
      const t = T[lang];
      const roleLabel = { supplier: t.relationSupplier, peer: t.relationPeer, customer: t.relationCustomer };
      const tags = (c.partners || []).slice(0, maxVisible).map((p) => {
        const pr = partnerRef(p);
        const rel = globalCompanies.find((x) => x.id === pr.id) || {};
        const info = getPartnerInfo(pr.id);
        const role = bigchipRole(pr.kind);
        const note = lang === 'en' ? (pr.edgeLabelEn || pr.edgeLabel) : (pr.edgeLabel || pr.edgeLabelEn);
        const evidence = (p && p.evidence === 'reported') ? t.reportedEvidence : t.confirmedEvidence;
        const title = [info.name, roleLabel[role], note, evidence].filter(Boolean).join(' · ');
        const dot = \`<span class="bigchip-country-dot" style="--country-dot:\${dots[rel.countryCode] || '#8b949e'}"></span><span class="bigchip-relation-name">\${bigchipEscape(info.name)}</span>\`;
        if (rel.targetUrl) {
          return \`<a class="bigchip-relation-tag \${role}" href="\${bigchipEscape(rel.targetUrl)}&lang=\${lang}" title="\${bigchipEscape(title)}">\${dot}</a>\`;
        }
        return \`<span class="bigchip-relation-tag \${role}" title="\${bigchipEscape(title)}">\${dot}</span>\`;
      });
      const hidden = Math.max(0, (c.partners || []).length - maxVisible);
      if (hidden) tags.push(\`<span class="bigchip-relation-tag more" title="+\${hidden}">+\${hidden}</span>\`);
      return tags.join('');
    }
`;

export const CURATED_RELATION_LEGEND = `
function buildSidebarLegend() {
      const t = T[lang];
      const chainContainer = document.getElementById('sb-chain-legend');
      const chains = bigchipPresentChains();
      chainContainer.innerHTML = '<div class="bigchip-filter-list">' + chains.map((ch) => {
        const active = bigchipFilterState.chains.has(ch);
        const label = (window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel)
          ? InvestingMapI18n.chainDisplayLabel(ch, t)
          : (t.chainLabel[ch] || ch);
        return \`<button type="button" class="bigchip-filter-btn\${active ? ' active' : ''}" aria-pressed="\${active}" onclick="toggleBigchipFilter('chains','\${ch}')"><span class="bigchip-filter-dot" style="--filter-color:\${CHAIN_COLORS[ch]}"></span>\${label}</button>\`;
      }).join('') + '</div>';

      const regions = ['us', 'tw', 'cn', 'eu', 'kr', 'jp', 'gb'];
      const roles = [
        ['supplier', t.relationSupplier, '#58a6ff'],
        ['customer', t.relationCustomer, '#f0a44b'],
        ['peer', t.relationPeer, '#8b949e']
      ];
      const roleButtons = roles.map(([role, label, color]) => {
        const active = bigchipFilterState.roles.has(role);
        return \`<button type="button" class="bigchip-filter-btn\${active ? ' active' : ''}" aria-pressed="\${active}" onclick="toggleBigchipFilter('roles','\${role}')"><span class="bigchip-edge-swatch \${role}" style="--edge-color:\${color}"></span>\${label}</button>\`;
      }).join('');
      const countryButtons = regions.map((region) => {
        const active = bigchipFilterState.regions.has(region);
        return \`<button type="button" class="bigchip-filter-btn\${active ? ' active' : ''}" aria-pressed="\${active}" onclick="toggleBigchipFilter('regions','\${region}')"><span class="bigchip-filter-diamond" style="--filter-color:\${REGION_COLORS[region]}"></span>\${t.regionLabel[region]}</button>\`;
      }).join('');
      const edgeLegend = roles.map(([role, label, color]) =>
        \`<div class="legend-item"><span class="bigchip-edge-swatch \${role}" style="--edge-color:\${color}"></span>\${label}</div>\`
      ).join('');
      const activeCount = bigchipFilterState.chains.size + bigchipFilterState.roles.size + bigchipFilterState.regions.size;
      const regionContainer = document.getElementById('sb-region-legend');
      regionContainer.innerHTML =
        \`<div class="bigchip-filter-group"><div class="bigchip-filter-label">\${t.filterRole}</div><div class="bigchip-filter-list">\${roleButtons}</div></div>\` +
        \`<div class="bigchip-filter-group"><div class="bigchip-filter-label">\${t.filterCountry}</div><div class="bigchip-filter-list">\${countryButtons}</div></div>\` +
        \`<div class="bigchip-filter-group"><div class="bigchip-filter-label">\${t.edgeLegend}</div>\${edgeLegend}</div>\` +
        \`<button type="button" class="bigchip-filter-btn reset" onclick="resetBigchipFilters()" \${activeCount ? '' : 'disabled'}>\${t.filterReset}</button>\` +
        (activeCount ? \`<div class="bigchip-filter-summary">\${t.filterActive}: \${activeCount}</div>\` : '') +
        \`<div style="margin-top:10px;font-size:11px;color:var(--text-muted);line-height:1.7">\${t.peerNetworkDesc}</div>\`;
    }
`;

export const CURATED_RELATION_GRAPH = `
let simulation, svgEl, g, zoomBehavior, selectedNode = null, highlightedChain = null;
    const BIGCHIP_EDGE_COLORS = { supplier: '#58a6ff', customer: '#f0a44b', peer: '#8b949e', member: '#484f58' };
    const bigchipFilterState = { chains: new Set(), regions: new Set(), roles: new Set() };
    let bigchipGraphNodes = null, bigchipGraphLinks = null;

    function curatedMode() {
      return (typeof CURATED_RELATION_MODE !== 'undefined' && CURATED_RELATION_MODE) || 'ticker';
    }
    function bigchipLinkRole(link) {
      return link.kind === 'supplier' || link.kind === 'customer' || link.kind === 'peer' ? link.kind : (link.kind === 'member' ? 'member' : 'peer');
    }
    function bigchipLinkVisible(link) {
      if (link.kind === 'member') {
        if (bigchipFilterState.roles.size) return false;
        if (bigchipFilterState.chains.size) {
          const source = link.source && typeof link.source === 'object' ? link.source : null;
          const target = link.target && typeof link.target === 'object' ? link.target : null;
          const hit = [];
          if (source && source.chain) hit.push(source.chain);
          if (target && target.chain) hit.push(target.chain);
          if (link.sourceChain) hit.push(link.sourceChain);
          if (!hit.some((ch) => bigchipFilterState.chains.has(ch))) return false;
        }
        return true;
      }
      const source = link.source && typeof link.source === 'object' ? link.source : null;
      const target = link.target && typeof link.target === 'object' ? link.target : null;
      if (bigchipFilterState.chains.size) {
        const hit = [];
        if (source && source.chain) hit.push(source.chain);
        else if (link.sourceChain) hit.push(link.sourceChain);
        if (target && target.type === 'korean' && target.chain) hit.push(target.chain);
        if (!hit.some((ch) => bigchipFilterState.chains.has(ch))) return false;
      }
      if (bigchipFilterState.roles.size && !bigchipFilterState.roles.has(bigchipLinkRole(link))) return false;
      if (bigchipFilterState.regions.size) {
        if (target && target.type === 'global' && !bigchipFilterState.regions.has(target.region)) return false;
      }
      return true;
    }
    function toggleBigchipFilter(group, value) {
      const selected = bigchipFilterState[group];
      if (!selected) return;
      if (selected.has(value)) selected.delete(value); else selected.add(value);
      selectedNode = null;
      highlightedChain = null;
      buildSidebarLegend();
      applyBigchipGraphFilters();
    }
    function resetBigchipFilters() {
      bigchipFilterState.chains.clear();
      bigchipFilterState.regions.clear();
      bigchipFilterState.roles.clear();
      selectedNode = null;
      highlightedChain = null;
      buildSidebarLegend();
      applyBigchipGraphFilters();
    }
    function applyBigchipGraphFilters() {
      if (!svgEl || !bigchipGraphNodes || !bigchipGraphLinks) return;
      const visibleNodeIds = new Set();
      bigchipGraphLinks.each((link) => {
        if (!bigchipLinkVisible(link)) return;
        visibleNodeIds.add(link.source.id || link.source);
        visibleNodeIds.add(link.target.id || link.target);
      });
      bigchipGraphNodes
        .classed('node-dim', (node) => {
          const passes = visibleNodeIds.has(node.id);
          if (!passes) return true;
          if (!selectedNode) return false;
          if (node.id === selectedNode) return false;
          let connected = false;
          bigchipGraphLinks.each((link) => {
            if (!bigchipLinkVisible(link)) return;
            const s = link.source.id || link.source, target = link.target.id || link.target;
            if ((s === selectedNode && target === node.id) || (target === selectedNode && s === node.id)) connected = true;
          });
          return !connected;
        })
        .style('pointer-events', (node) => visibleNodeIds.has(node.id) ? 'auto' : 'none');
      bigchipGraphLinks
        .attr('stroke', (link) => BIGCHIP_EDGE_COLORS[bigchipLinkRole(link)] || BIGCHIP_EDGE_COLORS.peer)
        .attr('stroke-dasharray', (link) => {
          if (link.kind === 'member') return '2 3';
          return bigchipLinkRole(link) === 'peer' ? '4 4' : (link.evidence === 'reported' ? '3 4' : null);
        })
        .attr('stroke-opacity', (link) => {
          if (!bigchipLinkVisible(link)) return 0.018;
          if (link.kind === 'member') return selectedNode ? 0.25 : 0.28;
          if (!selectedNode) return bigchipLinkRole(link) === 'peer' ? 0.42 : 0.5;
          const s = link.source.id || link.source, target = link.target.id || link.target;
          return s === selectedNode || target === selectedNode ? 0.95 : 0.025;
        })
        .attr('stroke-width', (link) => {
          const base = link.baseStrokeW || 1.15;
          if (!bigchipLinkVisible(link)) return 0.45;
          if (!selectedNode) return base;
          const s = link.source.id || link.source, target = link.target.id || link.target;
          return s === selectedNode || target === selectedNode ? Math.max(2.4, base * 2.1) : 0.5;
        });
    }

    function buildGraph() {
      const container = document.getElementById('graph-svg');
      const W = container.clientWidth || 900, H = container.clientHeight || 700;
      if (simulation) simulation.stop();
      const graphStroke = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--graph-stroke').trim() || '#0d1117'; } catch (e) { return '#0d1117'; } })();
      const graphLabel = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--graph-label').trim() || '#c9d1d9'; } catch (e) { return '#c9d1d9'; } })();
      const mode = curatedMode();
      const hubs = (typeof CURATED_RELATION_HUBS !== 'undefined' && CURATED_RELATION_HUBS) || [];
      const hubByChain = new Map(hubs.map((hub) => [hub.chain, hub]));
      const presentChains = bigchipPresentChains();
      const ANGLE = Object.assign({},
        (typeof CURATED_FALLBACK_ANGLE !== 'undefined' && CURATED_FALLBACK_ANGLE) || {},
        (typeof CURATED_HUB_ANGLE !== 'undefined' && CURATED_HUB_ANGLE) || {}
      );
      presentChains.forEach((ch, i) => {
        if (ANGLE[ch] == null) ANGLE[ch] = presentChains.length ? Math.round((360 / presentChains.length) * i) : 0;
      });
      const nodes = [], nodeIndex = {};
      const hubRadius = mode === 'chainGroup' ? 210 : 0;
      const memberRadius = mode === 'chainGroup' ? 145 : 145;

      if (mode === 'chainGroup') {
        hubs.forEach((hub) => {
          nodes.push({
            id: hub.id, label: hub.label, labelEn: hub.labelEn || hub.label, type: 'korean',
            chain: hub.chain, isHub: true, hubKind: 'group', r: 22, revTier: 3
          });
          nodeIndex[hub.id] = nodes.length - 1;
        });
      }

      koreanCompanies.forEach((company) => {
        const hub = hubByChain.get(company.chain);
        const isTickerHub = mode === 'ticker';
        nodes.push({
          id: company.id, label: company.name, labelEn: company.nameEn, type: 'korean', chain: company.chain,
          ticker: company.ticker, market: company.market, semType: company.semType, semTypeEn: company.semTypeEn,
          products: company.products, productsEn: company.productsEn, revenue: company.revenue, mcapWon: company.mcapWon,
          revTier: company.revTier, data: company, tags: company.tags || [],
          isHub: isTickerHub, hubId: hub ? hub.id : null, hubKind: isTickerHub ? 'ticker' : null,
          r: isTickerHub
            ? (company.revTier === 3 ? 18 : company.revTier === 2 ? 13 : 9)
            : (company.revTier === 3 ? 14 : company.revTier === 2 ? 11 : 8)
        });
        nodeIndex[company.id] = nodes.length - 1;
      });

      const usedGlobal = new Set();
      if (mode === 'chainGroup') {
        hubs.forEach((hub) => (hub.partners || []).forEach((partner) => usedGlobal.add(partnerRef(partner).id)));
      }
      koreanCompanies.forEach((company) => (company.partners || []).forEach((partner) => usedGlobal.add(partnerRef(partner).id)));
      globalCompanies.filter((company) => usedGlobal.has(company.id)).forEach((company) => {
        if (bigchipIsDomesticPartner(company) && company.ticker) {
          nodes.push({
            id: company.id, label: company.name, labelEn: company.nameEn || company.name, type: 'korean',
            chain: company.chain || '', ticker: company.ticker || '', market: company.market || '',
            region: company.region, countryCode: company.countryCode, sector: company.sector,
            country: company.country, targetUrl: company.targetUrl || '', mcapWon: company.mcapWon || 0,
            revTier: company.revTier || 1, isHub: false,
            r: company.revTier === 3 ? 14 : company.revTier === 2 ? 11 : 8
          });
        } else if (bigchipIsDomesticPartner(company) && !company.ticker) {
          // KR reference nodes (samsung_d / skhynix_d): country diamond still, but keep circle if chain known
          nodes.push({
            id: company.id, label: company.name, labelEn: company.nameEn || company.name, type: 'global',
            region: company.region || 'kr', countryCode: company.countryCode || 'KR', sector: company.sector,
            country: company.country, ticker: '', targetUrl: company.targetUrl || '', r: 8
          });
        } else {
          nodes.push({
            id: company.id, label: company.name, labelEn: company.nameEn || company.name, type: 'global',
            region: company.region, countryCode: company.countryCode, sector: company.sector, country: company.country,
            ticker: company.ticker || '', targetUrl: company.targetUrl || '', r: 7
          });
        }
        nodeIndex[company.id] = nodes.length - 1;
      });

      const links = [];
      if (mode === 'chainGroup') {
        koreanCompanies.forEach((company) => {
          const hub = hubByChain.get(company.chain);
          if (!hub || nodeIndex[hub.id] === undefined) return;
          links.push({
            source: company.id, target: hub.id, sourceChain: company.chain,
            kind: 'member', role: 'member', evidence: 'confirmed', baseStrokeW: 0.7
          });
        });
        hubs.forEach((hub) => (hub.partners || []).forEach((partner) => {
          const relation = partnerRef(partner);
          if (nodeIndex[relation.id] === undefined) return;
          links.push({
            source: hub.id, target: relation.id, sourceChain: hub.chain,
            edgeLabel: relation.edgeLabel, edgeLabelEn: relation.edgeLabelEn,
            kind: bigchipRole(relation.kind || relation.role), role: bigchipRole(relation.kind || relation.role),
            evidence: partner && typeof partner === 'object' ? (partner.evidence || 'confirmed') : 'confirmed',
            baseStrokeW: partner && partner.evidence === 'reported' ? 0.9 : 1.2
          });
        }));
      } else {
        koreanCompanies.forEach((company) => (company.partners || []).forEach((partner) => {
          const relation = partnerRef(partner);
          if (nodeIndex[relation.id] === undefined) return;
          links.push({
            source: company.id, target: relation.id, sourceChain: company.chain,
            edgeLabel: relation.edgeLabel, edgeLabelEn: relation.edgeLabelEn,
            kind: bigchipLinkRole(relation), role: bigchipLinkRole(relation),
            evidence: partner && typeof partner === 'object' ? (partner.evidence || 'confirmed') : 'confirmed',
            baseStrokeW: partner && partner.evidence === 'reported' ? 0.9 : 1.2
          });
        }));
      }
      // Non-curated companies keep legacy partner edges when not covered by a hub.
      if (mode === 'chainGroup') {
        koreanCompanies.forEach((company) => {
          if (hubByChain.has(company.chain)) return;
          (company.partners || []).forEach((partner) => {
            const relation = partnerRef(partner);
            if (nodeIndex[relation.id] === undefined) return;
            const kind = relation.kind === 'supplier' || relation.kind === 'customer' || relation.kind === 'peer'
              ? relation.kind : 'peer';
            links.push({
              source: company.id, target: relation.id, sourceChain: company.chain,
              edgeLabel: relation.edgeLabel, edgeLabelEn: relation.edgeLabelEn,
              kind, role: kind, evidence: partner && partner.evidence ? partner.evidence : 'confirmed',
              baseStrokeW: 1.0
            });
          });
        });
      }

      const d3svg = d3.select('#graph-svg');
      d3svg.selectAll('*').remove();
      svgEl = d3svg;
      zoomBehavior = d3.zoom().scaleExtent([0.15, 4]).on('zoom', (event) => g.attr('transform', event.transform));
      d3svg.call(zoomBehavior);
      d3svg.on('click', (event) => { if (event.target === d3svg.node() || event.target.tagName === 'svg') resetSelection(); });
      g = d3svg.append('g');
      simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((node) => node.id)
          .distance((link) => (link.kind === 'member' ? 54 : 128))
          .strength((link) => (link.kind === 'member' ? 0.45 : 0.28)))
        .force('charge', d3.forceManyBody().strength((node) => {
          if (node.isHub && node.hubKind === 'group') return -420;
          return node.type === 'korean' ? -230 : -90;
        }))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide((node) => node.r + (node.isHub && node.hubKind === 'group' ? 14 : 8)))
        .force('x', d3.forceX((node) => {
          if (node.isHub && node.hubKind === 'group') {
            const angle = ANGLE[node.chain] || 0;
            return W / 2 + Math.cos(angle * Math.PI / 180) * hubRadius;
          }
          if (node.isHub) return W / 2;
          if (node.type === 'korean') {
            const angle = ANGLE[node.chain] || 0;
            return W / 2 + Math.cos(angle * Math.PI / 180) * memberRadius;
          }
          return W / 2;
        }).strength((node) => (node.isHub ? 0.14 : 0.055)))
        .force('y', d3.forceY((node) => {
          if (node.isHub && node.hubKind === 'group') {
            const angle = ANGLE[node.chain] || 0;
            return H / 2 + Math.sin(angle * Math.PI / 180) * hubRadius;
          }
          if (node.isHub) return H / 2;
          if (node.type === 'korean') {
            const angle = ANGLE[node.chain] || 0;
            return H / 2 + Math.sin(angle * Math.PI / 180) * memberRadius;
          }
          return H / 2;
        }).strength((node) => (node.isHub ? 0.14 : 0.055)));

      const link = g.append('g').selectAll('line').data(links).join('line');
      const node = g.append('g').selectAll('g').data(nodes).join('g')
        .attr('class', (item) => \`node node-\${item.type}\`).attr('cursor', 'pointer')
        .on('mouseover', (event, item) => showTooltip(event, item))
        .on('mouseout', () => hideTooltip())
        .on('click', (event, item) => { event.stopPropagation(); selectNode(item, node, link); })
        .on('dblclick', (event, item) => {
          if (item.targetUrl) {
            event.preventDefault();
            window.location.href = item.targetUrl + '&lang=' + encodeURIComponent(lang);
          }
        })
        .call(d3.drag()
          .on('start', (event, item) => { if (!event.active) simulation.alphaTarget(0.3).restart(); item.fx = item.x; item.fy = item.y; })
          .on('drag', (event, item) => { item.fx = event.x; item.fy = event.y; })
          .on('end', (event, item) => { if (!event.active) simulation.alphaTarget(0); item.fx = null; item.fy = null; }));
      node.filter((item) => item.type === 'korean').append('circle')
        .attr('r', (item) => item.r).attr('fill', (item) => bigchipNodeFill(item))
        .attr('fill-opacity', 0.85).attr('stroke', graphStroke)
        .attr('stroke-width', (item) => item.isHub ? 2.4 : 1.5);
      node.filter((item) => item.type === 'global').append('polygon')
        .attr('points', (item) => { const r = item.r + 2; return \`0,\${-r} \${r},0 0,\${r} \${-r},0\`; })
        .attr('fill', (item) => bigchipNodeFill(item)).attr('fill-opacity', 0.8)
        .attr('stroke', graphStroke).attr('stroke-width', 1.2);
      // Every node keeps a name label (relations JSON names); do not gate on radius.
      node.append('text')
        .text((item) => lang === 'en' ? (item.labelEn || item.label) : item.label)
        .attr('text-anchor', 'middle').attr('dy', (item) => item.r + 11)
        .attr('font-size', (item) => item.type === 'korean' ? (item.isHub || item.r >= 13 ? 11 : 9) : 9)
        .attr('fill', graphLabel).attr('pointer-events', 'none');
      simulation.on('tick', () => {
        link.attr('x1', (item) => item.source.x).attr('y1', (item) => item.source.y)
          .attr('x2', (item) => item.target.x).attr('y2', (item) => item.target.y);
        node.attr('transform', (item) => \`translate(\${item.x},\${item.y})\`);
      });
      bigchipGraphNodes = node;
      bigchipGraphLinks = link;
      applyBigchipGraphFilters();
      setTimeout(() => { svgEl.transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity.translate(W * 0.05, H * 0.05).scale(0.88)); }, 1200);
    }

    function selectNode(item) {
      selectedNode = selectedNode === item.id ? null : item.id;
      applyBigchipGraphFilters();
    }
    function resetSelection() {
      selectedNode = null;
      highlightedChain = null;
      applyBigchipGraphFilters();
    }
    function toggleChainHighlight(chain) {
      toggleBigchipFilter('chains', chain);
    }
`;

export const CURATED_RELATION_CHAIN_CHIPS_TICKER = `
function buildChainChips() {
      const t = T[lang];
      const container = document.getElementById('chain-chips');
      const hubChains = [...new Set(koreanCompanies.map((c) => c.chain).filter(Boolean))];
      const chains = ['all', ...hubChains];
      container.innerHTML = chains.map(ch => {
        const label = ch === 'all' ? t.allFilter : ((window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, t) : (t.chainFilter[ch] || ch));
        const isActive = currentChain === ch;
        const color = CHAIN_COLORS[ch];
        const style = isActive ? \`background:\${color || '#4FC3F7'};color:#0d1117;border-color:transparent;\` : '';
        return \`<div class="filter-chip\${isActive ? ' active' : ''}" style="\${style}" data-filter-chain="\${ch}" onclick="setChainFilter('\${ch}',this)">\${label}</div>\`;
      }).join('');
    }
`;

export function replaceBetween(source, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) {
    throw new Error(`curated relation patch boundary missing: ${startNeedle} → ${endNeedle}`);
  }
  return source.slice(0, start) + replacement.trim() + '\n\n    ' + source.slice(end);
}

export function applyCuratedRelationPatches(html, options = {}) {
  const {
    mode = 'ticker',
    chainOrder = null,
    hubsLiteral = null,
    hubAngleLiteral = null,
    fallbackAngleLiteral = null,
    skipChainChips = false,
    sidebarTitleKo = '밸류체인',
    i18nVer = '8',
    heatmapVer = '14',
    patchPartnerCell = true,
  } = options;

  let out = html;
  if (!out.includes('bigchip-relation-tags{')) {
    out = out.replace('</style>', `${CURATED_RELATION_CSS}\n  </style>`);
  }
  out = out.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, `../js/map_i18n.js?v=${i18nVer}"`);
  out = out.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, `../js/map_heatmap.js?v=${heatmapVer}"`);

  const injectBits = [];
  injectBits.push(`const CURATED_RELATION_MODE = '${mode}';`);
  if (chainOrder) {
    injectBits.push(`const BIGCHIP_CHAIN_ORDER = ${JSON.stringify(chainOrder)};`);
    injectBits.push(`const CURATED_CHAIN_ORDER = ${JSON.stringify(chainOrder)};`);
    injectBits.push(`const BIGCHIP_NEUTRAL_COLOR = '#8b949e';`);
  }
  if (hubsLiteral) injectBits.push(`const CURATED_RELATION_HUBS = ${hubsLiteral};`);
  if (hubAngleLiteral) injectBits.push(`const CURATED_HUB_ANGLE = ${hubAngleLiteral};`);
  if (fallbackAngleLiteral) injectBits.push(`const CURATED_FALLBACK_ANGLE = ${fallbackAngleLiteral};`);
  const injectBlock = injectBits.join('\n    ');

  if (out.includes('CURATED_RELATION_MODE')) {
    out = out.replace(
      /\n    const CURATED_RELATION_MODE =[\s\S]*?(?=\n    const (?:FE_CHAINS|BE_CHAINS|REGION_COLORS|T) =)/,
      `\n    ${injectBlock}\n`,
    );
  } else {
    out = out.replace(
      /const CHAIN_COLORS = \{[\s\S]*?\};/,
      (block) => `${block}\n    ${injectBlock}`,
    );
  }

  out = out.replace(
    /<div class="sidebar-title" id="sb-korean">[^<]*<\/div>/,
    `<div class="sidebar-title" id="sb-korean">${sidebarTitleKo}</div>`,
  );
  out = replaceBetween(out, 'function buildSidebarLegend() {', '// TABLE', CURATED_RELATION_LEGEND);
  out = replaceBetween(out, 'let simulation, svgEl, g, zoomBehavior', '    function showTooltip(', CURATED_RELATION_GRAPH);
  if (!skipChainChips) {
    out = replaceBetween(out, 'function buildChainChips() {', '    function buildMarketChips()', CURATED_RELATION_CHAIN_CHIPS_TICKER);
  }
  if (!out.includes('function bigchipEscape(')) {
    out = out.replace('function renderTable() {', `${CURATED_RELATION_TABLE_HELPER.trim()}\n\n    function renderTable() {`);
  }
  if (patchPartnerCell && !out.includes('bigchipRelationTags(c)')) {
    const tagged = out.replace(
      /const partnerHtml = c\.partners\.slice\(0, 6\)[\s\S]*?\(c\.partners\.length > 6 \? `<span class="partner-tag">\+\$\{c\.partners\.length - 6\}<\/span>` : ''\);/,
      'const partnerHtml = bigchipRelationTags(c);',
    );
    if (tagged === out) throw new Error('curated relation patch: partner cell renderer not found');
    out = tagged;
    out = out.replace(
      '<td><div class="partners-list">${partnerHtml}</div></td>',
      '<td class="bigchip-relations-cell"><div class="bigchip-relation-tags">${partnerHtml}</div></td>',
    );
  }
  return out;
}
