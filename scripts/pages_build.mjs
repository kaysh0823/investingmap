/**
 * Cloudflare Pages build: copy static site assets into dist/
 * (Dashboard build output directory is often set to "dist".)
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, 'dist');

const ROOT_FILES = [
  'index.html',
  'ads.txt',
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'favicon.svg',
  'editorial-policy.html',
  'disclaimer.html',
  'authors.html',
  'faq.html',
];
const ROOT_DIRS = [
  'js',
  'data',
  'bio',
  'semiconductor',
  'robot',
  'ship',
  'defense',
  'energy',
  'powergrid',
  'kculture',
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of ROOT_FILES) {
  const src = join(repo, f);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', f);
    continue;
  }
  fs.copyFileSync(src, join(out, f));
}

for (const d of ROOT_DIRS) {
  const src = join(repo, d);
  if (!fs.existsSync(src)) {
    console.warn('skip missing dir', d);
    continue;
  }
  fs.cpSync(src, join(out, d), { recursive: true });
}

console.log('OK pages build -> dist/');
