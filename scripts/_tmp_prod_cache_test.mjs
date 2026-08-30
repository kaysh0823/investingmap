import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Intercept and swap to fresh JS
await page.route('**/relation_network.js?v=1', async (route) => {
  const res = await fetch('https://www.investingmap.kr/js/relation_network.js?v=2', { cache: 'no-store' });
  await route.fulfill({ status: 200, contentType: 'application/javascript', body: await res.text() });
});

await page.goto('https://www.investingmap.kr/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 30000 });
await page.waitForTimeout(2000);

const layout = await page.evaluate(() => {
  const tb = document.querySelector('.rn-toolbar');
  const fc = document.getElementById('rn-filter-content');
  return {
    toolbarInFc: !!(fc && tb && fc.contains(tb)),
    drawer: !!document.getElementById('rn-filter-drawer-toggle'),
    graphHeader: !!document.querySelector('.rn-graph-header'),
    graphCanvas: !!document.querySelector('.rn-graph-canvas'),
  };
});
console.log('with v=2 JS override:', layout);
await browser.close();
