/**
 * Patch industry map HTML: replace inline graph with RelationNetwork module.
 * Run after apply_semi_relation_network (curated graph is superseded).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  relationNetworkJsRef,
  relationNetworkScriptSrc,
} from '../lib/relation_network/asset_version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RN_JS_TAG = relationNetworkJsRef();

const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];

const RN_CSS = `
    /* relation network v2 + filter sidebar layout */
    .rn-workspace.graph-container,
    .graph-container.rn-workspace {
      display: grid;
      grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
      height: calc(100vh - 110px);
      min-height: 420px;
    }
    .graph-sidebar { display: none !important; }
    .rn-filter-sidebar {
      display: flex;
      flex-direction: column;
      min-width: 240px;
      max-width: 300px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      overflow: hidden;
      z-index: 20;
    }
    .rn-filter-content {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rn-filter-drawer-toggle {
      display: none;
      min-height: 44px;
      min-width: 44px;
      padding: 8px 14px;
      margin: 0 0 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface2);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .rn-filter-drawer-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 24;
    }
    .rn-filter-drawer-backdrop.is-open { display: block; }
    .rn-graph-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      position: relative;
    }
    .rn-graph-header { flex: none; padding: 8px 12px 0; }
    .rn-graph-canvas {
      flex: 1;
      min-height: 0;
      position: relative;
    }
    .rn-graph-canvas #graph-svg { width: 100%; height: 100%; }
    .rn-model-desc { margin: 0 0 8px; font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    .rn-sparse-notice { margin: 0 0 8px; padding: 8px 10px; font-size: 12px; line-height: 1.5; color: var(--text-muted); background: var(--surface2); border: 1px dashed var(--border); border-radius: 8px; }
    .rn-labels .rn-label { font-family: inherit; }
    .rn-label-listed { font-weight: 600; fill: var(--graph-label, #e6edf3); }
    .rn-label-selected { font-weight: 700; fill: #fff; stroke-width: 4px; }
    .rn-label-low { fill: var(--text-muted, #8b949e); }
    .rn-node-selected circle, .rn-node-selected rect, .rn-node-selected polygon {
      filter: drop-shadow(0 0 4px rgba(240,164,75,0.55));
    }
    .rn-edges line { pointer-events: stroke; }
    .rn-toolbar {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      margin: 0;
      max-width: none;
      overflow: visible;
    }
    .rn-filter-group { display: flex; flex-direction: column; gap: 6px; }
    .rn-filter-group-title {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .rn-filter-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .rn-filter-stack { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .rn-toolbar input[type="search"] {
      min-height: 40px;
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface2);
      color: var(--text);
      font: inherit;
      min-width: 0;
      flex: none;
    }
    .rn-chip {
      min-height: 36px;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface2);
      color: var(--text-muted);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      white-space: normal;
      text-align: center;
      line-height: 1.25;
    }
    .rn-chip.active { border-color: var(--accent); color: var(--accent); }
    .rn-chip[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
    .rn-sticky-bar { position: sticky; top: 0; z-index: 12; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 13px; }
    .rn-sticky-bar button { min-height: 36px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface2); cursor: pointer; font: inherit; }
    .rn-detail-panel { position: absolute; right: 12px; top: 12px; z-index: 15; width: min(320px, 92vw); max-height: 60%; overflow: auto; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); box-shadow: 0 8px 24px rgba(0,0,0,.25); font-size: 12px; line-height: 1.6; }
    .rn-detail-panel h3 { margin: 0 0 8px; font-size: 14px; }
    .rn-detail-close { position: absolute; top: 8px; right: 10px; min-width: 44px; min-height: 44px; border: none; background: transparent; font-size: 22px; cursor: pointer; color: var(--text-muted); line-height: 1; }
    .rn-graph-only-badge { color: var(--text-muted); font-size: 11px; margin: 0 0 6px; }
    .rn-legend-help { margin-top: 4px; border-top: 1px solid var(--border); padding-top: 8px; }
    .rn-legend-help-summary {
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      min-height: 40px;
      display: flex;
      align-items: center;
      list-style: none;
    }
    .rn-legend-help-summary::-webkit-details-marker { display: none; }
    .rn-legend { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; font-size: 11px; color: var(--text-muted); }
    .rn-legend-item { white-space: normal; line-height: 1.45; }
    .rn-legend-key { font-weight: 600; color: var(--text); }
    .rn-legend-static { font-size: 11px; color: var(--text-muted); line-height: 1.55; }
    .rn-legend-static dl { margin: 0; }
    .rn-legend-static dt { font-weight: 600; color: var(--text); margin-top: 6px; }
    .rn-legend-static dd { margin: 2px 0 0; }
    .rn-evidence { margin: 8px 0 0; padding-left: 18px; }
    .rn-a11y-list { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    @media (max-width: 1023px) {
      .rn-workspace.graph-container,
      .graph-container.rn-workspace { grid-template-columns: minmax(200px, 220px) minmax(0, 1fr); }
      .rn-filter-sidebar { min-width: 200px; max-width: 220px; }
    }
    @media (max-width: 767px) {
      .rn-workspace.graph-container,
      .graph-container.rn-workspace { grid-template-columns: 1fr; height: min(70vh, 620px); }
      .rn-filter-drawer-toggle { display: inline-flex; align-items: center; justify-content: center; }
      .rn-filter-sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        width: min(92vw, 320px);
        max-width: none;
        transform: translateX(-105%);
        transition: transform .2s ease;
        box-shadow: 8px 0 24px rgba(0,0,0,.25);
      }
      .rn-filter-sidebar.is-open { transform: translateX(0); }
      #tab-graph .rn-graph-main { position: relative; touch-action: pan-y; }
      .rn-graph-canvas #graph-svg { height: min(72svh, 680px) !important; min-height: 420px; touch-action: none; }
      .rn-detail-panel { position: fixed; left: 0; right: 0; bottom: 0; top: auto; width: 100%; max-height: 48svh; border-radius: 14px 14px 0 0; padding-top: 18px; }
      .rn-toolbar .rn-chip { min-height: 44px; }
      .rn-sticky-bar button { min-height: 44px; }
      .rn-detail-close { min-width: 44px; min-height: 44px; }
      .rn-legend-help-summary { min-height: 44px; }
    }
`;

const RN_GRAPH_HTML = `
        <div id="rn-sticky-bar" class="rn-sticky-bar" hidden></div>
        <p id="rn-model-desc" class="rn-model-desc" aria-live="polite"></p>
        <p id="rn-sparse-notice" class="rn-sparse-notice" aria-live="polite"></p>
        <div id="rn-legend" class="rn-legend" aria-label="Relation line legend"></div>
        <div class="rn-toolbar" role="toolbar" aria-label="Relation network filters">
          <input type="search" id="rn-search" placeholder="기업 검?? aria-label="Search company" autocomplete="off" />
          <label class="rn-chip"><input type="checkbox" id="rn-filter-confirmed" style="margin-right:4px" />?�정�?/label>
          <label class="rn-chip"><input type="checkbox" id="rn-filter-peer" style="margin-right:4px" />?�종 비교</label>
          <label class="rn-chip"><input type="checkbox" id="rn-filter-inferred" style="margin-right:4px" />추론·참고</label>
          <button type="button" class="rn-chip active" id="rn-depth-1">1?�계</button>
          <button type="button" class="rn-chip" id="rn-depth-2">2?�계</button>
          <button type="button" class="rn-chip" onclick="RelationNetwork.resetView()">?�체</button>
        </div>
        <ul id="rn-a11y-list" class="rn-a11y-list" aria-label="Relation list"></ul>
        <div id="rn-detail-panel" class="rn-detail-panel" hidden aria-hidden="true"></div>`;

const RN_GRAPH_JS = `
    // ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═??    // GRAPH (RelationNetwork v2)
    // ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═??    let svgEl = null;

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
      if (window.RelationNetwork && RelationNetwork.fitAll) {
        RelationNetwork.fitAll();
        return;
      }
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
`;

const I18N_PATCH_KO = `
        rnType: '관�??�형', rnStatus: '?�태', rnConnections: '?�결', rnGoTable: '기업 목록?�서 보기', rnResetView: '?�체 보기', rnStake: '지분율',`;
const I18N_PATCH_EN = `
        rnType: 'Relation type', rnStatus: 'Status', rnConnections: 'Connections', rnGoTable: 'View in company list', rnResetView: 'Show all', rnStake: 'Stake %',`;

const TAB_GRAPH_WIP_KO = '?�� 관�??�트?�크 (?�정�?';
const TAB_GRAPH_WIP_EN = '?�� Relationship network (WIP)';

function patchTabGraphWip(html) {
  let out = html;
  out = out.replace(/"tabGraph":\s*"?��[^"]*"/g, (m) => {
    if (m.includes('(?�정�?') || m.includes('(WIP)')) return m;
    if (/Relationship|peer map|Peer/i.test(m)) return `"tabGraph": "${TAB_GRAPH_WIP_EN}"`;
    return `"tabGraph": "${TAB_GRAPH_WIP_KO}"`;
  });
  out = out.replace(/tabGraph:\s*'?��[^']*'/g, (m) => {
    if (m.includes('(?�정�?') || m.includes('(WIP)')) return m;
    if (/Relationship|peer map|Peer/i.test(m)) return `tabGraph: '${TAB_GRAPH_WIP_EN}'`;
    return `tabGraph: '${TAB_GRAPH_WIP_KO}'`;
  });
  return out;
}

function upgradePhase25Ui(html) {
  let out = html;
  if (!out.includes('id="rn-legend"')) {
    out = out.replace(
      '<p id="rn-model-desc" class="rn-model-desc" aria-live="polite"></p>',
      '<p id="rn-model-desc" class="rn-model-desc" aria-live="polite"></p>\n        <p id="rn-sparse-notice" class="rn-sparse-notice" aria-live="polite"></p>\n        <div id="rn-legend" class="rn-legend" aria-label="Relation line legend"></div>',
    );
  }
  if (!out.includes('id="rn-sparse-notice"') && out.includes('id="rn-model-desc"')) {
    out = out.replace(
      '<p id="rn-model-desc" class="rn-model-desc" aria-live="polite"></p>',
      '<p id="rn-model-desc" class="rn-model-desc" aria-live="polite"></p>\n        <p id="rn-sparse-notice" class="rn-sparse-notice" aria-live="polite"></p>',
    );
  }
  if (!out.includes('id="rn-filter-peer"')) {
    out = out.replace(
      'id="rn-filter-confirmed"',
      'id="rn-filter-confirmed"',
    );
    out = out.replace(
      /<label class="rn-chip"><input type="checkbox" id="rn-filter-confirmed"[^/]*\/><\/label>\s*/,
      '<label class="rn-chip"><input type="checkbox" id="rn-filter-confirmed" style="margin-right:4px" />?�정�?/label>\n          <label class="rn-chip"><input type="checkbox" id="rn-filter-peer" style="margin-right:4px" />?�종 비교</label>\n          <label class="rn-chip"><input type="checkbox" id="rn-filter-inferred" style="margin-right:4px" />추론·참고</label>\n          ',
    );
  }
  if (!out.includes('rnStake')) {
    out = out.replace("rnResetView: '?�체 보기',", "rnResetView: '?�체 보기', rnStake: '지분율',");
    out = out.replace("rnResetView: 'Show all',", "rnResetView: 'Show all', rnStake: 'Stake %',");
  }
  if (!out.includes('rn-detail-close') && out.includes('relation network v2')) {
    out = out.replace('.rn-detail-panel h3 { margin: 0 0 8px; font-size: 14px; }', `.rn-detail-panel h3 { margin: 0 0 8px; font-size: 14px; }
    .rn-detail-close { position: absolute; top: 8px; right: 10px; min-width: 44px; min-height: 44px; border: none; background: transparent; font-size: 22px; cursor: pointer; color: var(--text-muted); line-height: 1; }
    .rn-graph-only-badge { color: var(--text-muted); font-size: 11px; margin: 0 0 6px; }
    .rn-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 0 0 8px; font-size: 10px; color: var(--text-muted); }
    .rn-legend-item { white-space: nowrap; }
    .rn-legend-key { font-weight: 600; color: var(--text); }`);
  }
  out = out.replace(/relation_network\.js(\?v=\d+)?/g, RN_JS_TAG);
  out = out.replace(/network_profiles\.js(\?v=\d+)?/g, 'network_profiles.js?v=2');
  out = patchTabGraphWip(out);
  return out;
}

function upgradeFilterSidebarCss(html) {
  if (html.includes('.rn-filter-sidebar')) return html;
  if (!html.includes('relation network v2')) return injectCss(html);
  return html.replace(
    /\/\* relation network v2[\s\S]*?@media \(max-width: 768px\)[\s\S]*?\}\s*\}/,
    RN_CSS.trim(),
  );
}

function restructureFilterSidebarLayout(html) {
  if (html.includes('id="rn-filter-sidebar"')) {
    html = html.replace(/<div id="sb-chain-legend"><\/div>\s*<\/div>\s*<div class="sidebar-section">[\s\S]*?<\/div>\s*<div class="graph-main">/m, '<div class="graph-main">');
    html = html.replace(/<div class="sidebar-section">[\s\S]*?<div class="graph-main">/m, '<div class="graph-main">');
    return html;
  }
  if (!html.includes('class="graph-container"')) return html;

  html = html.replace(
    /<div class="graph-sidebar">[\s\S]*<\/div>\s*(?=<div class="graph-main">)/m,
    '',
  );
  html = html.replace('<div class="graph-container">', '<div class="graph-container rn-workspace">');
  html = html.replace(
    '<div class="graph-container rn-workspace">',
    `<div class="graph-container rn-workspace">
      <aside class="rn-filter-sidebar" id="rn-filter-sidebar" aria-label="Relation network filters">
        <div class="rn-filter-content" id="rn-filter-content"></div>
      </aside>`,
  );
  return html;
}

function patchSidebarLegendGuardContent(content) {
  let out = content;
  if (!content.includes('sb-chain-legend guard')) {
    out = out.replace(
      /function buildSidebarLegend\(\)\s*\{/g,
      'function buildSidebarLegend() { if (!document.getElementById(\'sb-chain-legend\')) return; /* sb-chain-legend guard */',
    );
  }
  if (!content.includes('sb-korean guard')) {
    ['sb-size-desc', 'sb-how-desc', 'sb-korean', 'sb-global', 'sb-size', 'sb-how'].forEach(function (id) {
      const re = new RegExp("document\\.getElementById\\('" + id + "'\\)\\.textContent\\s*=", 'g');
      out = out.replace(re, "if(document.getElementById('" + id + "'))document.getElementById('" + id + "').textContent=");
      const re2 = new RegExp("document\\.getElementById\\('" + id + "'\\)\\.innerHTML\\s*=", 'g');
      out = out.replace(re2, "if(document.getElementById('" + id + "'))document.getElementById('" + id + "').innerHTML=");
    });
    out = out.replace(
      /document\.getElementById\('graph-hint-text'\)\.textContent\s*=/,
      '/* sb-korean guard */ if(document.getElementById(\'graph-hint-text\'))document.getElementById(\'graph-hint-text\').textContent=',
    );
  }
  return out;
}

function patchSidebarLegendGuard(html) {
  return patchSidebarLegendGuardContent(html);
}

function injectCss(html) {
  if (html.includes('relation network v2') && html.includes('.rn-filter-sidebar')) return html;
  if (html.includes('relation network v2')) return upgradeFilterSidebarCss(html);
  return html.replace('</style>', `${RN_CSS}\n  </style>`);
}

function injectGraphHtml(html) {
  if (html.includes('id="rn-model-desc"')) return html;
  return html.replace(
    '<div class="graph-main">',
    `<div class="graph-main">${RN_GRAPH_HTML}`,
  );
}

function injectScripts(html) {
  const tags = `
  <script src="../js/network_profiles.js?v=1"></script>
  <script src="../js/relation_network_legacy.js?v=1"></script>
  <script src="${relationNetworkScriptSrc()}"></script>`;
  if (html.includes('relation_network.js')) {
    return html
      .replace(/network_profiles\.js(\?v=\d+)?/g, 'network_profiles.js?v=1')
      .replace(/relation_network_legacy\.js(\?v=\d+)?/g, 'relation_network_legacy.js?v=1')
      .replace(/relation_network\.js(\?v=\d+)?/g, RN_JS_TAG);
  }
  return html.replace('</body>', `${tags}\n</body>`);
}

function replaceGraphBlock(html) {
  if (html.includes('RelationNetwork v2')) return html;
  const startMarkers = [
    '\n    // ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═??n    // GRAPH',
    '\n    // GRAPH',
    'let simulation, svgEl, g, zoomBehavior, selectedNode = null, highlightedChain = null;',
  ];
  let start = -1;
  let startMarker = '';
  for (const m of startMarkers) {
    const i = html.indexOf(m);
    if (i >= 0) { start = i; startMarker = m; break; }
  }
  if (start < 0) throw new Error('graph block start not found');

  const endMarkers = ['function showTooltip(', '\n    // TABLE', '\n    function renderTable('];
  let end = -1;
  for (const m of endMarkers) {
    const i = html.indexOf(m, start + startMarker.length);
    if (i >= 0) { end = i; break; }
  }
  if (end < 0) throw new Error('graph block end not found');

  return html.slice(0, start) + RN_GRAPH_JS + '\n\n    ' + html.slice(end);
}

function patchSwitchTab(html) {
  if (html.includes('RelationNetwork.onTabHidden')) return html;
  return html.replace(
    /if \(tab === 'graph'\) setTimeout\(\(\) => \{ if \(!svgEl\) buildGraph\(\); \}, 50\);/,
    "if (tab === 'graph') setTimeout(() => { buildGraph(); }, 50);\n      else if (window.RelationNetwork) RelationNetwork.onTabHidden();",
  );
}

function patchI18n(html) {
  if (html.includes('rnResetView')) return html;
  let out = html;
  // Insert into ko block (first graphHint)
  out = out.replace(
    /(\s+)(graphHint: ')/,
    `$1${I18N_PATCH_KO.trim()}\n$1$2`,
  );
  // Insert into en block (second graphHint) ??only if rn keys not already in en
  if (!out.includes("rnResetView: 'Show all'")) {
    const idx = out.indexOf("graphHint:");
    const second = out.indexOf("graphHint:", idx + 1);
    if (second > 0) {
      out = out.slice(0, second) + I18N_PATCH_EN.trim() + '\n        ' + out.slice(second);
    }
  }
  return out;
}

function stripDuplicateLegacyGraph(html) {
  if (!html.includes('RelationNetwork v2')) return html;
  const stub = 'function hideTooltip() { }';
  const stubIdx = html.indexOf(stub);
  if (stubIdx < 0) return html;
  const dup = html.indexOf('function showTooltip(e, d)', stubIdx + stub.length);
  if (dup < 0) return html;
  const endMarkers = ['\n    // HEATMAP', '\n    // TABLE', '\n    function renderHeatmap', '\n    function renderTable('];
  let end = html.length;
  for (const m of endMarkers) {
    const i = html.indexOf(m, dup);
    if (i >= 0 && i < end) end = i;
  }
  return html.slice(0, dup) + html.slice(end);
}

function patchToggleTheme(html) {
  return html.replace(
    /if \(typeof svgEl !== 'undefined' && svgEl\) \{\s*\n\s*svgEl\.selectAll\('\*'\)\.remove\(\);\s*\n\s*svgEl = null;\s*\n\s*\}/,
    "if (typeof svgEl !== 'undefined' && svgEl && svgEl !== true && svgEl.selectAll) {\n        svgEl.selectAll('*').remove();\n        svgEl = null;\n      }",
  );
}
function ensureBigchipFilterStub(html) {
  if (!html.includes('bigchipFilterState.') || html.includes('const bigchipFilterState')) return html;
  return html.replace(
    'function buildSidebarLegend()',
    `const bigchipFilterState = { chains: new Set(), regions: new Set(), roles: new Set() };
    function bigchipPresentChains() {
      return Object.keys(CHAIN_COLORS).filter(function (k) { return k !== 'all'; });
    }
    function toggleBigchipFilter() { /* v2 graph uses rn-filter chips */ }
    function resetBigchipFilters() {
      bigchipFilterState.chains.clear();
      bigchipFilterState.regions.clear();
      bigchipFilterState.roles.clear();
      buildSidebarLegend();
    }

    function buildSidebarLegend()`,
  );
}

function patchSearchPlaceholder(html) {
  return html.replace(
    'id="rn-search" placeholder="기업 검??',
    'id="rn-search" placeholder=""',
  );
}

function patchFile(rel) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return;
  }
  let html = fs.readFileSync(fp, 'utf8');
  html = injectCss(html);
  html = restructureFilterSidebarLayout(html);
  html = patchSidebarLegendGuard(html);
  html = injectGraphHtml(html);
  html = replaceGraphBlock(html);
  html = stripDuplicateLegacyGraph(html);
  html = patchToggleTheme(html);
  html = ensureBigchipFilterStub(html);
  html = patchSwitchTab(html);
  html = patchI18n(html);
  html = upgradePhase25Ui(html);
  html = injectScripts(html);
  fs.writeFileSync(fp, html, 'utf8');
  console.log('OK patch_relation_network', rel);
}

function patchBioHtml(html) {
  html = injectCss(html);
  html = restructureFilterSidebarLayout(html);
  html = patchSidebarLegendGuard(html);
  html = injectGraphHtml(html);
  html = injectScripts(html.replace(
    '<script src="korea_bio_map.inline.js"></script>',
    `<script src="../js/network_profiles.js?v=1"></script>
  <script src="../js/relation_network_legacy.js?v=1"></script>
  <script src="${relationNetworkScriptSrc()}"></script>
  <script src="korea_bio_map.inline.js"></script>`,
  ));
  if (html.includes('relation_network.js')) {
    // already injected before inline
    html = html.replace(/<script src="\.\.\/js\/network_profiles\.js[^"]*"><\/script>\s*<script src="\.\.\/js\/relation_network_legacy\.js[^"]*"><\/script>\s*<script src="\.\.\/js\/relation_network\.js[^"]*"><\/script>\s*<script src="\.\.\/js\/network_profiles/g, '<script src="../js/network_profiles');
  }
  return html;
}

/** Remove legacy D3 graph helpers left after v2 migration (idempotent). */
function stripBioLegacyGraphOrphans(js) {
  const orphanStart = js.indexOf('function showTooltip(e, d)');
  if (orphanStart < 0) return js;
  const resetTable = js.indexOf('function resetTableFilters', orphanStart);
  if (resetTable < 0) return js;
  return js.slice(0, orphanStart) + js.slice(resetTable);
}

function patchBioInline() {
  const files = ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js'];
  for (const rel of files) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    let js = fs.readFileSync(fp, 'utf8');
    const original = js;
    js = patchSidebarLegendGuardContent(js);
    const stripped = stripBioLegacyGraphOrphans(js);
    if (stripped !== js) js = stripped;
    if (js !== original) {
      fs.writeFileSync(fp, js, 'utf8');
      console.log('OK patch_relation_network', rel, 'sidebar guards');
    }
  }

  const fp = path.join(root, 'bio', 'bio_inline_tail.js');
  if (!fs.existsSync(fp)) return;
  let js = fs.readFileSync(fp, 'utf8');
  if (js.includes('RelationNetwork v2')) return;
  const markers = ['let simulation, svgEl, g, zoomBehavior, selectedNode = null, highlightedChain = null;', '// GRAPH'];
  let start = -1;
  let startLen = 0;
  for (const m of markers) {
    const i = js.indexOf(m);
    if (i >= 0) { start = i; startLen = m.length; break; }
  }
  if (start < 0) return;
  const endMarkers = ['function showTooltip(', 'function resetZoom('];
  let end = -1;
  for (const m of endMarkers) {
    const i = js.indexOf(m, start + startLen);
    if (i >= 0) { end = i; break; }
  }
  if (end < 0) return;
  js = js.slice(0, start) + RN_GRAPH_JS + '\n\n    ' + js.slice(end);
  js = js.replace(
    /if \(tab === 'graph'\) setTimeout\(\(\) => \{ if \(!svgEl\) buildGraph\(\); \}, 50\);/,
    "if (tab === 'graph') setTimeout(function() { buildGraph(); }, 50);\n      else if (window.RelationNetwork) RelationNetwork.onTabHidden();",
  );
  fs.writeFileSync(fp, js, 'utf8');
  console.log('OK patch_relation_network bio_inline_tail.js');
}

for (const rel of MAP_FILES) {
  try {
    if (rel === 'bio/korea_bio_map.html') {
      const fp = path.join(root, rel);
      let html = fs.readFileSync(fp, 'utf8');
      html = patchBioHtml(html);
      html = upgradePhase25Ui(html);
      fs.writeFileSync(fp, html, 'utf8');
      console.log('OK patch_relation_network', rel);
      continue;
    }
    patchFile(rel);
  } catch (e) {
    console.error('FAIL', rel, e.message);
    process.exitCode = 1;
  }
}
patchBioInline();
console.log('\nOK patch_relation_network');
