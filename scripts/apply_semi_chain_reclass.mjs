/**
 * Persist semiconductor 13-group value-chain reclass.
 * Rebuild-safe via data/chain_overrides.json (sole assignment source).
 */
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { assertChainInvariants, logChainCounts } from '../lib/chain_reclass_invariants.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';
import { escHtml, PRERENDER_START, PRERENDER_END } from '../lib/seo_prerender_lib.mjs';
import {
  ANGLE,
  CHIP_CHAINS,
  LEGEND_CHAINS,
  SEMI_BE_CHAINS as BE_CHAINS,
  SEMI_CHAIN_COLORS as CHAIN_COLORS,
  SEMI_FE_CHAINS as FE_CHAINS,
  SEMI_LEGACY_CHAIN_ALIASES,
  toJsChainList,
} from '../lib/semi_chain_ui.mjs';

export {
  ANGLE,
  CHIP_CHAINS,
  LEGEND_CHAINS,
  toJsChainList,
  retargetSemiCloneAngles,
} from '../lib/semi_chain_ui.mjs';
export {
  semiChainsAllSource,
  semiChainsNoAllSource,
} from '../lib/semi_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'semiconductor', 'korea_semiconductor_map.html');
const FIELD_OVERRIDES_PATH = join(ROOT, 'data', 'ticker_field_overrides.json');

/**
 * 재분류 과정에서 밸류체인과 어긋난 semType/products를 바로잡을 종목.
 * 실제 문구는 data/ticker_field_overrides.json 한 곳에서만 관리한다.
 */
const METADATA_FIX_TICKERS = [
  '101490', '348210', '122640', '160980', '101160', '425040', '079370', '053610',
  '356860', '086390', '254490', '031980', '089890', '061970',
  '089970', '253590',
];

const META_FIELDS = ['semType', 'semTypeEn', 'products', 'productsEn'];

function pad(t) {
  return String(t || '').padStart(6, '0');
}

function loadMetaFixes() {
  const overrides = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  const out = {};
  for (const ticker of METADATA_FIX_TICKERS) {
    const src = { ...(overrides[ticker] || {}), ...(overrides[ticker]?.byIndustry?.semi || {}) };
    const fix = {};
    for (const f of META_FIELDS) if (src[f]) fix[f] = src[f];
    // Skip tickers no longer on the map / incomplete — do not hard-fail rebuild.
    if (META_FIELDS.some((f) => !fix[f])) continue;
    out[ticker] = fix;
  }
  return out;
}

function loadTagAppends() {
  const overrides = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  const out = {};
  for (const [ticker, row] of Object.entries(overrides)) {
    if (Array.isArray(row.tags) && row.tags.length) out[pad(ticker)] = row.tags;
  }
  return out;
}

const toJs = toJsChainList;

