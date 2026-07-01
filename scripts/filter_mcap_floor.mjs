/**
 * Remove companies below MIN_MCAP_WON (5천억원) from industry maps and bio inline data.
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
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
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
    `<div class="badge" id="badge-total">총 <span>${n}</span>개 상장기업</div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-total">[^<]*<span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-total">Total <span>${n}</span> listed companies</div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>[^<]*KOSDAQ <span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>사 · KOSDAQ <span>${kosdaq}</span>사</div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>[^<]*KOSDAQ <span>\d+<\/span>[^<]*<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span> · KOSDAQ <span>${kosdaq}</span></div>`,
  );
  out = out.replace(
    /<div class="result-count" id="result-label">[^<]*<span id="show-count">\d+<\/span>[^<]*<\/div>/,
    `<div class="result-count" id="result-label">표시: <span id="show-count">${n}</span>개</div>`,
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
  console.log(`${rel}: ${before} → ${after} (floor ${MIN_MCAP_WON / 1e8}억원)`);
  return { before, after };
}

function filterBioInline() {
  console.log('bio: regenerating inline with mcap floor…');
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
    indexHtml = indexHtml.replace(/\d+개 상장사 · IDM/, `${hubLines.semi}개 상장사 · IDM`);
    indexHtml = indexHtml.replace(/\d+ listings · IDM, fabless/, `${hubLines.semi} listings · IDM, fabless`);
  }
  if (hubLines.bio) {
    indexHtml = indexHtml.replace(/\d+개 매핑 · 바이오시밀러/, `${hubLines.bio}개 매핑 · 바이오시밀러`);
    indexHtml = indexHtml.replace(/\d+ mappings · biosimilars/, `${hubLines.bio} mappings · biosimilars`);
  }
  if (hubLines.ship) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 조선소/, `${hubLines.ship}개 상장사 · 조선소`);
    indexHtml = indexHtml.replace(/\d+ listings · yards/, `${hubLines.ship} listings · yards`);
  }
  if (hubLines.defense) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 항공/, `${hubLines.defense}개 상장사 · 항공`);
    indexHtml = indexHtml.replace(/\d+ listings · aviation/, `${hubLines.defense} listings · aviation`);
  }
  if (hubLines.robot) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · FA/, `${hubLines.robot}개 상장사 · FA`);
    indexHtml = indexHtml.replace(/\d+ listings · FA, AMR/, `${hubLines.robot} listings · FA, AMR`);
  }
  if (hubLines.energy) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 2차전지/, `${hubLines.energy}개 상장사 · 2차전지`);
    indexHtml = indexHtml.replace(/\d+ listings · batteries/, `${hubLines.energy} listings · batteries`);
  }
  if (hubLines.kculture) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 식품/, `${hubLines.kculture}개 상장사 · 식품`);
    indexHtml = indexHtml.replace(/\d+ listings · food/, `${hubLines.kculture} listings · food`);
  }
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('index.html hub counts updated');
}

function main() {
  console.log(`Applying market-cap floor: ${MIN_MCAP_WON.toLocaleString('ko-KR')} won (5천억원)`);
  const counts = {};
  for (const rel of HTML_MAPS) {
    const key = rel.split('/')[0];
    const sectorKey = {
      semiconductor: 'semi',
      ship: 'ship',
      defense: 'defense',
      robot: 'robot',
      energy: 'energy',
      kculture: 'kculture',
    }[key];
    const r = filterHtmlMap(rel);
    if (sectorKey) counts[sectorKey] = r.after;
  }
  counts.bio = filterBioInline();
  execSync('node scripts/build_hub_index.mjs', { cwd: ROOT, stdio: 'inherit' });
  patchIndexHubCounts(counts);
}
main();
