/**
 * Mobile table UX v2: sticky filter bar + header row + company name column.
 * Safe to re-run (upgrades investingmap-mobile-table ??v2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findTopLevelBlock,
  insertBlockAtTopLevelBeforeMobileMedia,
  mapFirstStyle,
  depthAt,
  scanBraceDepth,
} from '../lib/css_blocks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER_V2 = 'investingmap-mobile-table-v2';
// Legacy v1 marker is exactly "investingmap-mobile-table" (no -v2 suffix).
const V1_START_RE = /\/\*\s*investingmap-mobile-table(?!-v2)\s*\*\//;
const V1_END_RE = /\/\*\s*investingmap-mobile-table(?!-v2)[^*]*-end\s*\*\//;
const EDITORIAL_START = 'investingmap-header-editorial-toggle-v2';
const EDITORIAL_END = 'investingmap-header-editorial-toggle-v2-end';
const V2_BASE_START_RE = /\/\*\s*investingmap-mobile-table-v2[^*]*base\s*\*\//;

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
  'machinery/korea_machinery_map.html',
  'shipping/korea_shipping_map.html',
];

const STICKY_BASE_CSS = `
    /* ${MARKER_V2} ??base */
    table {
      border-collapse: separate;
      border-spacing: 0
    }

    .tbl-wrap {
      overflow: auto;
      -webkit-overflow-scrolling: touch
    }

    thead th {
      position: -webkit-sticky;
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--surface2);
      background-clip: padding-box;
      box-shadow: 0 1px 0 var(--border)
    }

    thead th:first-child,
    tbody td:first-child {
      position: -webkit-sticky;
      position: sticky;
      left: 0;
      z-index: 1
    }

    thead th:first-child {
      z-index: 5;
      background: var(--surface2)
    }

    tbody td:first-child {
      background: var(--bg);
      box-shadow: 1px 0 0 var(--border)
    }

    tbody tr:hover td:first-child {
      background: var(--surface2)
    }
`;

const MOBILE_V2_CSS = `
      /* ${MARKER_V2} ??mobile layout */
      .tabs {
        position: -webkit-sticky;
        position: sticky;
        top: 0;
        z-index: 40;
        background: var(--bg);
        border-bottom: 1px solid var(--border)
      }

      /* Natural page scroll: no fixed viewport height / inner Y scroll */
      #tab-table.tab-content.active {
        display: block;
        height: auto;
        min-height: 0;
        overflow: visible
      }

      #tab-table .table-container {
        display: block;
        height: auto;
        min-height: 0;
        overflow: visible;
        padding-bottom: 8px
      }

      body.im-tab-table #tab-table .table-container {
        padding: 4px 8px 0
      }

      #tab-table .filter-bar {
        flex-shrink: 0;
        z-index: 30;
        margin-bottom: 0;
        padding-bottom: 10px;
        background: var(--bg);
        border-bottom: 1px solid var(--border)
      }

      body.im-tab-table #tab-table .filter-bar {
        padding-bottom: 6px;
        gap: 6px
      }

      /* Value-chain chips: single row + horizontal scroll */
      #tab-table .filter-row-chain {
        flex-wrap: nowrap;
        align-items: center;
        min-width: 0;
        width: 100%
      }

      #tab-table .filter-row-chain .filter-label {
        flex-shrink: 0
      }

      #tab-table .filter-row-chain #chain-chips {
        display: flex;
        flex-wrap: nowrap;
        gap: 6px;
        align-items: center;
        min-width: 0;
        flex: 1;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none
      }

      #tab-table .filter-row-chain #chain-chips::-webkit-scrollbar {
        display: none
      }

      #tab-table .filter-row-chain .filter-chip {
        flex-shrink: 0
      }

      #tab-table .search-box {
        padding: 5px 10px;
        font-size: 12px;
        min-height: 0;
        height: auto
      }

      #tab-table .tbl-wrap {
        flex: none;
        min-height: 0;
        max-height: none;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        -webkit-overflow-scrolling: touch
      }

      #tab-table .note {
        display: none
      }

      body.im-tab-table thead th {
        padding: 6px 5px;
        font-size: 8px
      }

      body.im-tab-table td {
        padding: 5px 5px;
        font-size: 11px;
        line-height: 1.3
      }

      thead th:first-child,
      tbody td:first-child {
        min-width: 108px;
        max-width: 132px
      }

      tbody td:first-child .company-name {
        font-size: 12px;
        line-height: 1.35;
        word-break: keep-all
      }

      body.im-tab-table tbody td:first-child .company-name {
        font-size: 11px;
        line-height: 1.25
      }
