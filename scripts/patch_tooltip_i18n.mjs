import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OLD = `        const subName = lang === 'en' ? d.label : d.labelEn;
        const chainDisplay = t.chainFilter[d.chain] || d.chain;
        const semTypeDisplay = (lang === 'en' ? d.semTypeEn : d.semType) || d.semType;
        const productsDisplay = (lang === 'en' ? d.productsEn : d.products) || d.products;
        html += \`<div class="tooltip-meta">\${subName} · \${d.ticker} · \${d.market}</div>\`;`;

const NEW = `        const chainDisplay = t.chainFilter[d.chain] || d.chain;
        const I18nTt = window.InvestingMapI18n;
        const semTypeDisplay = I18nTt ? I18nTt.field(d, 'semType', 'semTypeEn', lang) : (lang === 'en' ? (d.semTypeEn || '—') : (d.semType || '—'));
        const productsDisplay = I18nTt ? I18nTt.field(d, 'products', 'productsEn', lang) : (lang === 'en' ? (d.productsEn || '—') : (d.products || '—'));
        const mktTt = I18nTt ? I18nTt.marketLabel(d.market, lang) : d.market;
        const subTt = lang === 'en' ? (d.label || '') : (d.labelEn || '');
        const subPart = subTt && subTt !== displayName ? subTt + ' · ' : '';
        html += \`<div class="tooltip-meta">\${subPart}\${d.ticker} · \${mktTt}</div>\`;`;

const files = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
  'bio/bio_inline_tail.js',
];

for (const rel of files) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  if (!c.includes(OLD)) {
    console.warn('tooltip block not found:', rel);
    continue;
  }
  c = c.replace(OLD, NEW);
  fs.writeFileSync(fp, c);
  console.log('tooltip patched:', rel);
}
