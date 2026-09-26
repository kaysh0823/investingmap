/**
 * Add network-map tab after valuation on sectors that have data/netmap/<sector>.json.
 * Does not touch WIP relation_network / tab-graph.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V_PLACEHOLDER = 0;
const NETMAP_DIR = path.join(ROOT, 'data', 'netmap');

/** Map HTML path → sector id used under data/netmap/<sector>.json */
const MAP_SECTOR = {
  'semiconductor/korea_semiconductor_map.html': 'semiconductor',
  'bigchip/korea_bigchip_map.html': 'bigchip',
  'bio/korea_bio_map.html': 'bio',
  'ship/korea_ship_map.html': 'ship',
  'defense/korea_defense_map.html': 'defense',
  'robot/korea_robot_map.html': 'robot',
  'auto/korea_auto_map.html': 'auto',
  'medtech/korea_medtech_map.html': 'medtech',
  'battery/korea_battery_map.html': 'battery',
  'renewable/korea_renewable_map.html': 'renewable',
  'nuclear/korea_nuclear_map.html': 'nuclear',
  'powergrid/korea_powergrid_map.html': 'powergrid',
  'finance/korea_finance_map.html': 'finance',
  'construction/korea_construction_map.html': 'construction',
  'kconsume/korea_kconsume_map.html': 'kconsume',
  'cosmetics/korea_cosmetics_map.html': 'cosmetics',
  'kcontent/korea_kcontent_map.html': 'kcontent',
  'software/korea_software_map.html': 'software',
  'holdings/korea_holdings_map.html': 'holdings',
  'telecom/korea_telecom_map.html': 'telecom',
  'chemical/korea_chemical_map.html': 'chemical',
  'travel/korea_travel_map.html': 'travel',
  'elec/korea_elec_map.html': 'elec',
  'metal/korea_metal_map.html': 'metal',
  'machinery/korea_machinery_map.html': 'machinery',
  'shipping/korea_shipping_map.html': 'shipping',
};

const NET_BUTTON =
  `\n    <button id="tab-btn-netmap" class="tab-btn" onclick="switchTab('netmap',this)">🕸️ 네트워크맵</button>`;

const NET_TAB = `  <!-- NETMAP TAB -->
  <div id="tab-netmap" class="tab-content">
    <div class="netmap-shell">
      <details class="netmap-panel-fold" open>
        <summary class="netmap-panel-summary">필터·범례</summary>
        <aside id="netmap-panel" class="netmap-panel"></aside>
      </details>
      <div class="netmap-stage">
        <div id="netmap-root" role="img" aria-label="Network map"></div>
        <aside id="netmap-side" hidden></aside>
        <div class="netmap-stage-actions"></div>
      </div>
    </div>
  </div>

`;

function renderNetFn(sector) {
  return `    function renderNetmap() {
      if (!window.InvestingMapNetmap) return;
      var el = document.getElementById('netmap-root');
      if (!el) return;
      var nt = T[lang] || {};
      InvestingMapNetmap.render({
        container: el,
        side: document.getElementById('netmap-side'),
        panel: document.getElementById('netmap-panel'),
        companies: typeof koreanCompanies !== 'undefined' ? koreanCompanies : [],
        lang: lang,
        sectorId: '${sector}',
        dataUrl: '../data/netmap/${sector}.json',
        labels: {
          title: nt.tabNetmap,
          search: nt.netmapSearch,
          scopeAll: nt.netmapScopeAll,
          scopeDomestic: nt.netmapScopeDomestic,
          fit: nt.netmapFit,
          reset: nt.netmapReset,
          loading: nt.netmapLoading,
          failed: nt.netmapFailed,
          noData: nt.netmapNoData,
          source: nt.netmapSource,
          openChart: nt.netmapOpenChart,
          legendRs: nt.netmapLegendRs,
          guideDomestic: nt.netmapGuideDomestic,
          guideGlobal: nt.netmapGuideGlobal,
          footerHint: nt.netmapFooterHint,
          panelFilters: nt.netmapPanelFilters,
          sectionSearch: nt.netmapSectionSearch,
          sectionTypes: nt.netmapSectionTypes,
          sectionScope: nt.netmapSectionScope,
          sectionCountries: nt.netmapSectionCountries,
          sectionGuide: nt.netmapSectionGuide,
          close: nt.netmapClose,
          asOfLabel: nt.netmapAsOf,
          nodesLabel: nt.netmapNodes,
          edgesLabel: nt.netmapEdges,
          types: {
            supply: nt.netmapTypeSupply,
            partner: nt.netmapTypePartner,
            equity: nt.netmapTypeEquity,
            peer: nt.netmapTypePeer,
            distribution: nt.netmapTypeDistribution
          },
          countries: {
            us: nt.netmapCountryUs,
            tw: nt.netmapCountryTw,
            jp: nt.netmapCountryJp,
            cn: nt.netmapCountryCn,
            eu: nt.netmapCountryEu,
            other: nt.netmapCountryOther
          },
          countryNames: {
            us: nt.netmapCountryNameUs,
            tw: nt.netmapCountryNameTw,
            jp: nt.netmapCountryNameJp,
            cn: nt.netmapCountryNameCn,
            eu: nt.netmapCountryNameEu,
            other: nt.netmapCountryNameOther
          }
        }
      });
    }

`;
}

