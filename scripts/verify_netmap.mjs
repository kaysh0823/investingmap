/**
 * Verify data/netmap JSON schema + sector tab wiring + map_netmap pure helpers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { MAP_SECTOR } from './patch_netmap_tab.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NETMAP_DIR = path.join(ROOT, 'data', 'netmap');
const EDGE_TYPES = new Set(['supply', 'partner', 'equity', 'peer', 'distribution']);
const CONF = new Set(['high', 'medium', 'low']);
const NODE_TYPES = new Set(['kr_listed', 'kr_anchor', 'kr_other', 'global']);
/** Must stay in sync with js/map_netmap.js COUNTRIES (+ kr for domestic). */
const NETMAP_COUNTRIES = ['us', 'tw', 'jp', 'cn', 'eu', 'other'];
const ALLOWED_NODE_COUNTRY = new Set(['kr', ...NETMAP_COUNTRIES]);

function validateNetmapFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(raw.nodes), `${file}: nodes[]`);
  assert.ok(Array.isArray(raw.edges), `${file}: edges[]`);
  const ids = new Set();
  for (const n of raw.nodes) {
    assert.ok(n && typeof n.id === 'string' && n.id, 'node.id');
    assert.ok(!ids.has(n.id), `duplicate node id ${n.id}`);
    ids.add(n.id);
    assert.ok(NODE_TYPES.has(n.type), `node.type ${n.type}`);
    assert.ok(n.nameKo || n.nameEn, `node name ${n.id}`);
    assert.ok(
      ALLOWED_NODE_COUNTRY.has(n.country),
      `${file}: node ${n.id} country=${n.country} not in {kr,${NETMAP_COUNTRIES.join(',')}}`,
    );
  }
  for (const e of raw.edges) {
    assert.ok(e && typeof e.id === 'string', 'edge.id');
    assert.ok(ids.has(e.source), `edge source missing ${e.source}`);
    assert.ok(ids.has(e.target), `edge target missing ${e.target}`);
    assert.notEqual(e.source, e.target, `self-loop ${e.id}`);
    assert.ok(EDGE_TYPES.has(e.type), `edge.type ${e.type}`);
    assert.ok(CONF.has(e.confidence), `edge.confidence ${e.confidence}`);
    assert.ok(Array.isArray(e.evidence) && e.evidence[0], `edge.evidence ${e.id}`);
    const url = e.evidence[0].url;
    assert.ok(/^https?:\/\//i.test(url), `evidence url ${e.id}`);
  }
  return { nodes: raw.nodes.length, edges: raw.edges.length, sector: path.basename(file, '.json') };
}

const sectorsWithData = [];
if (fs.existsSync(NETMAP_DIR)) {
  for (const name of fs.readdirSync(NETMAP_DIR)) {
    if (!name.endsWith('.json')) continue;
    const info = validateNetmapFile(path.join(NETMAP_DIR, name));
    sectorsWithData.push(info.sector);
    console.log(`  schema OK ${name} nodes=${info.nodes} edges=${info.edges}`);
  }
}
assert.ok(sectorsWithData.includes('semiconductor'), 'semiconductor.json required');

