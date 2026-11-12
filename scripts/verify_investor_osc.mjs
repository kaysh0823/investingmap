/**
 * Investor supply checks. Pass a ticker to also verify the configured Supabase feed.
 * Usage: node scripts/verify_investor_osc.mjs [ticker]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateDailyBarsToWeekly,
  attachInvestorSupplyToBars,
  groupInvestorNetByDate,
} from '../functions/lib/investor_osc.mjs';
import { fetchTickerOhlcBars, getSupabaseConfig } from '../functions/lib/ticker_ohlc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[k]) env[k] = v;
  }
  return env;
}

const bars = Array.from({ length: 165 }, (_, i) => ({
  t: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
  c: 100,
}));
const marketCaps = new Map(bars.map(({ t }, i) => [t, 1000 + i]));
const rows = bars.flatMap(({ t }, i) => {
  const cap = marketCaps.get(t);
  // Individual nets sum to cap * (i + 1). The excluded codes must have no effect.
  return [
    ['3000', cap * i],
    ['3100', -cap],
    ['6000', 2 * cap],
    ['9000', 0],
    ['9001', 500 * cap],
    ['2000', 500 * cap],
  ].map(([invst_tp_cd, net_val]) => ({ trade_date: t, invst_tp_cd, net_val }));
});

const byDate = groupInvestorNetByDate(rows);
attachInvestorSupplyToBars(bars, byDate, marketCaps);
assert.equal(bars[22].supplyPercentB, null);
const expectedPercentB = 0.5 + 47.5 / (4 * Math.sqrt(25 * 399 / 12));
assert.ok(Math.abs(bars[23].supplyPercentB - expectedPercentB) < 1e-12);
assert.equal(bars[146].supplyBandwidthRank, null);
assert.equal(bars[147].supplyBandwidthRank, 50, 'equal widths share the midpoint rank');

const last = bars.at(-1);
byDate.get(last.t).set('9000', 1000 * marketCaps.get(last.t));
attachInvestorSupplyToBars(bars, byDate, marketCaps);
assert.equal(last.supplyBandwidthRank, 100, 'largest width ranks at 100');
assert.ok(last.supplyPercentB > 1, '%B can exceed its upper band');
const week = aggregateDailyBarsToWeekly(bars).at(-1);
assert.equal(week.t, last.t);
assert.equal(week.supplyPercentB, last.supplyPercentB);
assert.equal(week.supplyBandwidthRank, last.supplyBandwidthRank);

byDate.get(last.t).delete('9000');
attachInvestorSupplyToBars(bars, byDate, marketCaps);
assert.equal(last.supplyPercentB, null, 'a missing investor category leaves a gap');
assert.equal(last.supplyBandwidthRank, null);

for (const [date, net] of byDate) {
  for (const code of ['3000', '3100', '6000', '9000']) net.set(code, marketCaps.get(date));
}
attachInvestorSupplyToBars(bars, byDate, marketCaps);
assert.equal(last.supplyPercentB, null, 'a flat band has undefined %B');
assert.equal(last.supplyBandwidthRank, 50, 'a flat band has a valid width rank');
marketCaps.set(last.t, 0);
attachInvestorSupplyToBars(bars, byDate, marketCaps);
assert.equal(last.supplyBandwidthRank, null, 'a missing or invalid cap leaves a gap');

const ticker = process.argv[2];
if (ticker) {
  const config = getSupabaseConfig(loadEnv());
  assert.ok(config, 'Supabase credentials required for a live check');
  const daily = await fetchTickerOhlcBars(config, ticker, '1y');
  const weekly = await fetchTickerOhlcBars(config, ticker, '1y', { interval: 'weekly' });
  assert.ok(daily.bars.some((bar) => Number.isFinite(bar.supplyPercentB)), 'live %B data');
  assert.ok(daily.bars.some((bar) => Number.isFinite(bar.supplyBandwidthRank)), 'live bandwidth rank data');
  const dailyByDate = new Map(daily.bars.map((bar) => [bar.t, bar]));
  for (const bar of weekly.bars) {
    const day = dailyByDate.get(bar.t);
    assert.equal(bar.supplyPercentB, day.supplyPercentB);
    assert.equal(bar.supplyBandwidthRank, day.supplyBandwidthRank);
  }
}

console.log('verify_investor_osc: OK');
