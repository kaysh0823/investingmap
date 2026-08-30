import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'https://hotfix-relation-network-cach.investing-map.pages.dev';

async function activateGraph(page) {
  await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function check(page, label) {
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  const html = await page.content();
  const usesV2 = html.includes('relation_network.js?v=2');
  const usesV1 = html.includes('relation_network.js?v=1');
  const l = await page.evaluate(() => {
    const tb = document.querySelector('.rn-toolbar');
    const fc = document.getElementById('rn-filter-content');
    const dt = document.getElementById('rn-filter-drawer-toggle');
    return {
      toolbarInFc: !!(fc && tb && fc.contains(tb)),
      topDup: !!document.querySelector('.rn-graph-header .rn-toolbar'),
      drawer: !!dt,
    };
  });
  const pass = usesV2 && !usesV1 && l.toolbarInFc && !l.topDup && l.drawer && pe.length === 0;
  console.log(label, { pass, usesV2, usesV1, ...l, pageErrors: pe });
  return pass;
}

const browser = await chromium.launch({ headless: true });
let ok = true;

for (const spec of [
  { label: 'nuclear-desktop', w: 1440, h: 900, path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko' },
  { label: 'nuclear-mobile', w: 375, h: 812, path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko' },
]) {
  const page = await browser.newPage({ viewport: { width: spec.w, height: spec.h } });
  await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await activateGraph(page);
  if (!(await check(page, spec.label))) ok = false;
  await page.close();
}

await browser.close();
process.exit(ok ? 0 : 1);
