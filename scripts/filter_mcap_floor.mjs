/**
 * Remove companies below MIN_MCAP_WON (3\ucc9c\uc5b5\uc6d0) from industry maps and bio inline data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
  countKoreanTickersInHtml,
} from '../lib/map_company_serialize.mjs';
import { filterCompaniesByMcap, MIN_MCAP_WON } from '../lib/mcap_policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HTML_MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'kconsume/korea_kconsume_map.html',
  'kcontent/korea_kcontent_map.html',
];

function countMarkets(companies) {
  let kospi = 0;
  let kosdaq = 0;
  for (const c of companies) {
    if (c.market === 'KOSPI') kospi += 1;
    else if (c.market === 'KOSDAQ') kosdaq += 1;
  }
  return { kospi, kosdaq };
}

function patchMapBadges(html, n, kospi, kosdaq) {
  let out = html;
  out = out.replace(
    /<div class="badge" id="badge-total">[^<]*<span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-total">\ucd1d <span>${n}</span>\uac1c \uc0c1\uc7a5\uc0ac</div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-total">[^<]*<span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-total">Total <span>${n}</span> listed companies</div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>[^<]*KOSDAQ <span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span> \u00b7 KOSDAQ <span>${kosdaq}</span></div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>[^<]*KOSDAQ <span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span> \u00b7 KOSDAQ <span>${kosdaq}</span></div>`,
  );
  out = out.replace(
    /<div class="result-count" id="result-label">[^<]*<span id="show-count">\d+<\/span>[^<]*<\/div>/,
    `<div class="result-count" id="result-label">\ud45c\uc2dc: <span id="show-count">${n}</span>\uac1c</div>`,
  );
  return out;
}

function filterHtmlMap(rel) {
  const fp = path.join(ROOT, rel);
  let html = fs.readFileSync(fp, 'utf8');
  const before = extractCompaniesFromHtml(html).length;
  const filtered = filterCompaniesByMcap(extractCompaniesFromHtml(html));
  const { kospi, kosdaq } = countMarkets(filtered);
  html = patchKoreanCompaniesHtml(html, filtered);
  html = patchMapBadges(html, filtered.length, kospi, kosdaq);
  fs.writeFileSync(fp, html, 'utf8');
  const after = countKoreanTickersInHtml(fs.readFileSync(fp, 'utf8'));
  console.log(`${rel}: ${before} \u2192 ${after} (floor ${MIN_MCAP_WON / 1e8}\uc5b5)`);
  return { before, after };
}

function filterBioInline() {
  console.log('bio: regenerating inline with mcap floor\u2026');
  execSync('node bio/gen_korea_bio_inline.mjs', { cwd: ROOT, stdio: 'inherit' });
  const inline = fs.readFileSync(path.join(ROOT, 'bio/korea_bio_map.inline.js'), 'utf8');
  const count = (inline.match(/"ticker":/g) || []).length;
  console.log(`bio/korea_bio_map.inline.js: ${count} companies`);
  return count;
}

function patchIndexHubCounts(hubLines) {
  const indexPath = path.join(ROOT, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (hubLines.semi) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 IDM/, `${hubLines.semi}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 IDM`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 IDM, fabless/, `${hubLines.semi} listings \u00b7 IDM, fabless`);
  }
  if (hubLines.bio) {
    indexHtml = indexHtml.replace(/\d+\uac1c \ub9e4\ud551 \u00b7 \ubc14\uc774\uc624\uc2dc\ubc00\ub7ec/, `${hubLines.bio}\uac1c \ub9e4\ud551 \u00b7 \ubc14\uc774\uc624\uc2dc\ubc00\ub7ec`);
    indexHtml = indexHtml.replace(/\d+ mappings \u00b7 biosimilars/, `${hubLines.bio} mappings \u00b7 biosimilars`);
  }
  if (hubLines.ship) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc870\uc120\uc18c/, `${hubLines.ship}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc870\uc120\uc18c`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 yards/, `${hubLines.ship} listings \u00b7 yards`);
  }
  if (hubLines.defense) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud56d\uacf5/, `${hubLines.defense}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud56d\uacf5`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 aviation/, `${hubLines.defense} listings \u00b7 aviation`);
  }
  if (hubLines.robot) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 FA/, `${hubLines.robot}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 FA`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 FA, AMR/, `${hubLines.robot} listings \u00b7 FA, AMR`);
  }
  if (hubLines.auto) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc644\uc131\ucc28/, `${hubLines.auto}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc644\uc131\ucc28`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 OEM/, `${hubLines.auto} listings \u00b7 OEM`);
  }
  if (hubLines.medtech) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc9c4\ub2e8/, `${hubLines.medtech}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc9c4\ub2e8`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 Diagnostics/, `${hubLines.medtech} listings \u00b7 Diagnostics`);
  }
  if (hubLines.battery) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 2\ucc28\uc804\uc9c0/, `${hubLines.battery}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 2\ucc28\uc804\uc9c0`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 cells, materials, equipment, parts/, `${hubLines.battery} listings \u00b7 cells, materials, equipment, parts`);
  }
  if (hubLines.renewable) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud0dc\uc591\uad11/, `${hubLines.renewable}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud0dc\uc591\uad11`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 solar/, `${hubLines.renewable} listings \u00b7 solar`);
  }
  if (hubLines.nuclear) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc6d0\uc804/, `${hubLines.nuclear}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc6d0\uc804`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 nuclear/, `${hubLines.nuclear} listings \u00b7 nuclear`);
  }
  if (hubLines.powergrid) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc804\ub825\uc124\ube44/, `${hubLines.powergrid}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc804\ub825\uc124\ube44`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 power equipment/, `${hubLines.powergrid} listings \u00b7 power equipment`);
  }
  if (hubLines.finance) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc740\ud589/, `${hubLines.finance}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc740\ud589`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 banks/, `${hubLines.finance} listings \u00b7 banks`);
  }
  if (hubLines.construction) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc885\ud569\uac74\uc124/, `${hubLines.construction}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc885\ud569\uac74\uc124`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 contractors/, `${hubLines.construction} listings \u00b7 contractors`);
  }
  if (hubLines.kconsume) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud654\uc7a5\ud488/, `${hubLines.kconsume}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud654\uc7a5\ud488`);
    indexHtml = indexHtml.replace(/\d+ companies \u00b7 beauty/, `${hubLines.kconsume} companies \u00b7 beauty`);
  }
  if (hubLines.kcontent) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uac8c\uc784/, `${hubLines.kcontent}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uac8c\uc784`);
    indexHtml = indexHtml.replace(/\d+ companies \u00b7 games/, `${hubLines.kcontent} companies \u00b7 games`);
  }
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('index.html hub counts updated');
}

function main() {
  console.log(`Applying market-cap floor: ${MIN_MCAP_WON.toLocaleString('ko-KR')} won (3\ucc9c\uc5b5\uc6d0)`);
  const counts = {};
  for (const rel of HTML_MAPS) {
    const key = rel.split('/')[0];
    const sectorKey = {
      semiconductor: 'semi',
      ship: 'ship',
      defense: 'defense',
      robot: 'robot',
      auto: 'auto',
      medtech: 'medtech',
      battery: 'battery',
      renewable: 'renewable',
      nuclear: 'nuclear',
      powergrid: 'powergrid',
      finance: 'finance',
      construction: 'construction',
      kconsume: 'kconsume',
      kcontent: 'kcontent',
    }[key];
    const r = filterHtmlMap(rel);
    if (sectorKey) counts[sectorKey] = r.after;
  }
  counts.bio = filterBioInline();
  execSync('node scripts/build_hub_index.mjs', { cwd: ROOT, stdio: 'inherit' });
  patchIndexHubCounts(counts);
}
main();
