/**
 * Cross-sector memberships are intentionally disabled.
 *
 * Keep this rebuild step as an assertion so a future SECTOR_CROSS addition
 * cannot silently reintroduce duplicate map membership.
 */
import { SECTOR_CROSS } from '../lib/sector_exclusive.mjs';

const active = Object.entries(SECTOR_CROSS);
if (active.length) {
  throw new Error(
    `SECTOR_CROSS must remain empty under the single-sector policy: ${active
      .map(([ticker, sectors]) => `${ticker}=${sectors.join(',')}`)
      .join('; ')}`,
  );
}

console.log('OK no active cross-sector memberships');
