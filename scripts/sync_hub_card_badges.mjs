#!/usr/bin/env node
/**
 * Static hub card badges in index.html ("N LISTINGS") from data/hub_index.json.
 * hub_dashboard.js rewrites them after load, but the pre-JS HTML (first paint,
 * crawlers) kept counts from whenever each card was last patched by hand.
 * Run after build_hub_index. Only the number is replaced.
 *
 * Usage: node scripts/sync_hub_card_badges.mjs [--check]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const INDEX = path.join(ROOT, 'index.html');
const HUB = path.join(ROOT, 'data', 'hub_index.json');

const hub = JSON.parse(fs.readFileSync(HUB, 'utf8'));
const html = fs.readFileSync(INDEX, 'utf8');
const stale = [];

const next = html.replace(
  /(id="card-([a-z0-9_]+)-badge">)(\d+|—)(\s*LISTINGS)/g,
  (all, open, sid, n, tail) => {
    const companies = hub.sectors?.[sid]?.companies;
    if (!Array.isArray(companies)) return all;
    const want = companies.length;
    if (Number(n) !== want) stale.push(`${sid} ${n}→${want}`);
    return `${open}${want}${tail}`;
  },
);

if (CHECK) {
  if (stale.length) {
    console.error(`sync_hub_card_badges --check: stale ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log('sync_hub_card_badges --check OK');
} else {
  if (next !== html) fs.writeFileSync(INDEX, next, 'utf8');
  console.log(`sync_hub_card_badges: ${stale.length ? stale.join(', ') : 'no change'}`);
}
