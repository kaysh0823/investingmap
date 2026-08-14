/**
 * Add RS column after price position in industry map tables.
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
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
];

const TH_HEADER =
  '<th id="th-position" onclick="sortTable(\'quotePosition\')">주가 위치</th>';
const TH_HEADER_RS =
  `${TH_HEADER}\n              <th id="th-rs" onclick="sortTable('rs')">RS</th>`;

const ROW_POSITION =
  "<td class=\"quote-cell\">${(qr && (qr.position != null ? qr.position : qr.yoy)) || '—'}</td>";
const ROW_POSITION_RS =
  ROW_POSITION + "\n      <td class=\"quote-cell\">${qr.rs || '—'}</td>";

const KEYMAP_OLD =
  'const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, mcapWon: 6, per: 7, pbr: 8, market: 9, chain: 10 };';
const KEYMAP_NEW =
  'const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, rs: 6, mcapWon: 7, per: 8, pbr: 9, market: 10, chain: 11 };';

const SORT_NUM_OLD =
  "sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition'";
const SORT_NUM_NEW =
  "sortKey === 'mcapWon' || sortKey === 'per' || sortKey === 'pbr' || sortKey === 'quoteLast' || sortKey === 'quoteHi52' || sortKey === 'quoteLo52' || sortKey === 'quotePosition' || sortKey === 'rs'";

const APPLY_LANG_THPOS =
  "var thpos = document.getElementById('th-position');";
const APPLY_LANG_THPOS_RS =
  `${APPLY_LANG_THPOS}\n      var thrs = document.getElementById('th-rs');`;

const APPLY_LANG_SET =
  "if (thpos) thpos.textContent = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.positionHeaderLabel) ? InvestingMapLiveQuotes.positionHeaderLabel(lang, t) : (t.thPosition || (lang === 'en' ? '52W Range' : '주가 위치'));";
const APPLY_LANG_SET_RS =
  `${APPLY_LANG_SET}\n      if (thrs) thrs.textContent = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.rsHeaderLabel) ? InvestingMapLiveQuotes.rsHeaderLabel(lang, t) : (t.thRs || 'RS');`;

function patchThRsTranslations(html) {
  let h = html;
  if (!h.includes('thRs')) {
    h = h.replace(
      /thPosition:\s*'주가 위치',/g,
      "thPosition: '주가 위치', thRs: 'RS',",
    );
    h = h.replace(
      /"thPosition":\s*"주가 위치",/g,
      '"thPosition": "주가 위치",\n        "thRs": "RS",',
    );
    h = h.replace(
      /thPosition:\s*'52W Range',/g,
      "thPosition: '52W Range', thRs: 'RS',",
    );
    h = h.replace(
      /"thPosition":\s*"52W Range",/g,
      '"thPosition": "52W Range",\n        "thRs": "RS",',
    );
    h = h.replace(
      /"thPosition":\s*"Price vs range",/g,
      '"thPosition": "Price vs range",\n        "thRs": "RS",',
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
  if (html.includes('id="th-rs"')) {
    console.log('already patched', rel);
    return;
  }

  if (html.includes(TH_HEADER) && !html.includes('id="th-rs"')) {
    html = html.replace(TH_HEADER, TH_HEADER_RS);
  }

  if (html.includes(ROW_POSITION) && !html.includes('${qr.rs')) {
    html = html.replace(ROW_POSITION, ROW_POSITION_RS);
  }

  html = html.split(KEYMAP_OLD).join(KEYMAP_NEW);
  html = html.split(SORT_NUM_OLD).join(SORT_NUM_NEW);
  html = patchThRsTranslations(html);

  if (html.includes(APPLY_LANG_THPOS) && !html.includes("getElementById('th-rs')")) {
    html = html.replace(APPLY_LANG_THPOS, APPLY_LANG_THPOS_RS);
    html = html.replace(APPLY_LANG_SET, APPLY_LANG_SET_RS);
  }

  fs.writeFileSync(fp, html, 'utf8');
  console.log('patched', rel);
}

for (const rel of TARGETS) patchFile(rel);
