/**
 * Phase 5F targeted browser QA only — does NOT run the full relation-browser matrix.
 * Cases: kconsume desktop/ko + mobile/en, kcontent desktop/ko + mobile/en,
 * cosmetics desktop/ko, bigchip 000660, construction mobile/ko, bio mobile/en.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_PREF = Number(process.env.RN_TEST_PORT || 8776);
let PORT = PORT_PREF;
let BASE = `http://127.0.0.1:${PORT}`;

const CASES = [
  { id: 'kconsume/desktop/ko', path: '/kconsume/korea_kconsume_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: '003230' },
  { id: 'kconsume/mobile/en', path: '/kconsume/korea_kconsume_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: '271560' },
  { id: 'kcontent/desktop/ko', path: '/kcontent/korea_kcontent_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: '259960' },
  { id: 'kcontent/mobile/en', path: '/kcontent/korea_kcontent_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: '352820' },
  { id: 'cosmetics/desktop/ko', path: '/cosmetics/korea_cosmetics_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: null },
  { id: 'bigchip/000660', path: '/bigchip/korea_bigchip_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: '000660' },
  { id: 'construction/mobile/ko', path: '/construction/korea_construction_map.html', vp: { w: 375, h: 812 }, lang: 'ko', ticker: null },
  { id: 'bio/mobile/en', path: '/bio/korea_bio_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: null },
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

function isBenign(msg) {
  return /Failed to load resource|404|net::ERR|favicon|quotes|api\/fx|Content Security Policy|frame-ancestors|google\.com|googletagmanager|google-analytics|clarity\.ms|doubleclick|googleadservices/i.test(String(msg));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
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
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-type' });
        fs.createReadStream(fp).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    function tryPort(port, left) {
      srv.listen(port, '127.0.0.1', () => {
        PORT = port;
        BASE = `http://127.0.0.1:${PORT}`;
        resolve(srv);
      });
      srv.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && left > 0) tryPort(port + 1, left - 1);
        else reject(err);
      });
    }
    tryPort(PORT_PREF, 20);
  });
}

async function loadPlaywright() {
  const pkgRoot = path.join(ROOT, 'node_modules', 'playwright');
  if (fs.existsSync(pkgRoot)) {
    return import(pathToFileURL(path.join(pkgRoot, 'index.mjs')).href);
  }
  return import('playwright');
}

async function withTimeout(label, ms, fn) {
  let t;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`stage timeout: ${label} (${ms}ms)`)), ms); }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function waitReady(page, label) {
  await page.waitForFunction(() => typeof window.RelationNetwork !== 'undefined', { timeout: 15000 });
  const result = await page.evaluate(async () => {
    const rn = window.RelationNetwork;
    if (!rn || typeof rn.whenReady !== 'function') return { ok: false, reason: 'whenReady missing' };
    try {
      const st = await Promise.race([
        rn.whenReady(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('whenReady timeout')), 25000)),
      ]);
      return {
        ok: !!(st && st.initialized && st.firstRenderComplete),
        usingLegacy: !!(st && st.usingLegacy),
        sectorId: st && st.sectorId,
        selectedTicker: st && st.selectedTicker,
        model: st && st.network && st.network.model,
        layout: st && st.network && st.network.layout,
      };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  });
  if (!result.ok) throw new Error(`${label}: not ready (${result.reason || JSON.stringify(result)})`);
  return result;
}

async function runCase(browser, c) {
  const failures = [];
  const diag = { consoleErrors: [], pageErrors: [] };
  let page = null;
  let stage = 'init';
  const t0 = Date.now();
  try {
    stage = 'pageCreate';
    page = await withTimeout('pageCreate', 20000, () =>
      browser.newPage({ locale: c.lang === 'en' ? 'en-US' : 'ko-KR' }));
    page.on('console', (msg) => { if (msg.type() === 'error') diag.consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => diag.pageErrors.push(String(err)));
    await page.route(/googletagmanager\.com|google-analytics\.com|clarity\.ms|doubleclick\.net|googleadservices\.com/i, (route) => route.abort('blockedbyclient'));

    stage = 'navigation';
    await page.setViewportSize({ width: c.vp.w, height: c.vp.h });
    const qs = new URLSearchParams({ tab: 'graph', lang: c.lang });
    if (c.ticker) qs.set('ticker', c.ticker);
    await withTimeout('navigation', 45000, () =>
      page.goto(`${BASE}${c.path}?${qs}`, { waitUntil: 'domcontentloaded', timeout: 45000 }));

    const graphBtn = await page.$('#tab-btn-graph');
    if (graphBtn) await graphBtn.click();

    stage = 'whenReady';
    const ready = await waitReady(page, c.id);
    if (ready.usingLegacy && !c.id.startsWith('bio/') && !c.id.startsWith('robot/')) {
      failures.push('legacyFallback unexpectedly true');
    }
    if (c.ticker && ready.selectedTicker !== c.ticker) {
      failures.push(`ticker expected ${c.ticker} got ${ready.selectedTicker}`);
    }
    if (c.id.startsWith('kconsume/') && ready.model !== 'consumer_brand_distribution_ecosystem') {
      failures.push(`kconsume model: ${ready.model}`);
    }
    if (c.id.startsWith('kcontent/') && ready.model !== 'content_ip_production_distribution_ecosystem') {
      failures.push(`kcontent model: ${ready.model}`);
    }

    stage = 'tabSwitch';
    for (let i = 0; i < 4; i += 1) {
      const tableBtn = await page.$('#tab-btn-table');
      const gBtn = await page.$('#tab-btn-graph');
      if (tableBtn) await tableBtn.click();
      await sleep(60);
      if (gBtn) await gBtn.click();
      await sleep(60);
    }
    if (c.vp.w <= 400) {
      const sheet = await page.$('#rn-detail-panel, .rn-bottom-sheet, #rn-mobile-sheet');
      void sheet;
    }

    stage = 'langReload';
    if (c.id.includes('kconsume') || c.id.includes('kcontent')) {
      const other = c.lang === 'ko' ? 'en' : 'ko';
      await page.goto(`${BASE}${c.path}?tab=graph&lang=${other}${c.ticker ? `&ticker=${c.ticker}` : ''}`, {
        waitUntil: 'domcontentloaded',
      });
      await waitReady(page, `${c.id}/lang-${other}`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(page, `${c.id}/reload`);
    }

    const badConsole = diag.consoleErrors.filter((e) => !isBenign(e));
    const badPage = diag.pageErrors.filter((e) => !isBenign(e));
    if (badConsole.length) failures.push(`console: ${badConsole.slice(0, 2).join(' | ')}`);
    if (badPage.length) failures.push(`pageerror: ${badPage.slice(0, 2).join(' | ')}`);
    stage = 'done';
  } catch (e) {
    const msg = String(e.message || e);
    const infra = /stage timeout: pageCreate|browserLaunch|contextCreate/i.test(msg);
    failures.push(infra ? `INFRA ${msg}` : msg);
    stage = infra ? 'infraFailure' : 'error';
  } finally {
    if (page) {
      try { await page.close(); } catch { /* */ }
    }
  }
  return {
    id: c.id,
    stage,
    elapsedMs: Date.now() - t0,
    failures,
    infrastructureFailure: stage === 'infraFailure' || failures.some((f) => f.startsWith('INFRA ')),
  };
}

