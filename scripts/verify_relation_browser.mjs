/**
 * Browser smoke tests for relation network v2 (Phase 2.6 + 5E.1 harness stability).
 * Run: npm run verify:relation-browser
 * Env: RN_TEST_QUICK=1 | RN_TEST_ONLY=sector | RN_TEST_RUNS=N | RN_BROWSER_CONCURRENCY=1|2
 *      RN_TEST_PORT=8766 | RN_BROWSER_DIAG=1
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_PREF = Number(process.env.RN_TEST_PORT || 8766);
let PORT = PORT_PREF;
let BASE = `http://127.0.0.1:${PORT}`;
const DIAG_DIR = path.join(ROOT, '.tmp', 'relation-browser-diagnostics');
const DIAG_ENABLED = process.env.RN_BROWSER_DIAG !== '0';

const QUICK = process.env.RN_TEST_QUICK === '1';
const TEST_ONLY = process.env.RN_TEST_ONLY || '';
const TEST_RUNS = Math.max(1, Number(process.env.RN_TEST_RUNS || 1) || 1);
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.RN_BROWSER_CONCURRENCY || 1) || 1));
const BROWSER_RECYCLE_CASES = Math.max(5, Number(process.env.RN_BROWSER_RECYCLE_CASES || 8) || 8);

const STAGE_TIMEOUTS = {
  serverReady: 15000,
  browserLaunch: 30000,
  contextCreate: 20000,
  pageCreate: 20000,
  navigation: 45000,
  domContentLoaded: 45000,
  relationNetworkScript: 15000,
  whenReady: 25000,
  assertion: 10000,
  cleanup: 10000,
};

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
  { id: 'elec', path: '/elec/korea_elec_map.html' },
];

const PAGES = (() => {
  const base = QUICK ? PILOT_PAGES : [
    ...PILOT_PAGES,
    { id: 'robot', path: '/robot/korea_robot_map.html' },
  ];
  if (!TEST_ONLY) return base;
  return base.filter((p) => p.id === TEST_ONLY);
})();

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stageTimeout(name) {
  return STAGE_TIMEOUTS[name] || 20000;
}

function writeDiag(filename, data) {
  if (!DIAG_ENABLED) return;
  fs.mkdirSync(DIAG_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIAG_DIR, filename), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('health check timeout'));
    });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    let requestCount = 0;
    let settled = false;

    function create() {
      const srv = http.createServer((req, res) => {
        requestCount += 1;
        try {
          const u = new URL(req.url, BASE);
          let rel = decodeURIComponent(u.pathname);
          if (rel === '/') rel = '/index.html';
          const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
          const fp = path.join(ROOT, safe.replace(/^\//, '').replace(/\\/g, '/'));
          if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
            res.writeHead(404);
            res.end('404');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
          const stream = fs.createReadStream(fp);
          stream.on('error', (e) => {
            if (!res.headersSent) res.writeHead(500);
            res.end(String(e));
          });
          req.on('close', () => stream.destroy());
          stream.pipe(res);
        } catch (e) {
          res.writeHead(500);
          res.end(String(e));
        }
      });
      return srv;
    }

    function tryPort(port, remaining) {
      const srv = create();
      srv.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && remaining > 0) {
          tryPort(port + 1, remaining - 1);
          return;
        }
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      srv.listen(port, '127.0.0.1', () => {
        if (settled) return;
        settled = true;
        PORT = port;
        BASE = `http://127.0.0.1:${PORT}`;
        resolve({ srv, getRequestCount: () => requestCount, port: PORT });
      });
    }

    tryPort(PORT_PREF, 20);
  });
}

async function waitForServerReady(label = 'server') {
  const deadline = Date.now() + stageTimeout('serverReady');
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const r = await httpGet(`${BASE}/index.html`, 3000);
      if (r.status === 200) return;
      lastErr = new Error(`${label} health HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(150);
  }
  throw new Error(`${label}: static server not ready (${lastErr && lastErr.message})`);
}

async function loadPlaywright() {
  const pkgRoot = path.join(ROOT, 'node_modules', 'playwright');
  if (fs.existsSync(pkgRoot)) {
    return import(pathToFileURL(path.join(pkgRoot, 'index.mjs')).href);
  }
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

async function withStageTimeout(label, ms, fn) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`stage timeout: ${label} (${ms}ms)`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForNetworkReady(page, label, timeoutMs) {
  const ms = timeoutMs || stageTimeout('whenReady');
  await withStageTimeout(`${label}/RelationNetworkScript`, stageTimeout('relationNetworkScript'), () =>
    page.waitForFunction(() => typeof window.RelationNetwork !== 'undefined', { timeout: stageTimeout('relationNetworkScript') }));

  const result = await page.evaluate(async (waitMs) => {
    const rn = window.RelationNetwork;
    if (!rn || typeof rn.whenReady !== 'function') {
      return { ok: false, stage: 'whenReady', reason: 'RelationNetwork.whenReady missing' };
    }
    const initErr = rn.getInitializationError && rn.getInitializationError();
    if (initErr) {
      return { ok: false, stage: 'whenReady', reason: String(initErr), readiness: rn.getReadiness ? rn.getReadiness() : {} };
    }
    try {
      const st = await Promise.race([
        rn.whenReady(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('whenReady timeout')), waitMs)),
      ]);
      const readiness = rn.getReadiness ? rn.getReadiness() : {};
      return {
        ok: !!(st && st.initialized && st.firstRenderComplete),
        stage: 'whenReady',
        initialized: !!(st && st.initialized),
        firstRenderComplete: !!(st && st.firstRenderComplete),
        sectorId: st && st.sectorId,
        readiness,
      };
    } catch (e) {
      const readiness = rn.getReadiness ? rn.getReadiness() : {};
      return { ok: false, stage: 'whenReady', reason: String(e), readiness };
    }
  }, ms);

  if (!result.ok) {
    const snap = await page.evaluate(() => ({
      readyState: document.readyState,
      hasRn: typeof window.RelationNetwork !== 'undefined',
      readiness: window.RelationNetwork && window.RelationNetwork.getReadiness ? window.RelationNetwork.getReadiness() : null,
      svgCount: document.querySelectorAll('#graph-svg').length,
      graphNodeCount: document.querySelectorAll('#graph-svg .rn-node, #graph-svg circle').length,
      selectedTicker: window.RelationNetwork && window.RelationNetwork.getState && window.RelationNetwork.getState()?.selectedTicker,
    }));
    throw new Error(`${label}: network not ready at stage ${result.stage} (${result.reason || 'unknown'}; readiness=${JSON.stringify(result.readiness || {})}; snap=${JSON.stringify(snap)})`);
  }
  return result;
}

function isBenignBrowserError(msg) {
  return /Failed to load resource|404|net::ERR|favicon|quotes|api\/fx|Content Security Policy|frame-ancestors|google\.com|googletagmanager|google-analytics|clarity\.ms|doubleclick|googleadservices/i.test(String(msg));
}

async function installTestIsolation(context) {
  const blocked = /googletagmanager\.com|google-analytics\.com|clarity\.ms|doubleclick\.net|googleadservices\.com|google\.com\/pagead/i;
  await context.route(blocked, (route) => route.abort('blockedbyclient'));
}

function attachPageDiagnostics(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => bucket.pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    bucket.failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure() ? req.failure().errorText : 'unknown',
    });
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) {
      bucket.httpErrors.push({ url: res.url(), status });
    }
  });
}

async function activateGraphTab(page) {
  const tabGraph = await page.$('#tab-graph.active, #tab-graph[class*="active"]');
  if (tabGraph) return;
  const graphTabBtn = await page.$('#tab-btn-graph');
  if (graphTabBtn) await graphTabBtn.click();
}

async function testPage(page, pageDef, viewport, lang) {
  const failures = [];
  const url = `${BASE}${pageDef.path}?tab=graph&lang=${lang}`;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  await withStageTimeout('navigation', stageTimeout('navigation'), () =>
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: stageTimeout('domContentLoaded') }));

  await activateGraphTab(page);

  const hasGraphSvg = await page.$('#graph-svg');
  if (!hasGraphSvg) failures.push('missing #graph-svg');

  const bodySector = await page.getAttribute('body', 'data-sector');
  if (pageDef.id === 'robot' && bodySector !== 'robot') {
    failures.push(`robot data-sector=${bodySector}`);
  }

  try {
    await waitForNetworkReady(page, pageDef.id);
  } catch (e) {
    failures.push(String(e.message || e));
  }

  const metrics = await page.evaluate(() => {
    const st = window.RelationNetwork && window.RelationNetwork.getState();
    const svgs = document.querySelectorAll('#graph-svg svg, #graph-svg');
    const legacySim = typeof simulation !== 'undefined' && simulation;
    return {
      initialized: !!(st && st.initialized),
      firstRenderComplete: !!(st && st.firstRenderComplete),
      usingLegacy: st && st.usingLegacy,
      sectorId: st && st.sectorId,
      svgCount: document.querySelectorAll('#graph-svg').length,
      legacySim: !!legacySim,
      hasV2Panel: !!document.getElementById('rn-detail-panel'),
      hasSparse: !!document.getElementById('rn-sparse-notice'),
    };
  });

  if (!metrics.initialized) failures.push(`${pageDef.id} network not initialized`);
  if (!metrics.firstRenderComplete) failures.push(`${pageDef.id} first render incomplete`);
  if (pageDef.id === 'robot' && metrics.initialized && !metrics.usingLegacy && metrics.sectorId !== 'robot') {
    failures.push('robot not using legacy/robot profile');
  }
  if (pageDef.id !== 'robot' && metrics.usingLegacy) {
    failures.push('pilot should not use legacy fallback');
  }
  if (metrics.legacySim) failures.push('legacy simulation still active');
  if (metrics.svgCount > 1) failures.push('multiple graph-svg containers');

  return failures;
}

async function testUrlState(page) {
  const failures = [];

  async function ready(label, timeout) {
    try {
      await activateGraphTab(page);
      await waitForNetworkReady(page, label, timeout);
    } catch (e) {
      failures.push(String(e.message || e));
      return false;
    }
    return true;
  }

  async function waitForTickerSelection(ticker, timeout = stageTimeout('whenReady')) {
    const ok = await ready(ticker || 'network', timeout);
    if (!ok || !ticker) return;
    try {
      await page.waitForFunction(
        (expected) => {
          const rn = window.RelationNetwork;
          if (!rn) return false;
          const st = rn.getState();
          return st && st.initialized && st.firstRenderComplete
            && st.selectedTicker === expected && !!st.selectedId;
        },
        ticker,
        { timeout },
      );
    } catch (e) {
      failures.push(`${ticker}: selection wait failed (${e.message || e})`);
    }
  }

  async function checkSemiTicker(ticker, expectSelected) {
    const url = `${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=${ticker}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (expectSelected) await waitForTickerSelection(ticker);
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
    await waitForTickerSelection(ticker);
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
  if (await ready('bigchip-shared-anchor')) {
    const sharedScope = await page.evaluate(() => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      return st && st.filters && st.filters.bigchipScope;
    });
    if (sharedScope !== 'shared') failures.push('bigchip anchor=shared not applied: ' + sharedScope);
  }

  await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=005930`, { waitUntil: 'domcontentloaded' });
  if (await ready('semi-samsung')) {
    const semiAnchor = await page.evaluate(() => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      const n = st && st.nodes && st.nodes.find((x) => x.ticker === '005930');
      return n && n.id;
    });
    if (semiAnchor !== 'anchor:005930') failures.push('semi Samsung id expected anchor:005930 got ' + semiAnchor);
  }

  await page.goto(`${BASE}/bigchip/korea_bigchip_map.html?tab=graph&ticker=005930`, { waitUntil: 'domcontentloaded' });
  if (await ready('bigchip-samsung')) {
    const bigId = await page.evaluate(() => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      return st && st.selectedId;
    });
    if (bigId !== 'krx:005930') failures.push('bigchip Samsung id expected krx:005930 got ' + bigId);
  }

  await checkPageTicker('/battery/korea_battery_map.html', '373220', 'battery LGES');
  await page.goto(`${BASE}/battery/korea_battery_map.html?tab=graph&stage=셀`, { waitUntil: 'domcontentloaded' });
  if (await ready('battery-stage')) {
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
  }

  await checkPageTicker('/ship/korea_ship_map.html', '329180', 'ship HD HHI');
  await page.goto(`${BASE}/ship/korea_ship_map.html?tab=graph&role=shipyard`, { waitUntil: 'domcontentloaded' });
  if (await ready('ship-role')) {
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
  }

  await checkPageTicker('/finance/korea_finance_map.html', '105560', 'finance KB');
  await page.goto(`${BASE}/finance/korea_finance_map.html?tab=graph&role=holding`, { waitUntil: 'domcontentloaded' });
  if (await ready('finance-role')) {
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
  }

  await page.goto(`${BASE}/ship/korea_ship_map.html?tab=graph`, { waitUntil: 'domcontentloaded' });
  if (await ready('ship-toolbar-leak')) {
    const noFinOnShip = await page.evaluate(() => !!document.getElementById('rn-finance-roles'));
    if (noFinOnShip) failures.push('finance toolbar leaked onto ship');
  }

  await page.goto(`${BASE}/battery/korea_battery_map.html?tab=graph`, { waitUntil: 'domcontentloaded' });
  if (await ready('battery-toolbar-leak')) {
    const noShipOnBattery = await page.evaluate(() => !!document.getElementById('rn-ship-roles'));
    if (noShipOnBattery) failures.push('ship toolbar leaked onto battery');
  }

  for (const prog of ['kf21', 'k9', 'cheongung_ii']) {
    await page.goto(`${BASE}/defense/korea_defense_map.html?tab=graph`, { waitUntil: 'domcontentloaded' });
    if (await ready(`defense-${prog}`)) {
      const hasProgram = await page.evaluate((pid) => {
        const st = window.RelationNetwork && window.RelationNetwork.getState();
        return !!(st && st.nodes && st.nodes.some((n) => n.id === 'program:' + pid));
      }, prog);
      if (!hasProgram) failures.push(`defense program:${prog} missing`);
    }
  }

  await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=INVALID&relation=INVALID&depth=99`);
  if (await ready('semi-invalid')) {
    const safe = await page.evaluate(() => {
      const st = window.RelationNetwork && window.RelationNetwork.getState();
      return { ticker: st && st.selectedTicker, depth: st && st.depth };
    });
    if (safe.ticker === 'INVALID') failures.push('invalid ticker accepted');
    if (safe.depth > 3) failures.push('depth not capped');
  }

  return failures;
}

function buildMatrixCases() {
  const langs = QUICK ? ['ko'] : ['ko', 'en'];
  const cases = [];
  for (const vp of VIEWPORTS) {
    for (const lang of langs) {
      for (const p of PAGES) {
        cases.push({
          id: `${p.id}/${vp.name}/${lang}`,
          sector: p.id,
          viewport: vp,
          lang,
          pageDef: p,
          kind: 'matrix',
        });
      }
    }
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(workers);
  return results;
}

async function runMatrixCase(browser, caseDef, caseIndex, prevCaseId) {
  const t0 = Date.now();
  const timings = { totalMs: 0 };
  const diagBucket = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  const stageLog = [];
  let stage = 'init';
  let page = null;
  const failures = [];

  function mark(s) {
    const now = Date.now();
    stageLog.push({ stage: s, atMs: now - t0 });
    stage = s;
  }

  try {
    mark('pageCreate');
    page = await withStageTimeout('pageCreate', stageTimeout('pageCreate'), () =>
      browser.newPage({ locale: caseDef.lang === 'en' ? 'en-US' : 'ko-KR' }));
    await installTestIsolation(page.context());
    attachPageDiagnostics(page, diagBucket);

    mark('testPage');
    const f = await testPage(page, caseDef.pageDef, caseDef.viewport, caseDef.lang);
    failures.push(...f);

    mark('tabSwitch');
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

    const badConsole = diagBucket.consoleErrors.filter((e) => !isBenignBrowserError(e));
    if (badConsole.length) failures.push('console: ' + badConsole.slice(0, 2).join(' | '));
    const badPageErrors = diagBucket.pageErrors.filter((e) => !isBenignBrowserError(e));
    if (badPageErrors.length) failures.push('pageerror: ' + badPageErrors.slice(0, 2).join(' | '));

    mark('done');
  } catch (e) {
    failures.push(String(e.message || e));
    mark('error');
  } finally {
    timings.totalMs = Date.now() - t0;
    if (page) {
      try { await withStageTimeout('pageClose', stageTimeout('cleanup'), () => page.close()); } catch { /* */ }
    }
    writeDiag(`${caseDef.id.replace(/[/\\]/g, '_')}.json`, {
      caseId: caseDef.id,
      prevCaseId,
      caseIndex,
      url: `${BASE}${caseDef.pageDef.path}?tab=graph&lang=${caseDef.lang}`,
      viewport: caseDef.viewport.name,
      locale: caseDef.lang,
      stage,
      stageLog,
      elapsedMs: timings.totalMs,
      failures,
      consoleErrors: diagBucket.consoleErrors.slice(0, 20),
      pageErrors: diagBucket.pageErrors.slice(0, 20),
      failedRequests: diagBucket.failedRequests.slice(0, 20),
      httpErrors: diagBucket.httpErrors.slice(0, 20),
    });
  }

  return { id: caseDef.id, failures, timings, recycleBrowser: /pageCreate|contextCreate/.test(stage) && failures.length > 0 };
}

