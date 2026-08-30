/**
 * One-off production release smoke for relationship network PR #1.
 * Usage: node scripts/_tmp_production_release_smoke.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = 'https://www.investingmap.kr';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp', 'production-release-smoke.json');
const EXPECT_SNAPSHOT_ASOF = '2026-08-29T12:06';

const VIEWPORTS = [
  { id: 'mobile', width: 375, height: 812 },
  { id: 'desktop', width: 1440, height: 900 },
];
const LANGS = ['ko', 'en'];

const results = {
  startedAt: new Date().toISOString(),
  base: BASE,
  http: {},
  data: {},
  cases: [],
  summary: { pass: 0, fail: 0, warn: 0 },
};

function pass(id, detail = {}) {
  results.cases.push({ id, status: 'pass', ...detail });
  results.summary.pass++;
}
function fail(id, msg, detail = {}) {
  results.cases.push({ id, status: 'fail', message: msg, ...detail });
  results.summary.fail++;
}
function warn(id, msg, detail = {}) {
  results.cases.push({ id, status: 'warn', message: msg, ...detail });
  results.summary.warn++;
}

async function fetchMeta(url, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: 'follow', ...opts });
  const ms = Date.now() - t0;
  const ct = res.headers.get('content-type') || '';
  const cc = res.headers.get('cache-control') || '';
  let body = '';
  if (opts.readBody !== false) {
    body = await res.text();
  }
  return { url, finalUrl: res.url, status: res.status, ms, ct, cc, body, headers: Object.fromEntries(res.headers.entries()) };
}

async function checkDomains() {
  const urls = [
    'https://www.investingmap.kr/',
    'https://www.investingmap.kr/',
    'https://www.investingmap.kr/',
    `${BASE}/robots.txt`,
    `${BASE}/sitemap.xml`,
    `${BASE}/data/hub_quote_snapshot.json`,
    `${BASE}/data/hub_rs_snapshot.json`,
    `${BASE}/data/hub_sector_returns.json`,
    `${BASE}/js/network_profiles.js`,
    `${BASE}/js/relation_network.js`,
    `${BASE}/data/networks/semiconductor.json`,
    `${BASE}/data/networks/finance.json`,
    `${BASE}/data/networks/construction.json`,
    `${BASE}/data/networks/robot.json`,
  ];
  for (const u of urls) {
    try {
      const m = await fetchMeta(u);
      results.http[u] = {
        status: m.status,
        finalUrl: m.finalUrl,
        ms: m.ms,
        contentType: m.ct,
        cacheControl: m.cc,
        bodyLen: m.body.length,
      };
      if (m.status >= 400) fail(`http:${u}`, `HTTP ${m.status}`);
      else pass(`http:${u}`, { status: m.status, ms: m.ms });
    } catch (e) {
      results.http[u] = { error: String(e) };
      fail(`http:${u}`, String(e));
    }
  }

  // canonical on homepage
  const home = results.http['https://www.investingmap.kr/'];
  if (home?.bodyLen) {
    const m = await fetchMeta('https://www.investingmap.kr/');
    const canon = m.body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    results.http.canonical = canon?.[1] || null;
    if (canon && !canon[1].includes('www.investingmap.kr')) {
      warn('canonical', `unexpected canonical: ${canon[1]}`);
    } else if (canon) {
      pass('canonical', { href: canon[1] });
    } else {
      warn('canonical', 'canonical link not found');
    }
  }

  // snapshots
  for (const f of ['hub_quote_snapshot.json', 'hub_rs_snapshot.json', 'hub_sector_returns.json']) {
    const m = await fetchMeta(`${BASE}/data/${f}`);
    try {
      const j = JSON.parse(m.body);
      results.data[f] = { asOf: j.asOf, keys: Object.keys(j) };
      if (!j.asOf?.startsWith(EXPECT_SNAPSHOT_ASOF.slice(0, 10))) {
        warn(`snapshot:${f}`, `asOf ${j.asOf} differs from expected ${EXPECT_SNAPSHOT_ASOF}`);
      } else {
        pass(`snapshot:${f}`, { asOf: j.asOf });
      }
      if (f === 'hub_quote_snapshot.json') {
        results.data[f].quotesOk = j.quotesOk;
        results.data[f].quotesTotal = j.quotesTotal;
        results.data[f].count = Object.keys(j.quotes || {}).length;
      }
      if (f === 'hub_rs_snapshot.json') {
        results.data[f].quotesOk = j.quotesOk;
        results.data[f].count = Object.keys(j.quotes || {}).length;
      }
      if (f === 'hub_sector_returns.json') {
        results.data[f].sectorCount = Array.isArray(j.sectors) ? j.sectors.length : Object.keys(j.sectors || j.mcapRecentDd || {}).length;
      }
    } catch (e) {
      fail(`snapshot:${f}`, `parse error: ${e}`);
    }
  }

  // network json checks
  for (const f of ['semiconductor.json', 'finance.json', 'construction.json', 'robot.json']) {
    const m = await fetchMeta(`${BASE}/data/networks/${f}`);
    if (!m.ct.includes('json') && !m.ct.includes('application/octet-stream')) {
      warn(`network-ct:${f}`, m.ct);
    }
    try {
      const j = JSON.parse(m.body);
      results.data[`networks/${f}`] = {
        nodes: j.nodes?.length,
        edges: j.edges?.length,
        legacyFallback: j.legacyFallback,
        networkPath: j.networkPath ?? j.meta?.networkPath,
      };
      if (f === 'robot.json' && j.legacyFallback === true) {
        fail('robot-legacyFallback', 'legacyFallback true in production');
      } else if (f === 'robot.json') {
        pass('robot-legacyFallback', { legacyFallback: j.legacyFallback });
      }
      pass(`network:${f}`, results.data[`networks/${f}`]);
    } catch (e) {
      fail(`network:${f}`, String(e));
    }
  }

  const prof = await fetchMeta(`${BASE}/js/network_profiles.js`);
  results.data.network_profiles = {
    hasRobot: prof.body.includes('robot'),
    hasSoftware: prof.body.includes('software'),
    hasTelecom: prof.body.includes('telecom'),
    len: prof.body.length,
  };
  if (prof.body.includes('robot') && prof.body.includes('software')) pass('network_profiles.js');
  else fail('network_profiles.js', 'missing expected sectors');
}

async function runBrowserCase(browser, spec) {
  const ctx = await browser.newContext({
    viewport: spec.viewport,
    locale: spec.lang === 'en' ? 'en-US' : 'ko-KR',
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !u.includes('clarity') && !u.includes('googletagmanager')) {
      failedReqs.push(`${r.status()} ${u}`);
    }
  });

  const out = { id: spec.id, consoleErrors, pageErrors, failedReqs: [...new Set(failedReqs)] };
  try {
    await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(spec.waitMs ?? 3000);

    if (spec.action) await spec.action(page, out);

    out.bodySample = (await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '')).replace(/\s+/g, ' ').trim();
  } catch (e) {
    out.error = String(e);
  } finally {
    await ctx.close();
  }

  const critical404 = out.failedReqs.filter((x) =>
    x.includes('/api/') || x.includes('/js/') || x.includes('/data/networks/')
  );
  const ok = !out.error && out.pageErrors.length === 0 && critical404.length === 0;
  if (ok) pass(spec.id, { viewport: spec.viewportLabel, lang: spec.lang, failedReqs: out.failedReqs.slice(0, 5) });
  else fail(spec.id, out.error || `pageErrors=${out.pageErrors.length} critical404=${critical404.length}`, out);

  return out;
}

async function runBrowserSmoke() {
  const browser = await chromium.launch({ headless: true });

  const cases = [];

  // A. Hub
  for (const vp of VIEWPORTS) {
    for (const lang of LANGS) {
      cases.push({
        id: `hub:${vp.id}:${lang}`,
        url: `${BASE}/index.html${lang === 'en' ? '?lang=en' : ''}`,
        viewport: { width: vp.width, height: vp.height },
        viewportLabel: vp.id,
        lang,
        waitMs: 5000,
        action: async (page, out) => {
          const info = await page.evaluate(() => ({
            hasPrice: /[0-9]{1,3}(,[0-9]{3})+/.test(document.body.innerText),
            hasSector: /Semi|반도체|Battery|배터/.test(document.body.innerText),
            title: document.title,
          }));
          out.hub = info;
          if (!info.hasPrice) throw new Error('no price-like text');
        },
      });
    }
  }

  // B. Semiconductor
  cases.push({
    id: 'semi:005930:desktop',
    url: `${BASE}/semiconductor/korea_semiconductor_map.html?ticker=005930&tab=relation`,
    viewport: { width: 1440, height: 900 },
    viewportLabel: 'desktop',
    lang: 'ko',
    waitMs: 8000,
    action: async (page, out) => {
      await page.click('[data-tab="relation"], button:has-text("관계"), button:has-text("Relation")', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
      out.semi = await page.evaluate(() => ({
        url: location.href,
        hasGraph: !!document.querySelector('#relation-network-root, .relation-network, canvas, svg'),
        ticker: new URLSearchParams(location.search).get('ticker'),
      }));
    },
  });
  cases.push({
    id: 'semi:000660:desktop',
    url: `${BASE}/semiconductor/korea_semiconductor_map.html?ticker=000660&tab=relation`,
    viewport: { width: 1440, height: 900 },
    viewportLabel: 'desktop',
    lang: 'ko',
    waitMs: 8000,
  });

  // C. Finance
  cases.push({
    id: 'finance:ownership:desktop',
    url: `${BASE}/finance/korea_finance_map.html?tab=relation`,
    viewport: { width: 1440, height: 900 },
    viewportLabel: 'desktop',
    lang: 'ko',
    waitMs: 8000,
    action: async (page, out) => {
      out.finance = await page.evaluate(() => ({
        body: document.body.innerText.slice(0, 500),
        hasStake: /%|stake|지분|ownership/i.test(document.body.innerText),
      }));
    },
  });

  // D. Construction mobile
  cases.push({
    id: 'construction:mobile:ko',
    url: `${BASE}/construction/korea_construction_map.html?tab=relation`,
    viewport: { width: 375, height: 812 },
    viewportLabel: 'mobile',
    lang: 'ko',
    waitMs: 8000,
    action: async (page, out) => {
      out.construction = await page.evaluate(() => ({
        hasProject: /project|프로젝트|claim|evidence|금액/i.test(document.body.innerText),
      }));
    },
  });

  // E. Robot
  cases.push({
    id: 'robot:desktop',
    url: `${BASE}/robot/korea_robot_map.html?tab=relation`,
    viewport: { width: 1440, height: 900 },
    viewportLabel: 'desktop',
    lang: 'ko',
    waitMs: 8000,
    action: async (page, out) => {
      out.robot = await page.evaluate(async () => {
        const prof = window.__NETWORK_PROFILES__ || window.NETWORK_PROFILES;
        const cfg = prof?.robot || prof?.find?.((p) => p.id === 'robot');
        return {
          hasGraph: !!document.querySelector('#relation-network-root, canvas, svg'),
          cfgNetworkPath: cfg?.networkPath,
          legacyFallback: cfg?.legacyFallback,
        };
      });
      if (out.robot?.legacyFallback === true) throw new Error('legacyFallback true');
    },
  });

  // F. Consumer/Service
  for (const [id, path] of [['cosmetics', '/cosmetics/korea_cosmetics_map.html'], ['software', '/software/korea_software_map.html']]) {
    cases.push({
      id: `${id}:desktop`,
      url: `${BASE}${path}?tab=relation`,
      viewport: { width: 1440, height: 900 },
      viewportLabel: 'desktop',
      lang: 'ko',
      waitMs: 8000,
      action: async (page, out) => {
        out[id] = await page.evaluate(() => ({
          hasBrand: /brand|브랜드|product|제품|service|서비스|N\/A/i.test(document.body.innerText),
        }));
      },
    });
  }

  results.browserDetails = [];
  for (const c of cases) {
    results.browserDetails.push(await runBrowserCase(browser, c));
  }

  await browser.close();
}

async function main() {
  await checkDomains();
  await runBrowserSmoke();
  results.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: results.summary, out: OUT }, null, 2));
  process.exit(results.summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
