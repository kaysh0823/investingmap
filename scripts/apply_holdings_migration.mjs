/** Apply the approved holdings split after every historical chain/membership patch. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { HUB_MAP_PATHS, SECTOR_META } from '../lib/sector_meta.mjs';
import { esc, extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { HOLDINGS_DESTINATIONS } from '../lib/holdings_migration.mjs';
import { HOLDINGS_CONFIG } from '../lib/curated_sector_configs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/holdings_migration.json'), 'utf8'));
assert.equal(migration.rows.length, 51);
const rows = new Map(migration.rows.map(row => [row.ticker, row]));
assert.equal(rows.size, 51);

function remapRefs(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(remapRefs);
  const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapRefs(item)]));
  const ticker = String(out.ticker || out.id?.replace(/^krx:/, '') || '');
  const sector = HOLDINGS_DESTINATIONS[ticker];
  if (sector) {
    if (out.map && (!out.name || out.name === ticker)) {
      out.name = rows.get(ticker).company.name;
      out.nameEn = rows.get(ticker).company.nameEn;
    }
    if (out.sector === 'holdings') out.sector = sector;
    if (out.sectorId === 'holdings') out.sectorId = sector;
    for (const key of ['map', 'mapPath', 'href', 'url']) {
      if (typeof out[key] === 'string' && out[key].includes('holdings/korea_holdings_map')) {
        out[key] = out[key].replace(/holdings\/korea_holdings_map(?:\.html)?/, SECTOR_META[sector].map);
      }
    }
  }
  return out;
}

const relationFile = path.join(ROOT, 'data/cross_relations.json');
fs.writeFileSync(relationFile, JSON.stringify(remapRefs(JSON.parse(fs.readFileSync(relationFile, 'utf8'))), null, 2) + '\n');

function patchChainUi(content) {
  content = content.replace(/const CHAIN_COLORS\s*=\s*(\{[^;]+\});/, (_, literal) => {
    const colors = Function('return (' + literal + ')')();
    colors['지주회사'] = '#78909C';
    return 'const CHAIN_COLORS = ' + JSON.stringify(colors) + ';';
  });
  content = content.replace(/const ((?:CURATED|BIGCHIP)_CHAIN_ORDER)\s*=\s*(\[[^;]+\]);/g, (_, name, literal) => {
    const chains = Function('return (' + literal + ')')();
    if (!chains.includes('지주회사')) chains.push('지주회사');
    return 'const ' + name + ' = ' + JSON.stringify(chains) + ';';
  });
  content = content.replace(/const (chains|SECTOR_ORDER)\s*=\s*(\[[^\];]*\]);/g, (statement, name, literal) => {
    if (literal.includes('...') || /[()]/.test(literal.replace(/(['"])[^'"]*\1/g, ''))) return statement;
    const chains = Function('return (' + literal + ')')();
    if (!chains.includes('지주회사')) chains.push('지주회사');
    return 'const ' + name + ' = [' + chains.map(c => "'" + esc(c) + "'").join(', ') + '];';
  });
  content = content.replace(/return (\[[^\]]+\])\.filter\(ch => present\.has\(ch\)\);/g, (_, literal) => {
    const chains = Function('return (' + literal + ')')();
    if (!chains.includes('지주회사')) chains.push('지주회사');
    return "return [" + chains.map(c => "'" + esc(c) + "'").join(', ') + "].filter(ch => present.has(ch));";
  });
  // Every map carries a Korean and an English dictionary for each field.
  for (const field of ['chainLabel', 'chainFilter']) {
    let index = 0;
    const re = new RegExp('(["\']?' + field + '["\']?\\s*:\\s*)\\{([^{}]*)\\}', 'g');
    content = content.replace(re, (_, prefix, body) => {
      const dict = Function('return ({' + body + '})')();
      dict['지주회사'] = index++ % 2 ? 'Holding companies' : '지주회사';
      // Preserve both legacy formats: unquoted semi keys use one-line literals;
      // quoted generated keys use multiline terminators during rebuild patches.
      const literal = prefix.trim().startsWith('"')
        ? JSON.stringify(dict, null, 4).replace(/\n/g, '\n        ')
        : JSON.stringify(dict);
      return prefix + literal;
    });
  }
  return content;
}

for (const [sector, rel] of HUB_MAP_PATHS) {
  const file = path.join(ROOT, rel);
  let content = fs.readFileSync(file, 'utf8');
  const existing = extractCompaniesFromHtml(content);
  const retained = existing.filter(c => !rows.has(c.ticker));
  const incoming = migration.rows.filter(row => row.sector === sector).map(row => {
    assert.equal(HOLDINGS_DESTINATIONS[row.ticker], sector);
    const current = existing.find(c => c.ticker === row.ticker);
    return remapRefs({ ...row.company, ...current, id: row.company.id, chain: '지주회사', extraChains: [], crossSectors: [], tags: [...new Set([...(row.company.tags || []), ...(current?.tags || []), '지주회사'])] });
  });
  const companies = [...retained, ...incoming].map(remapRefs).sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  content = patchKoreanCompaniesHtml(content, companies);
  // Keep existing holding-peer labels resolvable in their new sector tables.
  if (incoming.length) {
    content = content.replace(/const globalCompanies\s*=\s*(\[[\s\S]*?\]);/, (_, literal) => {
      const globals = Function('return (' + literal + ')')();
      const used = new Set(incoming.flatMap(c => (c.partners || []).map(p => typeof p === 'string' ? p : p.id)));
      for (const peer of HOLDINGS_CONFIG.globals) {
        if (used.has(peer.id) && !globals.some(g => g.id === peer.id)) globals.push(peer);
      }
      return 'const globalCompanies = ' + JSON.stringify(globals, null, 6).replace(/\n/g, '\n    ') + ';';
    });
  }
  if (incoming.length) content = patchChainUi(content);
  fs.writeFileSync(file, content);
  if (incoming.length) console.log(`${sector}: ${incoming.length} companies -> 지주회사`);
  const graphFile = path.join(ROOT, 'data/netmap', (sector === 'semi' ? 'semiconductor' : sector) + '.json');
  if (fs.existsSync(graphFile)) {
    const graph = remapRefs(JSON.parse(fs.readFileSync(graphFile, 'utf8')));
    if (incoming.length) {
      graph.chains.holdings = '지주회사';
      for (const c of incoming) {
        const found = graph.nodes.find(n => n.ticker === c.ticker);
        if (found) { found.chain = 'holdings'; found.type = 'kr_listed'; }
        else graph.nodes.push({ id: 'krx:' + c.ticker, ticker: c.ticker, type: 'kr_listed', country: 'kr', market: c.market, nameKo: c.name, nameEn: c.nameEn, chain: 'holdings', role: c.semType });
      }
    }
    fs.writeFileSync(graphFile, JSON.stringify(graph, null, 2) + '\n');
  }
}
// Reference-only networks may mention the moved parents even in other sectors.
for (const folder of ['data/networks', 'data/netmap']) {
  for (const name of fs.readdirSync(path.join(ROOT, folder))) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(ROOT, folder, name);
    const before = fs.readFileSync(file, 'utf8');
    const after = remapRefs(JSON.parse(before));
    if (JSON.stringify(JSON.parse(before)) !== JSON.stringify(after)) fs.writeFileSync(file, JSON.stringify(after, null, 2) + '\n');
  }
}
console.log('OK holdings migration: 51 companies, stable IDs, single homes');
