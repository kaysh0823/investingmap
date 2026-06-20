import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CSS = `
    .sector-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      justify-content: flex-end;
      max-width: min(480px, 46vw);
    }

    .sector-nav a,
    .sector-nav .is-current {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 14px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      transition: all .2s;
    }

    .sector-nav a:hover {
      border-color: var(--accent);
      color: var(--text);
    }

    .sector-nav .is-current {
      border-color: var(--accent);
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, var(--surface2));
    }`;

const NAV = '      <nav class="sector-nav" id="sector-nav"></nav>\n      ';
const SCRIPTS =
  '<script src="../js/live_quotes.js"></script>\n  <script src="../js/map_i18n.js"></script>\n  <script src="../js/sector_nav.js"></script>';

const MAPS = [
  ['semiconductor/korea_semiconductor_map.html', 'semi'],
  ['ship/korea_ship_map.html', 'ship'],
  ['defense/korea_defense_map.html', 'defense'],
  ['robot/korea_robot_map.html', 'robot'],
  ['energy/korea_energy_map.html', 'energy'],
  ['kculture/korea_kculture_map.html', 'kculture'],
  ['bio/korea_bio_map.html', 'bio'],
];

function patchHtml(rel, sectorId) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('id="sector-nav"')) {
    console.log('skip (already patched):', rel);
    return;
  }

  c = c.replace(
    /\.hub-back:hover \{\n      border-color: var\(--accent\);\n      color: var\(--text\)\n    \}/,
    (m) => m + CSS
  );
  c = c.replace(/max-width: 52%;/, 'max-width: 78%;');
  c = c.replace('<a class="hub-back"', NAV + '<a class="hub-back"');
  c = c.replace('<body>', `<body data-sector="${sectorId}">`);
  c = c.replace(
    '<script src="../js/live_quotes.js"></script>',
    SCRIPTS
  );

  c = c.replace(
    "if (hubBack) hubBack.href = '../index.html?lang=' + encodeURIComponent(lang);",
    `if (hubBack) hubBack.href = '../index.html?lang=' + encodeURIComponent(lang);
      document.title = t.title;
      if (window.InvestingMapSectorNav) InvestingMapSectorNav.render(document.body.getAttribute('data-sector') || '', lang);`
  );

  c = c.replace(
    /const label = m === 'all' \? t\.allFilter : m;/g,
    "const label = m === 'all' ? t.allFilter : ((window.InvestingMapI18n && InvestingMapI18n.marketChipLabel(m, t, lang)) || m);"
  );

  c = c.replace(
    'if (g) return { name: g.name, region: g.region };',
    "if (g) return { name: (window.InvestingMapI18n ? InvestingMapI18n.entityName(g, lang) : g.name), region: g.region };"
  );
  c = c.replace(
    "if (k) return { name: k.name, region: 'kr' };",
    "if (k) return { name: (window.InvestingMapI18n ? InvestingMapI18n.entityName(k, lang) : k.name), region: 'kr' };"
  );

  c = c.replace(
    `        const displayName = lang === 'en' ? c.nameEn : c.name;
        const subName = lang === 'en' ? c.name : c.nameEn;
        const semTypeDisplay = c[semTypeField] || c.semType;
        const productsDisplay = c[productsField] || c.products;`,
    `        const displayName = lang === 'en' ? (c.nameEn || c.name) : (c.name || c.nameEn);
        const subNameRaw = lang === 'en' ? (c.name || '') : (c.nameEn || '');
        const subNameHtml = subNameRaw && subNameRaw !== displayName ? \`<div class="company-name-sub">\${subNameRaw}</div>\` : '';
        const I18n = window.InvestingMapI18n;
        const semTypeDisplay = I18n ? I18n.field(c, 'semType', 'semTypeEn', lang) : (c[semTypeField] || c.semType || '—');
        const productsDisplay = I18n ? I18n.field(c, 'products', 'productsEn', lang) : (c[productsField] || c.products || '—');
        const mktLabel = I18n ? I18n.marketLabel(c.market, lang) : c.market;
        const mktClass = I18n ? I18n.marketCssClass(c.market) : c.market.toLowerCase();`
  );

  c = c.replace(
    '<td><div class="company-name">${displayName}</div><div class="company-name-sub">${subName}</div></td>',
    '<td><div class="company-name">${displayName}</div>${subNameHtml}</td>'
  );
  c = c.replace(
    '<td><span class="market-badge ${c.market.toLowerCase()}">${c.market}</span></td>',
    '<td><span class="market-badge ${mktClass}">${mktLabel}</span></td>'
  );

  fs.writeFileSync(fp, c);
  console.log('patched:', rel);
}

