/** Shared helpers for reading/writing koreanCompanies arrays in map HTML. */

export function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function fmtMcap(won) {
  if (won == null || won === 0) return '\u2014';
  const trimmed = Math.round(Number(won) / 1e10) * 1e10;
  return (trimmed / 1e12).toFixed(2) + '\uC870\uC6D0';
}

export function mcapTier(won) {
  if (!won) return 1;
  if (won >= 15e12) return 3;
  if (won >= 1e12) return 2;
  return 1;
}

function fmtJsNum(n) {
  return n == null || !Number.isFinite(n) ? 'null' : n;
}

export function formatPartner(p) {
  if (typeof p === 'string') return `'${esc(p)}'`;
  const bits = [`id: '${esc(p.id)}'`];
  if (p.edgeLabel) bits.push(`edgeLabel: '${esc(p.edgeLabel)}'`);
  if (p.edgeLabelEn) bits.push(`edgeLabelEn: '${esc(p.edgeLabelEn)}'`);
  if (p.weight != null && Number.isFinite(p.weight)) bits.push(`weight: ${p.weight}`);
  if (p.kind) bits.push(`kind: '${esc(p.kind)}'`);
  if (p.evidence) bits.push(`evidence: '${esc(p.evidence)}'`);
  if (p.source) bits.push(`source: '${esc(p.source)}'`);
  return `{ ${bits.join(', ')} }`;
}

export function formatCompany(c) {
  const lines = [];
  lines.push('      {');
  lines.push(
    `        id: '${esc(c.id)}', name: '${esc(c.name)}', nameEn: '${esc(c.nameEn)}', ticker: '${c.ticker}', market: '${esc(c.market)}', chain: '${esc(c.chain)}',`,
  );
  lines.push(`        semType: '${esc(c.semType)}', semTypeEn: '${esc(c.semTypeEn)}',`);
  lines.push(`        products: '${esc(c.products)}', productsEn: '${esc(c.productsEn)}',`);
  if (c.tags && c.tags.length) {
    lines.push(`        tags: ${JSON.stringify(c.tags)},`);
  }
  if (c.sectorId) {
    lines.push(`        sectorId: '${esc(c.sectorId)}',`);
  }
  if (c.extraChains && c.extraChains.length) {
    lines.push(`        extraChains: ${JSON.stringify(c.extraChains)},`);
  }
  if (c.crossSectors && c.crossSectors.length) {
    lines.push(`        crossSectors: ${JSON.stringify(c.crossSectors)},`);
  }
  const partners = Array.isArray(c.partners) ? c.partners : [];
  lines.push(
    `        revenue: '${esc(c.revenue)}', mcapWon: ${c.mcapWon ?? 0}, per: ${fmtJsNum(c.per)}, pbr: ${fmtJsNum(c.pbr)}, revTier: ${c.revTier ?? 1}, partners: [${partners.map(formatPartner).join(', ')}]`,
  );
  lines.push('      }');
  return lines.join('\n');
}

export function serializeCompanies(companies) {
  return (
    '[\n' +
    companies.map((c, idx) => formatCompany(c) + (idx < companies.length - 1 ? ',\n\n' : '\n')).join('') +
    '\n    ]'
  );
}

export function extractCompaniesFromHtml(html) {
  const i0 = html.indexOf('const koreanCompanies = ');
  if (i0 < 0) throw new Error('koreanCompanies not found');
  const i1 = html.indexOf('\n    const globalCompanies', i0);
  if (i1 < 0) throw new Error('globalCompanies not found');
  const inner = html.slice(i0 + 'const koreanCompanies = '.length, i1).trim();
  if (inner.endsWith(';')) return Function('"use strict"; return ' + inner.slice(0, -1))();
  return Function('"use strict"; return ' + inner)();
}

export function extractChainColors(html) {
  const m = html.match(/const CHAIN_COLORS = (\{[\s\S]*?\});/);
  if (!m) return [];
  return Object.keys(Function('"use strict"; return ' + m[1])());
}

export function slugId(ticker, nameEn, prefix) {
  const base = (nameEn || ticker)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return prefix ? `${prefix}_${base || ticker}` : base || ticker;
}

/** Replace koreanCompanies array in map HTML (index-based, safe for nested `];`). */
export function patchKoreanCompaniesHtml(html, companies) {
  const start = 'const koreanCompanies = ';
  const end = '\n    const globalCompanies';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end, i0);
  if (i0 < 0 || i1 < 0) throw new Error('koreanCompanies block not found');
  const block = start + serializeCompanies(companies) + ';' + html.slice(i1);
  return html.slice(0, i0) + block;
}

export function countKoreanTickersInHtml(html) {
  const start = 'const koreanCompanies = ';
  const end = '\n    const globalCompanies';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end, i0);
  if (i0 < 0 || i1 < 0) return 0;
  const section = html.slice(i0, i1);
  const re = /ticker: '([^']+)'/g;
  let n = 0;
  let m;
  while ((m = re.exec(section))) {
    if (m[1] && m[1] !== 'UNLISTED') n++;
  }
  return n;
}
