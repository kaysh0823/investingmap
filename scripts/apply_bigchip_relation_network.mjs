import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'bigchip', 'korea_bigchip_map.html');

function replaceBetween(source, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) throw new Error(`bigchip patch boundary missing: ${startNeedle} → ${endNeedle}`);
  return source.slice(0, start) + replacement.trim() + '\n\n    ' + source.slice(end);
}

const CSS = `
    /* bigchip relationship network v2 */
    .bigchip-country-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
    .bigchip-country-chip{appearance:none;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);border-radius:999px;padding:4px 8px;font-size:10px;cursor:pointer}
    .bigchip-country-chip.active{border-color:var(--accent);color:var(--accent);background:var(--surface)}
    .bigchip-role-mark{width:12px;height:12px;display:inline-block;margin-right:7px;border:2px solid currentColor;background:transparent}
    .bigchip-role-mark.supplier{clip-path:polygon(50% 0,100% 100%,0 100%)}
    .bigchip-role-mark.peer{transform:rotate(45deg)}
    .bigchip-role-mark.customer{border-radius:3px}
    .bigchip-zone-label{font-weight:700;letter-spacing:.03em}
    @media(max-width:768px){.bigchip-country-chip{padding:5px 8px;font-size:10px}.bigchip-zone-label{font-size:10px}}
`;

const LEGEND = `
function buildSidebarLegend() {
      const t = T[lang];
      const chainContainer = document.getElementById('sb-chain-legend');
      const roles = [
        ['supplier', t.relationSupplier, '#58a6ff'],
        ['peer', t.relationPeer, '#8b949e'],
        ['customer', t.relationCustomer, '#f0a44b']
      ];
      chainContainer.innerHTML = roles.map(([role, label, color]) =>
        \`<div class="legend-item" onclick="highlightBigchipRole('\${role}')">
          <span class="bigchip-role-mark \${role}" style="color:\${color}"></span>\${label}
        </div>\`
      ).join('');
      const countryCodes = [...new Set(globalCompanies.map((x) => x.countryCode).filter(Boolean))];
      const labels = { KR: lang === 'en' ? 'Korea' : '한국', US: lang === 'en' ? 'USA' : '미국', TW: lang === 'en' ? 'Taiwan' : '대만', JP: lang === 'en' ? 'Japan' : '일본', NL: lang === 'en' ? 'Netherlands' : '네덜란드', CN: lang === 'en' ? 'China' : '중국', EU: lang === 'en' ? 'Europe' : '유럽' };
      const regionContainer = document.getElementById('sb-region-legend');
      const buttons = ['all', ...countryCodes].map((code) =>
        \`<button type="button" class="bigchip-country-chip\${activeCountry === code ? ' active' : ''}" onclick="setBigchipCountry('\${code}')">\${code === 'all' ? t.allCountries : (labels[code] || code)}</button>\`
      ).join('');
      regionContainer.innerHTML =
        \`<div style="font-size:11px;color:var(--text-muted)">\${t.countryFilter}</div><div class="bigchip-country-chips">\${buttons}</div>\` +
        \`<div style="margin-top:10px;font-size:11px;color:var(--text-muted);line-height:1.7">\${t.peerNetworkDesc || ''}</div>\`;
      if (svgEl) {
        svgEl.selectAll('.bigchip-zone-label').text((d) => t['relation' + d.charAt(0).toUpperCase() + d.slice(1)] || d);
      }
    }
`;

