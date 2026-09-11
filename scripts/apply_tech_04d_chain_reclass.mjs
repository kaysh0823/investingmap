/**
 * Persist §0-4 batch D chains onto elec/software/telecom/robot maps.
 * Also ensures cross-move injects on battery/semi/auto if missing after earlier steps.
 */
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { assertChainInvariants, logChainCounts } from '../lib/chain_reclass_invariants.mjs';
import { exclusiveSector, allowedInSector } from '../lib/sector_exclusive.mjs';
import { TECH_04D, angleLiteral, toJsChainList } from '../lib/tech_04d_chain_ui.mjs';
import { PRERENDER_START, PRERENDER_END, escHtml } from '../lib/seo_prerender_lib.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELD_OVERRIDES_PATH = join(ROOT, 'data', 'ticker_field_overrides.json');
const OVERRIDES_PATH = join(ROOT, 'data', 'chain_overrides.json');

const TAXONOMY_GAP_DROP = new Set(['126560']);

const ADDITIONS_PATH = {
  elec: 'elec/cp_list_elec_additions.json',
  software: 'software/cp_list_software_additions.json',
  telecom: 'telecom/cp_list_telecom_additions.json',
  robot: 'robot/cp_list_robot_additions.json',
  battery: 'battery/cp_list_battery_additions.json',
  semi: 'semiconductor/cp_list_semi_additions.json',
  auto: 'auto/cp_list_auto_additions.json',
};

function pad(t) {
  return String(t || '').padStart(6, '0');
}

