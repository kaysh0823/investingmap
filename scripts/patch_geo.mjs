/**
 * Inject GEO: Organization JSON-LD, enhanced WebPage schema, extractable summaries, trust footer.
 * Safe to re-run (skips blocks marked investingmap-geo).
 */
import fs from 'fs';
import path from 'path';
import {
  geo,
  BASE,
  root,
  organizationLd,
  ldScript,
  webPageLd,
  TRUST_FOOTER_MARKER,
  trustFooterHtml,
  TRUST_FOOTER_CSS,
} from './geo_lib.mjs';

const MARKER = 'investingmap-geo';
const MAP_FILES = [
  { file: 'semiconductor/korea_semiconductor_map.html', key: 'semiconductor' },
  { file: 'bio/korea_bio_map.html', key: 'bio' },
  { file: 'ship/korea_ship_map.html', key: 'ship' },
  { file: 'defense/korea_defense_map.html', key: 'defense' },
  { file: 'robot/korea_robot_map.html', key: 'robot' },
  { file: 'auto/korea_auto_map.html', key: 'auto' },
  { file: 'medtech/korea_medtech_map.html', key: 'medtech' },
  { file: 'finance/korea_finance_map.html', key: 'finance' },
  { file: 'construction/korea_construction_map.html', key: 'construction' },
  { file: 'battery/korea_battery_map.html', key: 'battery' },
  { file: 'renewable/korea_renewable_map.html', key: 'renewable' },
  { file: 'nuclear/korea_nuclear_map.html', key: 'nuclear' },
  { file: 'powergrid/korea_powergrid_map.html', key: 'powergrid' },
  { file: 'kconsume/korea_kconsume_map.html', key: 'kconsume' },
  { file: 'kcontent/korea_kcontent_map.html', key: 'kcontent' },
];

function geoSummaryBlock(key) {
  const p = geo.pages[key];
  return `  <!-- ${MARKER}-summary -->
  <section class="geo-summary" id="geo-summary" aria-label="Page summary">
    <p lang="ko" id="geo-summary-ko">${p.summary.ko}</p>
    <p lang="en" id="geo-summary-en">${p.summary.en}</p>
  </section>`;
}

const GEO_SUMMARY_CSS = `
    .geo-summary {
      max-width: 960px;
      margin: 0 auto;
      padding: 8px 28px 14px;
      font-size: 13px;
      line-height: 1.55;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border)
    }

    .geo-summary p {
      margin: 0
    }

    .geo-summary p[hidden] {
      display: none
    }
`;

function patchApplyLangHook(html) {
  if (html.includes('InvestingMapGeoFooter.apply(lang)')) return html;
  const hook = 'if (window.InvestingMapGeoFooter) InvestingMapGeoFooter.apply(lang);';
  if (html.includes('InvestingMapSeo.sync')) {
    html = html.replace(
      /(if \(window\.InvestingMapSeo\) InvestingMapSeo\.sync\([^)]*\);)/,
      `$1\n      ${hook}`
    );
  } else if (html.includes('function applyLang()')) {
    html = html.replace(
      /(\s+)(syncThemeToggle\(\);|syncTheme\(\);)\s*\n\s+\}/,
      `$1$2\n$1${hook}\n    }`
    );
  }
  return html;
}

function removeGeoSummary(html) {
  return html.replace(/\s*<!-- investingmap-geo-summary -->[\s\S]*?<\/section>\n?/g, '\n');
}

function patchMapPage(rel, key) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  const page = geo.pages[key];
  const url = `${BASE}${page.path}`;

  if (!html.includes(`${MARKER}-org`)) {
    const orgBlock = `  <!-- ${MARKER}-org -->\n${ldScript(organizationLd())}\n`;
    html = html.replace(/(<script src="\.\.\/js\/seo\.js"><\/script>)/, `$1\n${orgBlock}`);
  }

  if (!html.includes(`${MARKER}-webpage`)) {
    const wp = webPageLd({
      name: page.title.ko,
      description: page.summary.ko,
      url,
      dateModified: geo.dates.dataAsOf,
    });
    const wpBlock = `  <!-- ${MARKER}-webpage -->\n${ldScript(wp)}\n`;
    html = html.replace(
      /(<!-- investingmap-geo-org -->[\s\S]*?<\/script>\n|<!-- investingmap-seo -->[\s\S]*?<script src="\.\.\/js\/seo\.js"><\/script>\n)/,
      (m) => m + wpBlock
    );
  }

  html = removeGeoSummary(html);

  if (!html.includes(TRUST_FOOTER_CSS.trim().slice(0, 20))) {
    html = html.replace(/(\s*<\/style>)/, `${TRUST_FOOTER_CSS}$1`);
  }

  if (!html.includes(TRUST_FOOTER_MARKER)) {
    html = html.replace(
      /<\/body>/,
      `${trustFooterHtml(1)}\n  <script src="../js/geo_footer.js"></script>\n</body>`
    );
  } else if (!html.includes('geo_footer.js')) {
    html = html.replace(/<\/body>/, `  <script src="../js/geo_footer.js"></script>\n</body>`);
  }

  html = patchApplyLangHook(html);

  fs.writeFileSync(abs, html, 'utf8');
  console.log('geo patched:', rel);
}

function patchIndex() {
  const abs = path.join(root, 'index.html');
  let html = fs.readFileSync(abs, 'utf8');

  if (!html.includes(`${MARKER}-org`)) {
    const orgBlock = `  <!-- ${MARKER}-org -->\n${ldScript(organizationLd())}\n`;
    html = html.replace(/(<script src="js\/seo\.js"><\/script>)/, `$1\n${orgBlock}`);
  }

  if (!html.includes(TRUST_FOOTER_CSS.trim().slice(0, 20))) {
    html = html.replace(/(\s*<\/style>)/, `${TRUST_FOOTER_CSS}$1`);
  }

  if (!html.includes(TRUST_FOOTER_MARKER)) {
    html = html.replace(
      /(<p class="hub-foot" id="hub-foot">[^<]*<\/p>\s*<\/main>)/,
      `$1\n${trustFooterHtml(0)}`
    );
    html = html.replace(/<\/body>/, `  <script src="js/geo_footer.js"></script>\n</body>`);
  }

  html = patchApplyLangHook(html);

  fs.writeFileSync(abs, html, 'utf8');
  console.log('geo patched: index.html');
}

for (const { file, key } of MAP_FILES) patchMapPage(file, key);
patchIndex();

const bioInlineFiles = ['bio/korea_bio_map.inline.js', 'bio/bio_inline_tail.js'];
for (const rel of bioInlineFiles) {
  const abs = path.join(root, rel);
  let js = fs.readFileSync(abs, 'utf8');
  if (!js.includes('InvestingMapGeoFooter.apply(lang)')) {
    js = js.replace(
      /if \(window\.InvestingMapSeo\) InvestingMapSeo\.sync\([^)]*\);/,
      (m) => m + '\n      if (window.InvestingMapGeoFooter) InvestingMapGeoFooter.apply(lang);'
    );
    fs.writeFileSync(abs, js, 'utf8');
    console.log('geo patched:', rel);
  }
}

console.log('OK patch_geo');
