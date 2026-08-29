/**
 * Phase 2.7 — canonical entity normalization for pilot networks.
 * Run: node scripts/normalize_network_entities_phase27.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeNetworkEntities,
  auditEntityIssues,
  DOMESTIC_ANCHOR_TICKERS,
} from '../lib/relation_network/entity_normalize.mjs';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PILOTS = ['semiconductor', 'holdings', 'defense', 'bio'];
const OUT = join(ROOT, 'data', 'entity_normalize_phase27_changelog.json');

const changelog = { normalizedAt: '2026-08-22', sectors: {} };

for (const sector of PILOTS) {
  const fp = join(ROOT, 'data', 'networks', `${sector}.json`);
  const network = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const beforeIds = new Set((network.nodes || []).map((n) => n.id));

  const { remap, removed, merged } = normalizeNetworkEntities(network);
  network.lastReviewedAt = '2026-08-22';

  const entityIssues = auditEntityIssues(network);
  const { failures, warnings } = validateNetworkReport(network);

  fs.writeFileSync(fp, JSON.stringify(network, null, 2) + '\n', 'utf8');

  changelog.sectors[sector] = {
    remap: [...remap.entries()].map(([from, to]) => ({ from, to })),
    removed,
    merged,
    entityIssues,
    validateFailures: failures.length,
    validateWarnings: warnings.length,
  };

  console.log(`\n${sector}: merged ${merged.length}, removed ${removed.length}, entity issues ${entityIssues.length}`);
  merged.forEach((m) => console.log('  merge:', m));
  if (entityIssues.length) entityIssues.slice(0, 5).forEach((i) => console.log('  entity:', i));
}

// Patch semi_relations source for future migrate runs
const semiRelFp = join(ROOT, 'data', 'semi_relations.json');
const semiRel = JSON.parse(fs.readFileSync(semiRelFp, 'utf8'));
let relPatched = 0;
for (const hub of semiRel.hubs || []) {
  for (const bucket of ['suppliers', 'customers', 'peers']) {
    for (const rel of hub[bucket] || []) {
      if (rel.id === 'samsung_d' && !rel.ticker) {
        rel.ticker = '005930';
        rel.entityRole = 'domestic_anchor';
        relPatched++;
      }
      if (rel.id === 'skhynix_d' && !rel.ticker) {
        rel.ticker = '000660';
        rel.entityRole = 'domestic_anchor';
        relPatched++;
      }
    }
  }
}
if (relPatched) {
  fs.writeFileSync(semiRelFp, JSON.stringify(semiRel, null, 2) + '\n', 'utf8');
  console.log(`\nsemi_relations.json: tagged ${relPatched} domestic anchor entries with tickers`);
}

fs.writeFileSync(OUT, JSON.stringify(changelog, null, 2) + '\n', 'utf8');
console.log('\nWrote', OUT);
