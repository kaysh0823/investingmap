/**
 * Assert sector map HTML (+ dist): correct header nesting for title-row,
 * badges, subtitle, and editorial toggle.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasTopLevelRule } from '../lib/css_blocks.mjs';

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

function extractBalancedDiv(html, startIdx) {
  if (startIdx < 0 || !/^<div\b/i.test(html.slice(startIdx))) return null;
  let depth = 0;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = startIdx;
  let m;
  while ((m = re.exec(html))) {
    if (/^<\//.test(m[0])) {
      depth -= 1;
      if (depth === 0) {
        return {
          start: startIdx,
          end: m.index + m[0].length,
          outer: html.slice(startIdx, m.index + m[0].length),
        };
      }
    } else {
      depth += 1;
    }
  }
  return null;
}

function findOpenById(html, tag, id) {
  const re = new RegExp(`<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const m = re.exec(html);
  return m ? m.index : -1;
}

function enclosingDivClass(html, pos) {
  // Walk back to find the nearest unclosed <div class="..."> that still contains pos.
  const opens = [];
  const re = /<\/?div\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) && m.index < pos) {
    if (/^<\//.test(m[0])) {
      opens.pop();
    } else {
      const cls = (m[0].match(/\bclass=["']([^"']*)["']/i) || [])[1] || '';
      opens.push(cls);
    }
  }
  return opens.length ? opens[opens.length - 1] : '';
}

/** Static collapse CSS must live in <style> at brace depth 0 (not only JS-injected). */
function hasStaticEditorialCollapseCss(html) {
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) {
    const css = m[1];
    if (
      css.includes('investingmap-header-editorial-toggle-v2') &&
      hasTopLevelRule(css, '.map-editorial-panel.is-collapsed')
    ) {
      return true;
    }
  }
  return false;
}

function checkStaticCollapseCss(rel, html, label) {
  if (!html.includes('id="map-editorial-panel"') && !html.includes("id='map-editorial-panel'")) {
    return [];
  }
  if (!hasStaticEditorialCollapseCss(html)) {
    return [
      `${label}: missing static CSS .map-editorial-panel.is-collapsed { display: none } in <style> (editorial-toggle-v2)`,
    ];
  }
  return [];
}

function checkHtml(rel, html, label) {
  const failures = [];

  if (!html.includes('id="map-editorial-panel"') && !html.includes("id='map-editorial-panel'")) {
    return failures;
  }

  const rowOpen = html.search(
    /<div\b[^>]*\bclass=["'][^"']*\bheader-title-row\b[^"']*["'][^>]*>/i,
  );
  if (rowOpen < 0) {
    failures.push(`${label}: missing .header-title-row`);
    return failures;
  }
  const row = extractBalancedDiv(html, rowOpen);
  if (!row) {
    failures.push(`${label}: unbalanced .header-title-row`);
    return failures;
  }
  if (!/id=["']hdr-title["']/.test(row.outer)) {
    failures.push(`${label}: #hdr-title not inside .header-title-row`);
  }
  if (/id=["']hdr-subtitle["']/.test(row.outer)) {
    failures.push(`${label}: #hdr-subtitle must not be inside .header-title-row`);
  }
  if (/id=["']map-editorial-toggle["']/.test(row.outer)) {
    failures.push(`${label}: #map-editorial-toggle must not be inside .header-title-row`);
  }

  const metaOpen = row.outer.search(
    /<div\b[^>]*\bclass=["'][^"']*\bheader-meta(?:\s|["'])[^"']*\bheader-meta-inline\b[^"']*["'][^>]*>/i,
  );
  const metaOpenAlt = row.outer.search(
    /<div\b[^>]*\bclass=["'][^"']*\bheader-meta-inline\b[^"']*["'][^>]*>/i,
  );
  const metaIdx = metaOpen >= 0 ? metaOpen : metaOpenAlt;
  if (metaIdx < 0) {
    failures.push(`${label}: missing .header-meta-inline inside .header-title-row`);
  } else {
    const meta = extractBalancedDiv(row.outer, metaIdx);
    if (!meta) {
      failures.push(`${label}: unbalanced .header-meta-inline`);
    } else {
      const total = (meta.outer.match(/id=["']badge-total["']/g) || []).length;
      const market = (meta.outer.match(/id=["']badge-market["']/g) || []).length;
      const badgeDivs = (meta.outer.match(/<div\b[^>]*\bclass=["'][^"']*\bbadge\b/gi) || [])
        .length;
      if (total !== 1 || market !== 1 || badgeDivs !== 2) {
        failures.push(
          `${label}: .header-meta-inline needs exactly 2 badges (#badge-total, #badge-market); got total=${total} market=${market} badgeDivs=${badgeDivs}`,
        );
      }
    }
  }

  const subIdx = findOpenById(html, 'p', 'hdr-subtitle');
  const toggleIdx = findOpenById(html, 'button', 'map-editorial-toggle');
  if (subIdx < 0) failures.push(`${label}: missing #hdr-subtitle`);
  if (toggleIdx < 0) failures.push(`${label}: missing #map-editorial-toggle`);

  if (subIdx >= 0) {
    if (subIdx > rowOpen && subIdx < row.end) {
      failures.push(`${label}: #hdr-subtitle is a descendant of .header-title-row`);
    }
    const parentCls = enclosingDivClass(html, subIdx);
    if (!/\bheader\b/.test(parentCls) || /\bheader-title-row\b/.test(parentCls)) {
      failures.push(
        `${label}: #hdr-subtitle parent should be .header (got class="${parentCls}")`,
      );
    }
  }

  if (toggleIdx >= 0) {
    if (toggleIdx > rowOpen && toggleIdx < row.end) {
      failures.push(`${label}: #map-editorial-toggle is a descendant of .header-title-row`);
    }
    const parentCls = enclosingDivClass(html, toggleIdx);
    if (!/\bheader\b/.test(parentCls) || /\bheader-title-row\b/.test(parentCls)) {
      failures.push(
        `${label}: #map-editorial-toggle parent should be .header (got class="${parentCls}")`,
      );
    }
    const toggleCount = (html.match(/id=["']map-editorial-toggle["']/g) || []).length;
    if (toggleCount !== 1) {
      failures.push(`${label}: expected exactly 1 #map-editorial-toggle, got ${toggleCount}`);
    }
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
let distChecked = 0;
const failures = [];

for (const rel of listMapHtml(ROOT)) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('id="map-editorial-panel"') && !html.includes("id='map-editorial-panel'")) {
    continue;
  }
  checked++;
  failures.push(...checkHtml(rel, html, rel));
  failures.push(...checkStaticCollapseCss(rel, html, rel));
}

if (fs.existsSync(DIST)) {
  for (const rel of listMapHtml(DIST)) {
    const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
    if (!html.includes('id="map-editorial-panel"') && !html.includes("id='map-editorial-panel'")) {
      continue;
    }
    distChecked++;
    failures.push(...checkHtml(rel, html, `dist/${rel}`));
    failures.push(...checkStaticCollapseCss(rel, html, `dist/${rel}`));
  }
}

assert.ok(checked >= 20, `expected many sector maps with editorial panel, got ${checked}`);
if (failures.length) {
  for (const f of failures) console.error('  FAIL', f);
  console.error(
    `verify:editorial-toggle FAILED — ${failures.length} issue(s) across ${checked} source + ${distChecked} dist maps`,
  );
  process.exit(1);
}
console.log(
  `verify:editorial-toggle OK — ${checked} source maps` +
    (distChecked ? ` + ${distChecked} dist maps (static collapse CSS)` : ''),
);
