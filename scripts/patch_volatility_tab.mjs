/**
 * Add volatility distribution tab after momentum on sector map pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_V = 7;
const TAB_STATE_V = 10;

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

const VOLATILITY_BUTTON =
  `\n    <button id="tab-btn-volatility" class="tab-btn" onclick="switchTab('volatility',this)">📉 변동성 분포</button>`;

const VOLATILITY_TAB = `  <!-- VOLATILITY TAB -->
  <div id="tab-volatility" class="tab-content">
    <div class="volatility-wrap">
      <p class="volatility-meta" id="volatility-hint">색=20일 %b(진할수록 높음) · 세로선 = 전 종목 변동성 백분위(P25·P50·P75)</p>
      <div id="volatility-root" role="img" aria-label="Volatility distribution"></div>
      <div id="volatility-legend"></div>
    </div>
  </div>

`;

const RENDER_VOLATILITY_FN = `    function renderVolatility() {
      if (!window.InvestingMapVolatility) return;
      var el = document.getElementById('volatility-root');
      if (!el) return;
      var vt = T[lang] || {};
      InvestingMapVolatility.render({
        container: el,
        legend: document.getElementById('volatility-legend'),
        companies: koreanCompanies,
        lang: lang,
        labels: {
          title: vt.volatilityTitle,
          xAxis: vt.volatilityAxisAtr,
          yAxis: vt.volatilityAxisMcap,
          atr: vt.volatilityAtr,
          mcap: vt.volatilityMcap,
          pctB: vt.volatilityPctB,
          turnover: vt.volatilityTurnover,
          chg: vt.volatilityChg,
          rs: vt.volatilityRs,
          noData: vt.volatilityNoData,
          legendSize: vt.volatilityLegendSize,
          legendLines: vt.volatilityLegendLines,
          legendPctB: vt.volatilityLegendPctB,
          legendChg: vt.volatilityLegendChg,
          legendRs: vt.volatilityLegendRs,
          modePctB: vt.volatilityModePctB,
          modeChg: vt.volatilityModeChg,
          modeRs: vt.volatilityModeRs,
          legend: vt.volatilityLegend
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
    tabVolatility: '📉 변동성 분포',
    volatilityTitle: '변동성 분포',
    volatilityHint: '색=20일 %b(진할수록 높음) · 세로선 = 전 종목 변동성 백분위(P25·P50·P75)',
    volatilityAxisAtr: 'ATR3/종가',
    volatilityAxisMcap: '시가총액(로그)',
    volatilityAtr: 'ATR3/종가',
    volatilityMcap: '시가총액',
    volatilityPctB: '20일 %b',
    volatilityTurnover: '거래대금',
    volatilityChg: '당일 등락률',
    volatilityRs: 'RS',
    volatilityNoData: '변동성 스냅샷 데이터가 없습니다.',
    volatilityLegendSize: '크기 = 거래대금',
    volatilityLegendLines: '세로선 = 전 종목 변동성 백분위(P25·P50·P75)',
    volatilityLegendPctB: '색 = 20일 %b(진할수록 높음)',
    volatilityLegendChg: '색 = 당일 등락률',
    volatilityLegendRs: '색 = RS(진할수록 높음)',
    volatilityModePctB: '%b',
    volatilityModeChg: '당일 등락률',
    volatilityModeRs: 'RS',
    volatilityLegend:
      '크기 = 거래대금 · 색 = 20일 %b(진할수록 높음) · 세로선 = 전 종목 변동성 백분위(P25·P50·P75)',
  },
  en: {
    tabVolatility: '📉 Volatility Distribution',
    volatilityTitle: 'Volatility Distribution',
    volatilityHint:
      'Color = 20D %b (darker = higher) · lines = market-wide volatility percentiles (P25·P50·P75)',
    volatilityAxisAtr: 'ATR3/Close',
    volatilityAxisMcap: 'Market cap (log)',
    volatilityAtr: 'ATR3/Close',
    volatilityMcap: 'Market cap',
    volatilityPctB: '20D %b',
    volatilityTurnover: 'Turnover',
    volatilityChg: '1-day change',
    volatilityRs: 'RS',
    volatilityNoData: 'No volatility snapshot data available.',
    volatilityLegendSize: 'Size = turnover',
    volatilityLegendLines: 'Lines = market-wide volatility percentiles (P25·P50·P75)',
    volatilityLegendPctB: 'Color = 20D %b (darker = higher)',
    volatilityLegendChg: 'Color = 1-day change',
    volatilityLegendRs: 'Color = RS (darker = higher)',
    volatilityModePctB: '%b',
    volatilityModeChg: '1-day change',
    volatilityModeRs: 'RS',
    volatilityLegend:
      'Size = turnover · Color = 20D %b (darker = higher) · lines = market-wide volatility percentiles (P25·P50·P75)',
  },
};

function translationLines(lang, indent, keyQuote, valueQuote) {
  const qk = (key) => (keyQuote ? `${keyQuote}${key}${keyQuote}` : key);
  return Object.entries(TRANSLATIONS[lang])
    .map(([key, value]) => `${indent}${qk(key)}: ${valueQuote}${value}${valueQuote},`)
    .join('\n');
}

function patchTranslationObjects(source) {
  if (/["']?tabVolatility["']?\s*:/.test(source)) return source;
  return source.replace(
    /^([ \t]*)(["']?)tabMomentum\2\s*:\s*(["'])(.*?)\3,[ \t]*$/gm,
    (line, indent, keyQuote, valueQuote, value) => {
      const lang = /Momentum matrix|Volatility/i.test(value) && !/모멘텀/.test(value) ? 'en' : 'ko';
      return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
    },
  );
}

function patchRuntime(source) {
  source = patchTranslationObjects(source);

  if (!source.includes("getElementById('tab-btn-volatility')")) {
    source = source.replace(
      /(var momentumHint = document\.getElementById\('momentum-hint'\);[\s\S]*?if \(momentumHint\) momentumHint\.textContent = [^;]+;)/,
      `$1\n      var volatilityBtn = document.getElementById('tab-btn-volatility');\n` +
        `      if (volatilityBtn) volatilityBtn.innerHTML = t.tabVolatility || (lang === 'en' ? '📉 Volatility Distribution' : '📉 변동성 분포');\n` +
        `      var volatilityHint = document.getElementById('volatility-hint');\n` +
        `      if (volatilityHint) volatilityHint.textContent = t.volatilityHint || (lang === 'en' ? 'Color = 20D %b (darker = higher) · lines = market-wide volatility percentiles (P25·P50·P75)' : '색=20일 %b(진할수록 높음) · 세로선 = 전 종목 변동성 백분위(P25·P50·P75)');`,
    );
  }

  if (!source.includes('function renderVolatility()')) {
    source = source.replace(
      /^([ \t]*)function renderMomentum\(\) \{/m,
      `${RENDER_VOLATILITY_FN}$1function renderMomentum() {`,
    );
  }

  if (!source.includes("if (tab === 'volatility')")) {
    source = source.replace(
      /^(\s*if \(tab === 'momentum'\)[^\n]+)$/m,
      `$1\n      if (tab === 'volatility') setTimeout(renderVolatility, 40);`,
    );
  }

  source = source.replace(
    /(if \(document\.getElementById\('tab-momentum'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderMomentum, 80\);)(?!\s*\n\s*if \(document\.getElementById\('tab-volatility'\))/g,
    `$1\n      if (document.getElementById('tab-volatility')?.classList.contains('active')) setTimeout(renderVolatility, 80);`,
  );
  source = source.replace(
    /(if \(document\.getElementById\('tab-momentum'\)\?\.classList\.contains\('active'\)\) renderMomentum\(\);)(?!\s*if \(document\.getElementById\('tab-volatility'\))/g,
    `$1 if (document.getElementById('tab-volatility')?.classList.contains('active')) renderVolatility();`,
  );
  return source;
}

function patchHtml(source) {
  if (!source.includes('tab-btn-volatility')) {
    source = source.replace(
      /(<button id="tab-btn-momentum"[\s\S]*?<\/button>)/,
      `$1${VOLATILITY_BUTTON}`,
    );
  }
  if (!source.includes('id="tab-volatility"')) {
    source = source.replace(
      /(\s*<!-- TABLE TAB -->)/,
      `\n${VOLATILITY_TAB}$1`,
    );
  }
  if (!source.includes('map_volatility.js')) {
    source = source.replace(
      /(<script src="\.\.\/js\/map_momentum\.js(?:\?v=\d+)?"><\/script>)/,
      `$1\n  <script src="../js/map_volatility.js?v=${SCRIPT_V}"></script>`,
    );
  } else {
    source = source.replace(
      /map_volatility\.js(?:\?v=\d+)?/g,
      `map_volatility.js?v=${SCRIPT_V}`,
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

console.log(`OK patch_volatility_tab v=${SCRIPT_V}`);
