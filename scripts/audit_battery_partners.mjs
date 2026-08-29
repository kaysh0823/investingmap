/**
 * Extract battery partners inventory for Phase 3B migration planning.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'battery', 'korea_battery_map.html'), 'utf8');
const cos = extractCompaniesFromHtml(html);

// Parse partners arrays from company object literals (rough)
const edges = [];
for (const c of cos) {
  const partners = c.partners || [];
  for (const p of partners) {
    if (typeof p === 'string') {
      edges.push({
        source: c.ticker,
        sourceName: c.name,
        target: p,
        kind: 'peer_or_unknown',
        label: '',
      });
    } else if (p && typeof p === 'object') {
      edges.push({
        source: c.ticker,
        sourceName: c.name,
        target: p.id,
        kind: p.kind || 'unknown',
        label: p.edgeLabel || '',
        labelEn: p.edgeLabelEn || '',
      });
    }
  }
}

const globalMatch = html.match(/const globalCompanies\s*=\s*(\[[\s\S]*?\]);/);
let globals = [];
if (globalMatch) {
  try {
    // eslint-disable-next-line no-eval
    globals = eval(globalMatch[1]);
  } catch {
    globals = (globalMatch[1].match(/id:\s*'([^']+)'/g) || []).map((s) => s.slice(5, -1));
  }
}

const kindCounts = {};
for (const e of edges) kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1;

console.log(JSON.stringify({
  companies: cos.length,
  chains: cos.reduce((m, c) => { m[c.chain] = (m[c.chain] || 0) + 1; return m; }, {}),
  partnerEdges: edges.length,
  kindCounts,
  globalCount: Array.isArray(globals) ? globals.length : Object.keys(globals).length,
  globals: Array.isArray(globals) ? globals.map((g) => (typeof g === 'string' ? g : g.id)) : globals,
  sampleEdges: edges.slice(0, 40),
  allCompanies: cos.map((c) => ({ ticker: c.ticker, name: c.name, chain: c.chain, partners: (c.partners || []).length })),
}, null, 2));
