/**
 * Sector map header: badges inline with h1; dedicated #map-editorial-toggle
 * (replaces map-title-toggle). Idempotent — safe after rebuild regenerates clones.
 */
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
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'machinery/korea_machinery_map.html',
  'shipping/korea_shipping_map.html',
];

const I18N_JS_FILES = ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js'];

const PANEL_CSS_MARKER = 'investingmap-header-editorial-toggle';
const OLD_CSS_MARKER = 'investingmap-map-title-toggle';

const PANEL_CSS = `
    /* ${PANEL_CSS_MARKER} */
    .header-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap
    }
    .header-title-row h1 {
      margin: 0
    }
    .header-meta-inline {
      margin: 0;
      display: flex;
      gap: 6px;
      flex-wrap: wrap
    }
    .map-editorial-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 6px 0 0;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface2);
      color: var(--text-muted);
      font: inherit;
      font-size: 12px;
      cursor: pointer
    }
    .map-editorial-toggle:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px
    }
    .map-title-chevron {
      flex-shrink: 0;
      font-size: 0.85em;
      line-height: 1;
      color: var(--text-muted);
      transition: transform .15s ease
    }
    .map-editorial-toggle[aria-expanded="true"] .map-title-chevron {
      transform: rotate(180deg)
    }
    .map-editorial-panel.is-collapsed {
      display: none
    }
    .map-editorial-detail.is-collapsed {
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

const TOGGLE_BTN = `  <button type="button" class="map-editorial-toggle" id="map-editorial-toggle"
          aria-expanded="false" aria-controls="map-editorial-panel">
    <span id="map-editorial-toggle-text">섹터 설명 보기</span><span class="map-title-chevron" aria-hidden="true">▾</span>
  </button>`;

const APPLY_LANG_SNIPPET = `      var edToggleText = document.getElementById('map-editorial-toggle-text');
      var edToggleBtn = document.getElementById('map-editorial-toggle');
      if (edToggleText && edToggleBtn) {
        var edOpen = edToggleBtn.getAttribute('aria-expanded') === 'true';
        edToggleText.textContent = edOpen
          ? (t.editorialToggleHide || (lang === 'en' ? 'Hide notes' : '섹터 설명 접기'))
          : (t.editorialToggleShow || (lang === 'en' ? 'About this map' : '섹터 설명 보기'));
      }
