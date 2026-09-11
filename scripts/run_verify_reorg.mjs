/**
 * Aggregate §0-4 reorg verifiers (keeps package.json scripts short for IDE npm detection).
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = [
  'verify_powergrid_chain_split.mjs',
  'verify_ship_chain_split.mjs',
  'verify_semi_chain_split.mjs',
  'verify_energy_04_reclass.mjs',
  'verify_industry_04b_reclass.mjs',
  'verify_mobility_04c_reclass.mjs',
  'verify_tech_04d_reclass.mjs',
  'verify_health_04e_reclass.mjs',
  'verify_consumer_04f_reclass.mjs',
  'verify_finance_04g_reclass.mjs',
  'verify_needs_review_closure.mjs',
  'verify_p1_cross_relations.mjs',
  'verify_sector_chain_reorg.mjs',
];

for (const step of STEPS) {
  const script = join(ROOT, 'scripts', step);
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
