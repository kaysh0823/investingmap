/**
 * Classify verify:relation-network warnings (Phase 2.6 report).
 * Run: node scripts/classify_relation_warnings.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { PILOT_NETWORK_SECTORS } from '../lib/relation_network/profiles.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function classify(msg) {
  if (/weak evidence URL/.test(msg)) return 'human_source_review';
  if (/missing reviewStatus/.test(msg)) return 'human_source_review';
  if (/missing lastVerifiedAt/.test(msg)) return 'fix_required';
  if (/missing sourceType/.test(msg)) return 'fix_required';
  if (/overused evidence URL/.test(msg)) return 'duplicate_data';
  if (/orphan listed company/.test(msg)) return 'intended_orphan';
  if (/stakePct/.test(msg)) return 'intended_stake_null';
  if (/peer edges should be defaultHidden/.test(msg)) return 'fix_required';
  if (/legacy/.test(msg)) return 'legacy_fallback';
  return 'phase3_or_review';
}

const buckets = {};
const byEdge = [];

for (const sector of PILOT_NETWORK_SECTORS) {
  const fp = path.join(ROOT, 'data', 'networks', `${sector}.json`);
  const network = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const { warnings } = validateNetworkReport(network);
  warnings.forEach((w) => {
    const cat = classify(`${sector}: ${w}`);
    if (!buckets[cat]) buckets[cat] = [];
    buckets[cat].push(`${sector}: ${w}`);
    const m = w.match(/edge ([^\s]+)/);
    byEdge.push({ sector, edgeId: m ? m[1] : null, warning: w, category: cat });
  });
}

console.log(JSON.stringify({ total: byEdge.length, buckets, byEdge }, null, 2));
