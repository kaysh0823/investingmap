/**
 * Apply en_glossary bulk replacements to map HTML and build scripts.
 * Usage: node scripts/patch_english_glossary.mjs
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REPLACEMENTS = [
  [/Price Position/g, '52W Range'],
  [/price position/g, '52-week range'],
  [/billions USD \(two decimals\)/g, 'USD billions (two decimals)'],
  [/billions USD/g, 'USD billions'],
  [/jo \(兆\) of won/g, 'trillions of won'],
  [/Korean cos\./g, 'Korean companies'],
  [/listed names/g, 'listed companies'],
  [/illustrative links/g, 'illustrative relationships'],
  [/global links/g, 'global relationships'],
  [/peer links/g, 'peer relationships'],
  [/reference links/g, 'reference relationships'],
  [/big-pharma pairing/g, 'big-pharma licensing & partnerships'],
  [/pairing network/g, 'licensing & partnership network'],
  [/pairing links/g, 'licensing & partnership links'],
  [/pairings/g, 'licensing & partnerships'],
  [/pairing/g, 'licensing & partnerships'],
  [/listed primes/g, 'major defense contractors'],
  [/generation OEM/g, 'power generation equipment'],
  [/Grid gear/g, 'Grid equipment'],
];

const MAP_FILES = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'kculture/korea_kculture_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'bio/bio_inline_tail.js',
  'bio/korea_bio_map.inline.js',
];

const BUILD_FILES = [
  'build_korea_ship_map.mjs',
  'build_korea_defense_map.mjs',
  'build_korea_robot_map.mjs',
  'build_korea_kculture_map.mjs',
  'build_korea_construction_map.mjs',
  'build_korea_finance_map.mjs',
];

function applyReplacements(text) {
  let out = text;
  for (const [re, rep] of REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  return out;
}

function fixPowergridChainLabel(html) {
  const stale = `"chainLabel": {
            "ESS·배터리": "ESS & lithium batteries",
            "전력설비·송배전": "Transformers, switchgear, cable",
            "태양광·풍력": "Solar, wind, EPC",
            "원자력·발전설비": "Nuclear equipment & power OEM",
            "수소·연료전지": "Fuel cells & hydrogen infra",
            "전력·가스": "Utilities & gas distribution"
        }`;
  const fixed = `"chainLabel": {
            "전력설비": "Switchgear & transformers",
            "송배전": "T&D · cables · utilities",
            "발전설비": "Generation & nuclear equipment"
        }`;
  if (html.includes(stale)) {
    return html.replace(stale, fixed);
  }
  return html;
}

let changed = 0;
for (const rel of [...MAP_FILES, ...BUILD_FILES]) {
  const p = join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  let text = fs.readFileSync(p, 'utf8');
  const orig = text;
  text = applyReplacements(text);
  if (rel.includes('powergrid')) text = fixPowergridChainLabel(text);
  if (text !== orig) {
    fs.writeFileSync(p, text, 'utf8');
    changed++;
    console.log('patched', rel);
  }
}

console.log('Done. Files changed:', changed);