for (const [rel, sector] of Object.entries(MAP_SECTOR)) {
  const hasData = sectorsWithData.includes(sector);
  const srcPath = path.join(ROOT, rel);
  const distPath = path.join(ROOT, 'dist', rel);
  // Prefer source for markup wiring; dataUrl must match on dist (what ships).
  const html = fs.existsSync(srcPath)
    ? fs.readFileSync(srcPath, 'utf8')
    : fs.existsSync(distPath)
      ? fs.readFileSync(distPath, 'utf8')
      : '';
  if (!html) {
    if (hasData) assert.fail(`${rel}: missing HTML but data/netmap/${sector}.json exists`);
    continue;
  }
  if (hasData) {
    assert.ok(html.includes('tab-btn-netmap'), `${rel}: tab-btn-netmap`);
    assert.ok(html.includes('id="tab-netmap"'), `${rel}: tab-netmap`);
    assert.ok(html.includes('id="netmap-panel"'), `${rel}: netmap-panel`);
    assert.ok(html.includes('netmap-shell'), `${rel}: netmap-shell`);
    assert.ok(!html.includes('id="netmap-toolbar"'), `${rel}: netmap-toolbar must be absent`);
    assert.ok(!html.includes('id="netmap-legend"'), `${rel}: netmap-legend must be absent`);
    assert.ok(/map_netmap\.js/.test(html), `${rel}: map_netmap.js`);

    // Bio runtime lives in bio_inline_tail.js / korea_bio_map.inline.js (not the HTML shell).
    const wiringParts = [html];
    if (sector === 'bio') {
      for (const relJs of ['bio/bio_inline_tail.js', 'bio/korea_bio_map.inline.js']) {
        const p = path.join(ROOT, relJs);
        if (fs.existsSync(p)) wiringParts.push(fs.readFileSync(p, 'utf8'));
      }
    }
    const wiring = wiringParts.join('\n');
    assert.ok(
      wiring.includes('InvestingMapNetmap.recolorNodes'),
      `${rel}: quotes-ready recolor (HTML or bio inline)`,
    );
    assert.ok(wiring.includes('nt.netmapCountryOther'), `${rel}: countries.other label`);
    assert.ok(wiring.includes('nt.netmapCountryNameOther'), `${rel}: countryNames.other label`);

    assert.ok(fs.existsSync(distPath), `dist/${rel}: missing`);
    const expectedUrl = `../data/netmap/${sector}.json`;
    let urlHaystack = fs.readFileSync(distPath, 'utf8');
    if (sector === 'bio') {
      const distInline = path.join(ROOT, 'dist', 'bio', 'korea_bio_map.inline.js');
      const srcInline = path.join(ROOT, 'bio', 'korea_bio_map.inline.js');
      const inlinePath = fs.existsSync(distInline) ? distInline : srcInline;
      assert.ok(fs.existsSync(inlinePath), 'bio inline.js missing for dataUrl check');
      urlHaystack = fs.readFileSync(inlinePath, 'utf8');
    }
    const urlMatch = urlHaystack.match(/dataUrl:\s*'(\.\.\/data\/netmap\/[a-z0-9_-]+\.json)'/);
    assert.ok(urlMatch, `${sector === 'bio' ? 'bio inline' : `dist/${rel}`}: dataUrl missing`);
    assert.equal(
      urlMatch[1],
      expectedUrl,
      `${rel}: dataUrl must be ${expectedUrl} (got ${urlMatch[1]})`,
    );

    // koreanCompanies ticker parity vs netmap kr nodes (bio reads from inline.js).
    if (sector === 'bio') {
      const inlineSrc = path.join(ROOT, 'bio', 'korea_bio_map.inline.js');
      const inline = fs.readFileSync(inlineSrc, 'utf8');
      const m = inline.match(/const koreanCompanies\s*=\s*(\[[\s\S]*?\]);/);
      assert.ok(m, 'bio inline: koreanCompanies array');
      const companies = JSON.parse(m[1]);
      const htmlTickers = new Set(
        companies.map((c) => String(c.ticker).padStart(6, '0')).filter((t) => /^\d{6}$/.test(t)),
      );
      const net = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'data', 'netmap', 'bio.json'), 'utf8'),
      );
      const krTickers = new Set();
      for (const n of net.nodes) {
        if (n.country !== 'kr' && n.type !== 'kr_listed' && n.type !== 'kr_anchor') continue;
        if (n.ticker) krTickers.add(String(n.ticker).padStart(6, '0'));
        const idT = String(n.id || '').replace(/^krx:/, '');
        if (/^\d{6}$/.test(idT)) krTickers.add(idT);
      }
      const onlyHtml = [...htmlTickers].filter((t) => !krTickers.has(t)).sort();
      const onlyNet = [...krTickers].filter((t) => !htmlTickers.has(t)).sort();
      assert.deepEqual(
        onlyHtml,
        [],
        `bio: koreanCompanies tickers missing from netmap kr: ${onlyHtml.join(',')}`,
      );
      // Extra netmap kr nodes (anchors / special tickers) are allowed; log for visibility.
      if (onlyNet.length) {
        console.log(`  bio netmap-only kr tickers (ok): ${onlyNet.join(',')}`);
      }
      console.log(
        `  bio parity OK koreanCompanies=${htmlTickers.size} ⊆ netmapKr=${krTickers.size}`,
      );
    }

    console.log(`  html OK ${rel} dataUrl=${urlMatch[1]}`);
  } else {
    assert.ok(!html.includes('tab-btn-netmap'), `${rel}: must not have netmap tab without data`);
  }
}

const mapJs = fs.readFileSync(path.join(ROOT, 'js', 'map_netmap.js'), 'utf8');
assert.ok(/InvestingMapNetmap/.test(mapJs), 'InvestingMapNetmap export');
assert.ok(/filterGraph/.test(mapJs), 'filterGraph');
assert.ok(/var renderSeq/.test(mapJs), 'renderSeq guard');

