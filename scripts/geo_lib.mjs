/**
 * Shared JSON-LD builders and trust-footer markup for GEO (geo-strategy.mdc).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = JSON.parse(fs.readFileSync(path.join(root, 'data/geo.json'), 'utf8'));
const BASE = geo.site.url;

export function organizationLd() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: geo.organization.name,
    url: BASE + '/',
    logo: geo.site.logo,
    description: geo.site.description.ko,
    knowsAbout: geo.organization.knowsAbout,
  };
  if (geo.site.sameAs?.length) org.sameAs = geo.site.sameAs;
  return org;
}

export function webSiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: geo.site.name,
    url: BASE + '/',
    description: geo.site.description.en,
    inLanguage: ['ko', 'en'],
    publisher: { '@type': 'Organization', name: geo.organization.name, url: BASE + '/' },
  };
}

export function webPageLd(opts) {
  const { name, description, url, dateModified } = opts;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    inLanguage: ['ko', 'en'],
    dateModified: `${dateModified || geo.dates.geoModified}T09:00:00+09:00`,
    isPartOf: { '@type': 'WebSite', name: geo.site.name, url: BASE + '/' },
    publisher: { '@type': 'Organization', name: geo.organization.name, url: BASE + '/' },
    citation: geo.citations,
  };
}

export function articleLd(opts) {
  const { headline, description, url, datePublished, dateModified } = opts;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url,
    datePublished: `${datePublished || geo.dates.geoPublished}T09:00:00+09:00`,
    dateModified: `${dateModified || geo.dates.geoModified}T09:00:00+09:00`,
    author: {
      '@type': 'Organization',
      name: geo.editorialTeam.name,
      url: BASE + '/authors.html',
    },
    publisher: {
      '@type': 'Organization',
      name: geo.organization.name,
      logo: { '@type': 'ImageObject', url: geo.site.logo },
    },
    citation: geo.citations,
  };
}

export function faqPageLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function ldScript(obj) {
  return `  <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/^/gm, '  ')}\n  </script>`;
}

export const TRUST_FOOTER_MARKER = 'investingmap-geo-footer';

export function trustFooterHtml(depth) {
  const prefix = depth === 0 ? '' : '../';
  return `
  <footer class="im-trust-footer" id="im-trust-footer" data-investingmap-geo-footer>
    <nav class="im-trust-nav" aria-label="Trust and policies">
      <a href="${prefix}editorial-policy.html" id="tf-editorial">편집·검증 정책</a>
      <a href="${prefix}disclaimer.html" id="tf-disclaimer">면책 고지</a>
      <a href="${prefix}authors.html" id="tf-authors">편집·데이터 팀</a>
      <a href="${prefix}faq.html" id="tf-faq">FAQ</a>
      <a href="${prefix}index.html" id="tf-hub">허브</a>
    </nav>
    <p class="im-trust-disclaimer" id="tf-inline-disclaimer">본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 투자 결정과 책임은 투자자 본인에게 있습니다.</p>
  </footer>`;
}

export const TRUST_FOOTER_CSS = `
    .im-trust-footer {
      border-top: 1px solid var(--border);
      padding: 20px 28px 28px;
      margin-top: 24px;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.55
    }

    .im-trust-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin-bottom: 12px
    }

    .im-trust-nav a {
      color: var(--accent);
      text-decoration: none
    }

    .im-trust-nav a:hover {
      text-decoration: underline
    }

    .im-trust-disclaimer {
      max-width: 720px
    }
`;

export { geo, BASE, root };
