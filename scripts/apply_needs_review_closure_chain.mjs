/**
 * Persist needs_review closure onto maps (injects + ensure exclusives dropped).
 * Runs after batch applies so new members survive rebuild order.
 */
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { assertChainInvariants, logChainCounts } from '../lib/chain_reclass_invariants.mjs';
import { allowedInSector } from '../lib/sector_exclusive.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';
import { PRERENDER_START, PRERENDER_END, escHtml } from '../lib/seo_prerender_lib.mjs';
import { INDUSTRY_04B, angleLiteral, toJsChainList } from '../lib/industry_04b_chain_ui.mjs';
import { FINANCE_04G } from '../lib/finance_04g_chain_ui.mjs';
import { ENERGY_04 } from '../lib/energy_04_chain_ui.mjs';
import { CONSUMER_04F } from '../lib/consumer_04f_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELD_OVERRIDES_PATH = join(ROOT, 'data', 'ticker_field_overrides.json');
const OVERRIDES_PATH = join(ROOT, 'data', 'chain_overrides.json');

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

function loadTagAppends() {
  const overrides = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  const out = {};
  for (const [ticker, row] of Object.entries(overrides)) {
    if (ticker.startsWith('_')) continue;
    if (Array.isArray(row.tags) && row.tags.length) out[pad(ticker)] = row.tags;
  }
  return out;
}

function appendTags(products, tags) {
  let out = String(products || '');
  for (const tag of tags || []) {
    if (tag && !out.includes(tag)) out = out ? `${out} · ${tag}` : tag;
  }
  return out;
}

function applyNameOverrides(c, sectorKey) {
  const fields = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  const row = fields[pad(c.ticker)];
  if (!row || typeof row !== 'object') return;
  if (row.name) c.name = row.name;
  if (row.nameEn) c.nameEn = row.nameEn;
  if (row.semType) c.semType = row.semType;
  if (row.semTypeEn) c.semTypeEn = row.semTypeEn;
  if (row.products) c.products = row.products;
  if (row.productsEn) c.productsEn = row.productsEn;
  const by = row.byIndustry?.[sectorKey];
  if (by?.semType) c.semType = by.semType;
  if (by?.products) c.products = by.products;
}

function injectFromAdditions(sectorKey, companies, addRel) {
  const full = join(ROOT, addRel);
  if (!fs.existsSync(full)) return companies;
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'))[sectorKey] || {};
  const krx = loadMergedKrxMap(join(ROOT, 'data'));
  const byTicker = new Map(companies.map((c) => [pad(c.ticker), c]));
  const added = [];
  for (const row of JSON.parse(fs.readFileSync(full, 'utf8'))) {
    const t = pad(row.ticker);
    if (byTicker.has(t)) continue;
    if (!allowedInSector(t, sectorKey)) continue;
    if (!overrides[t]) continue;
    const krxRow = krx.get(t);
    if (krxRow && !passesMcapFloor({ mcapWon: krxRow.mcap })) continue;
    byTicker.set(t, {
      id: `${sectorKey}_${t}`,
      name: row.name || krxRow?.name || t,
      nameEn: row.nameEn || row.name || t,
      ticker: t,
      market: krxRow?.market || row.market || 'KOSPI',
      chain: overrides[t],
      semType: row.semType || overrides[t],
      semTypeEn: row.semTypeEn || '',
      products: row.products || '',
      productsEn: row.productsEn || '',
      partners: row.partners || [],
      mcapWon: krxRow?.mcap || 0,
    });
    added.push(t);
  }
  if (added.length) console.log(`${sectorKey}: injected`, added.join(','));
  return [...byTicker.values()];
}

function findJsonDictSpan(html, field, from = 0) {
  const needle = `"${field}": {`;
  const start = html.indexOf(needle, from);
  if (start < 0) return null;
  const braceStart = start + needle.length - 1;
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') {
      depth--;
      if (depth === 0) return { start, end: j + 1 };
    }
  }
  throw new Error(`${field}: unclosed`);
}

function replaceJsonDicts(html, field, values) {
  let out = html;
  let from = 0;
  for (let i = 0; i < values.length; i++) {
    const span = findJsonDictSpan(out, field, from);
    if (!span) throw new Error(`${field}: dictionary ${i} not found`);
    const replacement = `"${field}": ${JSON.stringify(values[i], null, 4).replace(/\n/g, '\n        ')}`;
    out = out.slice(0, span.start) + replacement + out.slice(span.end);
    from = span.start + replacement.length;
  }
  return out;
}

function replaceOrInjectChainFilter(html, filterValues) {
  if (html.includes('"chainFilter": {')) return replaceJsonDicts(html, 'chainFilter', filterValues);
  let out = html;
  let from = 0;
  for (let i = 0; i < filterValues.length; i++) {
    const span = findJsonDictSpan(out, 'chainLabel', from);
    if (!span) throw new Error(`chainLabel missing for filter inject ${i}`);
    const filterLit = `"chainFilter": ${JSON.stringify(filterValues[i], null, 4).replace(/\n/g, '\n        ')}`;
    out = out.slice(0, span.end) + ',\n        ' + filterLit + out.slice(span.end);
    const next = findJsonDictSpan(out, 'chainFilter', span.start);
    from = next ? next.end : span.end;
  }
  return out;
}

