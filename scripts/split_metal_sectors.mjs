import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';
import {
  padTicker,
  rewriteMapInPlace,
  updateExclusiveForTickers,
  writeSplitMap,
} from '../lib/split_map_scaffold.mjs';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'metal', 'korea_metal_map.html');
const MACHINERY_HTML = path.join(ROOT, 'machinery', 'korea_machinery_map.html');
const MACHINERY_ADDITIONS = path.join(ROOT, 'machinery', 'cp_list_machinery_additions.json');
const SPIN_CHAIN = '산업기계';

const METAL_COLORS = {
  철강: '#78909C',
  비철: '#FFA726',
  '철강 트레이딩': '#42A5F5',
};
const METAL_CHAINS = Object.keys(METAL_COLORS);
const MACHINERY_COLORS = { 산업기계: '#8D6E63' };
const MACHINERY_CHAINS = ['산업기계'];

const all = extractCompaniesFromHtml(fs.readFileSync(SRC, 'utf8'));
let machinery = all.filter((c) => c.chain === SPIN_CHAIN);
const metalKeep = all.filter((c) => c.chain !== SPIN_CHAIN);
const leftover = all.filter((c) => c.chain !== SPIN_CHAIN && !METAL_COLORS[c.chain]);
if (leftover.length) {
  console.warn(
    'WARN unexpected metal chains:',
    leftover.map((c) => `${c.ticker}:${c.chain}`).join(', '),
  );
}

// Preserve machinery-only members (e.g. HD건설기계) that never lived on metal.
const byTicker = new Map(machinery.map((c) => [padTicker(c.ticker), c]));
if (fs.existsSync(MACHINERY_HTML)) {
  for (const c of extractCompaniesFromHtml(fs.readFileSync(MACHINERY_HTML, 'utf8'))) {
    const t = padTicker(c.ticker);
    const home = exclusiveSector(t);
    if (home && home !== 'machinery') continue; // e.g. 삼현 → auto
    if (!byTicker.has(t)) byTicker.set(t, c);
  }
}
if (fs.existsSync(MACHINERY_ADDITIONS)) {
  for (const row of JSON.parse(fs.readFileSync(MACHINERY_ADDITIONS, 'utf8'))) {
    const t = padTicker(row.ticker);
    const home = exclusiveSector(t);
    if (home && home !== 'machinery') continue;
    if (byTicker.has(t)) continue;
    byTicker.set(t, {
      id: `machinery_${t}`,
      name: row.name,
      nameEn: row.nameEn || row.name,
      ticker: t,
      market: row.market || 'KOSPI',
      chain: row.chain || '산업기계',
      semType: row.semType || row.chain || '산업기계',
      semTypeEn: row.semTypeEn || '',
      products: row.products || '',
      productsEn: row.productsEn || '',
      partners: row.partners || [],
      mcapWon: row.mcapWon || 0,
    });
  }
}
machinery = [...byTicker.values()].filter((c) => {
  const home = exclusiveSector(c.ticker);
  return !home || home === 'machinery';
});

console.log(
  `split metal ${all.length} → metal ${metalKeep.length}, machinery ${machinery.length}`,
);
console.log(
  'machinery tickers:',
  machinery.map((c) => `${padTicker(c.ticker)}(${c.name})`).join(', '),
);

const sourceHtml = fs.readFileSync(SRC, 'utf8');

writeSplitMap({
  root: ROOT,
  sourceHtml,
  companies: machinery,
  chains: MACHINERY_CHAINS,
  colors: MACHINERY_COLORS,
  folder: 'machinery',
  file: 'korea_machinery_map.html',
  dataSector: 'machinery',
  titleKo: '한국 산업·건설기계 투자 지도',
  titleEn: 'Korea Industrial & Construction Machinery Map',
  subtitleKo: '건설기계·공작기계·산업설비·승강기 관련 상장사',
  subtitleEn: 'Listed Korean construction, machine-tool and industrial-equipment names',
  titleReplacePairs: [
    ['한국 철강·금속·기계 투자 지도', '한국 산업·건설기계 투자 지도'],
    ['Korea Steel, Metals & Machinery Map', 'Korea Industrial & Construction Machinery Map'],
    ['korea_metal_map.html', 'korea_machinery_map.html'],
    ['/metal/', '/machinery/'],
    ['../metal/', '../machinery/'],
    ['data-sector="metal"', 'data-sector="machinery"'],
  ],
});

rewriteMapInPlace({
  htmlPath: SRC,
  companies: metalKeep,
  chains: METAL_CHAINS,
  colors: METAL_COLORS,
  titleKo: '한국 철강·비철금속 투자 지도',
  titleEn: 'Korea Steel & Nonferrous Metals Map',
  subtitleKo: '철강·비철금속·철강 트레이딩 관련 상장사',
  subtitleEn: 'Listed Korean steel, nonferrous metals and steel trading names',
  mapUrl: 'https://www.investingmap.kr/metal/korea_metal_map.html',
  titleReplacePairs: [
    ['한국 철강·금속·기계 투자 지도', '한국 철강·비철금속 투자 지도'],
    ['Korea Steel, Metals & Machinery Map', 'Korea Steel & Nonferrous Metals Map'],
  ],
});

// Only claim exclusives for tickers spun from metal that are not already parked elsewhere.
const claim = machinery
  .map((c) => padTicker(c.ticker))
  .filter((t) => {
    const home = exclusiveSector(t);
    return !home || home === 'machinery' || home === 'metal';
  });
updateExclusiveForTickers(
  path.join(ROOT, 'lib', 'sector_exclusive.mjs'),
  claim,
  'metal',
  'machinery',
);

console.log('Done split_metal_sectors.mjs (run build_hub_index after both splits)');
