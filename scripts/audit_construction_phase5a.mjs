/**
 * One-shot audit of construction map (Phase 5A pre-impl).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'construction', 'korea_construction_map.html'), 'utf8');
const builder = fs.existsSync(join(ROOT, 'build_korea_construction_map.mjs'))
  ? fs.readFileSync(join(ROOT, 'build_korea_construction_map.mjs'), 'utf8')
  : null;

const sector = (html.match(/data-sector="([^"]+)"/) || [])[1];

function extractArray(name) {
  const marker = `const ${name} = [`;
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length - 1;
  let depth = 0;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict"; return (${html.slice(start + `const ${name} = `.length, i + 1)});`)();
      }
    }
  }
  return null;
}

const koreanCompanies = extractArray('koreanCompanies');
const globalCompanies = extractArray('globalCompanies');

const byChain = {};
for (const c of koreanCompanies || []) {
  byChain[c.chain] = (byChain[c.chain] || 0) + 1;
}

const partnerEdges = [];
for (const c of koreanCompanies || []) {
  for (const p of c.partners || []) {
    partnerEdges.push({ source: c.ticker, sourceName: c.name, partner: p, chain: c.chain });
  }
}

const partnerFreq = {};
for (const e of partnerEdges) partnerFreq[e.partner] = (partnerFreq[e.partner] || 0) + 1;

console.log(JSON.stringify({
  sector,
  listedCount: koreanCompanies?.length,
  listed: (koreanCompanies || []).map((c) => ({
    ticker: c.ticker, name: c.name, nameEn: c.nameEn, chain: c.chain, semType: c.semType, partners: c.partners,
  })),
  byChain,
  globalCount: globalCompanies?.length,
  globals: (globalCompanies || []).map((g) => ({ id: g.id, name: g.name || g.nameEn, region: g.region, chain: g.chain })),
  partnerEdgeCount: partnerEdges.length,
  partnerFreq,
  hasBuilder: !!builder,
  builderMentionsSeed: builder ? /SEED|koreanCompanies|partners/.test(builder) : false,
  relationNetworkScript: /relation_network\.js/.test(html),
  legacyFallbackLikely: !fs.existsSync(join(ROOT, 'data', 'networks', 'construction.json')),
  hasBuildGraph: /function buildGraph/.test(html),
  curatedMode: /CURATED_RELATION_MODE/.test(html),
}, null, 2));
