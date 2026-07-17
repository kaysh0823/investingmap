/**
 * Merges cp_list/*.md universe into all eight industry map pages.
 * Preserves existing company metadata; adds new KRX-listed tickers with stub fields.
 *
 * Usage: node scripts/apply_cp_list_to_maps.mjs [cp_list_dir]
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadCpListUniverse, countByIndustry } from '../lib/cp_list_universe.mjs';
import {
  esc,
  fmtMcap,
  mcapTier,
  serializeCompanies,
  extractCompaniesFromHtml,
  extractChainColors,
  slugId,
  patchKoreanCompaniesHtml,
  countKoreanTickersInHtml,
} from '../lib/map_company_serialize.mjs';
import { inferChain, bioSectorIdForChain } from '../lib/cp_list_chain_infer.mjs';
import { enrichCompanyList } from '../lib/company_field_enrich.mjs';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from '../lib/krx_per_pbr.mjs';
import {
  loadMergedKrxMap,
  loadListedEnglish3557Map,
  mergeListedEnglishIntoCompanies,
  formatListedEnglishName,
} from '../lib/krx_data_sources.mjs';
import { passesMcapFloor, filterCompaniesByMcap } from '../lib/mcap_policy.mjs';
import { allowedInSector, filterCompaniesForSector } from '../lib/sector_exclusive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cpListDir = process.argv[2] || join(root, '..', 'cp_list');

function makeStub(ticker, entry, industryKey, chains, krx, meta3557, idPrefix) {
  const row = krx.get(ticker);
  if (!row) return null;
  if (!passesMcapFloor({ mcapWon: row.mcap })) return null;

  const chain = inferChain(entry.subSector, industryKey, chains);
  const rawNameEn = meta3557.get(ticker)?.nameEn || entry.nameKo || row.name;
  const nameEn = formatListedEnglishName(rawNameEn);
  const sub = entry.subSector || '—';
  const id = slugId(ticker, nameEn, idPrefix);

  const stub = {
    id,
    name: row.name || entry.nameKo,
    nameEn,
    ticker,
    market: row.market || entry.market || 'KOSDAQ',
    chain,
    semType: sub,
    semTypeEn: sub,
    products: '—',
    productsEn: '—',
    revenue: fmtMcap(row.mcap),
    mcapWon: row.mcap,
    per: null,
    pbr: null,
    revTier: mcapTier(row.mcap),
    partners: [],
  };

  if (industryKey === 'bio') {
    stub.sectorId = bioSectorIdForChain(chain);
    stub.extraChains = [];
  }

  return stub;
}

function applyKrxFields(companies, krx, meta3557) {
  let kospi = 0;
  let kosdaq = 0;
  for (const c of companies) {
    const row = krx.get(c.ticker);
    if (row) {
      c.market = row.market;
      c.mcapWon = row.mcap;
      c.revenue = fmtMcap(row.mcap);
      c.revTier = mcapTier(row.mcap);
      if (row.name) c.name = row.name;
    }
    const meta = meta3557?.get(c.ticker);
    if (meta?.nameEn) {
      const curated = c.nameEn && /\s/.test(c.nameEn) && c.nameEn !== meta.nameEn;
      if (!curated) c.nameEn = formatListedEnglishName(meta.nameEn);
    }
    if (meta?.nameKo && (!c.name || c.name.includes('\uFFFD'))) c.name = meta.nameKo;
    if (c.market === 'KOSPI') kospi++;
    else if (c.market === 'KOSDAQ') kosdaq++;
  }
  return { kospi, kosdaq };
}

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

const HTML_MAPS = [
  {
    key: 'semi',
    path: 'semiconductor/korea_semiconductor_map.html',
    idPrefix: '',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listed companies',
  },
  {
    key: 'ship',
    path: 'ship/korea_ship_map.html',
    idPrefix: 'ship',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'defense',
    path: 'defense/korea_defense_map.html',
    idPrefix: 'def',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'robot',
    path: 'robot/korea_robot_map.html',
    idPrefix: 'robot',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'auto',
    path: 'auto/korea_auto_map.html',
    idPrefix: 'auto',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'medtech',
    path: 'medtech/korea_medtech_map.html',
    idPrefix: 'medtech',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  // Legacy /energy/ is an explainer page. Energy cp_list candidates are merged
  // by scripts/split_energy_clean_sectors.mjs into battery/ESS/renewable/nuclear.
  {
    key: 'powergrid',
    path: 'powergrid/korea_powergrid_map.html',
    idPrefix: 'powergrid',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'finance',
    path: 'finance/korea_finance_map.html',
    idPrefix: 'finance',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'construction',
    path: 'construction/korea_construction_map.html',
    idPrefix: 'construction',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
  {
    key: 'kcontent',
    path: 'kcontent/korea_kcontent_map.html',
    idPrefix: 'kct',
    badgeKo: '\uC0C1\uC7A5\uAE30\uC5C5',
    badgeEn: 'listings',
  },
];
// Note: kconsume is curated on the map page (not auto-merged from cp_list K-culture blob).

function mergeIndustryMap(existing, cpTickers, industryKey, chains, krx, meta3557, idPrefix) {
  const byTicker = new Map(
    filterCompaniesForSector(existing, industryKey).map((c) => [c.ticker, c]),
  );
  let added = 0;
  let skipped = 0;

  for (const [ticker, entry] of cpTickers) {
    if (!allowedInSector(ticker, industryKey)) continue;
    if (byTicker.has(ticker)) continue;
    const stub = makeStub(ticker, entry, industryKey, chains, krx, meta3557, idPrefix);
    if (!stub) {
      skipped++;
      continue;
    }
    byTicker.set(ticker, stub);
    added++;
  }

  const merged = filterCompaniesByMcap([...byTicker.values()]).sort(
    (a, b) => (b.mcapWon || 0) - (a.mcapWon || 0),
  );
  return { merged, added, skipped };
}

function collectJsxBioTickers() {
  const jsx = JSON.parse(fs.readFileSync(join(root, 'bio', 'bio_data_from_jsx.json'), 'utf8'));
  const tickers = new Set();
  for (const sec of jsx) {
    for (const d of sec.domestic || []) {
      if (d.ticker && d.ticker !== 'UNLISTED') tickers.add(String(d.ticker).trim());
    }
  }
  return tickers;
}

function main() {
  console.log('cp_list dir:', cpListDir);
  const universe = loadCpListUniverse(cpListDir);
  console.log('cp_list counts:', countByIndustry(universe));

  const dataDir = join(root, 'data');
  const krx = loadMergedKrxMap(dataDir);
  const perPbr = loadPerPbrMap(dataDir);
  const meta3557 = loadListedEnglish3557Map(dataDir);

  const results = {};

  for (const cfg of HTML_MAPS) {
    const cpMap = universe.get(cfg.key);
    if (!cpMap) {
      console.warn('No cp_list data for', cfg.key);
      continue;
    }

    const htmlPath = join(root, cfg.path);
    let html = fs.readFileSync(htmlPath, 'utf8');
    const existing = extractCompaniesFromHtml(html);
    const chains = extractChainColors(html);
    const before = existing.length;

    const { merged, added, skipped } = mergeIndustryMap(
      existing,
      cpMap,
      cfg.key,
      chains,
      krx,
      meta3557,
      cfg.idPrefix,
    );

    mergePerPbrIntoCompanies(merged, perPbr);
    mergeListedEnglishIntoCompanies(merged, meta3557);
    const { kospi, kosdaq } = applyKrxFields(merged, krx, meta3557);
    enrichCompanyList(merged, cfg.key, cpListDir);
    const n = merged.length;

    html = patchKoreanCompaniesHtml(html, merged);
    html = patchMapBadges(html, n, kospi, kosdaq, cfg.badgeKo, cfg.badgeEn);
    fs.writeFileSync(htmlPath, html, 'utf8');

    const written = countKoreanTickersInHtml(fs.readFileSync(htmlPath, 'utf8'));
    if (written !== n) {
      throw new Error(`${cfg.path}: wrote ${written} tickers, expected ${n}`);
    }

    results[cfg.key] = { before, after: n, added, skipped };
    console.log(`${cfg.path}: ${before} → ${n} (+${added}, skipped not-in-KRX ${skipped})`);
  }

  // Bio: write additions JSON for gen_korea_bio_inline.mjs
  const bioCp = universe.get('bio');
  const jsxTickers = collectJsxBioTickers();
  const bioChains = [
    '바이오시밀러',
    'CDMO / CMO',
    '항체신약 / ADC',
    '면역항암제',
    '비만 / 대사질환',
    '세포 · 유전자치료제',
    '플랫폼 기술',
    '합성신약 / 제네릭',
    '체외진단 (IVD)',
    '의료기기 / 디지털헬스',
  ];
  const bioAdditions = [];
  let bioSkipped = 0;
  if (bioCp) {
    for (const [ticker, entry] of bioCp) {
      if (!allowedInSector(ticker, 'bio')) continue;
      if (jsxTickers.has(ticker)) continue;
      if (!krx.has(ticker)) {
        bioSkipped++;
        continue;
      }
      if (!passesMcapFloor({ mcapWon: krx.get(ticker)?.mcap })) continue;
      const chain = inferChain(entry.subSector, 'bio', bioChains);
      bioAdditions.push({
        ticker,
        name: krx.get(ticker)?.name || entry.nameKo,
        chain,
        sectorId: bioSectorIdForChain(chain),
        subSector: entry.subSector || '',
        level: entry.level || '',
      });
    }
    bioAdditions.sort((a, b) => (krx.get(b.ticker)?.mcap || 0) - (krx.get(a.ticker)?.mcap || 0));
  }

  const bioAddPath = join(root, 'bio', 'cp_list_bio_additions.json');
  fs.writeFileSync(bioAddPath, JSON.stringify(bioAdditions, null, 2) + '\n', 'utf8');
  console.log(`bio/cp_list_bio_additions.json: ${bioAdditions.length} new (skipped ${bioSkipped} not-in-KRX)`);

  execSync('node bio/gen_korea_bio_inline.mjs', { cwd: root, stdio: 'inherit' });

  const inline = fs.readFileSync(join(root, 'bio', 'korea_bio_map.inline.js'), 'utf8');
  const bioCount = (inline.match(/"ticker":/g) || []).length;
  results.bio = { additions: bioAdditions.length, total: bioCount };

  // Patch index.html hub card counts
  const indexPath = join(root, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const hubLines = {
    semi: results.semi?.after,
    bio: bioCount,
    ship: results.ship?.after,
    defense: results.defense?.after,
    robot: results.robot?.after,
    auto: results.auto?.after,
    medtech: results.medtech?.after,
    energy: results.energy?.after,
    powergrid: results.powergrid?.after,
    finance: results.finance?.after,
    construction: results.construction?.after,
    kconsume: results.kconsume?.after,
    kcontent: results.kcontent?.after,
  };

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
  if (hubLines.auto) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 완성차/, `${hubLines.auto}개 상장사 · 완성차`);
    indexHtml = indexHtml.replace(/\d+ listings · OEM/, `${hubLines.auto} listings · OEM`);
  }
  if (hubLines.medtech) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 진단/, `${hubLines.medtech}개 상장사 · 진단`);
    indexHtml = indexHtml.replace(/\d+ listings · Diagnostics/, `${hubLines.medtech} listings · Diagnostics`);
  }
  if (hubLines.energy) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 2차전지/, `${hubLines.energy}개 상장사 · 2차전지`);
    indexHtml = indexHtml.replace(/\d+ listings · batteries/, `${hubLines.energy} listings · batteries`);
  }
  if (hubLines.powergrid) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 전력설비/, `${hubLines.powergrid}개 상장사 · 전력설비`);
    indexHtml = indexHtml.replace(/\d+ listings · power equipment/, `${hubLines.powergrid} listings · power equipment`);
  }
  if (hubLines.finance) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 은행/, `${hubLines.finance}개 상장사 · 은행`);
    indexHtml = indexHtml.replace(/\d+ listings · banks/, `${hubLines.finance} listings · banks`);
  }
  if (hubLines.construction) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 종합건설/, `${hubLines.construction}개 상장사 · 종합건설`);
    indexHtml = indexHtml.replace(/\d+ listings · contractors/, `${hubLines.construction} listings · contractors`);
  }
  if (hubLines.kconsume) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 패션/, `${hubLines.kconsume}개 상장사 · 패션`);
    indexHtml = indexHtml.replace(/\d+ companies · fashion/, `${hubLines.kconsume} companies · fashion`);
  }
  if (hubLines.cosmetics) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 브랜드/, `${hubLines.cosmetics}개 상장사 · 브랜드`);
    indexHtml = indexHtml.replace(/\d+ listings · brands/, `${hubLines.cosmetics} listings · brands`);
  }
  if (hubLines.kcontent) {
    indexHtml = indexHtml.replace(/\d+개 상장사 · 게임/, `${hubLines.kcontent}개 상장사 · 게임`);
    indexHtml = indexHtml.replace(/\d+ companies · games/, `${hubLines.kcontent} companies · games`);
  }
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('index.html hub counts updated');

  console.log('\nSummary:', JSON.stringify(results, null, 2));
}

main();
