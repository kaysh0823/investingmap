import fs from 'fs';
import path from 'path';
import { extractCompaniesFromHtml } from './map_company_serialize.mjs';
import { SEO_SECTOR_COPY, SECTOR_ROUTES } from './seo_sector_copy.mjs';
import { calcQuotePosition, roundQuotePosition } from './quote_position.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

export const PRERENDER_START = '<!-- investingmap-seo-prerender-start -->';
export const PRERENDER_END = '<!-- investingmap-seo-prerender-end -->';
export const SEO_BODY_START = '<!-- investingmap-seo-body-start -->';
export const SEO_BODY_END = '<!-- investingmap-seo-body-end -->';
export const SEO_RELATED_START = '<!-- investingmap-seo-related-start -->';
export const SEO_RELATED_END = '<!-- investingmap-seo-related-end -->';
export const SEO_LD_START = '<!-- investingmap-seo-ld-start -->';
export const SEO_LD_END = '<!-- investingmap-seo-ld-end -->';

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtMcapKo(won) {
  if (won == null || won === 0 || !Number.isFinite(Number(won))) return '\u2014';
  const trimmed = Math.round(Number(won) / 1e10) * 1e10;
  return `${(trimmed / 1e12).toFixed(2)}\uC870\uC6D0`;
}

export function fmtFinRatio(v) {
  if (v == null || !Number.isFinite(Number(v))) return '\u2014';
  return Number(v).toFixed(2);
}

export function fmtPrice(n) {
  if (n == null || !Number.isFinite(Number(n))) return '\u2014';
  return Number(n).toLocaleString('ko-KR');
}

export function quotePosition(last, low, high) {
  return roundQuotePosition(calcQuotePosition(last, high, low));
}

export function fmtPosition(pct) {
  if (pct == null || !Number.isFinite(pct)) return '\u2014';
  return `${pct}%`;
}

export function fmtRs(rs) {
  if (rs == null || !Number.isFinite(Number(rs))) return '\u2014';
  return Number(rs).toFixed(1);
}

export function extractGlobalCompanies(html) {
  const start = 'const globalCompanies = ';
  const i0 = html.indexOf(start);
  if (i0 < 0) return [];
  const after = html.slice(i0 + start.length);
  const endIdx = after.indexOf('];');
  if (endIdx < 0) return [];
  const inner = after.slice(0, endIdx + 2);
  try {
    return Function('"use strict"; return ' + inner)();
  } catch {
    return [];
  }
}

export function extractBioCompanies(inlineJs) {
  const m = inlineJs.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('bio koreanCompanies not found in inline.js');
  return Function('"use strict"; return ' + m[1])();
}

export function partnerRef(p) {
  if (typeof p === 'string') return { id: p };
  return p || { id: '' };
}

export function buildGlobalMap(globals) {
  const map = new Map();
  for (const g of globals || []) {
    if (g && g.id) map.set(g.id, g);
  }
  return map;
}

export function partnerNames(c, globalMap, limit = 6) {
  const parts = (c.partners || []).slice(0, limit).map((p) => {
    const pr = partnerRef(p);
    const g = globalMap.get(pr.id);
    if (g) return g.name || g.nameEn || pr.id;
    return pr.id;
  });
  return parts.filter(Boolean).join(', ') || '\u2014';
}

export function companyChains(c) {
  const chains = [c.chain, ...(c.extraChains || [])].filter(Boolean);
  return [...new Set(chains)];
}

