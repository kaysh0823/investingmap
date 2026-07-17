/** Build ticker→sector reverse index and inject crossSectors into map company arrays. */
import fs from 'fs';
import path from 'path';
import { SECTOR_META, HUB_MAP_PATHS } from './sector_meta.mjs';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from './map_company_serialize.mjs';
import { filterCompaniesByMcap } from './mcap_policy.mjs';

function normalizeTicker(ticker) {
  if (ticker == null || ticker === '') return null;
  const s = String(ticker).trim();
  if (/^[0-9]+$/.test(s)) return s.padStart(6, '0');
  return s;
}

export function crossSectorRef(sectorId) {
  const meta = SECTOR_META[sectorId];
  if (!meta) return null;
  return {
    sectorId,
    labelKo: meta.ko,
    labelEn: meta.en,
    shortKo: meta.shortKo,
    shortEn: meta.shortEn,
    map: meta.map,
  };
}

/** @returns {Map<string, string[]>} ticker → sorted sector ids */
export function buildTickerSectorIndex(sectorCompanies) {
  const index = new Map();
  for (const [sectorId, companies] of sectorCompanies) {
    for (const c of companies) {
      const key = normalizeTicker(c.ticker);
      if (!key || key === 'UNLISTED') continue;
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(sectorId);
    }
  }
  const out = new Map();
  for (const [ticker, set] of index) {
    if (set.size < 2) continue;
    out.set(ticker, [...set].sort());
  }
  return out;
}

export function crossSectorsForTicker(ticker, currentSectorId, index) {
  const key = normalizeTicker(ticker);
  const sectors = index.get(key);
  if (!sectors) return [];
  return sectors
    .filter((sid) => sid !== currentSectorId)
    .map((sid) => crossSectorRef(sid))
    .filter(Boolean);
}

function readMapCompanies(root, sectorId, relPath) {
  const fp = path.join(root, relPath);
  const content = fs.readFileSync(fp, 'utf8');
  const companies = extractCompaniesFromHtml(content);
  return { fp, content, companies };
}

function hubCompanyShape(c, sectorId) {
  return {
    ticker: String(c.ticker).trim(),
    name: c.name || '',
    nameEn: c.nameEn || c.name || '',
    market: c.market || '',
    mcapWon: typeof c.mcapWon === 'number' && c.mcapWon > 0 ? c.mcapWon : 0,
    sectorId: c.sector || c.sectorId || c.id || '',
  };
}

/**
 * Scan maps, build reverse index, inject crossSectors, return hub_index sectors payload.
 * @param {string} root project root
 */
export function buildHubWithCrossSectors(root) {
  const sectorCompanies = [];
  const rawBySector = new Map();

  for (const [sectorId, relPath] of HUB_MAP_PATHS) {
    const { companies } = readMapCompanies(root, sectorId, relPath);
    rawBySector.set(sectorId, companies);
    sectorCompanies.push([sectorId, companies]);
  }

  const index = buildTickerSectorIndex(sectorCompanies);
  let injectedMaps = 0;

  for (const [sectorId, relPath] of HUB_MAP_PATHS) {
    const { fp, content, companies } = readMapCompanies(root, sectorId, relPath);
    let changed = false;
    const updated = companies.map((c) => {
      const cross = crossSectorsForTicker(c.ticker, sectorId, index);
      const prev = c.crossSectors || [];
      const same =
        cross.length === prev.length
        && cross.every((x, i) => x && prev[i] && x.sectorId === prev[i].sectorId);
      if (same) return c;
      changed = true;
      const next = { ...c };
      if (cross.length) next.crossSectors = cross;
      else delete next.crossSectors;
      return next;
    });
    if (changed) {
      const html = patchKoreanCompaniesHtml(content, updated);
      fs.writeFileSync(fp, html, 'utf8');
      injectedMaps++;
      console.log(`crossSectors: patched ${relPath}`);
    }
    rawBySector.set(sectorId, updated);
  }

  const sectors = {};
  for (const [sectorId] of HUB_MAP_PATHS) {
    const companies = filterCompaniesByMcap(
      (rawBySector.get(sectorId) || [])
        .filter((c) => c && c.ticker && c.ticker !== 'UNLISTED')
        .map((c) => hubCompanyShape(c, sectorId))
        .filter((c) => c.mcapWon > 0),
    );
    companies.sort((a, b) => b.mcapWon - a.mcapWon);
    sectors[sectorId] = { meta: SECTOR_META[sectorId], companies };
  }

  const crossIndex = {};
  for (const [ticker, sids] of index) {
    crossIndex[ticker] = sids;
  }

  return { sectors, crossIndex, injectedMaps };
}
