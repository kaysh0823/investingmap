/**
 * Fills empty semType / products / productsEn on all industry maps and bio inline data.
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';
import { enrichCompanyList } from '../lib/company_field_enrich.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cpListDir = process.argv[2] || join(root, '..', 'cp_list');

const HTML_MAPS = [
  { key: 'semi', path: 'semiconductor/korea_semiconductor_map.html' },
  { key: 'ship', path: 'ship/korea_ship_map.html' },
  { key: 'defense', path: 'defense/korea_defense_map.html' },
  { key: 'robot', path: 'robot/korea_robot_map.html' },
  { key: 'auto', path: 'auto/korea_auto_map.html' },
  { key: 'medtech', path: 'medtech/korea_medtech_map.html' },
  { key: 'battery', path: 'battery/korea_battery_map.html' },
  { key: 'renewable', path: 'renewable/korea_renewable_map.html' },
  { key: 'nuclear', path: 'nuclear/korea_nuclear_map.html' },
  { key: 'powergrid', path: 'powergrid/korea_powergrid_map.html' },
  { key: 'finance', path: 'finance/korea_finance_map.html' },
  { key: 'construction', path: 'construction/korea_construction_map.html' },
  { key: 'kconsume', path: 'kconsume/korea_kconsume_map.html' },
  { key: 'cosmetics', path: 'cosmetics/korea_cosmetics_map.html' },
  { key: 'kcontent', path: 'kcontent/korea_kcontent_map.html' },
];

function countEmpty(companies) {
  const empty = (v) => !v || v === '—' || String(v).trim() === '';
  let noType = 0;
  let noProd = 0;
  for (const c of companies) {
    if (empty(c.semType)) noType++;
    if (empty(c.products)) noProd++;
  }
  return { noType, noProd };
}

function main() {
  console.log('Enriching company metadata from cp_list + overrides...');
  const summary = {};

  for (const cfg of HTML_MAPS) {
    const p = join(root, cfg.path);
    let html = fs.readFileSync(p, 'utf8');
    const companies = extractCompaniesFromHtml(html);
    const before = countEmpty(companies);
    const { filled } = enrichCompanyList(companies, cfg.key, cpListDir);
    const after = countEmpty(companies);
    html = patchKoreanCompaniesHtml(html, companies);
    fs.writeFileSync(p, html, 'utf8');
    summary[cfg.key] = { before, after, filled };
    console.log(
      `${cfg.path}: semType ${before.noType}→${after.noType}, products ${before.noProd}→${after.noProd} (filled ${filled})`,
    );
  }

  // gen_korea_bio_inline already merges cp_list enrichment — do not patch inline.js here
  // (prior slice(0, dataStart) logic duplicated koreanCompanies when dataStart was -1).
  execSync('node bio/gen_korea_bio_inline.mjs', { cwd: root, stdio: 'inherit' });

  const inlinePath = join(root, 'bio', 'korea_bio_map.inline.js');
  const inline = fs.readFileSync(inlinePath, 'utf8');
  const m = inline.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (m) {
    const bioCompanies = JSON.parse(m[1]);
    summary.bio = countEmpty(bioCompanies);
    console.log(
      `bio: semType empty=${summary.bio.noType}, products empty=${summary.bio.noProd} (via gen_korea_bio_inline)`,
    );
  }

  console.log('\nSummary:', JSON.stringify(summary, null, 2));
}

main();