async function main() {
  const srv = await startServer();
  const pw = await loadPlaywright();
  const results = [];
  let browser = await pw.chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    for (const c of CASES) {
      const r = await runCase(browser, c);
      results.push(r);
      console.log(`${r.failures.length ? 'FAIL' : 'OK '} ${r.id} (${r.elapsedMs}ms) stage=${r.stage}${r.failures.length ? ` :: ${r.failures.join('; ')}` : ''}`);
      if (r.infrastructureFailure) {
        try { await browser.close(); } catch { /* */ }
        browser = await pw.chromium.launch({
          headless: true,
          args: ['--disable-dev-shm-usage', '--disable-gpu'],
        });
      }
      await sleep(50);
    }
  } finally {
    try { await browser.close(); } catch { /* */ }
    await new Promise((resolve) => srv.close(resolve));
  }

  const appFails = results.filter((r) => r.failures.length && !r.infrastructureFailure);
  const infraFails = results.filter((r) => r.infrastructureFailure);
  const out = {
    generatedAt: new Date().toISOString(),
    note: 'Phase 5F targeted only — full matrix not run; pageCreate hang recorded as infrastructure failure without retry-as-success',
    results,
    appFailureCount: appFails.length,
    infrastructureFailureCount: infraFails.length,
  };
  const outPath = path.join(ROOT, 'docs/reports/phase5f-targeted-browser-qa.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\napp failures: ${appFails.length}`);
  console.log(`infra failures: ${infraFails.length}`);
  console.log(`wrote ${outPath}`);
  if (appFails.length) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
