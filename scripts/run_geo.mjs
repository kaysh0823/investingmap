import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const step of ['build_trust_pages.mjs', 'patch_geo.mjs']) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', step)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