export function patchBetween(html, startMark, endMark, inner) {
  const re = new RegExp(`${escapeRe(startMark)}[\\s\\S]*?${escapeRe(endMark)}`, 'm');
  const block = `${startMark}\n${inner}\n${endMark}`;
  if (re.test(html)) return html.replace(re, block);
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function injectOrReplace(html, startMark, endMark, inner, anchor) {
  const patched = patchBetween(html, startMark, endMark, inner);
  if (patched) return patched;
  if (anchor && html.includes(anchor)) {
    return html.replace(anchor, `${startMark}\n${inner}\n${endMark}\n${anchor}`);
  }
  return html;
}

export function fmtReturnPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '\u2014';
  const sign = Number(n) > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(2)}%`;
}

export function buildTableRows(companies, quotes, rsMap, globalMap) {
  const sorted = [...companies].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  return sorted
    .map((c) => {
      const q = quotes[c.ticker] || {};
      const rs = rsMap[c.ticker] || {};
      const pos = quotePosition(q.last, q.low52w, q.high52w);
      const chains = companyChains(c);
      const chainText = chains.join(' · ') || c.chain || '\u2014';
      const mkt = c.market || '\u2014';
      const mktClass = (c.market || '').toLowerCase();
      const subName =
        c.nameEn && c.nameEn !== c.name
          ? `<div class="company-name-sub">${escHtml(c.nameEn)}</div>`
          : '';
      const partners = escHtml(partnerNames(c, globalMap));
      return `          <tr data-ticker="${escHtml(c.ticker)}">
      <td><div class="company-name">${escHtml(c.name)}</div>${subName}</td>
      <td><span class="ticker">${escHtml(c.ticker)}</span></td>
      <td class="quote-cell">${fmtPrice(q.last)}</td>
      <td class="quote-cell ret-cell">${fmtReturnPct(rs.chg1dPct)}</td>
      <td class="quote-cell ret-cell">${fmtReturnPct(rs.ret20dPct ?? rs.ret1mPct)}</td>
      <td class="quote-cell ret-cell">${fmtReturnPct(rs.ret50dPct ?? rs.ret3mPct)}</td>
      <td class="quote-cell ret-cell">${fmtReturnPct(rs.ret120dPct ?? rs.ret6mPct)}</td>
      <td class="quote-cell ret-cell">${fmtReturnPct(rs.ret250dPct ?? rs.ret1yPct)}</td>
      <td class="quote-cell">${fmtPrice(q.high52w)}</td>
      <td class="quote-cell">${fmtPrice(q.low52w)}</td>
      <td class="quote-cell">${fmtPosition(pos)}</td>
      <td class="quote-cell">${fmtRs(rs && rs.rs)}</td>
      <td class="mcap-cell">${fmtMcapKo(c.mcapWon)}</td>
      <td class="fin-cell">${fmtFinRatio(c.per)}</td>
      <td class="fin-cell">${fmtFinRatio(c.pbr)}</td>
      <td><span class="market-badge ${escHtml(mktClass)}">${escHtml(mkt)}</span></td>
      <td><span class="chain-tag">${escHtml(chainText)}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(c.semType || '\u2014')}</td>
      <td class="products-cell">${escHtml(c.products || '\u2014')}</td>
      <td><div class="partners-list">${partners}</div></td>
    </tr>`;
    })
    .join('\n');
}

/** Escape text but preserve simple authored <a href="...">label</a> links. */
export function escEditorialHtml(s) {
  const parts = [];
  const withPh = String(s ?? '').replace(/<a href="([^"]+)">([^<]*)<\/a>/g, (_, href, text) => {
    const i = parts.length;
    parts.push(`<a href="${escHtml(href)}">${escHtml(text)}</a>`);
    return `\u0000PH${i}\u0000`;
  });
  return escHtml(withPh).replace(/\u0000PH(\d+)\u0000/g, (_, i) => parts[Number(i)]);
}

export function buildSeoBodyBlock(geoKey, lastmod) {
  const copy = SEO_SECTOR_COPY[geoKey];
  if (!copy) return '';
  const parasKo = copy.paragraphsKo?.length ? copy.paragraphsKo : [copy.bodyKo].filter(Boolean);
  const parasEn = copy.paragraphsEn?.length ? copy.paragraphsEn : [copy.bodyEn].filter(Boolean);
  const koPs = parasKo.map((p) => `    <p lang="ko" class="im-seo-body-p">${escEditorialHtml(p)}</p>`).join('\n');
  const enPs = parasEn.map((p) => `    <p lang="en" class="im-seo-body-p" hidden>${escEditorialHtml(p)}</p>`).join('\n');
  return `      <!-- investingmap-seo-body-start -->
      <div class="im-seo-body map-editorial-seo" id="im-seo-body" aria-labelledby="im-seo-body-title">
    <h2 id="im-seo-body-title" class="map-editorial-seo-title" lang="ko">${escHtml(copy.titleKo)}</h2>
    <h2 id="im-seo-body-title-en" class="map-editorial-seo-title" lang="en" hidden>${escHtml(copy.titleEn)}</h2>