const GRAPH = `
let activeCountry = 'all', highlightedRole = null;
    const BIGCHIP_ROLE_COLORS = { supplier: '#58a6ff', peer: '#8b949e', customer: '#f0a44b' };
    const BIGCHIP_COUNTRY_COLORS = { KR: '#58a6ff', US: '#f0a44b', TW: '#4fc3a1', JP: '#d78ee8', NL: '#7fb7ff', CN: '#ef6b73', EU: '#a8b3c7' };

    function bigchipPartnerRef(p) {
      const base = partnerRef(p);
      return { ...base, evidence: (p && typeof p === 'object' && p.evidence) || 'confirmed', source: (p && typeof p === 'object' && p.source) || '' };
    }
    function bigchipRole(kind) {
      return kind === 'supplier' || kind === 'customer' || kind === 'peer' ? kind : 'peer';
    }
    function bigchipRoleColor(role) { return BIGCHIP_ROLE_COLORS[role] || BIGCHIP_ROLE_COLORS.peer; }
    function bigchipCountryColor(code) { return BIGCHIP_COUNTRY_COLORS[code] || '#a8b3c7'; }
    function setBigchipCountry(code) {
      activeCountry = code || 'all';
      selectedNode = null;
      buildSidebarLegend();
      buildGraph();
    }
    function highlightBigchipRole(role) {
      if (!svgEl) return;
      if (highlightedRole === role) { resetSelection(); return; }
      highlightedRole = role;
      selectedNode = null;
      svgEl.selectAll('.node').classed('node-dim', (d) => d.type === 'relation' && d.role !== role);
      svgEl.selectAll('line').attr('stroke-opacity', (d) => d.role === role ? 0.9 : 0.04)
        .attr('stroke-width', (d) => d.role === role ? 2.8 : 0.7);
    }
    function openBigchipTicker(d) {
      if (!d || !d.targetUrl) return;
      const sep = d.targetUrl.includes('?') ? '&' : '?';
      window.location.href = d.targetUrl + sep + 'lang=' + encodeURIComponent(lang);
    }

    function buildGraph() {
      const container = document.getElementById('graph-svg');
      const W = container.clientWidth || 900, H = container.clientHeight || 700;
      if (simulation) simulation.stop();
      const graphStroke = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--graph-stroke').trim() || '#0d1117'; } catch (e) { return '#0d1117'; } })();
      const graphLabel = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--graph-label').trim() || '#c9d1d9'; } catch (e) { return '#c9d1d9'; } })();
      const nodes = [];
      const nodeIds = new Set();
      const roleById = new Map();
      const roleRank = { supplier: 3, customer: 2, peer: 1 };

      koreanCompanies.forEach((c, i) => {
        nodes.push({
          id: c.id, label: c.name, labelEn: c.nameEn, type: 'hub', chain: c.chain,
          ticker: c.ticker, market: c.market, semType: c.semType, semTypeEn: c.semTypeEn,
          products: c.products, productsEn: c.productsEn, revenue: c.revenue, mcapWon: c.mcapWon,
          revTier: c.revTier, data: c, tags: c.tags || [], r: c.revTier === 3 ? 25 : 21, hubIndex: i
        });
        nodeIds.add(c.id);
        (c.partners || []).forEach((p) => {
          const pr = bigchipPartnerRef(p);
          const role = bigchipRole(pr.kind);
          if (!roleById.has(pr.id) || roleRank[role] > roleRank[roleById.get(pr.id)]) roleById.set(pr.id, role);
        });
      });

      globalCompanies.forEach((rel) => {
        if (!roleById.has(rel.id)) return;
        if (activeCountry !== 'all' && rel.countryCode !== activeCountry) return;
        const role = roleById.get(rel.id);
        const cap = Number(rel.mcapWon) || 0;
        nodes.push({
          id: rel.id, label: rel.name, labelEn: rel.nameEn || rel.name, type: 'relation',
          role, country: rel.country, countryCode: rel.countryCode, region: rel.region,
          sector: rel.sector, ticker: rel.ticker || '', market: rel.market || '',
          mcapWon: cap, targetUrl: rel.targetUrl || '',
          r: rel.ticker ? (cap >= 15e12 ? 17 : cap >= 1e12 ? 13 : 10) : 9,
          data: rel
        });
        nodeIds.add(rel.id);
      });

      const links = [];
      const linkKeys = new Set();
      koreanCompanies.forEach((c) => (c.partners || []).forEach((p) => {
        const pr = bigchipPartnerRef(p);
        if (!nodeIds.has(pr.id)) return;
        const role = bigchipRole(pr.kind);
        const key = role === 'peer' ? [c.id, pr.id].sort().join('|') + '|peer' : c.id + '|' + pr.id + '|' + role;
        if (linkKeys.has(key)) return;
        linkKeys.add(key);
        links.push({
          source: c.id, target: pr.id, role, kind: role, evidence: pr.evidence,
          sourceUrl: pr.source, edgeLabel: pr.edgeLabel, edgeLabelEn: pr.edgeLabelEn,
          baseStrokeW: pr.evidence === 'reported' ? 1.5 : 2
        });
      }));

      const d3svg = d3.select('#graph-svg');
      d3svg.selectAll('*').remove();
      svgEl = d3svg;
      zoomBehavior = d3.zoom().scaleExtent([0.25, 4]).on('zoom', (e) => g.attr('transform', e.transform));
      d3svg.call(zoomBehavior);
      d3svg.on('click', (e) => { if (e.target === d3svg.node() || e.target.tagName === 'svg') resetSelection(); });
      g = d3svg.append('g');

      const zones = [
        { role: 'supplier', x: 0, w: W / 3 },
        { role: 'peer', x: W / 3, w: W / 3 },
        { role: 'customer', x: W * 2 / 3, w: W / 3 }
      ];
      const zone = g.append('g').attr('class', 'bigchip-zones').selectAll('g').data(zones).join('g');
      zone.append('rect').attr('x', (d) => d.x + 5).attr('y', 8).attr('width', (d) => d.w - 10).attr('height', H - 16)
        .attr('rx', 14).attr('fill', (d) => bigchipRoleColor(d.role)).attr('fill-opacity', 0.035)
        .attr('stroke', (d) => bigchipRoleColor(d.role)).attr('stroke-opacity', 0.18).attr('stroke-dasharray', '4 6');
      zone.append('text').attr('class', 'bigchip-zone-label').attr('x', (d) => d.x + d.w / 2).attr('y', 30)
        .attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', (d) => bigchipRoleColor(d.role))
        .text((d) => T[lang]['relation' + d.role.charAt(0).toUpperCase() + d.role.slice(1)] || d.role);

      simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance((d) => d.role === 'peer' ? 105 : 130).strength(0.34))
        .force('charge', d3.forceManyBody().strength((d) => d.type === 'hub' ? -420 : -115))
        .force('collide', d3.forceCollide((d) => d.r + 14))
        .force('x', d3.forceX((d) => {
          if (d.type === 'hub') return W / 2;
          return d.role === 'supplier' ? W * 0.18 : d.role === 'customer' ? W * 0.82 : W * 0.5;
        }).strength((d) => d.type === 'hub' ? 0.35 : 0.16))
        .force('y', d3.forceY((d) => d.type === 'hub' ? H / 2 + (d.hubIndex ? 52 : -52) : H / 2).strength(0.1));

      const link = g.append('g').selectAll('line').data(links).join('line')
        .attr('stroke', (d) => bigchipRoleColor(d.role))
        .attr('stroke-opacity', (d) => d.evidence === 'reported' ? 0.5 : 0.68)
        .attr('stroke-width', (d) => d.baseStrokeW)
        .attr('stroke-dasharray', (d) => d.evidence === 'reported' ? '5 4' : null);

      const node = g.append('g').selectAll('g').data(nodes).join('g')
        .attr('class', (d) => \`node node-\${d.type}\`).attr('cursor', 'pointer')
        .on('mouseover', (e, d) => showTooltip(e, d))
        .on('mouseout', () => hideTooltip())
        .on('click', (e, d) => {
          e.stopPropagation();
          if (d.type === 'relation' && d.ticker && selectedNode === d.id) { openBigchipTicker(d); return; }
          selectNode(d, node, link);
        })
        .on('dblclick', (e, d) => { if (d.type === 'relation' && d.ticker) { e.preventDefault(); openBigchipTicker(d); } })
        .call(d3.drag()
          .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

      node.filter((d) => d.type === 'hub').append('circle')
        .attr('r', (d) => d.r).attr('fill', (d) => CHAIN_COLORS[d.chain] || '#888')
        .attr('fill-opacity', 0.95).attr('stroke', graphStroke).attr('stroke-width', 2.2);
      node.filter((d) => d.type === 'relation' && d.role === 'supplier').append('polygon')
        .attr('points', (d) => \`0,\${-d.r} \${d.r},\${d.r} \${-d.r},\${d.r}\`)
        .attr('fill', (d) => bigchipCountryColor(d.countryCode)).attr('stroke', graphStroke).attr('stroke-width', 1.4);
      node.filter((d) => d.type === 'relation' && d.role === 'peer').append('polygon')
        .attr('points', (d) => \`0,\${-d.r} \${d.r},0 0,\${d.r} \${-d.r},0\`)
        .attr('fill', (d) => bigchipCountryColor(d.countryCode)).attr('stroke', graphStroke).attr('stroke-width', 1.4);
      node.filter((d) => d.type === 'relation' && d.role === 'customer').append('rect')
        .attr('x', (d) => -d.r).attr('y', (d) => -d.r).attr('width', (d) => d.r * 2).attr('height', (d) => d.r * 2).attr('rx', 3)
        .attr('fill', (d) => bigchipCountryColor(d.countryCode)).attr('stroke', graphStroke).attr('stroke-width', 1.4);
      node.append('text').text((d) => lang === 'en' ? (d.labelEn || d.label) : d.label)
        .attr('text-anchor', 'middle').attr('dy', (d) => d.r + 13)
        .attr('font-size', (d) => d.type === 'hub' ? 12 : 9).attr('font-weight', (d) => d.type === 'hub' ? 700 : 500)
        .attr('fill', graphLabel).attr('pointer-events', 'none');

      simulation.on('tick', () => {
        link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
        node.attr('transform', (d) => \`translate(\${Math.max(25, Math.min(W - 25, d.x))},\${Math.max(45, Math.min(H - 25, d.y))})\`);
      });
      selectedNode = null;
      highlightedRole = null;
      setTimeout(() => { d3svg.transition().duration(450).call(zoomBehavior.transform, d3.zoomIdentity.translate(W * 0.03, H * 0.03).scale(0.94)); }, 700);
    }
`;

