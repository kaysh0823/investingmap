/**
 * Remove WIP relation-network GRAPH tab chrome from industry map HTML / bio inline.
 * Keeps js/relation_network*.js, data/networks/*, migrate scripts on disk — pages stop loading them.
 *
 * Idempotent. Run from rebuild_site after map patches + after bio gen.
 *
 * switchTab graph branches: exact-string removal only (no regex range delete).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'machinery/korea_machinery_map.html',
  'shipping/korea_shipping_map.html',
];

const EXTRA_JS = ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js'];

/** Exact switchTab graph lines (no regex ranges). */
const SWITCH_TAB_GRAPH_LINES = [
  "if (tab === 'graph') setTimeout(() => { buildGraph(); }, 50);",
  "if (tab === 'graph') setTimeout(function() { buildGraph(); }, 50);",
];
const SWITCH_TAB_HIDDEN_LINE = 'else if (window.RelationNetwork) RelationNetwork.onTabHidden();';

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while (true) {
    const j = haystack.indexOf(needle, i);
    if (j < 0) break;
    n += 1;
    i = j + needle.length;
  }
  return n;
}

/**
 * Remove `needle` only when it appears exactly once.
 * 0 → leave unchanged (idempotent / file without this variant).
 * 2+ → throw (ambiguous; never guess).
 */
function removeExactOnce(html, needle, rel) {
  const n = countOccurrences(html, needle);
  if (n === 0) return html;
  if (n !== 1) {
    throw new Error(`[${rel}] expected exactly 1 occurrence of ${JSON.stringify(needle)}, found ${n}`);
  }
  return html.replace(needle, '');
}

/** Remove balanced HTML element starting at openTagIndex (must point at '<'). */
function removeBalancedElement(html, openTagIndex) {
  if (openTagIndex < 0) return html;
  const gt = html.indexOf('>', openTagIndex);
  if (gt < 0) return html;
  const tagMatch = html.slice(openTagIndex, gt + 1).match(/^<\/?\s*([a-zA-Z0-9:-]+)/);
  if (!tagMatch) return html;
  const tag = tagMatch[1].toLowerCase();
  if (/\/>\s*$/.test(html.slice(openTagIndex, gt + 1))) {
    return html.slice(0, openTagIndex) + html.slice(gt + 1);
  }
  let i = gt + 1;
  let depth = 1;
  const openRe = new RegExp(`<${tag}\\b`, 'gi');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
  while (i < html.length && depth > 0) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(html);
    const c = closeRe.exec(html);
    if (!c) break;
    if (o && o.index < c.index) {
      depth += 1;
      i = o.index + o[0].length;
    } else {
      depth -= 1;
      i = c.index + c[0].length;
      if (depth === 0) {
        return html.slice(0, openTagIndex) + html.slice(i);
      }
    }
  }
  return html;
}

