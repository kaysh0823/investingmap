/**
 * Full site build pipeline (keeps package.json scripts short for IDE npm detection).
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const steps = [
  ['node', ['scripts/rebuild_site.mjs']],
  ['node', ['scripts/build_trust_pages.mjs']],
  ['node', ['scripts/patch_global_search.mjs']],
  ['node', ['scripts/patch_geo.mjs']],
  ['node', ['scripts/patch_mobile_table.mjs']],
  ['node', ['scripts/patch_candle_modal.mjs']],
  ['node', ['scripts/patch_heatmap_chg.mjs']],
  ['node', ['scripts/pages_build.mjs']],
  ['npm', ['run', 'verify:dist']],
  ['node', ['scripts/fix_canonical_domain.mjs']],
];

for (const [cmd, args] of steps) run(cmd, args);
