/**
 * Inject UI-only relation links from data/cross_relations.json into map company arrays.
 * NEVER used for mcap / company-count / performance / hub aggregation.
 */
import fs from 'fs';
import path from 'path';
import { SECTOR_META, HUB_MAP_PATHS } from './sector_meta.mjs';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from './map_company_serialize.mjs';

function pad(t) {
  const s = String(t || '').trim();
  if (!s || s === 'UNLISTED') return null;
  if (/^[0-9]+$/.test(s)) return s.padStart(6, '0');
  return s.toUpperCase();
}

function loadRelations(root) {
  const fp = path.join(root, 'data', 'cross_relations.json');
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

/** Build ticker@sector → related member refs (self excluded). */
export function buildRelationReverseIndex(doc, nameByTickerSector) {
  /** @type {Map<string, object[]>} */
  const index = new Map();
  for (const rel of doc.relations || []) {
    const members = rel.members || [];
    for (const self of members) {
      const selfT = pad(self.ticker);
      const selfS = self.sector;
      if (!selfT || !selfS) continue;
      const key = `${selfT}@${selfS}`;
      const others = [];
      for (const m of members) {
        const t = pad(m.ticker);
        const s = m.sector;
        if (!t || !s) continue;
        if (t === selfT && s === selfS) continue;
        const meta = SECTOR_META[s];
        const nameHit = nameByTickerSector.get(`${t}@${s}`) || nameByTickerSector.get(t) || {};
        others.push({
          relationId: rel.id,
          type: rel.type,
          label: rel.label,
          chip: rel.type === '지배구조' ? '계열' : '연관',
          chipEn: rel.type === '지배구조' ? 'Affiliate' : 'Related',
          ticker: t,
          name: nameHit.name || t,
          nameEn: nameHit.nameEn || nameHit.name || t,
          sector: s,
          map: meta?.map || `${s}/korea_${s}_map.html`,
        });
      }
      if (!others.length) continue;
      if (!index.has(key)) index.set(key, []);
      // dedupe by ticker+sector+relationId
      const bucket = index.get(key);
      for (const o of others) {
        if (!bucket.some((x) => x.ticker === o.ticker && x.sector === o.sector && x.relationId === o.relationId)) {
          bucket.push(o);
        }
      }
    }
  }
  return index;
}

function collectNames(root) {
  const byKey = new Map();
  for (const [sectorId, relPath] of HUB_MAP_PATHS) {
    const fp = path.join(root, relPath);
    if (!fs.existsSync(fp)) continue;
    let companies;
    try {
      companies = extractCompaniesFromHtml(fs.readFileSync(fp, 'utf8'));
    } catch {
      continue;
    }
    for (const c of companies) {
      const t = pad(c.ticker);
      if (!t) continue;
      const row = { name: c.name, nameEn: c.nameEn || c.name };
      byKey.set(`${t}@${sectorId}`, row);
      if (!byKey.has(t)) byKey.set(t, row);
    }
  }
  return byKey;
}

/**
 * Patch maps with relations[]; returns integrity stats. Does not touch hub_index aggregation.
 */
export function injectCrossRelations(root) {
  const doc = loadRelations(root);
  const names = collectNames(root);
  const index = buildRelationReverseIndex(doc, names);

  // membership presence check
  const present = new Set();
  for (const [sectorId, relPath] of HUB_MAP_PATHS) {
    const fp = path.join(root, relPath);
    if (!fs.existsSync(fp)) continue;
    try {
      for (const c of extractCompaniesFromHtml(fs.readFileSync(fp, 'utf8'))) {
        const t = pad(c.ticker);
        if (t) present.add(`${t}@${sectorId}`);
      }
    } catch {
      /* skip */
    }
  }

  const broken = [];
  for (const rel of doc.relations || []) {
    for (const m of rel.members || []) {
      const t = pad(m.ticker);
      const key = `${t}@${m.sector}`;
      if (!present.has(key)) broken.push(`${rel.id}:${key}`);
    }
  }

  let patchedMaps = 0;
  let companiesWithRelations = 0;
  for (const [sectorId, relPath] of HUB_MAP_PATHS) {
    const fp = path.join(root, relPath);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf8');
    let companies;
    try {
      companies = extractCompaniesFromHtml(content);
    } catch {
      continue;
    }
    let changed = false;
    const updated = companies.map((c) => {
      const t = pad(c.ticker);
      const rels = t ? index.get(`${t}@${sectorId}`) || [] : [];
      const prev = c.relations || [];
      const same =
        rels.length === prev.length &&
        rels.every(
          (x, i) =>
            prev[i] &&
            x.ticker === prev[i].ticker &&
            x.sector === prev[i].sector &&
            x.relationId === prev[i].relationId,
        );
      if (same) return c;
      changed = true;
      const next = { ...c };
      if (rels.length) {
        next.relations = rels;
        companiesWithRelations++;
      } else delete next.relations;
      return next;
    });
    if (changed) {
      fs.writeFileSync(fp, patchKoreanCompaniesHtml(content, updated), 'utf8');
      patchedMaps++;
      console.log(`relations: patched ${relPath}`);
    }
  }

  return {
    relationGroups: (doc.relations || []).length,
    patchedMaps,
    companiesWithRelations,
    brokenLinks: broken,
    indexSize: index.size,
  };
}