${koPs}
${enPs}
    <p class="im-seo-keywords" lang="ko"><strong>키워드:</strong> ${escHtml(copy.keywordsKo || '')}</p>
    <p class="im-seo-keywords" lang="en" hidden><strong>Keywords:</strong> ${escHtml(copy.keywordsEn || '')}</p>
    <p class="im-seo-snapshot-note">표 시세·52주·RS 필드 스냅샷 기준일: ${escHtml(lastmod)} (영업일 /api/quotes로 갱신) · Table quote snapshot as of ${escHtml(lastmod)}.</p>
  </div>
      <!-- investingmap-seo-body-end -->`;
}

export function ensureEditorialDetailsOpen(html) {
  return html.replace(
    /<details(\s+class="map-editorial-details")(?![^>]*\bopen\b)/g,
    '<details$1 open',
  );
}

export function patchSeoBodyIntoEditorial(html, inner) {
  if (!inner) return html;
  html = html.replace(/\s*<section class="im-seo-body"[^>]*id="im-seo-body"[\s\S]*?<\/section>\s*/g, '\n');
  html = html.replace(
    /(<div id="map-editorial-body" class="map-editorial-body"><\/div>)\s*<!-- investingmap-seo-body-start -->[\s\S]*?<!-- investingmap-seo-body-end -->/,
    '$1',
  );
  html = html.replace(/\s*<!-- investingmap-seo-body-start -->[\s\S]*?<!-- investingmap-seo-body-end -->\s*/g, '\n');
  const wrapped = `<div id="map-editorial-body" class="map-editorial-body">\n${inner}\n      </div>`;
  const emptyAnchor = '<div id="map-editorial-body" class="map-editorial-body"></div>';
  if (html.includes(emptyAnchor)) return html.replace(emptyAnchor, wrapped);
  return html.replace(
    /<div id="map-editorial-body" class="map-editorial-body">[\s\S]*?<\/div>/,
    wrapped,
  );
}

export function buildRelatedBlock(currentGeoKey) {
  const items = SECTOR_ROUTES.filter((r) => r.geoKey !== currentGeoKey)
    .map((r) => {
      const href = `../${r.file}`;
      return `      <li><a href="${href}">${escHtml(r.labelKo)}</a> · <a href="${href}?lang=en" hreflang="en">${escHtml(r.labelEn)}</a></li>`;
    })
    .join('\n');
  return `  <section class="im-seo-related" id="im-seo-related" aria-labelledby="im-seo-related-title">
    <h2 id="im-seo-related-title">관련 산업 지도 / Related industry maps</h2>
    <nav aria-label="Related industry maps">
      <ul class="im-seo-related-list">
${items}
      </ul>
    </nav>
  </section>`;
}

export function buildItemListLd(titleKo, companies, pageUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: titleKo,
    url: pageUrl,
    numberOfItems: companies.length,
    itemListElement: companies.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${c.name} (${c.ticker}, ${c.market})`,
      url: `${pageUrl}#ticker-${c.ticker}`,
    })),
  };
}

export function buildBreadcrumbLd(titleKo, pageUrl, base) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Investing Map', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: titleKo, item: pageUrl },
    ],
  };
}

export function ldScriptTag(obj) {
  return `  <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/^/gm, '  ')}\n  </script>`;
}

export function buildLdBlock(titleKo, companies, pageUrl, base) {
  const breadcrumb = buildBreadcrumbLd(titleKo, pageUrl, base);
  const itemList = buildItemListLd(titleKo, companies, pageUrl);
  return `${ldScriptTag(breadcrumb)}\n${ldScriptTag(itemList)}`;
}

export function patchHreflang(html, pageUrl) {
  let out = html;
  out = out.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${pageUrl}">`);
  out = out.replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${pageUrl}">`);
  out = out.replace(/<link rel="alternate" hreflang="ko[^"]*" href="[^"]*">/i, `<link rel="alternate" hreflang="ko-KR" href="${pageUrl}?lang=ko">`);
  out = out.replace(/<link rel="alternate" hreflang="en[^"]*" href="[^"]*">/i, `<link rel="alternate" hreflang="en-US" href="${pageUrl}?lang=en">`);
  if (!out.includes('hreflang="x-default"')) {
    out = out.replace(/(<link rel="canonical"[^>]*>)/, `$1\n  <link rel="alternate" hreflang="x-default" href="${pageUrl}">`);
  } else {
    out = out.replace(/<link rel="alternate" hreflang="x-default" href="[^"]*">/i, `<link rel="alternate" hreflang="x-default" href="${pageUrl}">`);
  }
  return out;
}

export const SEO_PRERENDER_CSS = `
    .map-editorial-body .map-editorial-seo { margin: 0; padding: 0; border: none }
    .map-editorial-body .map-editorial-seo-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      margin: 14px 0 8px
    }
    .map-editorial-body .map-editorial-seo-title:first-child { margin-top: 0 }
    .map-editorial-body .im-seo-body-p { margin: 0 0 10px }
    .map-editorial-body .im-seo-keywords,
    .map-editorial-body .im-seo-snapshot-note { font-size: 12px; margin: 0 0 8px; opacity: .9 }
    .map-editorial-body p[hidden], .map-editorial-body h2[hidden] { display: none }
    .im-seo-snapshot-note { font-size: 12px; opacity: .85 }
    .im-seo-related {
      max-width: 960px;
      margin: 0 auto;
      padding: 20px 28px 28px;
      font-size: 13px;
      border-top: 1px solid var(--border)
    }
    .im-seo-related h2 { font-size: 15px; margin: 0 0 12px; color: var(--text) }
    .im-seo-related-list { margin: 0; padding-left: 1.2rem; line-height: 1.8 }
    .im-seo-related-list a { color: var(--accent); text-decoration: none }
    .im-seo-related-list a:hover { text-decoration: underline }
`;

