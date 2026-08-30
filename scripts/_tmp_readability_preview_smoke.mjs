/**
 * Preview/production smoke for relation network readability v3.
 * Usage: node scripts/_tmp_readability_preview_smoke.mjs <BASE_URL>
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!BASE) {
  console.error('Usage: node scripts/_tmp_readability_preview_smoke.mjs <BASE_URL>');
  process.exit(2);
}

const CASES = [
  { id: 'semi-desktop', path: '/semiconductor/korea_semiconductor_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'semi-search', path: '/semiconductor/korea_semiconductor_map.html?tab=graph&lang=ko', w: 1440, h: 900, search: '삼성전자' },
  { id: 'semi-mobile', path: '/semiconductor/korea_semiconductor_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'finance-desktop', path: '/finance/korea_finance_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'construction-mobile', path: '/construction/korea_construction_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'nuclear-desktop', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'robot-mobile', path: '/robot/korea_robot_map.html?tab=graph&lang=ko', w: 375, h: 812 },
];

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

async function activateGraph(page) {
  await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch({ headless: true });

for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const pe = [];
  page.on('pageerror', (e) => pe.push(String(e)));
  await page.goto(`${BASE}${c.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await activateGraph(page);

  const html = await page.content();
  check(html.includes('relation_network.js?v=3'), `${c.id}: HTML must reference relation_network.js?v=3`);
  check(!html.includes('relation_network.js?v=2'), `${c.id}: stale v=2 script reference`);
  check(!html.includes('relation_network.js?v=1'), `${c.id}: stale v=1 script reference`);

  const metrics = await page.evaluate(() => {
    const st = window.RelationNetwork.getState();
    const svg = document.querySelector('#graph-svg');
    const k = svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
    const labels = [...document.querySelectorAll('.rn-labels text')];
    const listedVisible = labels.filter((el) => el.classList.contains('rn-label-listed') && el.getAttribute('display') !== 'none' && Number(el.getAttribute('opacity') || 1) > 0.05);
    const globalVisible = labels.filter((el) => el.classList.contains('rn-label-global') && el.getAttribute('display') !== 'none' && Number(el.getAttribute('opacity') || 1) > 0.05);
    const minListed = listedVisible.map((el) => parseFloat(el.getAttribute('font-size') || '0')).filter((n) => n >= 10);
    const orphanGlobal = (st.simNodes || []).filter((n) => {
      if (n.type !== 'global_company') return false;
      return !(st.simEdges || []).some((e) => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return s === n.id || t === n.id;
      });
    }).length;
    const tb = document.querySelector('.rn-toolbar');
    const fc = document.getElementById('rn-filter-content');
    const graph = document.querySelector('.rn-graph-wrap');
    const overlap = !!(graph && tb && fc && fc.contains(tb) && graph.getBoundingClientRect().left < fc.getBoundingClientRect().right + 4);
    return {
      k,
      listedLabelCount: listedVisible.length,
      globalLabelCount: globalVisible.length,
      minListedFont: minListed.length ? Math.min(...minListed) : 0,
      orphanGlobal,
      overflowX: document.body.scrollWidth > window.innerWidth + 2,
      hasFitAll: typeof window.RelationNetwork?.fitAll === 'function',
      overlap,
      drawer: !!document.getElementById('rn-filter-drawer-toggle'),
    };
  });

  check(metrics.hasFitAll, `${c.id}: RelationNetwork.fitAll missing`);
  check(metrics.k >= 0.75 || c.w <= 768, `${c.id}: default zoom below min (${metrics.k})`);
  check(metrics.listedLabelCount > 0, `${c.id}: no visible listed labels`);
  check(metrics.minListedFont >= 11 || c.w <= 768, `${c.id}: listed label font too small (${metrics.minListedFont})`);
  check(metrics.orphanGlobal === 0, `${c.id}: orphan global nodes (${metrics.orphanGlobal})`);
  check(metrics.globalLabelCount < 12, `${c.id}: central global label pile (${metrics.globalLabelCount})`);
  check(!metrics.overflowX, `${c.id}: horizontal body overflow`);
  check(!metrics.overlap || c.w <= 768, `${c.id}: sidebar/graph overlap`);
  if (c.w <= 768) check(metrics.drawer, `${c.id}: mobile drawer missing`);
  check(pe.length === 0, `${c.id}: pageerror ${pe.join('; ')}`);

  if (c.search) {
    const search = page.locator('#rn-search');
    await search.waitFor({ state: 'attached', timeout: 15000 });
    await search.fill(c.search);
    await page.waitForTimeout(1500);
  } else {
    await page.evaluate(() => {
      const el = document.querySelector('.rn-nodes g.rn-node-listed_company');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(1500);
  }

  const sel = await page.evaluate(() => {
    const st = window.RelationNetwork.getState();
    const selectedLabel = document.querySelector('.rn-label-selected');
    const selectedId = st.selectedId;
    const neighborIds = new Set();
    (st.simEdges || []).forEach((e) => {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      if (s === selectedId) neighborIds.add(t);
      if (t === selectedId) neighborIds.add(s);
    });
    const neighborLabels = [...document.querySelectorAll('.rn-labels text')].filter((el) => {
      const d = el.__data__;
      if (!d || !d.id) return false;
      return neighborIds.has(d.id) && el.getAttribute('display') !== 'none' && Number(el.getAttribute('opacity') || 1) > 0.05;
    });
    return {
      selectedId,
      selectedLabelVisible: !!(selectedLabel && selectedLabel.getAttribute('display') !== 'none'),
      selectedFont: selectedLabel ? parseFloat(selectedLabel.getAttribute('font-size') || '0') : 0,
      neighborCount: neighborLabels.length,
      neighborIds: neighborIds.size,
    };
  });
  check(!!sel.selectedId, `${c.id}: selection/search failed`);
  check(sel.selectedLabelVisible, `${c.id}: selected label not visible`);
  check(sel.selectedFont >= 14, `${c.id}: selected label font ${sel.selectedFont}`);
  check(sel.neighborCount > 0 || sel.neighborIds === 0, `${c.id}: no visible neighbor labels (${sel.neighborCount}/${sel.neighborIds})`);

  await page.evaluate(() => window.RelationNetwork?.fitAll?.());
  await page.waitForTimeout(800);
  const fitOk = await page.evaluate(() => {
    const svg = document.querySelector('#graph-svg');
    const k = svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
    return k > 0.05;
  });
  check(fitOk, `${c.id}: fit-all failed`);

  console.log(c.id, { pass: failures.filter((f) => f.startsWith(`${c.id}:`)).length === 0, metrics, sel, pageErrors: pe.length });
  await page.close();
}

await browser.close();

if (failures.length) {
  console.error('FAILURES:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('ALL PASS', CASES.length);
process.exit(0);
