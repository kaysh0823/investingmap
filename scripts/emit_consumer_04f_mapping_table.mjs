/**
 * Enrich consumer_04f_mapping_table.csv with live map names + print heatmap/filter check.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { CONSUMER_04F } from '../lib/consumer_04f_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const review = new Set(['035760', '008770', '020560', '031430']);

const maps = {
  kconsume: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'kconsume/korea_kconsume_map.html'), 'utf8')),
  kcontent: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'kcontent/korea_kcontent_map.html'), 'utf8')),
  travel: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'travel/korea_travel_map.html'), 'utf8')),
  shipping: extractCompaniesFromHtml(fs.readFileSync(join(ROOT, 'shipping/korea_shipping_map.html'), 'utf8')),
};

const rows = ['sector,ticker,name,old_group,new_group,evidence,needs_review,status'];
for (const sector of ['kconsume', 'kcontent', 'travel']) {
  for (const c of maps[sector]) {
    const nr = review.has(c.ticker);
    rows.push(
      [
        sector,
        c.ticker,
        JSON.stringify(c.name),
        '',
        JSON.stringify(c.chain),
        'chain_overrides §0-4F',
        nr,
        nr ? 'needs_review' : 'mapped',
      ].join(','),
    );
  }
}
for (const [t, chain] of [
  ['086280', '자동차·특수화물 운송'],
  ['000120', '종합물류'],
]) {
  const c = maps.shipping.find((x) => x.ticker === t);
  rows.push(
    [
      'shipping',
      t,
      JSON.stringify(c?.name || t),
      JSON.stringify('kconsume/물류·상사'),
      JSON.stringify(chain),
      '물류 교차이동',
      false,
      'mapped',
    ].join(','),
  );
}
rows.push(
  [
    'taxonomy_gap',
    '001740',
    JSON.stringify('SK네트웍스'),
    JSON.stringify('chemical/화학 유통(잠정)'),
    '""',
    '종합상사 자동편입 금지·분류공백',
    true,
    'taxonomy_gap',
  ].join(','),
);

fs.writeFileSync(join(ROOT, 'docs/reports/consumer_04f_mapping_table.csv'), `${rows.join('\n')}\n`, 'utf8');
console.log('OK mapping_table rows', rows.length - 1);

for (const sector of ['kconsume', 'kcontent', 'travel']) {
  const cfg = CONSUMER_04F[sector];
  const cos = maps[sector];
  const used = new Set(cos.map((c) => c.chain));
  const missing = [...used].filter((c) => !cfg.chains.includes(c));
  const mcap = cos.reduce((a, c) => a + (c.mcapWon || 0), 0);
  console.log(
    sector,
    `n=${cos.length}`,
    `filter=${cfg.chains.length}`,
    `used=${used.size}`,
    `missing=${missing.join('|') || '-'}`,
    `mcapT=${(mcap / 1e12).toFixed(2)}`,
  );
}