export function ensureSeoCss(html) {
  const nested = '.map-editorial-body .map-editorial-seo';
  if (html.includes(nested)) return html;
  const legacyRe = /\s*\.(?:map-editorial-details \.)?im-seo-body \{[\s\S]*?\.im-seo-snapshot-note \{ font-size: 12px; opacity: \.85 \}/;
  if (legacyRe.test(html)) return html.replace(legacyRe, SEO_PRERENDER_CSS);
  return html.replace(/(\s*<\/style>)/, `${SEO_PRERENDER_CSS}$1`);
}

export function patchTbody(html, rows, count) {
  const inner = rows;
  const tbodyRe = new RegExp(
    `<tbody id="table-body">\\s*${escapeRe(PRERENDER_START)}[\\s\\S]*?${escapeRe(PRERENDER_END)}\\s*</tbody>`,
    'm',
  );
  const replacement = `<tbody id="table-body">\n${PRERENDER_START}\n${inner}\n${PRERENDER_END}\n          </tbody>`;
  if (tbodyRe.test(html)) {
    html = html.replace(tbodyRe, replacement);
  } else {
    html = html.replace(/<tbody id="table-body"><\/tbody>/, replacement);
    html = html.replace(/<tbody id="table-body">\s*<\/tbody>/, replacement);
  }
  if (count != null) {
    html = html.replace(/(<span id="show-count">)\d+(<\/span>)/, `$1${count}$2`);
  }
  return html;
}

export function loadSnapshots(root) {
  const quotesPath = path.join(root, 'data/hub_quote_snapshot.json');
  const rsPath = path.join(root, 'data/hub_rs_snapshot.json');
  const quotesFile = JSON.parse(fs.readFileSync(quotesPath, 'utf8'));
  const rsFile = fs.existsSync(rsPath) ? JSON.parse(fs.readFileSync(rsPath, 'utf8')) : { quotes: {} };
  const rsMap = {};
  for (const [ticker, row] of Object.entries(rsFile.quotes || {})) {
    rsMap[ticker] = row;
  }
  return {
    quotes: quotesFile.quotes || {},
    rsMap,
    builtAt: quotesFile.builtAt || rsFile.builtAt || kstYmdDash(),
  };
}

export function prerenderMapPage({ root, rel, geoKey, base, pageMeta, snapshots }) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  let companies;
  let globals = [];

  if (geoKey === 'bio') {
    const inlinePath = path.join(root, 'bio/korea_bio_map.inline.js');
    const inlineJs = fs.readFileSync(inlinePath, 'utf8');
    companies = extractBioCompanies(inlineJs);
    globals = extractGlobalCompanies(inlineJs);
  } else {
    companies = extractCompaniesFromHtml(html);
    globals = extractGlobalCompanies(html);
  }

  const globalMap = buildGlobalMap(globals);
  const rows = buildTableRows(companies, snapshots.quotes, snapshots.rsMap, globalMap);
  html = patchTbody(html, rows, companies.length);

  const pageUrl = `${base}${pageMeta.path}`;
  const bodyBlock = buildSeoBodyBlock(geoKey, snapshots.builtAt);
  html = patchSeoBodyIntoEditorial(html, bodyBlock);
  html = ensureEditorialDetailsOpen(html);

  const related = buildRelatedBlock(geoKey);
  html = injectOrReplace(html, SEO_RELATED_START, SEO_RELATED_END, related, '</body>')
    || html.replace(/<\/body>/, `${SEO_RELATED_START}\n${related}\n${SEO_RELATED_END}\n</body>`);

  const ld = buildLdBlock(pageMeta.title.ko, companies, pageUrl, base);
  html = injectOrReplace(html, SEO_LD_START, SEO_LD_END, ld, '<meta name="investingmap-quotes-api"')
    || injectOrReplace(html, SEO_LD_START, SEO_LD_END, ld, '<title>');

  html = patchHreflang(html, pageUrl);
  html = ensureSeoCss(html);

  const countInSummary = pageMeta.summary.ko.match(/\d+/);
  if (countInSummary) {
    const n = companies.length;
    pageMeta.summary.ko = pageMeta.summary.ko.replace(/\d+개사/, `${n}개사`).replace(/\d+개/, `${n}개`);
    pageMeta.summary.en = pageMeta.summary.en.replace(/\d+ listed/, `${n} listed`).replace(/\d+ names/, `${n} names`);
  }

  fs.writeFileSync(abs, html, 'utf8');
  return companies.length;
}
