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
  // Rebuild regenerates cloned maps (robot←semi, renewable←battery, …) and can
  // leave investingmap-seo WebPage JSON-LD pointing at the template sector.
  // Resync before patch_geo (which only fixes geo-webpage).
  ['node', ['scripts/patch_seo.mjs']],
  ['node', ['scripts/build_trust_pages.mjs']],
  ['node', ['scripts/patch_global_search.mjs']],
  ['node', ['scripts/patch_geo.mjs']],
  ['node', ['scripts/patch_mobile_table.mjs']],
  ['node', ['scripts/patch_candle_modal.mjs']],
  ['node', ['scripts/patch_heatmap_chg.mjs']],
  // Trust pages + later patches may rewrite HTML — re-ensure AdSense before hash stamp.
  ['node', ['scripts/patch_adsense_head.mjs']],
  // Must be last after every patch_* that may insert/rewrite script tags.
  ['node', ['scripts/patch_asset_versions.mjs']],
  ['node', ['scripts/pages_build.mjs']],
  ['npm', ['run', 'verify:dist']],
  ['node', ['scripts/fix_canonical_domain.mjs']],
];

for (const [cmd, args] of steps) run(cmd, args);
