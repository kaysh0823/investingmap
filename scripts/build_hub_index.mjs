/**
 * Build data/hub_index.json — lightweight company index for hub dashboard.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterCompaniesByMcap } from '../lib/mcap_policy.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  ['semi', 'semiconductor/korea_semiconductor_map.html'],
  ['bio', 'bio/korea_bio_map.inline.js'],
  ['ship', 'ship/korea_ship_map.html'],
  ['defense', 'defense/korea_defense_map.html'],
  ['robot', 'robot/korea_robot_map.html'],
  ['auto', 'auto/korea_auto_map.html'],
  ['medtech', 'medtech/korea_medtech_map.html'],
  ['kconsume', 'kconsume/korea_kconsume_map.html'],
  ['kcontent', 'kcontent/korea_kcontent_map.html'],
  ['battery', 'battery/korea_battery_map.html'],
  ['renewable', 'renewable/korea_renewable_map.html'],
  ['nuclear', 'nuclear/korea_nuclear_map.html'],
  ['powergrid', 'powergrid/korea_powergrid_map.html'],
  ['finance', 'finance/korea_finance_map.html'],
  ['construction', 'construction/korea_construction_map.html'],
];

const SECTOR_META = {
  semi: { ko: '반도체', en: 'Semi', icon: '\uD83D\uDCA0', map: 'semiconductor/korea_semiconductor_map.html' },
  bio: { ko: '바이오', en: 'Bio', icon: '\uD83E\uDDEC', map: 'bio/korea_bio_map.html' },
  ship: { ko: '조선', en: 'Ship', icon: '\u2693', map: 'ship/korea_ship_map.html' },
  defense: { ko: '방산', en: 'Defense', icon: '\uD83D\uDEF0\uFE0F', map: 'defense/korea_defense_map.html' },
  robot: { ko: '로봇', en: 'Robot', icon: '\uD83E\uDD16', map: 'robot/korea_robot_map.html' },
  auto: { ko: '자동차', en: 'Auto', icon: '\uD83D\uDE97', map: 'auto/korea_auto_map.html' },
  medtech: { ko: '의료기기', en: 'MedTech', icon: '\uD83E\uDE7A', map: 'medtech/korea_medtech_map.html' },
  kconsume: { ko: 'K-소비/유통', en: 'K-Consume', icon: '\uD83D\uDED2', map: 'kconsume/korea_kconsume_map.html' },
  kcontent: { ko: 'K-콘텐츠', en: 'K-Content', icon: '\uD83C\uDFAC', map: 'kcontent/korea_kcontent_map.html' },
  battery: { ko: '2차전지', en: 'Battery', icon: '\uD83D\uDD0B', map: 'battery/korea_battery_map.html' },
  renewable: { ko: '신재생', en: 'Renewable', icon: '\uD83C\uDF31', map: 'renewable/korea_renewable_map.html' },
  nuclear: { ko: '원전', en: 'Nuclear', icon: '\u269B', map: 'nuclear/korea_nuclear_map.html' },
  powergrid: { ko: '전력설비', en: 'Power Equip.', icon: '\uD83D\uDD0C', map: 'powergrid/korea_powergrid_map.html' },
  finance: { ko: '금융', en: 'Finance', icon: '\uD83C\uDFE6', map: 'finance/korea_finance_map.html' },
  construction: { ko: '건설', en: 'Construction', icon: '\uD83C\uDFD7\uFE0F', map: 'construction/korea_construction_map.html' },
};

function extractCompanies(content) {
  const m = content.match(/const koreanCompanies\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('koreanCompanies array not found');
  // eslint-disable-next-line no-new-func
  const arr = new Function(`return ${m[1]}`)();
  if (!Array.isArray(arr)) throw new Error('koreanCompanies is not an array');
  return filterCompaniesByMcap(
    arr
      .filter((c) => c && c.ticker && c.ticker !== 'UNLISTED')
      .map((c) => ({
        ticker: String(c.ticker).trim(),
        name: c.name || '',
        nameEn: c.nameEn || c.name || '',
        market: c.market || '',
        mcapWon: typeof c.mcapWon === 'number' && c.mcapWon > 0 ? c.mcapWon : 0,
        sectorId: c.sector || c.id || '',
      }))
      .filter((c) => c.mcapWon > 0),
  );
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
    builtAt: kstYmdDash(),
    sectors,
  };
  const outPath = path.join(ROOT, 'data', 'hub_index.json');
  fs.writeFileSync(outPath, JSON.stringify(out) + '\n', 'utf8');
  console.log('OK', outPath);
}

main();
