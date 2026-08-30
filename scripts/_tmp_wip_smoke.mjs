import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const fp = path.join(ROOT, urlPath.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(fp);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pe = [];
page.on('pageerror', (e) => pe.push(String(e)));

await page.goto(`${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph&lang=ko`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const tabLabel = await page.locator('#tab-btn-graph').innerText();
const html = await page.content();
const result = await page.evaluate(() => ({
  hasWip: !!document.querySelector('.rn-wip'),
  hasSvgNodes: !!document.querySelector('.rn-nodes'),
  hasLabels: !!document.querySelector('.rn-labels'),
  wipText: document.querySelector('.rn-wip')?.innerText?.slice(0, 80) || '',
}));

console.log(JSON.stringify({
  tabLabel,
  htmlV4: html.includes('relation_network.js?v=4'),
  htmlV3: html.includes('relation_network.js?v=3'),
  ...result,
  pageErrors: pe,
}, null, 2));

await browser.close();
server.close();
const ok = result.hasWip && !result.hasSvgNodes && !result.hasLabels && tabLabel.includes('수정중') && html.includes('relation_network.js?v=4') && pe.length === 0;
process.exit(ok ? 0 : 1);
