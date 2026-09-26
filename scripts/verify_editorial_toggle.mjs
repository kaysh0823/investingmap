/**
 * Assert sector map HTML (+ dist copies): header-title-row, editorial toggle,
 * no legacy map-title-toggle, panel starts collapsed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

function listMapHtml(base) {
  const out = [];
  if (!fs.existsSync(base)) return out;
  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(base, ent.name);
    for (const name of fs.readdirSync(dir)) {
      if (/^korea_.*_map\.html$/.test(name)) out.push(path.join(ent.name, name));
    }
  }
  return out.sort();
}

function checkHtml(rel, html, label) {
  const failures = [];

  const titleRowMatch = html.match(
    /<div class="header-title-row">([\s\S]*?)<\/div>\s*<p[^>]*id=["']hdr-subtitle["']/,
  );
  if (!titleRowMatch) {
    failures.push(`${label}: missing .header-title-row before #hdr-subtitle`);
  } else {
    const row = titleRowMatch[1];
    if (!/id=["']hdr-title["']/.test(row)) {
      failures.push(`${label}: #hdr-title not inside .header-title-row`);
    }
    if (!/id=["']badge-total["']/.test(row)) {
      failures.push(`${label}: #badge-total not inside .header-title-row`);
    }
  }

  const toggleCount = (html.match(/id=["']map-editorial-toggle["']/g) || []).length;
  if (toggleCount !== 1) {
    failures.push(`${label}: expected exactly 1 #map-editorial-toggle, got ${toggleCount}`);
  }

  const legacyCount = (html.match(/map-title-toggle/g) || []).length;
  if (legacyCount !== 0) {
    failures.push(`${label}: expected 0 map-title-toggle, got ${legacyCount}`);
  }

  if (!/id=["']map-editorial-panel["'][^>]*class=["'][^"']*is-collapsed/.test(html)) {
    failures.push(`${label}: #map-editorial-panel missing is-collapsed`);
  }

  return failures;
}

let checked = 0;
const failures = [];

for (const rel of listMapHtml(ROOT)) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('id="map-editorial-panel"') && !html.includes("id='map-editorial-panel'")) {
    continue; // stub / landing without editorial
  }
  checked++;
  failures.push(...checkHtml(rel, html, rel));
}

if (fs.existsSync(DIST)) {
  for (const rel of listMapHtml(DIST)) {
    const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
    if (!html.includes('id="map-editorial-panel"') && !html.includes("id='map-editorial-panel'")) {
      continue;
    }
    failures.push(...checkHtml(rel, html, `dist/${rel}`));
  }
}

assert.ok(checked >= 20, `expected many sector maps with editorial panel, got ${checked}`);
if (failures.length) {
  for (const f of failures) console.error('  FAIL', f);
  console.error(`verify:editorial-toggle FAILED — ${failures.length} issue(s)`);
  process.exit(1);
}
console.log(`verify:editorial-toggle OK — ${checked} source maps (+ dist when present)`);
