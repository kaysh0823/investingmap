/**
 * Audit chain i18n: CHAIN_COLORS keys vs T.ko/T.en chainLabel & chainFilter keys.
 * Usage: node scripts/audit_chain_i18n.mjs
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MAP_SPECS = [
  { rel: 'semiconductor/korea_semiconductor_map.html' },
  { rel: 'bio/korea_bio_map.html', inline: 'bio/korea_bio_map.inline.js' },
  { rel: 'ship/korea_ship_map.html' },
  { rel: 'defense/korea_defense_map.html' },
  { rel: 'robot/korea_robot_map.html' },
  { rel: 'energy/korea_energy_map.html' },
  { rel: 'powergrid/korea_powergrid_map.html' },
  { rel: 'kculture/korea_kculture_map.html' },
  { rel: 'finance/korea_finance_map.html' },
  { rel: 'construction/korea_construction_map.html' },
];

const issues = [];

function addIssue(file, detail) {
  issues.push({ file: file.replace(ROOT + '\\', '').replace(ROOT + '/', ''), detail });
}

function parseChainColors(text) {
  const m = text.match(/const CHAIN_COLORS\s*=\s*(\{[^;]+\});/);
  if (!m) return null;
  const body = m[1];
  const keys = new Set();
  for (const x of body.matchAll(/"([^"]+)"\s*:/g)) keys.add(x[1]);
  for (const x of body.matchAll(/'([^']+)'\s*:/g)) keys.add(x[1]);
  for (const x of body.matchAll(/(?:^|[,{])\s*([\w\u3131-\u318E\uAC00-\uD7A3/·]+)\s*:/g)) keys.add(x[1]);
  return [...keys];
}

function parseT(html) {
  const multi = html.match(/const T\s*=\s*(\{[\s\S]*?\n\s*\});/);
  if (multi) {
    try { return new Function(`return ${multi[1]}`)(); } catch { /* fall through */ }
  }
  const one = html.match(/const T\s*=\s*(\{.*\}\});/s);
  if (one) {
    try { return new Function(`return ${one[1]}`)(); } catch { return null; }
  }
  return null;
}

function chainKeysFromT(t, lang) {
  if (!t || !t[lang]) return { chainLabel: new Set(), chainFilter: new Set() };
  return {
    chainLabel: new Set(Object.keys(t[lang].chainLabel || {})),
    chainFilter: new Set(Object.keys(t[lang].chainFilter || {})),
  };
}

function checkMap(spec) {
  const fp = join(ROOT, spec.rel);
  if (!fs.existsSync(fp)) {
    addIssue(spec.rel, 'file missing');
    return;
  }
  let html = fs.readFileSync(fp, 'utf8');
  if (spec.inline) {
    const ip = join(ROOT, spec.inline);
    if (fs.existsSync(ip)) html += '\n' + fs.readFileSync(ip, 'utf8');
  }

  const chainKeys = parseChainColors(html);
  if (!chainKeys || !chainKeys.length) {
    addIssue(spec.rel, 'CHAIN_COLORS not found');
    return;
  }
  const chainSet = new Set(chainKeys);

  const t = parseT(html);
  if (!t) addIssue(spec.rel, 'const T object not parsed');

  const koLabel = chainKeysFromT(t, 'ko').chainLabel;
  const enLabel = chainKeysFromT(t, 'en').chainLabel;
  const koFilter = chainKeysFromT(t, 'ko').chainFilter;
  const enFilter = chainKeysFromT(t, 'en').chainFilter;

  for (const ch of chainSet) {
    if (!koLabel.has(ch)) addIssue(spec.rel, `T.ko.chainLabel missing key: ${ch}`);
    if (!enLabel.has(ch)) addIssue(spec.rel, `T.en.chainLabel missing key: ${ch} (KO fallback in EN mode)`);
    if (!koFilter.has(ch)) addIssue(spec.rel, `T.ko.chainFilter missing key: ${ch}`);
    if (!enFilter.has(ch)) addIssue(spec.rel, `T.en.chainFilter missing key: ${ch}`);
  }

  for (const ch of enLabel) {
    if (!chainSet.has(ch)) addIssue(spec.rel, `T.en.chainLabel stale key: ${ch}`);
  }

  const koOnly = [...koLabel].filter((k) => !enLabel.has(k));
  const enOnly = [...enLabel].filter((k) => !koLabel.has(k));
  if (koOnly.length) addIssue(spec.rel, `chainLabel ko-only keys: ${koOnly.join(', ')}`);
  if (enOnly.length) addIssue(spec.rel, `chainLabel en-only keys: ${enOnly.join(', ')}`);

  if (!html.includes('chainDisplayLabel')) {
    addIssue(spec.rel, 'chainDisplayLabel helper not used');
  }
  if (!html.includes('notifyLangApplied')) {
    addIssue(spec.rel, 'notifyLangApplied not called after syncAll');
  }
  if (html.includes('InvestingMapHeatmap.render') && !/chainLabel:\s*function/.test(html)) {
    addIssue(spec.rel, 'renderHeatmap missing chainLabel callback');
  }
}

for (const spec of MAP_SPECS) checkMap(spec);

console.log('Chain i18n audit');
console.log('================');
console.log('Total issues:', issues.length);
console.log('');
for (const i of issues.slice(0, 100)) {
  console.log(`${i.file}`);
  console.log(`  ${i.detail}`);
}
if (issues.length > 100) console.log(`… and ${issues.length - 100} more`);

process.exit(issues.length > 0 ? 1 : 0);
