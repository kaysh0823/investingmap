import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = 'https://www.investingmap.kr';
const browser = await chromium.launch({ headless: true });
const results = [];

async function run(id, viewport, fn) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e)));
  try {
    await fn(page);
    results.push({ id, ok: true, pageErrs });
  } catch (e) {
    results.push({ id, ok: false, err: String(e), pageErrs });
  }
  await ctx.close();
}

await run('construction-relation-tab', { width: 375, height: 812 }, async (page) => {
  await page.goto(`${BASE}/construction/korea_construction_map.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const tab = page.locator('[data-tab="relation"], button:has-text("네트워크"), button:has-text("Relation")').first();
  if (await tab.count()) await tab.click({ timeout: 10000 });
  await page.waitForTimeout(4000);
  const t = await page.evaluate(() => document.body.innerText);
  if (!/네트워크|network|프로젝트|project|claim|evidence|금액|contract|수주/i.test(t)) {
    throw new Error('relation content missing');
  }
});

await run('semi-lang-switch', { width: 1440, height: 900 }, async (page) => {
  await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?ticker=005930`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const en = page.locator('text=English').first();
  if (await en.count()) await en.click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const ok = await page.evaluate(() => /Semiconductor|Samsung|Relation|Graph|Network/i.test(document.body.innerText));
  if (!ok) throw new Error('EN switch failed');
});

await run('semi-ticker-restore', { width: 1440, height: 900 }, async (page) => {
  await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?ticker=000660&tab=relation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (!page.url().includes('000660')) throw new Error(`ticker not restored: ${page.url()}`);
});

await run('finance-relation-ownership', { width: 1440, height: 900 }, async (page) => {
  await page.goto(`${BASE}/finance/korea_finance_map.html?tab=relation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => ({
    hasOwns: /owns|지분|ownership|stake|%/i.test(document.body.innerText),
    hasConfirmed: /confirmed|확인|지주|KB|신한/i.test(document.body.innerText),
  }));
  if (!info.hasOwns && !info.hasConfirmed) throw new Error('ownership UI missing');
});

await run('robot-network-json', { width: 1440, height: 900 }, async (page) => {
  await page.goto(`${BASE}/robot/korea_robot_map.html?tab=relation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => ({
    hasGraph: !!document.querySelector('#relation-network-root, canvas, svg'),
    text: document.body.innerText.slice(0, 800),
  }));
  if (!info.hasGraph) throw new Error('robot graph missing');
  if (/legacy/i.test(info.text) && /fallback/i.test(info.text)) throw new Error('legacy fallback visible');
});

await browser.close();
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
