/**
 * Desktop header sector nav, filter bar layout, tab state across industry links.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCRIPT_V = 2; // map_filter_ux.js version

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

const FILTER_BAR_OLD =
  /<div class="filter-bar">\s*<div class="filter-group">\s*<span class="filter-label" id="fl-chain-label">[^<]*<\/span>\s*<div id="chain-chips"><\/div>\s*<\/div>\s*<div class="filter-divider"><\/div>\s*<div class="filter-group">\s*<span class="filter-label" id="fl-market-label">[^<]*<\/span>\s*<div id="market-chips"><\/div>\s*<\/div>/g;

const FILTER_BAR_NEW = `<div class="filter-bar">
        <div class="filter-row filter-row-chain">
          <span class="filter-label" id="fl-chain-label">벨류체인</span>
          <div id="chain-chips"></div>
        </div>
        <div class="filter-row filter-row-market">
          <span class="filter-label" id="fl-market-label">?�장</span>
          <div id="market-chips"></div>
        </div>
        <div class="filter-row filter-row-tools">`;

function ensureHeadScripts(html) {
  if (!html.includes('map_tab_state.js')) {
    html = html.replace(
      /<script src="\.\.\/js\/map_i18n\.js"><\/script>\s*/,
      `<script src="../js/map_i18n.js"></script>\n  <script src="../js/map_tab_state.js?v=10"></script>\n  <script src="../js/sector_nav.js?v=8"></script>\n  <script src="../js/map_filter_ux.js?v=${SCRIPT_V}"></script>\n`,
    );
  } else if (!html.includes('sector_nav.js')) {
    html = html.replace(
      /<script src="\.\.\/js\/map_tab_state\.js(?:\?v=\d+)?"><\/script>\s*/,
      `<script src="../js/map_tab_state.js?v=10"></script>\n  <script src="../js/sector_nav.js?v=8"></script>\n`,
    );
  }
  if (!html.includes('map_filter_ux.js') && html.includes('sector_nav.js')) {
    html = html.replace(
      /<script src="\.\.\/js\/sector_nav\.js(?:\?v=\d+)?"><\/script>\s*/,
      `<script src="../js/sector_nav.js?v=8"></script>\n  <script src="../js/map_filter_ux.js?v=${SCRIPT_V}"></script>\n`,
    );
  }
  html = html.replace(/map_filter_ux\.js(?:\?v=\d+)?/g, `map_filter_ux.js?v=${SCRIPT_V}`);
  html = html.replace(/map_tab_state\.js(?:\?v=\d+)?/g, 'map_tab_state.js?v=10');
  html = html.replace(/sector_nav\.js(?:\?v=\d+)?/g, 'sector_nav.js?v=8');
  return html;
}

function ensureSectorNavHtml(html) {
  if (html.includes('id="sector-nav"')) return html;
  return html.replace(
    /<div class="header-actions">\s*/,
    '<div class="header-actions">\n      <nav class="sector-nav" id="sector-nav"></nav>\n',
  );
}

function patchApplyLang(html) {
  if (!html.includes('InvestingMapSectorNav.render')) {
    html = html.replace(
      /(document\.title = t\.title;)/,
      `$1\n      if (window.InvestingMapSectorNav) InvestingMapSectorNav.render(document.body.getAttribute('data-sector') || '', lang);`,
    );
  }
  if (!html.includes('InvestingMapGlobalBottomNav.render')) {
    const hook = '      if (window.InvestingMapGlobalBottomNav) InvestingMapGlobalBottomNav.render(lang);\n';
    if (html.includes('InvestingMapMobileUx.syncAll')) {
      html = html.replace(
        /(if \(window\.InvestingMapMobileUx\) InvestingMapMobileUx\.syncAll\(\);)/,
        `$1\n${hook.trimEnd()}`,
      );
    } else if (html.includes('syncThemeToggle();')) {
      html = html.replace(/(syncThemeToggle\(\);)/, `$1\n${hook.trimEnd()}`);
    }
  }
  return html;
}