`;

const I18N = {
  ko: {
    editorialToggleShow: '섹터 설명 보기',
    editorialToggleHide: '섹터 설명 접기',
  },
  en: {
    editorialToggleShow: 'About this map',
    editorialToggleHide: 'Hide notes',
  },
};

function convertDetailsToPanel(html) {
  if (html.includes('id="map-editorial-panel"')) {
    if (
      /id="map-editorial-panel"[^>]*class="map-editorial-panel"(?![^"]*is-collapsed)/.test(
        html,
      )
    ) {
      html = html.replace(
        /(id="map-editorial-panel"[^>]*class="map-editorial-panel)(")/,
        '$1 is-collapsed$2',
      );
    }
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

function unwrapTitleToggle(html) {
  return html.replace(
    /<button\b[^>]*\bid=["']map-title-toggle["'][^>]*>\s*(<h1\b[^>]*\bid=["']hdr-title["'][^>]*>[\s\S]*?<\/h1>)\s*(?:<span\b[^>]*class=["'][^"']*map-title-chevron[^"']*["'][^>]*>[\s\S]*?<\/span>\s*)?<\/button>/gi,
    '$1',
  );
}

function ensureHeaderTitleRow(html) {
  if (html.includes('class="header-title-row"') || html.includes("class='header-title-row'")) {
    html = html.replace(
      /(<div class="header-title-row">[\s\S]*?<div class="header-meta)(?! header-meta-inline)(")/,
      '$1 header-meta-inline$2',
    );
    return html;
  }

  const re =
    /(<h1\b[^>]*\bid=["']hdr-title["'][^>]*>[\s\S]*?<\/h1>)\s*(<p\b[^>]*\bid=["']hdr-subtitle["'][^>]*>[\s\S]*?<\/p>)\s*(<div class="header-meta">[\s\S]*?<\/div>)/;
  if (!re.test(html)) {
    console.warn('header title/meta pattern not found');
    return html;
  }
  return html.replace(re, (_, h1, sub, meta) => {
    const metaInline = meta.replace(
      'class="header-meta"',
      'class="header-meta header-meta-inline"',
    );
    return `<div class="header-title-row">
    ${h1}
    ${metaInline}
  </div>
  ${sub}`;
  });
}

function ensureEditorialToggle(html) {
  if (html.includes('id="map-editorial-toggle"')) return html;
  if (!/<p\b[^>]*\bid=["']hdr-subtitle["']/.test(html)) {
    console.warn('hdr-subtitle not found for editorial toggle');
    return html;
  }
  return html.replace(/(<p\b[^>]*\bid=["']hdr-subtitle["'][^>]*>[\s\S]*?<\/p>)/, `$1\n${TOGGLE_BTN}`);
}

function stripMarkedCss(html) {
  for (const marker of [OLD_CSS_MARKER, PANEL_CSS_MARKER]) {
    const re = new RegExp(
      `\\/\\*\\s*${marker}\\s*\\*\\/[\\s\\S]*?\\.map-editorial-title-sr\\s*\\{[\\s\\S]*?\\}`,
      'g',
    );
    html = html.replace(re, '');
  }
  // Drop leftover map-title-toggle rules from older patches (outside marker).
  html = html.replace(/\n?\s*\.map-title-toggle\s*\{[\s\S]*?\}\s*/g, '\n');
  html = html.replace(/\n?\s*\.map-title-toggle:focus-visible\s*\{[\s\S]*?\}\s*/g, '\n');
  html = html.replace(/\n?\s*\.map-title-toggle\s+h1\s*\{[\s\S]*?\}\s*/g, '\n');
  html = html.replace(
    /\n?\s*\.map-title-toggle\[aria-expanded="true"\]\s+\.map-title-chevron\s*\{[\s\S]*?\}\s*/g,
    '\n',
  );
  // Empty style shells left after stripping a dedicated block.
  html = html.replace(/<style>\s*<\/style>\s*/gi, '');
  return html;
}

function injectPanelCss(html) {
  // Already on the new marker — leave alone (idempotent).
  if (html.includes(PANEL_CSS_MARKER) && !html.includes(OLD_CSS_MARKER)) {
    return html;
  }
  html = stripMarkedCss(html);
  html = html.replace(/\n{3,}([ \t]*@media)/g, '\n\n$1');
  const block = PANEL_CSS.trim();
  const mobileMedia = /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{/;
  if (mobileMedia.test(html)) {
    return html.replace(mobileMedia, `${block}\n    $&`);
  }
  return html.replace(/<\/head>/i, `<style>\n${block}\n</style>\n</head>`);
}

function detectLangFromBadge(value) {
  if (/listings|listed companies|companies/i.test(value) && !/[개사]/.test(value)) return 'en';
  if (/개|사/.test(value)) return 'ko';
  return /listing|compan/i.test(value) ? 'en' : 'ko';
}

function hasEditorialToggleKeys(source) {
  return /["']?editorialToggleShow["']?\s*:/.test(source);
}

/** Drop duplicate editorialToggle* keys left by earlier non-idempotent runs. */
function dedupeEditorialToggleKeys(source) {
  let seenShow = 0;
  let seenHide = 0;
  // Multi-line entries
  source = source.replace(
    /^[ \t]*["']?editorialToggleShow["']?\s*:\s*(["'])(?:\\.|(?!\1).)*\1\s*,[ \t]*\r?\n?/gm,
    (line) => {
      seenShow += 1;
      return seenShow === 1 ? line : '';
    },
  );
  source = source.replace(
    /^[ \t]*["']?editorialToggleHide["']?\s*:\s*(["'])(?:\\.|(?!\1).)*\1\s*,[ \t]*\r?\n?/gm,
    (line) => {
      seenHide += 1;
      return seenHide === 1 ? line : '';
    },
  );
  // Compact inline duplicates: "editorialToggleShow":"...","editorialToggleHide":"...", repeated
  source = source.replace(
    /("editorialToggleShow"\s*:\s*"(?:\\.|[^"\\])*")\s*,\s*("editorialToggleHide"\s*:\s*"(?:\\.|[^"\\])*")\s*,(?:\s*"editorialToggleShow"\s*:\s*"(?:\\.|[^"\\])*"\s*,\s*"editorialToggleHide"\s*:\s*"(?:\\.|[^"\\])*"\s*,)+/g,
    '$1,$2,',
  );
  return source;
}

function patchTranslationKeys(source) {
  source = dedupeEditorialToggleKeys(source);
  if (hasEditorialToggleKeys(source)) return source;

  // Multi-line object style: "badgeMarket": "...",
  source = source.replace(
    /^([ \t]*)(["']?)badgeMarket\2\s*:\s*(["'])(.*?)\3\s*,[ \t]*\r?$/gm,
    (line, indent, keyQ, valQ, value) => {
      const lang = detectLangFromBadge(value);
      const kq = keyQ || '';
      return `${line}
