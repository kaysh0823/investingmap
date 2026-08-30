/**
 * Measure relation-network graph readability baseline metrics.
 * Run: node scripts/measure_relation_readability_baseline.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;

const SECTORS = [
  { id: 'semiconductor', path: '/semiconductor/korea_semiconductor_map.html' },
  { id: 'bigchip', path: '/bigchip/korea_bigchip_map.html' },
  { id: 'finance', path: '/finance/korea_finance_map.html' },
  { id: 'construction', path: '/construction/korea_construction_map.html' },
  { id: 'nuclear', path: '/nuclear/korea_nuclear_map.html' },
  { id: 'battery', path: '/battery/korea_battery_map.html' },
  { id: 'cosmetics', path: '/cosmetics/korea_cosmetics_map.html' },
  { id: 'kcontent', path: '/kcontent/korea_kcontent_map.html' },
  { id: 'software', path: '/software/korea_software_map.html' },
  { id: 'robot', path: '/robot/korea_robot_map.html' },
];

const VIEWPORTS = [
  { name: 'desktop', w: 1440, h: 900 },
  { name: 'tablet', w: 1024, h: 768 },
  { name: 'tablet768', w: 768, h: 1024 },
  { name: 'mobile', w: 375, h: 812 },
];

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
const results = [];

for (const sector of SECTORS) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(`${BASE}${sector.path}?tab=graph&lang=ko`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.RelationNetwork?.getReadiness?.()?.firstRenderComplete, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() => {
      const st = window.RelationNetwork?.getState?.();
      const labels = [...document.querySelectorAll('.rn-labels text')];
      const visibleLabels = labels.filter((el) => el.getAttribute('display') !== 'none' && Number(el.getAttribute('opacity') || 1) > 0.05);
      const listedLabels = visibleLabels.filter((el) => el.classList.contains('rn-label-listed'));
      const fontSizes = visibleLabels.map((el) => parseFloat(el.getAttribute('font-size') || '0')).filter((n) => n > 0);
      const minListed = listedLabels.map((el) => parseFloat(el.getAttribute('font-size') || '0')).filter((n) => n > 0);
      const svg = document.querySelector('#graph-svg');
      const transform = svg && window.d3 ? window.d3.zoomTransform(svg) : { k: 1 };
      const simNodes = st?.simNodes || [];
      const simEdges = st?.simEdges || [];
      return {
        totalNodes: (st?.nodes || []).length,
        visibleNodes: simNodes.length,
        listedVisible: simNodes.filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false).length,
        globalVisible: simNodes.filter((n) => n.type === 'global_company').length,
        visibleEdges: simEdges.length,
        zoomScale: transform.k || 1,
        labelCount: visibleLabels.length,
        listedLabelCount: listedLabels.length,
        minLabelFont: fontSizes.length ? Math.min(...fontSizes) : 0,
        minListedLabelFont: minListed.length ? Math.min(...minListed) : 0,
        orphanGlobalZeroDegree: simNodes.filter((n) => {
          if (n.type !== 'global_company') return false;
          return !simEdges.some((e) => {
            const s = typeof e.source === 'object' ? e.source.id : e.source;
            const t = typeof e.target === 'object' ? e.target.id : e.target;
            return s === n.id || t === n.id;
          });
        }).length,
        graphW: document.querySelector('.rn-graph-canvas')?.clientWidth || 0,
        graphH: document.querySelector('.rn-graph-canvas')?.clientHeight || 0,
      };
    });
    results.push({ sector: sector.id, viewport: vp.name, ...m });
    await page.close();
  }
}

await browser.close();
server.close();

const out = { generatedAt: new Date().toISOString(), results };
const outPath = path.join(ROOT, 'data', 'relation_network_readability_baseline.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath, 'rows', results.length);