async function launchBrowser(pw) {
  return withStageTimeout('browserLaunch', stageTimeout('browserLaunch'), () =>
    pw.chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
    }));
}

async function runMatrixWithBrowserRecycle(pw, matrixCases, failures, caseTimings) {
  let browser = await launchBrowser(pw);
  try {
    for (let start = 0; start < matrixCases.length; start += BROWSER_RECYCLE_CASES) {
      if (start > 0) {
        await browser.close();
        browser = await launchBrowser(pw);
      }
      const chunk = matrixCases.slice(start, start + BROWSER_RECYCLE_CASES);
      for (let i = 0; i < chunk.length; i += 1) {
        const globalIndex = start + i;
        const r = await runMatrixCase(
          browser,
          chunk[i],
          globalIndex,
          globalIndex > 0 ? matrixCases[globalIndex - 1].id : null,
        );
        caseTimings.push({ id: r.id, totalMs: r.timings.totalMs, failures: r.failures.length });
        if (r.failures.length) failures.push(`${r.id}: ${r.failures.join('; ')}`);
        if (r.recycleBrowser) {
          await browser.close();
          browser = await launchBrowser(pw);
        }
        await sleep(30);
      }
    }
  } finally {
    await browser.close();
  }
}

async function runOnce(pw, runIndex) {
  const { srv } = await startServer();
  await waitForServerReady(`run${runIndex}`);

  const failures = [];
  const caseTimings = [];

  try {
    const matrixCases = buildMatrixCases();
    await runMatrixWithBrowserRecycle(pw, matrixCases, failures, caseTimings);

    if (!TEST_ONLY || PAGES.length !== 1) {
      const browser = await launchBrowser(pw);
      try {
        const matrixCasesDone = true;
        void matrixCasesDone;
        const ctx2 = await browser.newContext();
        await installTestIsolation(ctx2);
        const page2 = await ctx2.newPage();
        const urlFailures = await testUrlState(page2);
        failures.push(...urlFailures.map((f) => `url-state: ${f}`));
        await page2.close().catch(() => {});
        await ctx2.close();
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }

  return { failures, caseTimings };
}

function summarizeTimings(allRuns) {
  const flat = allRuns.flatMap((r) => r.caseTimings || []);
  const totals = flat.map((x) => x.totalMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const pct = (p) => {
    if (!totals.length) return 0;
    const idx = Math.min(totals.length - 1, Math.floor((p / 100) * totals.length));
    return totals[idx];
  };
  return {
    caseCount: totals.length,
    min: totals[0] || 0,
    median: pct(50),
    p90: pct(90),
    p95: pct(95),
    max: totals[totals.length - 1] || 0,
    timeoutCount: flat.filter((x) => x.failures > 0).length,
  };
}

function cleanupDiagDir() {
  if (fs.existsSync(DIAG_DIR)) {
    fs.rmSync(DIAG_DIR, { recursive: true, force: true });
  }
}

async function main() {
  console.log('verify:relation-browser');
  if (TEST_ONLY) console.log('filter:', TEST_ONLY);
  if (TEST_RUNS > 1) console.log('runs:', TEST_RUNS);
  console.log('concurrency:', CONCURRENCY);
  console.log('browser recycle every', BROWSER_RECYCLE_CASES, 'cases');

  let pw;
  try {
    pw = await loadPlaywright();
  } catch (e) {
    console.error('SKIP browser QA —', e.message);
    process.exit(0);
  }

  const allFailures = [];
  const runResults = [];
  const timingRuns = [];

  for (let run = 1; run <= TEST_RUNS; run += 1) {
    const t0 = Date.now();
    let result;
    try {
      result = await runOnce(pw, run);
    } catch (e) {
      result = { failures: [String(e.message || e)], caseTimings: [] };
    }
    const durationMs = Date.now() - t0;
    runResults.push({ run, durationMs, failures: result.failures.length });
    timingRuns.push(result);
    console.log(`run ${run}/${TEST_RUNS}: failures=${result.failures.length} duration=${durationMs}ms`);
    if (result.failures.length) {
      result.failures.forEach((f) => allFailures.push(`run${run}: ${f}`));
    }
  }

  const timingSummary = summarizeTimings(timingRuns);
  console.log('timing summary:', JSON.stringify(timingSummary));

  console.log('failures:', allFailures.length);
  allFailures.forEach((f) => console.log(' -', f));

  cleanupDiagDir();
  process.exit(allFailures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  cleanupDiagDir();
  process.exit(1);
});