/** Bio: first visit paints; later tab re-entry only recolors (ResizeObserver keeps fit). */
function renderNetFnBio() {
  return `    var __imNetmapPainted = false;
    function renderNetmap(force) {
      if (!window.InvestingMapNetmap) return;
      var el = document.getElementById('netmap-root');
      if (!el) return;
      if (__imNetmapPainted && !force) {
        if (el.querySelector('svg') && typeof InvestingMapNetmap.recolorNodes === 'function') {
          InvestingMapNetmap.recolorNodes();
          return;
        }
        __imNetmapPainted = false;
      }
      var nt = T[lang] || {};
      InvestingMapNetmap.render({
        container: el,
        side: document.getElementById('netmap-side'),
        panel: document.getElementById('netmap-panel'),
        companies: typeof koreanCompanies !== 'undefined' ? koreanCompanies : [],
        lang: lang,
        sectorId: 'bio',
        dataUrl: '../data/netmap/bio.json',
        labels: {
          title: nt.tabNetmap,
          search: nt.netmapSearch,
          scopeAll: nt.netmapScopeAll,
          scopeDomestic: nt.netmapScopeDomestic,
          fit: nt.netmapFit,
          reset: nt.netmapReset,
          loading: nt.netmapLoading,
          failed: nt.netmapFailed,
          noData: nt.netmapNoData,
          source: nt.netmapSource,
          openChart: nt.netmapOpenChart,
          legendRs: nt.netmapLegendRs,
          guideDomestic: nt.netmapGuideDomestic,
          guideGlobal: nt.netmapGuideGlobal,
          footerHint: nt.netmapFooterHint,
          panelFilters: nt.netmapPanelFilters,
          sectionSearch: nt.netmapSectionSearch,
          sectionTypes: nt.netmapSectionTypes,
          sectionScope: nt.netmapSectionScope,
          sectionCountries: nt.netmapSectionCountries,
          sectionGuide: nt.netmapSectionGuide,
          close: nt.netmapClose,
          asOfLabel: nt.netmapAsOf,
          nodesLabel: nt.netmapNodes,
          edgesLabel: nt.netmapEdges,
          types: {
            supply: nt.netmapTypeSupply,
            partner: nt.netmapTypePartner,
            equity: nt.netmapTypeEquity,
            peer: nt.netmapTypePeer,
            distribution: nt.netmapTypeDistribution
          },
          countries: {
            us: nt.netmapCountryUs,
            tw: nt.netmapCountryTw,
            jp: nt.netmapCountryJp,
            cn: nt.netmapCountryCn,
            eu: nt.netmapCountryEu,
            other: nt.netmapCountryOther
          },
          countryNames: {
            us: nt.netmapCountryNameUs,
            tw: nt.netmapCountryNameTw,
            jp: nt.netmapCountryNameJp,
            cn: nt.netmapCountryNameCn,
            eu: nt.netmapCountryNameEu,
            other: nt.netmapCountryNameOther
          }
        }
      });
      __imNetmapPainted = true;
    }

`;
}

