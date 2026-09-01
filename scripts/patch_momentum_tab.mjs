/**
 * Add the sector momentum-matrix tab beside the heatmap tab.
 * Generated map HTML is patched on every rebuild; bio source fragments and
 * translations are patched as persistence sources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_V = 10;
const TAB_STATE_V = 9;

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

const MOMENTUM_BUTTON =
  `\n    <button id="tab-btn-momentum" class="tab-btn" onclick="switchTab('momentum',this)">📊 모멘텀 매트릭스</button>`;

const MOMENTUM_TAB = `  <!-- MOMENTUM TAB -->
  <div id="tab-momentum" class="tab-content">
    <div class="momentum-wrap">
      <p class="momentum-meta" id="momentum-hint">RS × 주가 위치 · 크기 = 당일 거래대금 · 색 = 당일 등락률</p>
      <div id="momentum-root" role="img" aria-label="Momentum matrix"></div>
      <div id="momentum-legend"></div>
    </div>
  </div>

`;

const RENDER_MOMENTUM_FN = `    function renderMomentum() {
      if (!window.InvestingMapMomentum) return;
      var el = document.getElementById('momentum-root');
      if (!el) return;
      var mt = T[lang] || {};
      InvestingMapMomentum.render({
        container: el,
        legend: document.getElementById('momentum-legend'),
        companies: koreanCompanies,
        lang: lang,
        labels: {
          xAxis: mt.momentumAxisRs,
          yAxis: mt.momentumAxisPosition,
          leader: mt.momentumLeader,
          pullback: mt.momentumPullback,
          emerging: mt.momentumEmerging,
          lagging: mt.momentumLagging,
          turnover: mt.momentumTurnover,
          change: mt.momentumChange,
          position: mt.momentumPosition,
          noData: mt.momentumNoData,
          legend: mt.momentumLegend
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
    tabMomentum: '📊 모멘텀 매트릭스',
    momentumHint: 'RS × 주가 위치 · 크기 = 당일 거래대금 · 색 = 당일 등락률',
    momentumAxisRs: 'RS',
    momentumAxisPosition: '주가 위치',
    momentumLeader: '주도(강세)',
    momentumPullback: '되돌림주의',
    momentumEmerging: '신규부상',
    momentumLagging: '소외',
    momentumTurnover: '당일 거래대금',
    momentumChange: '당일 등락률',
    momentumPosition: '주가 위치',
    momentumNoData: 'RS·주가 위치·거래대금 데이터가 있는 종목이 없습니다.',
    momentumLegend: '색 = 당일 등락률 · 크기 = 당일 거래대금',
  },
  en: {
    tabMomentum: '📊 Momentum matrix',
    momentumHint: 'RS × 52W position · size = daily turnover · color = 1-day return',
    momentumAxisRs: 'RS',
    momentumAxisPosition: '52W price position',
    momentumLeader: 'Leading (strong)',
    momentumPullback: 'Pullback risk',
    momentumEmerging: 'Emerging',
    momentumLagging: 'Lagging',
    momentumTurnover: 'Daily turnover',
    momentumChange: '1-day return',
    momentumPosition: 'Price position',
    momentumNoData: 'No companies have RS, price-position and turnover data.',
    momentumLegend: 'Color = 1-day return · size = daily turnover',
  },
};

function translationLines(lang, indent, keyQuote, valueQuote) {
  const qk = (key) => (keyQuote ? `${keyQuote}${key}${keyQuote}` : key);
  return Object.entries(TRANSLATIONS[lang])
    .map(([key, value]) => `${indent}${qk(key)}: ${valueQuote}${value}${valueQuote},`)
    .join('\n');
}

function patchTranslationObjects(source) {
  if (/["']?tabMomentum["']?\s*:/.test(source)) return source;
  return source.replace(
    /^([ \t]*)(["']?)tabHeatmap\2\s*:\s*(["'])(.*?)\3,[ \t]*$/gm,
    (line, indent, keyQuote, valueQuote, value) => {
      const lang = /Sector|heatmap/i.test(value) && !/섹터/.test(value) ? 'en' : 'ko';
      return `${line}\n${translationLines(lang, indent, keyQuote, valueQuote)}`;
    },
  );
}

function patchRuntime(source) {
  source = patchTranslationObjects(source);

  if (!source.includes("getElementById('tab-btn-momentum')")) {
    source = source.replace(
      /^(\s*document\.getElementById\('tab-btn-heatmap'\)[^\n]+)$/m,
      `$1\n      var momentumBtn = document.getElementById('tab-btn-momentum');\n` +
        `      if (momentumBtn) momentumBtn.innerHTML = t.tabMomentum || (lang === 'en' ? '📊 Momentum matrix' : '📊 모멘텀 매트릭스');\n` +
        `      var momentumHint = document.getElementById('momentum-hint');\n` +
        `      if (momentumHint) momentumHint.textContent = t.momentumHint || (lang === 'en' ? 'RS × 52W position · size = daily turnover · color = 1-day return' : 'RS × 주가 위치 · 크기 = 당일 거래대금 · 색 = 당일 등락률');`,
    );
  }

  if (!source.includes('function renderMomentum()')) {
    source = source.replace(
      /^([ \t]*)function switchTab\(tab, btn\) \{/m,
      `${RENDER_MOMENTUM_FN}$1function switchTab(tab, btn) {`,
    );
  }

  if (!source.includes("if (tab === 'momentum')")) {
    source = source.replace(
      /^(\s*if \(tab === 'heatmap'\)[^\n]+)$/m,
      `$1\n      if (tab === 'momentum') setTimeout(renderMomentum, 40);`,
    );
  }

  source = source.replace(
    /(if \(document\.getElementById\('tab-heatmap'\)\?\.classList\.contains\('active'\)\) setTimeout\(renderHeatmap, 80\);)(?!\s*\n\s*if \(document\.getElementById\('tab-momentum'\))/g,
    `$1\n      if (document.getElementById('tab-momentum')?.classList.contains('active')) setTimeout(renderMomentum, 80);`,
  );
  source = source.replace(
    /(if \(document\.getElementById\('tab-heatmap'\)\?\.classList\.contains\('active'\)\) renderHeatmap\(\);)(?!\s*if \(document\.getElementById\('tab-momentum'\))/g,
    `$1 if (document.getElementById('tab-momentum')?.classList.contains('active')) renderMomentum();`,
  );
  source = source.replace(
    /\}\r[ \t]+function renderMomentum\(\)/g,
    '}\n\n    function renderMomentum()',
  );
  return source;
}

function patchHtml(source) {
  if (!source.includes('tab-btn-momentum')) {
    source = source.replace(
      /(<button id="tab-btn-heatmap"[\s\S]*?<\/button>)/,
      `$1${MOMENTUM_BUTTON}`,
    );
  }
  if (!source.includes('id="tab-momentum"')) {
    source = source.replace(
      /(\s*<!-- TABLE TAB -->)/,
      `\n${MOMENTUM_TAB}$1`,
    );
  }
  if (!source.includes('map_momentum.js')) {
    source = source.replace(
      /(<script src="\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"><\/script>)/,
      `$1\n  <script src="../js/map_momentum.js?v=${SCRIPT_V}"></script>`,
    );
  } else {
    source = source.replace(
      /map_momentum\.js(?:\?v=\d+)?/g,
      `map_momentum.js?v=${SCRIPT_V}`,
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

console.log(`OK patch_momentum_tab v=${SCRIPT_V}`);
