/**
 * Add network-map tab after valuation on sectors that have data/netmap/<sector>.json.
 * Does not touch WIP relation_network / tab-graph.
 */
import fs from 'node:fs';
import path from 'node:path';
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
    <div class="netmap-wrap">
      <div id="netmap-toolbar" class="netmap-toolbar"></div>
      <div id="netmap-legend" class="netmap-legend"></div>
      <div class="netmap-layout">
        <div id="netmap-root" role="img" aria-label="Network map"></div>
        <aside id="netmap-side" hidden></aside>
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
        toolbar: document.getElementById('netmap-toolbar'),
        legend: document.getElementById('netmap-legend'),
        companies: typeof koreanCompanies !== 'undefined' ? koreanCompanies : [],
        lang: lang,
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
            eu: nt.netmapCountryEu
          }
        }
      });
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
      const window = full.slice(offset, offset + 2200);
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

function patchRuntime(source, sector) {
  source = patchTranslationObjects(source);

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
  return source;
}

function patchHtml(source, sector) {
  if (!source.includes('tab-btn-netmap')) {
    source = source.replace(
      /(<button id="tab-btn-valuation"[\s\S]*?<\/button>)/,
      `$1${NET_BUTTON}`,
    );
  }
  if (!source.includes('id="tab-netmap"')) {
    if (source.includes('id="tab-valuation"')) {
      source = source.replace(
        /(<\/div>\s*<\/div>\s*<\/div>\s*)(\s*<!-- TABLE TAB -->)/,
        (m, a, b) => {
          // Prefer insert after valuation tab block
          return m;
        },
      );
      // Insert after valuation tab closing: find tab-valuation block end before TABLE or after valuation-wrap
      if (!source.includes('id="tab-netmap"')) {
        source = source.replace(
          /(<div id="tab-valuation" class="tab-content">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/,
          `$1\n${NET_TAB}`,
        );
      }
      if (!source.includes('id="tab-netmap"')) {
        source = source.replace(/(\s*<!-- TABLE TAB -->)/, `\n${NET_TAB}$1`);
      }
    } else {
      source = source.replace(/(\s*<!-- TABLE TAB -->)/, `\n${NET_TAB}$1`);
    }
  }
  if (!source.includes('map_netmap.js')) {
    source = source.replace(
      /(<script src="\.\.\/js\/map_valuation\.js(?:\?v=[\w.\-]+)?"><\/script>)/,
      `$1\n  <script src="../js/map_netmap.js?v=${V_PLACEHOLDER}"></script>`,
    );
  }
  return patchRuntime(source, sector);
}

function hasNetmapData(sector) {
  return fs.existsSync(path.join(NETMAP_DIR, `${sector}.json`));
}

/**
 * Remove netmap chrome cloned from semiconductor into other sector maps.
 * Builders (robot/ship/defense/…) clone the semi HTML template; without a
 * matching data/netmap/<sector>.json the tab must not ship.
 */
function stripNetmap(source) {
  let out = source;
  out = out.replace(/\n?\s*<script src="\.\.\/js\/map_netmap\.js(?:\?v=[\w.\-]+)?"><\/script>/g, '');
  out = out.replace(
    /\n?\s*<button id="tab-btn-netmap" class="tab-btn"[^>]*>[\s\S]*?<\/button>/g,
    '',
  );
  out = out.replace(
    /\n?\s*<!-- NETMAP TAB -->\s*<div id="tab-netmap" class="tab-content">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*/g,
    '\n',
  );
  // Fallback if comment missing / wrap structure differs
  out = out.replace(
    /\n?\s*<div id="tab-netmap" class="tab-content">[\s\S]*?<\/aside>\s*<\/div>\s*<\/div>\s*<\/div>\s*/g,
    '\n',
  );
  out = out.replace(
    /\n?\s*var netmapBtn = document\.getElementById\('tab-btn-netmap'\);\s*\n\s*if \(netmapBtn\) netmapBtn\.innerHTML = [^;]+;/g,
    '',
  );
  out = out.replace(
    /\n?\s*function renderNetmap\(\) \{[\s\S]*?\n\s*\}\n(?=\s*function render)/g,
    '\n',
  );
  out = out.replace(/\n?\s*if \(tab === 'netmap'\) setTimeout\(renderNetmap, 40\);/g, '');
  out = out.replace(
    /\n?\s*if \(document\.getElementById\('tab-netmap'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderNetmap, 80\);/g,
    '',
  );
  out = out.replace(
    /\s*if \(document\.getElementById\('tab-netmap'\)\?\.classList\.contains\('active'\)\) renderNetmap\(\);/g,
    '',
  );
  // i18n keys inserted after tabValuation / tabNetmap
  for (const key of REQUIRED_KEYS) {
    const re = new RegExp(
      `\\n[ \\t]*(?:["']?${key}["']?)\\s*:\\s*(['"])(?:.*?)\\1,`,
      'g',
    );
    out = out.replace(re, '');
  }
  return out;
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
  console.log('OK patch_netmap_tab');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
