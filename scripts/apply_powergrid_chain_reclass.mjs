/**
 * Persists the approved power-grid cable split across company data and UI.
 * Ticker decisions live in data/chain_overrides.json.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'powergrid', 'korea_powergrid_map.html');
const CHAINS = ['전력설비', '송배전', '전선·케이블', '발전설비'];
const EXPECTED_COUNTS = {
  전력설비: 3,
  송배전: 4,
  '전선·케이블': 4,
  발전설비: 3,
};
const RETIRED_CHAINS = ['송배전·케이블'];
const CHAIN_COLORS = {
  전력설비: '#42A5F5',
  송배전: '#8D6E63',
  '전선·케이블': '#FFCA28',
  발전설비: '#78909C',
};
const ANGLE = "{ '전력설비': 0, '송배전': 90, '전선·케이블': 180, '발전설비': 270 }";
const LABEL_KO = {
  전력설비: '전력설비·배전반',
  송배전: '송배전 장비·전력망',
  '전선·케이블': '전선·케이블',
  발전설비: '발전·에너지 설비',
};
const FILTER_KO = {
  전력설비: '전력설비',
  송배전: '송배전',
  '전선·케이블': '전선·케이블',
  발전설비: '발전설비',
};
const LABEL_EN = {
  전력설비: 'Switchgear & transformers',
  송배전: 'T&D equipment & grid services',
  '전선·케이블': 'Wire & cable',
  발전설비: 'Generation & energy equipment',
};
const FILTER_EN = {
  전력설비: 'Power equipment',
  송배전: 'T&D',
  '전선·케이블': 'Wire & cable',
  발전설비: 'Generation',
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
  let out = html
    .replace(/전력설비·송배전·발전설비/g, '전력설비·송배전·전선·케이블·발전설비')
    .replace(
    /const CHAIN_COLORS = \{[^}]+\};/,
    `const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};`,
    );
  out = out.replace(/const chains = \['all'[, ][^\]]+\];/, `const chains = ${toJs(['all', ...CHAINS])};`);
  out = out.replace(/const chains = \[(?!'all')[^\]]+\];/, `const chains = ${toJs(CHAINS)};`);
  out = out.replace(/\{ '전력설비': \d+,[^}]+ \}/g, ANGLE);
  out = replaceJsonDicts(out, 'chainLabel', [LABEL_KO, LABEL_EN]);
  out = replaceJsonDicts(out, 'chainFilter', [FILTER_KO, FILTER_EN]);
  return out;
}

function assertCounts(companies) {
  const counts = {};
  for (const c of companies) counts[c.chain] = (counts[c.chain] || 0) + 1;
  const diffs = [];
  for (const chain of new Set([...Object.keys(EXPECTED_COUNTS), ...Object.keys(counts)])) {
    const got = counts[chain] || 0;
    const want = EXPECTED_COUNTS[chain] || 0;
    if (got !== want) diffs.push(`${chain}: expected ${want}, got ${got}`);
  }
  if (diffs.length) throw new Error(`powergrid chain counts mismatch — ${diffs.join('; ')}`);
  return counts;
}

let html = fs.readFileSync(HTML_PATH, 'utf8');
const companies = extractCompaniesFromHtml(html);
for (const c of companies) {
  const next = chainOverride('powergrid', c.ticker);
  if (next) c.chain = next;
}
const stale = companies.filter((c) => RETIRED_CHAINS.includes(c.chain));
if (stale.length) throw new Error(`retired powergrid chains remain: ${stale.map((c) => c.ticker).join(', ')}`);
const counts = assertCounts(companies);
html = patchKoreanCompaniesHtml(html, companies);
html = patchUi(html);
fs.writeFileSync(HTML_PATH, html, 'utf8');
console.log('OK apply_powergrid_chain_reclass', companies.length, counts);
