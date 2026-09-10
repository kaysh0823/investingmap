/**
 * Shared helpers for in-place sector splits (kculture-style scaffolding).
 */
import fs from 'fs';
import path from 'path';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from './map_company_serialize.mjs';

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

export function padTicker(t) {
  return String(t || '').padStart(6, '0');
}

export function rebuildItemList(html, companies, title, mapUrl) {
  const items = companies
    .map(
      (c, i) => `      {
        "@type": "ListItem",
        "position": ${i + 1},
        "name": "${c.name} (${c.ticker}, ${c.market})",
        "url": "${mapUrl}#ticker-${c.ticker}"
      }`,
    )
    .join(',\n');
  const block = `{
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "${title}",
    "url": "${mapUrl}",
    "numberOfItems": ${companies.length},
    "itemListElement": [
${items}
    ]
  }`;
  return html.replace(
    /<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "ItemList"[\s\S]*?\}\s*<\/script>/,
    `<script type="application/ld+json">\n  ${block}\n  </script>`,
  );
}

export function stripPrerenderRows(html, keepTickers) {
  const start = '<!-- investingmap-seo-prerender-start -->';
  const end = '<!-- investingmap-seo-prerender-end -->';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end);
  const filterRows = (body) =>
    body.replace(/<tr data-ticker="([^"]+)">[\s\S]*?<\/tr>/g, (full, t) =>
      keepTickers.has(padTicker(t)) ? full : '',
    );
  if (i0 === -1 || i1 === -1 || i1 <= i0) {
    return filterRows(html);
  }
  return html.slice(0, i0 + start.length) + filterRows(html.slice(i0 + start.length, i1)) + html.slice(i1);
}

export function patchChainUi(html, chains, colors) {
  let out = html;
  const colorJson = JSON.stringify(colors);
  out = out.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${colorJson};`);
  const chainListAll = `['all', ${chains.map((c) => `'${c}'`).join(', ')}]`;
  const chainList = `[${chains.map((c) => `'${c}'`).join(', ')}]`;
  out = out.replace(/const chains = \['all', [^\]]+\];/g, `const chains = ${chainListAll};`);
  out = out.replace(
    /const chains = \[[^\]]+\];(?=\s*\n\s*chainContainer)/g,
    `const chains = ${chainList};`,
  );
  out = out.replace(
    /(const chainContainer = document\.getElementById\('sb-chain-legend'\);\s*const chains = )(\[[^\]]+\])/,
    `$1${chainList}`,
  );
  return out;
}

export function patchSubtitles(html, subtitleKo, subtitleEn) {
  let out = html;
  out = out.replace(/(<p id="hdr-subtitle">)[^<]*(<\/p>)/, `$1${subtitleKo}$2`);
  out = out.replace(/("subtitle":\s*")[^"]*(")/, `$1${subtitleKo}$2`);
  out = out.replace(/("en":\s*\{[\s\S]*?"subtitle":\s*")[^"]*(")/, `$1${subtitleEn}$2`);
  return out;
}

export function patchBadges(html, companies) {
  const n = companies.length;
  const kospi = companies.filter((c) => String(c.market || '').toUpperCase() === 'KOSPI').length;
  const kosdaq = companies.filter((c) => String(c.market || '').toUpperCase() === 'KOSDAQ').length;
  let out = html;
  out = out.replace(
    /badgeTotal: '\uCD1D <span>\d+<\/span>\uAC1C [^']+'/,
    `badgeTotal: '\uCD1D <span>${n}</span>\uAC1C \uC0C1\uC7A5\uAE30\uC5C5'`,
  );
  out = out.replace(
    /badgeTotal: '<span>\d+<\/span> [^']+'/,
    `badgeTotal: '<span>${n}</span> listed companies'`,
  );
  out = out.replace(
    /badgeMarket: 'KOSPI <span>\d+<\/span>\uC0AC \u00B7 KOSDAQ <span>\d+<\/span>\uC0AC'/,
    `badgeMarket: 'KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC'`,
  );
  out = out.replace(
    /badgeMarket: 'KOSPI <span>\d+<\/span> \u00B7 KOSDAQ <span>\d+<\/span>'/,
    `badgeMarket: 'KOSPI <span>${kospi}</span> · KOSDAQ <span>${kosdaq}</span>'`,
  );
  out = out.replace(
    /<div class="badge" id="badge-total">[\s\S]*?<\/div>/,
    `<div class="badge" id="badge-total">\uCD1D <span>${n}</span>\uAC1C \uC0C1\uC7A5\uAE30\uC5C5</div>`,
  );
  out = out.replace(
    /<div class="badge" id="badge-market">[\s\S]*?<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC</div>`,
  );
  out = out.replace(
    /<div class="result-count" id="result-label">[\s\S]*?<\/div>/,
    `<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">${n}</span>\uAC1C</div>`,
  );
  return out;
}

/**
 * Clone source HTML into a new sector folder with filtered companies.
 */
