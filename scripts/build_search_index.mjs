/**
 * Build lightweight global search index from hub_index.json → data/search_index.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB_INDEX = path.join(ROOT, 'data', 'hub_index.json');
const OUT = path.join(ROOT, 'data', 'search_index.json');

function main() {
  if (!fs.existsSync(HUB_INDEX)) {
    console.error('build_search_index: missing', HUB_INDEX);
    process.exit(1);
  }
  const hub = JSON.parse(fs.readFileSync(HUB_INDEX, 'utf8'));
  const out = [];
  for (const [sid, block] of Object.entries(hub.sectors || {})) {
    for (const company of block.companies || []) {
      const ticker = String(company.ticker || '').trim();
      if (!ticker) continue;
      out.push({
        t: ticker,
        k: company.name || '',
        e: company.nameEn || '',
        s: sid,
        m: Number(company.mcapWon) || 0,
      });
    }
  }
  out.sort((a, b) => (b.m || 0) - (a.m || 0));
  fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`search_index: ${out.length} entries → ${path.relative(ROOT, OUT)}`);
}

main();