{
  const sandbox = { console, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(mapJs, sandbox);
  const Net = sandbox.InvestingMapNetmap;
  assert.ok(Net && Net._test, '_test');
  assert.equal(
    Net._test.COUNTRIES.join(','),
    NETMAP_COUNTRIES.join(','),
    'COUNTRIES includes other',
  );

  const sample = {
    nodes: [
      { id: 'krx:1', type: 'kr_listed', country: 'kr', chain: 'a', nameKo: 'A', ticker: '1' },
      { id: 'krx:2', type: 'kr_anchor', country: 'kr', chain: 'a', nameKo: 'B', ticker: '2' },
      { id: 'global:x', type: 'global', country: 'us', chain: 'g', nameEn: 'X' },
      { id: 'global:y', type: 'global', country: 'tw', chain: 'g', nameEn: 'Y' },
    ],
    edges: [
      { id: 'e1', source: 'krx:1', target: 'krx:2', type: 'supply', confidence: 'high' },
      { id: 'e2', source: 'krx:1', target: 'global:x', type: 'partner', confidence: 'medium' },
      { id: 'e3', source: 'krx:2', target: 'global:y', type: 'peer', confidence: 'low' },
    ],
  };

  const all = Net._test.filterGraph(sample, Net._test.defaultFilters());
  assert.equal(all.nodes.length, 4, 'default keeps connected nodes');
  assert.equal(all.edges.length, 3);

  for (const sector of sectorsWithData) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'netmap', `${sector}.json`), 'utf8'),
    );
    const filtered = Net._test.filterGraph(raw, Net._test.defaultFilters());
    assert.equal(
      filtered.nodes.length,
      raw.nodes.length,
      `${sector}: defaultFilters must keep all nodes (${filtered.nodes.length} vs ${raw.nodes.length})`,
    );
    assert.equal(
      filtered.edges.length,
      raw.edges.length,
      `${sector}: defaultFilters must keep all edges (${filtered.edges.length} vs ${raw.edges.length})`,
    );
    const domestic = Net._test.filterGraph(raw, {
      ...Net._test.defaultFilters(),
      scope: 'domestic',
    });
    assert.ok(
      domestic.nodes.every((n) => n.country === 'kr'),
      `${sector}: domestic scope nodes must all be country===kr`,
    );
  }

  const gray = Net._test.colorForDomestic(
    { ticker: '123456', type: 'kr_listed' },
    {},
    {},
  );
  assert.ok(typeof gray === 'string' && gray.length > 0, 'colorForDomestic returns string');

  // Inject RS + market RS → fill must not stay missing/gray when scale is loaded.
  sandbox.InvestingMapMarketRs = { kospiRs: 50, kosdaqRs: 50 };
  // Load rs_color_scale into sandbox
  const rsJs = fs.readFileSync(path.join(ROOT, 'js', 'rs_color_scale.js'), 'utf8');
  runInContext(rsJs, sandbox);
  assert.ok(sandbox.InvestingMapRsColor, 'InvestingMapRsColor');
  const hot = Net._test.colorForDomestic(
    { ticker: '005930', type: 'kr_anchor', _market: 'KOSPI' },
    { '005930': { rs: 80, market: 'KOSPI' } },
    {},
  );
  assert.notEqual(hot, '#9aa3ad', `colorForDomestic with RS should not be gray (${hot})`);
  assert.notEqual(
    String(hot).toLowerCase(),
    '#8b949e',
    `colorForDomestic with RS should not be missing gray (${hot})`,
  );
  assert.ok(typeof Net._test.recolorNodes === 'function', 'recolorNodes exposed');

  const dom = Net._test.filterGraph(sample, {
    ...Net._test.defaultFilters(),
    scope: 'domestic',
  });
  assert.ok(dom.nodes.every((n) => n.country === 'kr'), 'domestic scope');
  assert.ok(dom.edges.every((e) => e.source.startsWith('krx:') && e.target.startsWith('krx:')));

  const noUs = Net._test.filterGraph(sample, {
    ...Net._test.defaultFilters(),
    countries: Net._test.COUNTRIES.reduce((acc, c) => {
      acc[c] = c !== 'us';
      return acc;
    }, {}),
  });
  assert.ok(!noUs.nodes.some((n) => n.id === 'global:x'), 'us chip off removes US node');
  assert.ok(!noUs.edges.some((e) => e.id === 'e2'), 'edge to US removed');

  const otherSample = {
    nodes: [
      { id: 'krx:1', type: 'kr_listed', country: 'kr', chain: 'a', nameKo: 'A', ticker: '1' },
      { id: 'global:other1', type: 'global', country: 'other', chain: 'g', nameEn: 'OtherCo' },
    ],
    edges: [
      {
        id: 'e-other',
        source: 'krx:1',
        target: 'global:other1',
        type: 'peer',
        confidence: 'medium',
      },
    ],
  };
  const otherCounts = Net._test.countNodesByCountry(otherSample, Net._test.defaultFilters());
  assert.equal(otherCounts.other, 1, 'countNodesByCountry counts country=other');
  assert.ok(
    Net._test.COUNTRIES.every((c) => typeof otherCounts[c] === 'number'),
    'countNodesByCountry keys cover COUNTRIES',
  );

  const noPeer = Net._test.filterGraph(sample, {
    ...Net._test.defaultFilters(),
    types: { supply: true, partner: true, equity: true, peer: false, distribution: true },
  });
  assert.ok(!noPeer.edges.some((e) => e.type === 'peer'), 'peer type filtered');

  const scale = Net._test.mcapRadiusScale([
    { mcapWon: 1e11 },
    { mcapWon: 1e13 },
  ]);
  const rLo = Net._test.nodeRadius({ type: 'kr_listed', _mcapWon: 1e11 }, scale, 0);
  const rHi = Net._test.nodeRadius({ type: 'kr_listed', _mcapWon: 1e13 }, scale, 0);
  assert.ok(rHi >= rLo, `nodeRadius monotone ${rLo} → ${rHi}`);

  for (const t of Net._test.EDGE_TYPES) {
    const st = Net._test.edgeStyle(t, 'high');
    assert.ok(st.color && st.width > 0, `edgeStyle ${t}`);
  }

  const seeds = Net._test.computeLayoutSeeds(['a', 'b'], ['us', 'tw'], 800, 600);
  assert.ok(seeds.chainCenters.a && seeds.countryAngles.us != null, 'layout seeds');
  assert.ok(seeds.domesticR > 0 && seeds.isolateR > seeds.domesticR, 'isolateR = domesticR×1.15');

  // computeFit: tamed layout sample at 1400px width → scale ≥ 0.7
  {
    const W = 1400;
    const H = 800;
    const s = Net._test.computeLayoutSeeds(
      ['c1', 'c2', 'c3', 'c4'],
      Net._test.COUNTRIES,
      W,
      H,
    );
    const sampleNodes = [];
    // Connected domestic cluster near chain centers
    Object.keys(s.chainCenters).forEach((ch, i) => {
      sampleNodes.push({
        id: 'kr:' + i,
        x: s.chainCenters[ch].x + (i % 2 ? 12 : -8),
        y: s.chainCenters[ch].y + (i % 3 ? 10 : -6),
        _degree: 2,
      });
    });
    // Globals on outer radial ring
    Net._test.COUNTRIES.forEach((c, i) => {
      const a = s.countryAngles[c];
      sampleNodes.push({
        id: 'g:' + c,
        x: s.cx + Math.cos(a) * s.radial,
        y: s.cy + Math.sin(a) * s.radial,
        _degree: i === 0 ? 1 : 3,
      });
    });
    // Degree-0 isolates on R0 ring (spread)
    for (let i = 0; i < 6; i++) {
      const a = (2 * Math.PI * i) / 6 - Math.PI / 2;
      sampleNodes.push({
        id: 'iso:' + i,
        x: s.cx + Math.cos(a) * s.isolateR,
        y: s.cy + Math.sin(a) * s.isolateR,
        _degree: 0,
      });
    }
    // Clamp as production does
    sampleNodes.forEach((n) => Net._test.clampNodeToStage(n, W, H));
    const fit = Net._test.computeFit(sampleNodes, W, H, { padding: 40, maxScale: 1.6 });
    assert.ok(
      fit.scale >= 0.7,
      `computeFit scale at 1400px should be ≥0.7 (got ${fit.scale})`,
    );
    assert.ok(fit.scale <= 1.6, `computeFit respects maxScale (${fit.scale})`);
  }

  console.log('  unit filterGraph / nodeRadius / edgeStyle / colorForDomestic / computeFit ok');
}

assert.ok(
  fs.existsSync(path.join(ROOT, 'dist', 'data', 'netmap', 'semiconductor.json')) ||
    fs.existsSync(path.join(ROOT, 'data', 'netmap', 'semiconductor.json')),
  'netmap data present',
);

console.log('verify:netmap OK');
