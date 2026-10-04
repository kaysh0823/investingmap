#!/usr/bin/env node
/**
 * Map header badges (i18n + static) must match koreanCompanies in every built map.
 * Checks dist/ when present (what Pages serves), else the source maps.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { countBadges, readBadgeNumbers } from './sync_map_badges.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : ROOT;

const errors = [];
let checked = 0;
for (const d of fs.readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'node_modules') continue;
  const file = path.join(BASE, d.name, `korea_${d.name}_map.html`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('const koreanCompanies = ')) continue;
  let companies;
  try {
    companies = extractCompaniesFromHtml(html);
  } catch {
    continue;
  }
  checked += 1;
  const want = countBadges(companies);
  for (const b of readBadgeNumbers(html)) {
    const bad = b.total != null
      ? b.total !== want.total
      : (b.kospi != null && b.kospi !== want.kospi) || (b.kosdaq != null && b.kosdaq !== want.kosdaq);
    if (bad) {
      const got = b.total != null ? b.total : `${b.kospi}/${b.kosdaq}`;
      const exp = b.total != null ? want.total : `${want.kospi}/${want.kosdaq}`;
      errors.push(`${d.name} ${b.key}: ${got} ≠ ${exp}`);
    }
  }
}

if (!checked) {
  console.error('verify_map_badges: no maps found');
  process.exit(1);
}
if (errors.length) {
  console.error(`verify_map_badges FAIL (${errors.length})\n  ${errors.join('\n  ')}`);
  console.error('Run: node scripts/sync_map_badges.mjs');
  process.exit(1);
}
console.log(`verify_map_badges OK (${checked} maps, ${path.relative(ROOT, BASE) || '.'})`);
