/**
 * Add non-sortable 차트 (spark20) column after ticker on industry map tables.
 * Idempotent. Wire via rebuild_site / npm run build — do not hand-edit map HTML.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
];

const PLACEHOLDER_SPARK =
  '<svg class="quote-spark" viewBox="0 0 56 22" aria-hidden="true"><polyline fill="none" stroke="#8b949e" stroke-width="1.8" stroke-dasharray="3 3" points="2,11 54,11"/></svg>';

const TH_TICKER = '<th id="th-ticker" onclick="sortTable(\'ticker\')">종목코드</th>';
const TH_SPARK = `${TH_TICKER}\n              <th id="th-spark">차트</th>`;

const KEYMAP_FROM =
  'const keyMap = { name: 0, ticker: 1, quoteLast: 2, chg1dPct: 3, ret20dPct: 4, ret50dPct: 5, ret120dPct: 6, ret200dPct: 7, quoteHi52: 8, quoteLo52: 9, quotePosition: 10, rs: 11, mcapWon: 12, per: 13, pbr: 14, market: 15, chain: 16 };';
const KEYMAP_TO =
  'const keyMap = { name: 0, ticker: 1, quoteLast: 3, chg1dPct: 4, ret20dPct: 5, ret50dPct: 6, ret120dPct: 7, ret200dPct: 8, quoteHi52: 9, quoteLo52: 10, quotePosition: 11, rs: 12, mcapWon: 13, per: 14, pbr: 15, market: 16, chain: 17 };';

const APPLY_AFTER_TICKER = "document.getElementById('th-ticker').textContent = t.thTicker;";
const APPLY_WITH_SPARK = `${APPLY_AFTER_TICKER}
      var thSpark = document.getElementById('th-spark');
      if (thSpark) thSpark.textContent = t.thSpark || (lang === 'en' ? 'Chart' : '차트');`;

const SPARK_CSS = `
    .quote-spark { display: block; width: 56px; height: 22px; flex-shrink: 0; }
    .spark-cell { width: 64px; padding: 4px 6px; vertical-align: middle; }
    .spark-cell .quote-spark { display: block; width: 56px; height: 22px; }
    .im-card-spark { display: inline-flex; align-items: center; justify-content: flex-end; flex: 0 0 auto; margin: 0; line-height: 0; }
    .im-card-spark .quote-spark { display: block; width: 56px; height: 22px; }
    #th-spark { cursor: default; font-size: 11px; white-space: nowrap; font-weight: 600; }
`;

const SPARK_CSS_OLD_SCOPED =
  '.spark-cell .quote-spark { display: block; width: 56px; height: 22px; }';

function patchTranslations(html) {
  let h = html;
  if (h.includes('thSpark')) return h;
  h = h.replace(
    /(thTicker:\s*'종목코드'), (thLast:)/g,
    "$1, thSpark: '차트', $2",
  );
  h = h.replace(
    /(thTicker:\s*'Ticker'), (thLast:)/g,
    "$1, thSpark: 'Chart', $2",
  );
  h = h.replace(
    /"thTicker":\s*"종목코드",\s*\r?\n(\s*)"thLast":/g,
    '"thTicker": "종목코드",\n$1"thSpark": "차트",\n$1"thLast":',
  );
  h = h.replace(
    /"thTicker":\s*"Ticker",\s*\r?\n(\s*)"thLast":/g,
    '"thTicker": "Ticker",\n$1"thSpark": "Chart",\n$1"thLast":',
  );
  return h;
}

/** Live render row: ticker → spark from qr → last */
function patchHtmlRowTemplate(html) {
  // Repair mistaken hardcoded placeholder inside template literal
  html = html.replace(
    /(<td><span class="ticker">\$\{c\.ticker\}<\/span><\/td>)\s*\r?\n(\s*)<td class="spark-cell"><svg class="quote-spark"[^]*?<\/svg><\/td>\s*\r?\n(\s*)(<td class="quote-cell">\$\{qr\.last\})/g,
    `$1\n$2<td class="spark-cell">\${qr.spark || '—'}</td>\n$3$4`,
  );
  // Fresh insert
  html = html.replace(
    /(<td><span class="ticker">\$\{c\.ticker\}<\/span><\/td>)\s*\r?\n(\s*)(?!<td class="spark-cell">)(<td class="quote-cell">\$\{qr\.last\})/g,
    `$1\n$2<td class="spark-cell">\${qr.spark || '—'}</td>\n$2$3`,
  );
  return html;
}

