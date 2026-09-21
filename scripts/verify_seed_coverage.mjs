/**
 * Compare curated sector seed tickers vs latest data_4937_* / data_4848_* KRX mcap CSVs.
 * Prints missing (likely delisted) tickers and exits 1 if any are missing.
 *
 * Usage: node scripts/verify_seed_coverage.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BIGCHIP_CONFIG,
  SOFTWARE_CONFIG,
  HOLDINGS_CONFIG,
  TELECOM_CONFIG,
  TRAVEL_CONFIG,
  CHEMICAL_CONFIG,
  ELEC_CONFIG,
  METAL_CONFIG,
} from '../lib/curated_sector_configs.mjs';
import { loadMergedKrxMap, resolveLatestCsv } from '../lib/krx_data_sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');

const CONFIGS = [
  BIGCHIP_CONFIG,
  SOFTWARE_CONFIG,
  HOLDINGS_CONFIG,
  TELECOM_CONFIG,
  TRAVEL_CONFIG,
  CHEMICAL_CONFIG,
  ELEC_CONFIG,
  METAL_CONFIG,
];

const krx = loadMergedKrxMap(DATA_DIR);
const csv4937 = resolveLatestCsv(DATA_DIR, 'data_4937_');
const csv4848 = resolveLatestCsv(DATA_DIR, 'data_4848_');

/** @type {{ sector: string, ticker: string, name: string }[]} */
const missing = [];
let seedCount = 0;

for (const config of CONFIGS) {
  for (const seed of config.companies || []) {
    seedCount += 1;
    const ticker = String(seed.ticker || '').trim();
    if (!ticker) continue;
    if (!krx.has(ticker)) {
      missing.push({
        sector: config.id,
        ticker,
        name: seed.name || seed.nameEn || '',
      });
    }
  }
}

console.log(
  `verify:seed-coverage seeds=${seedCount} krx=${krx.size}`
    + ` csv=${path.basename(csv4937)}+${path.basename(csv4848)}`,
);

if (missing.length) {
  console.error(`FAIL: ${missing.length} curated seed ticker(s) missing from KRX mcap CSV:`);
  for (const row of missing) {
    console.error(`  ${row.sector}\t${row.ticker}\t${row.name}`);
  }
  process.exit(1);
}

console.log('verify:seed-coverage OK (all curated seeds present in KRX)');
