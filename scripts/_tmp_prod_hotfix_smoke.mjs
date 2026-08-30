import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = 'https://www.investingmap.kr';
const v1Requests = [];
const v2Requests = [];

async function activateGraph(page) {
  await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function runCase(browser, spec) {
  const page = await browser.newPage({ viewport: { width: spec.w, height: spec.h } });
  const pe = [];
  page.on('pageerror', (e) => pe.push(String(e)));
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('relation_network.js?v=1')) v1Requests.push(u);
    if (u.includes('relation_network.js?v=2')) v2Requests.push(u);
  });

  let pass = true;
  const notes = [];
  try {
    await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await activateGraph(page);
    const html = await page.content();
    if (html.includes('relation_network.js?v=1')) { pass = false; notes.push('HTML references v=1'); }
    if (!html.includes('relation_network.js?v=2')) { pass = false; notes.push('HTML missing v=2'); }

    const l = await page.evaluate(() => {
      const tb = document.querySelector('.rn-toolbar');
      const fc = document.getElementById('rn-filter-content');
      const dt = document.getElementById('rn-filter-drawer-toggle');
      return {
        toolbarInFc: !!(fc && tb && fc.contains(tb)),
        topDup: !!document.querySelector('.rn-graph-header .rn-toolbar'),
        toolbarCount: document.querySelectorAll('.rn-toolbar').length,
        drawer: !!dt,
        fcChildCount: fc?.childElementCount ?? 0,
      };
    });

    if (!l.toolbarInFc) { pass = false; notes.push('toolbar not in filter-content'); }
    if (l.fcChildCount === 0) { pass = false; notes.push('empty filter-content'); }
    if (l.topDup) { pass = false; notes.push('duplicate top toolbar'); }
    if (l.toolbarCount !== 1) { pass = false; notes.push(`toolbar count ${l.toolbarCount}`); }
    if (spec.w < 768) {
      if (!l.drawer) { pass = false; notes.push('missing drawer'); }
      else {
        await page.click('#rn-filter-drawer-toggle');
        await page.waitForTimeout(400);
        const open = await page.evaluate(() => document.getElementById('rn-filter-sidebar')?.classList.contains('is-open'));
        if (!open) { pass = false; notes.push('drawer did not open'); }
        await page.keyboard.press('Escape');
      }
    }
    if (pe.length) { pass = false; notes.push(`pageerror: ${pe.join('; ')}`); }

    return { id: spec.id, pass, notes, layout: l, pageErrors: pe };
  } catch (e) {
    return { id: spec.id, pass: false, notes: [String(e.message || e)] };
  } finally {
    await page.close();
  }
}

const cases = [
  { id: 'nuclear-desktop', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'nuclear-mobile', path: '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'finance-desktop', path: '/finance/korea_finance_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'construction-mobile', path: '/construction/korea_construction_map.html?tab=graph&lang=ko', w: 375, h: 812 },
  { id: 'robot-desktop', path: '/robot/korea_robot_map.html?tab=graph&lang=ko', w: 1440, h: 900 },
  { id: 'cosmetics-mobile-en', path: '/cosmetics/korea_cosmetics_map.html?tab=graph&lang=en', w: 375, h: 812 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
for (const c of cases) results.push(await runCase(browser, c));

// URL restore
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pe = []; page.on('pageerror', (e) => pe.push(String(e)));
  await page.goto(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko&focus=005930', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await activateGraph(page);
  results.push({ id: 'nuclear-url-restore', pass: page.url().includes('focus=005930') && pe.length === 0, url: page.url(), pageErrors: pe });
  await page.close();
}

await browser.close();

// Asset fetch checks
const jsRes = await fetch(BASE + '/js/relation_network.js?v=2', { cache: 'no-store' });
const jsText = await jsRes.text();
const htmlRes = await fetch(BASE + '/nuclear/korea_nuclear_map.html?tab=graph&lang=ko', { cache: 'no-store' });
const htmlText = await htmlRes.text();

const asset = {
  jsUrl: BASE + '/js/relation_network.js?v=2',
  jsStatus: jsRes.status,
  jsLen: jsText.length,
  hasSetup: jsText.includes('setupWorkspaceLayout'),
  cfCache: jsRes.headers.get('cf-cache-status'),
  htmlUsesV2: htmlText.includes('relation_network.js?v=2'),
  htmlUsesV1: htmlText.includes('relation_network.js?v=1'),
};

// snapshots
const snaps = {};
for (const f of ['hub_quote_snapshot.json', 'hub_rs_snapshot.json', 'hub_sector_returns.json']) {
  const j = await fetch(BASE + '/data/' + f).then((r) => r.json());
  snaps[f] = j.asOf;
}

const passCount = results.filter((r) => r.pass).length;
console.log(JSON.stringify({ passCount, failCount: results.length - passCount, results, asset, v1Requests: v1Requests.length, v2Requests: v2Requests.length, snaps }, null, 2));
process.exit(passCount === results.length && asset.hasSetup && asset.htmlUsesV2 && !asset.htmlUsesV1 && v1Requests.length === 0 ? 0 : 1);
