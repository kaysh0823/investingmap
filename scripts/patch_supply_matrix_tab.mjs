import fs from 'node:fs';
import path from 'node:path';
import { assetVersion, projectRoot } from './asset_versions.mjs';

const root = projectRoot();
const onMomentumActive = "if (document.getElementById('tab-momentum')?.classList.contains('active')) renderMomentum();";
const renderFunction = `    function renderSupplyMatrix() {
      if (!window.InvestingMapSupplyMatrix) return;
      InvestingMapSupplyMatrix.render({
        container: document.getElementById('supply-matrix-root'),
        companies: koreanCompanies,
        lang: lang,
        onSelect: function (company) {
          if (!window.InvestingMapCandleModal) return;
          InvestingMapCandleModal.open({
            ticker: company.ticker,
            name: (lang === 'en' && company.nameEn) || company.name || company.nameKo || company.ticker
          });
        }
      });
    }`;

function patchRuntime(source, nl, file) {
  if (source.includes('function renderSupplyMatrix()')) return source;
  const switched = "if (tab === 'momentum') setTimeout(renderMomentum, 40);";
  if (!source.includes(switched) || !source.includes(onMomentumActive) || !source.includes('if (momentumBtn)')) {
    throw new Error(`Missing momentum runtime in ${file}`);
  }
  return source
    .replace(/    function renderMomentum\(\) \{/, renderFunction.replaceAll('\n', nl) + nl + nl + '$&')
    .replace(/^(\s*if \(momentumBtn\)[^\r\n]+)$/m, "$1" + nl +
      "      document.getElementById('tab-btn-supply-matrix').textContent = lang === 'en' ? '📊 Supply matrix' : '📊 수급 매트릭스';")
    .replaceAll(onMomentumActive, onMomentumActive + " if (document.getElementById('tab-supply-matrix')?.classList.contains('active')) renderSupplyMatrix();")
    .replace(switched, switched + nl + "      if (tab === 'supply-matrix') setTimeout(renderSupplyMatrix, 40);")
    .replace('          onQuotesReady: function () {', '          onQuotesReady: function () {' + nl +
      "            if (document.getElementById('tab-supply-matrix')?.classList.contains('active')) renderSupplyMatrix();");
}

function patchFile(file, markup = false) {
  const before = fs.readFileSync(file, 'utf8');
  const nl = before.includes('\r\n') ? '\r\n' : '\n';
  let source = before;
  if (markup && !source.includes('id="tab-btn-momentum"')) return;
  if (markup && !source.includes('id="tab-btn-supply-matrix"')) {
    const button = '    <button id="tab-btn-supply-matrix" class="tab-btn" onclick="switchTab(\'supply-matrix\',this)">📊 수급 매트릭스</button>';
    const panel = ['  <div id="tab-supply-matrix" class="tab-content">',
      '    <div id="supply-matrix-root" class="supply-wrap"></div>',
      '  </div>', ''].join(nl);
    source = source
      .replace(/<script src="\.\.\/js\/map_momentum\.js[^"]*"><\/script>/, '$&' + nl +
        '  <link rel="stylesheet" href="../js/map_supply_matrix.css?v=0">' + nl +
        '  <script src="../js/map_supply_matrix.js?v=0"></script>')
      .replace(/<button id="tab-btn-momentum"[^\r\n]*<\/button>/, '$&' + nl + button)
      .replace(/^(?=[ \t]*<div id="tab-momentum")/m, panel);
    if (!source.includes('id="supply-matrix-root"') || !source.includes('map_supply_matrix.js')) {
      throw new Error(`Missing momentum markup in ${file}`);
    }
  }
  if (source.includes('function renderMomentum()')) source = patchRuntime(source, nl, file);
  if (source !== before) fs.writeFileSync(file, source);
}

for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('.') || ['node_modules', 'dist'].includes(dir.name)) continue;
  const folder = path.join(root, dir.name);
  for (const file of fs.readdirSync(folder)) {
    if (/^korea_.*_map\.html$/.test(file)) patchFile(path.join(folder, file), true);
  }
}
for (const file of ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js']) {
  patchFile(path.join(root, file));
}

// Stamp changed shared dependencies without touching unrelated existing assets.
const dependencies = /((?:\.\.\/|\/)?js\/(map_supply_matrix\.(?:js|css)|map_tab_state\.js|desktop_sidebar_nav\.js|global_bottom_nav\.js|sector_nav\.js))\?v=[\w.-]+/g;
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.name.startsWith('.') || ['node_modules', 'dist'].includes(entry.name)) continue;
  const entryPath = path.join(root, entry.name);
  const files = entry.isDirectory() ? fs.readdirSync(entryPath).map((name) => path.join(entryPath, name)) : [entryPath];
  for (const file of files.filter((name) => name.endsWith('.html'))) {
    const before = fs.readFileSync(file, 'utf8');
    const source = before.replace(dependencies, (_, assetPath, name) => `${assetPath}?v=${assetVersion('js/' + name)}`);
    if (source !== before) fs.writeFileSync(file, source);
  }
}
