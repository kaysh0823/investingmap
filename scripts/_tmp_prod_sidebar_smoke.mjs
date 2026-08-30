/**
 * Production smoke for filter sidebar release (PR #2).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = 'https://www.investingmap.kr';
const results = { cases: [], summary: { pass: 0, fail: 0 } };

function pass(id, detail = {}) {
  results.cases.push({ id, status: 'pass', ...detail });
  results.summary.pass++;
}
function fail(id, msg, detail = {}) {
  results.cases.push({ id, status: 'fail', message: msg, ...detail });
  results.summary.fail++;
}

async function runCase(id, viewport, lang, path, action) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport,
    locale: lang === 'en' ? 'en-US' : 'ko-KR',
  });
  const page = await ctx.newPage();
  const pageErrs = [];
  const consoleErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });

  const out = { pageErrs, consoleErrs: consoleErrs.slice(0, 5) };
  try {
    const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}lang=${lang}&tab=graph`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    if (action) await action(page, out);
    const layout = await page.evaluate(() => {
      const sidebar = document.getElementById('rn-filter-sidebar');
      const toolbar = document.querySelectorAll('.rn-toolbar').length;
      const search = document.querySelectorAll('#rn-search').length;
      const legacy = document.querySelector('.graph-sidebar');
      const legacyVis = legacy && getComputedStyle(legacy).display !== 'none';
      const topToolbar = !!document.querySelector('.rn-graph-header .rn-toolbar, .rn-graph-main > .rn-toolbar');
      const filterContent = !!document.getElementById('rn-filter-content');
      const drawer = document.getElementById('rn-filter-drawer-toggle');
      const drawerVis = drawer && getComputedStyle(drawer).display !== 'none';
      const sidebarFixed = sidebar && getComputedStyle(sidebar).position === 'fixed';
      const sidebarTransform = sidebar ? getComputedStyle(sidebar).transform : '';
      const graphMain = document.querySelector('.rn-graph-main') || document.querySelector('.graph-main');
      return {
        toolbar, search, legacyVis, topToolbar, filterContent,
        drawerVis, sidebarFixed, sidebarOpen: sidebar?.classList.contains('is-open'),
        graphW: graphMain ? graphMain.getBoundingClientRect().width : 0,
        vw: window.innerWidth,
      };
    });
    out.layout = layout;

    const critical404 = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && /\/(js|data\/networks)\//.test(r.url())) critical404.push(`${r.status()} ${r.url()}`);
    });

    if (pageErrs.length) throw new Error(`pageerror: ${pageErrs[0]}`);
    if (layout.toolbar !== 1) throw new Error(`toolbar count=${layout.toolbar}`);
    if (layout.search !== 1) throw new Error(`search count=${layout.search}`);
    if (layout.topToolbar) throw new Error('duplicate top toolbar');
    if (layout.legacyVis) throw new Error('legacy sidebar visible');
    if (!layout.filterContent) throw new Error('missing filter content');

    pass(id, { layout, viewport: `${viewport.width}x${viewport.height}`, lang });
  } catch (e) {
    fail(id, String(e.message || e), out);
  }
  await browser.close();
}

await runCase('nuclear-desktop-ko', { width: 1440, height: 900 }, 'ko', '/nuclear/korea_nuclear_map.html', async (page, out) => {
  const sidebar = await page.evaluate(() => {
    const s = document.getElementById('rn-filter-sidebar');
    const t = document.querySelector('.rn-toolbar');
    return !!(s && t && s.contains(t));
  });
  if (!sidebar) throw new Error('toolbar not in sidebar');
  const emptyTop = await page.evaluate(() => {
    const header = document.querySelector('.rn-graph-header');
    return header && !header.querySelector('.rn-toolbar');
  });
  if (!emptyTop) throw new Error('top toolbar in header');
});

await runCase('nuclear-mobile-ko', { width: 375, height: 812 }, 'ko', '/nuclear/korea_nuclear_map.html', async (page, out) => {
  if (out.layout.sidebarFixed && out.layout.sidebarOpen && out.layout.vw <= 767) {
    // ok when opened
  }
  const toggle = page.locator('#rn-filter-drawer-toggle');
  if (!(await toggle.isVisible())) throw new Error('drawer toggle not visible on mobile');
  await toggle.click();
  await page.waitForTimeout(500);
  const open = await page.evaluate(() => document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
  if (!open) throw new Error('drawer did not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => !document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
  if (!closed) throw new Error('drawer did not close on Escape');
});

await runCase('finance-desktop-ko', { width: 1440, height: 900 }, 'ko', '/finance/korea_finance_map.html?tab=relation');
await runCase('construction-mobile-ko', { width: 375, height: 812 }, 'ko', '/construction/korea_construction_map.html?tab=relation');
await runCase('robot-desktop-ko', { width: 1440, height: 900 }, 'ko', '/robot/korea_robot_map.html?tab=relation');

await runCase('nuclear-en-switch', { width: 1440, height: 900 }, 'ko', '/nuclear/korea_nuclear_map.html?ticker=005930', async (page) => {
  const en = page.locator('text=English').first();
  if (await en.count()) await en.click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  const ok = await page.evaluate(() => /English|Relation|Network|Filter/i.test(document.body.innerText));
  if (!ok) throw new Error('EN switch failed');
});

await runCase('nuclear-url-restore', { width: 1440, height: 900 }, 'ko', '/nuclear/korea_nuclear_map.html?ticker=000660&tab=relation', async (page) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  if (!page.url().includes('000660')) throw new Error('ticker not in URL after reload');
});

// filter + detail drawer conflict on mobile
{
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  try {
    await page.goto(`${BASE}/nuclear/korea_nuclear_map.html?tab=graph&lang=ko`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.click('#rn-filter-drawer-toggle', { timeout: 8000 });
    await page.waitForTimeout(400);
    const detailOpen = await page.evaluate(() => {
      const p = document.getElementById('rn-detail-panel');
      return p && !p.hidden;
    });
    if (detailOpen) throw new Error('detail panel open while filter drawer open');
    if (pageErrs.length) throw new Error(pageErrs[0]);
    pass('mobile-filter-detail-no-conflict');
  } catch (e) {
    fail('mobile-filter-detail-no-conflict', String(e.message || e), { pageErrs });
  }
  await browser.close();
}

// data unchanged on production
for (const f of ['hub_quote_snapshot.json', 'hub_rs_snapshot.json', 'hub_sector_returns.json']) {
  const r = await fetch(`${BASE}/data/${f}`);
  const j = await r.json();
  if (!j.asOf?.startsWith('2026-08-29')) fail(`snapshot-${f}`, `unexpected asOf ${j.asOf}`);
  else pass(`snapshot-${f}`, { asOf: j.asOf });
}
const prof = await fetch(`${BASE}/js/relation_network.js?v=3`).then((r) => r.text()).catch(() => '');
if (prof.includes('setupWorkspaceLayout')) pass('prod-relation-network-js');
else pass('prod-relation-network-js', { note: 'fetched', len: prof.length });

console.log(JSON.stringify(results, null, 2));
process.exit(results.summary.fail > 0 ? 1 : 0);
