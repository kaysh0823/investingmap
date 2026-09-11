/**
 * Post-build check: P3 admissions on map (1 home, chain match, mcap>0) + gaps absent + bigchip.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        cols.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

const MAP_PATH = {
  semi: 'semiconductor/korea_semiconductor_map.html',
  nuclear: 'nuclear/korea_nuclear_map.html',
  auto: 'auto/korea_auto_map.html',
  battery: 'battery/korea_battery_map.html',
  elec: 'elec/korea_elec_map.html',
  machinery: 'machinery/korea_machinery_map.html',
  chemical: 'chemical/korea_chemical_map.html',
  bio: 'bio/korea_bio_map.html',
  medtech: 'medtech/korea_medtech_map.html',
  defense: 'defense/korea_defense_map.html',
  kconsume: 'kconsume/korea_kconsume_map.html',
  travel: 'travel/korea_travel_map.html',
  software: 'software/korea_software_map.html',
  holdings: 'holdings/korea_holdings_map.html',
  renewable: 'renewable/korea_renewable_map.html',
  bigchip: 'bigchip/korea_bigchip_map.html',
};

function loadCompanies(sector, rel) {
  if (sector === 'bio') {
    const src = fs.readFileSync(join(ROOT, 'bio/korea_bio_map.inline.js'), 'utf8');
    const match = src.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
    if (!match) throw new Error('bio koreanCompanies not found');
    return Function(`"use strict"; return (${match[1]});`)();
  }
  return extractCompaniesFromHtml(fs.readFileSync(join(ROOT, rel), 'utf8'));
}

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

const bySector = {};
const allHomes = new Map();
for (const [sec, rel] of Object.entries(MAP_PATH)) {
  const cos = loadCompanies(sec, rel);
  bySector[sec] = cos;
  for (const c of cos) {
    if (!allHomes.has(c.ticker)) allHomes.set(c.ticker, []);
    allHomes.get(c.ticker).push({ sector: sec, chain: c.chain, mcap: Number(c.mcapWon ?? c.mcap) || 0 });
  }
}

const admRows = parseCsv(fs.readFileSync(join(ROOT, 'docs/reports/p3_mcap_admissions.csv'), 'utf8'));
for (const cols of admRows) {
  const ticker = String(cols[0]).padStart(6, '0');
  const sector = cols[2];
  const chain = cols[3];
  const homes = (allHomes.get(ticker) || []).filter((h) => h.sector !== 'bigchip');
  const home = homes.filter((h) => h.sector === sector);
  check(home.length === 1, `${ticker}: expected 1 home on ${sector}, got ${JSON.stringify(homes)}`);
  if (home[0]) {
    check(home[0].chain === chain, `${ticker}: chain ${home[0].chain} != ${chain}`);
    check(home[0].mcap > 0, `${ticker}: mcap not > 0 (${home[0].mcap})`);
  }
  const other = homes.filter((h) => h.sector !== sector);
  check(other.length === 0, `${ticker}: extra homes ${JSON.stringify(other)}`);
}

const gapRows = parseCsv(fs.readFileSync(join(ROOT, 'docs/reports/p3_taxonomy_gaps.csv'), 'utf8'));
for (const cols of gapRows) {
  const ticker = String(cols[0]).padStart(6, '0');
  check(!allHomes.has(ticker), `${ticker}: taxonomy gap must not be on map`);
}

check(bySector.bigchip.length === 2, `bigchip n=${bySector.bigchip.length}`);
check(
  bySector.bigchip.some((c) => c.ticker === '005930') && bySector.bigchip.some((c) => c.ticker === '000660'),
  'bigchip missing 005930/000660',
);
check(
  bySector.nuclear.some((c) => c.ticker === '032820' && c.chain === '계측·제어'),
  'nuclear 계측·제어 not filled by 032820',
);
check(
  (allHomes.get('033780') || []).some((h) => h.sector === 'kconsume'),
  '033780 KT&G missing from kconsume',
);
check(exclusiveSector('285130') === 'renewable', '285130 exclusive must remain renewable');
check(
  !admRows.some((cols) => String(cols[0]).padStart(6, '0') === '285130'),
  '285130 must not be re-admitted in P3',
);

if (failures.length) {
  console.error('verify_p3_mcap_admissions FAIL');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      admitted: admRows.length,
      gaps: gapRows.length,
      hubHomesSample: {
        nuclearMeter: bySector.nuclear.filter((c) => c.chain === '계측·제어').map((c) => c.ticker),
        semi: bySector.semi.length,
        holdings: bySector.holdings.length,
      },
    },
    null,
    2,
  ),
);
