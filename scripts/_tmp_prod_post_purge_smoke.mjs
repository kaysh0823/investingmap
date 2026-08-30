/**
 * Production smoke after cache purge — no repo code changes.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'https://www.investingmap.kr').replace(/\/$/, '');

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
const results = [];

for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const pe = [];
  const scriptReqs = [];
  page.on('pageerror', (e) => pe.push(String(e)));
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('relation_network.js')) scriptReqs.push(u);
  });

  await page.goto(`${BASE}${c.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await activateGraph(page);

  const html = await page.content();
  const v1 = (html.match(/relation_network\.js\?v=1/g) || []).length;
  const v2 = (html.match(/relation_network\.js\?v=2/g) || []).length;
  const v3 = (html.match(/relation_network\.js\?v=3/g) || []).length;

  check(v3 >= 1, `${c.id}: HTML must reference relation_network.js?v=3`);
  check(v2 === 0, `${c.id}: stale v=2 HTML reference (${v2})`);
  check(v1 === 0, `${c.id}: stale v=1 HTML reference (${v1})`);
  check(scriptReqs.every((u) => u.includes('v=3')), `${c.id}: non-v3 script requests ${JSON.stringify(scriptReqs)}`);
  check(scriptReqs.some((u) => u.includes('v=3')), `${c.id}: no v=3 script request observed`);

  const metrics = await page.evaluate(() => {
    const st = window.RelationNetwork.getState();
    const svg = document.querySelector('#graph-svg');
    const k = svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
    const labelLayer = document.querySelector('.rn-labels');
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
    return {
      k,
      hasLabelLayer: !!labelLayer,
      listedLabelCount: listedVisible.length,
      globalLabelCount: globalVisible.length,
      minListedFont: minListed.length ? Math.min(...minListed) : 0,
      orphanGlobal,
      hasFitAll: typeof window.RelationNetwork?.fitAll === 'function',
      drawer: !!document.getElementById('rn-filter-drawer-toggle'),
    };
  });

  check(metrics.hasLabelLayer, `${c.id}: .rn-labels layer missing`);
  check(metrics.hasFitAll, `${c.id}: RelationNetwork.fitAll missing`);
  check(metrics.k >= 0.75 || c.w <= 768, `${c.id}: default zoom below min (${metrics.k})`);
  check(metrics.listedLabelCount > 0, `${c.id}: no visible listed labels`);
  check(metrics.minListedFont >= (c.w <= 768 ? 12 : 13), `${c.id}: listed label font too small (${metrics.minListedFont})`);
  check(metrics.orphanGlobal === 0, `${c.id}: orphan global nodes (${metrics.orphanGlobal})`);
  check(metrics.globalLabelCount < 12, `${c.id}: global label pile (${metrics.globalLabelCount})`);
  check(pe.length === 0, `${c.id}: pageerror ${pe.join('; ')}`);

  if (c.search) {
    await page.locator('#rn-search').fill(c.search);
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
  check(sel.selectedFont >= 15, `${c.id}: selected label font ${sel.selectedFont}`);
  check(sel.neighborCount > 0 || sel.neighborIds === 0, `${c.id}: no visible neighbor labels (${sel.neighborCount}/${sel.neighborIds})`);

  const kBefore = await page.evaluate(() => {
    const svg = document.querySelector('#graph-svg');
    return svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
  });
  await page.evaluate(() => window.RelationNetwork?.fitAll?.());
  await page.waitForTimeout(800);
  const kAfterFit = await page.evaluate(() => {
    const svg = document.querySelector('#graph-svg');
    return svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
  });
  check(kAfterFit > 0.05, `${c.id}: fit-all failed`);

  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);
  const kAfterZoom = await page.evaluate(() => {
    const svg = document.querySelector('#graph-svg');
    return svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
  });
  check(Math.abs(kAfterZoom - kAfterFit) > 0.001, `${c.id}: pan/zoom wheel did not change transform`);

  if (c.w <= 768) {
    const drawerToggle = page.locator('#rn-filter-drawer-toggle');
    check(await drawerToggle.count() > 0, `${c.id}: mobile drawer toggle missing`);
    if (await drawerToggle.count()) {
      await drawerToggle.click();
      await page.waitForTimeout(500);
      const drawerOpen = await page.evaluate(() => document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
      check(drawerOpen, `${c.id}: mobile drawer did not open`);
    }
  }

  const caseFails = failures.filter((f) => f.startsWith(`${c.id}:`));
  results.push({ id: c.id, pass: caseFails.length === 0, metrics, sel, scriptReqs, pageErrors: pe.length, kBefore, kAfterFit, kAfterZoom });
  console.log(c.id, { pass: caseFails.length === 0, metrics, sel, scriptReqs, pageErrors: pe.length });
  await page.close();
}

await browser.close();
console.log('SUMMARY', JSON.stringify({ base: BASE, pass: results.filter((r) => r.pass).length, total: results.length }, null, 2));
if (failures.length) {
  console.error('FAILURES:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
process.exit(0);
