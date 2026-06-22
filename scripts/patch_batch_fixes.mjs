/**
 * Batch fixes: quotes-asof header, data-sector, thLast keys, mobile CSS
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MAP_FILES = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
  'energy/korea_energy_map.html',
];

const TH_KEYS_KO = `
        "thLast": "현재가",
        "th52High": "52주 최고",
        "th52Lo": "52주 최저",
        "thPosition": "주가 위치",`;

const TH_KEYS_EN = `
        "thLast": "Last",
        "th52High": "52W high",
        "th52Lo": "52W low",
        "thPosition": "Price vs range",`;

function patchHeader(html) {
  let h = html;
  h = h.replace(
    /\s*<span class="data-asof" id="data-asof">[^<]*<\/span>\s*/g,
    '\n      '
  );
  h = h.replace(
    /const asofEl = document\.getElementById\('data-asof'\);\s*\n\s*if \(asofEl\) asofEl\.textContent = t\.dataAsof;\s*\n/g,
    ''
  );
  h = h.replace(
    /body\.im-tab-table \.data-asof,\s*\n\s*body\.im-tab-table \.quotes-asof/g,
    'body.im-tab-table .quotes-asof-hidden'
  );
  return h;
}

function addThKeys(html) {
  if (html.includes('"thLast"')) return html;
  let h = html;
  h = h.replace(/("thTicker": "[^"]+",)\s*\n(\s*"thMcap")/g, `$1\n${TH_KEYS_KO}\n$2`);
  h = h.replace(/("thTicker": "[^"]+",)\s*\n(\s*"thMcap": "Market cap)/g, `$1\n${TH_KEYS_EN}\n$2`);
  return h;
}

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp, 'utf8');
  html = patchHeader(html);
  if (rel.includes('kculture') || rel.includes('defense')) {
    html = addThKeys(html);
  }
  if (rel.includes('kculture')) {
    html = html.replace(/<body data-sector="semi">/, '<body data-sector="kculture">');
  }
  if (rel.includes('defense')) {
    html = html.replace(/<body data-sector="semi">/, '<body data-sector="defense">');
  }
  fs.writeFileSync(fp, html);
  console.log('patched', rel);
}

const bioTail = path.join(ROOT, 'bio/bio_inline_tail.js');
if (fs.existsSync(bioTail)) {
  let t = fs.readFileSync(bioTail, 'utf8');
  t = t.replace(
    /\s*<span class="data-asof" id="data-asof">[^<]*<\/span>\s*/g,
    '\n      '
  );
  t = t.replace(
    /const asofEl = document\.getElementById\('data-asof'\);\s*\n\s*if \(asofEl\) asofEl\.textContent = t\.dataAsof;\s*\n/g,
    ''
  );
  t = t.replace(
    /body\.im-tab-table \.data-asof,\s*\n\s*body\.im-tab-table \.quotes-asof/g,
    'body.im-tab-table .quotes-asof-hidden'
  );
  fs.writeFileSync(bioTail, t);
  console.log('patched bio/bio_inline_tail.js');
}

console.log('done');