function patchSwitchTab(html) {
  if (html.includes('InvestingMapTabState.onTabChange')) return html;
  return html.replace(
    /function switchTab\(tab, btn\) \{([\s\S]*?)(\n    \})/,
    (m, body, close) => {
      if (body.includes('InvestingMapTabState')) return m;
      return `function switchTab(tab, btn) {${body}\n      if (window.InvestingMapTabState) InvestingMapTabState.onTabChange(tab);${close}`;
    },
  );
}

function patchInit(html) {
  if (html.includes('InvestingMapTabState.applyInitialTab')) return html;
  if (/loadFx\(\)\.then\(function \(\) \{\s*\n/.test(html)) {
    return html.replace(
      /loadFx\(\)\.then\(function \(\) \{\s*\n/,
      'loadFx().then(function () {\n      if (window.InvestingMapTabState) InvestingMapTabState.applyInitialTab(switchTab);\n',
    );
  }
  if (/loadFx\(\)\.catch\(function \(\) \{ \}\)\.finally\(function \(\) \{\s*\n/.test(html)) {
    return html.replace(
      /loadFx\(\)\.catch\(function \(\) \{ \}\)\.finally\(function \(\) \{\s*\n/,
      'loadFx().catch(function () { }).finally(function () {\n      if (window.InvestingMapTabState) InvestingMapTabState.applyInitialTab(switchTab);\n',
    );
  }
  return html;
}

function wrapFilterTools(html) {
  if (html.includes('filter-row-tools')) return html;
  return html.replace(
    /(<div class="filter-row filter-row-market">[\s\S]*?<div id="market-chips"><\/div>\s*<\/div>\s*)<input type="text" id="search-input"/,
    '$1<div class="filter-row filter-row-tools">\n        <input type="text" id="search-input"',
  ).replace(
    /(<div class="result-count" id="result-label">[\s\S]*?<\/div>)\s*(<\/div>\s*<div class="tbl-wrap">)/,
    '$1\n        </div>\n      $2',
  );
}

function patchChainMultiSelect(html, rel) {
  if (rel.includes('bigchip')) {
    // bigchip has only 2 companies; keep no chain filter row and neutralized logic
    html = html.replace(
      /let currentChain = 'all', currentMarket = 'all'/,
      "let selectedChains = new Set(), currentMarket = 'all'",
    );
    html = html.replace(
      /\s*<div class="filter-row filter-row-chain">[\s\S]*?<div id="chain-chips"><\/div>\s*<\/div>/,
      '',
    );
    html = html.replace(
      /\s*document\.getElementById\('fl-chain-label'\)\.textContent = t\.flChain;/,
      '',
    );
    html = html.replace(
      /function buildChainChips\(\) \{[\s\S]*?document\.getElementById\('chain-chips'\);[\s\S]*?\n    \}/,
      'function buildChainChips() {}',
    );
    html = html.replace(
      /function setChainFilter\([^)]*\) \{[\s\S]*?(?:currentChain|selectedChains)[\s\S]*?\n    \}/,
      'function setChainFilter() {}',
    );
    html = html.replace(
      /\s*if \((?:currentChain !== 'all' && c\.chain !== currentChain|selectedChains\.size > 0 && !\[\.\.\.selectedChains\]\.some\(ch => chainMatchesFilter\(c\.chain, ch\)\))\) return false;/,
      '\n        /* bigchip: no chain filter */',
    );
    return html;
  }

  // 1. Variable declaration
  if (html.includes("let currentChain = 'all', currentMarket = 'all'")) {
    html = html.replace(
      "let currentChain = 'all', currentMarket = 'all'",
      "let selectedChains = new Set(), currentMarket = 'all'",
    );
  }

  // 2. Define chainMatchesFilter if not present
  if (!html.includes('function chainMatchesFilter')) {
    html = html.replace(
      /(let selectedChains = new Set\(\), currentMarket = 'all'[\s\S]*?;\s*\n)/,
      `$1\n    function chainMatchesFilter(companyChain, filter) {\n      if (filter === 'all') return true;\n      if (!companyChain) return false;\n      return companyChain === filter;\n    }\n`,
    );
  }

  // 3. buildChainChips isActive
  html = html.replace(
    /const isActive = currentChain === ch;/g,
    "const isActive = ch === 'all' ? selectedChains.size === 0 : selectedChains.has(ch);",
  );

  // 4. setChainFilter toggle logic
  html = html.replace(
    /function setChainFilter\(chain, el\) \{\s*currentChain = chain;\s*buildChainChips\(\);\s*renderTable\(\);\s*\}/g,
    `function setChainFilter(chain, el) {\n      if (chain === 'all') {\n        selectedChains.clear();\n      } else {\n        if (selectedChains.has(chain)) {\n          selectedChains.delete(chain);\n        } else {\n          selectedChains.add(chain);\n        }\n      }\n      buildChainChips();\n      renderTable();\n    }`,
  );

  // 5. renderTable filtering
  html = html.replace(
    /if \(currentChain !== 'all' && c\.chain !== currentChain\) return false;/g,
    "if (selectedChains.size > 0 && ![...selectedChains].some(ch => chainMatchesFilter(c.chain, ch))) return false;",
  );
  html = html.replace(
    /if \(currentChain !== 'all' && !chainMatchesFilter\(c\.chain, currentChain\)\) return false;/g,
    "if (selectedChains.size > 0 && ![...selectedChains].some(ch => chainMatchesFilter(c.chain, ch))) return false;",
  );

  return html;
}

function patchBioMultiSelect(js) {
  // 1. Variable declaration
  js = js.replace(
    "let currentChain = 'all', currentMarket = 'all'",
    "let selectedChains = new Set(), currentMarket = 'all'",
  );

  // 2. Define chainMatchesFilter if not present
  if (!js.includes('function chainMatchesFilter')) {
    js = js.replace(
      /(let selectedChains = new Set\(\), currentMarket = 'all'[\s\S]*?;\s*\n)/,
      `$1\n    function chainMatchesFilter(companyChain, filter) {\n      if (filter === 'all') return true;\n      if (!companyChain) return false;\n      return companyChain === filter;\n    }\n`,
    );
  }

  // 3. buildChainChips isActive
  js = js.replace(
    /const isActive = currentChain === ch;/g,
    "const isActive = ch === 'all' ? selectedChains.size === 0 : selectedChains.has(ch);",
  );

  // 4. setChainFilter toggle logic
  js = js.replace(
    /function setChainFilter\(chain, el\) \{\s*currentChain = chain;\s*buildChainChips\(\);\s*renderTable\(\);\s*\}/g,
    `function setChainFilter(chain, el) {\n      if (chain === 'all') {\n        selectedChains.clear();\n      } else {\n        if (selectedChains.has(chain)) {\n          selectedChains.delete(chain);\n        } else {\n          selectedChains.add(chain);\n        }\n      }\n      buildChainChips();\n      renderTable();\n    }`,
  );

  // 5. renderTable filtering
  js = js.replace(
    /if \(!chainMatches\(c, currentChain\)\) return false;/g,
    "if (selectedChains.size > 0 && ![...selectedChains].some(ch => chainMatches(c, ch))) return false;",
  );

  // 6. resetTableFilters
  js = js.replace(
    /currentChain = 'all';/g,
    "selectedChains.clear();",
  );

  return js;
}

function patchMapFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf8');
  html = ensureHeadScripts(html);
  html = ensureSectorNavHtml(html);
  html = html.replace(FILTER_BAR_OLD, FILTER_BAR_NEW);
  html = wrapFilterTools(html);
  html = patchApplyLang(html);
  html = patchSwitchTab(html);
  html = patchInit(html);
  html = patchChainMultiSelect(html, rel);
  if (!html.includes('global_bottom_nav.js')) {
    html = html.replace(
      /<script src="([^"]*geo_footer\.js)"><\/script>/,
      '<script src="../js/global_bottom_nav.js?v=8"></script>\n  <script src="$1"></script>',
    );
  }
  fs.writeFileSync(fp, html);
  console.log('patched map nav/filters:', rel);
}

function patchBioTail(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  let js = fs.readFileSync(fp, 'utf8');
  js = patchApplyLang(js);
  js = patchSwitchTab(js);
  js = patchInit(js);
  js = patchBioMultiSelect(js);
  fs.writeFileSync(fp, js);
  console.log('patched:', rel);
}

for (const rel of MAP_FILES) patchMapFile(rel);
patchBioTail('bio/bio_inline_tail.js');
patchBioTail('bio/korea_bio_map.inline.js');

console.log('OK patch_map_nav_filters v=' + SCRIPT_V);