const RESET = `
function resetSelection() {
      selectedNode = null; highlightedChain = null; highlightedRole = null;
      if (!svgEl) return;
      svgEl.selectAll('.node').classed('node-dim', false);
      svgEl.selectAll('line')
        .attr('stroke-opacity', (d) => d.evidence === 'reported' ? 0.5 : 0.68)
        .attr('stroke-width', (d) => d.baseStrokeW || 2)
        .attr('stroke-dasharray', (d) => d.evidence === 'reported' ? '5 4' : null)
        .attr('stroke', (d) => bigchipRoleColor(d.role));
    }
`;

const TOOLTIP = `
function showTooltip(e, d) {
      const tt = document.getElementById('graph-tooltip');
      const t = T[lang];
      const displayName = lang === 'en' ? (d.labelEn || d.label) : d.label;
      const color = d.type === 'hub' ? (CHAIN_COLORS[d.chain] || '#888') : bigchipCountryColor(d.countryCode);
      let html = \`<div class="tooltip-name" style="color:\${color}">\${displayName}</div>\`;
      if (d.type === 'hub') {
        const cap = lang === 'en' ? fmtMcapUsdBillion(d.mcapWon) : fmtMcapKoJo(d.mcapWon);
        html += \`<div class="tooltip-meta">\${d.ticker} · \${d.market}</div>\`;
        html += \`<div class="tooltip-row"><span class="tooltip-label">\${t.ttRevenue}</span><span class="tooltip-val">\${cap}</span></div>\`;
        const grouped = { supplier: [], peer: [], customer: [] };
        (d.data.partners || []).forEach((p) => {
          const pr = bigchipPartnerRef(p);
          const info = getPartnerInfo(pr.id);
          const note = lang === 'en' ? (pr.edgeLabelEn || pr.edgeLabel) : (pr.edgeLabel || pr.edgeLabelEn);
          grouped[bigchipRole(pr.kind)].push(info.name + (note ? ' — ' + note : ''));
        });
        for (const role of ['supplier', 'peer', 'customer']) {
          if (!grouped[role].length) continue;
          const key = 'relation' + role.charAt(0).toUpperCase() + role.slice(1);
          html += \`<div class="tooltip-row"><span class="tooltip-label">\${t[key]}</span><span class="tooltip-val">\${grouped[role].slice(0, 5).join(', ')}\${grouped[role].length > 5 ? '…' : ''}</span></div>\`;
        }
      } else {
        const roleKey = 'relation' + d.role.charAt(0).toUpperCase() + d.role.slice(1);
        html += \`<div class="tooltip-meta">\${d.country} · \${t[roleKey]}</div>\`;
        if (d.ticker) {
          const cap = lang === 'en' ? fmtMcapUsdBillion(d.mcapWon) : fmtMcapKoJo(d.mcapWon);
          html += \`<div class="tooltip-row"><span class="tooltip-label">Ticker</span><span class="tooltip-val">\${d.ticker} · \${cap}</span></div>\`;
        }
        const related = [];
        koreanCompanies.forEach((c) => (c.partners || []).forEach((p) => {
          const pr = bigchipPartnerRef(p);
          if (pr.id !== d.id) return;
          const note = lang === 'en' ? (pr.edgeLabelEn || pr.edgeLabel) : (pr.edgeLabel || pr.edgeLabelEn);
          const evidence = pr.evidence === 'reported' ? t.reportedEvidence : t.confirmedEvidence;
          related.push((lang === 'en' ? c.nameEn : c.name) + ' — ' + note + ' (' + evidence + ')');
        }));
        if (related.length) html += \`<div class="tooltip-row"><span class="tooltip-label">\${t.ttSuppliers}</span><span class="tooltip-val">\${related.join('<br>')}</span></div>\`;
        if (d.ticker) html += \`<div style="margin-top:8px;color:var(--accent);font-size:11px">\${t.openTicker}</div>\`;
      }
      tt.innerHTML = html;
      tt.style.display = 'block';
      const rect = svgEl.node().getBoundingClientRect();
      tt.style.left = (e.pageX - rect.left - window.scrollX + 14) + 'px';
      tt.style.top = (e.pageY - rect.top - window.scrollY - 10) + 'px';
    }
`;

export function applyBigchipRelationNetwork() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  html = html.replace('</style>', `${CSS}\n  </style>`);
  html = html.replace('../js/map_i18n.js"', '../js/map_i18n.js?v=2"');
  html = replaceBetween(html, 'function buildSidebarLegend() {', '// TABLE', LEGEND);
  html = replaceBetween(html, 'function buildGraph() {', '    function selectNode(', GRAPH);
  html = replaceBetween(html, 'function resetSelection() {', '    function toggleChainHighlight(', RESET);
  html = replaceBetween(html, 'function showTooltip(e, d) {', '    function hideTooltip()', TOOLTIP);
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('OK apply_bigchip_relation_network');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyBigchipRelationNetwork();
}
