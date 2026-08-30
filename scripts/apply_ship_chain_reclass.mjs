/**
 * Persists the approved ship chain split across company data, UI and SEO rows.
 * The ticker decisions live in data/chain_overrides.json.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { assertChainInvariants, logChainCounts } from '../lib/chain_reclass_invariants.mjs';
import { escHtml, PRERENDER_START, PRERENDER_END } from '../lib/seo_prerender_lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'ship', 'korea_ship_map.html');

const CHAINS = ['종합조선', '엔진', '의장/배관', '선체·보냉·구조재', '서비스·해양플랜트', '해운물류'];
const RETIRED_CHAINS = ['조선기자재', '기타 기자재', '해양플랜트', '방산해양', '철강소재'];
const CHAIN_COLORS = {
  종합조선: '#4FC3F7',
  엔진: '#66BB6A',
  '의장/배관': '#26C6DA',
  '선체·보냉·구조재': '#FFCA28',
  '서비스·해양플랜트': '#FFA726',
  해운물류: '#EF5350',
};
const ANGLE = "{ '종합조선': 0, '엔진': 60, '의장/배관': 120, '선체·보냉·구조재': 180, '서비스·해양플랜트': 240, '해운물류': 300 }";

const LABEL_KO = {
  종합조선: '종합 조선',
  엔진: '선박 엔진·추진',
  '의장/배관': '의장·배관·피팅',
  '선체·보냉·구조재': '선체·보냉·구조재',
  '서비스·해양플랜트': '서비스·개조·해양플랜트',
  해운물류: '해운물류',
};
const FILTER_KO = {
  종합조선: '조선사',
  엔진: '엔진',
  '의장/배관': '의장·배관',
  '선체·보냉·구조재': '선체·보냉·구조재',
  '서비스·해양플랜트': '서비스·해양',
  해운물류: '해운',
};
const LABEL_EN = {
  종합조선: 'Integrated shipbuilding',
  엔진: 'Marine engines & propulsion',
  '의장/배관': 'Outfitting, piping & fittings',
  '선체·보냉·구조재': 'Hull, insulation & structural materials',
  '서비스·해양플랜트': 'Services, retrofit & offshore plant',
  해운물류: 'Shipping & logistics',
};
const FILTER_EN = {
  종합조선: 'Shipyards',
  엔진: 'Engines',
  '의장/배관': 'Outfitting',
  '선체·보냉·구조재': 'Hull & materials',
  '서비스·해양플랜트': 'Services & offshore',
  해운물류: 'Shipping',
};

function toJs(arr) {
  return `[${arr.map((c) => `'${c}'`).join(', ')}]`;
}

function jsonDict(field, value) {
  const body = JSON.stringify(value, null, 4).replace(/\n/g, '\n        ');
  return `"${field}": ${body}`;
}

function replaceJsonDicts(html, field, values) {
  const re = new RegExp(`"${field}": \\{[\\s\\S]*?\\n        \\}`, 'g');
  const found = html.match(re) || [];
  if (found.length !== values.length) {
    throw new Error(`${field}: expected ${values.length} dictionaries, found ${found.length}`);
  }
  let seen = 0;
  return html.replace(re, () => jsonDict(field, values[seen++]));
}

function patchUi(html) {
  let out = html.replace(
    /const CHAIN_COLORS = \{[^}]+\};/,
    `const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};`,
  );
  out = out.replace(/const chains = \['all'[, ][^\]]+\];/, `const chains = ${toJs(['all', ...CHAINS])};`);
  out = out.replace(/const chains = \[(?!'all')[^\]]+\];/, `const chains = ${toJs(CHAINS)};`);
  out = out.replace(
    /\{ '?(?:종합조선)'?: \d+,[^}]+ \}/g,
    ANGLE,
  );
  out = replaceJsonDicts(out, 'chainLabel', [LABEL_KO, LABEL_EN]);
  out = replaceJsonDicts(out, 'chainFilter', [FILTER_KO, FILTER_EN]);
  return out;
}

function patchPrerenderRows(html, companies) {
  const i0 = html.indexOf(PRERENDER_START);
  const i1 = html.indexOf(PRERENDER_END);
  if (i0 < 0 || i1 < 0) return html;
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));
  const block = html.slice(i0, i1).replace(
    /<tr data-ticker="(\d{6})">[\s\S]*?<\/tr>/g,
    (row, ticker) => {
      const c = byTicker.get(ticker);
      return c
        ? row.replace(
            /<td><span class="chain-tag">[^<]*<\/span><\/td>/,
            `<td><span class="chain-tag">${escHtml(c.chain)}</span></td>`,
          )
        : row;
    },
  );
  return html.slice(0, i0) + block + html.slice(i1);
}

let html = fs.readFileSync(HTML_PATH, 'utf8');
const companies = extractCompaniesFromHtml(html);
for (const c of companies) {
  const next = chainOverride('ship', c.ticker);
  if (next) c.chain = next;
}
const stale = companies.filter((c) => RETIRED_CHAINS.includes(c.chain));
if (stale.length) throw new Error(`retired ship chains remain: ${stale.map((c) => c.ticker).join(', ')}`);
const counts = assertChainInvariants('ship', companies);
html = patchKoreanCompaniesHtml(html, companies);
html = patchUi(html);
html = patchPrerenderRows(html, companies);
fs.writeFileSync(HTML_PATH, html, 'utf8');
console.log('OK apply_ship_chain_reclass', companies.length, counts, `(${logChainCounts('ship', counts)})`);
