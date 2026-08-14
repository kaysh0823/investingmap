import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'bigchip', 'korea_bigchip_map.html');

/**
 * The graph itself uses the shared curated-map renderer so bigchip matches every other
 * sector map. Only the table's relationship column is specialised: it carries far more
 * partners than a normal sector map, so it renders compact role/country tags instead of
 * the default wide partner chips.
 */
const CSS = `
    /* bigchip relation tags */
    #th-partners{width:230px;max-width:230px}
    .bigchip-relations-cell{width:230px;max-width:230px;white-space:normal}
    .bigchip-relation-tags{display:flex;flex-wrap:wrap;gap:3px;max-width:230px;max-height:52px;overflow:hidden}
    .bigchip-relation-tag{display:inline-flex;align-items:center;gap:4px;max-width:106px;padding:2px 6px;border:1px solid var(--border);border-radius:999px;font-size:10px;line-height:16px;color:var(--text-muted);background:var(--surface2);text-decoration:none}
    a.bigchip-relation-tag:hover{border-color:var(--accent);color:var(--accent)}
    .bigchip-relation-tag.supplier{border-color:rgba(88,166,255,.42)}
    .bigchip-relation-tag.peer{border-color:rgba(139,148,158,.42)}
    .bigchip-relation-tag.customer{border-color:rgba(240,164,75,.48)}
    .bigchip-relation-tag.more{font-weight:700;color:var(--text)}
    .bigchip-country-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--country-dot,#8b949e)}
    .bigchip-relation-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media (max-width: 768px) {
      #th-partners,
      .bigchip-relations-cell {
        width: 176px;
        max-width: 176px
      }

      .bigchip-relation-tags {
        max-width: 176px
      }
    }
`;

const TABLE_HELPER = `
function bigchipEscape(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function bigchipRole(kind) {
      return kind === 'supplier' || kind === 'customer' || kind === 'peer' ? kind : 'peer';
    }
    function bigchipRelationTags(c) {
      const maxVisible = 8;
      const dots = { KR: '#58a6ff', US: '#f0a44b', TW: '#4fc3a1', JP: '#d78ee8', NL: '#7fb7ff', CN: '#ef6b73', DE: '#f3c969', FR: '#8fb7ff', EU: '#a8b3c7' };
      const t = T[lang];
      const roleLabel = { supplier: t.relationSupplier, peer: t.relationPeer, customer: t.relationCustomer };
      const tags = (c.partners || []).slice(0, maxVisible).map((p) => {
        const pr = partnerRef(p);
        const rel = globalCompanies.find((x) => x.id === pr.id) || {};
        const info = getPartnerInfo(pr.id);
        const role = bigchipRole(pr.kind);
        const note = lang === 'en' ? (pr.edgeLabelEn || pr.edgeLabel) : (pr.edgeLabel || pr.edgeLabelEn);
        const evidence = (p && p.evidence === 'reported') ? t.reportedEvidence : t.confirmedEvidence;
        const title = [info.name, roleLabel[role], note, evidence].filter(Boolean).join(' · ');
        const dot = \`<span class="bigchip-country-dot" style="--country-dot:\${dots[rel.countryCode] || '#8b949e'}"></span><span class="bigchip-relation-name">\${bigchipEscape(info.name)}</span>\`;
        if (rel.targetUrl) {
          return \`<a class="bigchip-relation-tag \${role}" href="\${bigchipEscape(rel.targetUrl)}&lang=\${lang}" title="\${bigchipEscape(title)}">\${dot}</a>\`;
        }
        return \`<span class="bigchip-relation-tag \${role}" title="\${bigchipEscape(title)}">\${dot}</span>\`;
      });
      const hidden = Math.max(0, (c.partners || []).length - maxVisible);
      if (hidden) tags.push(\`<span class="bigchip-relation-tag more" title="+\${hidden}">+\${hidden}</span>\`);
      return tags.join('');
    }
`;

export function applyBigchipRelationNetwork() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  html = html.replace('</style>', `${CSS}\n  </style>`);
  html = html.replace(/\.\.\/js\/map_i18n\.js(?:\?v=\d+)?"/, '../js/map_i18n.js?v=3"');
  html = html.replace(/\.\.\/js\/map_heatmap\.js(?:\?v=\d+)?"/, '../js/map_heatmap.js?v=9"');
  html = html.replace('function renderTable() {', `${TABLE_HELPER.trim()}\n\n    function renderTable() {`);
  const tagged = html.replace(
    /const partnerHtml = c\.partners\.slice\(0, 6\)[\s\S]*?\(c\.partners\.length > 6 \? `<span class="partner-tag">\+\$\{c\.partners\.length - 6\}<\/span>` : ''\);/,
    'const partnerHtml = bigchipRelationTags(c);',
  );
  if (tagged === html) throw new Error('bigchip patch: partner cell renderer not found');
  html = tagged;
  html = html.replace(
    '<td><div class="partners-list">${partnerHtml}</div></td>',
    '<td class="bigchip-relations-cell"><div class="bigchip-relation-tags">${partnerHtml}</div></td>',
  );
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('OK apply_bigchip_relation_network');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyBigchipRelationNetwork();
}