function stripCssBlock(html) {
  const marker = '/* relation network v2';
  const start = html.indexOf(marker);
  if (start < 0) {
    return html.replace(/\n\s*#tab-graph\s*\{[\s\S]*?\}\s*/g, '\n').replace(/\n\s*\.rn-[^{]+\{[\s\S]*?\}\s*/g, '\n');
  }
  const endStyle = html.indexOf('</style>', start);
  if (endStyle < 0) return html;
  return html.slice(0, start) + html.slice(endStyle);
}

function stripScriptTags(html) {
  return html
    .replace(/\s*<script[^>]*src=["'][^"']*network_profiles\.js[^"']*["'][^>]*>\s*<\/script>/gi, '')
    .replace(/\s*<script[^>]*src=["'][^"']*relation_network_legacy\.js[^"']*["'][^>]*>\s*<\/script>/gi, '')
    .replace(/\s*<script[^>]*src=["'][^"']*relation_network\.js[^"']*["'][^>]*>\s*<\/script>/gi, '');
}

function stripGraphButton(html) {
  return html.replace(/\s*<button\b[^>]*\bid=["']tab-btn-graph["'][^>]*>[\s\S]*?<\/button>/gi, '');
}

function stripGraphPanel(html) {
  let out = html;
  out = out.replace(/\s*<!--\s*GRAPH TAB\s*-->\s*/i, '\n');
  const idx = out.search(/<div\s+id=["']tab-graph["']/);
  if (idx < 0) return out;
  return removeBalancedElement(out, idx);
}

function stripGraphJsBlock(html) {
  const markers = [
    '\n    // GRAPH (RelationNetwork v2)',
    '\n    // GRAPH',
    '// GRAPH (RelationNetwork v2)',
  ];
  let start = -1;
  for (const m of markers) {
    const i = html.indexOf(m);
    if (i >= 0) {
      start = i;
      break;
    }
  }
  if (start < 0) return { html, removed: false };

  let cutStart = start;
  const prev = html.lastIndexOf('\n', start - 1);
  if (prev >= 0) {
    const line = html.slice(prev, start);
    if (/═/.test(line) || /^\s*$/.test(line)) {
      const prev2 = html.lastIndexOf('\n', prev - 1);
      if (prev2 >= 0 && /═/.test(html.slice(prev2, prev))) cutStart = prev2;
      else cutStart = prev;
    }
  }

  const endMarkers = [
    '\n    function renderHeatmap',
    '\n    function renderNetmap',
    '\n    function renderTable',
    '\n    // HEATMAP',
    '\n    // TABLE',
    '\n    // NETMAP',
  ];
  let end = -1;
  for (const m of endMarkers) {
    const i = html.indexOf(m, start + 10);
    if (i >= 0 && (end < 0 || i < end)) end = i;
  }
  if (end < 0) return { html, removed: false };
  return {
    html: html.slice(0, cutStart) + '\n\n    let svgEl = null;\n' + html.slice(end),
    removed: true,
  };
}

function stripI18nKeys(html) {
  let out = html;
  out = out.replace(/\n\s*tabGraph:\s*'[^']*',?/g, '');
  out = out.replace(/\n\s*"tabGraph":\s*"[^"]*",?/g, '');
  out = out.replace(
    /\n\s*rnType:\s*'[^']*',\s*rnStatus:\s*'[^']*',\s*rnConnections:\s*'[^']*',\s*rnGoTable:\s*'[^']*',\s*rnResetView:\s*'[^']*',\s*rnStake:\s*'[^']*',?/g,
    '',
  );
  out = out.replace(
    /\n\s*"rnType":\s*"[^"]*",\s*"rnStatus":\s*"[^"]*",\s*"rnConnections":\s*"[^"]*",\s*"rnGoTable":\s*"[^"]*",\s*"rnResetView":\s*"[^"]*",\s*"rnStake":\s*"[^"]*",?/g,
    '',
  );
  return out;
}

function stripRuntimeHooks(html, rel) {
  let out = html;
  out = out.replace(
    /\n\s*document\.getElementById\(['"]tab-btn-graph['"]\)\.innerHTML\s*=\s*t\.tabGraph;?/g,
    '',
  );
  out = out.replace(
    /\n\s*var\s+gBtn\s*=\s*document\.getElementById\(['"]tab-btn-graph['"]\);\s*if\s*\(gBtn\)\s*gBtn\.innerHTML\s*=\s*t\.tabGraph;?/g,
    '',
  );
  out = out.replace(
    /\n\s*if\s*\(document\.getElementById\(['"]tab-graph['"]\)\.classList\.contains\(['"]active['"]\)\)\s*\{[\s\S]*?\n\s*\}/g,
    '',
  );
  out = out.replace(
    /\n\s*var\s+tabG\s*=\s*document\.getElementById\(['"]tab-graph['"]\);\s*\n\s*if\s*\(tabG\s*&&\s*tabG\.classList\.contains\(['"]active['"]\)[\s\S]*?;/g,
    '',
  );

  // switchTab graph branches — exact strings only (never regex range across statements)
  for (const line of SWITCH_TAB_GRAPH_LINES) {
    out = removeExactOnce(out, line, rel);
  }
  out = removeExactOnce(out, SWITCH_TAB_HIDDEN_LINE, rel);

  out = out.replace(
    /\n\s*\/\*\s*sb-korean guard\s*\*\/\s*if\s*\(document\.getElementById\(['"]graph-hint-text['"]\)\)document\.getElementById\(['"]graph-hint-text['"]\)\.textContent\s*=\s*t\.graphHint;?/g,
    '',
  );
  return out;
}

function assertNoBuildGraphCalls(html, rel, graphBlockRemoved) {
  const hadDef = /\bfunction\s+buildGraph\s*\(/.test(html);
  if (graphBlockRemoved || !hadDef) {
    const callRe = /\bbuildGraph\s*\(/g;
    const hits = [];
    let m;
    while ((m = callRe.exec(html))) {
      hits.push(m.index);
    }
    if (hits.length) {
      const sample = hits
        .slice(0, 3)
        .map((i) => html.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' '))
        .join(' | ');
      throw new Error(`[${rel}] buildGraph() call sites remain after stripping graph defs (${hits.length}): ${sample}`);
    }
  }
}

export function stripGraphFromHtml(html, rel = '(unknown)') {
  let out = html;
  out = stripCssBlock(out);
  out = stripGraphButton(out);
  out = stripGraphPanel(out);
  out = stripScriptTags(out);
  const js = stripGraphJsBlock(out);
  out = js.html;
  out = stripI18nKeys(out);
  out = stripRuntimeHooks(out, rel);
  assertNoBuildGraphCalls(out, rel, js.removed);
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

function processFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return { rel, before: 0, after: 0, skipped: true };
  }
  const before = fs.readFileSync(fp, 'utf8');
  const after = stripGraphFromHtml(before, rel);
  if (after !== before) fs.writeFileSync(fp, after, 'utf8');
  return {
    rel,
    before: Buffer.byteLength(before, 'utf8'),
    after: Buffer.byteLength(after, 'utf8'),
    changed: after !== before,
  };
}

const results = [];
for (const rel of MAP_FILES) results.push(processFile(rel));
for (const rel of EXTRA_JS) results.push(processFile(rel));

const sample = results.find((r) => r.rel.includes('semiconductor/korea_semiconductor_map.html'));
console.log('OK strip_graph_tab');
console.log(
  '  maps:',
  results.filter((r) => r.rel.endsWith('.html') && r.changed).length,
  'changed;',
  'bio js:',
  results.filter((r) => r.rel.endsWith('.js') && r.changed).length,
  'changed',
);
if (sample && !sample.skipped) {
  console.log(
    '  sample semiconductor:',
    sample.before,
    '→',
    sample.after,
    `(Δ ${sample.after - sample.before})`,
  );
}
