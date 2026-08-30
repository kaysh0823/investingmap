import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = process.cwd();
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const HEATMAP_CSS = `
    .heatmap-wrap {
      padding: 20px 28px 28px;
      max-width: 1400px;
      margin: 0 auto
    }

    .heatmap-meta {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px
    }

    #heatmap-root {
      width: 100%;
      min-height: 420px;
      height: min(62vh, 640px);
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden
    }

    #heatmap-root svg {
      width: 100%;
      height: 100%;
      display: block
    }

    .hm-tile {
      cursor: default
    }

    .hm-tile[data-leaf="1"] {
      cursor: pointer
    }

    .hm-tile[data-leaf="1"]:hover rect {
      stroke: var(--accent);
      stroke-width: 2
    }

    .hm-chain-label {
      font-size: 11px;
      font-weight: 700;
      fill: var(--text);
      pointer-events: none
    }

    .hm-name,
    .hm-mcap {
      pointer-events: none
    }

    .hm-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin-top: 14px;
      font-size: 12px;
      color: var(--text-muted)
    }

    .hm-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px
    }

    .hm-legend i {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      display: inline-block;
      flex-shrink: 0
    }
`;

const TABS_OLD = `  <div class="tabs">
    <button id="tab-btn-table" class="tab-btn active" onclick="switchTab('table',this)">`;

const TABS_NEW = `  <div class="tabs">
    <button id="tab-btn-heatmap" class="tab-btn active" onclick="switchTab('heatmap',this)">🔥 섹터 히트맵</button>
    <button id="tab-btn-table" class="tab-btn" onclick="switchTab('table',this)">`;

const HEATMAP_TAB_BLOCK = `
  <!-- HEATMAP TAB -->
  <div id="tab-heatmap" class="tab-content active">
    <div class="heatmap-wrap">
      <p class="heatmap-meta" id="heatmap-hint">시가총액 기준</p>
      <div id="heatmap-root" role="img" aria-label="Sector heatmap"></div>
      <div class="hm-legend" id="heatmap-legend"></div>
    </div>
  </div>

`;

/**
 * Remove Samsung/Hynix heatmap exclude chips from generated maps (idempotent).
 * Match by id=heatmap-filters (attribute order-agnostic) so semi/robot/etc.
 * markup variants are stripped the same way as bigchip.
 */
