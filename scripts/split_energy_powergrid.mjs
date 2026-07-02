/**
 * Split energy map into energy (2차전지·ESS·배터리·태양광·풍력) + powergrid (전력설비·송배전·발전설비).
 * Removes 한국콜마 (161890) from energy.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENERGY_HTML = path.join(ROOT, 'energy', 'korea_energy_map.html');
const POWER_HTML = path.join(ROOT, 'powergrid', 'korea_powergrid_map.html');

const REMOVE_TICKERS = new Set(['161890']);

const POWER_EXTRA_TICKERS = new Set([
  '015760', '036460', '130660', '071320', '006910',
]);

const ENERGY_CHAINS = ['2차전지', 'ESS', '배터리', '태양광', '풍력'];
const POWER_CHAINS = ['전력설비', '송배전', '발전설비'];

function extractCompanies(html) {
  const m = html.match(/const koreanCompanies\s*=\s*(\[[\s\S]*?\n    \]);/);
  if (!m) throw new Error('koreanCompanies not found');
  return new Function(`return ${m[1]}`)();
}

function isPowerCompany(c) {
  if (REMOVE_TICKERS.has(c.ticker)) return false;
  if (POWER_EXTRA_TICKERS.has(c.ticker)) return true;
  return c.chain === '전력설비·송배전' || c.chain === '원자력·발전설비';
}

function powerChain(c) {
  const text = `${c.name} ${c.semType || ''} ${c.products || ''}`;
  if (c.chain === '원자력·발전설비') return '발전설비';
  if (/한국전력|한전|발전|원자|터빈|EPC|O&M|가스공사|지역난방|파워텍/.test(text)) return '발전설비';
  if (/케이블|전선|송배전|송전|배전|전력망|LNG|배관/.test(text)) return '송배전';
  return '전력설비';
}

function energyChain(c) {
  const text = `${c.name} ${c.semType || ''} ${c.products || ''} ${c.nameEn || ''}`;
  if (/풍력|풍타워|wind|윈드|CS Wind|씨에스윈드|해상풍/.test(text)) return '풍력';
  if (/태양|솔라|solar|폴리실리콘|모듈|광전|Q-셀|Hanwha Solutions.*태양/.test(text)) return '태양광';
  if (/연료전지|수소|fuel cell|SOFC|PEM/.test(text)) return 'ESS';
  if (/ESS|계통용|grid ESS|에너지솔루션|피크저감/.test(text) && !/2차전지|양극|음극|전해질|셀 소재/.test(text)) return 'ESS';
  if (/팩|pack(?!aging)/i.test(text) && /배터리|BMS/.test(text)) return '배터리';
  if (/2차전지|양극|음극|전해|리튬|분리막|셀|소재|L&F|에코프로|포스코퓨처|SDI|LG에너지|SK온|SK이노|엔켐|나노신소재/.test(text)) return '2차전지';
  if (/배터리/.test(text)) return '배터리';
  if (/지주|정유|석유|화학|타이어|화장품|ODM|비료/.test(text)) return '2차전지';
  return '2차전지';
}

function serializeCompany(c, indent = '      ') {
  const lines = [];
  lines.push(`${indent}{`);
  lines.push(`${indent}  id: '${c.id}', name: '${c.name.replace(/'/g, "\\'")}', nameEn: '${(c.nameEn || c.name).replace(/'/g, "\\'")}', ticker: '${c.ticker}', market: '${c.market}', chain: '${c.chain}',`);
  if (c.semType) lines.push(`${indent}  semType: '${c.semType.replace(/'/g, "\\'")}', semTypeEn: '${(c.semTypeEn || c.semType).replace(/'/g, "\\'")}',`);
  if (c.products) lines.push(`${indent}  products: '${c.products.replace(/'/g, "\\'")}', productsEn: '${(c.productsEn || c.products).replace(/'/g, "\\'")}',`);
  if (c.revenue) lines.push(`${indent}  revenue: '${c.revenue}', mcapWon: ${c.mcapWon}, per: ${c.per == null ? 'null' : c.per}, pbr: ${c.pbr == null ? 'null' : c.pbr}, revTier: ${c.revTier || 1}, partners: ${JSON.stringify(c.partners || [])}`);
  else lines.push(`${indent}  mcapWon: ${c.mcapWon}, partners: ${JSON.stringify(c.partners || [])}`);
  lines.push(`${indent}},`);
  return lines.join('\n');
}

function companiesBlock(companies) {
  return `    const koreanCompanies = [\n${companies.map((c) => serializeCompany(c)).join('\n\n')}\n    ];`;
}

function patchChainsInHtml(html, chains, chainLabelsKo, chainLabelsEn, chainFilterEn) {
  const chainList = chains.map((c) => `'${c}'`).join(', ');
  let out = html.replace(
    /const chains = \['all', [^\]]+\];/,
    `const chains = ['all', ${chainList}];`,
  );
  out = out.replace(
    /const chains = \[[^\]]+\];(?=\s*\n\s*const btnRow)/,
    `const chains = [${chainList}];`,
  );

  const labelBlock = chains.map((c) => `            "${c}": "${chainLabelsEn[c] || c}"`).join(',\n');
  out = out.replace(/"chainLabel": \{[\s\S]*?\n        \},/, `"chainLabel": {\n${labelBlock}\n        },`);

  const filterBlock = chains.map((c) => `            "${c}": "${chainFilterEn[c] || c}"`).join(',\n');
  out = out.replace(/"chainFilter": \{[\s\S]*?\n        \},/, `"chainFilter": {\n${filterBlock}\n        },`);

  return out;
}

const ENERGY_CHAIN_EN = {
  '2차전지': 'Lithium-ion batteries',
  ESS: 'Energy storage systems',
  배터리: 'Battery packs & BMS',
  태양광: 'Solar PV',
  풍력: 'Wind power',
};
const ENERGY_FILTER_EN = {
  '2차전지': 'Li-ion',
  ESS: 'ESS',
  배터리: 'Battery',
  태양광: 'Solar',
  풍력: 'Wind',
};
const POWER_CHAIN_EN = {
  전력설비: 'Switchgear & transformers',
  송배전: 'T&D · cables · utilities',
  발전설비: 'Generation & nuclear OEM',
};
const POWER_FILTER_EN = {
  전력설비: 'Grid gear',
  송배전: 'T&D',
  발전설비: 'Generation',
};

function main() {
  const src = fs.readFileSync(ENERGY_HTML, 'utf8');
  const all = extractCompanies(src);

  const powerCos = [];
  const energyCos = [];

  for (const c of all) {
    if (REMOVE_TICKERS.has(c.ticker)) continue;
    if (isPowerCompany(c)) {
      powerCos.push({ ...c, chain: powerChain(c) });
    } else {
      energyCos.push({ ...c, chain: energyChain(c) });
    }
  }

  powerCos.sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  energyCos.sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));

  let energyHtml = src.replace(
    /const koreanCompanies\s*=\s*\[[\s\S]*?\n    \];/,
    companiesBlock(energyCos),
  );
  energyHtml = patchChainsInHtml(energyHtml, ENERGY_CHAINS, {}, ENERGY_CHAIN_EN, ENERGY_FILTER_EN);
  energyHtml = energyHtml
    .replace(/에너지\/파워플랜트/g, '에너지')
    .replace(/Energy & Power Plant/g, 'Energy')
    .replace(/Energy &amp; Power Plant/g, 'Energy')
    .replace(/power-plant names/g, 'energy names')
    .replace(/신재생·2차전지·태양광·풍력·원자력·전력기기·ESS·수소·연료전지·전력·가스/g, '2차전지·ESS·배터리·태양광·풍력')
    .replace(/Renewables, batteries, solar, wind, nuclear, power equipment, ESS, hydrogen, fuel cells, and utilities/g, 'Lithium-ion batteries, ESS, solar, wind, and battery materials')
    .replace(/data-sector="energy"/g, 'data-sector="energy"');

  fs.mkdirSync(path.dirname(POWER_HTML), { recursive: true });
  let powerHtml = energyHtml
    .replace(/energy\/korea_energy_map/g, 'powergrid/korea_powergrid_map')
    .replace(/\/energy\//g, '/powergrid/')
    .replace(/data-sector="energy"/g, 'data-sector="powergrid"')
    .replace(/에너지/g, '전력설비')
    .replace(/Energy/g, 'Power Grid')
    .replace(/2차전지·ESS·배터리·태양광·풍력/g, '전력설비·송배전·발전설비')
    .replace(/Lithium-ion batteries, ESS, solar, wind, and battery materials/g, 'Power equipment, transmission & distribution, and generation OEM');

  powerHtml = powerHtml.replace(
    /const koreanCompanies\s*=\s*\[[\s\S]*?\n    \];/,
    companiesBlock(powerCos),
  );
  powerHtml = patchChainsInHtml(powerHtml, POWER_CHAINS, {}, POWER_CHAIN_EN, POWER_FILTER_EN);

  fs.writeFileSync(ENERGY_HTML, energyHtml, 'utf8');
  fs.writeFileSync(POWER_HTML, powerHtml, 'utf8');

  console.log(`energy: ${energyCos.length} companies`);
  console.log(`powergrid: ${powerCos.length} companies`);
  console.log('removed:', [...REMOVE_TICKERS].join(', '));
}

main();
