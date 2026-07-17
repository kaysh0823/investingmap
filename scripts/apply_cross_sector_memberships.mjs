/**
 * Add explicit cross-sector memberships to industry maps.
 * First case: Hugel (145020) + Caregen (214370) → cosmetics 미용기기 (bio retained).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map } from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';
import { crossSectors } from '../lib/sector_exclusive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COS_HTML = path.join(ROOT, 'cosmetics', 'korea_cosmetics_map.html');
const BIO_INLINE = path.join(ROOT, 'bio', 'korea_bio_map.inline.js');

const CROSS_TO_COSMETICS = {
  '145020': {
    chain: '미용기기',
    semType: '보툴리눔·필러 K-뷰티',
    semTypeEn: 'Botulinum & filler aesthetics',
    products: "보툴렉스·더채움 K-뷰티 대표, 美시장 고농도제형 3상 '26 착수",
    productsEn: 'Botulax & The Chaeum — K-beauty aesthetics leader',
  },
  '214370': {
    chain: '미용기기',
    semType: '펩타이드·헬스케어',
    semTypeEn: 'Peptide aesthetics',
    products: '펩타이드 기반 미용·헬스케어',
    productsEn: 'Peptide-based aesthetics and healthcare',
  },
};

function pad(t) {
  return String(t).padStart(6, '0');
}

function readBioSource(ticker) {
  if (!fs.existsSync(BIO_INLINE)) return null;
  const companies = extractCompaniesFromHtml(fs.readFileSync(BIO_INLINE, 'utf8'));
  return companies.find((c) => pad(c.ticker) === pad(ticker)) || null;
}

function patchCosmetics() {
  let html = fs.readFileSync(COS_HTML, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  const krx = loadMergedKrxMap(path.join(ROOT, 'data'));
  const meta3557 = loadListedEnglish3557Map(path.join(ROOT, 'data'));
  const perPbr = loadPerPbrMap(path.join(ROOT, 'data'));
  const existing = new Set(companies.map((c) => pad(c.ticker)));
  let added = 0;

  for (const [ticker, cfg] of Object.entries(CROSS_TO_COSMETICS)) {
    if (!crossSectors(ticker)?.includes('cosmetics')) continue;
    if (existing.has(pad(ticker))) continue;
    const bio = readBioSource(ticker);
    const row = krx.get(pad(ticker));
    const en = meta3557?.get(pad(ticker));
    const fin = perPbr.get(pad(ticker));
    const entry = {
      id: `cos_${pad(ticker)}`,
      name: bio?.name || row?.name || ticker,
      nameEn: bio?.nameEn || en?.nameEn || row?.nameEn || ticker,
      ticker: pad(ticker),
      market: bio?.market || row?.market || 'KOSDAQ',
      chain: cfg.chain,
      semType: cfg.semType,
      semTypeEn: cfg.semTypeEn,
      products: cfg.products,
      productsEn: cfg.productsEn,
      revenue: bio?.revenue || '—',
      mcapWon: bio?.mcapWon || row?.mcap || 0,
      per: bio?.per ?? fin?.per ?? null,
      pbr: bio?.pbr ?? fin?.pbr ?? null,
      revTier: bio?.revTier ?? 2,
      partners: bio?.partners || [],
    };
    companies.push(entry);
    existing.add(pad(ticker));
    added++;
    console.log(`cosmetics: +${pad(ticker)} ${entry.name} (${cfg.chain})`);
  }

  if (!added) {
    console.log('cosmetics: cross-sector tickers already present');
    return;
  }

  companies.sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  html = patchKoreanCompaniesHtml(html, companies);

  const n = companies.length;
  const kospi = companies.filter((c) => c.market === 'KOSPI').length;
  const kosdaq = companies.filter((c) => c.market === 'KOSDAQ').length;
  html = html.replace(
    /badgeTotal: '\uCD1D <span>\d+<\/span>\uAC1C [^']+'/,
    `badgeTotal: '\uCD1D <span>${n}</span>\uAC1C \uAE30\uC5C5'`,
  );
  html = html.replace(
    /badgeTotal: '<span>\d+<\/span> [^']+'/,
    `badgeTotal: '<span>${n}</span> companies'`,
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
    `<div class="badge" id="badge-total">\uCD1D <span>${n}</span>\uAC1C \uAE30\uC5C5</div>`,
  );
  html = html.replace(
    /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>\uC0AC \u00B7 KOSDAQ <span>\d+<\/span>\uC0AC<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC</div>`,
  );

  fs.writeFileSync(COS_HTML, html, 'utf8');
  console.log(`cosmetics: ${n} companies total (+${added})`);
}

function main() {
  patchCosmetics();
  console.log('OK apply_cross_sector_memberships');
}

main();
