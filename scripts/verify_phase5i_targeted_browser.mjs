/**
 * Phase 5I targeted browser QA — full matrix NOT run.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let PORT = Number(process.env.RN_TEST_PORT || 8781);
let BASE = `http://127.0.0.1:${PORT}`;

const CASES = [
  { id: 'robot/desktop/ko', path: '/robot/korea_robot_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: '277810', model: 'robotics_component_system_application_ecosystem' },
  { id: 'robot/tablet/en', path: '/robot/korea_robot_map.html', vp: { w: 768, h: 1024 }, lang: 'en', ticker: '454910', model: 'robotics_component_system_application_ecosystem' },
  { id: 'robot/mobile/ko', path: '/robot/korea_robot_map.html', vp: { w: 375, h: 812 }, lang: 'ko', ticker: '108490', model: 'robotics_component_system_application_ecosystem' },
  { id: 'robot/mobile/en', path: '/robot/korea_robot_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: '466100', model: 'robotics_component_system_application_ecosystem' },
  { id: 'robot/ticker-url', path: '/robot/korea_robot_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: '056190', model: 'robotics_component_system_application_ecosystem' },
  { id: 'robot/lane-url', path: '/robot/korea_robot_map.html', vp: { w: 1440, h: 900 }, lang: 'en', ticker: '348340', model: 'robotics_component_system_application_ecosystem', extraQs: { lane: 'collaborative_robot' } },
  { id: 'software/mobile/en', path: '/software/korea_software_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: '042000' },
  { id: 'telecom/mobile/en', path: '/telecom/korea_telecom_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: '010170' },
  { id: 'medtech/mobile/en', path: '/medtech/korea_medtech_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: '096530' },
  { id: 'bigchip/000660', path: '/bigchip/korea_bigchip_map.html', vp: { w: 1440, h: 900 }, lang: 'ko', ticker: '000660' },
  { id: 'construction/mobile/ko', path: '/construction/korea_construction_map.html', vp: { w: 375, h: 812 }, lang: 'ko', ticker: null },
  { id: 'bio/mobile/en', path: '/bio/korea_bio_map.html', vp: { w: 375, h: 812 }, lang: 'en', ticker: null },
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isBenign = (msg) => /Failed to load resource|404|net::ERR|favicon|quotes|api\/fx|Content Security Policy|frame-ancestors|google\.com|googletagmanager|google-analytics|clarity\.ms|doubleclick|googleadservices/i.test(String(msg));

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
          res.writeHead(404); res.end('404'); return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    function tryPort(port, left) {
      srv.listen(port, '127.0.0.1', () => { PORT = port; BASE = `http://127.0.0.1:${PORT}`; resolve(srv); });
      srv.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && left > 0) tryPort(port + 1, left - 1);
        else reject(err);
      });
    }
    tryPort(PORT, 20);
  });
}

async function loadPlaywright() {
  const pkg = path.join(ROOT, 'node_modules/playwright');
  if (fs.existsSync(pkg)) return import(pathToFileURL(path.join(pkg, 'index.mjs')).href);
  return import('playwright');
}

async function withTimeout(label, ms, fn) {
  let t;
  try {
    return await Promise.race([fn(), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`stage timeout: ${label} (${ms}ms)`)), ms); })]);
  } finally { if (t) clearTimeout(t); }
}

async function waitReady(page, label) {
  await page.waitForFunction(() => typeof window.RelationNetwork !== 'undefined', { timeout: 15000 });
  const result = await page.evaluate(async () => {
    const rn = window.RelationNetwork;
    if (!rn?.whenReady) return { ok: false, reason: 'whenReady missing' };
    try {
      const st = await Promise.race([rn.whenReady(), new Promise((_, rej) => setTimeout(() => rej(new Error('whenReady timeout')), 25000))]);
      return { ok: !!(st?.initialized && st.firstRenderComplete), usingLegacy: !!st?.usingLegacy, selectedTicker: st?.selectedTicker, model: st?.network?.model };
    } catch (e) { return { ok: false, reason: String(e) }; }
  });
  if (!result.ok) throw new Error(`${label}: not ready (${result.reason || JSON.stringify(result)})`);
  return result;
}

async function runCase(browser, c) {
  const failures = []; const diag = { consoleErrors: [], pageErrors: [] };
  let page = null; let stage = 'init'; const t0 = Date.now();
  try {
    stage = 'pageCreate';
    page = await withTimeout('pageCreate', 20000, () => browser.newPage({ locale: c.lang === 'en' ? 'en-US' : 'ko-KR' }));
    page.on('console', (msg) => { if (msg.type() === 'error') diag.consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => diag.pageErrors.push(String(err)));
    await page.route(/googletagmanager\.com|google-analytics\.com|clarity\.ms|doubleclick\.net|googleadservices\.com/i, (route) => route.abort('blockedbyclient'));
    stage = 'navigation';
    await page.setViewportSize({ width: c.vp.w, height: c.vp.h });
    const qs = new URLSearchParams({ tab: 'graph', lang: c.lang });
    if (c.ticker) qs.set('ticker', c.ticker);
    if (c.extraQs) Object.entries(c.extraQs).forEach(([k, v]) => qs.set(k, v));
    await withTimeout('navigation', 45000, () => page.goto(`${BASE}${c.path}?${qs}`, { waitUntil: 'domcontentloaded', timeout: 45000 }));
    const graphBtn = await page.$('#tab-btn-graph');
    if (graphBtn) await graphBtn.click();
    stage = 'whenReady';
    const ready = await waitReady(page, c.id);
    if (ready.usingLegacy && c.id.startsWith('robot/')) failures.push('legacyFallback unexpectedly true');
    if (c.ticker && ready.selectedTicker !== c.ticker) failures.push(`ticker expected ${c.ticker} got ${ready.selectedTicker}`);
    if (c.model && ready.model !== c.model) failures.push(`model: ${ready.model}`);
    stage = 'tabSwitch';
    for (let i = 0; i < 4; i += 1) {
      const tableBtn = await page.$('#tab-btn-table'); const gBtn = await page.$('#tab-btn-graph');
      if (tableBtn) await tableBtn.click(); await sleep(60);
      if (gBtn) await gBtn.click(); await sleep(60);
    }
    if (c.id.startsWith('robot/')) {
      stage = 'langReload';
      const other = c.lang === 'ko' ? 'en' : 'ko';
      await page.goto(`${BASE}${c.path}?tab=graph&lang=${other}${c.ticker ? `&ticker=${c.ticker}` : ''}`, { waitUntil: 'domcontentloaded' });
      await waitReady(page, `${c.id}/lang`);
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
    if (page) try { await page.close(); } catch { /* */ }
  }
  return { id: c.id, stage, elapsedMs: Date.now() - t0, failures, infrastructureFailure: stage === 'infraFailure' || failures.some((f) => f.startsWith('INFRA ')) };
}

