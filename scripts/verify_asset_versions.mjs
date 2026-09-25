/**
 * Gate: every HTML ?v= for known JS assets must equal assetVersion(js/…).
 * Used by verify:dist — mismatch → exit 1 (immutable /js cache would serve stale JS).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS_FILES, assetVersion, clearAssetVersionCache, projectRoot } from './asset_versions.mjs';

const ROOT = projectRoot();
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'functions',
  'dist',
  'supabase',
  '.wrangler',
  'coverage',
]);

const REF_RE = /((?:\.\.\/|\/)?js\/([\w\-]+\.js))\?v=([\w.\-]+)/g;
const JS_SET = new Set(JS_FILES);

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

clearAssetVersionCache();

// Sanity: listed files exist
for (const rel of JS_FILES) {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `JS_FILES missing: ${rel}`);
}

const expected = Object.fromEntries(JS_FILES.map((rel) => [path.basename(rel), assetVersion(rel)]));
const files = walkHtml(ROOT);
let checked = 0;
const mismatches = [];
const perAssetSeen = new Map(); // basename → Set of ?v= values across HTML

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const relHtml = path.relative(ROOT, file).replace(/\\/g, '/');
  REF_RE.lastIndex = 0;
  let m;
  while ((m = REF_RE.exec(html)) !== null) {
    const fileName = m[2];
    const ver = m[3];
    const rel = `js/${fileName}`;
    if (!JS_SET.has(rel)) continue;
    checked += 1;
    const want = expected[fileName];
    if (!perAssetSeen.has(fileName)) perAssetSeen.set(fileName, new Set());
    perAssetSeen.get(fileName).add(ver);
    if (ver !== want) {
      mismatches.push(`${relHtml}: ${fileName}?v=${ver} (want ${want})`);
    }
  }
}

if (mismatches.length) {
  console.error('FAIL verify_asset_versions — ?v= mismatch vs content hash:');
  for (const line of mismatches.slice(0, 40)) console.error(' ', line);
  if (mismatches.length > 40) console.error(`  … +${mismatches.length - 40} more`);
  process.exit(1);
}

// Sector maps must agree on the same hash for key assets
for (const name of ['live_quotes.js', 'map_valuation.js', 'rs_color_scale.js', 'map_tab_state.js']) {
  const seen = perAssetSeen.get(name);
  if (!seen || !seen.size) continue;
  assert.equal(
    seen.size,
    1,
    `${name}: sector HTML disagree on ?v= → ${[...seen].join(',')}`,
  );
  assert.equal([...seen][0], expected[name], `${name}: shared ?v= must be ${expected[name]}`);
}

assert.ok(checked > 0, 'expected at least one js/?v= reference to check');
console.log(
  `verify:asset_versions OK — checked ${checked} refs across ${files.length} html; `
    + `live_quotes=${expected['live_quotes.js']} map_valuation=${expected['map_valuation.js']} `
    + `rs_color_scale=${expected['rs_color_scale.js']} map_tab_state=${expected['map_tab_state.js']}`,
);
