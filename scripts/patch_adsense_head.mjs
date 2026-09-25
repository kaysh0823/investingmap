/**
 * Ensure Google AdSense loader is in every page <head> exactly once.
 * Publisher: ca-pub-6448775418895050 — do not change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ADSENSE_CLIENT = 'ca-pub-6448775418895050';
export const ADSENSE_MARKER = `adsbygoogle.js?client=${ADSENSE_CLIENT}`;

export const ADSENSE_SNIPPET =
  `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}"\n` +
  `    crossorigin="anonymous"></script>`;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'functions',
  'dist',
  'supabase',
  '.wrangler',
  'coverage',
  '.tmp',
]);

const ROOT_HTML = [
  'about.html',
  'authors.html',
  'disclaimer.html',
  'editorial-policy.html',
  'faq.html',
  'privacy.html',
  'index.html',
];

function collectTargets() {
  const out = [];
  for (const rel of ROOT_HTML) {
    const fp = path.join(ROOT, rel);
    if (fs.existsSync(fp)) out.push(fp);
  }
  let ents;
  try {
    ents = fs.readdirSync(ROOT, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
    const dir = path.join(ROOT, ent.name);
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of files) {
      if (/^korea_.+_map\.html$/i.test(name)) {
        out.push(path.join(dir, name));
      }
    }
  }
  return out;
}

function patchFile(fp) {
  const before = fs.readFileSync(fp, 'utf8');
  if (before.includes(ADSENSE_MARKER)) {
    return 'skip';
  }
  if (!/<\/head>/i.test(before)) {
    console.warn('WARN no </head>:', path.relative(ROOT, fp).replace(/\\/g, '/'));
    return 'skip';
  }
  const after = before.replace(/<\/head>/i, `  ${ADSENSE_SNIPPET}\n</head>`);
  if (after === before) return 'skip';
  fs.writeFileSync(fp, after, 'utf8');
  return 'insert';
}

function main() {
  const files = collectTargets();
  let inserted = 0;
  let skipped = 0;
  for (const fp of files) {
    const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
    const result = patchFile(fp);
    if (result === 'insert') {
      inserted += 1;
      console.log('inserted', rel);
    } else {
      skipped += 1;
    }
  }
  console.log(
    `OK patch_adsense_head — inserted ${inserted}, skipped ${skipped}, total ${files.length}`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();

export { main as patchAdsenseHead, collectTargets };
