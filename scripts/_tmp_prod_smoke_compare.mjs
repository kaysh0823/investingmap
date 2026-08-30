import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = 'https://www.investingmap.kr';

async function withFreshJs(context) {
  await context.route('**/relation_network.js?v=1', async (route) => {
    const res = await fetch('https://www.investingmap.kr/js/relation_network.js?v=2', { cache: 'no-store' });
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: await res.text() });
  });
}

async function activateGraph(page) {
  await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function layout(page) {
  return page.evaluate(() => {
    const tb = document.querySelector('.rn-toolbar');
    const fc = document.getElementById('rn-filter-content');
    const dt = document.getElementById('rn-filter-drawer-toggle');
    return {
      toolbarInSidebar: !!(fc && tb && fc.contains(tb)),
      topDup: !!document.querySelector('.rn-graph-header .rn-toolbar'),
      toolbarCount: document.querySelectorAll('.rn-toolbar').length,
      drawer: !!dt,
      legacySb: !!document.querySelector('.graph-sidebar'),
    };
  });
}

const browser = await chromium.launch({ headless: true });

console.log('=== ACTUAL PRODUCTION (?v=1 cached) ===');
for (const c of [
  { id: 'nuclear-desktop', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'nuclear-mobile', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 375, h: 812 },
]) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await activateGraph(page);
  console.log(c.id, { ...(await layout(page)), pageErrors: pe });
  await page.close();
}

console.log('\n=== WITH FRESH JS (simulates post-cache-purge) ===');
for (const c of [
  { id: 'nuclear-desktop', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'nuclear-mobile', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'finance-desktop', path: '/finance/korea_finance_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'construction-mobile', path: '/construction/korea_construction_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'robot-desktop', path: '/robot/korea_robot_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
]) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h } });
  await withFreshJs(ctx);
  const page = await ctx.newPage();
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await activateGraph(page);
  console.log(c.id, { ...(await layout(page)), pageErrors: pe });
  await ctx.close();
}

// EN + URL with fresh JS
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await withFreshJs(ctx);
  const page = await ctx.newPage();
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await activateGraph(page);
  console.log('nuclear-en', { ...(await layout(page)), pageErrors: pe, url: page.url() });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await withFreshJs(ctx);
  const page = await ctx.newPage();
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko&focus=005930', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await activateGraph(page);
  console.log('nuclear-url', { url: page.url(), focusKept: page.url().includes('focus=005930'), pageErrors: pe });
  await ctx.close();
}

await browser.close();
