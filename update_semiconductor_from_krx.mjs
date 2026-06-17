/**
 * Merges latest KRX CSVs in data/: data_4937_* / data_4848_* (???????????), data_5016_* (PER??PBR),
 * optional data_3557_* (????? ??????). Patches semiconductor map, hub index as-of, bio translations + HTML span.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './lib/krx_per_pbr.mjs';
import {
  loadMergedKrxMap,
  loadListedEnglish3557Map,
  mergeListedEnglishIntoCompanies,
  maxQuantCsvDateYmd,
  formatDataAsofLabels,
  resolveLatestCsv,
} from './lib/krx_data_sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fmtMcap(won) {
  if (won == null || won === 0) return '\u2014';
  if (won >= 1e12) {
    const t = won / 1e12;
    const s = t >= 10 ? t.toFixed(0) : t.toFixed(1).replace(/\.0$/, '');
    return '\uC57D ' + s + '\uC870\uC6D0';
  }
  if (won >= 1e8) return '\uC57D ' + (won / 1e8).toFixed(0) + '\uC5B5\uC6D0';
  return '\uC57D ' + won.toLocaleString('ko-KR') + '\uC6D0';
}

function mcapTier(won) {
  if (!won) return 1;
  if (won >= 15e12) return 3;
  if (won >= 1e12) return 2;
  return 1;
}

function extractArraySource(html, startNeedle, endNeedle) {
  const i0 = html.indexOf(startNeedle);
  if (i0 < 0) throw new Error('start not found: ' + startNeedle);
  const i1 = html.indexOf(endNeedle, i0 + startNeedle.length);
  if (i1 < 0) throw new Error('end not found: ' + endNeedle);
  return html.slice(i0 + startNeedle.length, i1).trim();
}

function fmtJsNum(n) {
  return n == null || !Number.isFinite(n) ? 'null' : n;
}

function formatCompany(c) {
  const lines = [];
  lines.push(`      {`);
  lines.push(
    `        id: '${c.id}', name: '${esc(c.name)}', nameEn: '${esc(c.nameEn)}', ticker: '${c.ticker}', market: '${c.market}', chain: '${esc(c.chain)}',`,
  );
  lines.push(
    `        semType: '${esc(c.semType)}', semTypeEn: '${esc(c.semTypeEn)}',`,
  );
  lines.push(
    `        products: '${esc(c.products)}', productsEn: '${esc(c.productsEn)}',`,
  );
  lines.push(
    `        revenue: '${esc(c.revenue)}', mcapWon: ${c.mcapWon}, per: ${fmtJsNum(c.per)}, pbr: ${fmtJsNum(c.pbr)}, revTier: ${c.revTier}, partners: [${c.partners.map((p) => `'${p}'`).join(', ')}]`,
  );
  lines.push(`      }`);
  return lines.join('\n');
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function applyKrx(companies, krx, perPbr, meta3557) {
  let kospi = 0;
  let kosdaq = 0;
  const missing = [];
  for (const c of companies) {
    const row = krx.get(c.ticker);
    if (!row) {
      missing.push(c.ticker);
      c.mcapWon = c.mcapWon || 0;
      if (c.market === 'KOSPI') kospi++;
      else if (c.market === 'KOSDAQ') kosdaq++;
      continue;
    }
    c.market = row.market;
    c.mcapWon = row.mcap;
    c.revenue = fmtMcap(row.mcap);
    c.revTier = mcapTier(row.mcap);
    if (row.market === 'KOSPI') kospi++;
    else if (row.market === 'KOSDAQ') kosdaq++;
  }
  mergePerPbrIntoCompanies(companies, perPbr);
  mergeListedEnglishIntoCompanies(companies, meta3557);
  return { kospi, kosdaq, missing };
}

function serializeCompanies(companies) {
  return (
    '[\n' +
    companies.map((c, idx) => formatCompany(c) + (idx < companies.length - 1 ? ',\n\n' : '\n')).join('') +
    '\n    ]'
  );
}

function patchDataAsofSemiconductor(html, labels) {
  if (!labels || !labels.ko) return html;
  html = html.replace(
    /<span class="data-asof" id="data-asof">[^<]*<\/span>/,
    `<span class="data-asof" id="data-asof">${labels.ko}</span>`,
  );
  html = html.replace(/dataAsof:\s*'\uC5C5\uB370\uC774\uD2B8 \uAE30\uC900\uC77C:[^']*'/, `dataAsof: '${esc(labels.ko)}'`);
  html = html.replace(/dataAsof:\s*'Data as of:[^']*'/, `dataAsof: '${esc(labels.en)}'`);
  return html;
}

function patchDataAsofHub(html, labels) {
  if (!labels || !labels.ko) return html;
  html = html.replace(
    /<span class="data-asof" id="data-asof">[^<]*<\/span>/,
    `<span class="data-asof" id="data-asof">${labels.en}</span>`,
  );
  html = html.replace(/updateAsOf:\s*'\uC5C5\uB370\uC774\uD2B8 \uAE30\uC900\uC77C:[^']*'/, `updateAsOf: '${esc(labels.ko)}'`);
  html = html.replace(/updateAsOf:\s*'Data as of:[^']*'/, `updateAsOf: '${esc(labels.en)}'`);
  return html;
}

function patchDataAsofBioHtml(html, labels) {
  if (!labels || !labels.ko) return html;
  html = html.replace(
    /<span class="data-asof" id="data-asof">[^<]*<\/span>/,
    `<span class="data-asof" id="data-asof">${labels.ko}</span>`,
  );
  return html;
}

const dataDir = join(__dirname, 'data');
console.log('data_4937:', resolveLatestCsv(dataDir, 'data_4937_'));
console.log('data_4848:', resolveLatestCsv(dataDir, 'data_4848_'));

const krx = loadMergedKrxMap(dataDir);
const perPbr = loadPerPbrMap(dataDir);
const meta3557 = loadListedEnglish3557Map(dataDir);
const ymdMax = maxQuantCsvDateYmd(dataDir);
const labels = formatDataAsofLabels(ymdMax);

const semiPath = join(__dirname, 'semiconductor', 'korea_semiconductor_map.html');
let htmlSemi = fs.readFileSync(semiPath, 'utf8');
const inner0 = extractArraySource(htmlSemi, 'const koreanCompanies = ', '\n    const globalCompanies');
const companies0 = Function('"use strict"; return ' + inner0)();
const { kospi, kosdaq, missing } = applyKrx(companies0, krx, perPbr, meta3557);
const n = companies0.length;

let html = fs.readFileSync(semiPath, 'utf8');
const newBlock = 'const koreanCompanies = ' + serializeCompanies(companies0) + ';\n\n    ';
html = html.replace(
  /const koreanCompanies = \[[\s\S]*?\n    \];\n\n    const globalCompanies/,
  newBlock + 'const globalCompanies',
);
html = html.replace(/badgeTotal: '\uCD1D <span>\d+<\/span>\uAC1C \uC0C1\uC7A5\uAE30\uC5C5'/, `badgeTotal: '\uCD1D <span>${n}</span>\uAC1C \uC0C1\uC7A5\uAE30\uC5C5'`);
html = html.replace(
  /badgeMarket: 'KOSPI <span>\d+<\/span>\uC0AC \u00B7 KOSDAQ <span>\d+<\/span>\uC0AC'/,
  `badgeMarket: 'KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC'`,
);
html = html.replace(
  /<div class="badge" id="badge-total">\uCD1D <span>\d+<\/span>\uAC1C \uC0C1\uC7A5\uAE30\uC5C5<\/div>/,
  `<div class="badge" id="badge-total">\uCD1D <span>${n}</span>\uAC1C \uC0C1\uC7A5\uAE30\uC5C5</div>`,
);
html = html.replace(
  /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>\uC0AC \u00B7 KOSDAQ <span>\d+<\/span>\uC0AC<\/div>/,
  `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC</div>`,
);
html = html.replace(
  /<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">\d+<\/span>\uAC1C<\/div>/,
  `<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">${n}</span>\uAC1C</div>`,
);
html = html.replace(
  /badgeTotal: '<span>\d+<\/span> listed companies'/,
  `badgeTotal: '<span>${n}</span> listed companies'`,
);
html = html.replace(
  /badgeMarket: 'KOSPI <span>\d+<\/span> \u00B7 KOSDAQ <span>\d+<\/span>'/,
  `badgeMarket: 'KOSPI <span>${kospi}</span> \u00B7 KOSDAQ <span>${kosdaq}</span>'`,
);
html = patchDataAsofSemiconductor(html, labels);
fs.writeFileSync(semiPath, html, 'utf8');
console.log(semiPath, 'companies=', n, 'KOSPI', kospi, 'KOSDAQ', kosdaq, 'missing', missing);

const hubPath = join(__dirname, 'index.html');
let hubHtml = fs.readFileSync(hubPath, 'utf8');
hubHtml = patchDataAsofHub(hubHtml, labels);
fs.writeFileSync(hubPath, hubHtml, 'utf8');
console.log(hubPath, 'data-asof / updateAsOf');

const bioTrPath = join(__dirname, 'bio', 'bio_translations.json');
const bioTr = JSON.parse(fs.readFileSync(bioTrPath, 'utf8'));
bioTr.ko.dataAsof = labels.ko;
bioTr.en.dataAsof = labels.en;
fs.writeFileSync(bioTrPath, JSON.stringify(bioTr, null, 2) + '\n', 'utf8');
console.log(bioTrPath, 'dataAsof');

const bioHtmlPath = join(__dirname, 'bio', 'korea_bio_map.html');
let bioHtml = fs.readFileSync(bioHtmlPath, 'utf8');
bioHtml = patchDataAsofBioHtml(bioHtml, labels);
fs.writeFileSync(bioHtmlPath, bioHtml, 'utf8');
console.log(bioHtmlPath, 'span data-asof');

execSync('node bio/gen_korea_bio_inline.mjs', { cwd: __dirname, stdio: 'inherit' });
