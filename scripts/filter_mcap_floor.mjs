/**
 * Remove companies below MIN_MCAP_WON (3천억원) from industry maps and bio inline data.
 * Refreshes mcapWon from latest KRX CSV (data_4937_* / data_4848_*) before filtering.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
  countKoreanTickersInHtml,
  fmtMcap,
  mcapTier,
} from '../lib/map_company_serialize.mjs';
import { filterCompaniesByMcap, passesMcapFloor, MIN_MCAP_WON } from '../lib/mcap_policy.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');

const HTML_MAPS = [
  'bigchip/korea_bigchip_map.html',
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
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
];

function padTicker(t) {
  return String(t || '').trim().padStart(6, '0');
}

/** Overlay latest KRX mcap (and display fields) before floor filter. */
function applyKrxMcapToCompanies(companies, krx) {
  for (const c of companies) {
    const ticker = padTicker(c.ticker);
    if (!ticker || ticker === 'UNLISTED') continue;
    const r = krx.get(ticker);
    if (r && r.mcap > 0) {
      c.mcapWon = r.mcap;
      c.revenue = fmtMcap(r.mcap);
      c.revTier = mcapTier(r.mcap);
      if (r.market) c.market = r.market;
      if (r.name) c.name = r.name;
    }
  }
  return companies;
}

function extractGlobalCompaniesFromHtml(html) {
  const m = html.match(/const globalCompanies = (\[[\s\S]*?\n    \]);/);
  if (!m) return null;
  return Function('"use strict"; return ' + m[1])();
}

function patchGlobalCompaniesHtml(html, globals) {
  const serialized = JSON.stringify(globals, null, 2).replace(/\n/g, '\n    ');
  return html.replace(
    /const globalCompanies = \[[\s\S]*?\n    \];/,
    `const globalCompanies = ${serialized};`,
  );
}

/** bigchip relation map: drop KR-listed globals below floor; prune partner refs. */
function filterBigchipGlobalCompanies(html, companies, krx) {
  const globals = extractGlobalCompaniesFromHtml(html);
  if (!globals) return html;

  const kept = [];
  const droppedIds = new Set();
  for (const g of globals) {
    const ticker = g.ticker ? padTicker(g.ticker) : '';
    if (ticker) {
      const r = krx.get(ticker);
      if (r && r.mcap > 0) {
        g.mcapWon = r.mcap;
        g.revTier = mcapTier(r.mcap);
        if (r.market) g.market = r.market;
      }
      if (!passesMcapFloor({ mcapWon: g.mcapWon || r?.mcap || 0 })) {
        droppedIds.add(g.id);
        continue;
      }
    }
    kept.push(g);
  }

  if (droppedIds.size) {
    for (const c of companies) {
      if (!Array.isArray(c.partners)) continue;
      c.partners = c.partners.filter((p) => {
        const id = typeof p === 'string' ? p : p?.id;
        return id && !droppedIds.has(id);
      });
    }
    console.log(`  bigchip globals removed (mcap floor): ${[...droppedIds].join(', ')}`);
  }

  return patchGlobalCompaniesHtml(html, kept);
}

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

function filterHtmlMap(rel, krx) {
  const fp = path.join(ROOT, rel);
  let html = fs.readFileSync(fp, 'utf8');
  const before = extractCompaniesFromHtml(html).length;
  const companies = extractCompaniesFromHtml(html);
  applyKrxMcapToCompanies(companies, krx);
  const filtered = filterCompaniesByMcap(companies);
  const { kospi, kosdaq } = countMarkets(filtered);
  html = patchKoreanCompaniesHtml(html, filtered);
  if (rel.startsWith('bigchip/')) {
    html = filterBigchipGlobalCompanies(html, filtered, krx);
    html = patchKoreanCompaniesHtml(html, filtered);
  }
  html = patchMapBadges(html, filtered.length, kospi, kosdaq);
  fs.writeFileSync(fp, html, 'utf8');
  const after = countKoreanTickersInHtml(fs.readFileSync(fp, 'utf8'));
  console.log(`${rel}: ${before} \u2192 ${after} (floor ${MIN_MCAP_WON / 1e8}\uc5b5, KRX refresh)`);
  return { before, after };
}

function filterBioInline(krx) {
  console.log('bio: regenerating inline with mcap floor\u2026');
  execSync('node bio/gen_korea_bio_inline.mjs', { cwd: ROOT, stdio: 'inherit' });
  const inlinePath = path.join(ROOT, 'bio/korea_bio_map.inline.js');
  let inline = fs.readFileSync(inlinePath, 'utf8');
  const m = inline.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('bio inline: koreanCompanies block not found');
  const companies = Function(`"use strict"; return (${m[1]});`)();
  const before = companies.length;
  applyKrxMcapToCompanies(companies, krx);
  const filtered = filterCompaniesByMcap(companies);
  filtered.forEach((c, i) => {
    c.id = `bio_${i}`;
  });
  inline = inline.replace(
    /const koreanCompanies = \[[\s\S]*?\];/,
    `const koreanCompanies = ${JSON.stringify(filtered)};`,
  );
  fs.writeFileSync(inlinePath, inline, 'utf8');
  console.log(`bio/korea_bio_map.inline.js: ${before} \u2192 ${filtered.length} companies (KRX refresh)`);
  return filtered.length;
}

