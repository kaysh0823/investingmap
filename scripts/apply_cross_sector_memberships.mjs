/**
 * Assert SECTOR_CROSS policy (approved multi-home allowlist only).
 */
import { SECTOR_CROSS } from '../lib/sector_exclusive.mjs';

const ALLOWED_CROSS = {
  '377300': ['finance', 'software'],
  '028260': ['construction', 'kconsume'],
  '034020': ['nuclear', 'powergrid'],
};

function sameSet(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const sa = [...a].sort().join(',');
  const sb = [...b].sort().join(',');
  return sa === sb;
}

const active = Object.entries(SECTOR_CROSS);
const unexpected = [];
for (const [ticker, sectors] of active) {
  const allowed = ALLOWED_CROSS[ticker];
  if (!allowed || !sameSet(sectors, allowed)) {
    unexpected.push(`${ticker}=${(sectors || []).join(',')}`);
  }
}
for (const [ticker, sectors] of Object.entries(ALLOWED_CROSS)) {
  if (!SECTOR_CROSS[ticker] || !sameSet(SECTOR_CROSS[ticker], sectors)) {
    unexpected.push(`missing approved cross ${ticker}=${sectors.join(',')}`);
  }
}

if (unexpected.length) {
  throw new Error(`SECTOR_CROSS policy violation: ${unexpected.join('; ')}`);
}

console.log(
  'OK SECTOR_CROSS policy — approved:',
  active.map(([t, s]) => `${t}=${s.join('+')}`).join(', ') || '(none)',
);
