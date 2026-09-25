/**
 * Stamp content-hash ?v= on all HTML that references ../js or js/.
 * Run as the final patch step after every other patch_* (rebuild_site / run_build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearAssetVersionCache, stampAssetVersions } from './asset_versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'functions',
  'dist',
  'supabase',
  '.wrangler',
  'coverage',
]);

function walkHtml(dir, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtml(p, out);
    else if (ent.isFile() && /\.html$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function hasJsRef(html) {
  return /(?:\.\.\/|\/|^|["'\s])js\/[\w\-]+\.js/m.test(html);
}

function main() {
  clearAssetVersionCache();
  const files = walkHtml(ROOT);
  let n = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    if (!hasJsRef(before)) continue;
    if (!/\?v=/.test(before)) continue;
    const after = stampAssetVersions(before);
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      n += 1;
      console.log('stamped', path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  console.log(`OK patch_asset_versions — stamped ${n} / ${files.length} html`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();

export { main as patchAssetVersions };