function patchIndexHubCounts(hubLines) {
  const indexPath = path.join(ROOT, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (hubLines.semi) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 IDM/g, `${hubLines.semi}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 IDM`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 IDM, fabless/g, `${hubLines.semi} listings \u00b7 IDM, fabless`);
  }
  if (hubLines.bio) {
    indexHtml = indexHtml.replace(/\d+\uac1c \ub9e4\ud551 \u00b7 \ubc14\uc774\uc624\uc2dc\ubc00\ub7ec/g, `${hubLines.bio}\uac1c \ub9e4\ud551 \u00b7 \ubc14\uc774\uc624\uc2dc\ubc00\ub7ec`);
    indexHtml = indexHtml.replace(/\d+ mappings \u00b7 biosimilars/g, `${hubLines.bio} mappings \u00b7 biosimilars`);
  }
  if (hubLines.ship) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc870\uc120\uc18c/g, `${hubLines.ship}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc870\uc120\uc18c`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 yards/g, `${hubLines.ship} listings \u00b7 yards`);
  }
  if (hubLines.defense) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud56d\uacf5/g, `${hubLines.defense}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud56d\uacf5`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 aviation/g, `${hubLines.defense} listings \u00b7 aviation`);
  }
  if (hubLines.robot) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 FA/g, `${hubLines.robot}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 FA`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 FA, AMR/g, `${hubLines.robot} listings \u00b7 FA, AMR`);
  }
  if (hubLines.auto) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc644\uc131\ucc28/g, `${hubLines.auto}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc644\uc131\ucc28`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 OEM/g, `${hubLines.auto} listings \u00b7 OEM`);
  }
  if (hubLines.medtech) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc9c4\ub2e8/g, `${hubLines.medtech}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc9c4\ub2e8`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 Diagnostics/g, `${hubLines.medtech} listings \u00b7 Diagnostics`);
  }
  if (hubLines.battery) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 2\ucc28\uc804\uc9c0/g, `${hubLines.battery}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 2\ucc28\uc804\uc9c0`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 cells, materials, equipment, parts/g, `${hubLines.battery} listings \u00b7 cells, materials, equipment, parts`);
  }
  if (hubLines.renewable) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud0dc\uc591\uad11/g, `${hubLines.renewable}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud0dc\uc591\uad11`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 solar/g, `${hubLines.renewable} listings \u00b7 solar`);
  }
  if (hubLines.nuclear) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc6d0\uc804/g, `${hubLines.nuclear}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc6d0\uc804`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 nuclear/g, `${hubLines.nuclear} listings \u00b7 nuclear`);
  }
  if (hubLines.powergrid) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc804\ub825\uc124\ube44/g, `${hubLines.powergrid}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc804\ub825\uc124\ube44`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 power equipment/g, `${hubLines.powergrid} listings \u00b7 power equipment`);
  }
  if (hubLines.finance) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc740\ud589/g, `${hubLines.finance}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc740\ud589`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 banks/g, `${hubLines.finance} listings \u00b7 banks`);
  }
  if (hubLines.construction) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc885\ud569\uac74\uc124/g, `${hubLines.construction}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uc885\ud569\uac74\uc124`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 contractors/g, `${hubLines.construction} listings \u00b7 contractors`);
  }
  if (hubLines.kconsume) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud328\uc158/g, `${hubLines.kconsume}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ud328\uc158`);
    indexHtml = indexHtml.replace(/\d+ companies \u00b7 beauty/g, `${hubLines.kconsume} companies \u00b7 fashion`);
    indexHtml = indexHtml.replace(/\d+ companies \u00b7 fashion/g, `${hubLines.kconsume} companies \u00b7 fashion`);
  }
  if (hubLines.cosmetics) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ube0c\ub79c\ub4dc/g, `${hubLines.cosmetics}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \ube0c\ub79c\ub4dc`);
    indexHtml = indexHtml.replace(/\d+ listings \u00b7 brands/g, `${hubLines.cosmetics} listings \u00b7 brands`);
  }
  if (hubLines.kcontent) {
    indexHtml = indexHtml.replace(/\d+\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uac8c\uc784/g, `${hubLines.kcontent}\uac1c \uc0c1\uc7a5\uc0ac \u00b7 \uac8c\uc784`);
    indexHtml = indexHtml.replace(/\d+ companies \u00b7 games/g, `${hubLines.kcontent} companies \u00b7 games`);
  }
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('index.html hub counts updated');
}

function main() {
  const krx = loadMergedKrxMap(DATA_DIR);
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
      cosmetics: 'cosmetics',
      kcontent: 'kcontent',
    }[key];
    const r = filterHtmlMap(rel, krx);
    if (sectorKey) counts[sectorKey] = r.after;
  }
  counts.bio = filterBioInline(krx);
  execSync('node scripts/build_hub_index.mjs', { cwd: ROOT, stdio: 'inherit' });
  patchIndexHubCounts(counts);
}
main();
