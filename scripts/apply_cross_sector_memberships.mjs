/**
 * Assert SECTOR_CROSS policy — currently empty (all multi-home cleared to exclusive).
 */
import { SECTOR_CROSS } from '../lib/sector_exclusive.mjs';

const ALLOWED_CROSS = {};

const active = Object.entries(SECTOR_CROSS);
const unexpected = [];
for (const [ticker, sectors] of active) {
  unexpected.push(`${ticker}=${(sectors || []).join(',')}`);
}
for (const [ticker, sectors] of Object.entries(ALLOWED_CROSS)) {
  if (!SECTOR_CROSS[ticker]) {
    unexpected.push(`missing approved cross ${ticker}=${sectors.join(',')}`);
  }
}

if (unexpected.length) {
  throw new Error(`SECTOR_CROSS policy violation: ${unexpected.join('; ')}`);
}

console.log('OK SECTOR_CROSS policy — approved: (none)');
