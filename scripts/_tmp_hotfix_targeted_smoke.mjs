import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8777;
const BASE = `http://127.0.0.1:${PORT}`;

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

async function activateGraph(page) {
  const tab = page.locator('#tab-btn-graph');
  if (await tab.count()) await tab.click().catch(() => {});
  await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function layout(page) {
  return page.evaluate(() => {
    const tb = document.querySelector('.rn-toolbar');
    const fc = document.getElementById('rn-filter-content');
    const dt = document.getElementById('rn-filter-drawer-toggle');
    return {
      toolbarInFc: !!(fc && tb && fc.contains(tb)),
      topDup: !!document.querySelector('.rn-graph-header .rn-toolbar'),
      toolbarCount: document.querySelectorAll('.rn-toolbar').length,
      drawer: !!dt,
      fcEmpty: fc ? fc.childElementCount === 0 : true,
    };
  });
}

const cases = [
  { id: 'nuclear-desktop-ko', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'nuclear-mobile-ko', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'finance-desktop-ko', path: '/finance/korea_finance_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'construction-mobile-ko', path: '/construction/korea_construction_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'robot-desktop-ko', path: '/robot/korea_robot_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'cosmetics-mobile-en', path: '/cosmetics/korea_cosmetics_map.html?tab=graph&lang=en', w: 375, h: 812 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const c of cases) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  let pass = true; const notes = [];
  try {
    await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await activateGraph(page);
    const l = await layout(page);
    if (!l.toolbarInFc) { pass = false; notes.push('toolbar not in filter-content'); }
    if (l.fcEmpty) { pass = false; notes.push('filter-content empty'); }
    if (l.topDup) { pass = false; notes.push('duplicate top toolbar'); }
    if (l.toolbarCount !== 1) { pass = false; notes.push(`toolbar count ${l.toolbarCount}`); }
    if (c.w < 768 && !l.drawer) { pass = false; notes.push('missing drawer toggle'); }
    if (c.w < 768 && l.drawer) {
      await page.click('#rn-filter-drawer-toggle');
      await page.waitForTimeout(400);
      const open = await page.evaluate(() => document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
      if (!open) { pass = false; notes.push('drawer did not open'); }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    if (pe.length) { pass = false; notes.push(`pageerror: ${pe.join('; ')}`); }
    results.push({ id: c.id, pass, notes, layout: l });
  } catch (e) {
    results.push({ id: c.id, pass: false, notes: [String(e.message || e)] });
  }
  await page.close();
}

await browser.close();
server.close();

const fails = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ pass: results.length - fails, fail: fails, results }, null, 2));
process.exit(fails ? 1 : 0);
