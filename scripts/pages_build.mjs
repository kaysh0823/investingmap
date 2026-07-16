/**
 * Cloudflare Pages build: copy static site assets into dist/
 * (Dashboard build output directory is often set to "dist".)
 *
 * Sector folders are discovered automatically: any immediate child of the
 * repo root that contains a file matching `korea_*_map.html` is copied.
 * Root `*.html` pages are likewise discovered so new trust pages are not omitted.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, 'dist');

/** Non-HTML root assets that must ship with every deploy. */
const ROOT_STATIC_FILES = [
  'ads.txt',
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'favicon.svg',
];

/** Always copy these trees (not sector maps). */
const ALWAYS_DIRS = ['js', 'data'];

function isKoreaMapHtml(name) {
  return /^korea_.+_map\.html$/i.test(name);
}

/** Immediate child dirs that contain at least one korea_*_map.html. */
function discoverMapDirs() {
  const dirs = [];
  for (const ent of fs.readdirSync(repo, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'dist' || ent.name.startsWith('.')) continue;
    const dirPath = join(repo, ent.name);
    let hasMap = false;
    try {
      for (const name of fs.readdirSync(dirPath)) {
        if (isKoreaMapHtml(name)) {
          hasMap = true;
          break;
        }
      }
    } catch {
      continue;
    }
    if (hasMap) dirs.push(ent.name);
  }
  return dirs.sort();
}

/** All `*.html` files sitting at the repo root. */
function discoverRootHtml() {
  return fs
    .readdirSync(repo, { withFileTypes: true })
    .filter((ent) => ent.isFile() && ent.name.endsWith('.html'))
    .map((ent) => ent.name)
    .sort();
}

const rootFiles = [...new Set([...discoverRootHtml(), ...ROOT_STATIC_FILES])].sort();
const rootDirs = [...new Set([...ALWAYS_DIRS, ...discoverMapDirs()])].sort();

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of rootFiles) {
  const src = join(repo, f);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', f);
    continue;
  }
  fs.copyFileSync(src, join(out, f));
}

for (const d of rootDirs) {
  const src = join(repo, d);
  if (!fs.existsSync(src)) {
    console.warn('skip missing dir', d);
    continue;
  }
  fs.cpSync(src, join(out, d), { recursive: true });
}

console.log('OK pages build -> dist/');
console.log('  files:', rootFiles.join(', '));
console.log('  dirs:', rootDirs.join(', '));