function patchBioRowTemplate(html) {
  // Repair if static-style spark somehow appeared (unlikely in bio strings)
  html = html.replace(
    /('<td><span class="ticker">' \+ c\.ticker \+ '<\/span><\/td>' \+)\s*\r?\n(\s*)'<td class="spark-cell"><svg[^']*<\/svg><\/td>' \+\s*\r?\n(\s*)('<td class="quote-cell">' \+ qr\.last)/g,
    `$1\n$2'<td class="spark-cell">' + (qr.spark || '\\u2014') + '</td>' +\n$3$4`,
  );
  html = html.replace(
    /('<td><span class="ticker">' \+ c\.ticker \+ '<\/span><\/td>' \+)\s*\r?\n(\s*)(?!'<td class="spark-cell">)('<td class="quote-cell">' \+ qr\.last)/g,
    `$1\n$2'<td class="spark-cell">' + (qr.spark || '\\u2014') + '</td>' +\n$2$3`,
  );
  return html;
}

/** Only static SEO prerender tbody rows — not JS templates */
function patchPrerenderRows(html) {
  const start = '<!-- investingmap-seo-prerender-start -->';
  const end = '<!-- investingmap-seo-prerender-end -->';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end);
  if (i0 < 0 || i1 < 0 || i1 <= i0) return html;
  const before = html.slice(0, i0);
  let mid = html.slice(i0, i1);
  const after = html.slice(i1);
  mid = mid.replace(
    /(<td><span class="ticker">[^<]*<\/span><\/td>)\s*\r?\n(\s*)(?!<td class="spark-cell">)(<td class="quote-cell">)/g,
    `$1\n$2<td class="spark-cell">${PLACEHOLDER_SPARK}</td>\n$2$3`,
  );
  return before + mid + after;
}

function patchFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return;
  }
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;

  if (html.includes(TH_TICKER) && !html.includes('id="th-spark"')) {
    html = html.replace(TH_TICKER, TH_SPARK);
  }

  if (rel.endsWith('.js')) {
    html = patchBioRowTemplate(html);
  } else {
    html = patchHtmlRowTemplate(html);
    html = patchPrerenderRows(html);
  }

  if (html.includes(KEYMAP_FROM)) {
    html = html.split(KEYMAP_FROM).join(KEYMAP_TO);
  }

  html = patchTranslations(html);

  if (html.includes(APPLY_AFTER_TICKER) && !html.includes("getElementById('th-spark')")) {
    html = html.replace(APPLY_AFTER_TICKER, APPLY_WITH_SPARK);
  }

  if (html.includes(SPARK_CSS_OLD_SCOPED) && !html.includes('.im-card-spark .quote-spark')) {
    html = html.replace(
      /    \.spark-cell \{ width: 64px; padding: 4px 6px; vertical-align: middle; \}\s*\r?\n    \.spark-cell \.quote-spark \{ display: block; width: 56px; height: 22px; \}\s*\r?\n    #th-spark \{ cursor: default; font-size: 11px; white-space: nowrap; font-weight: 600; \}/,
      SPARK_CSS.trim(),
    );
  } else if (!html.includes('.spark-cell {') && html.includes('</style>')) {
    html = html.replace(/\r?\n  <\/style>\r?\n/, `${SPARK_CSS}\n  </style>\n`);
  }

  if (html === before) {
    console.log('unchanged', rel);
    return;
  }
  fs.writeFileSync(fp, html, 'utf8');
  console.log('patched', rel);
}

for (const rel of TARGETS) patchFile(rel);

const HTML_MAPS = TARGETS.filter((r) => r.endsWith('.html'));
for (const rel of HTML_MAPS) {
  const fp = path.join(ROOT, rel);
  let html = fs.readFileSync(fp, 'utf8');
  let next = html.replace(/live_quotes\.js\?v=\d+/g, 'live_quotes.js?v=15');
  next = next.replace(/map_mobile_table\.js\?v=\d+/g, 'map_mobile_table.js?v=9');
  if (next !== html) {
    fs.writeFileSync(fp, next, 'utf8');
    console.log('bumped script ?v=', rel);
  }
}
