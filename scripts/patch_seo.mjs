/**
 * Inject SEO meta tags, JSON-LD, seo.js, and applyLang sync into map HTML pages.
 * Safe to re-run: when investingmap-seo already exists, resync WebPage JSON-LD
 * name/description/url (and matching og/canonical meta) from PAGES.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE, geo } from './geo_lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'investingmap-seo';

/** Curated SEO pages — derived from data/geo.json so titles/summaries stay aligned. */
function pagesFromGeo() {
  const out = [];
  for (const [, p] of Object.entries(geo.pages || {})) {
    if (!p?.path || !p?.title?.ko) continue;
    const file = String(p.path).replace(/^\//, '');
    if (!fs.existsSync(path.join(root, file))) continue;
    out.push({
      file,
      path: p.path,
      title: p.title.ko,
      description: p.summary?.ko || p.title.ko,
    });
  }
  return out;
}

export const PAGES = pagesFromGeo();

/** Resolve PAGES entry (or geo fallback) for a map HTML relative path. */
export function pageConfigForFile(rel) {
  const norm = String(rel || '').replace(/\\/g, '/');
  const hit = PAGES.find((p) => p.file === norm);
  if (hit) return hit;
  for (const [, p] of Object.entries(geo.pages || {})) {
    if (!p?.path || !p?.title?.ko) continue;
    const file = String(p.path).replace(/^\//, '');
    if (file === norm) {
      return {
        file,
        path: p.path,
        title: p.title.ko,
        description: p.summary?.ko || p.title.ko,
      };
    }
  }
  return null;
}

function seoBlock(page) {
  const url = `${BASE}${page.path}`;
  const desc = page.description.replace(/"/g, '&quot;');
  return `  <!-- ${MARKER} -->
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <meta name="description" content="${desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ko" href="${url}?lang=ko">
  <link rel="alternate" hreflang="en" href="${url}?lang=en">
  <link rel="alternate" hreflang="x-default" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Investing Map">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${page.title}">
  <meta property="og:description" content="${desc}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${page.title}">
  <meta name="twitter:description" content="${desc}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${page.title}",
    "description": "${page.description.replace(/"/g, '\\"')}",
    "url": "${url}",
    "inLanguage": ["ko", "en"],
    "isPartOf": {
      "@type": "WebSite",
      "name": "Investing Map",
      "url": "${BASE}/"
    }
  }
  </script>
  <script src="../js/seo.js"></script>
`;
}

export function resyncSeoWebPage(html, page) {
  if (!html || !page) return html;
  const url = `${BASE}${page.path}`;
  const descAttr = page.description.replace(/"/g, '&quot;');
  let next = html;

  // Keep meta/og/canonical aligned with PAGES (source of truth for this block).
  next = next.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${descAttr}$2`,
  );
  next = next.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  next = next.replace(
    /(<link rel="alternate" hreflang="ko" href=")[^"]*(")/,
    `$1${url}?lang=ko$2`,
  );
  next = next.replace(
    /(<link rel="alternate" hreflang="en" href=")[^"]*(")/,
    `$1${url}?lang=en$2`,
  );
  next = next.replace(
    /(<link rel="alternate" hreflang="x-default" href=")[^"]*(")/,
    `$1${url}$2`,
  );
  next = next.replace(/(property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  next = next.replace(/(property="og:title" content=")[^"]*(")/, `$1${page.title}$2`);
  next = next.replace(
    /(property="og:description" content=")[^"]*(")/,
    `$1${descAttr}$2`,
  );
  next = next.replace(/(name="twitter:title" content=")[^"]*(")/, `$1${page.title}$2`);
  next = next.replace(
    /(name="twitter:description" content=")[^"]*(")/,
    `$1${descAttr}$2`,
  );

  // Resync the WebPage JSON-LD that belongs to the investingmap-seo block
  // (first ld+json after the marker, before seo.js).
  // Do not capture trailing whitespace in `pre` — pretty already indents;
  // capturing \s* would accumulate 2 spaces on every resync (non-idempotent).
  next = next.replace(
    /(<!-- investingmap-seo -->[\s\S]*?<script type="application\/ld\+json">)\s*([\s\S]*?)(\s*<\/script>\s*<script src="\.\.\/js\/seo\.js"><\/script>)/,
    (full, pre, jsonStr, post) => {
      let obj;
      try {
        obj = JSON.parse(jsonStr);
      } catch {
        return full;
      }
      if (obj['@type'] !== 'WebPage') return full;
      obj.name = page.title;
      obj.description = page.description;
      obj.url = url;
      if (!obj['@context']) obj['@context'] = 'https://schema.org';
      if (!obj.inLanguage) obj.inLanguage = ['ko', 'en'];
      if (!obj.isPartOf) {
        obj.isPartOf = {
          '@type': 'WebSite',
          name: 'Investing Map',
          url: `${BASE}/`,
        };
      }
      const pretty = JSON.stringify(obj, null, 2).replace(/^/gm, '  ');
      return `${pre}\n${pretty}${post}`;
    },
  );
  return next;
}

function patchFile(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.warn('missing:', rel);
    return;
  }
  let html = fs.readFileSync(abs, 'utf8');
  const page = PAGES.find((p) => p.file === rel.replace(/\\/g, '/'));
  if (!page) {
    console.warn('no SEO config for', rel);
    return;
  }

  if (html.includes(MARKER)) {
    const before = html;
    html = resyncSeoWebPage(html, page);
    if (html !== before) {
      fs.writeFileSync(abs, html, 'utf8');
      console.log('resync:', rel);
    } else {
      console.log('unchanged:', rel);
    }
    return;
  }

  const viewportRe = /(<meta name="viewport" content="width=device-width, initial-scale=1\.0">)/;
  if (!viewportRe.test(html)) {
    console.warn('no viewport in', rel);
    return;
  }

  html = html.replace(viewportRe, `$1\n${seoBlock(page)}`);

  if (!html.includes('InvestingMapSeo.sync')) {
    const seoLine =
      "      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: t.title, description: t.subtitle });\n";
    if (html.includes('document.title = t.title;\n      if (window.InvestingMapSectorNav)')) {
      html = html.replace(
        /document\.title = t\.title;\n      if \(window\.InvestingMapSectorNav\)/,
        'document.title = t.title;\n' + seoLine + '      if (window.InvestingMapSectorNav)',
      );
    } else {
      html = html.replace(
        /document\.title = t\.title;\n/,
        'document.title = t.title;\n' + seoLine,
      );
    }
  }

  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', rel);
}

function main() {
  for (const page of PAGES) patchFile(page.file);

  // bio inline tail (regenerated into korea_bio_map.inline.js)
  const bioTail = path.join(root, 'bio/bio_inline_tail.js');
  if (fs.existsSync(bioTail)) {
    let tail = fs.readFileSync(bioTail, 'utf8');
    if (!tail.includes('InvestingMapSeo.sync')) {
      tail = tail.replace(
        /document\.title = t\.title;\n/,
        "document.title = t.title;\n      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: t.title, description: t.subtitle });\n",
      );
      fs.writeFileSync(bioTail, tail, 'utf8');
      console.log('patched: bio/bio_inline_tail.js');
    }
  }

  console.log('OK patch_seo');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
