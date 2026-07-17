/**
 * Safely prune defense company universe and rename 방위 → 방산.
 * Energy is split later by scripts/split_energy_clean_sectors.mjs, so do not
 * prune its cp_list-expanded source here.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFENSE_KEEP = new Set([
  '012450', '064350', '272210', '079550', '047810', '000880', '082920', '011210',
  '103140', '003570', '099320', '036530', '064960', '214430', '005810', '010820',
]);

function pad(t) {
  return String(t || '').padStart(6, '0');
}

function removeRowsAndListItems(html, tickers) {
  let out = html;
  for (const raw of tickers) {
    const t = pad(raw);
    out = out.replace(
      new RegExp(
        `\\s*\\{\\s*"@type"\\s*:\\s*"ListItem"\\s*,\\s*"position"\\s*:\\s*\\d+\\s*,\\s*"name"\\s*:\\s*"[^"]*\\(${t},[^"]*"\\s*,\\s*"url"\\s*:\\s*"[^"]*#ticker-${t}"\\s*\\},?`,
        'g',
      ),
      '',
    );
    out = out.replace(new RegExp(`\\s*<tr data-ticker="${t}">[\\s\\S]*?<\\/tr>`, 'g'), '');
  }
  out = out.replace(/,\s*,/g, ',');
  out = out.replace(/\[\s*,/g, '[');
  out = out.replace(/,\s*\]/g, ']');

  let pos = 0;
  out = out.replace(/("itemListElement"\s*:\s*\[)([\s\S]*?)(\]\s*,)/, (full, a, body, c) => {
    pos = 0;
    const next = body.replace(/"position"\s*:\s*\d+/g, () => {
      pos += 1;
      return `"position": ${pos}`;
    });
    return a + next + c;
  });
  return out;
}

function renameBangwi(html) {
  return html
    .replace(/한국 방위·우주·항공/g, '한국 방산·우주·항공')
    .replace(/글로벌 방위·항공·우주/g, '글로벌 방산·항공·우주')
    .replace(/방위·항공·우주 밸류체인/g, '방산·항공·우주 밸류체인')
    .replace(/— 방위·항공우주/g, '— 방산·항공우주');
}

function filterMap(rel, keepFn, label) {
  const p = path.join(ROOT, rel);
  let html = fs.readFileSync(p, 'utf8');
  const before = extractCompaniesFromHtml(html);
  const after = before.filter(keepFn);
  const removed = before.filter((c) => !keepFn(c)).map((c) => pad(c.ticker));
  console.log(`${label}: ${before.length} -> ${after.length} (removed ${removed.join(',') || 'none'})`);
  html = patchKoreanCompaniesHtml(html, after);
  html = removeRowsAndListItems(html, removed);
  if (rel.startsWith('defense')) html = renameBangwi(html);
  fs.writeFileSync(p, html, 'utf8');
  const check = extractCompaniesFromHtml(fs.readFileSync(p, 'utf8'));
  if (check.length !== after.length) {
    throw new Error(`${label} verify failed: ${check.length} != ${after.length}`);
  }
}

filterMap(
  'defense/korea_defense_map.html',
  (c) => DEFENSE_KEEP.has(pad(c.ticker)),
  'defense',
);

for (const rel of [
  'bio/korea_bio_map.html',
  'construction/korea_construction_map.html',
  'energy/korea_energy_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'finance/korea_finance_map.html',
  'kconsume/korea_kconsume_map.html',
  'kcontent/korea_kcontent_map.html',
  'powergrid/korea_powergrid_map.html',
  'robot/korea_robot_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'index.html',
  'about.html',
  'llms.txt',
  'README.md',
  'data/geo.json',
  'lib/seo_sector_copy.mjs',
  'scripts/patch_seo.mjs',
  'scripts/fix_canonical_domain.mjs',
  'build_korea_defense_map.mjs',
]) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  let t = fs.readFileSync(p, 'utf8');
  const next = renameBangwi(t)
    .replace(/방위\/우주\/항공/g, '방산/우주/항공')
    .replace(/방위·우주·항공/g, '방산·우주·항공')
    .replace(/방위·항공·우주/g, '방산·항공·우주')
    .replace(/\\uBC29\\uC704\\u00B7\\uC6B0\\uC8FC\\u00B7\\uD56D\\uACF5/g, '\\uBC29\\uC0B0\\u00B7\\uC6B0\\uC8FC\\u00B7\\uD56D\\uACF5')
    .replace(/\\uBC29\\uC704\\u00B7\\uD56D\\uACF5\\u00B7\\uC6B0\\uC8FC/g, '\\uBC29\\uC0B0\\u00B7\\uD56D\\uACF5\\u00B7\\uC6B0\\uC8FC');
  if (next !== t) {
    fs.writeFileSync(p, next, 'utf8');
    console.log('renamed', rel);
  }
}

for (const rel of ['js/sector_nav.js', 'js/global_bottom_nav.js', 'js/desktop_sidebar_nav.js']) {
  const p = path.join(ROOT, rel);
  let t = fs.readFileSync(p, 'utf8');
  const next = t.replace(/ko: '\\uBC29\\uC704'/g, "ko: '\\uBC29\\uC0B0'");
  if (next !== t) {
    fs.writeFileSync(p, next, 'utf8');
    console.log('nav', rel);
  }
}

{
  const p = path.join(ROOT, 'lib', 'sector_exclusive.mjs');
  let t = fs.readFileSync(p, 'utf8');
  const next = t.replace(/\s*'003490':\s*'defense',\s*\/\/[^\n]*\n/, '\n');
  if (next !== t) fs.writeFileSync(p, next, 'utf8');
}

execSync('node scripts/build_hub_index.mjs', { cwd: ROOT, stdio: 'inherit' });

{
  const indexPath = path.join(ROOT, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const defenseN = DEFENSE_KEEP.size;
  indexHtml = indexHtml.replace(/\d+개 상장사 · 항공/, `${defenseN}개 상장사 · 항공`);
  indexHtml = indexHtml.replace(/\d+ companies · aviation/, `${defenseN} companies · aviation`);
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log(`index.html hub counts: defense=${defenseN}`);
}

console.log('Done.');
