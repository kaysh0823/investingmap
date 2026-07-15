/**
 * Fail if dist/js is out of sync with js/.
 * Run after `node scripts/pages_build.mjs`, or before commit when dist/ is used locally/deployed.
 */
import fs from 'fs';
import { createHash } from 'crypto';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'js');
const distDir = join(root, 'dist', 'js');

function walkJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkJsFiles(abs));
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      out.push(abs);
    }
  }
  return out.sort();
}

function sha256(path) {
  return createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

if (!fs.existsSync(srcDir)) {
  console.error('verify:dist FAIL — missing js/');
  process.exit(1);
}
if (!fs.existsSync(distDir)) {
  console.error('verify:dist FAIL — missing dist/js/ (run: node scripts/pages_build.mjs)');
  process.exit(1);
}

const srcFiles = walkJsFiles(srcDir);
const distFiles = walkJsFiles(distDir);
const srcRels = new Set(srcFiles.map((p) => relative(srcDir, p).replace(/\\/g, '/')));
const distRels = new Set(distFiles.map((p) => relative(distDir, p).replace(/\\/g, '/')));

const missing = [...srcRels].filter((r) => !distRels.has(r));
const extra = [...distRels].filter((r) => !srcRels.has(r));
const mismatched = [];

for (const rel of srcRels) {
  if (!distRels.has(rel)) continue;
  const a = join(srcDir, rel);
  const b = join(distDir, rel);
  if (sha256(a) !== sha256(b)) mismatched.push(rel);
}

if (missing.length || mismatched.length || extra.length) {
  if (missing.length) {
    console.error('verify:dist FAIL — missing in dist/js:\n  ' + missing.join('\n  '));
  }
  if (mismatched.length) {
    console.error('verify:dist FAIL — content differs:\n  ' + mismatched.join('\n  '));
  }
  if (extra.length) {
    console.error('verify:dist FAIL — extra in dist/js (not in js/):\n  ' + extra.join('\n  '));
  }
  console.error('Fix: node scripts/pages_build.mjs');
  process.exit(1);
}

console.log(`verify:dist OK — ${srcFiles.length} js file(s) match dist/js/`);
