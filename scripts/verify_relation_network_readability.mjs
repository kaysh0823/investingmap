/**
 * Browser readability assertions for relation network v2.
 * Run: npm run verify:relation-network-readability
 */
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RN_READABILITY_PORT || 8789);
const BASE = `http://127.0.0.1:${PORT}`;

const CASES = [
  { id: 'semi-desktop', path: '/semiconductor/korea_semiconductor_map.html', w: 1440, h: 900 },
  { id: 'semi-mobile', path: '/semiconductor/korea_semiconductor_map.html', w: 375, h: 812 },
  { id: 'finance-desktop', path: '/finance/korea_finance_map.html', w: 1440, h: 900 },
  { id: 'construction-mobile', path: '/construction/korea_construction_map.html', w: 375, h: 812 },
  { id: 'nuclear-desktop', path: '/nuclear/korea_nuclear_map.html', w: 1440, h: 900 },
  { id: 'robot-desktop', path: '/robot/korea_robot_map.html', w: 1440, h: 900 },
  { id: 'cosmetics-mobile-en', path: '/cosmetics/korea_cosmetics_map.html?lang=en', w: 375, h: 812 },
];

const failures = [];

function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const fp = path.join(ROOT, urlPath.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(fp);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({ headless: true });

for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const pe = [];
  page.on('pageerror', (e) => pe.push(String(e)));
  const url = `${BASE}${c.path}${c.path.includes('?') ? '&' : '?'}tab=graph`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const html = await page.content();
  check(html.includes('relation_network.js?v=4'), `${c.id}: HTML must reference relation_network.js?v=4`);
  check(!html.includes('relation_network.js?v=3'), `${c.id}: stale v=3 script reference`);
  check(!html.includes('relation_network.js?v=2'), `${c.id}: stale v=2 script reference`);

  const metrics = await page.evaluate(() => {
    const st = window.RelationNetwork.getState();
    const svg = document.querySelector('#graph-svg');
    const k = svg && window.d3 ? window.d3.zoomTransform(svg).k : 0;
    const labels = [...document.querySelectorAll('.rn-labels text')];
    const listedVisible = labels.filter((el) => el.classList.contains('rn-label-listed') && el.getAttribute('display') !== 'none' && Number(el.getAttribute('opacity') || 1) > 0.05);
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
      listedLabelCount: listedVisible.length,
      minListedFont: minListed.length ? Math.min(...minListed) : 0,
      orphanGlobal,
      overflowX: document.body.scrollWidth > window.innerWidth + 2,
      hasSetup: typeof window.RelationNetwork?.fitAll === 'function',
    };
  });

  check(metrics.hasSetup, `${c.id}: RelationNetwork.fitAll missing`);
  check(metrics.k >= 0.75 || c.w <= 768, `${c.id}: default zoom below min (${metrics.k})`);
  check(metrics.listedLabelCount > 0, `${c.id}: no visible listed labels`);
  check(metrics.minListedFont >= 11 || c.w <= 768, `${c.id}: listed label font too small (${metrics.minListedFont})`);
  check(metrics.orphanGlobal === 0, `${c.id}: orphan global nodes (${metrics.orphanGlobal})`);
  check(!metrics.overflowX, `${c.id}: horizontal body overflow`);
  check(pe.length === 0, `${c.id}: pageerror ${pe.join('; ')}`);

  const clicked = await page.evaluate(() => {
    const el = document.querySelector('.rn-nodes g.rn-node-listed_company');
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (clicked) {
    await page.waitForTimeout(1500);
    const sel = await page.evaluate(() => {
      const st = window.RelationNetwork.getState();
      const selectedLabel = document.querySelector('.rn-label-selected');
      return {
        selectedId: st.selectedId,
        selectedLabelVisible: !!(selectedLabel && selectedLabel.getAttribute('display') !== 'none'),
        selectedFont: selectedLabel ? parseFloat(selectedLabel.getAttribute('font-size') || '0') : 0,
      };
    });
    check(!!sel.selectedId, `${c.id}: selection failed`);
    check(sel.selectedLabelVisible, `${c.id}: selected label not visible`);
    check(sel.selectedFont >= 14, `${c.id}: selected label font ${sel.selectedFont}`);
  }

  await page.close();
}

await browser.close();
server.close();

console.log('verify:relation-network-readability');
if (failures.length) {
  console.error('FAILURES:');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('OK — readability checks passed for', CASES.length, 'cases');
process.exit(0);