function injectMissingFromAdditions(sectorKey, companies, { requireOverride = true } = {}) {
  const addPath = ADDITIONS_PATH[sectorKey];
  if (!addPath) return companies;
  const full = join(ROOT, addPath);
  if (!fs.existsSync(full)) return companies;
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'))[sectorKey] || {};
  const krx = loadMergedKrxMap(join(ROOT, 'data'));
  const byTicker = new Map(companies.map((c) => [pad(c.ticker), c]));
  const added = [];
  for (const row of JSON.parse(fs.readFileSync(full, 'utf8'))) {
    const t = pad(row.ticker);
    if (byTicker.has(t)) continue;
    const home = exclusiveSector(t);
    if (home && home !== sectorKey) continue;
    if (!allowedInSector(t, sectorKey)) continue;
    if (requireOverride && !overrides[t]) continue;
    const krxRow = krx.get(t);
    if (krxRow && !passesMcapFloor({ mcapWon: krxRow.mcap })) continue;
    byTicker.set(t, {
      id: `${sectorKey}_${t}`,
      name: row.name || krxRow?.name || t,
      nameEn: row.nameEn || row.name || krxRow?.name || t,
      ticker: t,
      market: krxRow?.market || row.market || 'KOSPI',
      chain: overrides[t] || row.chain || '—',
      semType: row.semType || overrides[t] || row.chain || '—',
      semTypeEn: row.semTypeEn || '',
      products: row.products || '',
      productsEn: row.productsEn || '',
      partners: row.partners || [],
      mcapWon: krxRow?.mcap || row.mcapWon || 0,
    });
    added.push(t);
  }
  if (added.length) console.log(`${sectorKey}: injected missing`, added.join(','));
  return [...byTicker.values()];
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

function replaceJsonDicts(html, field, values) {
  const needle = `"${field}": {`;
  let out = html;
  let from = 0;
  for (let i = 0; i < values.length; i++) {
    const start = out.indexOf(needle, from);
    if (start < 0) throw new Error(`${field}: dictionary ${i} not found`);
    const braceStart = start + needle.length - 1;
    let depth = 0;
    let end = -1;
    for (let j = braceStart; j < out.length; j++) {
      const ch = out[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) throw new Error(`${field}: unclosed dictionary ${i}`);
    const replacement = `"${field}": ${JSON.stringify(values[i], null, 4).replace(/\n/g, '\n        ')}`;
    out = out.slice(0, start) + replacement + out.slice(end);
    from = start + replacement.length;
  }
  return out;
}

function patchPrerenderRows(html, companies) {
  const i0 = html.indexOf(PRERENDER_START);
  const i1 = html.indexOf(PRERENDER_END);
  if (i0 < 0 || i1 < 0) return { html, patched: 0 };
  const byTicker = new Map(companies.map((c) => [pad(c.ticker), c]));
  let patched = 0;
  const block = html.slice(i0, i1).replace(/<tr data-ticker="(\d{6})">[\s\S]*?<\/tr>/g, (row, ticker) => {
    const c = byTicker.get(ticker);
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
    /const CHAIN_COLORS = \{[^}]+\};/,
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
    const hit = cfg.chains.some((c) => m.includes(c)) || cfg.retired.some((c) => m.includes(c));
    return hit ? angle : m;
  });
  out = replaceJsonDicts(out, 'chainLabel', [cfg.labelKo, cfg.labelEn]);
  out = replaceJsonDicts(out, 'chainFilter', [cfg.filterKo, cfg.filterEn]);
  out = out.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=21"');
  out = out.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=12"');
  return out;
}

function applyNameOverrides(c) {
  const fields = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  const row = fields[pad(c.ticker)];
  if (!row || typeof row !== 'object') return;
  if (row.name) c.name = row.name;
  if (row.nameEn) c.nameEn = row.nameEn;
  if (row.semType) c.semType = row.semType;
  if (row.semTypeEn) c.semTypeEn = row.semTypeEn;
  if (row.products) c.products = row.products;
  if (row.productsEn) c.productsEn = row.productsEn;
  const by = row.byIndustry?.[c._sector];
  if (by?.semType) c.semType = by.semType;
  if (by?.products) c.products = by.products;
}

function applySector(sectorKey) {
  const cfg = TECH_04D[sectorKey];
  const htmlPath = join(ROOT, cfg.html);
  let html = fs.readFileSync(htmlPath, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  const dropped = [];
  companies = companies.filter((c) => {
    const t = pad(c.ticker);
    if (TAXONOMY_GAP_DROP.has(t) && sectorKey === 'telecom') {
      dropped.push(t + ':gap');
      return false;
    }
    if (!allowedInSector(c.ticker, sectorKey)) {
      dropped.push(t + ':denied');
      return false;
    }
    return true;
  });
  if (dropped.length) console.log(`${sectorKey}: dropped`, dropped.join(','));
  companies = injectMissingFromAdditions(sectorKey, companies);

  const tags = loadTagAppends();
  for (const c of companies) {
    c._sector = sectorKey;
    const next = chainOverride(sectorKey, c.ticker);
    if (!next) throw new Error(`chain_overrides.json missing ${sectorKey} ticker ${c.ticker}`);
    c.chain = next;
    applyNameOverrides(c);
    const t = tags[pad(c.ticker)];
    if (t?.length) c.products = appendTags(c.products, t);
  }
  const stale = companies.filter((c) => cfg.retired.includes(c.chain));
  if (stale.length) {
    throw new Error(`${sectorKey} retired chains remain: ${stale.map((c) => c.ticker + ':' + c.chain).join(', ')}`);
  }
  const counts = assertChainInvariants(sectorKey, companies);
  html = patchKoreanCompaniesHtml(html, companies);
  html = patchUi(html, cfg);
  const prerender = patchPrerenderRows(html, companies);
  fs.writeFileSync(htmlPath, prerender.html, 'utf8');
  console.log(
    `OK apply_tech_04d ${sectorKey}`,
    companies.length,
    counts,
    `(${logChainCounts(sectorKey, counts)}) prerender=${prerender.patched}`,
  );
}

/** Ensure cross-move destinations have members even if earlier pipeline missed inject. */
function ensureCrossMoveDest(sectorKey, htmlRel, industryKey) {
  const htmlPath = join(ROOT, htmlRel);
  let html = fs.readFileSync(htmlPath, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  companies = companies.filter((c) => {
    const home = exclusiveSector(c.ticker);
    return !home || home === sectorKey;
  });
  companies = injectMissingFromAdditions(sectorKey, companies);
  const tags = loadTagAppends();
  for (const c of companies) {
    c._sector = industryKey || sectorKey;
    const next = chainOverride(industryKey || sectorKey, c.ticker);
    if (next) c.chain = next;
    applyNameOverrides(c);
    const t = tags[pad(c.ticker)];
    if (t?.length) c.products = appendTags(c.products, t);
  }
  html = patchKoreanCompaniesHtml(html, companies);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`OK tech_04d ensure ${sectorKey}`, companies.length);
}

function main() {
  for (const key of ['elec', 'software', 'telecom', 'robot']) applySector(key);
  ensureCrossMoveDest('battery', 'battery/korea_battery_map.html', 'battery');
  ensureCrossMoveDest('semi', 'semiconductor/korea_semiconductor_map.html', 'semi');
  ensureCrossMoveDest('auto', 'auto/korea_auto_map.html', 'auto');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { applySector, main };
