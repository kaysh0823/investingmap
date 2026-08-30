import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://www.investingmap.kr/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);

const dom = await page.evaluate(() => {
  const fc = document.getElementById('rn-filter-content');
  const sb = document.getElementById('rn-filter-sidebar');
  const gm = document.querySelector('.graph-main');
  const tb = document.querySelector('.rn-toolbar');
  return {
    fcExists: !!fc,
    fcChildCount: fc?.childElementCount,
    fcHtml: fc?.innerHTML?.slice(0, 200),
    sbHtml: sb?.outerHTML?.slice(0, 300),
    graphMainChildren: gm ? [...gm.children].map((c) => c.id || c.className?.slice(0, 30)) : [],
    toolbarParent: tb?.parentElement?.tagName + '#' + (tb?.parentElement?.id || tb?.parentElement?.className?.slice(0, 20)),
    hasGraphHeader: !!document.querySelector('.rn-graph-header'),
    hasGraphCanvas: !!document.querySelector('.rn-graph-canvas'),
    hasDrawerToggle: !!document.getElementById('rn-filter-drawer-toggle'),
  };
});

// Check if setupWorkspaceLayout exists in loaded script
const jsCheck = await page.evaluate(async () => {
  const res = await fetch('../js/relation_network.js?v=1');
  const text = await res.text();
  return {
    len: text.length,
    hasSetup: text.includes('function setupWorkspaceLayout'),
    hasMoveToolbar: text.includes('moveNode(filterContent, toolbar'),
    hasDrawerToggle: text.includes('rn-filter-drawer-toggle'),
    snippet: text.includes('setupWorkspaceLayout') ? 'found' : 'missing',
  };
});

console.log(JSON.stringify({ dom, jsCheck }, null, 2));
await browser.close();
