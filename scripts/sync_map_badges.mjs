#!/usr/bin/env node
/**
 * Recompute map header badges (total / KOSPI·KOSDAQ split) from koreanCompanies.
 *
 * Earlier patchers only matched the single-quoted i18n form (`badgeTotal: '...'`),
 * while most maps carry JSON i18n (`"badgeTotal": "..."`). The runtime i18n then
 * overwrote the correct static badge with a stale count. Run after every step that
 * changes map membership. Only the numbers inside <span> are replaced; wording is kept.
 *
 * Usage: node scripts/sync_map_badges.mjs [--check]
 *   --check  report mismatches and exit 1 without writing
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** i18n entries in either `"key": "..."` or `key: '...'` form. */
const I18N_RE = /(["']?)(badgeTotal|badgeMarket)\1(\s*:\s*)(["'])((?:\\.|(?!\4)[^\\])*)\4/g;
const STATIC_RE = /(<div class="badge" id="(badge-total|badge-market)">)([\s\S]*?)(<\/div>)/g;

function listMapFiles() {
  const out = [];
  for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'dist' || d.name === 'node_modules') continue;
    const file = path.join(ROOT, d.name, `korea_${d.name}_map.html`);
    if (fs.existsSync(file)) out.push(file);
  }
  return out.sort();
}

export function countBadges(companies) {
  let kospi = 0;
  let kosdaq = 0;
  for (const c of companies) {
    if (c.market === 'KOSPI') kospi += 1;
    else if (c.market === 'KOSDAQ') kosdaq += 1;
  }
  return { total: companies.length, kospi, kosdaq };
}

function patchTotal(text, n) {
  return text.replace(/<span>\d+<\/span>/, `<span>${n}</span>`);
}

function patchMarket(text, kospi, kosdaq) {
  return text
    .replace(/(KOSPI <span>)\d+(<\/span>)/, `$1${kospi}$2`)
    .replace(/(KOSDAQ <span>)\d+(<\/span>)/, `$1${kosdaq}$2`);
}

export function patchBadgesHtml(html, { total, kospi, kosdaq }) {
  const fix = (key, text) => (key === 'badgeTotal' || key === 'badge-total'
    ? patchTotal(text, total)
    : patchMarket(text, kospi, kosdaq));
  return html
    .replace(I18N_RE, (all, q1, key, sep, q2, text) => `${q1}${key}${q1}${sep}${q2}${fix(key, text)}${q2}`)
    .replace(STATIC_RE, (all, open, id, text, close) => `${open}${fix(id, text)}${close}`);
}

/** Numbers currently shown in every badge string of the page. */
export function readBadgeNumbers(html) {
  const found = [];
  const read = (key, text) => {
    if (key === 'badgeTotal' || key === 'badge-total') {
      const m = text.match(/<span>(\d+)<\/span>/);
      if (m) found.push({ key, total: Number(m[1]) });
    } else {
      const a = text.match(/KOSPI <span>(\d+)<\/span>/);
      const b = text.match(/KOSDAQ <span>(\d+)<\/span>/);
      if (a || b) found.push({ key, kospi: a ? Number(a[1]) : null, kosdaq: b ? Number(b[1]) : null });
    }
  };
  for (const m of html.matchAll(I18N_RE)) read(m[2], m[5]);
  for (const m of html.matchAll(STATIC_RE)) read(m[2], m[3]);
  return found;
}

function main() {
  let changed = 0;
  let mismatched = 0;
  for (const file of listMapFiles()) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('const koreanCompanies = ')) continue;
    let companies;
    try {
      companies = extractCompaniesFromHtml(html);
    } catch (e) {
      console.warn(`  skip ${rel}: ${e.message}`);
      continue;
    }
    const counts = countBadges(companies);
    const next = patchBadgesHtml(html, counts);
    if (next === html) continue;
    mismatched += 1;
    const before = readBadgeNumbers(html)
      .map((b) => (b.total != null ? `${b.key}=${b.total}` : `${b.key}=${b.kospi}/${b.kosdaq}`))
      .join(' ');
    console.log(`  ${rel}: total ${counts.total} (KOSPI ${counts.kospi} · KOSDAQ ${counts.kosdaq}) ← ${before}`);
    if (!CHECK) {
      fs.writeFileSync(file, next, 'utf8');
      changed += 1;
    }
  }
  if (CHECK) {
    if (mismatched) {
      console.error(`sync_map_badges --check: ${mismatched} map(s) with stale badges`);
      process.exit(1);
    }
    console.log('sync_map_badges --check OK');
    return;
  }
  console.log(`sync_map_badges: updated ${changed} map(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
