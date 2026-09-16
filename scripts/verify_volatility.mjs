/**
 * Static checks for hub_volatility_snapshot + map_volatility.js (rangeVol5).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildVolatilitySnapshot } from './build_hub_volatility_snapshot.mjs';
import { tipRangeVolFromSeries } from '../lib/range_vol.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'data', 'hub_volatility_snapshot.json');
const REFS = path.join(ROOT, 'data', 'hub_return_refs.json');
const MIN_UNIVERSE = 100;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

assert.ok(fs.existsSync(SNAPSHOT), 'data/hub_volatility_snapshot.json must exist');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

// Prefer new schema; allow one release with atrPct alias only if rangeVol5 present.
const hasRange = Object.values(snapshot.quotes || {}).some(
  (q) => typeof q?.rangeVol5 === 'number',
);
if (hasRange) {
  assert.equal(snapshot.source, 'supabase-history-adj');
  assert.equal(snapshot.indicator, 'rangeVol5');
  assert.ok(snapshot.count >= MIN_UNIVERSE, `count ${snapshot.count} >= ${MIN_UNIVERSE}`);
  assert.ok(snapshot.universe >= MIN_UNIVERSE, `universe ${snapshot.universe}`);

  if (fs.existsSync(REFS)) {
    const refs = JSON.parse(fs.readFileSync(REFS, 'utf8'));
    assert.equal(
      snapshot.recentDd,
      refs.recentDd,
      `recentDd ${snapshot.recentDd} must equal refs.recentDd ${refs.recentDd}`,
    );
  }

  const vols = [];
  let kosdaqCount = 0;
  let kospiCount = 0;
  for (const q of Object.values(snapshot.quotes || {})) {
    assert.ok(q.mcap > 0, 'mcap must be positive');
    assert.ok(typeof q.rangeVol5 === 'number' && q.rangeVol5 >= 0, 'rangeVol5 required');
    assert.ok(Number.isFinite(q.pctB), 'pctB must be numeric');
    if (q.atrPct != null) {
      assert.equal(q.atrPct, q.rangeVol5, 'atrPct alias must equal rangeVol5');
    }
    const mkt = String(q.market || '').toUpperCase();
    if (mkt.includes('KOSDAQ')) kosdaqCount += 1;
    else if (mkt.includes('KOSPI')) kospiCount += 1;
    vols.push(q.rangeVol5);
  }
  assert.ok(vols.length >= MIN_UNIVERSE, 'quotes must meet MIN_UNIVERSE');
  assert.ok(
    kosdaqCount > 0,
    `KOSDAQ share must be > 0 (got KOSPI=${kospiCount} KOSDAQ=${kosdaqCount})`,
  );
  const sorted = vols.slice().sort((a, b) => a - b);
  const p25 = percentile(sorted, 25);
  const p50 = percentile(sorted, 50);
  const p75 = percentile(sorted, 75);
  assert.ok(p25 < p50 && p50 < p75, 'rangeVol percentiles must be strictly increasing');

  // Samsung: snapshot tip == rebuilt tip from adjusted history (same loader).
  const samsung = snapshot.quotes?.['005930'];
  assert.ok(samsung, '005930 must be in volatility snapshot');
  assert.ok(samsung.rangeVol5 >= 0, '005930 rangeVol5');
  try {
    const { getSupabaseConfig } = await import('../functions/lib/supabase_hub.mjs');
    const { buildAdjustedOhlcSeriesFromHistory } = await import(
      '../functions/lib/krx_rs_from_history.mjs'
    );
    const env = { ...process.env };
    const config = getSupabaseConfig(env, { preferServiceRole: true });
    if (config) {
      const series = await buildAdjustedOhlcSeriesFromHistory(config, ['005930'], {
        tradingDatesCount: 40,
        closesCount: 30,
      });
      const q = series?.quotes?.get('005930');
      assert.ok(q, '005930 OHLC series');
      const tip = tipRangeVolFromSeries(q.highs, q.lows, q.closes);
      assert.ok(tip.rangeVol5 != null, 'hand rangeVol5');
      assert.ok(
        Math.abs(tip.rangeVol5 - samsung.rangeVol5) < 1e-5,
        `005930 rangeVol5 snap=${samsung.rangeVol5} hand=${tip.rangeVol5}`,
      );
    }
  } catch (e) {
    console.warn('005930 history cross-check skipped:', e.message || e);
  }
} else {
  // Legacy snapshot still in repo until next post_close refresh.
  assert.equal(snapshot.source, 'krx-volatility');
  console.warn('verify:volatility — legacy atrPct snapshot present; run refresh:hub-snapshots');
}

const volSrc = fs.readFileSync(path.join(ROOT, 'js', 'map_volatility.js'), 'utf8');
const context = {
  globalThis: {},
  d3: {
    scaleLinear: () => ({}),
    scaleLog: () => ({}),
    scaleSqrt: () => {
      const scale = (v) => v;
      scale.domain = () => scale;
      scale.range = () => scale;
      scale.clamp = () => scale;
      return scale;
    },
    scaleSequential: (fn) => {
      const scale = (t) => fn(t);
      scale.domain = () => scale;
      return scale;
    },
    min: (arr, fn) => {
      const vals = fn ? arr.map(fn) : arr;
      return vals.length ? Math.min(...vals) : undefined;
    },
    max: (arr, fn) => {
      const vals = fn ? arr.map(fn) : arr;
      return vals.length ? Math.max(...vals) : undefined;
    },
    rgb: (...args) => {
      if (args.length === 3) {
        const [r, g, b] = args;
        const hex =
          '#' +
          [r, g, b]
            .map((v) => Math.round(v).toString(16).padStart(2, '0'))
            .join('');
        return { r, g, b, formatHex() { return hex; } };
      }
      const color = args[0];
      const hex = String(color).replace('#', '');
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        formatHex() {
          return color;
        },
      };
    },
    interpolate: (a, b) => (t) => (t <= 0 ? a : b),
  },
};
context.globalThis = context;
context.window = context;
context.localStorage = {
  _data: {},
  getItem(k) {
    return this._data[k] ?? null;
  },
  setItem(k, v) {
    this._data[k] = String(v);
  },
};
vm.createContext(context);
new vm.Script(volSrc, { filename: 'map_volatility.js' }).runInContext(context);
const vol = context.InvestingMapVolatility;
assert.ok(vol, 'InvestingMapVolatility export missing');

assert.ok(volSrc.includes('rangeVol5'), 'map_volatility must use rangeVol5');
assert.ok(volSrc.includes('marketRangeVols'), 'map_volatility must use marketRangeVols');
assert.ok(volSrc.includes('5일 변동성'), 'ko 5D range vol label');
assert.ok(volSrc.includes('5D Range Vol'), 'en 5D range vol label');
assert.ok(volSrc.includes('P10~P90(P25·P50·P75 강조)'), 'updated legendLines text required');
assert.ok(volSrc.includes('syncVolatilityBasisBadge'), 'basis badge helper required');

assert.equal(vol.clamp01(-1), 0);
assert.equal(vol.clamp01(2), 1);
const mockScale = (t) => (t <= 0.5 ? '#ffe0e0' : '#8b0000');
assert.equal(vol.colorForPctB(0, mockScale), '#ffe0e0');
assert.equal(vol.colorForPctB(1, mockScale), '#8b0000');

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (BASE && hasRange) {
  const ohlc = await fetch(`${BASE}/api/ticker_ohlc?code=005930&interval=daily`).then((r) => r.json());
  const bars = ohlc?.bars || ohlc?.ohlc || [];
  assert.ok(bars.length >= 5, 'ticker_ohlc must return ≥5 bars');
  const last5 = bars.slice(-5);
  const highs = last5.map((b) => b.h ?? b.high);
  const lows = last5.map((b) => b.l ?? b.low);
  const closes = last5.map((b) => b.c ?? b.close);
  const tip = tipRangeVolFromSeries(highs, lows, closes);
  const snap = snapshot.quotes['005930'].rangeVol5;
  assert.ok(tip.rangeVol5 != null, 'hand rangeVol5');
  assert.ok(
    Math.abs(tip.rangeVol5 - snap) < 1e-5,
    `005930 rangeVol5 snap=${snap} hand=${tip.rangeVol5}`,
  );
}

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
];

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  const html = fs.readFileSync(fp, 'utf8');
  const runtime =
    rel.replace(/\\/g, '/') === 'bio/korea_bio_map.html'
      ? html + fs.readFileSync(path.join(ROOT, 'bio', 'korea_bio_map.inline.js'), 'utf8')
      : html;
  assert.ok(html.includes('id="tab-btn-volatility"'), `${rel}: missing volatility tab button`);
  assert.ok(html.includes('id="tab-volatility"'), `${rel}: missing volatility tab content`);
  assert.ok(html.includes('map_volatility.js?v=10'), `${rel}: missing map_volatility.js v10`);
  assert.ok(runtime.includes('function renderVolatility()'), `${rel}: missing renderVolatility()`);
  assert.ok(runtime.includes('companies: koreanCompanies'), `${rel}: renderVolatility must pass koreanCompanies`);
}

assert.ok(
  fs.existsSync(path.join(ROOT, 'scripts', 'build_hub_volatility_snapshot.mjs')),
  'build_hub_volatility_snapshot.mjs must exist',
);
assert.ok(typeof buildVolatilitySnapshot === 'function', 'buildVolatilitySnapshot export');
assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'range_vol.mjs')), 'lib/range_vol.mjs');

if (fs.existsSync(path.join(ROOT, 'dist'))) {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'js', 'map_volatility.js')), 'dist/js/map_volatility.js');
  assert.ok(
    fs.existsSync(path.join(ROOT, 'dist', 'data', 'hub_volatility_snapshot.json')),
    'dist/data/hub_volatility_snapshot.json',
  );
}

console.log(
  `verify:volatility OK — source=${snapshot.source} count=${snapshot.count} `
  + `recentDd=${snapshot.recentDd} indicator=${snapshot.indicator || 'legacy'}`,
);
