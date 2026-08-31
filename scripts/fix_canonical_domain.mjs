/**
 * Rewrite SEO/canonical metadata host to the preferred public domain.
 *
 * Does NOT add HTTP redirects between investing-kr.com and investingmap.kr —
 * both hosts keep serving the same content. This only updates strings used for
 * <link rel="canonical">, og:url, hreflang, JSON-LD, sitemap <loc>, robots
 * Sitemap:, and llms.txt links so search engines treat investingmap.kr as
 * the preferred URL.
 *
 * Run last in `npm run build` (after pages_build) so dist/ and all HTML
 * generators are covered. Safe to re-run.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Live apex + www both 200 with no cross-redirect; prefer www for SEO unity. */
export const CANONICAL_ORIGIN = 'https://www.investingmap.kr';

const OLD_HOST_RE = /https?:\/\/(?:www\.)?investing-kr\.com/gi;
const NON_WWW_MAP_RE = /https?:\/\/investingmap\.kr(?=\/|"|'|$)/gi;

const HUB_DESCRIPTION_EN =
  'Hub for ten Korean industry maps: listed KOSPI/KOSDAQ companies, value chains, KRX market cap, PER, PBR, and relationship networks for semiconductor, energy, power grid, finance, construction, shipbuilding, defense, K-culture, bio, and robotics.';

const HUB_OG_DESCRIPTION_EN =
  'Hub for ten Korean industry maps: listed KOSPI/KOSDAQ companies, value chains, KRX market cap, PER, PBR, and relationship networks.';

const HUB_LD_DESCRIPTION_EN =
  'Interactive maps of Korean listed companies across ten sectors: semiconductor, energy, power grid, finance, construction, shipbuilding, defense, K-culture, bio, and robotics.';

const TEXT_EXT = new Set(['.html', '.xml', '.txt', '.json', '.js', '.mjs', '.md']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'functions',
  '.wrangler',
  '.cache',
]);

const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/geo.json'), 'utf8'));

function shouldScan(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXT.has(ext);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith('.') && name.name !== '.well-known') continue;
    if (SKIP_DIRS.has(name.name)) continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (shouldScan(full)) out.push(full);
  }
  return out;
}

function rewriteHosts(text) {
  return text.replace(OLD_HOST_RE, CANONICAL_ORIGIN).replace(NON_WWW_MAP_RE, CANONICAL_ORIGIN);
}

function pageUrlForRel(rel) {
  const norm = rel.replace(/\\/g, '/');
  if (norm === 'index.html') return `${CANONICAL_ORIGIN}/`;
  if (norm.endsWith('.html')) return `${CANONICAL_ORIGIN}/${norm}`;
  return null;
}

function geoPageForRel(rel) {
  const norm = `/${rel.replace(/\\/g, '/')}`;
  for (const page of Object.values(geo.pages || {})) {
    if (page.path === norm) return page;
  }
  return null;
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

function patchCanonicalHead(html, pageUrl) {
  if (!pageUrl) return html;
  let out = html;
  out = out.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${pageUrl}">`);
  out = out.replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${pageUrl}">`);
  const langKo = `${pageUrl}?lang=ko`;
  const langEn = `${pageUrl}?lang=en`;
  out = out.replace(
    /<link rel="alternate" hreflang="ko[^"]*" href="[^"]*">/i,
    `<link rel="alternate" hreflang="ko-KR" href="${langKo}">`,
  );
  out = out.replace(
    /<link rel="alternate" hreflang="en[^"]*" href="[^"]*">/i,
    `<link rel="alternate" hreflang="en-US" href="${langEn}">`,
  );
  out = out.replace(
    /<link rel="alternate" hreflang="x-default" href="[^"]*">/i,
    `<link rel="alternate" hreflang="x-default" href="${pageUrl}">`,
  );
  return out;
}

function patchMapMetaFromGeo(html, geoPage) {
  const desc = escAttr(geoPage.summary.ko);
  const title = escAttr(geoPage.title.ko);
  let out = html;
  out = out.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${desc}">`);
  out = out.replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${title}">`);
  out = out.replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${desc}">`);
  out = out.replace(/<meta name="twitter:title" content="[^"]*">/i, `<meta name="twitter:title" content="${title}">`);
  out = out.replace(/<meta name="twitter:description" content="[^"]*">/i, `<meta name="twitter:description" content="${desc}">`);
  if (/<title>[^<]*<\/title>/i.test(out)) {
    out = out.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  }
  return out;
}

function patchIndexHubCopy(html) {
  let out = html;
  out = out.replace(
    /<meta name="description" content="[^"]*">/i,
    `<meta name="description" content="${HUB_DESCRIPTION_EN}">`,
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*">/i,
    `<meta property="og:description" content="${HUB_OG_DESCRIPTION_EN}">`,
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*">/i,
    `<meta name="twitter:description" content="${HUB_OG_DESCRIPTION_EN}">`,
  );
  out = out.replace(
    /"description": "Interactive maps of Korean listed companies[^"]*"/,
    `"description": "${HUB_LD_DESCRIPTION_EN}"`,
  );
  out = out.replace(
    /Hub for eight Korean industry maps:[^<]*/,
    HUB_OG_DESCRIPTION_EN,
  );
  return out;
}

function patchAboutCopy(html) {
  return html.replace(
    /<strong>여덟 개 산업<\/strong>/,
    '<strong>열 개 산업</strong>',
  ).replace(
    /반도체, 바이오, 조선·해양, 방산·우주·항공, 로봇·피지컬AI, 에너지, 전력설비, K컬처 등/,
    '반도체, 에너지, 전력설비, 금융, 건설, 조선·해양, 방산·우주, K컬처, 바이오, 로봇·피지컬AI 등',
  );
}

function processFile(file) {
  const rel = path.relative(ROOT, file);
  let after = rewriteHosts(fs.readFileSync(file, 'utf8'));
  const pageUrl = pageUrlForRel(rel);

  if (rel.endsWith('.html') && pageUrl) {
    after = patchCanonicalHead(after, pageUrl);
    if (rel === 'index.html') {
      after = patchIndexHubCopy(after);
    } else if (rel === 'about.html') {
      after = patchAboutCopy(after);
    } else {
      const geoPage = geoPageForRel(rel);
      if (geoPage && after.includes('investingmap-seo')) {
        after = patchMapMetaFromGeo(after, geoPage);
      }
    }
  }

  return after;
}

function main() {
  const files = walk(ROOT);
  let changed = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = processFile(file);
    if (after === before) continue;
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
    console.log('updated', path.relative(ROOT, file));
  }

  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    let distChanged = 0;
    for (const file of walk(dist)) {
      const before = fs.readFileSync(file, 'utf8');
      const rel = path.relative(dist, file);
      let after = rewriteHosts(before);
      const pageUrl = pageUrlForRel(rel);
      if (rel.endsWith('.html') && pageUrl) {
        after = patchCanonicalHead(after, pageUrl);
        if (rel === 'index.html') after = patchIndexHubCopy(after);
        else if (rel === 'about.html') after = patchAboutCopy(after);
        else {
          const geoPage = geoPageForRel(rel);
          if (geoPage && after.includes('investingmap-seo')) {
            after = patchMapMetaFromGeo(after, geoPage);
          }
        }
      }
      if (after === before) continue;
      fs.writeFileSync(file, after, 'utf8');
      distChanged += 1;
    }
    if (distChanged) console.log(`dist/: ${distChanged} files updated`);
  }

  console.log(`OK fix_canonical_domain → ${CANONICAL_ORIGIN} (${changed} source files)`);
}

main();
