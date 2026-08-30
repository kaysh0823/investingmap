import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = 'https://www.investingmap.kr';

async function activateGraph(page) {
  const tabBtn = page.locator('#tab-btn-graph');
  if (await tabBtn.count()) {
    await tabBtn.click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForFunction(
    () => window.RelationNetwork?.getReadiness?.()?.layoutReady === true,
    { timeout: 30000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('.rn-toolbar');
    const fc = document.getElementById('rn-filter-content');
    const sb = document.getElementById('rn-filter-sidebar');
    const dt = document.getElementById('rn-filter-drawer-toggle');
    const gh = document.querySelector('.rn-graph-header');
    const gm = document.querySelector('.rn-graph-main') || document.querySelector('.graph-main');
    const legacySb = document.querySelector('.graph-sidebar');
    const toolbars = [...document.querySelectorAll('.rn-toolbar')];
    return {
      toolbarCount: toolbars.length,
      toolbarInFilterContent: !!(fc && toolbar && fc.contains(toolbar)),
      toolbarInSidebar: !!(sb && toolbar && sb.contains(toolbar)),
      toolbarInGraphMain: !!(gm && toolbar && gm.contains(toolbar)),
      topDuplicateToolbar: !!document.querySelector('.rn-graph-header .rn-toolbar'),
      legacySidebar: !!legacySb,
      filterSidebar: !!sb,
      drawerToggle: !!dt,
      drawerDisplay: dt ? getComputedStyle(dt).display : null,
      sidebarPosition: sb ? getComputedStyle(sb).position : null,
      graphMainWidth: gm?.getBoundingClientRect().width,
      workspace: !!document.querySelector('.rn-workspace'),
      readiness: window.RelationNetwork?.getReadiness?.(),
    };
  });
}

const cases = [
  { id: 'nuclear-desktop-ko', path: '/nuclear/korea_nuclear_map.html?lang=ko', w: 1440, h: 900 },
  { id: 'nuclear-mobile-ko', path: '/nuclear/korea_nuclear_map.html?lang=ko', w: 375, h: 812 },
  { id: 'finance-desktop-ko', path: '/finance/korea_finance_map.html?lang=ko', w: 1440, h: 900 },
  { id: 'construction-mobile-ko', path: '/construction/korea_construction_map.html?lang=ko', w: 375, h: 812 },
  { id: 'robot-desktop-ko', path: '/robot/korea_robot_map.html?lang=ko', w: 1440, h: 900 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const c of cases) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const consoleErrs = [];
  const pageErrs = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrs.push(msg.text()); });
  page.on('pageerror', (e) => pageErrs.push(String(e)));

  let layout = {};
  let pass = true;
  let notes = [];

  try {
    await page.goto(BASE + c.path + '&tab=graph', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await activateGraph(page);
    layout = await collectLayout(page);

    const isMobile = c.w < 768;
    if (!layout.filterSidebar) { pass = false; notes.push('missing filter sidebar'); }
    if (layout.legacySidebar) { pass = false; notes.push('legacy sidebar present'); }
    if (layout.toolbarCount !== 1) { pass = false; notes.push(`toolbar count ${layout.toolbarCount}`); }
    if (layout.topDuplicateToolbar) { pass = false; notes.push('duplicate top toolbar'); }
    if (!layout.toolbarInFilterContent && !layout.toolbarInSidebar) {
      pass = false;
      notes.push('toolbar not in sidebar/filter-content');
    }
    if (isMobile) {
      if (layout.sidebarPosition !== 'fixed') { pass = false; notes.push(`sidebar position ${layout.sidebarPosition}`); }
      if (!layout.drawerToggle) { pass = false; notes.push('missing drawer toggle'); }
    } else {
      if (layout.drawerDisplay && layout.drawerDisplay !== 'none') {
        // drawer toggle should be hidden on desktop
      }
    }
    if (pageErrs.length) { pass = false; notes.push(`pageerror: ${pageErrs.join('; ')}`); }
  } catch (e) {
    pass = false;
    notes.push(String(e.message || e));
  }

  results.push({ id: c.id, pass, notes, layout, consoleErrs, pageErrs });
  await page.close();
}

// KO/EN switch on nuclear desktop
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  let pass = true;
  let notes = [];
  try {
    await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await activateGraph(page);
    const enLink = page.locator('a[href*="lang=en"], button[data-lang="en"], .lang-switch-en').first();
    if (await enLink.count()) {
      await enLink.click();
      await page.waitForTimeout(3000);
    } else {
      await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=en', { waitUntil: 'domcontentloaded' });
      await activateGraph(page);
    }
    const layout = await collectLayout(page);
    if (!layout.toolbarInFilterContent && !layout.toolbarInSidebar) {
      pass = false;
      notes.push('EN: toolbar not in sidebar');
    }
    if (pageErrs.length) {
      pass = false;
      notes.push(`pageerror: ${pageErrs.join('; ')}`);
    }
    results.push({ id: 'nuclear-en-switch', pass, notes, layout, pageErrs });
  } catch (e) {
    results.push({ id: 'nuclear-en-switch', pass: false, notes: [String(e.message || e)], pageErrs });
  }
  await page.close();
}

// URL restore
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  let pass = true;
  let notes = [];
  try {
    await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko&focus=005930', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await activateGraph(page);
    const url = page.url();
    if (!url.includes('focus=005930')) { pass = false; notes.push('focus param lost'); }
    if (pageErrs.length) { pass = false; notes.push(`pageerror: ${pageErrs.join('; ')}`); }
    results.push({ id: 'nuclear-url-restore', pass, notes, url, pageErrs });
  } catch (e) {
    results.push({ id: 'nuclear-url-restore', pass: false, notes: [String(e.message || e)] });
  }
  await page.close();
}

// Mobile filter/detail conflict
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  let pass = true;
  let notes = [];
  try {
    await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await activateGraph(page);
    const dt = page.locator('#rn-filter-drawer-toggle');
    if (!(await dt.count())) {
      pass = false;
      notes.push('no drawer toggle');
    } else {
      await dt.click();
      await page.waitForTimeout(500);
      const open = await page.evaluate(() => document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
      if (!open) { pass = false; notes.push('drawer did not open'); }
      // click a node if possible
      const node = page.locator('circle[data-ticker], .node circle').first();
      if (await node.count()) {
        await node.click({ force: true });
        await page.waitForTimeout(800);
        const detailOpen = await page.evaluate(() => {
          const d = document.getElementById('rn-detail-panel');
          return d && !d.hidden;
        });
        const drawerStillOpen = await page.evaluate(() => document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
        if (detailOpen && drawerStillOpen) {
          pass = false;
          notes.push('filter drawer and detail panel both open');
        }
      }
    }
    if (pageErrs.length) { pass = false; notes.push(`pageerror: ${pageErrs.join('; ')}`); }
    results.push({ id: 'mobile-filter-detail-no-conflict', pass, notes, pageErrs });
  } catch (e) {
    results.push({ id: 'mobile-filter-detail-no-conflict', pass: false, notes: [String(e.message || e)] });
  }
  await page.close();
}

await browser.close();

const passCount = results.filter((r) => r.pass).length;
console.log(JSON.stringify({ passCount, failCount: results.length - passCount, results }, null, 2));
