/** Convert map editorial to h1-toggled panel (DOM kept, CSS-collapsed by default). */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
];

const PANEL_CSS_MARKER = 'investingmap-map-title-toggle';

const PANEL_CSS = `
    /* ${PANEL_CSS_MARKER} */
    .map-title-toggle {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      width: 100%;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      font: inherit
    }
    .map-title-toggle:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 4px
    }
    .map-title-toggle h1 {
      flex: 1;
      min-width: 0;
      margin: 0
    }
    .map-title-chevron {
      flex-shrink: 0;
      margin-top: 0.35em;
      font-size: 0.7em;
      line-height: 1;
      color: var(--text-muted);
      transition: transform .15s ease
    }
    .map-title-toggle[aria-expanded="true"] .map-title-chevron {
      transform: rotate(180deg)
    }
    .map-editorial-panel.is-collapsed {
      display: none
    }
    .map-editorial-title-sr {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0
    }
`;

function convertDetailsToPanel(html) {
  if (html.includes('id="map-editorial-panel"')) {
    // Ensure default collapsed class present.
    html = html.replace(
      /id="map-editorial-panel" class="map-editorial-panel"/,
      'id="map-editorial-panel" class="map-editorial-panel is-collapsed"',
    );
    html = html.replace(
      /id="map-editorial-panel" class="map-editorial-panel is-collapsed is-collapsed"/,
      'id="map-editorial-panel" class="map-editorial-panel is-collapsed"',
    );
    return html;
  }

  const detailsRe =
    /<details class="map-editorial-details"[^>]*>\s*<summary class="map-editorial-summary" id="map-editorial-title">[\s\S]*?<\/summary>\s*([\s\S]*?)\s*<\/details>/;

  if (detailsRe.test(html)) {
    return html.replace(
      detailsRe,
      `<div id="map-editorial-panel" class="map-editorial-panel is-collapsed" role="region" aria-labelledby="map-editorial-title">
    <span id="map-editorial-title" class="map-editorial-title-sr">섹터 설명</span>
    $1
  </div>`,
    );
  }

  // Legacy plain section → wrap body if present.
  const plainRe =
    /<section class="geo-summary" id="map-editorial" aria-labelledby="map-editorial-title">\s*<h2 id="map-editorial-title"><\/h2>\s*<div id="map-editorial-body"><\/div>\s*<\/section>/;
  if (plainRe.test(html)) {
    return html.replace(
      plainRe,
      `<section class="geo-summary map-editorial-collapsible" id="map-editorial" aria-labelledby="map-editorial-title">
  <div id="map-editorial-panel" class="map-editorial-panel is-collapsed" role="region" aria-labelledby="map-editorial-title">
    <span id="map-editorial-title" class="map-editorial-title-sr">섹터 설명</span>
    <div id="map-editorial-body" class="map-editorial-body"></div>
  </div>
</section>`,
    );
  }

  console.warn('editorial pattern not found');
  return html;
}

function injectPanelCss(html) {
  if (html.includes(PANEL_CSS_MARKER)) {
    // Refresh block.
    html = html.replace(
      new RegExp(`\\s*/\\* ${PANEL_CSS_MARKER} \\*/[\\s\\S]*?\\.map-editorial-title-sr \\{[\\s\\S]*?\\}\\s*`, 'g'),
      '',
    );
  }
  if (!/(@media\s*\(max-width:\s*768px\))/.test(html)) {
    return html + `\n<style>${PANEL_CSS}</style>\n`;
  }
  return html.replace(/(@media\s*\(max-width:\s*768px\))/, `${PANEL_CSS}\n    $1`);
}

function wrapH1AsToggle(html) {
  if (html.includes('map-title-toggle') || html.includes('id="map-title-toggle"')) {
    return html;
  }
  // Prefer bare h1 in header (not already wrapped).
  const h1Re =
    /(<div class="header">[\s\S]*?)(<h1 id="hdr-title">[\s\S]*?<\/h1>)/;
  if (!h1Re.test(html)) {
    console.warn('hdr-title h1 not found for title toggle wrap');
    return html;
  }
  return html.replace(
    h1Re,
    `$1<button type="button" class="map-title-toggle" id="map-title-toggle" aria-expanded="false" aria-controls="map-editorial-panel">
      $2
      <span class="map-title-chevron" aria-hidden="true">▾</span>
    </button>`,
  );
}

for (const rel of MAP_FILES) {
  const p = join(root, rel);
  if (!fs.existsSync(p)) {
    console.warn('missing:', rel);
    continue;
  }
  let html = fs.readFileSync(p, 'utf8');
  html = convertDetailsToPanel(html);
  html = wrapH1AsToggle(html);
  html = injectPanelCss(html);
  fs.writeFileSync(p, html, 'utf8');
  console.log('patched editorial title-toggle:', rel);
}

console.log('OK patch_editorial_collapsible_html (title toggle)');