export function writeSplitMap(opts) {
  const {
    root,
    sourceHtml,
    companies,
    chains,
    colors,
    folder,
    file,
    dataSector,
    titleKo,
    titleEn,
    subtitleKo,
    subtitleEn,
    titleReplacePairs = [],
    pathReplacePairs = [],
  } = opts;

  if (!companies.length) {
    const outPath = path.join(root, folder, file);
    if (fs.existsSync(outPath)) {
      const existing = extractCompaniesFromHtml(fs.readFileSync(outPath, 'utf8'));
      if (existing.length) {
        console.warn(
          `WARN writeSplitMap ${folder}: empty spin set — keeping existing ${existing.length} companies`,
        );
        return existing;
      }
    }
    throw new Error(`writeSplitMap ${folder}: refusing to write empty company list`);
  }

  ensureDir(path.join(root, folder));
  const mapUrl = `https://www.investingmap.kr/${folder}/${file}`;
  const keep = new Set(companies.map((c) => padTicker(c.ticker)));

  let out = patchKoreanCompaniesHtml(sourceHtml, companies);
  out = stripPrerenderRows(out, keep);
  out = rebuildItemList(out, companies, titleKo, mapUrl);
  out = patchChainUi(out, chains, colors);
  out = patchSubtitles(out, subtitleKo, subtitleEn);
  out = patchBadges(out, companies);
  out = out.replace(/data-sector="[^"]+"/, `data-sector="${dataSector}"`);

  for (const [from, to] of titleReplacePairs) out = out.split(from).join(to);
  for (const [from, to] of pathReplacePairs) out = out.split(from).join(to);

  // Prefer explicit titles after soft replacements
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${titleKo}</title>`);
  out = out.replace(/(<h1 id="hdr-title">)[^<]*(<\/h1>)/, `$1🇰🇷 ${titleKo}$2`);
  out = out.replace(/("title":\s*")[^"]*(")/, `$1🇰🇷 ${titleKo}$2`);
  out = out.replace(/("en":\s*\{[\s\S]*?"title":\s*")[^"]*(")/, `$1🇰🇷 ${titleEn}$2`);

  const outPath = path.join(root, folder, file);
  fs.writeFileSync(outPath, out, 'utf8');
  const written = fs.readFileSync(outPath, 'utf8');
  if (!/return `<tr data-ticker="\$\{c\.ticker\}">/.test(written)) {
    throw new Error(`${folder}: renderTable row template missing`);
  }
  const check = extractCompaniesFromHtml(written);
  if (check.length !== companies.length) {
    throw new Error(`${folder} company count mismatch: ${check.length} vs ${companies.length}`);
  }
  console.log(`OK write ${folder}/${file}: ${check.length} companies`);
  return check;
}

/**
 * Rewrite an existing map in place (keep folder/URL/key) with filtered companies + relabel.
 */
export function rewriteMapInPlace(opts) {
  const {
    htmlPath,
    companies,
    chains,
    colors,
    titleKo,
    titleEn,
    subtitleKo,
    subtitleEn,
    titleReplacePairs = [],
    mapUrl,
  } = opts;

  let html = fs.readFileSync(htmlPath, 'utf8');
  const keep = new Set(companies.map((c) => padTicker(c.ticker)));
  html = patchKoreanCompaniesHtml(html, companies);
  html = stripPrerenderRows(html, keep);
  html = rebuildItemList(html, companies, titleKo, mapUrl);
  html = patchChainUi(html, chains, colors);
  html = patchSubtitles(html, subtitleKo, subtitleEn);
  html = patchBadges(html, companies);
  for (const [from, to] of titleReplacePairs) html = html.split(from).join(to);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${titleKo}</title>`);
  html = html.replace(/(<h1 id="hdr-title">)[^<]*(<\/h1>)/, `$1🇰🇷 ${titleKo}$2`);
  html = html.replace(/("title":\s*")[^"]*(")/, `$1🇰🇷 ${titleKo}$2`);
  html = html.replace(/("en":\s*\{[\s\S]*?"title":\s*")[^"]*(")/, `$1🇰🇷 ${titleEn}$2`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  const check = extractCompaniesFromHtml(html);
  if (check.length !== companies.length) {
    throw new Error(`${htmlPath} company count mismatch: ${check.length} vs ${companies.length}`);
  }
  console.log(`OK rewrite ${path.relative(process.cwd(), htmlPath)}: ${check.length}`);
  return check;
}

export function updateExclusiveForTickers(exclusivePath, tickers, fromSector, toSector) {
  let t = fs.readFileSync(exclusivePath, 'utf8');
  const changed = [];
  for (const raw of tickers) {
    const tk = padTicker(raw);
    const re = new RegExp(`'${tk}':\\s*'${fromSector}'`);
    if (re.test(t)) {
      t = t.replace(re, `'${tk}': '${toSector}'`);
      changed.push(tk);
    } else if (!new RegExp(`'${tk}':\\s*'${toSector}'`).test(t)) {
      // Insert near related comment block if missing
      const insert = `  '${tk}': '${toSector}', // split from ${fromSector}\n`;
      t = t.replace(
        /(export const SECTOR_EXCLUSIVE = \{)/,
        `$1\n${insert}`,
      );
      changed.push(`${tk}+`);
    }
  }
  fs.writeFileSync(exclusivePath, t, 'utf8');
  console.log(`OK exclusive ${fromSector}→${toSector}:`, changed.join(', ') || '(none)');
  return changed;
}

export function syncSectorReturnsListingCounts(root) {
  const indexPath = path.join(root, 'data', 'hub_index.json');
  const retPath = path.join(root, 'data', 'hub_sector_returns.json');
  if (!fs.existsSync(retPath) || !fs.existsSync(indexPath)) return;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const ret = JSON.parse(fs.readFileSync(retPath, 'utf8'));
  if (!ret.sectors) ret.sectors = {};
  for (const [sid, block] of Object.entries(index.sectors || {})) {
    const n = (block.companies || []).length;
    if (!ret.sectors[sid]) {
      // New sector: listingCount only — do not stitch prior return series
      ret.sectors[sid] = {
        listingCount: n,
        splitAt: '2026-09-10',
        note: 'new sector; returns start from split (no history merge)',
      };
    } else {
      ret.sectors[sid].listingCount = n;
    }
  }
  fs.writeFileSync(retPath, JSON.stringify(ret) + '\n', 'utf8');
  console.log('OK hub_sector_returns listingCount sync');
}