function patchUi(html) {
  let out = html.replace(
    /const CHAIN_COLORS = \{[^}]+\};/,
    `const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};`,
  );
  out = out.replace(
    /const BIGCHIP_CHAIN_ORDER = \[[^\]]+\];/,
    `const BIGCHIP_CHAIN_ORDER = ${JSON.stringify(LEGEND_CHAINS)};`,
  );
  out = out.replace(
    /const CURATED_CHAIN_ORDER = \[[^\]]+\];/,
    `const CURATED_CHAIN_ORDER = ${JSON.stringify(LEGEND_CHAINS)};`,
  );
  out = out.replace(
    /const FE_CHAINS = \[[^\]]+\];/,
    `const FE_CHAINS = ${JSON.stringify(FE_CHAINS)};`,
  );
  out = out.replace(
    /const BE_CHAINS = \[[^\]]+\];/,
    `const BE_CHAINS = ${JSON.stringify(BE_CHAINS)};`,
  );
  out = out.replace(
    /const chains = \['all'[, ][^\]]+\];/,
    `const chains = ${toJs(CHIP_CHAINS)};`,
  );
  out = out.replace(
    /const chains = \[(?:'IDM'|'팹리스'|'팹리스·IP')[, ][^\]]+\];/,
    `const chains = ${toJs(LEGEND_CHAINS)};`,
  );
  // Angle maps (hub + fallback + classic)
  out = out.replace(/const CURATED_HUB_ANGLE = \{[^}]+\};/, `const CURATED_HUB_ANGLE = ${ANGLE};`);
  out = out.replace(/const CURATED_FALLBACK_ANGLE = \{[^}]+\};/, `const CURATED_FALLBACK_ANGLE = ${ANGLE};`);
  out = out.replace(
    /\{ (?:IDM: \d+, )?(?:'팹리스·IP': \d+, |팹리스: \d+, )?(?:'디자인하우스': \d+, )?파운드리: \d+[^}]* \}/g,
    ANGLE,
  );

  const labelKo =
    "{ 전공정: '전공정 (설계·제조·소재·장비·인프라)', 후공정: '후공정 (패키징·검사·테스트·유통)', '팹리스·IP': '팹리스·IP', 디자인하우스: '디자인하우스', 파운드리: '파운드리 (위탁제조)', '전공정 장비': '전공정 장비', '패키징 장비': '패키징 장비', '검사·계측 장비': '검사·계측 장비', '공정 소재': '공정 소재', '공정 부품·유지관리': '공정 부품·유지관리', '기판·패키징 소재': '기판·패키징 소재', '테스트 부품·인터페이스': '테스트 부품·인터페이스', '패키징·테스트 서비스': '패키징·테스트 서비스', '팹 인프라·지원설비': '팹 인프라·지원설비', '반도체 유통': '반도체 유통' }";
  const filterKo =
    "{ 전공정: '전공정', 후공정: '후공정', '팹리스·IP': '팹리스·IP', 디자인하우스: '디자인하우스', 파운드리: '파운드리', '전공정 장비': '전공정 장비', '패키징 장비': '패키징 장비', '검사·계측 장비': '검사·계측', '공정 소재': '공정 소재', '공정 부품·유지관리': '공정 부품', '기판·패키징 소재': '기판·패키징 소재', '테스트 부품·인터페이스': '테스트 부품', '패키징·테스트 서비스': '패키징·테스트', '팹 인프라·지원설비': '팹 인프라', '반도체 유통': '유통' }";
  const labelEn =
    "{ 전공정: 'Front-end (design, fab, materials, equipment, infra)', 후공정: 'Back-end (packaging, inspection, test, distribution)', '팹리스·IP': 'Fabless & IP', 디자인하우스: 'Design house', 파운드리: 'Foundry', '전공정 장비': 'Front-end equipment', '패키징 장비': 'Packaging equipment', '검사·계측 장비': 'Inspection & metrology', '공정 소재': 'Process materials', '공정 부품·유지관리': 'Process parts & MRO', '기판·패키징 소재': 'Substrate & packaging materials', '테스트 부품·인터페이스': 'Test parts & interface', '패키징·테스트 서비스': 'Packaging & test services', '팹 인프라·지원설비': 'Fab infrastructure', '반도체 유통': 'Semiconductor distribution' }";
  const filterEn =
    "{ 전공정: 'Front-end', 후공정: 'Back-end', '팹리스·IP': 'Fabless & IP', 디자인하우스: 'Design house', 파운드리: 'Foundry', '전공정 장비': 'FE equipment', '패키징 장비': 'Packaging tools', '검사·계측 장비': 'Inspection', '공정 소재': 'Materials', '공정 부품·유지관리': 'Parts & MRO', '기판·패키징 소재': 'Substrate mats', '테스트 부품·인터페이스': 'Test parts', '패키징·테스트 서비스': 'OSAT', '팹 인프라·지원설비': 'Fab infra', '반도체 유통': 'Distribution' }";

  out = replaceDicts(out, 'chainLabel', [labelKo, labelEn]);
  out = replaceDicts(out, 'chainFilter', [filterKo, filterEn]);

  // Inject legacy ?chain= alias + URL init next to chainMatchesFilter
  if (!out.includes('SEMI_LEGACY_CHAIN_ALIASES')) {
    out = out.replace(
      /function chainMatchesFilter\(companyChain, filter\) \{/,
      `const SEMI_LEGACY_CHAIN_ALIASES = ${JSON.stringify(SEMI_LEGACY_CHAIN_ALIASES)};
    function normalizeChainFilter(filter) {
      if (!filter || filter === 'all') return filter;
      return SEMI_LEGACY_CHAIN_ALIASES[filter] || filter;
    }
    function chainMatchesFilter(companyChain, filter) {`,
    );
    out = out.replace(
      /if \(filter === 'all'\) return true;\s*if \(filter === '전공정'\) return FE_CHAINS\.includes\(companyChain\);\s*if \(filter === '후공정'\) return BE_CHAINS\.includes\(companyChain\);\s*return companyChain === filter;/,
      `filter = normalizeChainFilter(filter);
      if (filter === 'all') return true;
      if (filter === '전공정') return FE_CHAINS.includes(companyChain);
      if (filter === '후공정') return BE_CHAINS.includes(companyChain);
      return companyChain === filter;`,
    );
  }

  if (!out.includes('imInitSemiChainFromUrl')) {
    out = out.replace(
      /function setChainFilter\(chain, el\) \{/,
      `function imInitSemiChainFromUrl() {
      try {
        var q = new URLSearchParams(window.location.search).get('chain');
        if (!q) return;
        var mapped = normalizeChainFilter(decodeURIComponent(q));
        if (!mapped || mapped === 'all') return;
        selectedChains.clear();
        selectedChains.add(mapped);
      } catch (e) {}
    }
    function setChainFilter(chain, el) {`,
    );
    out = out.replace(
      /buildChainChips\(\);\s*buildMarketChips\(\);/,
      `imInitSemiChainFromUrl();
      buildChainChips();
      buildMarketChips();`,
    );
  }

  out = out.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=8"');
  out = out.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=17"');
  return out;
}

function replaceDicts(html, field, [koLiteral, enLiteral]) {
  const re = new RegExp(`${field}: \\{[^{}\\n]*\\}`, 'g');
  const found = html.match(re) || [];
  if (found.length !== 2) {
    throw new Error(`${field}: expected 2 dictionaries (ko, en), found ${found.length}`);
  }
  let seen = 0;
  return html.replace(re, () => `${field}: ${seen++ === 0 ? koLiteral : enLiteral}`);
}

function appendTags(products, tags) {
  let out = String(products || '');
  for (const tag of tags || []) {
    if (tag && !out.includes(tag)) out = out ? `${out} · ${tag}` : tag;
  }
  return out;
}

/** SEO 프리렌더 표(정적 tbody)의 밸류체인·반도체유형·주요제품 셀을 종목별로 갱신한다. */
function patchPrerenderRows(html, companies) {
  const i0 = html.indexOf(PRERENDER_START);
  const i1 = html.indexOf(PRERENDER_END);
  if (i0 < 0 || i1 < 0) return { html, patched: 0 };

  const byTicker = new Map(companies.map((c) => [pad(c.ticker), c]));
  let patched = 0;
  const block = html.slice(i0, i1).replace(
    /<tr data-ticker="(\d{6})">[\s\S]*?<\/tr>/g,
    (row, ticker) => {
      const c = byTicker.get(ticker);
      if (!c) return '';
      let next = row.replace(
        /<td><span class="chain-tag">[^<]*<\/span><\/td>/,
        `<td><span class="chain-tag">${escHtml(c.chain)}</span></td>`,
      );
      next = next.replace(
        /<td style="font-size:12px;color:var\(--text-muted\)">[^<]*<\/td>/,
        `<td style="font-size:12px;color:var(--text-muted)">${escHtml(c.semType)}</td>`,
      );
      next = next.replace(
        /<td class="products-cell">[^<]*<\/td>/,
        `<td class="products-cell">${escHtml(c.products)}</td>`,
      );
      if (next !== row) patched++;
      return next;
    },
  );
  return { html: html.slice(0, i0) + block + html.slice(i1), patched };
}

function main() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  // Drop tickers whose exclusive home is not semi (e.g. holdings move mid-pipeline).
  const dropped = companies.filter((c) => {
    const home = exclusiveSector(c.ticker);
    return home && home !== 'semi';
  });
  if (dropped.length) {
    companies = companies.filter((c) => !dropped.some((d) => d.ticker === c.ticker));
    console.log(
      'apply_semi_chain_reclass: dropped exclusive non-semi',
      dropped.map((c) => c.ticker).join(','),
    );
  }
  const metaFixes = loadMetaFixes();
  const tagAppends = loadTagAppends();
  for (const c of companies) {
    const next = chainOverride('semi', c.ticker);
    if (!next) throw new Error(`chain_overrides.json missing semi ticker ${c.ticker}`);
    c.chain = next;
    const meta = metaFixes[pad(c.ticker)];
    if (meta) Object.assign(c, meta);
    const tags = tagAppends[pad(c.ticker)];
    if (tags?.length) c.products = appendTags(c.products, tags);
  }
  const stale = companies.filter(
    (c) =>
      c.chain === '장비' ||
      c.chain === '후공정' ||
      c.chain === 'IDM' ||
      c.chain === '팹리스' ||
      c.chain === '소재' ||
      c.chain === '후공정 장비' ||
      c.chain === '부품/기판' ||
      c.chain === '패키징/테스트',
  );
  if (stale.length) {
    throw new Error(`stale chains remain: ${stale.map((c) => c.ticker + ':' + c.chain).join(', ')}`);
  }
  const counts = assertChainInvariants('semi', companies);

  html = patchKoreanCompaniesHtml(html, companies);
  html = patchUi(html);
  const prerender = patchPrerenderRows(html, companies);
  fs.writeFileSync(HTML_PATH, prerender.html, 'utf8');
  console.log('OK apply_semi_chain_reclass', companies.length, counts, `(${logChainCounts('semi', counts)})`);
  console.log(`prerender rows patched: ${prerender.patched}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