export function stripHeatmapExcludeFilters(src) {
  let c = String(src);
  // Whole exclude-chip container — id is the stable marker across page variants.
  c = c.replace(
    /\r?\n?[ \t]*<div\b[^>]*\bid\s*=\s*["']heatmap-filters["'][^>]*>[\s\S]*?<\/div>/gi,
    '',
  );
  // Legacy class-only markup (no id) — still strip if present.
  c = c.replace(
    /\r?\n?[ \t]*<div\b[^>]*\bclass\s*=\s*["'][^"']*\bheatmap-filters\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    '',
  );
  // Orphan chip buttons if the wrapper was already gone / partially patched.
  c = c.replace(
    /\r?\n?[ \t]*<button\b[^>]*\bid\s*=\s*["']hm-ex-(?:samsung|hynix)["'][^>]*>[\s\S]*?<\/button>/gi,
    '',
  );
  // CSS rules (multi-line or single-line brace blocks).
  c = c.replace(/\r?\n[ \t]*\.heatmap-filters\s*\{[\s\S]*?\}/g, '');
  c = c.replace(/\r?\n[ \t]*\.heatmap-filter-chip(?:[:.][\w-]+)?\s*\{[\s\S]*?\}/g, '');
  c = c.replace(
    /\r?\n[ \t]*var hmExcludeTickers = \{[\s\S]*?\r?\n[ \t]*function renderHeatmap\(/g,
    '\n\n    function renderHeatmap(',
  );
  c = c.replace(/companies:\s*heatmapCompanies\(\)/g, 'companies: koreanCompanies');
  c = c.replace(/\r?\n[ \t]*excludeTickers:\s*[^,\n]+,?/g, '');
  c = c.replace(/\r?\n[ \t]*bindHeatmapFilters\(\);/g, '');
  c = c.replace(/\r?\n[ \t]*syncHeatmapFilterLabels\(\);/g, '');
  c = c.replace(/\r?\n[ \t]*hmExcludeSamsung:\s*'[^']*',?/g, '');
  c = c.replace(/\r?\n[ \t]*hmExcludeHynix:\s*'[^']*',?/g, '');
  c = c.replace(/\r?\n[ \t]*"hmExcludeSamsung"\s*:\s*"[^"]*",?/g, '');
  c = c.replace(/\r?\n[ \t]*"hmExcludeHynix"\s*:\s*"[^"]*",?/g, '');
  return c;
}

const HEATMAP_ON_SELECT = `
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({
            ticker: c.ticker,
            name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker)
          });
        }`;

const HEATMAP_ON_SELECT_CANDLE = HEATMAP_ON_SELECT.trim();

/** Deployed heatmap onSelect: resetTableFilters → table tab → scroll (with mobile helper). */
const HEATMAP_ON_SELECT_TABLE_CURRENT =
  /onSelect: function \(c\) \{\r?\n          resetTableFilters\(\);\r?\n          switchTab\('table', document\.getElementById\('tab-btn-table'\)\);\r?\n          setTimeout\(function \(\) \{\r?\n            if \(window\.InvestingMapMobileTable\) \{ InvestingMapMobileTable\.scrollToTicker\(c\.ticker \|\| ''\); return; \}\r?\n          var row = document\.querySelector\('#table-body tr\[data-ticker="' \+ \(c\.ticker \|\| ''\) \+ '"\]'\);\r?\n            if \(row\) row\.scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\);\r?\n          \}, 40\);\r?\n        \}/;

/** resetTableFilters + table scroll without mobile helper (intermediate patch). */
const HEATMAP_ON_SELECT_TABLE_RESET =
  /onSelect: function \(c\) \{\r?\n          resetTableFilters\(\);\r?\n          switchTab\('table', document\.getElementById\('tab-btn-table'\)\);\r?\n          setTimeout\(function \(\) \{\r?\n            var row = document\.querySelector\('#table-body tr\[data-ticker="' \+ \(c\.ticker \|\| ''\) \+ '"\]'\);\r?\n            if \(row\) row\.scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\);\r?\n          \}, 40\);\r?\n        \}/;

/** Legacy heatmap onSelect: table tab → scroll only. */
const HEATMAP_ON_SELECT_TABLE_LEGACY =
  /onSelect: function \(c\) \{\r?\n          switchTab\('table', document\.getElementById\('tab-btn-table'\)\);\r?\n          setTimeout\(function \(\) \{\r?\n            var row = document\.querySelector\('#table-body tr\[data-ticker="' \+ \(c\.ticker \|\| ''\) \+ '"\]'\);\r?\n            if \(row\) row\.scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\);\r?\n          \}, 40\);\r?\n        \}/;

/** Replace heatmap tile onSelect with candle modal (idempotent). */
export function patchHeatmapOnSelect(src) {
  if (!src.includes('InvestingMapHeatmap.render')) return src;
  const hmBlock = src.match(/InvestingMapHeatmap\.render\(\{[\s\S]*?\n      \}\);/);
  if (hmBlock && hmBlock[0].includes('InvestingMapCandleModal.open')) return src;
  let c = src;
  if (HEATMAP_ON_SELECT_TABLE_CURRENT.test(c)) {
    c = c.replace(HEATMAP_ON_SELECT_TABLE_CURRENT, HEATMAP_ON_SELECT_CANDLE);
  } else if (HEATMAP_ON_SELECT_TABLE_RESET.test(c)) {
    c = c.replace(HEATMAP_ON_SELECT_TABLE_RESET, HEATMAP_ON_SELECT_CANDLE);
  } else if (HEATMAP_ON_SELECT_TABLE_LEGACY.test(c)) {
    c = c.replace(HEATMAP_ON_SELECT_TABLE_LEGACY, HEATMAP_ON_SELECT_CANDLE);
  }
  return c;
}

const RENDER_HEATMAP_FN = `
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
        chainLabel: function (ch) { return (window.InvestingMapI18n && InvestingMapI18n.chainDisplayLabel) ? InvestingMapI18n.chainDisplayLabel(ch, T[lang]) : ch; },` + HEATMAP_ON_SELECT + `
      });
      el.querySelectorAll('.hm-tile').forEach(function (g) {
        if (g.querySelector('.hm-name')) g.setAttribute('data-leaf', '1');
      });
    }
`;

function patchMap(rel) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('tab-btn-heatmap')) {
    console.log('skip (already patched):', rel);
    return;
  }

  if (!c.includes('#heatmap-root')) {
    if (c.includes(TABS_OLD)) {
      c = c.replace(TABS_OLD, TABS_NEW);
    } else {
      c = c.replace(
        /(<div class="tabs">\s*<button id="tab-btn-table" class="tab-btn) active\(/,
        '$1('
      );
      c = c.replace(
        /(<div class="tabs">)/,
        `$1\n    <button id="tab-btn-heatmap" class="tab-btn active" onclick="switchTab('heatmap',this)">🔥 섹터 히트맵</button>`
      );
    }

    c = c.replace(
      /(\s*)<!-- TABLE TAB -->\s*<div id="tab-table" class="tab-content active">/,
      HEATMAP_TAB_BLOCK + '$1<!-- TABLE TAB -->\n$1<div id="tab-table" class="tab-content">'
    );
  }

  if (!c.includes('.heatmap-wrap')) {
    c = c.replace(/\n  <\/style>\n  <!-- Google AdSense/, HEATMAP_CSS + '\n  </style>\n  <!-- Google AdSense');
    if (!c.includes('.heatmap-wrap')) {
      c = c.replace(/\n  <\/style>\n<\/head>/, HEATMAP_CSS + '\n  </style>\n</head>');
    }
  }

  if (!c.includes('map_heatmap.js')) {
    c = c.replace(
      '<script src="../js/map_editorial.js"></script>',
      '<script src="../js/map_editorial.js"></script>\n  <script src="../js/map_heatmap.js"></script>'
    );
  }

  if (!c.includes('tabHeatmap:')) {
    c = c.replace(
      "tabTable: '📋 기업 목록 &amp; 필터',",
      "tabHeatmap: '🔥 섹터 히트맵',\n        tabTable: '📋 기업 목록 &amp; 필터',"
    );
    c = c.replace(
      "tabGraph: '🌐",
      "heatmapHint: '칸 크기 = 시가총액 · 색 = 당일 등락률',\n        tabGraph: '🌐 관계 네트워크 (수정중)"
    );
    c = c.replace(
      "tabTable: '📋 Company List",
      "tabHeatmap: '🔥 Sector heatmap',\n        tabTable: '📋 Company List"
    );
    c = c.replace(
      /tabGraph: '🌐[^']*',\n        langFlag: '🇰🇷'/,
      () =>
        "heatmapHint: 'Tile size = market cap · color = 1-day return',\n        "
        + "tabGraph: '🌐 Relationship network (WIP)',\n        langFlag: '🇰🇷'"
    );
    if (!c.includes('heatmapHint:')) {
      c = c.replace(
        /(en: \{[\s\S]*?tabTable:[^\n]+\n)/,
        "$1        tabHeatmap: '🔥 Sector heatmap',\n        heatmapHint: 'Tile size = market cap (KRX) · color = value chain',\n"
      );
    }
  }

  if (c.includes('tab-btn-heatmap') && !c.includes("getElementById('tab-btn-heatmap')")) {
    c = c.replace(
      "document.getElementById('tab-btn-table').innerHTML = t.tabTable;",
      "document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap;\n      document.getElementById('tab-btn-table').innerHTML = t.tabTable;\n      var hmHint = document.getElementById('heatmap-hint');\n      if (hmHint && t.heatmapHint) hmHint.textContent = t.heatmapHint;"
    );
  }

  if (!c.includes('function renderHeatmap')) {
    c = c.replace(
      '    function switchTab(tab, btn) {',
      RENDER_HEATMAP_FN + '\n    function switchTab(tab, btn) {'
    );
  }

  c = c.replace(
    "if (tab === 'graph') setTimeout(() => { if (!svgEl) buildGraph(); }, 50);",
    "if (tab === 'heatmap') setTimeout(renderHeatmap, 40);\n      if (tab === 'graph') setTimeout(() => { if (!svgEl) buildGraph(); }, 50);"
  );

  if (!c.includes('renderHeatmap()')) {
    c = c.replace(
      '      renderTable();\n      buildChainChips',
      '      renderTable();\n      if (document.getElementById(\'tab-heatmap\')?.classList.contains(\'active\')) renderHeatmap();\n      buildChainChips'
    );
  }

  c = c.replace(
    'renderTable: renderTable,',
    'renderTable: function () { renderTable(); if (document.getElementById(\'tab-heatmap\')?.classList.contains(\'active\')) renderHeatmap(); },'
  );

  c = c.replace(
    'return `<tr>\n      <td><div class="company-name">',
    'return `<tr data-ticker="${c.ticker}">\n      <td><div class="company-name">'
  );

  if (c.includes("document.getElementById('tab-table')?.classList.contains('active')")) {
    c = c.replace(
      /loadFx\(\)\.then\(function \(\) \{\s*document\.body\.classList\.toggle\('im-tab-table', document\.getElementById\('tab-table'\)\?\.classList\.contains\('active'\)\);/,
      "loadFx().then(function () {\n      document.body.classList.toggle('im-tab-table', document.getElementById('tab-table')?.classList.contains('active'));\n      if (document.getElementById('tab-heatmap')?.classList.contains('active')) setTimeout(renderHeatmap, 80);"
    );
  }

  c = c.replace(/tabGraph: '🌐[^']*'/g, (m) => {
    if (m.includes('(수정중)') || m.includes('(WIP)')) return m;
    if (/Relationship|peer map|Peer/i.test(m)) return "tabGraph: '🌐 Relationship network (WIP)'";
    return "tabGraph: '🌐 관계 네트워크 (수정중)'";
  });

  fs.writeFileSync(fp, c);
  console.log('patched:', rel);
}

function fixHeatmapFile(rel) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) return;
  let c = fs.readFileSync(fp, 'utf8');
  let changed = false;

  if (!c.includes('.heatmap-wrap')) {
    const ins = c.lastIndexOf('\n  </style>');
    if (ins !== -1) {
      c = c.slice(0, ins) + HEATMAP_CSS + c.slice(ins);
      changed = true;
    }
  }

  if (c.includes('id="tab-btn-table" class="tab-btn active"')) {
    c = c.replace(
      /id="tab-btn-table" class="tab-btn active"/g,
      'id="tab-btn-table" class="tab-btn"'
    );
    changed = true;
  }

  if (/return `<tr>\r?\n      <td><div class="company-name">/.test(c) && !c.includes('data-ticker="${c.ticker}"')) {
    c = c.replace(
      /return `<tr>\r?\n      <td><div class="company-name">/g,
      'return `<tr data-ticker="${c.ticker}">\n      <td><div class="company-name">'
    );
    changed = true;
  }

  if (/renderTable\(\);\r?\n      syncSortHeader\(\);/.test(c) && !/renderHeatmap\(\);\r?\n      syncSortHeader/.test(c)) {
    c = c.replace(
      /renderTable\(\);\r?\n      syncSortHeader\(\);/,
      "renderTable();\n      if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap();\n      syncSortHeader();"
    );
    changed = true;
  }

  const onSelectNext = patchHeatmapOnSelect(c);
  if (onSelectNext !== c) {
    c = onSelectNext;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fp, c);
    console.log('fixed:', rel);
  }
}

