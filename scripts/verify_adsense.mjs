/**
 * Gate: every dist HTML page must contain the AdSense loader exactly once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADSENSE_MARKER } from './patch_adsense_head.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler']);

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

if (!fs.existsSync(DIST)) {
  console.error('FAIL verify_adsense: dist/ missing — run build first');
  process.exit(1);
}

const files = walkHtml(DIST);
const bad = [];

for (const fp of files) {
  const html = fs.readFileSync(fp, 'utf8');
  const n = html.split(ADSENSE_MARKER).length - 1;
  if (n !== 1) {
    bad.push({
      file: path.relative(DIST, fp).replace(/\\/g, '/'),
      count: n,
    });
  }
}

if (bad.length) {
  console.error('FAIL verify_adsense — AdSense marker must appear exactly once:');
  for (const row of bad) {
    console.error(`  ${row.file}: count=${row.count}`);
  }
  process.exit(1);
}

console.log(`verify:adsense OK — ${files.length} html files, marker exactly once each`);