const TRANSLATIONS = {
  ko: {
    tabNetmap: '🕸️ 네트워크맵',
    netmapSearch: '이름·티커 검색',
    netmapScopeAll: '국내+글로벌',
    netmapScopeDomestic: '국내만',
    netmapFit: '전체보기',
    netmapReset: '초기화',
    netmapLoading: '네트워크맵을 불러오는 중…',
    netmapFailed: '네트워크맵을 불러오지 못했습니다.',
    netmapNoData: '표시할 네트워크 데이터가 없습니다.',
    netmapSource: '출처',
    netmapOpenChart: '차트 열기',
    netmapLegendRs: '국내 점 색 = RS(시장 RS 초과 초록 · 미만 빨강) · 크기 = 시총',
    netmapGuideDomestic: '● 국내: 색 = RS(시장 RS 초과 초록 · 미만 빨강), 크기 = 시총',
    netmapGuideGlobal: '■ 글로벌: 색 = 국가, 크기 = 연결 수',
    netmapFooterHint: '출처는 노드 클릭 → 관계 목록에서 확인',
    netmapPanelFilters: '필터·범례',
    netmapSectionSearch: '검색',
    netmapSectionTypes: '관계 유형',
    netmapSectionScope: '범위',
    netmapSectionCountries: '국가',
    netmapSectionGuide: '노드 안내',
    netmapClose: '닫기',
    netmapAsOf: '기준',
    netmapNodes: '노드',
    netmapEdges: '관계',
    netmapTypeSupply: '공급',
    netmapTypePartner: '파트너',
    netmapTypeEquity: '지분',
    netmapTypePeer: '피어',
    netmapTypeDistribution: '유통',
    netmapCountryUs: 'US',
    netmapCountryTw: 'TW',
    netmapCountryJp: 'JP',
    netmapCountryCn: 'CN',
    netmapCountryEu: 'EU',
    netmapCountryOther: '기타',
    netmapCountryNameUs: '미국',
    netmapCountryNameTw: '대만',
    netmapCountryNameJp: '일본',
    netmapCountryNameCn: '중국',
    netmapCountryNameEu: '유럽',
    netmapCountryNameOther: '기타(중동·아시아 등)',
  },
  en: {
    tabNetmap: '🕸️ Network map',
    netmapSearch: 'Search name/ticker',
    netmapScopeAll: 'Domestic + global',
    netmapScopeDomestic: 'Domestic only',
    netmapFit: 'Fit',
    netmapReset: 'Reset',
    netmapLoading: 'Loading network map…',
    netmapFailed: 'Could not load network map.',
    netmapNoData: 'No network data available.',
    netmapSource: 'Source',
    netmapOpenChart: 'Open chart',
    netmapLegendRs: 'Domestic color = RS (green above market · red below) · size = market cap',
    netmapGuideDomestic: '● Domestic: color = RS (green above market · red below), size = market cap',
    netmapGuideGlobal: '■ Global: color = country, size = connection count',
    netmapFooterHint: 'Sources appear in the relation list after clicking a node',
    netmapPanelFilters: 'Filters & legend',
    netmapSectionSearch: 'Search',
    netmapSectionTypes: 'Relation types',
    netmapSectionScope: 'Scope',
    netmapSectionCountries: 'Countries',
    netmapSectionGuide: 'Node guide',
    netmapClose: 'Close',
    netmapAsOf: 'as of',
    netmapNodes: 'nodes',
    netmapEdges: 'edges',
    netmapTypeSupply: 'Supply',
    netmapTypePartner: 'Partner',
    netmapTypeEquity: 'Equity',
    netmapTypePeer: 'Peer',
    netmapTypeDistribution: 'Distribution',
    netmapCountryUs: 'US',
    netmapCountryTw: 'TW',
    netmapCountryJp: 'JP',
    netmapCountryCn: 'CN',
    netmapCountryEu: 'EU',
    netmapCountryOther: 'Other',
    netmapCountryNameUs: 'United States',
    netmapCountryNameTw: 'Taiwan',
    netmapCountryNameJp: 'Japan',
    netmapCountryNameCn: 'China',
    netmapCountryNameEu: 'Europe',
    netmapCountryNameOther: 'Other (Middle East, Asia, etc.)',
  },
};

const REQUIRED_KEYS = Object.keys(TRANSLATIONS.ko);

function translationLines(lang, indent, keyQuote, valueQuote) {
  const qk = (key) => (keyQuote ? `${keyQuote}${key}${keyQuote}` : key);
  return Object.entries(TRANSLATIONS[lang])
    .map(([key, value]) => `${indent}${qk(key)}: ${valueQuote}${value}${valueQuote},`)
    .join('\n');
}

