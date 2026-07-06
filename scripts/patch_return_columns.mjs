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
              <th id="th-chg1d" class="ret-col" onclick="sortTable('chg1dPct')">전일대비</th>
              <th id="th-ret1m" class="ret-col" onclick="sortTable('ret1mPct')">1개월</th>
              <th id="th-ret3m" class="ret-col" onclick="sortTable('ret3mPct')">3개월</th>
              <th id="th-ret6m" class="ret-col" onclick="sortTable('ret6mPct')">6개월</th>
              <th id="th-ret1y" class="ret-col" onclick="sortTable('ret1yPct')">1년</th>`;

const ROW_LAST_CELL = '<td class="quote-cell">${qr.last}</td>';
const ROW_RET_CELLS = `<td class="quote-cell">\${qr.last}</td>
      <td class="quote-cell ret-cell">\${qr.chg1d || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret1m || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret3m || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret6m || '—'}</td>
      <td class="quote-cell ret-cell">\${qr.ret1y || '—'}</td>`;

const BIO_ROW_LAST = "'<td class=\"quote-cell\">' + qr.last + '</td>' +";
const BIO_ROW_RET_BLOCK = "'<td class=\"quote-cell\">' + qr.last + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.chg1d || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret1m || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret3m || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret6m || '\\u2014') + '</td>' +\n          '<td class=\"quote-cell ret-cell\">' + (qr.ret1y || '\\u2014') + '</td>' +";

const KEYMAP_OLD = 'const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, rs: 6, mcapWon: 7, per: 8, pbr: 9, market: 10, chain: 11 };';
const KEYMAP_NEW = "const keyMap = { name: 0, ticker: 1, quoteLast: 2, chg1dPct: 3, ret1mPct: 4, ret3mPct: 5, ret6mPct: 6, ret1yPct: 7, quoteHi52: 8, quoteLo52: 9, quotePosition: 10, rs: 11, mcapWon: 12, per: 13, pbr: 14, market: 15, chain: 16 };";

const SORT_NUM_OLD = "sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition' || sortKey === 'rs'";
const SORT_NUM_NEW = "sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'chg1dPct' || sortKey === 'ret1mPct' || sortKey === 'ret3mPct' || sortKey === 'ret6mPct' || sortKey === 'ret1yPct' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition' || sortKey === 'rs'";

const APPLY_TH_LAST = "var thLast = document.getElementById('th-last');";
const APPLY_TH_RET = `${APPLY_TH_LAST}
      var thChg1d = document.getElementById('th-chg1d');
      var thRet1m = document.getElementById('th-ret1m');
      var thRet3m = document.getElementById('th-ret3m');
      var thRet6m = document.getElementById('th-ret6m');
      var thRet1y = document.getElementById('th-ret1y');`;

const APPLY_SET_LAST = 'if (thLast) thLast.textContent = t.thLast;';
const APPLY_SET_RET = `${APPLY_SET_LAST}
      if (thChg1d) thChg1d.textContent = t.thChg1d || (lang === 'en' ? 'Day' : '전일대비');
      if (thRet1m) thRet1m.textContent = t.thRet1m || (lang === 'en' ? '1M' : '1개월');
      if (thRet3m) thRet3m.textContent = t.thRet3m || (lang === 'en' ? '3M' : '3개월');
      if (thRet6m) thRet6m.textContent = t.thRet6m || (lang === 'en' ? '6M' : '6개월');
      if (thRet1y) thRet1y.textContent = t.thRet1y || (lang === 'en' ? '1Y' : '1년');`;

const RET_CSS = `
    .ret-col { font-size: 11px; white-space: nowrap; }
    .ret-cell { font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

function patchTranslations(html) {
  let h = html;
  if (!h.includes('thChg1d')) {
    h = h.replace(
      /thLast:\s*'현재가',/g,
      "thLast: '현재가', thChg1d: '전일대비', thRet1m: '1개월', thRet3m: '3개월', thRet6m: '6개월', thRet1y: '1년',",
    );
    h = h.replace(
      /"thLast":\s*"현재가",/g,
      '"thLast": "현재가",\n        "thChg1d": "전일대비",\n        "thRet1m": "1개월",\n        "thRet3m": "3개월",\n        "thRet6m": "6개월",\n        "thRet1y": "1년",',
    );
    h = h.replace(
      /thLast:\s*'Last',/g,
      "thLast: 'Last', thChg1d: 'Day', thRet1m: '1M', thRet3m: '3M', thRet6m: '6M', thRet1y: '1Y',",
    );
    h = h.replace(
      /"thLast":\s*"Last",/g,
      '"thLast": "Last",\n        "thChg1d": "Day",\n        "thRet1m": "1M",\n        "thRet3m": "3M",\n        "thRet6m": "6M",\n        "thRet1y": "1Y",',
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
