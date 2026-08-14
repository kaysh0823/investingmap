import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'bigchip', 'korea_bigchip_map.html');

function replaceBetween(source, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) {
    throw new Error(`bigchip patch boundary missing: ${startNeedle} → ${endNeedle}`);
  }
  return source.slice(0, start) + replacement.trim() + '\n\n    ' + source.slice(end);
}

/**
 * The graph itself uses the shared curated-map renderer so bigchip matches every other
 * sector map. Bigchip layers local filter controls and relationship-role edge styling
 * onto that renderer; other maps are not patched.
 */
const CSS = `
    /* bigchip relation tags */
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

const TABLE_HELPER = `
function bigchipEscape(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function bigchipRole(kind) {
      return kind === 'supplier' || kind === 'customer' || kind === 'peer' ? kind : 'peer';
    }
    function bigchipRelationTags(c) {
      const maxVisible = 8;
      const dots = { KR: '#58a6ff', US: '#f0a44b', TW: '#4fc3a1', JP: '#d78ee8', NL: '#7fb7ff', CN: '#ef6b73', DE: '#f3c969', FR: '#8fb7ff', EU: '#a8b3c7' };
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

const LEGEND = `
function buildSidebarLegend() {
      const t = T[lang];
      const chainContainer = document.getElementById('sb-chain-legend');
      const chains = ['종합반도체', 'HBM·메모리'];
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

const GRAPH = `
let simulation, svgEl, g, zoomBehavior, selectedNode = null, highlightedChain = null;
    const BIGCHIP_EDGE_COLORS = { supplier: '#58a6ff', customer: '#f0a44b', peer: '#8b949e' };
    const bigchipFilterState = { chains: new Set(), regions: new Set(), roles: new Set() };
    let bigchipGraphNodes = null, bigchipGraphLinks = null;

    function bigchipLinkRole(link) {
      return link.kind === 'supplier' || link.kind === 'customer' || link.kind === 'peer' ? link.kind : 'peer';
    }
    function bigchipLinkVisible(link) {
      const target = link.target && typeof link.target === 'object' ? link.target : null;
      if (bigchipFilterState.chains.size && !bigchipFilterState.chains.has(link.sourceChain)) return false;
      if (bigchipFilterState.roles.size && !bigchipFilterState.roles.has(bigchipLinkRole(link))) return false;
      if (bigchipFilterState.regions.size && (!target || !bigchipFilterState.regions.has(target.region))) return false;
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
        .attr('stroke', (link) => BIGCHIP_EDGE_COLORS[bigchipLinkRole(link)])
        .attr('stroke-dasharray', (link) => bigchipLinkRole(link) === 'peer' ? '4 4' : (link.evidence === 'reported' ? '3 4' : null))
        .attr('stroke-opacity', (link) => {
          if (!bigchipLinkVisible(link)) return 0.018;
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
      const ANGLE = { '종합반도체': 0, 'HBM·메모리': 180 };
      const nodes = [], nodeIndex = {};
      koreanCompanies.forEach((company) => {
        nodes.push({
          id: company.id, label: company.name, labelEn: company.nameEn, type: 'korean', chain: company.chain,
          ticker: company.ticker, market: company.market, semType: company.semType, semTypeEn: company.semTypeEn,
          products: company.products, productsEn: company.productsEn, revenue: company.revenue, mcapWon: company.mcapWon,
          revTier: company.revTier, data: company, tags: company.tags || [],
          r: company.revTier === 3 ? 18 : company.revTier === 2 ? 13 : 9
        });
        nodeIndex[company.id] = nodes.length - 1;
      });
      const usedGlobal = new Set();
      koreanCompanies.forEach((company) => (company.partners || []).forEach((partner) => usedGlobal.add(partnerRef(partner).id)));
      globalCompanies.filter((company) => usedGlobal.has(company.id)).forEach((company) => {
        nodes.push({
          id: company.id, label: company.name, labelEn: company.nameEn || company.name, type: 'global',
          region: company.region, countryCode: company.countryCode, sector: company.sector, country: company.country,
          ticker: company.ticker || '', targetUrl: company.targetUrl || '', r: 7
        });
        nodeIndex[company.id] = nodes.length - 1;
      });
      const links = [];
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

      const d3svg = d3.select('#graph-svg');
      d3svg.selectAll('*').remove();
      svgEl = d3svg;
      zoomBehavior = d3.zoom().scaleExtent([0.15, 4]).on('zoom', (event) => g.attr('transform', event.transform));
      d3svg.call(zoomBehavior);
      d3svg.on('click', (event) => { if (event.target === d3svg.node() || event.target.tagName === 'svg') resetSelection(); });
      g = d3svg.append('g');
      simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((node) => node.id).distance(128).strength(0.28))
        .force('charge', d3.forceManyBody().strength((node) => node.type === 'korean' ? -230 : -90))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide((node) => node.r + 8))
        .force('x', d3.forceX((node) => {
          if (node.type === 'korean') {
            const angle = ANGLE[node.chain] || 0;
            return W / 2 + Math.cos(angle * Math.PI / 180) * 145;
          }
          return W / 2;
        }).strength(0.055))
        .force('y', d3.forceY((node) => {
          if (node.type === 'korean') {
            const angle = ANGLE[node.chain] || 0;
            return H / 2 + Math.sin(angle * Math.PI / 180) * 145;
          }
          return H / 2;
        }).strength(0.055));

      const link = g.append('g').selectAll('line').data(links).join('line');
      const node = g.append('g').selectAll('g').data(nodes).join('g')
        .attr('class', (item) => \`node node-\${item.type}\`).attr('cursor', 'pointer')
        .on('mouseover', (event, item) => showTooltip(event, item))
        .on('mouseout', () => hideTooltip())
        .on('click', (event, item) => { event.stopPropagation(); selectNode(item, node, link); })
        .on('dblclick', (event, item) => {
          if (item.type === 'global' && item.targetUrl) {
            event.preventDefault();
            window.location.href = item.targetUrl + '&lang=' + encodeURIComponent(lang);
          }
        })
        .call(d3.drag()
          .on('start', (event, item) => { if (!event.active) simulation.alphaTarget(0.3).restart(); item.fx = item.x; item.fy = item.y; })
          .on('drag', (event, item) => { item.fx = event.x; item.fy = event.y; })
          .on('end', (event, item) => { if (!event.active) simulation.alphaTarget(0); item.fx = null; item.fy = null; }));
      node.filter((item) => item.type === 'korean').append('circle')
        .attr('r', (item) => item.r).attr('fill', (item) => CHAIN_COLORS[item.chain] || '#888')
        .attr('fill-opacity', 0.85).attr('stroke', graphStroke).attr('stroke-width', 1.5);
      node.filter((item) => item.type === 'global').append('polygon')
        .attr('points', (item) => { const r = item.r + 2; return \`0,\${-r} \${r},0 0,\${r} \${-r},0\`; })
        .attr('fill', (item) => REGION_COLORS[item.region] || '#888').attr('fill-opacity', 0.8)
        .attr('stroke', graphStroke).attr('stroke-width', 1.2);
      node.filter((item) => item.r >= 9 || item.type === 'global').append('text')
        .text((item) => lang === 'en' ? (item.labelEn || item.label) : item.label)
        .attr('text-anchor', 'middle').attr('dy', (item) => item.r + 11)
        .attr('font-size', (item) => item.type === 'korean' ? (item.r >= 13 ? 11 : 9) : 9)
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

export function applyBigchipRelationNetwork() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  html = html.replace('</style>', `${CSS}\n  </style>`);
  html = html.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=4"');
  html = html.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=9"');
  html = replaceBetween(html, 'function buildSidebarLegend() {', '// TABLE', LEGEND);
  html = replaceBetween(html, 'let simulation, svgEl, g, zoomBehavior', '    function showTooltip(', GRAPH);
  html = html.replace('function renderTable() {', `${TABLE_HELPER.trim()}\n\n    function renderTable() {`);
  const tagged = html.replace(
    /const partnerHtml = c\.partners\.slice\(0, 6\)[\s\S]*?\(c\.partners\.length > 6 \? `<span class="partner-tag">\+\$\{c\.partners\.length - 6\}<\/span>` : ''\);/,
    'const partnerHtml = bigchipRelationTags(c);',
  );
  if (tagged === html) throw new Error('bigchip patch: partner cell renderer not found');
  html = tagged;
  html = html.replace(
    '<td><div class="partners-list">${partnerHtml}</div></td>',
    '<td class="bigchip-relations-cell"><div class="bigchip-relation-tags">${partnerHtml}</div></td>',
  );
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('OK apply_bigchip_relation_network');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyBigchipRelationNetwork();
}
