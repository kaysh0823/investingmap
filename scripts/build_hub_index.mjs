/**
 * Build data/hub_index.json — lightweight company index for hub dashboard.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  ['semi', 'semiconductor/korea_semiconductor_map.html'],
  ['bio', 'bio/korea_bio_map.inline.js'],
  ['ship', 'ship/korea_ship_map.html'],
  ['defense', 'defense/korea_defense_map.html'],
  ['robot', 'robot/korea_robot_map.html'],
  ['kculture', 'kculture/korea_kculture_map.html'],
  ['energy', 'energy/korea_energy_map.html'],
];

const SECTOR_META = {
  semi: { ko: '반도체', en: 'Semi', icon: '\uD83D\uDCA0', map: 'semiconductor/korea_semiconductor_map.html' },
  bio: { ko: '바이오', en: 'Bio', icon: '\uD83E\uDDEC', map: 'bio/korea_bio_map.html' },
  ship: { ko: '조선', en: 'Ship', icon: '\u2693', map: 'ship/korea_ship_map.html' },
  defense: { ko: '방산', en: 'Defense', icon: '\uD83D\uDEF0\uFE0F', map: 'defense/korea_defense_map.html' },
  robot: { ko: '로봇', en: 'Robot', icon: '\uD83E\uDD16', map: 'robot/korea_robot_map.html' },
  kculture: { ko: 'K컬처', en: 'K-Culture', icon: '\uD83C\uDFAC', map: 'kculture/korea_kculture_map.html' },
  energy: { ko: '에너지/파워', en: 'Energy', icon: '\u26A1', map: 'energy/korea_energy_map.html' },
};

function extractCompanies(content) {
  const m = content.match(/const koreanCompanies\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('koreanCompanies array not found');
  // eslint-disable-next-line no-new-func
  const arr = new Function(`return ${m[1]}`)();
  if (!Array.isArray(arr)) throw new Error('koreanCompanies is not an array');
  return arr
    .filter((c) => c && c.ticker && c.ticker !== 'UNLISTED')
    .map((c) => ({
      ticker: String(c.ticker).trim(),
      name: c.name || '',
      nameEn: c.nameEn || c.name || '',
      market: c.market || '',
      mcapWon: typeof c.mcapWon === 'number' && c.mcapWon > 0 ? c.mcapWon : 0,
      sectorId: c.sector || c.id || '',
    }))
    .filter((c) => c.mcapWon > 0);
}

function main() {
  const sectors = {};
  for (const [id, rel] of MAPS) {
    const fp = path.join(ROOT, rel);
    const content = fs.readFileSync(fp, 'utf8');
    const companies = extractCompanies(content);
    companies.sort((a, b) => b.mcapWon - a.mcapWon);
    sectors[id] = { meta: SECTOR_META[id], companies };
    console.log(`${id}: ${companies.length} companies`);
  }

  const out = {
    builtAt: new Date().toISOString().slice(0, 10),
    sectors,
  };
  const outPath = path.join(ROOT, 'data', 'hub_index.json');
  fs.writeFileSync(outPath, JSON.stringify(out) + '\n', 'utf8');
  console.log('OK', outPath);
}

main();
