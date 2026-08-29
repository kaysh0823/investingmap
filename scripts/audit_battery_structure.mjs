/**
 * Quick battery structure audit for Phase 3B.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'battery', 'korea_battery_map.html'), 'utf8');
const cos = extractCompaniesFromHtml(html);
const chains = {};
for (const c of cos) {
  const ch = c.chain || c.semType || '(none)';
  chains[ch] = (chains[ch] || 0) + 1;
}
const kinds = (html.match(/kind:\s*'(supplier|customer|peer)'/g) || []).map((s) => s.match(/'(.*)'/)[1]);
const kindCounts = kinds.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});
const hasV2 = html.includes('RelationNetwork v2') || html.includes('relation_network.js');
const sector = (html.match(/data-sector="([^"]+)"/) || [])[1];
const globalBlock = html.match(/const globalCompanies\s*=\s*\[([\s\S]*?)\];/);
let globalCount = 0;
if (globalBlock) {
  globalCount = (globalBlock[1].match(/id:\s*'/g) || []).length;
}

console.log(JSON.stringify({
  path: 'battery/korea_battery_map.html',
  dataSector: sector,
  companyCount: cos.length,
  chains,
  partnerKindCounts: kindCounts,
  partnerEdgeEstimate: kinds.length,
  globalCompaniesEstimate: globalCount,
  relationNetworkV2: hasV2,
  legacyFallbackExpected: !html.includes('data/networks/battery.json'),
  sample: cos.slice(0, 12).map((c) => ({ ticker: c.ticker, name: c.name, chain: c.chain })),
}, null, 2));
