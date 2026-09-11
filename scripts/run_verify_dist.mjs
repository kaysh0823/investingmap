import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = [
  'verify_dist_js.mjs',
  'verify_heatmap_exclude_chips.mjs',
  'verify_global_search.mjs',
  'verify_volatility.mjs',
];

for (const step of STEPS) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', step)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
