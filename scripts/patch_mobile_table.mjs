/**
 * Mobile table UX v2: sticky filter bar + header row + company name column.
 * Safe to re-run (upgrades investingmap-mobile-table → v2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER_V1 = 'investingmap-mobile-table';
const MARKER_V2 = 'investingmap-mobile-table-v2';

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
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];

const STICKY_BASE_CSS = `
    /* ${MARKER_V2} — base */
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
      /* ${MARKER_V2} — mobile layout */
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

function stripOldMobileCss(html) {
  html = html.replace(
    new RegExp(`\\s*/\\* ${MARKER_V1}[^*]*\\*/[\\s\\S]*?(?=\\n\\s*@media\\(max-width:768px\\))`, 'g'),
    ''
  );
  html = html.replace(
    new RegExp(`\\s*/\\* ${MARKER_V2}[\\s\\S]*?(?=\\n\\s*@media\\(max-width:768px\\))`, 'g'),
    ''
  );
  html = html.replace(
    /\n      \/\* investingmap-mobile-table-v2 — mobile layout \*\/[\s\S]*?body\.im-tab-table tbody td:first-child \.company-name \{[\s\S]*?line-height: 1\.25\n      \}\n/g,
    '\n'
  );
  html = html.replace(
    /\n      \/\* investingmap-mobile-table-v2 — mobile layout \*\/[\s\S]*?word-break: keep-all\n      \}\n/g,
    '\n'
  );
  html = html.replace(
    /\r?\n      \.tbl-wrap \{\r?\n        max-width: 100%;\r?\n        max-height: min\(72vh[\s\S]*?word-break: keep-all\r?\n      \}\r?\n\r?\n/g,
    '\n'
  );
  return html;
}

function injectMobileV2Css(html) {
  // Drop every mobile-layout block through the company-name rules that follow the marker.
  // Use a line-based scan so duplicate/legacy formatting cannot leave stale height:calc rules.
  const lines = html.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/\/\* investingmap-mobile-table-v2 — mobile layout \*\//.test(lines[i])) {
      // Skip until after the compact company-name rule that ends this block.
      let j = i + 1;
      let seenCompany = false;
      while (j < lines.length) {
        if (/body\.im-tab-table tbody td:first-child \.company-name/.test(lines[j])) {
          seenCompany = true;
        }
        if (seenCompany && /^\s*\}\s*$/.test(lines[j])) {
          j += 1;
          // Skip trailing blank lines belonging to the block.
          while (j < lines.length && lines[j].trim() === '') j += 1;
          break;
        }
        // Safety: stop before the next major mobile header section.
        if (j > i + 5 && /^\s*\.header \{\s*$/.test(lines[j])) break;
        j += 1;
      }
      i = j;
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  html = out.join('\n');

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
  return html
    .replace(/map_mobile_table\.js(\?v=\d+)?/g, 'map_mobile_table.js?v=9')
    .replace(/map_mobile_ux\.js(\?v=\d+)?/g, 'map_mobile_ux.js?v=8');
}

function patchFile(rel) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');

  html = stripOldMobileCss(html);
  html = stripImTabHeaderCollapse(html);
  html = html.replace(/border-collapse:\s*collapse/g, 'border-collapse: separate;\n      border-spacing: 0');

  if (!html.includes(`${MARKER_V2} — base`)) {
    html = html.replace(/(\s+\.node-dim\s*\{[^}]+\}\s*)(\n\s*@media\(max-width:768px\))/s, `$1${STICKY_BASE_CSS}$2`);
    if (!html.includes(`${MARKER_V2} — base`)) {
      html = html.replace(/(\s*@media\(max-width:768px\)\s*\{)/, `${STICKY_BASE_CSS}$1`);
    }
  }

  html = injectMobileV2Css(html);
  html = patchScriptVersions(html);

  html = patchSwitchTabSource(html);
  html = patchInitTabClassSource(html);

  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', rel);
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
