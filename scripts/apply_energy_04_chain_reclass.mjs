/**
 * Persist §0-4 energy chain reclass onto battery/renewable/nuclear/powergrid maps.
 * Sole assignment source: data/chain_overrides.json.
 */
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { assertChainInvariants, logChainCounts } from '../lib/chain_reclass_invariants.mjs';
import { allowedInSector } from '../lib/sector_exclusive.mjs';
import { ENERGY_04, angleLiteral, toJsChainList } from '../lib/energy_04_chain_ui.mjs';
import { PRERENDER_START, PRERENDER_END, escHtml } from '../lib/seo_prerender_lib.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELD_OVERRIDES_PATH = join(ROOT, 'data', 'ticker_field_overrides.json');
const OVERRIDES_PATH = join(ROOT, 'data', 'chain_overrides.json');
const ADDITIONS_PATH = {
  battery: 'battery/cp_list_battery_additions.json',
  renewable: 'renewable/cp_list_renewable_additions.json',
  nuclear: 'nuclear/cp_list_nuclear_additions.json',
  powergrid: 'powergrid/cp_list_powergrid_additions.json',
};

function pad(t) {
  return String(t || '').padStart(6, '0');
}

function loadTagAppends() {
  const overrides = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  const out = {};
  for (const [ticker, row] of Object.entries(overrides)) {
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

function jsonDict(field, value) {
  const body = JSON.stringify(value, null, 4).replace(/\n/g, '\n        ');
  return `"${field}": ${body}`;
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
  // legend chips without all — match first non-all chains array after filter chips
  let legendPatched = false;
  out = out.replace(/const chains = \[(?!'all')[^\]]+\];/g, (m) => {
    if (legendPatched) return m;
    legendPatched = true;
    return `const chains = ${toJsChainList(cfg.chains)};`;
  });
  // forceX angle objects — replace common patterns loosely
  out = out.replace(/\{ '[^']+': \d+(?:, '[^']+': \d+)+ \}/g, (m) => {
    // only replace if it looks like chain angles (contains a known retired or new chain)
    const hit = cfg.chains.some((c) => m.includes(c)) || cfg.retired.some((c) => m.includes(`'${c}'`) || m.includes(c));
    return hit ? angle : m;
  });
  out = replaceJsonDicts(out, 'chainLabel', [cfg.labelKo, cfg.labelEn]);
  out = replaceJsonDicts(out, 'chainFilter', [cfg.filterKo, cfg.filterEn]);
  out = out.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=18"');
  out = out.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=9"');
  return out;
}

function injectMissingFromAdditions(sectorKey, companies) {
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
  if (added.length) console.log(`${sectorKey}: injected missing`, added.join(','));
  return [...byTicker.values()];
}

function applySector(sectorKey) {
  const cfg = ENERGY_04[sectorKey];
  const htmlPath = join(ROOT, cfg.html);
  let html = fs.readFileSync(htmlPath, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  const dropped = companies.filter((c) => !allowedInSector(c.ticker, sectorKey));
  if (dropped.length) {
    companies = companies.filter((c) => allowedInSector(c.ticker, sectorKey));
    console.log(`${sectorKey}: dropped exclusive/cross`, dropped.map((c) => c.ticker).join(','));
  }
  companies = injectMissingFromAdditions(sectorKey, companies);
  const tags = loadTagAppends();
  for (const c of companies) {
    const next = chainOverride(sectorKey, c.ticker);
    if (!next) throw new Error(`chain_overrides.json missing ${sectorKey} ticker ${c.ticker}`);
    c.chain = next;
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
    `OK apply_energy_04 ${sectorKey}`,
    companies.length,
    counts,
    `(${logChainCounts(sectorKey, counts)}) prerender=${prerender.patched}`,
  );
}

function main() {
  for (const key of ['battery', 'renewable', 'nuclear', 'powergrid']) applySector(key);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { applySector, main };