async function main() {
  const srv = await startServer();
  const pw = await loadPlaywright();
  const results = [];
  let browser = await pw.chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  try {
    for (const c of CASES) {
      const r = await runCase(browser, c);
      results.push(r);
      console.log(`${r.failures.length ? 'FAIL' : 'OK '} ${r.id} (${r.elapsedMs}ms) stage=${r.stage}${r.failures.length ? ` :: ${r.failures.join('; ')}` : ''}`);
      if (r.infrastructureFailure) {
        try { await browser.close(); } catch { /* */ }
        browser = await pw.chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
      }
      await sleep(50);
    }
  } finally {
    try { await browser.close(); } catch { /* */ }
    await new Promise((r) => srv.close(r));
  }
  const appFails = results.filter((r) => r.failures.length && !r.infrastructureFailure);
  const out = {
    generatedAt: new Date().toISOString(),
    note: 'Phase 5I targeted only — full matrix not run; pageCreate hang = infrastructure without retry-as-success',
    results, appFailureCount: appFails.length,
    infrastructureFailureCount: results.filter((r) => r.infrastructureFailure).length,
  };
  const outPath = path.join(ROOT, 'docs/reports/phase5i-targeted-browser-qa.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\napp failures: ${appFails.length}\ninfrastructure failures: ${out.infrastructureFailureCount}\nwrote ${outPath}`);
  process.exit(appFails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
