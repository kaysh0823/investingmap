/**
 * Enforce one-sector-only tickers across industry maps (HTML + bio sources).
 * Usage: node scripts/apply_sector_exclusive.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';
import { filterCompaniesForSector } from '../lib/sector_exclusive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HTML_MAPS = [
  { key: 'semi', path: 'semiconductor/korea_semiconductor_map.html', badgeKo: '상장기업', badgeEn: 'listed companies' },
  { key: 'ship', path: 'ship/korea_ship_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
  { key: 'defense', path: 'defense/korea_defense_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
  { key: 'robot', path: 'robot/korea_robot_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
  { key: 'energy', path: 'energy/korea_energy_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
  { key: 'powergrid', path: 'powergrid/korea_powergrid_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
  { key: 'finance', path: 'finance/korea_finance_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
  { key: 'kculture', path: 'kculture/korea_kculture_map.html', badgeKo: '상장기업', badgeEn: 'listings' },
];

function patchMapBadges(html, n, kospi, kosdaq, badgeKo, badgeEn) {
  html = html.replace(
    /badgeTotal: '\uCD1D <span>\d+<\/span>\uAC1C [^']+'/,
    `badgeTotal: '\uCD1D <span>${n}</span>\uAC1C ${badgeKo}'`,
  );
  html = html.replace(
    /badgeTotal: '<span>\d+<\/span> [^']+'/,
    `badgeTotal: '<span>${n}</span> ${badgeEn}'`,
  );
  html = html.replace(
    /badgeMarket: 'KOSPI <span>\d+<\/span>\uC0AC \u00B7 KOSDAQ <span>\d+<\/span>\uC0AC'/,
    `badgeMarket: 'KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC'`,
  );
  html = html.replace(
    /badgeMarket: 'KOSPI <span>\d+<\/span> \u00B7 KOSDAQ <span>\d+<\/span>'/,
    `badgeMarket: 'KOSPI <span>${kospi}</span> \u00B7 KOSDAQ <span>${kosdaq}</span>'`,
  );
  html = html.replace(
    /<div class="badge" id="badge-total">\uCD1D <span>\d+<\/span>\uAC1C [^<]+<\/div>/,
    `<div class="badge" id="badge-total">\uCD1D <span>${n}</span>\uAC1C ${badgeKo}</div>`,
  );
  html = html.replace(
    /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>\uC0AC \u00B7 KOSDAQ <span>\d+<\/span>\uC0AC<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC</div>`,
  );
  html = html.replace(
    /<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">\d+<\/span>\uAC1C<\/div>/,
    `<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">${n}</span>\uAC1C</div>`,
  );
  return html;
}

function countMarkets(companies) {
  let kospi = 0;
  let kosdaq = 0;
  for (const c of companies) {
    if (c.market === 'KOSPI') kospi++;
    else if (c.market === 'KOSDAQ') kosdaq++;
  }
  return { kospi, kosdaq };
}

function applyHtmlMap(cfg) {
  const htmlPath = join(ROOT, cfg.path);
  let html = fs.readFileSync(htmlPath, 'utf8');
  const existing = extractCompaniesFromHtml(html);
  const filtered = filterCompaniesForSector(existing, cfg.key).sort(
    (a, b) => (b.mcapWon || 0) - (a.mcapWon || 0),
  );
  const removed = existing.length - filtered.length;
  if (removed === 0) {
    console.log(`${cfg.path}: unchanged (${existing.length})`);
    return;
  }
  const { kospi, kosdaq } = countMarkets(filtered);
  html = patchKoreanCompaniesHtml(html, filtered);
  html = patchMapBadges(html, filtered.length, kospi, kosdaq, cfg.badgeKo, cfg.badgeEn);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`${cfg.path}: ${existing.length} → ${filtered.length} (−${removed})`);
}

function applyBioJsx() {
  const path = join(ROOT, 'bio', 'bio_data_from_jsx.json');
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let removed = 0;
  for (const sec of data) {
    const before = (sec.domestic || []).length;
    sec.domestic = (sec.domestic || []).filter((d) => {
      const t = d.ticker && d.ticker !== 'UNLISTED' ? String(d.ticker).trim() : null;
      if (!t) return true;
      return filterCompaniesForSector([{ ticker: t }], 'bio').length > 0;
    });
    removed += before - sec.domestic.length;
  }
  if (removed) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
  console.log(`bio/bio_data_from_jsx.json: removed ${removed} domestic entries`);
}

function applyBioAdditions() {
  const path = join(ROOT, 'bio', 'cp_list_bio_additions.json');
  if (!fs.existsSync(path)) return;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const before = data.length;
  const filtered = data.filter((d) => filterCompaniesForSector([{ ticker: d.ticker }], 'bio').length > 0);
  if (filtered.length !== before) {
    fs.writeFileSync(path, JSON.stringify(filtered, null, 2) + '\n', 'utf8');
  }
  console.log(`bio/cp_list_bio_additions.json: ${before} → ${filtered.length}`);
}

function main() {
  for (const cfg of HTML_MAPS) applyHtmlMap(cfg);
  applyBioJsx();
  applyBioAdditions();
  console.log('OK apply_sector_exclusive');
}

main();
