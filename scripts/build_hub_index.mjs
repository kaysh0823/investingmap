/**
 * Build data/hub_index.json — lightweight company index for hub dashboard.
 * Also builds ticker→sector reverse index and injects crossSectors into map data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';
import { buildHubWithCrossSectors } from '../lib/cross_sector_inject.mjs';
import { listHubCompanies } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const { sectors, crossIndex, injectedMaps } = buildHubWithCrossSectors(ROOT);
  for (const [id, block] of Object.entries(sectors)) {
    console.log(`${id}: ${block.companies.length} companies`);
  }
  if (injectedMaps) console.log(`crossSectors injected into ${injectedMaps} map(s)`);
  console.log(`cross-listed tickers: ${Object.keys(crossIndex).length}`);

  const totalCompanies = listHubCompanies({ sectors }).length;
  console.log(`unique hub companies: ${totalCompanies}`);

  const out = {
    builtAt: kstYmdDash(),
    meta: { totalCompanies },
    crossIndex,
    sectors,
  };
  const outPath = path.join(ROOT, 'data', 'hub_index.json');
  fs.writeFileSync(outPath, JSON.stringify(out) + '\n', 'utf8');
  console.log('OK', outPath);
}

main();
