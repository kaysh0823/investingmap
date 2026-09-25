/**
 * Add valuation comparison tab after performance calendar on sector map pages.
 * Supports both `tabPerfCalendar:` and `"tabPerfCalendar":` T-object styles.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_V = 5;
const TAB_STATE_V = 13;

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

const VAL_BUTTON =
  `\n    <button id="tab-btn-valuation" class="tab-btn" onclick="switchTab('valuation',this)">⚖️ 밸류에이션 비교</button>`;

const VAL_TAB = `  <!-- VALUATION TAB -->
  <div id="tab-valuation" class="tab-content">
    <div class="valuation-wrap">
      <p class="valuation-basis" id="valuation-hint">기준 · KRX 12021 · 일별</p>
      <div id="valuation-root" role="img" aria-label="Valuation comparison"></div>
      <div id="valuation-legend"></div>
    </div>
  </div>

`;

const RENDER_VAL_FN = `    function renderValuation() {
      if (!window.InvestingMapValuation) return;
      var el = document.getElementById('valuation-root');
      if (!el) return;
      var vt = T[lang] || {};
      InvestingMapValuation.render({
        container: el,
        legend: document.getElementById('valuation-legend'),
        companies: typeof koreanCompanies !== 'undefined' ? koreanCompanies : [],
        lang: lang,
        labels: {
          title: vt.tabValuation,
          metricPerTtm: vt.valuationMetricPer,
          metricPerFy: vt.valuationMetricPerFy,
          metricPbr: vt.valuationMetricPbr,
          metricDvd: vt.valuationMetricDvd,
          sortChain: vt.valuationSortChain,
          sortMedian: vt.valuationSortMedian,
          loading: vt.valuationLoading,
          failed: vt.valuationFailed,
          noData: vt.valuationNoData,
          legend: vt.valuationLegend,
          legendPer: vt.valuationLegendPer
        },
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({
            ticker: c.ticker,
            name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker)
          });
        }
      });
    }

`;

const TRANSLATIONS = {
  ko: {
    tabValuation: '⚖️ 밸류에이션 비교',
    valuationMetricPer: 'PER TTM',
    valuationMetricPerFy: 'PER FY',
    valuationMetricPbr: 'PBR',
    valuationMetricDvd: '배당수익률',
    valuationSortChain: '체인 순',
    valuationSortMedian: '그룹 중앙값 순',
    valuationLoading: '밸류에이션 데이터를 불러오는 중…',
    valuationFailed: '밸류에이션 스냅샷을 불러오지 못했습니다.',
    valuationNoData: '표시할 밸류에이션 데이터가 없습니다.',
    valuationLegend: '점 크기=시총 · 색=당일 등락률 · 세로 점선=전 시장 P25/P50/P75(KRX FY)',
    valuationLegendPer:
      'PER(TTM) = 주가 ÷ 최근 4분기 EPS (Naver/WISEfn) · 시장 백분위선은 KRX 직전 사업연도 EPS 기준',
  },
  en: {
    tabValuation: '⚖️ Valuation',
    valuationMetricPer: 'PER TTM',
    valuationMetricPerFy: 'PER FY',
    valuationMetricPbr: 'PBR',
    valuationMetricDvd: 'Div. yield',
    valuationSortChain: 'Chain order',
    valuationSortMedian: 'By group median',
    valuationLoading: 'Loading valuation data…',
    valuationFailed: 'Could not load valuation snapshot.',
    valuationNoData: 'No valuation data available.',
    valuationLegend: 'Dot size=mcap · color=1D chg · dashed lines=market P25/P50/P75 (KRX FY)',
    valuationLegendPer:
      'PER(TTM) = price ÷ TTM EPS (Naver/WISEfn) · market percentile lines use KRX prior-year EPS',
  },
};

const REQUIRED_KEYS = Object.keys(TRANSLATIONS.ko);

function translationLines(lang, indent, keyQuote, valueQuote) {
  const qk = (key) => (keyQuote ? `${keyQuote}${key}${keyQuote}` : key);
  return Object.entries(TRANSLATIONS[lang])
    .map(([key, value]) => `${indent}${qk(key)}: ${valueQuote}${value}${valueQuote},`)
    .join('\n');
}

/** Match both `tabPerfCalendar:` and `"tabPerfCalendar":` / `'tabPerfCalendar':`. */
function replaceAnchorLine(source, anchorKey, replacer) {
  const patterns = [
    // unquoted key: tabPerfCalendar: '...'
    new RegExp(
      `^([ \\t]*)(${anchorKey})\\s*:\\s*(['"])(.*?)\\3,[ \\t]*\\r?$`,
      'gm',
    ),
    // double-quoted key: "tabPerfCalendar": "..."
    new RegExp(
      `^([ \\t]*)("${anchorKey}")\\s*:\\s*(["'])(.*?)\\3,[ \\t]*\\r?$`,
      'gm',
    ),
    // single-quoted key: 'tabPerfCalendar': '...'
    new RegExp(
      `^([ \\t]*)('${anchorKey}')\\s*:\\s*(['"])(.*?)\\3,[ \\t]*\\r?$`,
      'gm',
    ),
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

function detectLangFromValue(value, kind) {
  if (kind === 'perf') {
    return /Performance/i.test(value) && !/퍼포먼스|캘린더/.test(value) ? 'en' : 'ko';
  }
  if (kind === 'vol') {
    return /Volatility/i.test(value) && !/변동성/.test(value) ? 'en' : 'ko';
  }
  return /Valuation/i.test(value) && !/밸류/.test(value) ? 'en' : 'ko';
}

function patchTranslationObjects(source) {
  // Insert full block after tabPerfCalendar (or volatility) when tabValuation missing.
  // Detect T-object keys only (not vt.tabValuation / t.tabValuation references).
  if (!/(?:^|[{\s,])["']?tabValuation["']?\s*:/.test(source)) {
    let r = replaceAnchorLine(source, 'tabPerfCalendar', ({ line, indent, keyQuote, valueQuote, value }) => {
      const lang = detectLangFromValue(value, 'perf');
      return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
    });
    if (!r.changed) {
      r = replaceAnchorLine(source, 'tabVolatility', ({ line, indent, keyQuote, valueQuote, value }) => {
        const lang = detectLangFromValue(value, 'vol');
        return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
      });
    }
    source = r.source;
  }

  // Fill missing required keys after each tabValuation line (ko + en), same quote style.
  const anchorPatterns = [
    /^([ \t]*)(tabValuation)\s*:\s*(['"])(.*?)\3,[ \t]*\r?$/gm,
    /^([ \t]*)("tabValuation")\s*:\s*(["'])(.*?)\3,[ \t]*\r?$/gm,
    /^([ \t]*)('tabValuation')\s*:\s*(['"])(.*?)\3,[ \t]*\r?$/gm,
  ];
  for (const re of anchorPatterns) {
    source = source.replace(re, (line, indent, keyTok, valueQuote, value, offset, full) => {
      const keyQuote = keyTok.startsWith('"') || keyTok.startsWith("'") ? keyTok[0] : '';
      const lang = detectLangFromValue(value, 'val');
      const window = full.slice(offset, offset + 1400);
      const extras = [];
      for (const key of REQUIRED_KEYS) {
        if (key === 'tabValuation') continue;
        if (new RegExp(`["']?${key}["']?\\s*:`).test(window)) continue;
        const qk = keyQuote ? `${keyQuote}${key}${keyQuote}` : key;
        extras.push(`${indent}${qk}: ${valueQuote}${TRANSLATIONS[lang][key]}${valueQuote},`);
      }
      if (!extras.length) return line;
      return `${line}\n${extras.join('\n')}`;
    });
  }

  source = source.replace(
    /(["']?)valuationMetricPer\1\s*:\s*(["'])PER\2(?! TTM)/g,
    `$1valuationMetricPer$1: $2PER TTM$2`,
  );
  return source;
}

function patchRuntime(source) {
  source = patchTranslationObjects(source);

  if (!source.includes("getElementById('tab-btn-valuation')")) {
    source = source.replace(
      /(var perfCalBtn = document\.getElementById\('tab-btn-perfcalendar'\);[\s\S]*?if \(perfCalHint\) perfCalHint\.textContent = [^;]+;)/,
      `$1\n      var valuationBtn = document.getElementById('tab-btn-valuation');\n` +
        `      if (valuationBtn) valuationBtn.innerHTML = t.tabValuation || (lang === 'en' ? '⚖️ Valuation' : '⚖️ 밸류에이션 비교');\n` +
        `      var valuationHint = document.getElementById('valuation-hint');\n` +
        `      if (valuationHint && t.valuationLegend) valuationHint.textContent = t.valuationLegend;`,
    );
  }

  if (!source.includes('function renderValuation()')) {
    source = source.replace(
      /^([ \t]*)function renderPerfCalendar\(\) \{/m,
      `${RENDER_VAL_FN}$1function renderPerfCalendar() {`,
    );
  } else if (!source.includes('metricPerTtm:')) {
    source = source.replace(
      /metricPer:\s*vt\.valuationMetricPer,/,
      'metricPerTtm: vt.valuationMetricPer,\n          metricPerFy: vt.valuationMetricPerFy,',
    );
  }

  if (!source.includes("if (tab === 'valuation')")) {
    source = source.replace(
      /^(\s*if \(tab === 'perfcalendar'\)[^\n]+)$/m,
      `$1\n      if (tab === 'valuation') setTimeout(renderValuation, 40);`,
    );
  }

  source = source.replace(
    /(if \(document\.getElementById\('tab-perfcalendar'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderPerfCalendar, 80\);)(?!\s*\n\s*if \(document\.getElementById\('tab-valuation'\))/g,
    `$1\n      if (document.getElementById('tab-valuation')?.classList.contains('active')) setTimeout(renderValuation, 80);`,
  );
  source = source.replace(
    /(if \(document\.getElementById\('tab-perfcalendar'\)\?\.classList\.contains\('active'\)\) renderPerfCalendar\(\);)(?!\s*if \(document\.getElementById\('tab-valuation'\))/g,
    `$1 if (document.getElementById('tab-valuation')?.classList.contains('active')) renderValuation();`,
  );
  return source;
}

function patchHtml(source) {
  if (!source.includes('tab-btn-valuation')) {
    if (source.includes('tab-btn-perfcalendar')) {
      source = source.replace(
        /(<button id="tab-btn-perfcalendar"[\s\S]*?<\/button>)/,
        `$1${VAL_BUTTON}`,
      );
    } else {
      source = source.replace(
        /(<button id="tab-btn-volatility"[\s\S]*?<\/button>)/,
        `$1${VAL_BUTTON}`,
      );
    }
  }
  if (!source.includes('id="tab-valuation"')) {
    source = source.replace(/(\s*<!-- TABLE TAB -->)/, `\n${VAL_TAB}$1`);
  }
  if (!source.includes('map_valuation.js')) {
    source = source.replace(
      /(<script src="\.\.\/js\/map_perfcalendar\.js(?:\?v=\d+)?"><\/script>)/,
      `$1\n  <script src="../js/map_valuation.js?v=${SCRIPT_V}"></script>`,
    );
  } else {
    source = source.replace(
      /map_valuation\.js(?:\?v=\d+)?/g,
      `map_valuation.js?v=${SCRIPT_V}`,
    );
  }
  source = source.replace(
    /map_tab_state\.js(?:\?v=\d+)?/g,
    `map_tab_state.js?v=${TAB_STATE_V}`,
  );
  return patchRuntime(source);
}

for (const rel of MAP_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = patchHtml(before);
  fs.writeFileSync(file, after, 'utf8');
  console.log(after === before ? 'unchanged' : 'patched', rel);
}

const bioTranslationsPath = path.join(ROOT, 'bio', 'bio_translations.json');
if (fs.existsSync(bioTranslationsPath)) {
  const translations = JSON.parse(fs.readFileSync(bioTranslationsPath, 'utf8'));
  for (const lang of ['ko', 'en']) Object.assign(translations[lang], TRANSLATIONS[lang]);
  fs.writeFileSync(bioTranslationsPath, `${JSON.stringify(translations, null, 2)}\n`, 'utf8');
  console.log('patched bio/bio_translations.json');
}

for (const rel of ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js']) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = patchRuntime(before);
  fs.writeFileSync(file, after, 'utf8');
  console.log(after === before ? 'unchanged' : 'patched', rel);
}

const genPath = path.join(ROOT, 'bio', 'gen_korea_bio_inline.mjs');
if (fs.existsSync(genPath)) {
  try {
    execSync(`node "${genPath}"`, { cwd: ROOT, stdio: 'inherit' });
    // Re-apply runtime hooks after gen (gen rebuilds T from translations).
    const inlinePath = path.join(ROOT, 'bio', 'korea_bio_map.inline.js');
    const tailPath = path.join(ROOT, 'bio', 'bio_inline_tail.js');
    for (const file of [inlinePath, tailPath]) {
      if (!fs.existsSync(file)) continue;
      const before = fs.readFileSync(file, 'utf8');
      const after = patchRuntime(before);
      fs.writeFileSync(file, after, 'utf8');
      console.log(after === before ? 'unchanged-after-gen' : 'patched-after-gen', path.relative(ROOT, file));
    }
  } catch (e) {
    console.warn('WARN gen_korea_bio_inline failed:', e.message || e);
  }
}

console.log(`OK patch_valuation_tab v=${SCRIPT_V}`);
