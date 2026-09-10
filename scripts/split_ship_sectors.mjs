/**
 * Split ship map:
 *   ship (in place) — 조선·기자재 (remove 해운물류)
 *   shipping (new) — 해운·물류 only
 * Keeps ship/ folder, URL, sector key. Performance series for shipping start at split.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import {
  padTicker,
  rewriteMapInPlace,
  updateExclusiveForTickers,
  writeSplitMap,
} from '../lib/split_map_scaffold.mjs';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'ship', 'korea_ship_map.html');
const SPIN_CHAIN = '해운물류';

const SHIP_COLORS = {
  종합조선: '#4FC3F7',
  엔진: '#66BB6A',
  '의장/배관': '#26C6DA',
  '선체·보냉·구조재': '#FFCA28',
  '서비스·해양플랜트': '#FFA726',
};
const SHIP_CHAINS = Object.keys(SHIP_COLORS);
const SHIPPING_COLORS = { 해운물류: '#EF5350' };
const SHIPPING_CHAINS = ['해운물류'];

const all = extractCompaniesFromHtml(fs.readFileSync(SRC, 'utf8'));
const shipping = all.filter((c) => c.chain === SPIN_CHAIN);
const shipKeep = all.filter((c) => c.chain !== SPIN_CHAIN);
const leftover = all.filter((c) => c.chain !== SPIN_CHAIN && !SHIP_COLORS[c.chain]);
if (leftover.length) {
  console.warn(
    'WARN unexpected ship chains:',
    leftover.map((c) => `${c.ticker}:${c.chain}`).join(', '),
  );
}
console.log(
  `split ship ${all.length} → ship ${shipKeep.length}, shipping ${shipping.length}`,
);
console.log(
  'shipping tickers:',
  shipping.map((c) => padTicker(c.ticker)).join(', '),
);

const sourceHtml = fs.readFileSync(SRC, 'utf8');

writeSplitMap({
  root: ROOT,
  sourceHtml,
  companies: shipping,
  chains: SHIPPING_CHAINS,
  colors: SHIPPING_COLORS,
  folder: 'shipping',
  file: 'korea_shipping_map.html',
  dataSector: 'shipping',
  titleKo: '한국 해운·물류 투자 지도',
  titleEn: 'Korea Shipping & Logistics Map',
  subtitleKo: '해운·항만·물류 관련 상장사',
  subtitleEn: 'Listed Korean shipping, port and logistics names',
  titleReplacePairs: [
    ['한국 조선/해운 산업 투자 지도', '한국 해운·물류 투자 지도'],
    ['한국 조선·조선기자재 산업 투자 지도', '한국 해운·물류 투자 지도'],
    ['Korea Shipbuilding & Shipping Map', 'Korea Shipping & Logistics Map'],
    ['korea_ship_map.html', 'korea_shipping_map.html'],
    ['/ship/', '/shipping/'],
    ['../ship/', '../shipping/'],
    ['data-sector="ship"', 'data-sector="shipping"'],
  ],
});

rewriteMapInPlace({
  htmlPath: SRC,
  companies: shipKeep,
  chains: SHIP_CHAINS,
  colors: SHIP_COLORS,
  titleKo: '한국 조선·기자재 투자 지도',
  titleEn: 'Korea Shipbuilding & Marine Equipment Map',
  subtitleKo: '조선·해양플랜트·선박기자재 관련 상장사',
  subtitleEn: 'Listed Korean shipbuilding, offshore and marine-equipment names',
  mapUrl: 'https://www.investingmap.kr/ship/korea_ship_map.html',
  titleReplacePairs: [
    ['한국 조선/해운 산업 투자 지도', '한국 조선·기자재 투자 지도'],
    ['한국 조선·조선기자재 산업 투자 지도', '한국 조선·기자재 투자 지도'],
    ['Korea Shipbuilding & Shipping Map', 'Korea Shipbuilding & Marine Equipment Map'],
  ],
});

updateExclusiveForTickers(
  path.join(ROOT, 'lib', 'sector_exclusive.mjs'),
  shipping.map((c) => c.ticker),
  'ship',
  'shipping',
);

console.log('Done split_ship_sectors.mjs (run build_hub_index after both splits)');
