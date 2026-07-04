/**
 * Builds korea_bio_map.inline.js from:
 *   - bio_data_from_jsx.json (re-extract from biomap.jsx when sectors/companies change)
 *   - bio_translations.json
 *   - bio_ticker_en.json (English display names)
 *   - bio_inline_tail.js (browser UI logic)
 * KRX market cap: data_4937 / data_4848 (2026-06-12) tickers in this script.
 * PER / PBR: data_5016_*.csv via ../lib/krx_per_pbr.mjs.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from '../lib/krx_per_pbr.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map, mergeListedEnglishIntoCompanies } from '../lib/krx_data_sources.mjs';
import { enrichBioCompanies } from '../lib/company_field_enrich.mjs';
import { filterCompaniesByMcap, passesMcapFloor } from '../lib/mcap_policy.mjs';
import { allowedInSector, filterCompaniesForSector } from '../lib/sector_exclusive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MKT_CAP_KRW = {
  '068270': 38342571972000, '0126Z0': 11110281378500, '068760': 1904860042800, '950210': 418269238800,
  '207940': 59946781545000, '302440': 3075496877600, '237690': 2545803036000, '053030': 259512452720,
  '298380': 5100457879300, '196170': 18058597591000, '141080': 4782908805600, '475830': 1460754767500,
  '287840': 335740806000, '0009K0': 1759055579200, '424870': 385168975180, '000100': 6148794797200,
  '028300': 6140438080300, '310210': 3560820088500, '095700': 136849184470, '083790': 68358927798,
  '314130': 241422579000, '128940': 5265317301000, '087010': 5362990500000, '347850': 3832862862500,
  '000250': 6134128928000, '950160': 8693918730000, '085660': 1104517410480, '078160': 400278996630,
  '199800': 402643897750, '011000': 83430508626, '226950': 2338627161600, '185490': 61905050688,
  '326030': 6883734675000, '069620': 1391547657500, '185750': 977236824000, '006280': 1477178403200,
  '001060': 629884406500, '009420': 2690392857000, '170900': 359442912050, '096530': 1464939131700,
  '137310': 863356079300, '253840': 80869656000, '206640': 228061457610, '145020': 3008336068500,
  '214450': 3002608272000, '214150': 2867107213050, '328130': 1097887707360, '338220': 130216953900,
  '041830': 597877116700, '228670': 70692894920, '049950': 107490005960
};

const KOSPI_TICKERS = new Set([
  '001060', '302440', '326030', '006280', '069620', '170900', '207940', '0126Z0', '068270', '137310',
  '000100', '185750', '011000', '950210', '128940', '009420'
]);

function flagMeta(flag) {
  if (!flag) return { region: 'us', country: 'Global' };
  const key = [...flag].map(c => c.codePointAt(0).toString(16)).join('-');
  const M = {
    '1f1e8-1f1ed': { region: 'eu', country: 'Switzerland' },
    '1f1fa-1f1f8': { region: 'us', country: 'USA' },
    '1f1ee-1f1f1': { region: 'il', country: 'Israel' },
    '1f1e8-1f1f3': { region: 'cn', country: 'China' },
    '1f1f0-1f1f7': { region: 'kr', country: 'Korea' },
    '1f1ef-1f1f5': { region: 'jp', country: 'Japan' },
    '1f1ec-1f1e7': { region: 'gb', country: 'UK' },
    '1f1e9-1f1f0': { region: 'dk', country: 'Denmark' },
    '1f1e9-1f1ea': { region: 'eu', country: 'Germany' }
  };
  return M[key] || { region: 'us', country: 'Global' };
}

function fmtMcap(won) {
  if (won == null || won === 0) return '\u2014';
  return (won / 1e12).toFixed(2) + '\uC870\uC6D0';
}

function mcapTier(won) {
  if (!won) return 1;
  if (won >= 15e12) return 3;
  if (won >= 1e12) return 2;
  return 1;
}

function globalId(g) {
  let raw = (g.ticker || '').toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!raw) raw = (g.name || 'x').toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 28);
  return 'glob_' + (raw || 'ph');
}

function normalizeSector(sec) {
  const globals = (sec.global || []).map(g => {
    const fm = flagMeta(g.flag);
    return {
      id: globalId(g),
      name: g.name,
      nameEn: g.name,
      country: fm.country,
      region: fm.region,
      sector: (g.note || '').slice(0, 48)
    };
  });
  return {
    id: sec.id,
    sector: sec.sector,
    sectorEn: sec.sectorEn,
    color: sec.color,
    description: sec.description,
    domestic: sec.domestic,
    global: globals
  };
}

function flattenCompanies(bioSectors, nameEnMap) {
  const list = [];
  const byKey = new Map();

  for (const sec of bioSectors) {
    for (const d of sec.domestic) {
      let ticker = d.ticker;
      if (!/^([0-9]{6}|[0-9]{4}[A-Z0-9]{2}|[0-9]{5}[A-Z0-9])$/.test(String(ticker))) ticker = 'UNLISTED';
      const key = ticker === 'UNLISTED' ? `UNLISTED:${d.name}` : ticker;
      const partners = (sec.global || []).map(g => g.id);
      const existing = byKey.get(key);

      if (existing) {
        if (existing.chain !== sec.sector && !(existing.extraChains || []).includes(sec.sector)) {
          if (!existing.extraChains) existing.extraChains = [];
          existing.extraChains.push(sec.sector);
        }
        if (d.note) {
          const snippet = d.note.slice(0, 24);
          if (!existing.products.includes(snippet)) {
            existing.products += ' · ' + d.note;
            existing.productsEn = existing.products;
          }
        }
        for (const p of partners) {
          if (!existing.partners.includes(p)) existing.partners.push(p);
        }
        continue;
      }

      const mcapWon = ticker === 'UNLISTED' ? null : (MKT_CAP_KRW[ticker] ?? null);
      if (ticker !== 'UNLISTED' && !passesMcapFloor({ mcapWon: mcapWon || 0 })) continue;
      const market = ticker === 'UNLISTED' ? '\uBE44\uC0C1\uC7A5' : (KOSPI_TICKERS.has(ticker) ? 'KOSPI' : 'KOSDAQ');
      const entry = {
        id: `bio_${list.length}`,
        name: d.name,
        nameEn: nameEnMap[ticker] || d.name,
        ticker,
        market,
        chain: sec.sector,
        sectorId: sec.id,
        semType: sec.description,
        semTypeEn: sec.sectorEn,
        products: d.note,
        productsEn: d.note,
        revenue: fmtMcap(mcapWon),
        mcapWon: mcapWon || 0,
        revTier: mcapTier(mcapWon),
        partners,
        extraChains: []
      };
      list.push(entry);
      byKey.set(key, entry);
    }
  }

  list.forEach((c, i) => { c.id = `bio_${i}`; });
  return list;
}

function mergeCpListAdditions(list, byKey, nameEnMap, meta3557) {
  const cpPath = join(__dirname, 'cp_list_bio_additions.json');
  if (!fs.existsSync(cpPath)) return 0;
  const additions = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
  if (!additions.length) return 0;

  const krx = loadMergedKrxMap(join(__dirname, '..', 'data'));
  let added = 0;

  for (const a of additions) {
    const ticker = a.ticker;
    if (!ticker || byKey.has(ticker)) continue;
    if (!allowedInSector(ticker, 'bio')) continue;
    const row = krx.get(ticker);
    const mcapWon = row ? row.mcap : 0;
    if (!passesMcapFloor({ mcapWon })) continue;
    const market = row ? row.market : 'KOSDAQ';
    const entry = {
      id: `bio_${list.length}`,
      name: a.name || row?.name || ticker,
      nameEn: nameEnMap[ticker] || meta3557?.get(ticker)?.nameEn || a.name || ticker,
      ticker,
      market,
      chain: a.chain || '합성신약 / 제네릭',
      sectorId: a.sectorId || 'smallmol',
      semType: a.subSector || '—',
      semTypeEn: a.subSector || '—',
      products: a.subSector || '—',
      productsEn: a.subSector || '—',
      revenue: fmtMcap(mcapWon),
      mcapWon: mcapWon || 0,
      revTier: mcapTier(mcapWon),
      partners: [],
      extraChains: [],
    };
    list.push(entry);
    byKey.set(ticker, entry);
    added++;
  }

  list.sort((x, y) => (y.mcapWon || 0) - (x.mcapWon || 0));
  list.forEach((c, i) => { c.id = `bio_${i}`; });
  return added;
}

function collectGlobals(bioSectors) {
  const map = new Map();
  for (const sec of bioSectors) {
    for (const g of sec.global || []) {
      if (!map.has(g.id)) map.set(g.id, { id: g.id, name: g.name, nameEn: g.nameEn != null && g.nameEn !== '' ? g.nameEn : g.name, country: g.country, region: g.region, sector: g.sector });
    }
  }
  return [...map.values()];
}

function buildT(bioSectors, koreanCompanies) {
  const raw = JSON.parse(fs.readFileSync(join(__dirname, 'bio_translations.json'), 'utf8'));
  const chainLabelKo = Object.fromEntries(bioSectors.map(s => [s.sector, s.sector]));
  const chainLabelEn = Object.fromEntries(bioSectors.map(s => [s.sector, s.sectorEn]));
  const chainFilterKo = { ...chainLabelKo };
  const chainFilterEn = { ...chainLabelEn };
  const kospi = koreanCompanies.filter(c => c.market === 'KOSPI').length;
  const kosdaq = koreanCompanies.filter(c => c.market === 'KOSDAQ').length;
  const total = koreanCompanies.length;
  return {
    ko: {
      ...raw.ko,
      badgeTotal: `\uCD1D <span>${total}</span>\uAC1C \uAE30\uC5C5 \uB9E4\uD551`,
      badgeMarket: `KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC`,
      chainLabel: chainLabelKo,
      chainFilter: chainFilterKo
    },
    en: {
      ...raw.en,
      badgeTotal: `<span>${total}</span> company mappings`,
      badgeMarket: `KOSPI <span>${kospi}</span> \u00B7 KOSDAQ <span>${kosdaq}</span>`,
      chainLabel: chainLabelEn,
      chainFilter: chainFilterEn
    }
  };
}

const bioSectors = JSON.parse(fs.readFileSync(join(__dirname, 'bio_data_from_jsx.json'), 'utf8')).map(normalizeSector);
const nameEnMap = JSON.parse(fs.readFileSync(join(__dirname, 'bio_ticker_en.json'), 'utf8'));
const dataDir = join(__dirname, '..', 'data');
const krxMap = loadMergedKrxMap(dataDir);
const meta3557 = loadListedEnglish3557Map(dataDir);
const koreanCompanies = flattenCompanies(bioSectors, nameEnMap);
{
  const byKey = new Map();
  for (const c of koreanCompanies) {
    if (c.ticker && c.ticker !== 'UNLISTED') byKey.set(c.ticker, c);
  }
  const cpAdded = mergeCpListAdditions(koreanCompanies, byKey, nameEnMap, meta3557);
  if (cpAdded) console.log('cp_list bio additions merged:', cpAdded);
}
for (const c of koreanCompanies) {
  const row = krxMap.get(c.ticker);
  if (row?.name) c.name = row.name;
}
mergeListedEnglishIntoCompanies(koreanCompanies, meta3557);
mergePerPbrIntoCompanies(koreanCompanies, loadPerPbrMap(dataDir));
enrichBioCompanies(koreanCompanies, join(__dirname, '..', '..', 'cp_list'));
{
  const kept = filterCompaniesForSector(filterCompaniesByMcap(koreanCompanies), 'bio');
  koreanCompanies.length = 0;
  koreanCompanies.push(...kept);
  koreanCompanies.forEach((c, i) => { c.id = `bio_${i}`; });
}
const globalCompanies = collectGlobals(bioSectors);
const CHAIN_COLORS = Object.fromEntries(bioSectors.map(s => [s.sector, s.color]));
const REGION_COLORS = { us: '#90A4AE', tw: '#80CBC4', eu: '#B0BEC5', cn: '#F48FB1', kr: '#A5D6A7', jp: '#F472B6', gb: '#A5B4FC', il: '#FDE047', dk: '#5EEAD4' };
const SECTOR_ORDER = bioSectors.map(s => s.sector);
const N_SECTORS = SECTOR_ORDER.length;
const T = buildT(bioSectors, koreanCompanies);

const tail = fs.readFileSync(join(__dirname, 'bio_inline_tail.js'), 'utf8');

const header = '/* Generated by gen_korea_bio_inline.mjs -- do not edit */\n';

