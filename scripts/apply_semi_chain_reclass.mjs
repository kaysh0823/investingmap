/**
 * Persist semiconductor chain split: 장비 → 전공정 장비 / 후공정 장비,
 * plus confirmed non-equipment rehomes. Rebuild-safe via data/chain_overrides.json.
 */
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { escHtml, PRERENDER_START, PRERENDER_END } from '../lib/seo_prerender_lib.mjs';
import {
  ANGLE,
  CHIP_CHAINS,
  LEGEND_CHAINS,
  SEMI_BE_CHAINS as BE_CHAINS,
  SEMI_CHAIN_COLORS as CHAIN_COLORS,
  SEMI_FE_CHAINS as FE_CHAINS,
  toJsChainList,
} from '../lib/semi_chain_ui.mjs';

export {
  ANGLE,
  CHIP_CHAINS,
  LEGEND_CHAINS,
  toJsChainList,
} from '../lib/semi_chain_ui.mjs';
export {
  semiChainsAllSource,
  semiChainsNoAllSource,
} from '../lib/semi_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'semiconductor', 'korea_semiconductor_map.html');
const FIELD_OVERRIDES_PATH = join(ROOT, 'data', 'ticker_field_overrides.json');

/**
 * 재분류 과정에서 벨류체인과 어긋난 semType/products를 바로잡을 종목.
 * 실제 문구는 data/ticker_field_overrides.json 한 곳에서만 관리한다.
 */
const METADATA_FIX_TICKERS = [
  '101490', '213420', '348210', '122640', '160980', '101160', '425040', '079370', '053610',
  '356860', '086390', '254490', '031980', '089890', '061970',
];

const EXPECTED_COUNTS = {
  '전공정 장비': 16,
  '후공정 장비': 10,
  소재: 22,
  '부품/기판': 11,
  '패키징/테스트': 13,
  팹리스: 8,
  디자인하우스: 2,
  파운드리: 1,
  '반도체 유통': 1,
};

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
    if (META_FIELDS.some((f) => !fix[f])) {
      throw new Error(`ticker_field_overrides.json: ${ticker} missing semType/products fields`);
    }
    out[ticker] = fix;
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
    /const chains = \[(?:'IDM'|'팹리스')[, ][^\]]+\];/,
    `const chains = ${toJs(LEGEND_CHAINS)};`,
  );
  out = out.replace(
    /\{ (?:IDM: \d+, )?(?:팹리스: \d+, )?(?:'디자인하우스': \d+, )?파운드리: \d+, 소재: \d+, '전공정 장비': \d+, '후공정 장비': \d+, '부품\/기판': \d+, '패키징\/테스트': \d+, '반도체 유통': \d+ \}/g,
    ANGLE,
  );

  const labelKo =
    '{ 전공정: \'전공정 (설계·제조·소재·장비)\', 후공정: \'후공정 (부품·기판·패키징·테스트)\', 팹리스: \'팹리스 (설계)\', 디자인하우스: \'디자인하우스\', 파운드리: \'파운드리 (위탁제조)\', 소재: \'소재·공정부품\', \'전공정 장비\': \'전공정 장비\', \'후공정 장비\': \'후공정 장비\', \'부품/기판\': \'부품·기판\', \'패키징/테스트\': \'패키징·테스트\', \'반도체 유통\': \'반도체 유통\' }';
  const filterKo =
    '{ 전공정: \'전공정\', 후공정: \'후공정\', 팹리스: \'팹리스\', 디자인하우스: \'디자인하우스\', 파운드리: \'파운드리\', 소재: \'소재\', \'전공정 장비\': \'전공정 장비\', \'후공정 장비\': \'후공정 장비\', \'부품/기판\': \'부품·기판\', \'패키징/테스트\': \'패키징·테스트\', \'반도체 유통\': \'유통\' }';
  const labelEn =
    '{ 전공정: \'Front-end (design, fab, materials, equipment)\', 후공정: \'Back-end (components, substrate, packaging, test)\', 팹리스: \'Fabless (Design)\', 디자인하우스: \'Design house\', 파운드리: \'Foundry\', 소재: \'Materials & Parts\', \'전공정 장비\': \'Front-end equipment\', \'후공정 장비\': \'Back-end equipment\', \'부품/기판\': \'Components/Substrate\', \'패키징/테스트\': \'Packaging & Test\', \'반도체 유통\': \'Semiconductor distribution\' }';
  const filterEn =
    '{ 전공정: \'Front-end\', 후공정: \'Back-end\', 팹리스: \'Fabless\', 디자인하우스: \'Design house\', 파운드리: \'Foundry\', 소재: \'Materials\', \'전공정 장비\': \'FE equipment\', \'후공정 장비\': \'BE equipment\', \'부품/기판\': \'Components/Sub\', \'패키징/테스트\': \'Packaging/Test\', \'반도체 유통\': \'Distribution\' }';

  // T.ko / T.en 순서로 각각 한 번씩만 교체한다. 사전은 한 줄짜리 리터럴이므로
  // 줄·중괄호를 넘지 않는 패턴을 써야 재실행 시 다음 블록을 삼키지 않는다.
  out = replaceDicts(out, 'chainLabel', [labelKo, labelEn]);
  out = replaceDicts(out, 'chainFilter', [filterKo, filterEn]);
  out = out.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=7"');
  out = out.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=13"');
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

/** SEO 프리렌더 표(정적 tbody)의 벨류체인·반도체유형·주요제품 셀을 종목별로 갱신한다. */
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

function assertCounts(counts) {
  const diffs = [];
  for (const chain of new Set([...Object.keys(EXPECTED_COUNTS), ...Object.keys(counts)])) {
    const got = counts[chain] || 0;
    const want = EXPECTED_COUNTS[chain] || 0;
    if (got !== want) diffs.push(`${chain}: expected ${want}, got ${got}`);
  }
  if (diffs.length) throw new Error(`chain counts mismatch — ${diffs.join('; ')}`);
}

function main() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  const companies = extractCompaniesFromHtml(html);
  const metaFixes = loadMetaFixes();
  const counts = {};
  for (const c of companies) {
    const next = chainOverride('semi', c.ticker);
    if (next) c.chain = next;
    const meta = metaFixes[pad(c.ticker)];
    if (meta) Object.assign(c, meta);
    counts[c.chain] = (counts[c.chain] || 0) + 1;
  }
  const stale = companies.filter((c) => c.chain === '장비' || c.chain === '후공정' || c.chain === 'IDM');
  if (stale.length) {
    throw new Error(`stale chains remain: ${stale.map((c) => c.ticker + ':' + c.chain).join(', ')}`);
  }
  assertCounts(counts);

  html = patchKoreanCompaniesHtml(html, companies);
  html = patchUi(html);
  const prerender = patchPrerenderRows(html, companies);
  fs.writeFileSync(HTML_PATH, prerender.html, 'utf8');
  console.log('OK apply_semi_chain_reclass', companies.length, counts);
  console.log(`prerender rows patched: ${prerender.patched}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