function patchBioInline() {
  const fp = path.join(root, 'bio/bio_inline_tail.js');
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('InvestingMapSectorNav')) {
    console.log('skip bio_inline_tail (already patched)');
    return;
  }

  c = c.replace(
    "if (hubBack) hubBack.href = '../index.html?lang=' + encodeURIComponent(lang);",
    `if (hubBack) hubBack.href = '../index.html?lang=' + encodeURIComponent(lang);
      document.title = t.title;
      if (window.InvestingMapSectorNav) InvestingMapSectorNav.render(document.body.getAttribute('data-sector') || '', lang);`
  );

  c = c.replace(
    /const label = m === 'all' \? t\.allFilter : m;/g,
    "const label = m === 'all' ? t.allFilter : ((window.InvestingMapI18n && InvestingMapI18n.marketChipLabel(m, t, lang)) || m);"
  );

  c = c.replace(
    'if (g) return { name: g.name, region: g.region };',
    "if (g) return { name: (window.InvestingMapI18n ? InvestingMapI18n.entityName(g, lang) : g.name), region: g.region };"
  );
  c = c.replace(
    "if (k) return { name: k.name, region: 'kr' };",
    "if (k) return { name: (window.InvestingMapI18n ? InvestingMapI18n.entityName(k, lang) : k.name), region: 'kr' };"
  );

  const oldBlock = `        const displayName = lang === 'en' ? c.nameEn : c.name;
        const subName = lang === 'en' ? c.name : c.nameEn;
        const semTypeDisplay = c[semTypeField] || c.semType;
        const productsDisplay = c[productsField] || c.products;
        const chainDisplay = chainLabel(c.chain);
        const qr = (window.InvestingMapLiveQuotes && (InvestingMapLiveQuotes.formatQuotesRow(c, lang) || InvestingMapLiveQuotes.emptyQuotesRow())) || { last: '\\u2014', hi: '\\u2014', lo: '\\u2014', position: '\\u2014' };
        const mcapCell = fmtMcapTableCell(c);
        const mktClass = c.market === '\\uBE44\\uC0C1\\uC7A5' ? 'unlisted' : c.market.toLowerCase();
        return '<tr>' +
          '<td><div class="company-name">' + displayName + '</div><div class="company-name-sub">' + subName + '</div></td>' +`;

  const newBlock = `        const displayName = lang === 'en' ? (c.nameEn || c.name) : (c.name || c.nameEn);
        const subNameRaw = lang === 'en' ? (c.name || '') : (c.nameEn || '');
        const subNameHtml = subNameRaw && subNameRaw !== displayName ? '<div class="company-name-sub">' + subNameRaw + '</div>' : '';
        const I18n = window.InvestingMapI18n;
        const semTypeDisplay = I18n ? I18n.field(c, 'semType', 'semTypeEn', lang) : (c[semTypeField] || c.semType || '\\u2014');
        const productsDisplay = I18n ? I18n.field(c, 'products', 'productsEn', lang) : (c[productsField] || c.products || '\\u2014');
        const chainDisplay = chainLabel(c.chain);
        const qr = (window.InvestingMapLiveQuotes && (InvestingMapLiveQuotes.formatQuotesRow(c, lang) || InvestingMapLiveQuotes.emptyQuotesRow())) || { last: '\\u2014', hi: '\\u2014', lo: '\\u2014', position: '\\u2014' };
        const mcapCell = fmtMcapTableCell(c);
        const mktClass = I18n ? I18n.marketCssClass(c.market) : (c.market === '\\uBE44\\uC0C1\\uC7A5' ? 'unlisted' : c.market.toLowerCase());
        const mktLabel = I18n ? I18n.marketLabel(c.market, lang) : c.market;
        return '<tr>' +
          '<td><div class="company-name">' + displayName + '</div>' + subNameHtml + '</td>' +`;

  if (!c.includes(oldBlock)) {
    throw new Error('bio_inline_tail.js block not found');
  }
  c = c.replace(oldBlock, newBlock);
  c = c.replace(
    "'<td><span class=\"market-badge ' + mktClass + '\">' + c.market + '</span></td>' +",
    "'<td><span class=\"market-badge ' + mktClass + '\">' + mktLabel + '</span></td>' +"
  );

  c = c.replace(
    "const chainLabel = (ch) => lang === 'en' ? (T.en.chainFilter[ch] || ch) : (T.ko.chainFilter[ch] || ch);",
    'const chainLabel = (ch) => t.chainFilter[ch] || ch;'
  );

  fs.writeFileSync(fp, c);
  console.log('patched: bio/bio_inline_tail.js');
}

for (const [rel, id] of MAPS) patchHtml(rel, id);
patchBioInline();
