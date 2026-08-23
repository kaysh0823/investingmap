/**
 * Browser smoke tests for relation network v2 (Phase 2.6).
 * Run: npm run verify:relation-browser
 * Uses npx playwright (not added to package.json dependencies).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RN_TEST_PORT || 8766);
const BASE = `http://127.0.0.1:${PORT}`;

const QUICK = process.env.RN_TEST_QUICK === '1';
const PILOT_PAGES = [
  { id: 'semiconductor', path: '/semiconductor/korea_semiconductor_map.html' },
  { id: 'holdings', path: '/holdings/korea_holdings_map.html' },
  { id: 'defense', path: '/defense/korea_defense_map.html' },
  { id: 'bio', path: '/bio/korea_bio_map.html' },
  { id: 'bigchip', path: '/bigchip/korea_bigchip_map.html' },
  { id: 'battery', path: '/battery/korea_battery_map.html' },
  { id: 'ship', path: '/ship/korea_ship_map.html' },
  { id: 'finance', path: '/finance/korea_finance_map.html' },
  { id: 'powergrid', path: '/powergrid/korea_powergrid_map.html' },
  { id: 'nuclear', path: '/nuclear/korea_nuclear_map.html' },
  { id: 'renewable', path: '/renewable/korea_renewable_map.html' },
  { id: 'construction', path: '/construction/korea_construction_map.html' },
  { id: 'auto', path: '/auto/korea_auto_map.html' },
];

const PAGES = QUICK ? PILOT_PAGES : [
  ...PILOT_PAGES,
  { id: 'robot', path: '/robot/korea_robot_map.html' },
];

const VIEWPORTS = QUICK
  ? [{ name: 'desktop', width: 1440, height: 900 }]
  : [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 812 },
  ];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, BASE);
        let rel = decodeURIComponent(u.pathname);
        if (rel === '/') rel = '/index.html';
        const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
        const fp = path.join(ROOT, safe.replace(/^\//, '').replace(/\\/g, '/'));
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.writeHead(404); res.end('404'); return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
        fs.createReadStream(fp).pipe(res);
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

async function loadPlaywright() {
  const pkgRoot = path.join(ROOT, 'node_modules', 'playwright');
  if (fs.existsSync(pkgRoot)) {
    return import(pathToFileURL(path.join(pkgRoot, 'index.mjs')).href);
  }
  const cacheDir = path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'npm-cache', '_npx');
  try {
    return await import('playwright');
  } catch {
    spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
      '--yes', '-p', 'playwright@1.49.1', 'install', 'chromium',
    ], { cwd: ROOT, stdio: 'inherit', timeout: 180000 });
    const mod = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
      '--yes', '-p', 'playwright@1.49.1', 'node', '-e',
      "import('playwright').then(m=>m.chromium.launch().then(b=>b.close())).then(()=>process.exit(0))",
    ], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    if (mod.status !== 0) throw new Error('playwright launch failed: ' + (mod.stderr || mod.stdout));
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pwPath = require.resolve('playwright', { paths: [ROOT] });
    return import(pathToFileURL(pwPath).href);
  }
}

async function testPage(page, pageDef, viewport, lang) {
  const failures = [];
  const url = `${BASE}${pageDef.path}?tab=graph&lang=${lang}`;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(800);

  const tabGraph = await page.$('#tab-graph.active, #tab-graph[class*="active"]');
  const graphTabBtn = await page.$('#tab-btn-graph');
  if (!tabGraph && graphTabBtn) {
    await graphTabBtn.click();
    await page.waitForTimeout(600);
  }

  const hasGraphSvg = await page.$('#graph-svg');
  if (!hasGraphSvg) failures.push('missing #graph-svg');

  const bodySector = await page.getAttribute('body', 'data-sector');
  if (pageDef.id === 'robot' && bodySector !== 'robot') {
    failures.push(`robot data-sector=${bodySector}`);
  }

  await page.waitForFunction(() => {
    const rn = window.RelationNetwork;
    if (!rn) return false;
    const st = rn.getState();
    return st && st.initialized;
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);

  const metrics = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    const svgs = document.querySelectorAll('#graph-svg svg, #graph-svg');
    const legacySim = typeof simulation !== 'undefined' && simulation;
    return {
      initialized: !!(st && st.initialized),
      usingLegacy: st && st.usingLegacy,
      sectorId: st && st.sectorId,
      svgCount: document.querySelectorAll('#graph-svg').length,
      legacySim: !!legacySim,
      hasV2Panel: !!document.getElementById('rn-detail-panel'),
      hasSparse: !!document.getElementById('rn-sparse-notice'),
      fetchSemi: performance.getEntriesByName('../data/networks/semiconductor.json').length,
    };
  });

  if (!metrics.initialized) failures.push(`${pageDef.id} network not initialized`);
  if (pageDef.id === 'robot' && metrics.initialized && !metrics.usingLegacy && metrics.sectorId !== 'robot') {
    failures.push('robot not using legacy/robot profile');
  }
  if (pageDef.id !== 'robot' && metrics.usingLegacy) {
    failures.push('pilot should not use legacy fallback');
  }
  if (metrics.legacySim) failures.push('legacy simulation still active');
  if (metrics.svgCount > 1) failures.push('multiple graph-svg containers');

  const badConsole = consoleErrors.filter((e) =>
    !/Failed to load resource|404|net::ERR|favicon|quotes|api\/fx|insertBefore|Content Security Policy|frame-ancestors|google\.com/i.test(e));
  if (badConsole.length) failures.push('console: ' + badConsole.slice(0, 2).join(' | '));

  // Tab switch 10x
  for (let i = 0; i < 10; i++) {
    const tableBtn = await page.$('#tab-btn-table');
    const graphBtn = await page.$('#tab-btn-graph');
    if (tableBtn) await tableBtn.click();
    await page.waitForTimeout(80);
    if (graphBtn) await graphBtn.click();
    await page.waitForTimeout(80);
  }
  const svgAfter = await page.evaluate(() => document.querySelectorAll('#graph-svg').length);
  if (svgAfter > 1) failures.push('svg grew after tab switches');

  return failures;
}

async function testUrlState(page) {
  const failures = [];

  async function waitForTickerSelection(page, ticker, timeout = 15000) {
    await page.waitForFunction(
      (expected) => {
        const rn = window.RelationNetwork;
        if (!rn) return false;
        const st = rn.getState();
        if (!st || !st.initialized || !st.nodes || !st.nodes.length) return false;
        if (!expected) return true;
        return st.selectedTicker === expected && !!st.selectedId;
      },
      ticker,
      { timeout },
    ).catch(() => {});
  }

  async function checkSemiTicker(ticker, expectSelected) {
    const url = `${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=${ticker}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (expectSelected) await waitForTickerSelection(page, ticker);
    else await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      return { ticker: st && st.selectedTicker, id: st && st.selectedId, initialized: !!(st && st.initialized) };
    });
    if (expectSelected && state.ticker !== ticker) failures.push(`${ticker}: ticker not restored: ${state.ticker}`);
    if (expectSelected && !state.id) failures.push(`${ticker}: no selectedId`);
    if (expectSelected && !state.initialized) failures.push(`${ticker}: network not initialized`);
    if (!expectSelected && state.ticker === 'INVALID') failures.push('invalid ticker accepted');
  }

  await checkSemiTicker('042700', true);
  await checkSemiTicker('005930', true);
  await checkSemiTicker('000660', true);

  async function checkPageTicker(pagePath, ticker, label) {
    await page.goto(`${BASE}${pagePath}?tab=graph&ticker=${ticker}`, { waitUntil: 'domcontentloaded' });
    await waitForTickerSelection(page, ticker);
    const state = await page.evaluate(() => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      return { ticker: st && st.selectedTicker, id: st && st.selectedId, initialized: !!(st && st.initialized) };
    });
    if (state.ticker !== ticker) failures.push(`${label}: ticker not restored: ${state.ticker}`);
    if (!state.id) failures.push(`${label}: no selectedId`);
    if (!state.initialized) failures.push(`${label}: network not initialized`);
  }

  await checkPageTicker('/holdings/korea_holdings_map.html', '034730', 'holdings SK');
  await checkPageTicker('/holdings/korea_holdings_map.html', '402340', 'holdings SK Square');
  await checkPageTicker('/bio/korea_bio_map.html', '302440', 'bio SK bioscience');
  await checkPageTicker('/bigchip/korea_bigchip_map.html', '005930', 'bigchip Samsung');
  await checkPageTicker('/bigchip/korea_bigchip_map.html', '000660', 'bigchip SK hynix');

  await page.goto(`${BASE}/bigchip/korea_bigchip_map.html?tab=graph&anchor=shared`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RelationNetwork && window.RelationNetwork.getState(), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const sharedScope = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    return st && st.filters && st.filters.bigchipScope;
  });
  if (sharedScope !== 'shared') failures.push('bigchip anchor=shared not applied: ' + sharedScope);

  // semiconductor still uses domestic_anchor ids
  await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=005930`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const semiAnchor = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    const n = st && st.nodes && st.nodes.find((x) => x.ticker === '005930');
    return n && n.id;
  });
  if (semiAnchor !== 'anchor:005930') failures.push('semi Samsung id expected anchor:005930 got ' + semiAnchor);

  await page.goto(`${BASE}/bigchip/korea_bigchip_map.html?tab=graph&ticker=005930`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const bigId = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    return st && st.selectedId;
  });
  if (bigId !== 'krx:005930') failures.push('bigchip Samsung id expected krx:005930 got ' + bigId);

  await checkPageTicker('/battery/korea_battery_map.html', '373220', 'battery LGES');
  await page.goto(`${BASE}/battery/korea_battery_map.html?tab=graph&stage=셀`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const batStage = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    return {
      stage: st && st.filters && st.filters.batteryStage,
      legacy: st && st.usingLegacy,
      model: st && st.network && st.network.model,
    };
  });
  if (batStage.legacy) failures.push('battery should not use legacyFallback');
  if (batStage.model !== 'battery_circular_value_chain') failures.push('battery model: ' + batStage.model);
  if (batStage.stage !== '셀') failures.push('battery stage not applied: ' + batStage.stage);

  await checkPageTicker('/ship/korea_ship_map.html', '329180', 'ship HD HHI');
  await page.goto(`${BASE}/ship/korea_ship_map.html?tab=graph&role=shipyard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const shipState = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    return {
      role: st && st.filters && st.filters.shipRole,
      legacy: st && st.usingLegacy,
      model: st && st.network && st.network.model,
      hasContract: !!(st && st.nodes && st.nodes.some((n) => n.type === 'order_contract')),
      hasShipToolbar: !!document.getElementById('rn-ship-roles'),
      hasBatteryToolbar: !!document.getElementById('rn-battery-stages'),
    };
  });
  if (shipState.legacy) failures.push('ship should not use legacyFallback');
  if (shipState.model !== 'shipbuilding_project_ecosystem') failures.push('ship model: ' + shipState.model);
  if (shipState.role !== 'shipyard') failures.push('ship role not applied: ' + shipState.role);
  if (!shipState.hasContract) failures.push('ship missing order_contract nodes');
  if (!shipState.hasShipToolbar) failures.push('ship toolbar missing');

  await checkPageTicker('/finance/korea_finance_map.html', '105560', 'finance KB');
  await page.goto(`${BASE}/finance/korea_finance_map.html?tab=graph&role=holding`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const finState = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    return {
      role: st && st.filters && st.filters.financeRole,
      legacy: st && st.usingLegacy,
      model: st && st.network && st.network.model,
      hasOwns: !!(st && st.edges && st.edges.some((e) => e.type === 'owns')),
      hasGroup: !!(st && st.nodes && st.nodes.some((n) => n.type === 'corporate_group')),
      hasToolbar: !!document.getElementById('rn-finance-roles'),
      hasShipToolbar: !!document.getElementById('rn-ship-roles'),
    };
  });
  if (finState.legacy) failures.push('finance should not use legacyFallback');
  if (finState.model !== 'financial_group_ecosystem') failures.push('finance model: ' + finState.model);
  if (finState.role !== 'holding') failures.push('finance role not applied: ' + finState.role);
  if (!finState.hasOwns) failures.push('finance missing owns edges');
  if (!finState.hasGroup) failures.push('finance missing corporate_group');
  if (!finState.hasToolbar) failures.push('finance toolbar missing');

  await page.goto(`${BASE}/ship/korea_ship_map.html?tab=graph`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const noFinOnShip = await page.evaluate(() => !!document.getElementById('rn-finance-roles'));
  if (noFinOnShip) failures.push('finance toolbar leaked onto ship');

  await page.goto(`${BASE}/battery/korea_battery_map.html?tab=graph`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const noShipOnBattery = await page.evaluate(() => !!document.getElementById('rn-ship-roles'));
  if (noShipOnBattery) failures.push('ship toolbar leaked onto battery');

  for (const prog of ['kf21', 'k9', 'cheongung_ii']) {
    await page.goto(`${BASE}/defense/korea_defense_map.html?tab=graph`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const hasProgram = await page.evaluate((pid) => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      return !!(st && st.nodes && st.nodes.some((n) => n.id === 'program:' + pid));
    }, prog);
    if (!hasProgram) failures.push(`defense program:${prog} missing`);
  }

  await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=INVALID&relation=INVALID&depth=99`);
  await page.waitForTimeout(1000);
  const safe = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    return { ticker: st && st.selectedTicker, depth: st && st.depth };
  });
  if (safe.ticker === 'INVALID') failures.push('invalid ticker accepted');
  if (safe.depth > 3) failures.push('depth not capped');

  return failures;
}

async function main() {
  console.log('verify:relation-browser');
  let pw;
  try {
    pw = await loadPlaywright();
  } catch (e) {
    console.error('SKIP browser QA —', e.message);
    process.exit(0);
  }

  const srv = await startServer();
  const browser = await pw.chromium.launch({ headless: true });
  const failures = [];

  try {
    for (const vp of VIEWPORTS) {
      for (const lang of (QUICK ? ['ko'] : ['ko', 'en'])) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        for (const p of PAGES) {
          const f = await testPage(page, p, vp, lang);
          if (f.length) failures.push(`${p.id}/${vp.name}/${lang}: ${f.join('; ')}`);
        }
        await ctx.close();
      }
    }

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    failures.push(...(await testUrlState(page2)).map((f) => `url-state: ${f}`));
    await ctx2.close();
  } finally {
    await browser.close();
    srv.close();
  }

  console.log('failures:', failures.length);
  failures.forEach((f) => console.log(' -', f));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