function replaceAnchorLine(source, anchorKey, replacer) {
  const patterns = [
    new RegExp(`^([ \\t]*)(${anchorKey})\\s*:\\s*(['"])(.*?)\\3,[ \\t]*\\r?$`, 'gm'),
    new RegExp(`^([ \\t]*)("${anchorKey}")\\s*:\\s*(["'])(.*?)\\3,[ \\t]*\\r?$`, 'gm'),
    new RegExp(`^([ \\t]*)('${anchorKey}')\\s*:\\s*(['"])(.*?)\\3,[ \\t]*\\r?$`, 'gm'),
  ];
  let out = source;
  let changed = false;
  for (const re of patterns) {
    const next = out.replace(re, (...args) => {
      const line = args[0];
      const indent = args[1];
      const keyTok = args[2];
      const valueQuote = args[3];
      const value = args[4];
      const keyQuote = keyTok.startsWith('"') || keyTok.startsWith("'") ? keyTok[0] : '';
      changed = true;
      return replacer({ line, indent, keyQuote, valueQuote, value, keyTok });
    });
    if (next !== out) {
      out = next;
      break;
    }
  }
  return { source: out, changed };
}

function detectLangFromValue(value) {
  return /Network map/i.test(value) && !/네트워크/.test(value)
    ? 'en'
    : /Valuation/i.test(value) && !/밸류|네트워크/.test(value)
      ? 'en'
      : /네트워크|밸류/.test(value)
        ? 'ko'
        : /Network|Valuation/i.test(value)
          ? 'en'
          : 'ko';
}

