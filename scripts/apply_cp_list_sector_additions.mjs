/**
 * Merge committed cp_list additions into curated sector maps (cosmetics, medtech, holdings).
 * Source: {sector}/cp_list_{sector}_additions.json
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  esc,
  extractCompaniesFromHtml,
  fmtMcap,
  mcapTier,
  patchKoreanCompaniesHtml,
  slugId,
} from '../lib/map_company_serialize.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SECTOR_MAPS = {
  cosmetics: {
    path: 'cosmetics/korea_cosmetics_map.html',
    additions: 'cosmetics/cp_list_cosmetics_additions.json',
    idPrefix: 'cos',
    globalAdditions: [
      { id: 'loreal', name: "L'Oréal", nameEn: "L'Oréal", country: '프랑스/France', region: 'eu', sector: 'Beauty' },
      { id: 'shiseido', name: 'Shiseido', nameEn: 'Shiseido', country: '일본/Japan', region: 'jp', sector: 'Beauty' },
      { id: 'intercos', name: 'Intercos', nameEn: 'Intercos', country: '이탈리아/Italy', region: 'eu', sector: 'Cosmetics ODM' },
      { id: 'albea', name: 'Albéa', nameEn: 'Albéa', country: '프랑스/France', region: 'eu', sector: 'Cosmetics packaging' },
      { id: 'aptar', name: 'Aptar', nameEn: 'Aptar', country: '미국/USA', region: 'us', sector: 'Dispensing packaging' },
    ],
  },
  medtech: {
    path: 'medtech/korea_medtech_map.html',
    additions: 'medtech/cp_list_medtech_additions.json',
    idPrefix: 'medtech',
    globalAdditions: [
      { id: '3m', name: '3M', nameEn: '3M', country: '미국/USA', region: 'us', sector: 'Medical devices & materials' },
    ],
  },
  holdings: {
    path: 'holdings/korea_holdings_map.html',
    additions: 'holdings/cp_list_holdings_additions.json',
    idPrefix: 'holdings',
  },
  finance: {
    path: 'finance/korea_finance_map.html',
    additions: 'finance/cp_list_finance_additions.json',
    idPrefix: 'finance',
  },
  construction: {
    path: 'construction/korea_construction_map.html',
    additions: 'construction/cp_list_construction_additions.json',
    idPrefix: 'construction',
    chainOrder: [
      '종합건설',
      '종합건설·EPC',
      '주택·디벨로퍼',
      '건설기계',
      '건자재',
      '시멘트',
      '부동산신탁',
      '지주·기타',
    ],
    extraChains: {
      '종합건설·EPC': { color: '#1E88E5', labelEn: 'General construction & EPC' },
      '건자재': { color: '#26A69A', labelEn: 'Building materials' },
      '시멘트': { color: '#8D6E63', labelEn: 'Cement' },
      '부동산신탁': { color: '#5C6BC0', labelEn: 'Real estate trust' },
    },
    globalAdditions: [
      { id: 'holcim', name: 'Holcim', nameEn: 'Holcim', country: '스위스/Switzerland', region: 'eu', sector: 'Cement' },
      { id: 'heidelberg', name: 'Heidelberg Materials', nameEn: 'Heidelberg Materials', country: '독일/Germany', region: 'eu', sector: 'Cement' },
      { id: 'saint_gobain', name: 'Saint-Gobain', nameEn: 'Saint-Gobain', country: '프랑스/France', region: 'eu', sector: 'Building materials' },
      { id: 'ppg', name: 'PPG Industries', nameEn: 'PPG Industries', country: '미국/USA', region: 'us', sector: 'Coatings' },
      { id: 'sherwin_williams', name: 'Sherwin-Williams', nameEn: 'Sherwin-Williams', country: '미국/USA', region: 'us', sector: 'Coatings' },
    ],
  },
};

function padTicker(t) {
  return String(t).trim().padStart(6, '0');
}

function loadAdditions(relPath) {
  const fp = join(ROOT, relPath);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function formatGlobal(g) {
  return (
    `      { id: '${esc(g.id)}', name: '${esc(g.name)}', nameEn: '${esc(g.nameEn)}', ` +
    `country: '${esc(g.country)}', region: '${esc(g.region)}', sector: '${esc(g.sector)}' }`
  );
}

function patchChainProp(html, prop, extraChains, occurrenceIndex) {
  if (!extraChains || !Object.keys(extraChains).length) return html;
  let n = 0;
  const re = new RegExp(`"${prop}"\\s*:\\s*\\{([^}]+)\\}`, 'g');
  return html.replace(re, (full, inner) => {
    if (n++ !== occurrenceIndex) return full;
    let next = inner.trimEnd();
    for (const [chain, meta] of Object.entries(extraChains)) {
      if (inner.includes(`"${chain}"`)) continue;
      const label = occurrenceIndex % 2 === 0 ? chain : meta.labelEn;
      next += `,\n            "${chain}": "${label}"`;
    }
    return `"${prop}": {${next}}`;
  });
}

function patchExtraChains(html, { extraChains, chainOrder }) {
  if (!extraChains || !Object.keys(extraChains).length) return html;

  const m = html.match(/const CHAIN_COLORS = (\{[\s\S]*?\});/);
  if (!m) return html;
  const colors = Function(`"use strict"; return (${m[1]});`)();
  for (const [chain, meta] of Object.entries(extraChains)) {
    colors[chain] = meta.color;
  }

  const ordered = [...(chainOrder || [])];
  for (const k of Object.keys(colors)) {
    if (!ordered.includes(k)) ordered.push(k);
  }

  html = html.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${JSON.stringify(colors)};`);

  const chipList = `['all', ${ordered.map((c) => `'${esc(c)}'`).join(', ')}]`;
  const legendList = `[${ordered.map((c) => `'${esc(c)}'`).join(', ')}]`;
  html = html.replace(/const chains = \['all',[^\]]+\];/, `const chains = ${chipList};`);
  html = html.replace(/const chains = \['종합건설',[^\]]+\];/, `const chains = ${legendList};`);

  html = patchChainProp(html, 'chainLabel', extraChains, 0);
  html = patchChainProp(html, 'chainLabel', extraChains, 1);
  html = patchChainProp(html, 'chainFilter', extraChains, 0);
  html = patchChainProp(html, 'chainFilter', extraChains, 1);
  return html;
}

function patchGlobalCompanies(html, additions) {
  if (!additions?.length) return html;
  const m = html.match(/const globalCompanies = (\[[\s\S]*?\]);/);
  if (!m) return html;
  const globals = Function(`"use strict"; return (${m[1]});`)();
  const byId = new Set(globals.map((g) => g.id));
  const inject = additions.filter((g) => !byId.has(g.id)).map(formatGlobal);
  if (!inject.length) return html;
  return html.replace(
    /const globalCompanies = \[[\s\S]*?\];/,
    `const globalCompanies = [\n${[...globals.map(formatGlobal), ...inject].join(',\n')}\n    ];`,
  );
}

function upsertSector(sectorKey, config) {
  const additions = loadAdditions(config.additions);
  if (!additions.length) {
    console.log(`${sectorKey}: no additions (${config.additions})`);
    return;
  }

  const htmlPath = join(ROOT, config.path);
  let html = fs.readFileSync(htmlPath, 'utf8');
  const krx = loadMergedKrxMap(join(ROOT, 'data'));
  const perPbr = loadPerPbrMap(join(ROOT, 'data'));
  const companies = extractCompaniesFromHtml(html);
  const byTicker = new Map(companies.map((c) => [padTicker(c.ticker), c]));

  let applied = 0;
  for (const row of additions) {
    const ticker = padTicker(row.ticker);
    const krxRow = krx.get(ticker);
    if (!krxRow) {
      console.warn(`${sectorKey}: skip ${ticker} — not in KRX merge`);
      continue;
    }
    if (!passesMcapFloor({ mcapWon: krxRow.mcap })) {
      console.warn(`${sectorKey}: skip ${ticker} — below mcap floor (${krxRow.mcap})`);
      continue;
    }
    applied++;
    const fin = perPbr.get(ticker);
    const existing = byTicker.get(ticker) || {};
    byTicker.set(ticker, {
      ...existing,
      id: existing.id || slugId(ticker, row.nameEn || row.name, config.idPrefix),
      name: row.name || krxRow.name,
      nameEn: row.nameEn || existing.nameEn || krxRow.name,
      ticker,
      market: krxRow.market,
      chain: row.chain || existing.chain,
      semType: row.semType || existing.semType || '—',
      semTypeEn: row.semTypeEn || existing.semTypeEn || '—',
      products: row.products || existing.products || '—',
      productsEn: row.productsEn || existing.productsEn || '—',
      revenue: fmtMcap(krxRow.mcap),
      mcapWon: krxRow.mcap,
      per: fin?.per ?? existing.per ?? null,
      pbr: fin?.pbr ?? existing.pbr ?? null,
      revTier: mcapTier(krxRow.mcap),
      partners: row.partners || existing.partners || [],
    });
  }

  const next = [...byTicker.values()].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  html = patchKoreanCompaniesHtml(html, next);
  html = patchGlobalCompanies(html, config.globalAdditions);
  html = patchExtraChains(html, config);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`${sectorKey}: cp_list additions applied (${next.length} companies, +${applied} from ${config.additions})`);
}

for (const [sectorKey, config] of Object.entries(SECTOR_MAPS)) {
  upsertSector(sectorKey, config);
}
