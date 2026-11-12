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
const rows = bars.flatMap(({ t }, i) => {
  // Individual nets sum to i + 1 KRW. The excluded codes must have no effect.
  return [
    ['3000', i],
    ['3100', -1],
    ['6000', 2],
    ['9000', 0],
    ['9001', 500],
    ['2000', 500],
  ].map(([invst_tp_cd, net_val]) => ({ trade_date: t, invst_tp_cd, net_val }));
});

const byDate = groupInvestorNetByDate(rows);
attachInvestorSupplyToBars(bars, byDate);
assert.equal(bars[22].supplyPercentB, null);
const expectedPercentB = 0.5 + 47.5 / (4 * Math.sqrt(25 * 399 / 12));
assert.ok(Math.abs(bars[23].supplyPercentB - expectedPercentB) < 1e-12);
assert.equal(bars[146].supplyBandwidthRank, null);
assert.equal(bars[147].supplyBandwidthRank, 50, 'equal widths share the midpoint rank');

const last = bars.at(-1);
byDate.get(last.t).set('9000', 1000);
attachInvestorSupplyToBars(bars, byDate);
assert.equal(last.supplyBandwidthRank, 100, 'largest width ranks at 100');
assert.ok(last.supplyPercentB > 1, '%B can exceed its upper band');
const week = aggregateDailyBarsToWeekly(bars).at(-1);
assert.equal(week.t, last.t);
assert.equal(week.supplyPercentB, last.supplyPercentB);
assert.equal(week.supplyBandwidthRank, last.supplyBandwidthRank);

byDate.get(last.t).delete('9000');
attachInvestorSupplyToBars(bars, byDate);
assert.ok(Math.abs(last.supplyPercentB - expectedPercentB) < 1e-12, 'sum available investor categories');
assert.equal(last.supplyBandwidthRank, 50, 'a missing category does not interrupt the band');

const missingDay = bars[153];
byDate.delete(missingDay.t);
attachInvestorSupplyToBars(bars, byDate);
assert.equal(missingDay.supplyPercentB, null, 'an unreported session stays blank');
assert.equal(missingDay.supplyBandwidthRank, null);
const nextDay = bars[154];
assert.ok(Number.isFinite(nextDay.supplyPercentB), '%B resumes on the next reported session');
assert.ok(Number.isFinite(nextDay.supplyBandwidthRank), 'rank resumes on the next reported session');
const observedBars = bars.filter(({ t }) => byDate.has(t)).map(({ t }) => ({ t }));
attachInvestorSupplyToBars(observedBars, byDate);
const nextObserved = observedBars.find(({ t }) => t === nextDay.t);
assert.equal(nextDay.supplyPercentB, nextObserved.supplyPercentB);
assert.equal(nextDay.supplyBandwidthRank, nextObserved.supplyBandwidthRank);

for (const net of byDate.values()) {
  for (const code of ['3000', '3100', '6000', '9000']) net.set(code, 1000);
}
attachInvestorSupplyToBars(bars, byDate);
assert.equal(last.supplyPercentB, null, 'a flat band has undefined %B');
assert.equal(last.supplyBandwidthRank, 50, 'a flat band has a valid width rank');

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