function patchTranslationObjects(source) {
  if (!/(?:^|[{\s,])["']?tabNetmap["']?\s*:/.test(source)) {
    let r = replaceAnchorLine(source, 'tabValuation', ({ line, indent, keyQuote, valueQuote, value }) => {
      const lang = /Valuation/i.test(value) && !/밸류/.test(value) ? 'en' : 'ko';
      return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
    });
    if (!r.changed) {
      r = replaceAnchorLine(source, 'tabPerfCalendar', ({ line, indent, keyQuote, valueQuote, value }) => {
        const lang = /Performance/i.test(value) && !/퍼포먼스|캘린더/.test(value) ? 'en' : 'ko';
        return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
      });
    }
    source = r.source;
  }

  const anchorPatterns = [
    /^([ \t]*)(tabNetmap)\s*:\s*(['"])(.*?)\3,[ \t]*\r?$/gm,
    /^([ \t]*)("tabNetmap")\s*:\s*(["'])(.*?)\3,[ \t]*\r?$/gm,
    /^([ \t]*)('tabNetmap')\s*:\s*(['"])(.*?)\3,[ \t]*\r?$/gm,
  ];
  for (const re of anchorPatterns) {
    source = source.replace(re, (line, indent, keyTok, valueQuote, value, offset, full) => {
      const keyQuote = keyTok.startsWith('"') || keyTok.startsWith("'") ? keyTok[0] : '';
      const lang = detectLangFromValue(value);
      const window = full.slice(offset, offset + 4200);
      const extras = [];
      for (const key of REQUIRED_KEYS) {
        if (key === 'tabNetmap') continue;
        if (new RegExp(`["']?${key}["']?\\s*:`).test(window)) continue;
        const qk = keyQuote ? `${keyQuote}${key}${keyQuote}` : key;
        extras.push(`${indent}${qk}: ${valueQuote}${TRANSLATIONS[lang][key]}${valueQuote},`);
      }
      if (!extras.length) return line;
      return `${line}\n${extras.join('\n')}`;
    });
  }
  return source;
}

function migrateNetmapDom(source) {
  if (source.includes('id="netmap-panel"') && source.includes('netmap-shell')) {
    // Drop legacy toolbar/legend if both somehow present.
    source = source.replace(/\n?\s*<div id="netmap-toolbar"[\s\S]*?<\/div>\s*/g, '\n');
    source = source.replace(/\n?\s*<div id="netmap-legend"[\s\S]*?<\/div>\s*/g, '\n');
    return source;
  }
  if (source.includes('id="netmap-toolbar"') || source.includes('class="netmap-wrap"')) {
    source = source.replace(
      /<div id="tab-netmap" class="tab-content">[\s\S]*?<\/aside>\s*<\/div>\s*<\/div>\s*<\/div>/,
      NET_TAB.replace(/^  <!-- NETMAP TAB -->\n/, '').trim().replace(/^/, '  <!-- NETMAP TAB -->\n  ').replace(/<\/div>\n\n$/, '</div>'),
    );
    // Fallback: wrap-based replace
    if (!source.includes('id="netmap-panel"')) {
      source = source.replace(
        /<div class="netmap-wrap">[\s\S]*?<div class="netmap-layout">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
        `<div class="netmap-shell">
      <details class="netmap-panel-fold" open>
        <summary class="netmap-panel-summary">필터·범례</summary>
        <aside id="netmap-panel" class="netmap-panel"></aside>
      </details>
      <div class="netmap-stage">
        <div id="netmap-root" role="img" aria-label="Network map"></div>
        <aside id="netmap-side" hidden></aside>
        <div class="netmap-stage-actions"></div>
      </div>
    </div>`,
      );
    }
  }
  return source;
}

function forceNetmapDataUrl(source, sector) {
  const expected = `../data/netmap/${sector}.json`;
  const next = source.replace(
    /dataUrl:\s*'\.\.\/data\/netmap\/[a-z0-9_-]+\.json'/g,
    `dataUrl: '${expected}'`,
  );
  const m = next.match(/dataUrl:\s*'(\.\.\/data\/netmap\/[a-z0-9_-]+\.json)'/);
  if (m && m[1] !== expected) {
    throw new Error(`netmap dataUrl mismatch for ${sector}: got ${m[1]}, expected ${expected}`);
  }
  if (next.includes('function renderNetmap()') && !next.includes(`dataUrl: '${expected}'`)) {
    throw new Error(`netmap dataUrl missing for ${sector}: expected ${expected}`);
  }
  // If sectorId already present, keep it aligned; do not inject into existing maps
  // (avoids mass diffs on sectors that already ship a correct dataUrl).
  if (/sectorId:\s*'[a-z0-9_-]+'/.test(next)) {
    return next.replace(/sectorId:\s*'[a-z0-9_-]+'/g, `sectorId: '${sector}'`);
  }
  return next;
}

function ensureOtherCountryLabels(source) {
  // Idempotently add `other` to labels.countries / labels.countryNames.
  if (
    /countries:\s*\{[\s\S]*?eu:\s*nt\.netmapCountryEu/.test(source) &&
    !/countries:\s*\{[\s\S]*?other:\s*nt\.netmapCountryOther/.test(source)
  ) {
    source = source.replace(
      /(countries:\s*\{[\s\S]*?eu:\s*nt\.netmapCountryEu)(\s*\})/,
      `$1,\n            other: nt.netmapCountryOther$2`,
    );
  }
  if (
    /countryNames:\s*\{[\s\S]*?eu:\s*nt\.netmapCountryNameEu/.test(source) &&
    !/countryNames:\s*\{[\s\S]*?other:\s*nt\.netmapCountryNameOther/.test(source)
  ) {
    source = source.replace(
      /(countryNames:\s*\{[\s\S]*?eu:\s*nt\.netmapCountryNameEu)(\s*\})/,
      `$1,\n            other: nt.netmapCountryNameOther$2`,
    );
  }
  return source;
}

function migrateRenderNetmap(source, sector) {
  if (!source.includes('function renderNetmap()')) return source;
  if (source.includes("panel: document.getElementById('netmap-panel')")) {
    // Ensure countryNames block present
    if (!source.includes('countryNames:')) {
      source = source.replace(
        /(countries: \{[\s\S]*?eu: nt\.netmapCountryEu(?:,\s*other: nt\.netmapCountryOther)?\s*\}\s*)(}\s*\}\);)/,
        `$1,\n          countryNames: {\n            us: nt.netmapCountryNameUs,\n            tw: nt.netmapCountryNameTw,\n            jp: nt.netmapCountryNameJp,\n            cn: nt.netmapCountryNameCn,\n            eu: nt.netmapCountryNameEu,\n            other: nt.netmapCountryNameOther\n          }\n        $2`,
      );
    }
    source = ensureOtherCountryLabels(source);
    // Cloned maps often keep another sector's dataUrl — always rewrite.
    return forceNetmapDataUrl(source, sector);
  }
  // Replace whole function
  source = source.replace(
    /function renderNetmap\(\) \{[\s\S]*?\n    \}\n(?=\s*function render)/,
    renderNetFn(sector).replace(/^    /, '').replace(/\n$/, '') + '\n',
  );
  return forceNetmapDataUrl(source, sector);
}

function patchQuotesReadyRecolor(source) {
  if (source.includes('InvestingMapNetmap.recolorNodes')) return source;
  return source.replace(
    /(onQuotesReady:\s*function\s*\(\)\s*\{)/,
    `$1\n            if (window.InvestingMapNetmap && typeof InvestingMapNetmap.recolorNodes === 'function') InvestingMapNetmap.recolorNodes();`,
  );
}

function patchRuntime(source, sector) {
  source = patchTranslationObjects(source);
  source = migrateNetmapDom(source);
  source = migrateRenderNetmap(source, sector);
  source = patchQuotesReadyRecolor(source);

  if (!source.includes("getElementById('tab-btn-netmap')")) {
    source = source.replace(
      /(var valuationBtn = document\.getElementById\('tab-btn-valuation'\);[\s\S]*?if \(valuationBtn\) valuationBtn\.innerHTML = [^;]+;)/,
      `$1\n      var netmapBtn = document.getElementById('tab-btn-netmap');\n` +
        `      if (netmapBtn) netmapBtn.innerHTML = t.tabNetmap || (lang === 'en' ? '🕸️ Network map' : '🕸️ 네트워크맵');`,
    );
  }

  if (!source.includes('function renderNetmap()')) {
    const fn = renderNetFn(sector);
    if (source.includes('function renderValuation()')) {
      source = source.replace(/^([ \t]*)function renderValuation\(\) \{/m, `${fn}$1function renderValuation() {`);
    } else {
      source = source.replace(/^([ \t]*)function renderPerfCalendar\(\) \{/m, `${fn}$1function renderPerfCalendar() {`);
    }
  }

  if (!source.includes("if (tab === 'netmap')")) {
    source = source.replace(
      /^(\s*if \(tab === 'valuation'\)[^\n]+)$/m,
      `$1\n      if (tab === 'netmap') setTimeout(renderNetmap, 40);`,
    );
  }

  source = source.replace(
    /(if \(document\.getElementById\('tab-valuation'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderValuation, 80\);)(?!\s*\n\s*if \(document\.getElementById\('tab-netmap'\))/g,
    `$1\n      if (document.getElementById('tab-netmap')?.classList.contains('active')) setTimeout(renderNetmap, 80);`,
  );
  source = source.replace(
    /(if \(document\.getElementById\('tab-valuation'\)\?\.classList\.contains\('active'\)\) renderValuation\(\);)(?!\s*if \(document\.getElementById\('tab-netmap'\))/g,
    `$1 if (document.getElementById('tab-netmap')?.classList.contains('active')) renderNetmap();`,
  );

  // applyLang: update details summary label
  if (!source.includes('netmap-panel-summary') || !source.includes('netmapPanelFilters')) {
    source = source.replace(
      /(if \(netmapBtn\) netmapBtn\.innerHTML = [^;]+;)/,
      `$1\n      var netmapSum = document.querySelector('#tab-netmap .netmap-panel-summary');\n` +
        `      if (netmapSum) netmapSum.textContent = t.netmapPanelFilters || (lang === 'en' ? 'Filters & legend' : '필터·범례');`,
    );
  }
  return source;
}

function patchHtml(source, sector) {
  return withPreservedEditorialCss(source, (src) => {
    let out = src;
    if (!out.includes('tab-btn-netmap')) {
      out = out.replace(
        /(<button id="tab-btn-valuation"[\s\S]*?<\/button>)/,
        `$1${NET_BUTTON}`,
      );
    }
    if (!out.includes('id="tab-netmap"')) {
      if (out.includes('id="tab-valuation"')) {
        out = out.replace(
          /(<div id="tab-valuation" class="tab-content">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/,
          `$1\n${NET_TAB}`,
        );
        if (!out.includes('id="tab-netmap"')) {
          out = out.replace(/(\s*<!-- TABLE TAB -->)/, `\n${NET_TAB}$1`);
        }
      } else {
        out = out.replace(/(\s*<!-- TABLE TAB -->)/, `\n${NET_TAB}$1`);
      }
    }
    if (!out.includes('map_netmap.js')) {
      out = out.replace(
        /(<script src="\.\.\/js\/map_valuation\.js(?:\?v=[\w.\-]+)?"><\/script>)/,
        `$1\n  <script src="../js/map_netmap.js?v=${V_PLACEHOLDER}"></script>`,
      );
    }
    return patchRuntime(out, sector);
  });
}

function hasNetmapData(sector) {
  return fs.existsSync(path.join(NETMAP_DIR, `${sector}.json`));
}

/**
 * Never let strip/patch touch the editorial header CSS block produced by
 * patch_editorial_collapsible_html.mjs (start/end markers).
 */
const EDITORIAL_CSS_BLOCK_RE =
  /\/\*\s*investingmap-header-editorial-toggle-v2\s*\*\/[\s\S]*?\/\*\s*investingmap-header-editorial-toggle-v2-end\s*\*\//;

function withPreservedEditorialCss(source, transform) {
  const blocks = [];
  const masked = source.replace(EDITORIAL_CSS_BLOCK_RE, (m) => {
    const i = blocks.length;
    blocks.push(m);
    return `/*__IM_EDITORIAL_CSS_PRESERVE_${i}__*/`;
  });
  let out = transform(masked);
  out = out.replace(/\/\*__IM_EDITORIAL_CSS_PRESERVE_(\d+)__\*\//g, (_, idx) => {
    const i = Number(idx);
    return blocks[i] != null ? blocks[i] : '';
  });
  return out;
}

/**
 * Remove netmap chrome cloned from semiconductor into other sector maps.
 * Builders (robot/ship/defense/…) clone the semi HTML template; without a
 * matching data/netmap/<sector>.json the tab must not ship.
 */
function stripNetmap(source) {
  return withPreservedEditorialCss(source, (src) => {
    let out = src;
    out = out.replace(/\n?\s*<script src="\.\.\/js\/map_netmap\.js(?:\?v=[\w.\-]+)?"><\/script>/g, '');
    out = out.replace(
      /\n?\s*<button id="tab-btn-netmap" class="tab-btn"[^>]*>[\s\S]*?<\/button>/g,
      '',
    );
    out = out.replace(
      /\n?\s*<!-- NETMAP TAB -->\s*<div id="tab-netmap" class="tab-content">[\s\S]*?<\/div>\s*(?=\s*(?:<!--\s*TABLE TAB\s*-->|<div id="tab-table"))/,
      '\n',
    );
    out = out.replace(
      /\n?\s*<div id="tab-netmap" class="tab-content">[\s\S]*?<\/div>\s*(?=\s*(?:<!--\s*TABLE TAB\s*-->|<div id="tab-table"))/,
      '\n',
    );
    out = out.replace(
      /\n?\s*var netmapBtn = document\.getElementById\('tab-btn-netmap'\);\s*\n\s*if \(netmapBtn\) netmapBtn\.innerHTML = [^;]+;/g,
      '',
    );
    out = out.replace(
      /\n?\s*var netmapSum = document\.querySelector\('#tab-netmap \.netmap-panel-summary'\);\s*\n\s*if \(netmapSum\) netmapSum\.textContent = [^;]+;/g,
      '',
    );
    out = out.replace(
      /\n?\s*(?:var __imNetmapPainted = false;\s*)?function renderNetmap\(\) \{[\s\S]*?\n\s*\}\n(?=\s*function render)/g,
      '\n',
    );
    out = out.replace(/\n?\s*if \(tab === 'netmap'\) setTimeout\(renderNetmap, 40\);/g, '');
    out = out.replace(
      /\n?\s*if \(document\.getElementById\('tab-netmap'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderNetmap, 80\);/g,
      '',
    );
    out = out.replace(
      /\s*if \(document\.getElementById\('tab-netmap'\)\?\.classList\.contains\('active'\)\) \{\s*__imNetmapPainted = false;\s*renderNetmap\(true\);\s*\}/g,
      '',
    );
    out = out.replace(
      /\s*if \(document\.getElementById\('tab-netmap'\)\?\.classList\.contains\('active'\)\) renderNetmap\(\);/g,
      '',
    );
    out = out.replace(
      /\n[ \t]*if \(window\.InvestingMapNetmap && typeof InvestingMapNetmap\.recolorNodes === 'function'\) InvestingMapNetmap\.recolorNodes\(\);\r?\n/g,
      '\n',
    );
    for (const key of REQUIRED_KEYS) {
      const re = new RegExp(
        `\\n[ \\t]*(?:["']?${key}["']?)\\s*:\\s*(['"])(?:.*?)\\1,`,
        'g',
      );
      out = out.replace(re, '');
    }
    out = out.replace(
      /(<\/div>\s*<\/div>\s*<\/div>)\s*<\/div>\s*(?=\s*(?:<!--\s*TABLE TAB\s*-->|<div id="tab-table"|[\r\n]+\s*<div id="tab-))/g,
      '$1\n',
    );
    return out;
  });
}

/** Patch bio/bio_inline_tail.js runtime (HTML holds markup only). */
function patchBioInlineTail(source) {
  let out = patchRuntime(source, 'bio');
  if (out.includes("dataUrl: '../data/netmap/bio.json'") && !out.includes('__imNetmapPainted')) {
    out = out.replace(
      /function renderNetmap\(\) \{[\s\S]*?\n    \}\n(?=\s*function render)/,
      renderNetFnBio().replace(/^    /, '').replace(/\n$/, '') + '\n',
    );
  } else if (!out.includes('function renderNetmap()')) {
    const fn = renderNetFnBio();
    if (out.includes('function renderValuation()')) {
      out = out.replace(/^([ \t]*)function renderValuation\(\) \{/m, `${fn}$1function renderValuation() {`);
    } else {
      out = out.replace(/^([ \t]*)function renderPerfCalendar\(\) \{/m, `${fn}$1function renderPerfCalendar() {`);
    }
  }
  out = out.replace(
    /(if \(document\.getElementById\('tab-netmap'\)\?\.classList\.contains\('active'\)\) )renderNetmap\(\);/g,
    `$1{ __imNetmapPainted = false; renderNetmap(true); }`,
  );
  return out;
}

function ensureBioTranslations() {
  const p = path.join(ROOT, 'bio', 'bio_translations.json');
  if (!fs.existsSync(p)) return false;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  for (const lang of ['ko', 'en']) {
    if (!raw[lang]) continue;
    for (const [key, value] of Object.entries(TRANSLATIONS[lang])) {
      if (raw[lang][key] !== value) {
        raw[lang][key] = value;
        changed = true;
      }
    }
  }
  if (changed) fs.writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  return changed;
}

function regenerateBioInline() {
  const gen = path.join(ROOT, 'bio', 'gen_korea_bio_inline.mjs');
  if (!fs.existsSync(gen)) {
    console.warn('missing bio/gen_korea_bio_inline.mjs');
    return;
  }
  const r = spawnSync(process.execPath, [gen], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`gen_korea_bio_inline.mjs failed with status ${r.status}`);
  }
}

function main() {
  for (const [rel, sector] of Object.entries(MAP_SECTOR)) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) {
      console.log('skip missing', rel);
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    let after;
    if (!hasNetmapData(sector)) {
      after = stripNetmap(before);
      if (after !== before) {
        fs.writeFileSync(file, after, 'utf8');
        console.log('stripped (no data/netmap/' + sector + '.json)', rel);
      } else {
        console.log('skip (no data/netmap/' + sector + '.json)', rel);
      }
      continue;
    }
    after = patchHtml(before, sector);
    fs.writeFileSync(file, after, 'utf8');
    console.log(after === before ? 'unchanged' : 'patched', rel);
  }

  // Bio runtime lives in bio_inline_tail.js (concatenated by gen_korea_bio_inline).
  if (hasNetmapData('bio')) {
    const tChanged = ensureBioTranslations();
    if (tChanged) console.log('patched bio/bio_translations.json (netmap keys)');
    const tailPath = path.join(ROOT, 'bio', 'bio_inline_tail.js');
    if (fs.existsSync(tailPath)) {
      const before = fs.readFileSync(tailPath, 'utf8');
      const after = patchBioInlineTail(before);
      if (after !== before) {
        fs.writeFileSync(tailPath, after, 'utf8');
        console.log('patched bio/bio_inline_tail.js');
      } else {
        console.log('unchanged bio/bio_inline_tail.js');
      }
      regenerateBioInline();
      console.log('regenerated bio/korea_bio_map.inline.js');
    }
  }

  console.log('OK patch_netmap_tab');
}

export { MAP_SECTOR };

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