${indent}${kq}editorialToggleShow${kq}: ${valQ}${I18N[lang].editorialToggleShow}${valQ},
${indent}${kq}editorialToggleHide${kq}: ${valQ}${I18N[lang].editorialToggleHide}${valQ},`;
    },
  );

  // Compact JSON / single-line (bio T): "badgeMarket":"...","nextKey"
  if (!hasEditorialToggleKeys(source)) {
    source = source.replace(
      /("badgeMarket"\s*:\s*")((?:\\.|[^"\\])*)("\s*,)/g,
      (full, pre, value, post) => {
        const lang = detectLangFromBadge(value);
        return `${pre}${value}${post}"editorialToggleShow":"${I18N[lang].editorialToggleShow}","editorialToggleHide":"${I18N[lang].editorialToggleHide}",`;
      },
    );
  }
  return source;
}

function patchApplyLang(source) {
  if (source.includes('map-editorial-toggle-text')) return source;
  const anchor =
    /document\.getElementById\(['"]badge-market['"]\)\.innerHTML\s*=\s*t\.badgeMarket\s*;/;
  if (!anchor.test(source)) {
    console.warn('applyLang badge-market anchor not found');
    return source;
  }
  return source.replace(anchor, (m) => `${m}\n${APPLY_LANG_SNIPPET}`);
}

function patchHtml(html) {
  html = convertDetailsToPanel(html);
  html = unwrapTitleToggle(html);
  html = ensureHeaderTitleRow(html);
  html = ensureEditorialToggle(html);
  html = injectPanelCss(html);
  html = patchTranslationKeys(html);
  html = patchApplyLang(html);
  return html;
}

function patchJs(source) {
  source = patchTranslationKeys(source);
  source = patchApplyLang(source);
  return source;
}

for (const rel of MAP_FILES) {
  const p = join(root, rel);
  if (!fs.existsSync(p)) {
    console.warn('missing:', rel);
    continue;
  }
  let html = fs.readFileSync(p, 'utf8');
  const before = html;
  html = patchHtml(html);
  if (html !== before) {
    fs.writeFileSync(p, html, 'utf8');
    console.log('patched editorial header:', rel);
  } else {
    console.log('unchanged editorial header:', rel);
  }
}

for (const rel of I18N_JS_FILES) {
  const p = join(root, rel);
  if (!fs.existsSync(p)) {
    console.warn('missing:', rel);
    continue;
  }
  let src = fs.readFileSync(p, 'utf8');
  const before = src;
  src = patchJs(src);
  if (src !== before) {
    fs.writeFileSync(p, src, 'utf8');
    console.log('patched editorial i18n:', rel);
  } else {
    console.log('unchanged editorial i18n:', rel);
  }
}

console.log('OK patch_editorial_collapsible_html (header + editorial toggle)');