const dataBlock = `
    const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};
    const REGION_COLORS = ${JSON.stringify(REGION_COLORS)};
    const koreanCompanies = ${JSON.stringify(koreanCompanies)};
    const globalCompanies = ${JSON.stringify(globalCompanies)};
    const SECTOR_ORDER = ${JSON.stringify(SECTOR_ORDER)};
    const N_SECTORS = ${N_SECTORS};
    const T = ${JSON.stringify(T)};
`;

const out = header + dataBlock + '\n' + tail;
fs.writeFileSync(join(__dirname, 'korea_bio_map.inline.js'), out, 'utf8');
console.log('Wrote korea_bio_map.inline.js rows=', koreanCompanies.length, 'globals=', globalCompanies.length);

const bioHtmlPath = join(__dirname, 'korea_bio_map.html');
let bioHtml = fs.readFileSync(bioHtmlPath, 'utf8');
const bioTotal = koreanCompanies.length;
const bioKospi = koreanCompanies.filter((c) => c.market === 'KOSPI').length;
const bioKosdaq = koreanCompanies.filter((c) => c.market === 'KOSDAQ').length;
bioHtml = bioHtml.replace(
  /<div class="badge" id="badge-total">[^<]*<span>\d+<\/span>[^<]*<\/div>/,
  `<div class="badge" id="badge-total">\uCD1D <span>${bioTotal}</span>\uAC1C \uAE30\uC5C5 \uB9E4\uD551</div>`,
);
bioHtml = bioHtml.replace(
  /<div class="badge" id="badge-market">KOSPI <span>\d+<\/span>\uC0AC[^<]*<\/div>/,
  `<div class="badge" id="badge-market">KOSPI <span>${bioKospi}</span>\uC0AC \u00B7 KOSDAQ <span>${bioKosdaq}</span>\uC0AC</div>`,
);
bioHtml = bioHtml.replace(
  /<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">\d+<\/span>\uAC1C<\/div>/,
  `<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">${bioTotal}</span>\uAC1C</div>`,
);
fs.writeFileSync(bioHtmlPath, bioHtml, 'utf8');
