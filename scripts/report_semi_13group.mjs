/**
 * Print semiconductor 13-group reclass verification report for operators.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { LEGEND_CHAINS } from '../lib/semi_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');
const companies = extractCompaniesFromHtml(html);
const mapping = JSON.parse(fs.readFileSync(join(ROOT, 'docs', 'reports', 'semi_reclass_mapping.json'), 'utf8'));
const review = fs.readFileSync(join(ROOT, 'docs', 'reports', 'semi_reclass_review.csv'), 'utf8');
const fields = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'ticker_field_overrides.json'), 'utf8'));

const bigchip = companies.filter((c) => c.ticker === '005930' || c.ticker === '000660');
const byChain = Object.fromEntries(LEGEND_CHAINS.map((c) => [c, []]));
const dups = new Set();
const seen = new Set();
for (const c of companies) {
  if (seen.has(c.ticker)) dups.add(c.ticker);
  seen.add(c.ticker);
  if (!byChain[c.chain]) byChain[c.chain] = [];
  byChain[c.chain].push(c.ticker);
  const ov = chainOverride('semi', c.ticker);
  if (ov !== c.chain) console.error('MISMATCH', c.ticker, ov, c.chain);
}

const unclassified = companies.filter((c) => !LEGEND_CHAINS.includes(c.chain));
const bel = (html.match(/벨류체인/g) || []).length;

console.log('=== Semi 13-group verification report ===');
console.log('companies', companies.length, 'bigchip_on_semi', bigchip.length, 'unclassified', unclassified.length, 'dups', dups.size);
console.log('벨류체인 residual', bel);
console.log('');
console.log('Group | heatmap(=filter) n | tickers');
for (const chain of LEGEND_CHAINS) {
  const ts = byChain[chain] || [];
  console.log(`${chain} | ${ts.length} | ${ts.join(',')}`);
}
console.log('');
console.log('needs_review (16)');
console.log(review);
console.log('');
console.log('Mapping sample (old→new→tags→evidence)');
for (const row of mapping.mapReport || []) {
  const tags = (fields[row.ticker]?.tags || row.tags || []).join('|') || '-';
  console.log(
    `${row.ticker}\t${row.name}\t${row.old}\t→\t${row.neo}\t${tags}\t${row.evidence}\t${row.needs_review ? 'needs_review' : 'ok'}`,
  );
}
