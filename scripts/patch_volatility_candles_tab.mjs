/** Keep the standalone candles tab immediately after momentum on every map. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderFunction = `    function renderVolatilityCandles() {
      if (!window.InvestingMapVolatilityCandles) return;
      InvestingMapVolatilityCandles.render({
        companies: koreanCompanies,
        lang: lang,
        onSelect: function (c) {
          if (!window.InvestingMapCandleModal || !c || !c.ticker) return;
          InvestingMapCandleModal.open({ ticker: c.ticker, name: lang === 'en' && c.nameEn ? c.nameEn : (c.name || c.nameKo || c.ticker) });
        }
      });
    }

`;

function patchRuntime(source) {
  if (source.includes('function renderVolatilityCandles()')) return source;
  source = source.replace(/^(\s*)function switchTab\(tab, btn\) \{/m, `${renderFunction}$1function switchTab(tab, btn) {`);
  source = source.replace(/(if \(tab === 'momentum'\) setTimeout\(renderMomentum, 40\);)/g,
    `$1\n      if (tab === 'volatility-candles') setTimeout(renderVolatilityCandles, 40);`);
  source = source.replace(/(var momentumBtn = document.getElementById\('tab-btn-momentum'\);)/g,
    `$1\n      var candlesBtn = document.getElementById('tab-btn-volatility-candles');\n      if (candlesBtn) candlesBtn.textContent = lang === 'en' ? '🕯️ Volatility candles' : '🕯️ 변동성 캔들';`);
  source = source.replace(/(if \(document.getElementById\('tab-momentum'\)\?\.classList.contains\('active'\)\) renderMomentum\(\);)/g,
    `$1 if (document.getElementById('tab-volatility-candles')?.classList.contains('active')) renderVolatilityCandles();`);
  source = source.replace(/(if \(document.getElementById\('tab-momentum'\)\?\.classList.contains\('active'\)\) setTimeout\(renderMomentum, 80\);)/g,
    `$1\n      if (document.getElementById('tab-volatility-candles')?.classList.contains('active')) setTimeout(renderVolatilityCandles, 80);`);
  source = source.replace(/(if \(isActive\('tab-momentum'\)\) tab = 'momentum';)/g,
    `if (isActive('tab-volatility-candles')) tab = 'volatility-candles';\n            else $1`);
  source = source.replace(/(if \(tab === 'momentum' && typeof renderMomentum === 'function'\) renderMomentum\(\);)/g,
    `if (tab === 'volatility-candles') renderVolatilityCandles();\n            else $1`);
  return source;
}

for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
  for (const name of fs.readdirSync(path.join(root, dir.name))) {
    if (!/^korea_.*_map\.html$/.test(name)) continue;
    const file = path.join(root, dir.name, name);
    let source = fs.readFileSync(file, 'utf8');
    if (!source.includes('tab-btn-momentum')) continue;
    if (!source.includes('id="tab-btn-volatility-candles"')) {
      source = source.replace(/(<button id="tab-btn-momentum"[^>]*>[\s\S]*?<\/button>)/,
        `$1\n    <button id="tab-btn-volatility-candles" class="tab-btn" onclick="switchTab('volatility-candles',this)">🕯️ 변동성 캔들</button>`);
      source = source.replace(/(<div id="tab-momentum"[^>]*>)/,
        `<div id="tab-volatility-candles" class="tab-content"><section id="mm-volatility" aria-label="Volatility candles"></section></div>\n  $1`);
      source = source.replace(/(<script src="\.\.\/js\/map_momentum\.js[^"\n]*"><\/script>)/,
        `$1\n  <script src="../js/map_volatility_candles.js?v=0"></script>`);
    }
    fs.writeFileSync(file, patchRuntime(source));
  }
}
for (const rel of ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js']) {
  const file = path.join(root, rel);
  if (fs.existsSync(file)) fs.writeFileSync(file, patchRuntime(fs.readFileSync(file, 'utf8')));
}
const statePath = path.join(root, 'js/map_tab_state.js');
let state = fs.readFileSync(statePath, 'utf8');
if (!state.includes("'volatility-candles': 1")) {
  state = state.replace('momentum: 1,', "momentum: 1,\n    'volatility-candles': 1,");
  state = state.replace("momentum: 'tab-btn-momentum',", "momentum: 'tab-btn-momentum',\n      'volatility-candles': 'tab-btn-volatility-candles',");
  state = state.replace("var momentumEl = document.getElementById('tab-momentum');", "var candlesEl = document.getElementById('tab-volatility-candles');\n    if (candlesEl && candlesEl.classList.contains('active')) return 'volatility-candles';\n    var momentumEl = document.getElementById('tab-momentum');");
  fs.writeFileSync(statePath, state);
}
for (const name of ['sector_nav.js', 'global_bottom_nav.js', 'desktop_sidebar_nav.js']) {
  const file = path.join(root, 'js', name);
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(/heatmap\|momentum\|volatility\|/g, 'heatmap|momentum|volatility-candles|volatility|'));
}
console.log('Standalone volatility candles tab patched');
