import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const chart = fs.readFileSync(path.join(ROOT, 'js', 'hub_trend_chart.js'), 'utf8');

for (const marker of [
  'id="hub-sector-trend"',
  'id="hub-trend-chart"',
  'id="hub-trend-legend"',
  'id="hub-trend-tooltip"',
  'hub_trend_chart.js?v=3',
  'd3/7.9.0/d3.min.js',
  "InvestingMapHubTrendChart.init({ lang: lang, horizon: '20d' })",
  "trendTitle: '섹터 변동 추이'",
  "trendTitle: 'Sector trend'",
]) {
  assert.ok(index.includes(marker), `index trend chart marker missing: ${marker}`);
}

const pulseEnd = index.indexOf('</section>', index.indexOf('id="hub-sector-pulse"'));
const trendStart = index.indexOf('id="hub-sector-trend"');
const dashboardStart = index.indexOf('id="hub-dashboard-row"');
assert.ok(pulseEnd >= 0 && pulseEnd < trendStart, 'trend section must follow sector performance');
assert.ok(trendStart < dashboardStart, 'trend section must precede the dashboard grid');

for (const horizon of ['1d', '20d', '50d', '120d', '200d']) {
  assert.ok(
    index.includes(`data-horizon="${horizon}"`),
    `trend period tab missing: ${horizon}`,
  );
}
assert.match(
  index,
  /class="hub-trend-tab is-active" data-horizon="20d"[^>]*aria-selected="true"/,
  '20d must be the default active trend horizon',
);

for (const marker of [
  "/api/hub_trend?horizon=",
  'd3.scaleTime()',
  'new Date(point.t)',
  'y(100)',
  "KOSPI: '#f85149'",
  "KOSDAQ: '#58a6ff'",
  "line.kind === 'index' ? 1 : 0.35",
  "a.kind === 'index' && b.kind !== 'index'",
  'lineReturn(b) - lineReturn(a)',
  'formatLegendReturn',
  'ResizeObserver',
  'MutationObserver',
  '5 * 60 * 1000',
  'global.InvestingMapHubTrendChart',
  'payload.tradeDate',
  'T15:30:00+09:00',
  "state.horizon === '1d'",
]) {
  assert.ok(chart.includes(marker), `hub trend chart marker missing: ${marker}`);
}

console.log(
  'verify:hub-trend-chart OK — section, periods, D3 rendering, indices, hover, resize, and i18n',
);
