/**
 * Verify data/netmap JSON schema + semiconductor tab wiring + map_netmap pure helpers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NETMAP_DIR = path.join(ROOT, 'data', 'netmap');
const EDGE_TYPES = new Set(['supply', 'partner', 'equity', 'peer', 'distribution']);
const CONF = new Set(['high', 'medium', 'low']);
const NODE_TYPES = new Set(['kr_listed', 'kr_anchor', 'kr_other', 'global']);

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

const MAP_SECTOR = {
  semiconductor: 'semiconductor/korea_semiconductor_map.html',
  bio: 'bio/korea_bio_map.html',
  battery: 'battery/korea_battery_map.html',
  powergrid: 'powergrid/korea_powergrid_map.html',
  robot: 'robot/korea_robot_map.html',
  elec: 'elec/korea_elec_map.html',
};

for (const [sector, rel] of Object.entries(MAP_SECTOR)) {
  const hasData = sectorsWithData.includes(sector);
  const srcPath = path.join(ROOT, rel);
  const distPath = path.join(ROOT, 'dist', rel);
  // Prefer source (authoritative after patch); fall back to dist.
  const html = fs.existsSync(srcPath)
    ? fs.readFileSync(srcPath, 'utf8')
    : fs.existsSync(distPath)
      ? fs.readFileSync(distPath, 'utf8')
      : '';
  if (!html) continue;
  if (hasData) {
    assert.ok(html.includes('tab-btn-netmap'), `${rel}: tab-btn-netmap`);
    assert.ok(html.includes('id="tab-netmap"'), `${rel}: tab-netmap`);
    assert.ok(html.includes('id="netmap-panel"'), `${rel}: netmap-panel`);
    assert.ok(html.includes('netmap-shell'), `${rel}: netmap-shell`);
    assert.ok(!html.includes('id="netmap-toolbar"'), `${rel}: netmap-toolbar must be absent`);
    assert.ok(!html.includes('id="netmap-legend"'), `${rel}: netmap-legend must be absent`);
    assert.ok(/map_netmap\.js/.test(html), `${rel}: map_netmap.js`);
    assert.ok(html.includes('InvestingMapNetmap.recolorNodes'), `${rel}: quotes-ready recolor`);
    console.log(`  html OK ${rel}`);
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

  const semiRaw = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'netmap', 'semiconductor.json'), 'utf8'),
  );
  const semiAll = Net._test.filterGraph(semiRaw, Net._test.defaultFilters());
  assert.equal(semiAll.nodes.length, 147, `semiconductor filterGraph nodes=${semiAll.nodes.length}`);
  assert.equal(semiAll.edges.length, 291, `semiconductor filterGraph edges=${semiAll.edges.length}`);

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
    countries: { us: false, tw: true, jp: true, cn: true, eu: true },
  });
  assert.ok(!noUs.nodes.some((n) => n.id === 'global:x'), 'us chip off removes US node');
  assert.ok(!noUs.edges.some((e) => e.id === 'e2'), 'edge to US removed');

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
      ['us', 'tw', 'jp', 'cn', 'eu'],
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
    ['us', 'tw', 'jp', 'cn', 'eu'].forEach((c, i) => {
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
