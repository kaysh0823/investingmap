/** Publish the two semiconductor sectors from the legacy map. */
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { SEMI_BE_CHAINS } from '../lib/semi_chain_ui.mjs';
import { buildSplitSectorMaps } from './build_split_sector_maps.mjs';

const frontInspection = new Set(['140860', '348210']); // Wafer inspection and metrology
const backChains = new Set(SEMI_BE_CHAINS);
buildSplitSectorMaps({
  sourcePath: SECTOR_META.semi.map,
  sourceGraph: 'data/netmap/semiconductor.json',
  graphSlugs: { semifront: 'semiconductor_front', semiback: 'semiconductor_back' },
  sectorFor: ({ chain, ticker }) =>
    backChains.has(chain) && !frontInspection.has(ticker) ? 'semiback' : 'semifront',
  transformPage: (source, id, meta) => source
    .replace('data-sector="semi"', `data-sector="${id}"`)
    .replaceAll('한국 반도체 산업 투자 지도', `${meta.ko} 투자 지도`)
    .replaceAll('Korea Semiconductor Industry Investment Map', `${meta.en} Investment Map`)
    .replaceAll('Korea Semiconductor Investment Map', `${meta.en} Investment Map`),
});
