/**
 * Persist §0-4 batch E onto bio (via gen) + medtech/cosmetics HTML maps.
 */
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { assertChainInvariants, logChainCounts } from '../lib/chain_reclass_invariants.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';
import { HEALTH_04E, angleLiteral, toJsChainList } from '../lib/health_04e_chain_ui.mjs';
import { PRERENDER_START, PRERENDER_END, escHtml } from '../lib/seo_prerender_lib.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELD_OVERRIDES_PATH = join(ROOT, 'data', 'ticker_field_overrides.json');
const OVERRIDES_PATH = join(ROOT, 'data', 'chain_overrides.json');

const ADDITIONS_PATH = {
  medtech: 'medtech/cp_list_medtech_additions.json',
  cosmetics: 'cosmetics/cp_list_cosmetics_additions.json',
};

const MCAP_SKIP = new Set(['228760', '389650', '003350', '078520', '352480']);

function pad(t) {
  const s = String(t || '');
  if (/[A-Za-z]/.test(s)) return s.length === 6 ? s : s;
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
  const block = html.slice(i0, i1).replace(/<tr data-ticker="([^"]+)">[\s\S]*?<\/tr>/g, (row, ticker) => {
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
  out = out.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=22"');
  out = out.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=13"');
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
    if (byTicker.has(t) || MCAP_SKIP.has(t)) continue;
    const home = exclusiveSector(t);
    if (home && home !== sectorKey) continue;
    if (!overrides[t]) continue;
    const krxRow = krx.get(t);
    if (krxRow && !passesMcapFloor({ mcapWon: krxRow.mcap })) continue;
    byTicker.set(t, {
      id: `${sectorKey}_${t}`,
      name: row.name || krxRow?.name || t,
      nameEn: row.nameEn || row.name || t,
      ticker: t,
      market: krxRow?.market || row.market || 'KOSDAQ',
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

function applyHtmlSector(sectorKey) {
  const cfg = HEALTH_04E[sectorKey];
  const htmlPath = join(ROOT, cfg.html);
  let html = fs.readFileSync(htmlPath, 'utf8');
  let companies = extractCompaniesFromHtml(html);
  const dropped = [];
  companies = companies.filter((c) => {
    const t = pad(c.ticker);
    if (MCAP_SKIP.has(t)) {
      dropped.push(t + ':mcap');
      return false;
    }
    const home = exclusiveSector(c.ticker);
    if (home && home !== sectorKey) {
      dropped.push(t + ':' + home);
      return false;
    }
    return true;
  });
  if (dropped.length) console.log(`${sectorKey}: dropped`, dropped.join(','));
  companies = injectMissingFromAdditions(sectorKey, companies);
  const tags = loadTagAppends();
  for (const c of companies) {
    const next = chainOverride(sectorKey, c.ticker);
    if (!next) throw new Error(`chain_overrides.json missing ${sectorKey} ticker ${c.ticker}`);
    c.chain = next;
    applyNameOverrides(c, sectorKey);
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
    `OK apply_health_04e ${sectorKey}`,
    companies.length,
    counts,
    `(${logChainCounts(sectorKey, counts)}) prerender=${prerender.patched}`,
  );
}

function patchBioInlineTagsAndNames() {
  const inlinePath = join(ROOT, 'bio/korea_bio_map.inline.js');
  let src = fs.readFileSync(inlinePath, 'utf8');
  const match = src.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('bio koreanCompanies not found');
  const companies = Function(`"use strict"; return (${match[1]});`)();
  const tags = loadTagAppends();
  const fields = JSON.parse(fs.readFileSync(FIELD_OVERRIDES_PATH, 'utf8'));
  for (const c of companies) {
    const t = pad(c.ticker);
    const row = fields[t];
    if (row?.nameEn) c.nameEn = row.nameEn;
    if (row?.name) c.name = row.name;
    if (row?.products) c.products = row.products;
    if (row?.productsEn) c.productsEn = row.productsEn;
    if (row?.semType) c.semType = row.semType;
    if (row?.semTypeEn) c.semTypeEn = row.semTypeEn;
    const forced = chainOverride('bio', c.ticker);
    if (forced) c.chain = forced;
    if (tags[t]?.length) c.products = appendTags(c.products, tags[t]);
  }
  // Drop exclusives / mcap already handled in gen; belt-and-suspenders
  const kept = companies.filter((c) => {
    const home = exclusiveSector(c.ticker);
    return !home || home === 'bio';
  });
  const counts = assertChainInvariants('bio', kept);
  const next = src.replace(/const koreanCompanies = \[[\s\S]*?\];/, `const koreanCompanies = ${JSON.stringify(kept, null, 2)};`);
  fs.writeFileSync(inlinePath, next, 'utf8');
  console.log('OK apply_health_04e bio inline', kept.length, counts, `(${logChainCounts('bio', counts)})`);
}

function runBioGen() {
  const r = spawnSync(process.execPath, ['bio/gen_korea_bio_inline.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error('gen_korea_bio_inline.mjs failed');
}

function main() {
  // Ensure bio ticker EN map has Curocell
  const enPath = join(ROOT, 'bio/bio_ticker_en.json');
  if (fs.existsSync(enPath)) {
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    en['372320'] = 'Curocell';
    fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n', 'utf8');
  }
  runBioGen();
  patchBioInlineTagsAndNames();
  applyHtmlSector('medtech');
  applyHtmlSector('cosmetics');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { main };