`;

const SWITCH_TAB_HOOK = "document.body.classList.toggle('im-tab-table', tab === 'table');";
const INIT_TAB_HOOK =
  "document.body.classList.toggle('im-tab-table', document.getElementById('tab-table')?.classList.contains('active'));";

function stripImTabHeaderCollapse(html) {
  html = html.replace(
    /\n\s*body\.im-tab-table #tab-table\.tab-content\.active \{\s*\n\s*height: calc\(100dvh - 108px\);\s*\n\s*min-height: 240px\s*\n\s*\}\s*/g,
    '\n',
  );
  html = html.replace(
    /\n\s*body\.im-tab-table \.header \{\s*\n\s*padding: 8px 12px 6px\s*\n\s*\}\s*\n\s*body\.im-tab-table \.header h1 \{[\s\S]*?margin: 0\s*\n\s*\}\s*\n\s*body\.im-tab-table #hdr-subtitle,[\s\S]*?display: none\s*\n\s*\}\s*/g,
    '\n',
  );
  return html;
}

/** Extract editorial CSS (marker-based; may currently be nested due to prior brace bugs). */
function extractEditorialBlock(css) {
  const found = findTopLevelBlock(css, EDITORIAL_START, EDITORIAL_END);
  if (!found) return { css, block: null };
  return {
    css: css.slice(0, found.start) + css.slice(found.end),
    block: found.block.trim(),
  };
}

/** Remove legacy v1 mobile-table CSS: marker → last balanced `}` (never past @media / next investingmap-). */
function stripV1MobileCssBlocks(css) {
  let out = css;
  let guard = 0;
  while (guard++ < 20) {
    // End marker if present; otherwise brace-balanced to depth 0 return.
    const block = findTopLevelBlock(out, V1_START_RE, V1_END_RE);
    if (!block) break;
    out = out.slice(0, block.start) + out.slice(block.end);
  }
  return out;
}

/** Replace (possibly broken) v2 sticky-base block with the canonical STICKY_BASE_CSS.
 *  End boundary is `@media` or editorial marker — never `mobile-layout` (lives inside @media).
 */
function ensureStickyBase(css) {
  const m = V2_BASE_START_RE.exec(css);
  if (!m) {
    return insertBlockAtTopLevelBeforeMobileMedia(css, STICKY_BASE_CSS.trim());
  }
  let sliceStart = m.index;
  while (sliceStart > 0 && /[ \t]/.test(css[sliceStart - 1])) sliceStart -= 1;
  if (sliceStart > 0 && (css[sliceStart - 1] === '\n' || css[sliceStart - 1] === '\r')) {
    if (css[sliceStart - 1] === '\n' && sliceStart > 1 && css[sliceStart - 2] === '\r') sliceStart -= 2;
    else sliceStart -= 1;
  }
  const after = m.index + m[0].length;
  const rest = css.slice(after);
  // Prefer stopping before @media / editorial even when braces are currently broken.
  const bound = rest.search(/@media\s*\(|\/\*\s*investingmap-header-editorial/);
  let end;
  if (bound >= 0) {
    end = after + bound;
  } else {
    const found = findTopLevelBlock(css, V2_BASE_START_RE, null, m.index);
    end = found ? found.end : css.length;
  }
  return css.slice(0, sliceStart) + STICKY_BASE_CSS + css.slice(end);
}

/**
 * Historic orphan-`}` deletes left `@media(max-width:768px)` unclosed so
 * `.geo-summary` / `.im-trust-footer` sat inside it. Close dangling depth
 * immediately before those anchors (and any leftover at EOF).
 */
function closeDanglingBeforeAnchors(css) {
  let out = css;
  const anchors = [/\.geo-summary\s*\{/, /\.im-trust-footer\s*\{/];
  for (const re of anchors) {
    const m = re.exec(out);
    if (!m) continue;
    const d = depthAt(out, m.index);
    if (d > 0) {
      out = `${out.slice(0, m.index)}\n    ${'}'.repeat(d)}\n\n    ${out.slice(m.index)}`;
      break;
    }
  }
  const endD = scanBraceDepth(out);
  if (endD > 0) out = `${out}\n    ${'}'.repeat(endD)}\n`;
  return out;
}

/**
 * Strip legacy v1 mobile CSS; never touch editorial.
 * Always re-seat editorial at depth 0 before @media(max-width:768px).
 * Repair sticky-base braces (prior orphan-`}` deletes ate hover closer).
 */
function stripOldMobileCss(html) {
  return mapFirstStyle(html, (css0) => {
    const { css: withoutEd, block: editorial } = extractEditorialBlock(css0);
    let css = stripV1MobileCssBlocks(withoutEd);
    css = css.replace(
      /\r?\n      \.tbl-wrap \{\r?\n        max-width: 100%;\r?\n        max-height: min\(72vh[\s\S]*?word-break: keep-all\r?\n      \}\r?\n\r?\n/g,
      '\n',
    );
    css = ensureStickyBase(css);
    const again = extractEditorialBlock(css);
    css = again.css;
    const block = editorial || again.block;
    if (block) {
      css = insertBlockAtTopLevelBeforeMobileMedia(css, block);
    }
    css = closeDanglingBeforeAnchors(css);
    return css;
  });
}

function injectMobileV2Css(html) {
  if (html.includes('investingmap-mobile-table-v2 ??mobile layout')) {
    return html;
  }

  const injected = html.replace(
    /(\.table-container \{\s*\n\s*padding: 10px 12px\s*\})/,
    `$1${MOBILE_V2_CSS}`,
  );
  if (injected !== html) return injected;
  return html.replace(
    /(\.table-container \{\s*\n\s*padding: 10px 12px\s*\n\s*\})/,
    `$1${MOBILE_V2_CSS}`,
  );
}

function patchSwitchTabSource(src) {
  if (src.includes(SWITCH_TAB_HOOK)) return src;
  return src.replace(
    /function switchTab\(tab, btn\) \{\s*\n/,
    `function switchTab(tab, btn) {\n      ${SWITCH_TAB_HOOK}\n`
  );
}

function patchInitTabClassSource(src) {
  if (src.includes(INIT_TAB_HOOK)) return src;
  if (!src.includes(SWITCH_TAB_HOOK)) return src;
  return src.replace(
    /(applyLang\(\);\s*\n\s*if \(window\.InvestingMapLiveQuotes)/,
    `${INIT_TAB_HOOK}\n      $1`
  );
}

function patchScriptVersions(html) {
  // Ensure script tags exist; leave ?v= to patch_asset_versions.
  if (!/map_mobile_table\.js/.test(html)) {
    html = html.replace(
      /(<script src="\.\.\/js\/map_heatmap\.js(?:\?v=[\w.\-]+)?"><\/script>)/,
      `$1\n  <script src="../js/map_mobile_table.js?v=0"></script>`,
    );
  }
  if (!/map_mobile_ux\.js/.test(html) && /map_mobile_table\.js/.test(html)) {
    html = html.replace(
      /(<script src="\.\.\/js\/map_mobile_table\.js(?:\?v=[\w.\-]+)?"><\/script>)/,
      `$1\n  <script src="../js/map_mobile_ux.js?v=0"></script>`,
    );
  }
  return html;
}
function patchFile(rel) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  const before = html;

  html = stripOldMobileCss(html);
  html = stripImTabHeaderCollapse(html);
  if (html.includes('border-collapse: collapse')) {
    html = html.replace(/border-collapse:\s*collapse/g, 'border-collapse: separate;\n      border-spacing: 0');
  }

  if (!html.includes(`${MARKER_V2} ??base`)) {
    html = html.replace(/(\s+\.node-dim\s*\{[^}]+\}\s*)(\n\s*@media\(max-width:768px\))/s, `$1${STICKY_BASE_CSS}$2`);
    if (!html.includes(`${MARKER_V2} ??base`)) {
      html = html.replace(/(\s*@media\(max-width:768px\)\s*\{)/, `${STICKY_BASE_CSS}$1`);
    }
  }

  html = injectMobileV2Css(html);
  html = patchScriptVersions(html);

  html = patchSwitchTabSource(html);
  html = patchInitTabClassSource(html);

  if (html !== before) {
    fs.writeFileSync(abs, html, 'utf8');
    console.log('patched:', rel);
  } else {
    console.log('unchanged:', rel);
  }
}

for (const rel of MAP_FILES) patchFile(rel);

for (const rel of ['bio/korea_bio_map.inline.js', 'bio/bio_inline_tail.js']) {
  const abs = path.join(root, rel);
  let js = fs.readFileSync(abs, 'utf8');
  js = patchSwitchTabSource(js);
  js = patchInitTabClassSource(js);
  fs.writeFileSync(abs, js, 'utf8');
  console.log('patched:', rel);
}

console.log('OK patch_mobile_table v2');
