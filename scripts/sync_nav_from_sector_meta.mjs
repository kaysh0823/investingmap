/**
 * Sync nav JS ITEMS/SECTORS from lib/sector_meta.mjs (26-card order).
 * Folder regex: replace a known baseline string only (no paren-slice).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECTOR_META, HUB_MAP_PATHS } from '../lib/sector_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = HUB_MAP_PATHS.map(([id]) => id);

const FOLDER_ALT = [
  ...new Set([
    ...ORDER.map((id) => SECTOR_META[id].map.split('/')[0]),
    'semiconductor',
    'energy',
    'ess',
    'kculture',
    'bigchip',
  ]),
].join('|');

/** Baseline list used before shipping/machinery split — safe string replace target. */
const FOLDER_BASELINES = [
  'bigchip|semiconductor|bio|ship|defense|robot|auto|medtech|energy|battery|ess|renewable|nuclear|powergrid|kculture|kconsume|cosmetics|kcontent|finance|construction|software|holdings|telecom|chemical|travel|elec|metal',
  'bigchip|semiconductor|bio|ship|shipping|defense|robot|auto|medtech|energy|battery|ess|renewable|nuclear|powergrid|kculture|kconsume|cosmetics|kcontent|finance|construction|software|holdings|telecom|chemical|travel|elec|metal|machinery',
  FOLDER_ALT,
];

function itemLine(id, style) {
  const m = SECTOR_META[id];
  const p = style === 'sector' ? `../${m.map}` : m.map;
  if (style === 'sector') {
    return `    { id: '${id}', path: '${p}', ko: ${JSON.stringify(m.ko)}, en: ${JSON.stringify(m.en)} },`;
  }
  if (style === 'bottom') {
    return `    { id: '${id}', path: '${p}', icon: ${JSON.stringify(m.icon)}, ko: ${JSON.stringify(m.ko)}, en: ${JSON.stringify(m.en)}, koShort: ${JSON.stringify(m.shortKo)}, enShort: ${JSON.stringify(m.shortEn)} },`;
  }
  return `    { id: '${id}', path: '${p}', icon: ${JSON.stringify(m.icon)}, ko: ${JSON.stringify(m.ko)}, en: ${JSON.stringify(m.en)} },`;
}

function patchFolderAlts(t) {
  for (const base of FOLDER_BASELINES) {
    if (t.includes(base)) t = t.split(base).join(FOLDER_ALT);
  }
  return t;
}

function patchArray(file, varName, lines) {
  const fp = path.join(ROOT, file);
  let t = fs.readFileSync(fp, 'utf8');
  const re = new RegExp(`(var ${varName} = \\[)[\\s\\S]*?(\\n  \\];)`);
  if (!re.test(t)) throw new Error(`${file}: ${varName} not found`);
  t = t.replace(re, `$1\n${lines.join('\n')}$2`);
  t = patchFolderAlts(t);
  if (!t.includes("/shipping/")) {
    t = t.replace(
      "if (path.indexOf('/ship/') !== -1) return 'ship';",
      "if (path.indexOf('/shipping/') !== -1) return 'shipping';\n    if (path.indexOf('/ship/') !== -1) return 'ship';",
    );
  }
  if (!t.includes("/machinery/")) {
    t = t.replace(
      "if (path.indexOf('/metal/') !== -1) return 'metal';",
      "if (path.indexOf('/machinery/') !== -1) return 'machinery';\n    if (path.indexOf('/metal/') !== -1) return 'metal';",
    );
  }
  fs.writeFileSync(fp, t, 'utf8');
  console.log('OK', file);
}

patchArray(
  'js/desktop_sidebar_nav.js',
  'ITEMS',
  [
    "    { id: 'home', path: 'index.html', icon: '\\u2302', ko: '\\uD5C8\\uBE0C', en: 'Hub' },",
    ...ORDER.map((id) => itemLine(id, 'desktop')),
  ],
);

patchArray(
  'js/global_bottom_nav.js',
  'ITEMS',
  [
    "    { id: 'home', path: 'index.html', icon: '\\u2302', ko: '\\uD648', en: 'Home' },",
    ...ORDER.map((id) => itemLine(id, 'bottom')),
  ],
);

patchArray(
  'js/sector_nav.js',
  'SECTORS',
  ORDER.map((id) => itemLine(id, 'sector')),
);

{
  const fp = path.join(ROOT, 'js', 'map_tab_state.js');
  let t = fs.readFileSync(fp, 'utf8');
  t = patchFolderAlts(t);
  fs.writeFileSync(fp, t, 'utf8');
  console.log('OK js/map_tab_state.js');
}

console.log('nav synced, sectors=', ORDER.length, 'folders=', FOLDER_ALT);
