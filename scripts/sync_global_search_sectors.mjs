/**
 * Sync js/global_search.js SECTOR_MAP + SECTOR_LABELS from sector_meta.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECTOR_META, HUB_MAP_PATHS } from '../lib/sector_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fp = path.join(ROOT, 'js', 'global_search.js');
let t = fs.readFileSync(fp, 'utf8');

const order = HUB_MAP_PATHS.map(([id]) => id);
const mapLines = order.map((id) => `    ${id}: '${SECTOR_META[id].map}',`).join('\n');
const labelLines = order
  .map(
    (id) =>
      `    ${id}: { ko: ${JSON.stringify(SECTOR_META[id].ko)}, en: ${JSON.stringify(SECTOR_META[id].en)} },`,
  )
  .join('\n');

t = t.replace(
  /var SECTOR_MAP = \{[\s\S]*?\n  \};/,
  `var SECTOR_MAP = {\n${mapLines}\n  };`,
);
t = t.replace(
  /var SECTOR_LABELS = \{[\s\S]*?\n  \};/,
  `var SECTOR_LABELS = {\n${labelLines}\n  };`,
);
fs.writeFileSync(fp, t, 'utf8');
console.log('OK global_search SECTOR_MAP/LABELS', order.length);