if (isMain) {
const bioTail = path.join(root, 'bio/bio_inline_tail.js');
if (fs.existsSync(bioTail)) {
  let bc = fs.readFileSync(bioTail, 'utf8');
  let bioChanged = false;
  if (!bc.includes('function renderHeatmap')) {
    bc = bc.replace(
      '    function switchTab(tab, btn) {',
      RENDER_HEATMAP_FN + '\n    function switchTab(tab, btn) {'
    );
    bioChanged = true;
  }
  if (!bc.includes("if (tab === 'heatmap')")) {
    bc = bc.replace(
      "if (tab === 'graph') setTimeout(() => { if (!svgEl) buildGraph(); }, 50);",
      "if (tab === 'heatmap') setTimeout(renderHeatmap, 40);\n      if (tab === 'graph') setTimeout(() => { if (!svgEl) buildGraph(); }, 50);"
    );
    bioChanged = true;
  }
  if (!bc.includes("getElementById('tab-btn-heatmap')")) {
    bc = bc.replace(
      "document.getElementById('tab-btn-table').innerHTML = t.tabTable;",
      "document.getElementById('tab-btn-heatmap').innerHTML = t.tabHeatmap;\n      document.getElementById('tab-btn-table').innerHTML = t.tabTable;\n      var hmHint = document.getElementById('heatmap-hint');\n      if (hmHint && t.heatmapHint) hmHint.textContent = t.heatmapHint;"
    );
    bioChanged = true;
  }
  if (bc.includes('renderTable: renderTable,')) {
    bc = bc.replace(
      'renderTable: renderTable,',
      'renderTable: function () { renderTable(); if (document.getElementById(\'tab-heatmap\')?.classList.contains(\'active\')) renderHeatmap(); },'
    );
    bioChanged = true;
  }
  if (bc.includes("return '<tr>' +") && !bc.includes('data-ticker')) {
    bc = bc.replace(
      "return '<tr>' +",
      "return '<tr data-ticker=\"' + c.ticker + '\">' +"
    );
    bioChanged = true;
  }
  if (bc.includes('renderTable();\n      if (svgEl)') && !bc.includes("tab-heatmap')?.classList.contains('active')) renderHeatmap();\n      if (svgEl)")) {
    bc = bc.replace(
      /renderTable\(\);\r?\n      if \(svgEl\)/,
      "renderTable();\n      if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap();\n      if (svgEl)"
    );
    bioChanged = true;
  }

  if (/renderTable\(\);\r?\n      syncSortHeader\(\);/.test(bc) && !/renderHeatmap\(\);\r?\n      syncSortHeader/.test(bc)) {
    bc = bc.replace(
      /renderTable\(\);\r?\n      syncSortHeader\(\);/,
      "renderTable();\n      if (document.getElementById('tab-heatmap')?.classList.contains('active')) renderHeatmap();\n      syncSortHeader();"
    );
    bioChanged = true;
  }
  if (!bc.includes("tab-heatmap')?.classList.contains('active')")) {
    bc = bc.replace(
      /loadFx\(\)\.then\(function \(\) \{\s*document\.body\.classList\.toggle\('im-tab-table', document\.getElementById\('tab-table'\)\?\.classList\.contains\('active'\)\);/,
      "loadFx().then(function () {\n      document.body.classList.toggle('im-tab-table', document.getElementById('tab-table')?.classList.contains('active'));\n      if (document.getElementById('tab-heatmap')?.classList.contains('active')) setTimeout(renderHeatmap, 80);"
    );
    bioChanged = true;
  }
  const bcOnSelect = patchHeatmapOnSelect(bc);
  if (bcOnSelect !== bc) {
    bc = bcOnSelect;
    bioChanged = true;
  }
  if (bioChanged) {
    fs.writeFileSync(bioTail, bc);
    console.log('fixed: bio/bio_inline_tail.js');
  }
}
}

function discoverMapHtml() {
  const out = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name === 'dist' || ent.name.startsWith('.')) continue;
    const dir = path.join(root, ent.name);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (/^korea_.+_map\.html$/i.test(name)) out.push(path.join(ent.name, name));
    }
  }
  return out.sort();
}

export function patchHeatmapOnSelectFromMaps() {
  for (const rel of [
    ...discoverMapHtml(),
    'bio/bio_inline_tail.js',
    'bio/korea_bio_map.inline.js',
  ]) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const prev = fs.readFileSync(fp, 'utf8');
    const next = patchHeatmapOnSelect(prev);
    if (next !== prev) {
      fs.writeFileSync(fp, next);
      console.log('patched heatmap onSelect:', rel);
    }
  }
}

export function stripHeatmapExcludeFiltersFromMaps() {
  for (const rel of [
    ...discoverMapHtml(),
    'bio/bio_inline_tail.js',
    'bio/korea_bio_map.inline.js',
    'bio/bio_translations.json',
  ]) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const prev = fs.readFileSync(fp, 'utf8');
    const next = stripHeatmapExcludeFilters(prev);
    if (next !== prev) {
      fs.writeFileSync(fp, next);
      console.log('stripped heatmap exclude chips:', rel);
    }
  }
}

if (isMain) {
  for (const rel of MAPS) patchMap(rel);
  for (const rel of MAPS) fixHeatmapFile(rel);
  patchHeatmapOnSelectFromMaps();
  stripHeatmapExcludeFiltersFromMaps();
}
