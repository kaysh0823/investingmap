/**
 * Phase 5D — audit metal sector legacy partners / structure (read-only).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { METAL_CONFIG } from '../lib/curated_sector_configs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'metal', 'korea_metal_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const configTickers = new Set((METAL_CONFIG.companies || []).map((c) => c.ticker));
const htmlTickers = new Set(companies.map((c) => c.ticker));

const GLOBALS = (METAL_CONFIG.globals || []).map((g) => g.id);

const byChain = {};
let partnerRefs = 0;
const partnerIds = new Set();
const partnerPairs = [];
for (const c of companies) {
  byChain[c.chain] = (byChain[c.chain] || 0) + 1;
  for (const p of c.partners || []) {
    partnerRefs += 1;
    partnerIds.add(p);
    partnerPairs.push({ ticker: c.ticker, name: c.name, partner: p, chain: c.chain });
  }
}

const configNotInHtml = [...configTickers].filter((t) => !htmlTickers.has(t));
const htmlNotInConfig = [...htmlTickers].filter((t) => !configTickers.has(t));

const legacyClassification = {
  peer: partnerPairs.filter((p) => GLOBALS.includes(p.partner)),
  invalid: partnerPairs.filter((p) => !GLOBALS.includes(p.partner)),
};

const report = {
  asOf: '2026-08-23',
  phase: '5D-audit',
  sectorId: 'metal',
  htmlPath: 'metal/korea_metal_map.html',
  dataSector: 'metal',
  buildScript: 'scripts/build_korea_metal_map.mjs',
  listedCompanyCount: companies.length,
  configCompanyCount: METAL_CONFIG.companies.length,
  configNotInHtml,
  htmlNotInConfig,
  byChain,
  tickers: companies.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    nameEn: c.nameEn,
    chain: c.chain,
    semType: c.semType,
    products: c.products,
    partners: c.partners || [],
  })),
  partnerEdgeRefs: partnerRefs,
  uniquePartnerIds: [...partnerIds],
  stringPeerCount: partnerRefs,
  urlEvidenceRelationCount: 0,
  globalCompanyCount: GLOBALS.length,
  globalIds: GLOBALS,
  partnerPairs,
  legacyClassification,
  risks: [
    'partners are string peer labels (nippon_steel/arcelormittal/glencore/caterpillar) — not supply contracts',
    'no DART/URL evidence on legacy partners',
    '006110 battery-grade aluminium overlaps battery sector',
    '004020 automotive steel overlaps auto sector',
    '306200/092790 pipe products overlap ship sector',
    'rebar producers overlap construction sector',
    '295310 semiconductor specialty metals overlap semiconductor sector',
    'posco_int trading/resources — commodity exposure not supply contracts',
    'commodity price exposure must not become supplies_material_to',
    '009160 SIMPAC in METAL_CONFIG but below map mcap floor — not in HTML cp_list',
  ],
  networkJsonExists: fs.existsSync(join(ROOT, 'data', 'networks', 'metal.json')),
  priorProfile: {
    model: 'materials_demand',
    layout: 'layeredSupplyChain',
    networkPath: null,
    legacyFallback: true,
  },
};

fs.writeFileSync(
  join(ROOT, 'data', 'metal_relation_phase5d_audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  sectorId: 'metal',
  listed: report.listedCompanyCount,
  config: report.configCompanyCount,
  configNotInHtml,
  byChain,
  partnerRefs,
  uniquePartners: partnerIds.size,
  globals: GLOBALS.length,
  networkJsonExists: report.networkJsonExists,
}, null, 2));
