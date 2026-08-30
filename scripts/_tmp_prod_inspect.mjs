import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: true });
for (const spec of [
  { name: 'nuclear-desktop', w: 1440, h: 900, path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko' },
  { name: 'nuclear-mobile', w: 375, h: 812, path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko' },
]) {
  const page = await browser.newPage({ viewport: { width: spec.w, height: spec.h } });
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  await page.goto('https://www.investingmap.kr' + spec.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => {
    const t = document.querySelector('.rn-toolbar');
    const fc = document.getElementById('rn-filter-content');
    const sb = document.getElementById('rn-filter-sidebar');
    const dt = document.getElementById('rn-filter-drawer-toggle');
    return {
      toolbarParent: t?.parentElement?.id || t?.parentElement?.className?.slice(0, 40),
      fcHasToolbar: !!(fc && t && fc.contains(t)),
      sbHasToolbar: !!(sb && t && sb.contains(t)),
      topToolbar: !!document.querySelector('.rn-graph-header .rn-toolbar'),
      drawer: dt ? getComputedStyle(dt).display : 'missing',
      sidebarPos: sb ? getComputedStyle(sb).position : 'missing',
      graphMainW: document.querySelector('.rn-graph-main')?.getBoundingClientRect().width,
      readiness: window.RelationNetwork?.getReadiness?.(),
      scripts: [...document.querySelectorAll('script[src*="relation_network"]')].map((s) => s.getAttribute('src')),
    };
  });
  console.log(spec.name, JSON.stringify({ ...info, pageErrs }, null, 2));
}
await browser.close();
