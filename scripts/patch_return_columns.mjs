/**
 * Add return columns (day / 1M / 3M / 6M / 1Y) after current price in map tables.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
];

const TH_LAST = '<th id="th-last" onclick="sortTable(\'quoteLast\')">현재가</th>';
const TH_RET_BLOCK = `${TH_LAST}
              <th id="th-chg1d" class="ret-col" onclick="sortTable('chg1dPct')">1일</th>
              <th id="th-ret20d" class="ret-col" onclick="sortTable('ret20dPct')">20일</th>
              <th id="th-ret50d" class="ret-col" onclick="sortTable('ret50dPct')">50일</th>
              <th id="th-ret120d" class="ret-col" onclick="sortTable('ret120dPct')">120일</th>
              <th id="th-ret250d" class="ret-col" onclick="sortTable('ret250dPct')">250일</th>`;

const ROW_LAST_CELL = '<td class="quote-cell">${qr.last}</td>';
const ROW_RET_CELLS = `<td class="quote-cell">\${qr.last}</td>
      <td class="quote-cell ret-cell">\${qr.chg1d || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret20d || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret50d || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret120d || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret250d || '—'}</td>`;

const BIO_ROW_LAST = "'<td class=\"quote-cell\">' + qr.last + '</td>' +";
const BIO_ROW_RET_BLOCK = "'<td class=\"quote-cell\">' + qr.last + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.chg1d || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret20d || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret50d || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret120d || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret250d || '\\u2014') + '</td>' +";

const KEYMAP_OLD = 'const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, rs: 6, mcapWon: 7, per: 8, pbr: 9, market: 10, chain: 11 };';
const KEYMAP_NEW = "const keyMap = { name: 0, ticker: 1, quoteLast: 2, chg1dPct: 3, ret20dPct: 4, ret50dPct: 5, ret120dPct: 6, ret250dPct: 7, quoteHi52: 8, quoteLo52: 9, quotePosition: 10, rs: 11, mcapWon: 12, per: 13, pbr: 14, market: 15, chain: 16 };";

const SORT_NUM_OLD = "sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition' || sortKey === 'rs'";
const SORT_NUM_NEW = "sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'chg1dPct' || sortKey === 'ret20dPct' || sortKey === 'ret50dPct' || sortKey === 'ret120dPct' || sortKey === 'ret250dPct' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition' || sortKey === 'rs'";

const APPLY_TH_LAST = "var thLast = document.getElementById('th-last');";
const APPLY_TH_RET = `${APPLY_TH_LAST}
      var thChg1d = document.getElementById('th-chg1d');
      var thRet20d = document.getElementById('th-ret20d');
      var thRet50d = document.getElementById('th-ret50d');
      var thRet120d = document.getElementById('th-ret120d');
      var thRet250d = document.getElementById('th-ret250d');`;

const APPLY_SET_LAST = 'if (thLast) thLast.textContent = t.thLast;';
const APPLY_SET_RET = `${APPLY_SET_LAST}
      if (thChg1d) thChg1d.textContent = t.thChg1d || (lang === 'en' ? '1D' : '1일');
      if (thRet20d) thRet20d.textContent = t.thRet20d || (lang === 'en' ? '20D' : '20일');
      if (thRet50d) thRet50d.textContent = t.thRet50d || (lang === 'en' ? '50D' : '50일');
      if (thRet120d) thRet120d.textContent = t.thRet120d || (lang === 'en' ? '120D' : '120일');
      if (thRet250d) thRet250d.textContent = t.thRet250d || (lang === 'en' ? '250D' : '250일');`;

const RET_CSS = `
    .ret-col { font-size: 11px; white-space: nowrap; }
    .ret-cell { font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

function patchTranslations(html) {
  let h = html;
  if (!h.includes('thChg1d')) {
    h = h.replace(
      /thLast:\s*'현재가',/g,
      "thLast: '현재가', thChg1d: '1일', thRet20d: '20일', thRet50d: '50일', thRet120d: '120일', thRet250d: '250일',",
    );
    h = h.replace(
      /"thLast":\s*"현재가",/g,
      '"thLast": "현재가",\n        "thChg1d": "1일",\n        "thRet20d": "20일",\n        "thRet50d": "50일",\n        "thRet120d": "120일",\n        "thRet250d": "250일",',
    );
    h = h.replace(
      /thLast:\s*'Last',/g,
      "thLast: 'Last', thChg1d: '1D', thRet20d: '20D', thRet50d: '50D', thRet120d: '120D', thRet250d: '250D',",
    );
    h = h.replace(
      /"thLast":\s*"Last",/g,
      '"thLast": "Last",\n        "thChg1d": "Day",\n        "thRet20d": "1M",\n        "thRet50d": "3M",\n        "thRet120d": "6M",\n        "thRet250d": "1Y",',
    );
  }
  return h;
}

function patchFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return;
  }
  let html = fs.readFileSync(fp, 'utf8');
  if (html.includes('id="th-chg1d"')) {
    console.log('already patched', rel);
    return;
  }

  if (html.includes(TH_LAST) && !html.includes('id="th-chg1d"')) {
    html = html.replace(TH_LAST, TH_RET_BLOCK);
  }

  if (html.includes(ROW_LAST_CELL) && !html.includes('qr.chg1d')) {
    html = html.replace(ROW_LAST_CELL, ROW_RET_CELLS);
  }
  if (html.includes(BIO_ROW_LAST) && !html.includes('qr.chg1d')) {
    html = html.replace(BIO_ROW_LAST, BIO_ROW_RET_BLOCK);
  }

  html = html.split(KEYMAP_OLD).join(KEYMAP_NEW);
  html = html.split(SORT_NUM_OLD).join(SORT_NUM_NEW);
  html = patchTranslations(html);

  if (html.includes(APPLY_TH_LAST) && !html.includes("getElementById('th-chg1d')")) {
    html = html.replace(APPLY_TH_LAST, APPLY_TH_RET);
    html = html.replace(APPLY_SET_LAST, APPLY_SET_RET);
  }

  if (!html.includes('.ret-col') && html.includes('</style>')) {
    html = html.replace(/\n  <\/style>\n/, `${RET_CSS}\n  </style>\n`);
  }

  fs.writeFileSync(fp, html, 'utf8');
  console.log('patched', rel);
}

for (const rel of TARGETS) patchFile(rel);
