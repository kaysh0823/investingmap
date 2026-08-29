/**
 * apply_bigchip_relation_network — thin wrapper over shared curated relation patches.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SEMI_VALUE_CHAIN_ORDER } from '../lib/curated_sector_configs.mjs';
import { applyCuratedRelationPatches } from '../lib/curated_relation_network.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'bigchip', 'korea_bigchip_map.html');

export function applyBigchipRelationNetwork(options = {}) {
  const chainOrder = options.chainOrder || SEMI_VALUE_CHAIN_ORDER;
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  if (html.includes('RelationNetwork v2') || html.includes('relation_network.js')) {
    console.log('OK apply_bigchip_relation_network (skip — RelationNetwork v2 active)');
    return;
  }
  html = applyCuratedRelationPatches(html, {
    mode: 'ticker',
    chainOrder,
    skipChainChips: false,
    sidebarTitleKo: '밸류체인',
    i18nVer: '8',
    heatmapVer: '14',
    patchPartnerCell: true,
  });
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('OK apply_bigchip_relation_network');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyBigchipRelationNetwork();
}
