/** Remove retired sector navigation after all legacy page patchers have run. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_MAP_PATHS } from '../lib/sector_meta.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexFile = path.join(ROOT, 'index.html');
let index = fs.readFileSync(indexFile, 'utf8');
index = index.replace(/<a\b[^>]*id="hub-link-holdings"[^>]*>[\s\S]*?<\/a>/g, '');
index = index.replace(/^.*document\.getElementById\('hub-link-holdings'\)\.href.*\r?\n/gm, '');
index = index.replace(/'software', 'holdings',/g, "'software',");
fs.writeFileSync(indexFile, index);
// Remove old SEO/sidebar anchor markup that may persist in non-rebuilt pages.
const pages = ['index.html', 'about.html', 'authors.html', 'faq.html', 'privacy.html', 'disclaimer.html', 'editorial-policy.html', ...HUB_MAP_PATHS.filter(([,rel]) => rel.endsWith('.html')).map(([,rel]) => rel)];
for (const rel of pages) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/<a\b[^>]*href=["'][^"']*holdings\/korea_holdings_map[^"']*["'][^>]*>[\s\S]*?<\/a>/g, '');
  fs.writeFileSync(file, content);
}
console.log('OK retired holdings navigation; legacy source kept only for historical rebuild stages');
