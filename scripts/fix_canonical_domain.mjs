/**
 * Rewrite SEO/canonical metadata host to the preferred public domain.
 *
 * Does NOT add HTTP redirects between investing-kr.com and investingmap.kr —
 * both hosts keep serving the same content. This only updates strings used for
 * <link rel="canonical">, og:url, hreflang, JSON-LD, sitemap <loc>, robots
 * Sitemap:, and llms.txt links so search engines treat investingmap.kr as
 * the preferred URL.
 *
 * Prefer running after rebuild_site / patch_geo so later generators do not
 * reintroduce the old host. Safe to re-run.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Live apex + www both 200 with no cross-redirect; prefer www for SEO unity. */
export const CANONICAL_ORIGIN = 'https://www.investingmap.kr';

const OLD_HOST_RE =
  /https?:\/\/(?:www\.)?investing-kr\.com/gi;

const TEXT_EXT = new Set(['.html', '.xml', '.txt', '.json', '.js', '.mjs', '.md']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'functions',
  '.wrangler',
  '.cache',
]);

function shouldScan(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXT.has(ext);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith('.') && name.name !== '.well-known') continue;
    if (SKIP_DIRS.has(name.name)) continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (shouldScan(full)) out.push(full);
  }
  return out;
}

function rewrite(text) {
  return text.replace(OLD_HOST_RE, CANONICAL_ORIGIN);
}

function main() {
  const files = walk(ROOT);
  let changed = 0;
  let hits = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    if (!OLD_HOST_RE.test(before)) continue;
    OLD_HOST_RE.lastIndex = 0;
    const after = rewrite(before);
    if (after === before) continue;
    const n = (before.match(OLD_HOST_RE) || []).length;
    OLD_HOST_RE.lastIndex = 0;
    hits += n;
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
    console.log('updated', path.relative(ROOT, file), `(${n})`);
  }
  console.log(
    `OK fix_canonical_domain → ${CANONICAL_ORIGIN} (${changed} files, ${hits} replacements)`
  );
}

main();
