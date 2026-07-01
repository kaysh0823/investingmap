/**
 * SEO prerender: static table rows, crawlable copy, JSON-LD, robots.txt, sitemap.xml.
 * Re-run after map data or quote snapshots change.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geo, BASE, root } from './geo_lib.mjs';
import { SECTOR_ROUTES } from '../lib/seo_sector_copy.mjs';
import {
  loadSnapshots,
  prerenderMapPage,
  patchHreflang,
  SEO_LD_START,
  SEO_LD_END,
  ldScriptTag,
  patchBetween,
} from '../lib/seo_prerender_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readLastmod() {
  try {
    const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hub_index.json'), 'utf8'));
    if (hub.builtAt) return hub.builtAt;
  } catch {
    /* ignore */
  }
  return geo.dates.dataAsOf || new Date().toISOString().slice(0, 10);
}

function writeRobotsTxt() {
  const body = `User-agent: *
Allow: /

Sitemap: ${BASE}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), body, 'utf8');
  console.log('wrote robots.txt');
}

function writeSitemap(lastmod) {
  const urls = [
    { loc: `${BASE}/`, priority: '1.0', changefreq: 'daily' },
    ...SECTOR_ROUTES.map((r) => ({
      loc: `${BASE}/${r.file}`,
      priority: '0.9',
      changefreq: 'daily',
    })),
    { loc: `${BASE}/about.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${BASE}/editorial-policy.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${BASE}/faq.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${BASE}/privacy.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${BASE}/disclaimer.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${BASE}/authors.html`, priority: '0.3', changefreq: 'monthly' },
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), body, 'utf8');
  console.log(`wrote sitemap.xml (${urls.length} URLs, lastmod=${lastmod})`);
}

function patchIndex(lastmod) {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = patchHreflang(html, `${BASE}/`);

  const hubLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: geo.site.name,
    url: `${BASE}/`,
    description: geo.site.description.en,
    inLanguage: ['ko', 'en'],
    publisher: { '@type': 'Organization', name: geo.organization.name, url: `${BASE}/` },
  };
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: geo.organization.name,
    url: `${BASE}/`,
    logo: geo.site.logo,
    description: geo.site.description.ko,
    knowsAbout: geo.organization.knowsAbout,
    ...(geo.site.sameAs?.length ? { sameAs: geo.site.sameAs } : {}),
  };

  const ldBlock = `${ldScriptTag(hubLd)}\n${ldScriptTag(orgLd)}`;
  const patched = patchBetween(html, SEO_LD_START, SEO_LD_END, ldBlock);
  if (patched) {
    html = patched;
  } else if (!html.includes('"@type": "WebSite"')) {
    html = html.replace(/(<script src="js\/seo\.js"><\/script>)/, `$1\n${SEO_LD_START}\n${ldBlock}\n${SEO_LD_END}`);
  }

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('patched index.html hreflang / JSON-LD');
}

function main() {
  const snapshots = loadSnapshots(ROOT);
  const lastmod = readLastmod();
  console.log(`SEO prerender — quote snapshot: ${snapshots.builtAt}, hub lastmod: ${lastmod}`);

  for (const route of SECTOR_ROUTES) {
    const pageMeta = geo.pages[route.geoKey];
    if (!pageMeta) {
      console.warn('skip: no geo.pages entry for', route.geoKey);
      continue;
    }
    const n = prerenderMapPage({
      root: ROOT,
      rel: route.file,
      geoKey: route.geoKey,
      base: BASE,
      pageMeta,
      snapshots,
    });
    console.log(`${route.file}: ${n} static table rows`);
  }

  writeRobotsTxt();
  writeSitemap(lastmod);
  patchIndex(lastmod);
  console.log('OK prerender_seo');
}

main();
