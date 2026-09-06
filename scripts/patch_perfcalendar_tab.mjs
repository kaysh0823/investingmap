/**
 * Add performance calendar tab after volatility on sector map pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_V = 2;
const TAB_STATE_V = 11;

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

const PERF_BUTTON =
  `\n    <button id="tab-btn-perfcalendar" class="tab-btn" onclick="switchTab('perfcalendar',this)">📅 퍼포먼스 캘린더</button>`;

const PERF_TAB = `  <!-- PERF CALENDAR TAB -->
  <div id="tab-perfcalendar" class="tab-content">
    <div class="perfcalendar-wrap">
      <p class="perfcalendar-meta" id="perfcalendar-hint">전년말 종가=100 기준 연중 수익률</p>
      <div id="perfcalendar-root" role="img" aria-label="Performance calendar"></div>
      <div id="perfcalendar-legend"></div>
    </div>
  </div>

`;

const RENDER_PERF_FN = `    function renderPerfCalendar() {
      if (!window.InvestingMapPerfCalendar) return;
      var el = document.getElementById('perfcalendar-root');
      if (!el) return;
      var pt = T[lang] || {};
      var sid = (document.body && document.body.getAttribute('data-sector')) || '';
      InvestingMapPerfCalendar.render({
        container: el,
        legend: document.getElementById('perfcalendar-legend'),
        sectorId: sid,
        lang: lang,
        labels: {
          title: pt.perfCalendarTitle,
          subtitle: pt.perfCalendarSubtitle,
          sectorAvg: pt.perfCalendarSectorAvg,
          kospi: pt.perfCalendarKospi,
          kosdaq: pt.perfCalendarKosdaq,
          loading: pt.perfCalendarLoading,
          failed: pt.perfCalendarFailed,
          noData: pt.perfCalendarNoData,
          legend: pt.perfCalendarLegend,
          base: pt.perfCalendarBase,
          change: pt.perfCalendarChange,
          openChart: pt.perfCalendarOpenChart,
          yearTabs: pt.perfCalendarYearTabs
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
    tabPerfCalendar: '📅 퍼포먼스 캘린더',
    perfCalendarTitle: '퍼포먼스 캘린더',
    perfCalendarSubtitle: '전년말 종가=100 기준 연중 수익률',
    perfCalendarSectorAvg: '섹터 평균',
    perfCalendarKospi: 'KOSPI',
    perfCalendarKosdaq: 'KOSDAQ',
    perfCalendarLoading: '퍼포먼스 데이터를 불러오는 중…',
    perfCalendarFailed: '퍼포먼스 캘린더 데이터를 불러오지 못했습니다.',
    perfCalendarNoData: '표시할 퍼포먼스 데이터가 없습니다.',
    perfCalendarLegend: '종목·섹터 평균·지수 범례',
    perfCalendarBase: '기준',
    perfCalendarChange: '기준 대비',
    perfCalendarOpenChart: '캔들 차트 열기',
    perfCalendarYearTabs: '연도 선택',
  },
  en: {
    tabPerfCalendar: '📅 Performance Calendar',
    perfCalendarTitle: 'Performance Calendar',
    perfCalendarSubtitle: 'YTD vs prior year-end=100',
    perfCalendarSectorAvg: 'Sector average',
    perfCalendarKospi: 'KOSPI',
    perfCalendarKosdaq: 'KOSDAQ',
    perfCalendarLoading: 'Loading performance data…',
    perfCalendarFailed: 'Could not load performance calendar data.',
    perfCalendarNoData: 'No performance data available.',
    perfCalendarLegend: 'Members, sector average, and index legend',
    perfCalendarBase: 'Base',
    perfCalendarChange: 'vs base',
    perfCalendarOpenChart: 'Open candle chart',
    perfCalendarYearTabs: 'Year filter',
  },
};

function translationLines(lang, indent, keyQuote, valueQuote) {
  const qk = (key) => (keyQuote ? `${keyQuote}${key}${keyQuote}` : key);
  return Object.entries(TRANSLATIONS[lang])
    .map(([key, value]) => `${indent}${qk(key)}: ${valueQuote}${value}${valueQuote},`)
    .join('\n');
}

function patchTranslationObjects(source) {
  if (/["']?tabPerfCalendar["']?\s*:/.test(source)) return source;
  // Prefer inserting after volatility keys; fall back to momentum.
  const afterVol = source.replace(
    /^([ \t]*)(["']?)tabVolatility\2\s*:\s*(["'])(.*?)\3,[ \t]*$/gm,
    (line, indent, keyQuote, valueQuote, value) => {
      const lang = /Volatility/i.test(value) && !/변동성/.test(value) ? 'en' : 'ko';
      return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
    },
  );
  if (afterVol !== source) return afterVol;
  return source.replace(
    /^([ \t]*)(["']?)tabMomentum\2\s*:\s*(["'])(.*?)\3,[ \t]*$/gm,
    (line, indent, keyQuote, valueQuote, value) => {
      const lang = /Momentum/i.test(value) && !/모멘텀/.test(value) ? 'en' : 'ko';
      return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
    },
  );
}

function patchRuntime(source) {
  source = patchTranslationObjects(source);

  if (!source.includes("getElementById('tab-btn-perfcalendar')")) {
    source = source.replace(
      /(var volatilityHint = document\.getElementById\('volatility-hint'\);[\s\S]*?if \(volatilityHint\) volatilityHint\.textContent = [^;]+;)/,
      `$1\n      var perfCalBtn = document.getElementById('tab-btn-perfcalendar');\n` +
        `      if (perfCalBtn) perfCalBtn.innerHTML = t.tabPerfCalendar || (lang === 'en' ? '📅 Performance Calendar' : '📅 퍼포먼스 캘린더');\n` +
        `      var perfCalHint = document.getElementById('perfcalendar-hint');\n` +
        `      if (perfCalHint) perfCalHint.textContent = t.perfCalendarSubtitle || (lang === 'en' ? 'YTD vs prior year-end=100' : '전년말 종가=100 기준 연중 수익률');`,
    );
  }

  if (!source.includes('function renderPerfCalendar()')) {
    source = source.replace(
      /^([ \t]*)function renderVolatility\(\) \{/m,
      `${RENDER_PERF_FN}$1function renderVolatility() {`,
    );
  }

  if (!source.includes("if (tab === 'perfcalendar')")) {
    source = source.replace(
      /^(\s*if \(tab === 'volatility'\)[^\n]+)$/m,
      `$1\n      if (tab === 'perfcalendar') setTimeout(renderPerfCalendar, 40);`,
    );
  }

  source = source.replace(
    /(if \(document\.getElementById\('tab-volatility'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderVolatility, 80\);)(?!\s*\n\s*if \(document\.getElementById\('tab-perfcalendar'\))/g,
    `$1\n      if (document.getElementById('tab-perfcalendar')?.classList.contains('active')) setTimeout(renderPerfCalendar, 80);`,
  );
  source = source.replace(
    /(if \(document\.getElementById\('tab-volatility'\)\?\.classList\.contains\('active'\)\) renderVolatility\(\);)(?!\s*if \(document\.getElementById\('tab-perfcalendar'\))/g,
    `$1 if (document.getElementById('tab-perfcalendar')?.classList.contains('active')) renderPerfCalendar();`,
  );
  return source;
}

function patchHtml(source) {
  if (!source.includes('tab-btn-perfcalendar')) {
    source = source.replace(
      /(<button id="tab-btn-volatility"[\s\S]*?<\/button>)/,
      `$1${PERF_BUTTON}`,
    );
  }
  if (!source.includes('id="tab-perfcalendar"')) {
    source = source.replace(
      /(\s*<!-- TABLE TAB -->)/,
      `\n${PERF_TAB}$1`,
    );
  }
  if (!source.includes('map_perfcalendar.js')) {
    source = source.replace(
      /(<script src="\.\.\/js\/map_volatility\.js(?:\?v=\d+)?"><\/script>)/,
      `$1\n  <script src="../js/map_perfcalendar.js?v=${SCRIPT_V}"></script>`,
    );
  } else {
    source = source.replace(
      /map_perfcalendar\.js(?:\?v=\d+)?/g,
      `map_perfcalendar.js?v=${SCRIPT_V}`,
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

console.log(`OK patch_perfcalendar_tab v=${SCRIPT_V}`);
