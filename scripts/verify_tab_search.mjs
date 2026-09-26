/**
 * Verify in-tab search helper is present on all 26 sector maps + unit tests.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import assert from 'assert';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'machinery/korea_machinery_map.html',
  'shipping/korea_shipping_map.html',
];

function countRefs(html) {
  return (html.match(/js\/map_tab_search\.js(?:\?v=[\w.\-]+)?/g) || []).length;
}

function loadScript(rel, prior) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sandbox = prior || { console };
  if (!sandbox.window) {
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.document = {
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} },
      body: { appendChild() {} },
    };
  }
  vm.runInNewContext(code, sandbox, { filename: rel });
  return sandbox;
}

// --- dist presence ---
assert.ok(fs.existsSync(DIST), 'dist/ missing — run npm run build first');
for (const rel of MAP_FILES) {
  const fp = path.join(DIST, rel);
  assert.ok(fs.existsSync(fp), `missing dist ${rel}`);
  const html = fs.readFileSync(fp, 'utf8');
  const n = countRefs(html);
  assert.strictEqual(n, 1, `${rel}: expected map_tab_search.js exactly once, got ${n}`);
  const heatIdx = html.indexOf('js/map_heatmap.js');
  const searchIdx = html.indexOf('js/map_tab_search.js');
  assert.ok(searchIdx >= 0 && searchIdx < heatIdx, `${rel}: map_tab_search.js must precede map_heatmap.js`);
}

// --- matches() unit tests ---
const searchSandbox = loadScript('js/map_tab_search.js');
const TS = searchSandbox.InvestingMapTabSearch;
assert.ok(TS && TS._test && TS._test.matches, 'InvestingMapTabSearch._test.matches');
const matches = TS._test.matches;
const hanmi = { ticker: '042700', name: '한미반도체', nameKo: '한미반도체', nameEn: 'Hanmi Semiconductor' };
assert.ok(matches(hanmi, '한미'), "matches('한미')");
assert.ok(matches(hanmi, '042700'), "matches('042700')");
assert.ok(matches(hanmi, 'hanmi'), "matches('hanmi')");
assert.ok(!matches(hanmi, '삼성'), "no match for unrelated");
assert.ok(!matches(hanmi, ''), 'empty query no match');
assert.ok(!matches(null, '한미'), 'null company');

const classified = TS._test.classifyChartHits(
  [hanmi, { ticker: '005930', name: '삼성전자', nameKo: '삼성전자', nameEn: 'Samsung Electronics' }],
  new Set(['042700']),
  '한미',
);
assert.strictEqual(classified.chartHits.length, 1);
assert.strictEqual(classified.nameOnlyHits.length, 0);

const offChart = TS._test.classifyChartHits([hanmi], new Set(['005930']), '한미');
assert.strictEqual(offChart.chartHits.length, 0);
assert.strictEqual(offChart.nameOnlyHits.length, 1);

assert.strictEqual(TS._test.statusText('ko', 1, { query: '한미' }), '1개 일치');
assert.strictEqual(TS._test.statusText('en', 2, { query: 'a' }), '2 matches');
assert.strictEqual(TS._test.statusText('ko', 0, { query: 'x' }), '일치 없음');
assert.strictEqual(TS._test.statusText('en', 0, { query: 'x' }), 'No match');
assert.strictEqual(TS._test.statusText('ko', 0, { query: '' }), '');
assert.strictEqual(
  TS._test.statusText('ko', 0, { query: '한미', notOnChart: true }),
  '차트에 표시되지 않는 종목',
);

// --- module matchOpacity / re-apply helpers (share InvestingMapTabSearch sandbox) ---
function checkMatchOpacity(rel, exportName) {
  const sb = loadScript(rel, searchSandbox);
  const mod = sb[exportName];
  assert.ok(mod && mod._test, `${exportName}._test`);
  if (typeof mod._test.matchOpacity === 'function') {
    assert.strictEqual(mod._test.matchOpacity(true, true), 1);
    assert.ok(mod._test.matchOpacity(false, true) < 1);
    assert.strictEqual(mod._test.matchOpacity(false, false), 1);
  }
  assert.ok(
    typeof mod._test.applySearchHighlight === 'function' ||
      typeof mod._test.memberLineMatches === 'function',
    `${exportName}._test must expose applySearchHighlight or memberLineMatches`,
  );
}

checkMatchOpacity('js/map_heatmap.js', 'InvestingMapHeatmap');
checkMatchOpacity('js/map_momentum.js', 'InvestingMapMomentum');
checkMatchOpacity('js/map_volatility.js', 'InvestingMapVolatility');
checkMatchOpacity('js/map_valuation.js', 'InvestingMapValuation');

const perfSb = loadScript('js/map_perfcalendar.js', searchSandbox);
const PC = perfSb.InvestingMapPerfCalendar;
assert.ok(PC && PC._test && typeof PC._test.memberLineMatches === 'function');
assert.ok(
  PC._test.memberLineMatches(
    { kind: 'member', ticker: '042700', name: '한미반도체' },
    '한미',
  ),
);
assert.ok(!PC._test.memberLineMatches({ kind: 'avg', ticker: '', name: 'avg' }, '한미'));

// --- scroll: re-render apply must not scroll; onQuery must scroll once for single hit ---
{
  let scrollCalls = 0;
  const origScroll = TS.scrollIntoViewIfNeeded;
  TS.scrollIntoViewIfNeeded = function () {
    scrollCalls += 1;
  };

  const hmSb = loadScript('js/map_heatmap.js', searchSandbox);
  const HM = hmSb.InvestingMapHeatmap;
  assert.ok(HM._test && typeof HM._test.applyFocusState === 'function');
  assert.ok(typeof HM._test.onUserSearchQuery === 'function');

  function makeTile(ticker) {
    return {
      getAttribute: (k) => (k === 'data-ticker' ? ticker : k === 'data-leaf' ? '1' : null),
      querySelector: () => ({
        getAttribute: () => null,
        setAttribute() {},
      }),
      querySelectorAll: () => [],
      classList: { remove() {} },
      style: {},
      getBoundingClientRect: () => ({ top: -999, bottom: -900, left: 0, right: 10 }),
    };
  }
  const tile = makeTile('042700');
  const container = {
    querySelectorAll: (sel) => {
      if (String(sel).includes('hm-tile')) return [tile];
      return [];
    },
    querySelector: (sel) => {
      if (String(sel).includes('042700')) return tile;
      return null;
    },
  };
  const companies = [hanmi];

  // (a) searchQ set then re-render apply ×2 → 0 scrolls
  scrollCalls = 0;
  HM._test.setSearchQ('한미');
  HM._test.applyFocusState(container, companies, 'ko');
  HM._test.applyFocusState(container, companies, 'ko');
  assert.strictEqual(scrollCalls, 0, 're-render applyFocusState must not scroll');

  // (b) onQuery('한미') once → 1 scroll
  scrollCalls = 0;
  HM._test.onUserSearchQuery('한미', container, companies, 'ko');
  assert.strictEqual(scrollCalls, 1, "onQuery('한미') must scroll once for single hit");

  TS.scrollIntoViewIfNeeded = origScroll;
}

console.log('verify:tab-search OK — 26 dist maps + matches/unit helpers + scroll gating');
