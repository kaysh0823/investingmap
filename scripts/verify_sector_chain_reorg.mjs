/** Focused persistence checks for the August 2026 powergrid/ship/bio reorganization. */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { validateChainInvariants } from '../lib/chain_reclass_invariants.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function mapCompanies(rel) {
  return extractCompaniesFromHtml(fs.readFileSync(join(ROOT, rel), 'utf8'));
}

function bioCompanies() {
  const src = fs.readFileSync(join(ROOT, 'bio', 'korea_bio_map.inline.js'), 'utf8');
  const match = src.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('bio inline koreanCompanies not found');
  return Function(`"use strict"; return (${match[1]});`)();
}

const sectors = {
  powergrid: mapCompanies('powergrid/korea_powergrid_map.html'),
  ship: mapCompanies('ship/korea_ship_map.html'),
  bio: bioCompanies(),
  medtech: mapCompanies('medtech/korea_medtech_map.html'),
  defense: mapCompanies('defense/korea_defense_map.html'),
  cosmetics: mapCompanies('cosmetics/korea_cosmetics_map.html'),
};

for (const sectorKey of ['powergrid', 'ship']) {
  for (const err of validateChainInvariants(sectorKey, sectors[sectorKey], { label: sectorKey })) {
    failures.push(err);
  }
}

const homes = new Map();
for (const [sector, companies] of Object.entries(sectors)) {
  for (const c of companies) {
    if (!homes.has(c.ticker)) homes.set(c.ticker, []);
    homes.get(c.ticker).push(sector);
  }
}
for (const [ticker, expected] of Object.entries({
  '347700': 'defense',
  '067630': 'medtech',
  '086450': 'bio',
  '009290': 'bio',
  '145020': 'cosmetics',
})) {
  const got = homes.get(ticker) || [];
  check(got.length === 1 && got[0] === expected, `${ticker}: expected only ${expected}, got ${got.join(',') || 'none'}`);
}

const bioByTicker = new Map(sectors.bio.map((c) => [c.ticker, c]));
for (const ticker of ['086450', '009290']) {
  check(bioByTicker.get(ticker)?.chain === '합성신약 / 제네릭', `${ticker}: wrong bio chain ${bioByTicker.get(ticker)?.chain}`);
}
for (const retired of ['체외진단 (IVD)', '의료기기 / 디지털헬스']) {
  check(!sectors.bio.some((c) => c.chain === retired), `bio still contains retired chain ${retired}`);
}
check(
  sectors.medtech.find((c) => c.ticker === '067630')?.chain === '진단·IVD',
  '067630 is not in medtech 진단·IVD',
);
check(
  sectors.defense.find((c) => c.ticker === '347700')?.chain === '우주·위성·민항',
  '347700 is not in defense 우주·위성·민항',
);

const hub = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'hub_index.json'), 'utf8'));
check(Object.keys(hub.crossIndex || {}).length === 0, `crossIndex: expected 0, got ${Object.keys(hub.crossIndex || {}).length}`);

console.log('Sector/chain reorganization verification');
console.log('========================================');
console.log('counts:', Object.fromEntries(Object.entries(sectors).map(([k, v]) => [k, v.length])));
console.log('crossIndex:', Object.keys(hub.crossIndex || {}).length);
console.log('failures:', failures.length);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length ? 1 : 0);