function patchPrerenderRows(html, companies) {
  const i0 = html.indexOf(PRERENDER_START);
  const i1 = html.indexOf(PRERENDER_END);
  if (i0 < 0 || i1 < 0) return { html, patched: 0 };
  const byTicker = new Map(companies.map((c) => [pad(c.ticker), c]));
  let patched = 0;
  const block = html.slice(i0, i1).replace(/<tr data-ticker="([0-9A-Za-z]{6})">[\s\S]*?<\/tr>/g, (row, ticker) => {
    const c = byTicker.get(pad(ticker));
    if (!c) return '';
    let next = row.replace(
      /<td><span class="chain-tag">[^<]*<\/span><\/td>/,
      `<td><span class="chain-tag">${escHtml(c.chain)}</span></td>`,
    );
    if (c.name) {
      next = next.replace(
        /<div class="company-name">[^<]*<\/div>/,
        `<div class="company-name">${escHtml(c.name)}</div>`,
      );
    }
    if (next !== row) patched++;
    return next;
  });
  return { html: html.slice(0, i0) + block + html.slice(i1), patched };
}

function patchUi(html, cfg) {
  const angle = angleLiteral(cfg.chains);
  let out = html.replace(
    /const CHAIN_COLORS = \{[\s\S]*?\};/,
    `const CHAIN_COLORS = ${JSON.stringify(cfg.colors)};`,
  );
  out = out.replace(/const chains = \['all'[, ][^\]]+\];/, `const chains = ${toJsChainList(['all', ...cfg.chains])};`);
  let legendPatched = false;
  out = out.replace(/const chains = \[(?!'all')[^\]]+\];/g, (m) => {
    if (legendPatched) return m;
    legendPatched = true;
    return `const chains = ${toJsChainList(cfg.chains)};`;
  });
  out = out.replace(/\{ '[^']+': \d+(?:, '[^']+': \d+)+ \}/g, (m) => {
    const hit = cfg.chains.some((c) => m.includes(c)) || (cfg.retired || []).some((c) => m.includes(c));
    return hit ? angle : m;
  });
  out = replaceJsonDicts(out, 'chainLabel', [cfg.labelKo, cfg.labelEn]);
  out = replaceOrInjectChainFilter(out, [cfg.filterKo, cfg.filterEn]);
  if (cfg.axisLabelKo) {
    out = out.replace(/"flChain":\s*"밸류체인"/g, `"flChain": "${cfg.axisLabelKo}"`);
    out = out.replace(/"thChain":\s*"밸류체인"/g, `"thChain": "${cfg.axisLabelKo}"`);
    out = out.replace(/"ttChain":\s*"밸류체인"/g, `"ttChain": "${cfg.axisLabelKo}"`);
    out = out.replace(
      /(<span class="filter-label" id="fl-chain-label">)[^<]*(<\/span>)/,
      `$1${cfg.axisLabelKo}$2`,
    );
    out = out.replace(/(<th id="th-chain"[^>]*>)[^<]*(<\/th>)/, `$1${cfg.axisLabelKo}$2`);
  }
  return out;
}

function applyMap(sectorKey, htmlRel, cfg, additionsRel) {
  const htmlPath = join(ROOT, htmlRel);
  let html = fs.readFileSync(htmlPath, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  companies = companies.filter((c) => allowedInSector(c.ticker, sectorKey));
  if (additionsRel) companies = injectFromAdditions(sectorKey, companies, additionsRel);
  const tags = loadTagAppends();
  for (const c of companies) {
    const next = chainOverride(sectorKey, c.ticker);
    if (!next) throw new Error(`${sectorKey} override missing ${c.ticker}`);
    c.chain = next;
    applyNameOverrides(c, sectorKey);
    const t = tags[pad(c.ticker)];
    if (t?.length) c.products = appendTags(c.products, t);
  }
  const counts = assertChainInvariants(sectorKey, companies);
  html = patchKoreanCompaniesHtml(html, companies);
  if (cfg) html = patchUi(html, cfg);
  const prerender = patchPrerenderRows(html, companies);
  fs.writeFileSync(htmlPath, prerender.html, 'utf8');
  console.log(
    `OK closure ${sectorKey}`,
    companies.length,
    `(${logChainCounts(sectorKey, counts)})`,
  );
}

function main() {
  applyMap('semi', 'semiconductor/korea_semiconductor_map.html', null, 'semiconductor/cp_list_semi_additions.json');
  applyMap('battery', 'battery/korea_battery_map.html', ENERGY_04.battery, 'battery/cp_list_battery_additions.json');
  applyMap('renewable', 'renewable/korea_renewable_map.html', ENERGY_04.renewable, 'renewable/cp_list_renewable_additions.json');
  applyMap('powergrid', 'powergrid/korea_powergrid_map.html', ENERGY_04.powergrid, 'powergrid/cp_list_powergrid_additions.json');
  applyMap('ship', 'ship/korea_ship_map.html', null, 'ship/cp_list_ship_additions.json');
  applyMap('chemical', 'chemical/korea_chemical_map.html', INDUSTRY_04B.chemical, 'chemical/cp_list_chemical_additions.json');
  applyMap('holdings', 'holdings/korea_holdings_map.html', FINANCE_04G.holdings, 'holdings/cp_list_holdings_additions.json');
  applyMap('kcontent', 'kcontent/korea_kcontent_map.html', CONSUMER_04F.kcontent, 'kcontent/cp_list_kcontent_additions.json');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { main };
